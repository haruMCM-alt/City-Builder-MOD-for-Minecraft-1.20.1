#!/usr/bin/env python3
"""Combines screenshots into labelled contact sheets: montage.py out.png img1.png img2.png ... (needs Pillow)."""
import os
import sys
from PIL import Image, ImageDraw

out, files = sys.argv[1], sys.argv[2:]
cols = 2 if len(files) > 1 else 1
w, h = 640, 360
rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + 18)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    im = Image.open(f).convert("RGB").resize((w, h))
    x, y = (i % cols) * w, (i // cols) * (h + 18)
    sheet.paste(im, (x, y + 18))
    d.text((x + 4, y + 3), os.path.basename(f)[:-4], fill=(255, 255, 255))
sheet.save(out)
