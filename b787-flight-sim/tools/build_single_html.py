#!/usr/bin/env python3
"""Build the whole simulator as ONE self-contained HTML file (no server needed).

    python3 tools/build_single_html.py [--esbuild path/to/esbuild] [-o dist/MicomsoftFrightSimulator.html]

* all JavaScript (web/js + three.js) is bundled into one script with esbuild
* every asset (models, data, textures, the safety video, the Draco decoder) is embedded as
  base85 text (5 characters per 4 bytes, 6 % smaller than base64; the alphabet has no < > &, so
  the text can never close or confuse its <script> element); a small bootstrap decodes them into
  in-memory blob URLs (window.B787_ASSETS) before the game starts, and main.js redirects fetch()
  and the three.js loaders to them
* the title-screen picture and the menu thumbnails become data: URIs

The result is large (~75 MB) because it contains every model; open it directly in a desktop
browser (Chrome / Edge / Firefox), double-click is enough.
"""
import argparse
import base64
import hashlib
import gzip
import io
import json
import struct
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")

MIME = {".glb": "model/gltf-binary", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png",
        ".mp4": "video/mp4", ".js": "text/javascript", ".wasm": "application/wasm", ".bin": "application/octet-stream"}
SKIP = {"jal_safety.webm", "title.jpg", "draco_decoder.js", "arff.json"}   # title.jpg: inlined in the CSS; JS decoder: wasm is used          # mp4 is enough (the embedded build always uses it)
STRIP_TEX = re.compile(r"airport\d+\.glb$")   # same images as world.glb: the game reuses those
MAX_TEX = 4096                        # aircraft textures above this are halved
# secondary maps (and the cabin wall) are halved from 4096 too: keeps the file under the
# 30 MiB limit with nine aircraft types (the colour map keeps its resolution)
HALVE_4K = ("fuselage_normal", "fuselage_orm", "fuselage_emissive", "cabin_sidewall", "fuselage_base")
# the fin and the flight-deck shell maps are halved from 2048
HALVE_2K = ("tail_base", "cockpit_shell")
# (ten aircraft types: the 8192 px fuselage colour map is halved twice, to 2048 px; the
# livery itself is painted by the shader, the map carries the panel / window detail)
DRACO = "vendor/three/examples/jsm/libs/draco/gltf"


def find_esbuild(given):
    for c in [given, shutil.which("esbuild"), os.path.join(ROOT, "node_modules", ".bin", "esbuild")]:
        if c and os.path.exists(c):
            return c
    sys.exit("esbuild not found: npm i esbuild (or pass --esbuild PATH)")


def bundle(esbuild):
    three = os.path.join(WEB, "vendor", "three")
    out = subprocess.run([
        esbuild, os.path.join(WEB, "js", "main.js"), "--bundle", "--format=iife", "--minify", "--target=es2020",
        "--alias:three=" + os.path.join(three, "build", "three.module.js"),
        "--alias:three/addons=" + os.path.join(three, "examples", "jsm"),
        # DRACOLoader derives default decoder URLs from import.meta.url (the decoder path is set
        # explicitly by main.js, the embedded copies are served through B787_ASSETS)
        "--define:import.meta.url=\"https://local/vendor/three/examples/jsm/loaders/DRACOLoader.js\"",
        "--log-level=warning",
    ], capture_output=True, text=True, cwd=WEB)
    if out.returncode:
        sys.exit(out.stderr)
    if out.stderr.strip():
        print(out.stderr.strip())
    return out.stdout


B85 = "".join(chr(c) for c in range(33, 127) if chr(c) not in "<>&'\"\\`$%")
assert len(B85) == 85


def b85(raw):
    """bytes -> (base85 text, original length); 4 bytes (big endian, zero padded) -> 5 characters"""
    import numpy as np
    n = len(raw)
    a = np.frombuffer(bytes(raw) + b"\0" * ((-n) % 4), ">u4").astype(np.uint64)
    alpha = np.frombuffer(B85.encode("ascii"), np.uint8)
    out = np.empty((len(a), 5), np.uint8)
    for i in range(4, -1, -1):
        out[:, i] = alpha[(a % 85).astype(np.int64)]
        a //= 85
    return out.tobytes().decode("ascii"), n


def b64(path):
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


def glb_parts(data):
    jl = struct.unpack_from("<I", data, 12)[0]
    J = json.loads(data[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack_from("<I", data, o)[0]
    BIN = data[o + 8:o + 8 + bl]
    blobs = [BIN[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in J["bufferViews"]]
    return J, blobs


def shrink_image(blob, png, name=""):
    """textures larger than MAX_TEX are halved, big JPEGs re-encoded (None: keep as is)"""
    from PIL import Image
    src = Image.open(io.BytesIO(blob))
    w, h = src.size
    big = lambda w, h: max(w, h) > MAX_TEX or (max(w, h) >= 4096 and name in HALVE_4K) or (max(w, h) >= 2048 and name in HALVE_2K)  # noqa: E731
    if big(w, h):
        while big(w, h):
            w, h = max(1, w // 2), max(1, h // 2)
        src = src.resize((w, h), Image.LANCZOS)
    elif png or len(blob) < 60000:
        return None
    out = io.BytesIO()
    if png:
        src.save(out, "PNG", optimize=True)
    else:
        src.convert("RGB").save(out, "JPEG", quality=72, optimize=True, progressive=True)
    return out.getvalue() if len(out.getvalue()) < len(blob) * 0.9 else None


SHARED_DIR = "assets/_shared/"


def find_shared(paths):
    """images embedded in more than one model (the flight-deck panels, cabin carpet ...):
    sha1 -> number of files"""
    seen = {}
    for p in paths:
        J, blobs = glb_parts(open(p, "rb").read())
        for h in {hashlib.sha1(blobs[im["bufferView"]]).hexdigest() for im in J.get("images", []) if "bufferView" in im}:
            seen[h] = seen.get(h, 0) + 1
    return {h for h, n in seen.items() if n > 1}


def repack_glb(data, strip, shared=None, shared_out=None):
    """strip: drop all textures (materials keep their names); otherwise shrink textures larger
    than MAX_TEX and re-encode big JPEGs.  bufferView indices are kept (dropped images become
    4-byte stubs) so accessors / Draco references stay valid.  Images in `shared` (sha1) are
    moved out to SHARED_DIR (stored once in shared_out, referenced by uri; main.js maps it)."""
    J, blobs = glb_parts(data)
    views = J["bufferViews"]
    img_views = {im["bufferView"]: im for im in J.get("images", []) if "bufferView" in im}
    if strip:
        for vi in img_views:
            blobs[vi] = b"\0\0\0\0"
        for k in ("images", "textures", "samplers"):
            J.pop(k, None)
        def drop(d):
            for key in [k for k in d if k.endswith("Texture")]:
                d.pop(key)
            for v in d.values():
                if isinstance(v, dict):
                    drop(v)
        for m in J.get("materials", []):
            drop(m)
    else:
        for vi, im in img_views.items():
            png = im.get("mimeType") == "image/png"
            h = hashlib.sha1(blobs[vi]).hexdigest()
            small = shrink_image(blobs[vi], png, im.get("name", ""))
            if shared is not None and h in shared:
                key = SHARED_DIR + h[:16] + (".png" if png else ".jpg")
                if key not in shared_out:
                    shared_out[key] = small or blobs[vi]
                im.pop("bufferView")
                im["uri"] = key
                blobs[vi] = b"\0\0\0\0"
            elif small:
                blobs[vi] = small
    nb = bytearray()
    for v, bb in zip(views, blobs):
        while len(nb) % 4:
            nb.append(0)
        v["byteOffset"] = len(nb)
        v["byteLength"] = len(bb)
        nb += bb
    while len(nb) % 4:
        nb.append(0)
    J["buffers"][0]["byteLength"] = len(nb)
    js = json.dumps(J, separators=(",", ":")).encode()
    while len(js) % 4:
        js += b" "
    total = 12 + 8 + len(js) + 8 + len(nb)
    return (struct.pack("<III", 0x46546C67, 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(nb), 0x004E4942) + bytes(nb))


def pack_asset(key, path, video_kbps, shared=None, shared_out=None):
    """bytes to embed + whether they are gzip-compressed"""
    data = open(path, "rb").read() if path else shared_out[key]
    if key.endswith(".glb"):
        strip = bool(STRIP_TEX.search(key))
        data = repack_glb(data, strip, None if strip else shared, shared_out)
    if key.endswith("terrain_layers.jpg"):
        data = shrink_layers(data)
    if key.endswith(".mp4") and video_kbps:
        data = reencode_video(path, video_kbps) or data
    gz = gzip.compress(data, 9, mtime=0)
    if len(gz) < len(data) * 0.92:
        return gz, True
    return data, False


def shrink_layers(data, tile=384, q=66):
    """terrain material atlas (N square tiles stacked vertically) at a smaller tile size"""
    from PIL import Image
    im = Image.open(io.BytesIO(data)).convert("RGB")
    n = im.height // im.width
    im = im.resize((tile, tile * n), Image.LANCZOS)
    out = io.BytesIO()
    im.save(out, "JPEG", quality=q, optimize=True)
    return out.getvalue()


def jpeg_b64(path, q=64):
    """a photo re-encoded for inlining"""
    from PIL import Image
    out = io.BytesIO()
    Image.open(path).convert("RGB").save(out, "JPEG", quality=q, optimize=True, progressive=True)
    return base64.b64encode(out.getvalue()).decode("ascii")


def reencode_video(path, kbps):
    try:
        import imageio_ffmpeg
        ff = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        ff = shutil.which("ffmpeg")
    if not ff:
        print("no ffmpeg: video embedded as is")
        return None
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_video_tmp.mp4")
    r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", path, "-vf", "scale=%d:-2" % (360 if kbps >= 24 else 240), "-c:v", "libx264", "-preset", "slow",
                        "-b:v", "%dk" % kbps, "-maxrate", "%dk" % (kbps * 2), "-bufsize", "%dk" % (kbps * 4),
                        "-c:a", "aac", "-b:a", "24k" if kbps >= 24 else "16k", "-ac", "1", "-movflags", "+faststart", out], capture_output=True, text=True)
    if r.returncode:
        print(r.stderr)
        return None
    data = open(out, "rb").read()
    os.remove(out)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--esbuild")
    ap.add_argument("-o", "--out", default=os.path.join(ROOT, "dist", "MicomsoftFrightSimulator.html"))
    ap.add_argument("--video-kbps", type=int, default=0, help="re-encode the safety video at this bitrate (needs ffmpeg)")
    ap.add_argument("--no-video", action="store_true")
    args = ap.parse_args()
    js = bundle(find_esbuild(args.esbuild)).replace("</script", "<\\/script")

    html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
    # module script + import map are replaced by the bundle
    html = re.sub(r'<script type="importmap">.*?</script>\s*', "", html, flags=re.S)
    html = re.sub(r'<script type="module" src="\./js/main\.js"></script>\s*', "", html)
    # title picture as a data: URI
    html = html.replace('url("assets/title.jpg")', 'url("data:image/jpeg;base64,%s")' % jpeg_b64(os.path.join(WEB, "assets", "title.jpg")))

    assets = []
    for f in sorted(os.listdir(os.path.join(WEB, "assets"))):
        p = os.path.join(WEB, "assets", f)
        if f in SKIP or not os.path.isfile(p) or f.endswith(".gltf.json") or (args.no_video and f.endswith(".mp4")):
            continue
        assets.append(("assets/" + f, p))
    for f in sorted(os.listdir(os.path.join(WEB, DRACO))):
        if f not in SKIP:
            assets.append((DRACO + "/" + f, os.path.join(WEB, DRACO, f)))

    # images shared by several models are embedded once
    models = [p for k, p in assets if k.endswith(".glb") and not STRIP_TEX.search(k)]
    shared, shared_out = find_shared(models), {}
    blocks = []
    total = 0
    for item in assets + [None]:
        if item is None:                    # (after the models: the shared images they produced)
            if not shared_out:
                break
            assets_sh = sorted(shared_out)
            for k in assets_sh:
                raw = shared_out[k]
                data, n = b85(raw)
                total += len(data)
                blocks.append('<script type="application/octet-stream" data-asset="%s" data-type="%s" data-len="%d">%s</script>' % (
                    k, MIME.get(os.path.splitext(k)[1], "application/octet-stream"), n, data))
            print("shared images: %d (%.1f MB)" % (len(shared_out), sum(len(v) for v in shared_out.values()) / 1e6))
            break
        key, p = item
        ext = os.path.splitext(p)[1].lower()
        raw, gz = pack_asset(key, p, args.video_kbps, shared, shared_out)
        data, n = b85(raw)
        total += len(data)
        blocks.append('<script type="application/octet-stream" data-asset="%s" data-type="%s" data-len="%d"%s>%s</script>' % (
            key, MIME.get(ext, "application/octet-stream"), n, ' data-gz="1"' if gz else "", data))

    boot = """<script>
// single-file build: unpack the embedded assets into blob URLs, then start the game
(async () => {
  const lt = document.getElementById('loadText'), lb = document.getElementById('loadBar');
  const nodes = [...document.querySelectorAll('script[data-asset]')];
  const map = {};
  // base85 (build_single_html.py: B85)
  const A = '%s', T = new Uint8Array(128);
  for (let i = 0; i < 85; i++) T[A.charCodeAt(i)] = i;
  const dec = (s, len) => {
    const out = new Uint8Array((s.length / 5) * 4);
    for (let i = 0, o = 0; i < s.length; i += 5, o += 4) {
      const v = (((T[s.charCodeAt(i)] * 85 + T[s.charCodeAt(i + 1)]) * 85 + T[s.charCodeAt(i + 2)]) * 85 + T[s.charCodeAt(i + 3)]) * 85 + T[s.charCodeAt(i + 4)];
      out[o] = v >>> 24; out[o + 1] = (v >>> 16) & 255; out[o + 2] = (v >>> 8) & 255; out[o + 3] = v & 255;
    }
    return out.subarray(0, len);
  };
  let n = 0;
  for (const el of nodes) {
    let blob = new Blob([dec(el.textContent, +el.dataset.len)]);
    if (el.dataset.gz) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    map[el.dataset.asset] = URL.createObjectURL(new Blob([blob], { type: el.dataset.type }));
    el.textContent = '';
    n++;
    if (lt) lt.textContent = '展開中 unpacking ' + n + ' / ' + nodes.length;
    if (lb) lb.style.width = Math.round(n / nodes.length * 4) + '%';
  }
  window.B787_ASSETS = map;
  const s = document.createElement('script');
  const ab = document.getElementById('app-bundle');
  const zb = new Blob([dec(ab.textContent, +ab.dataset.len)]);
  s.textContent = await new Response(zb.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  document.body.appendChild(s);
})().catch((e) => { const lt = document.getElementById('loadText'); if (lt) lt.textContent = 'error: ' + e; console.error(e); });
</script>""".replace("'%s'", "'" + B85 + "'")
    jsz, jn = b85(gzip.compress(js.encode("utf-8"), 9, mtime=0))
    tail = "\n".join(blocks) + '\n<script type="application/octet-stream" id="app-bundle" data-len="%d">' % jn + jsz + "</script>\n" + boot + "\n"
    html = html.replace("</body>", tail + "</body>") if "</body>" in html else html + tail
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote %s  %.1f MB  (%d assets, %.1f MB base85, bundle %.1f MB)" % (
        args.out, os.path.getsize(args.out) / 1e6, len(assets), total / 1e6, len(js) / 1e6))


if __name__ == "__main__":
    main()
