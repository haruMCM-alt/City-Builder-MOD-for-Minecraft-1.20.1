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
import json
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
SKIP = {"jal_safety.webm"}          # mp4 is enough (the embedded build always uses it)
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--esbuild")
    ap.add_argument("-o", "--out", default=os.path.join(ROOT, "dist", "MicomsoftFrightSimulator.html"))
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
        if f in SKIP or not os.path.isfile(p) or f.endswith(".gltf.json"):
            continue
        assets.append(("assets/" + f, p))
    for f in sorted(os.listdir(os.path.join(WEB, DRACO))):
        assets.append((DRACO + "/" + f, os.path.join(WEB, DRACO, f)))

    blocks = []
    total = 0
    for key, p in assets:
        ext = os.path.splitext(p)[1].lower()
        data = b64(p)
        total += len(data)
        blocks.append('<script type="application/octet-stream" data-asset="%s" data-type="%s">%s</script>' % (key, MIME.get(ext, "application/octet-stream"), data))

    boot = """<script>
// single-file build: unpack the embedded assets into blob URLs, then start the game
(async () => {
  const lt = document.getElementById('loadText'), lb = document.getElementById('loadBar');
  const nodes = [...document.querySelectorAll('script[data-asset]')];
  const map = {};
  let n = 0;
  for (const el of nodes) {
    const res = await fetch('data:' + el.dataset.type + ';base64,' + el.textContent);
    map[el.dataset.asset] = URL.createObjectURL(await res.blob());
    el.textContent = '';
    n++;
    if (lt) lt.textContent = '展開中 unpacking ' + n + ' / ' + nodes.length;
    if (lb) lb.style.width = Math.round(n / nodes.length * 4) + '%';
  }
  window.B787_ASSETS = map;
  const s = document.createElement('script');
  s.textContent = document.getElementById('app-bundle').textContent;
  document.body.appendChild(s);
})().catch((e) => { const lt = document.getElementById('loadText'); if (lt) lt.textContent = 'error: ' + e; console.error(e); });
</script>"""
    tail = "\n".join(blocks) + '\n<script type="text/plain" id="app-bundle">' + js + "</script>\n" + boot + "\n"
    html = html.replace("</body>", tail + "</body>") if "</body>" in html else html + tail
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(html)
    print("wrote %s  %.1f MB  (%d assets, %.1f MB base64, bundle %.1f MB)" % (
        args.out, os.path.getsize(args.out) / 1e6, len(assets), total / 1e6, len(js) / 1e6))


if __name__ == "__main__":
    main()
