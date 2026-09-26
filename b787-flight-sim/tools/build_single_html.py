#!/usr/bin/env python3
"""Build the whole simulator as ONE self-contained HTML file (no server needed).

    python3 tools/build_single_html.py [--esbuild path/to/esbuild] [-o dist/MicomsoftFrightSimulator.html]

* all JavaScript (web/js + three.js) is bundled into one script with esbuild
* every asset (models, data, textures, the safety video, the Draco decoder) is embedded as
  base64; a small bootstrap turns them into in-memory blob URLs (window.B787_ASSETS) before
  the game starts, and main.js redirects fetch() and the three.js loaders to them
* the title-screen picture and the menu thumbnails become data: URIs

The result is large (~75 MB) because it contains every model; open it directly in a desktop
browser (Chrome / Edge / Firefox), double-click is enough.
"""
import argparse
import base64
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
        ".mp4": "video/mp4", ".js": "text/javascript", ".wasm": "application/wasm"}
SKIP = {"jal_safety.webm", "title.jpg", "draco_decoder.js", "arff.json"}   # title.jpg: inlined in the CSS; JS decoder: wasm is used          # mp4 is enough (the embedded build always uses it)
STRIP_TEX = re.compile(r"airport\d+\.glb$")   # same images as world.glb: the game reuses those
MAX_TEX = 4096                        # aircraft textures above this are halved
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


def b64(path):
    with open(path, "rb") as fh:
        return base64.b64encode(fh.read()).decode("ascii")


def repack_glb(data, strip):
    """strip: drop all textures (materials keep their names); otherwise shrink textures larger
    than MAX_TEX and re-encode big JPEGs.  bufferView indices are kept (dropped images become
    4-byte stubs) so accessors / Draco references stay valid."""
    from PIL import Image
    jl = struct.unpack_from("<I", data, 12)[0]
    J = json.loads(data[20:20 + jl])
    o = 20 + jl
    bl = struct.unpack_from("<I", data, o)[0]
    BIN = data[o + 8:o + 8 + bl]
    views = J["bufferViews"]
    blobs = [BIN[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in views]
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
            src = Image.open(io.BytesIO(blobs[vi]))
            w, h = src.size
            png = im.get("mimeType") == "image/png"
            if max(w, h) > MAX_TEX:
                src = src.resize((max(1, w // 2), max(1, h // 2)), Image.LANCZOS)
            elif png or len(blobs[vi]) < 60000:
                continue
            out = io.BytesIO()
            if png:
                src.save(out, "PNG", optimize=True)
            else:
                src.convert("RGB").save(out, "JPEG", quality=72, optimize=True, progressive=True)
            if len(out.getvalue()) < len(blobs[vi]) * 0.9:
                blobs[vi] = out.getvalue()
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


def pack_asset(key, path, video_kbps):
    """bytes to embed + whether they are gzip-compressed"""
    data = open(path, "rb").read()
    if key.endswith(".glb"):
        data = repack_glb(data, bool(STRIP_TEX.search(key)))
    if key.endswith(".mp4") and video_kbps:
        data = reencode_video(path, video_kbps) or data
    gz = gzip.compress(data, 9, mtime=0)
    if len(gz) < len(data) * 0.92:
        return gz, True
    return data, False


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
    r = subprocess.run([ff, "-y", "-loglevel", "error", "-i", path, "-vf", "scale=360:-2", "-c:v", "libx264", "-preset", "slow",
                        "-b:v", "%dk" % kbps, "-maxrate", "%dk" % (kbps * 2), "-bufsize", "%dk" % (kbps * 4),
                        "-c:a", "aac", "-b:a", "24k", "-ac", "1", "-movflags", "+faststart", out], capture_output=True, text=True)
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
    html = html.replace('url("assets/title.jpg")', 'url("data:image/jpeg;base64,%s")' % b64(os.path.join(WEB, "assets", "title.jpg")))

    assets = []
    for f in sorted(os.listdir(os.path.join(WEB, "assets"))):
        p = os.path.join(WEB, "assets", f)
        if f in SKIP or not os.path.isfile(p) or f.endswith(".gltf.json") or (args.no_video and f.endswith(".mp4")):
            continue
        assets.append(("assets/" + f, p))
    for f in sorted(os.listdir(os.path.join(WEB, DRACO))):
        if f not in SKIP:
            assets.append((DRACO + "/" + f, os.path.join(WEB, DRACO, f)))

    blocks = []
    total = 0
    for key, p in assets:
        ext = os.path.splitext(p)[1].lower()
        raw, gz = pack_asset(key, p, args.video_kbps)
        data = base64.b64encode(raw).decode("ascii")
        total += len(data)
        blocks.append('<script type="application/octet-stream" data-asset="%s" data-type="%s"%s>%s</script>' % (
            key, MIME.get(ext, "application/octet-stream"), ' data-gz="1"' if gz else "", data))

    boot = """<script>
// single-file build: unpack the embedded assets into blob URLs, then start the game
(async () => {
  const lt = document.getElementById('loadText'), lb = document.getElementById('loadBar');
  const nodes = [...document.querySelectorAll('script[data-asset]')];
  const map = {};
  let n = 0;
  for (const el of nodes) {
    let blob = await (await fetch('data:application/octet-stream;base64,' + el.textContent)).blob();
    if (el.dataset.gz) blob = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
    map[el.dataset.asset] = URL.createObjectURL(new Blob([blob], { type: el.dataset.type }));
    el.textContent = '';
    n++;
    if (lt) lt.textContent = '展開中 unpacking ' + n + ' / ' + nodes.length;
    if (lb) lb.style.width = Math.round(n / nodes.length * 4) + '%';
  }
  window.B787_ASSETS = map;
  const s = document.createElement('script');
  const zb = await (await fetch('data:application/octet-stream;base64,' + document.getElementById('app-bundle').textContent)).blob();
  s.textContent = await new Response(zb.stream().pipeThrough(new DecompressionStream('gzip'))).text();
  document.body.appendChild(s);
})().catch((e) => { const lt = document.getElementById('loadText'); if (lt) lt.textContent = 'error: ' + e; console.error(e); });
</script>"""
    jsz = base64.b64encode(gzip.compress(js.encode("utf-8"), 9, mtime=0)).decode("ascii")
    tail = "\n".join(blocks) + '\n<script type="application/octet-stream" id="app-bundle">' + jsz + "</script>\n" + boot + "\n"
    html = html.replace("</body>", tail + "</body>") if "</body>" in html else html + tail
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote %s  %.1f MB  (%d assets, %.1f MB base64, bundle %.1f MB)" % (
        args.out, os.path.getsize(args.out) / 1e6, len(assets), total / 1e6, len(js) / 1e6))


if __name__ == "__main__":
    main()
