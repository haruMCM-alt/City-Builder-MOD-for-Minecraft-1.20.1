#!/usr/bin/env python3
"""style.css / js / assets を 1 つの HTML にまとめる。

  python3 build.py > windows-me-setup.html          # 単体で開ける完全な HTML
  python3 build.py --fragment > fragment.html       # <html>/<body> を持たない断片
"""
import base64, glob, json, os, sys

here = os.path.dirname(os.path.abspath(__file__))
def read(p):
    with open(os.path.join(here, p), encoding='utf-8') as f:
        return f.read()

assets = {}
for p in sorted(glob.glob(os.path.join(here, 'assets', '*.png'))):
    with open(p, 'rb') as f:
        assets[os.path.basename(p)[:-4]] = 'data:image/png;base64,' + base64.b64encode(f.read()).decode('ascii')

head = ('<title>Windows Me セットアップ</title>\n'
        '<link rel="preconnect" href="https://fonts.googleapis.com">\n'
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DotGothic16&display=swap">\n'
        '<style>\n' + read('style.css') + '\n</style>\n')
body = ('<script>window.WINME_ASSETS=' + json.dumps(assets) + ';</script>\n' +
        ''.join('<script>\n' + read('js/' + n) + '\n</script>\n' for n in ('core.js', 'setup.js', 'desktop.js', 'main.js')))

if '--fragment' in sys.argv:
    sys.stdout.write(head + body)
else:
    sys.stdout.write('<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
                     '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
                     + head + '</head>\n<body>\n' + body + '</body>\n</html>\n')
