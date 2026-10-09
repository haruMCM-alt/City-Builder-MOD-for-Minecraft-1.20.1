# Build web/assets/terrain_layers.jpg: 9 tileable 512x512 terrain material layers stacked vertically.
# Sources: Poly Haven (CC0) 1k diffuse JPEGs, downloaded into SRC_DIR from https://polyhaven.com:
#   rocky_terrain_02 grass_ground aerial_rocks_02 aerial_grass_rock aerial_ground_rock farm_soil
#   aerial_beach_01 snow_field_aerial (files named <name>.jpg); layer 8 (tree canopy) is generated.
#   python3 tools/build_terrain_layers.py SRC_DIR web/assets/terrain_layers.jpg 70
import sys, os
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
S = 512
names = ['rocky_terrain_02', 'grass_ground', 'aerial_rocks_02', 'aerial_grass_rock',
         'aerial_ground_rock', 'farm_soil', 'aerial_beach_01', 'snow_field_aerial']

def load(n):
    im = Image.open(os.path.join(src, n + '.jpg')).convert('RGB').resize((S, S), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255

def canopy(seed=7):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    def vnoise(k, sd):
        g = np.random.default_rng(sd).random((k, k)).astype(np.float32)
        g = np.tile(g, (3, 3))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((S * 3, S * 3), Image.BICUBIC)
        return np.asarray(im).astype(np.float32)[S:2 * S, S:2 * S] / 255
    hgt = np.zeros((S, S), np.float32); col = np.zeros((S, S, 3), np.float32)
    palette = np.array([[0.12, 0.20, 0.08], [0.09, 0.17, 0.07], [0.15, 0.24, 0.10], [0.08, 0.14, 0.08], [0.18, 0.26, 0.11], [0.14, 0.19, 0.09]])
    n = 520
    pts = rng.random((n, 2)) * S
    for i in range(n):
        c = palette[rng.integers(0, len(palette))] * rng.uniform(0.85, 1.15)
        top = rng.uniform(14, 26)
        R = rng.uniform(10, 22)
        for j in range(rng.integers(3, 7)):  # a tree = a clump of sub-crowns
            ox, oy = rng.normal(0, R * 0.35, 2)
            r = R * rng.uniform(0.45, 0.75)
            cx, cy = pts[i, 0] + ox, pts[i, 1] + oy
            dx = (xx - cx + S / 2) % S - S / 2; dy = (yy - cy + S / 2) % S - S / 2
            q = (dx * dx + dy * dy) / (r * r)
            h = np.sqrt(np.clip(1 - q, 0, 1)) * r * 0.8 + top * (1 - 0.25 * np.sqrt(np.minimum(q, 1))) * (q < 1)
            m = h > hgt
            hgt[m] = h[m]; col[m] = c
    leaf = vnoise(64, 3) * 0.5 + vnoise(128, 4) * 0.5
    hgt += (leaf - 0.5) * 7 + (vnoise(16, 5) - 0.5) * 6
    gy, gx = np.gradient(hgt)
    nrm = np.dstack([-gx, -gy, np.full_like(hgt, 2.5)]); nrm /= np.linalg.norm(nrm, axis=2, keepdims=True)
    L = np.array([-0.3, 0.3, 0.9]); L /= np.linalg.norm(L)
    lam = np.clip(nrm @ L, 0, 1)
    ao = np.clip(hgt / 26, 0, 1) ** 0.7
    img = col * ((0.45 + 0.55 * lam) * (0.3 + 0.7 * ao) * (0.85 + 0.3 * leaf))[..., None]
    img[hgt < 1] = [0.04, 0.06, 0.035]
    return np.clip(img * 1.7, 0, 1)

layers = [load(n) for n in names] + [canopy()]
atlas = np.concatenate(layers, axis=0)
Image.fromarray((atlas * 255 + 0.5).astype(np.uint8)).save(out, quality=int(sys.argv[3]) if len(sys.argv) > 3 else 82, optimize=True, progressive=False)
print(len(layers), 'layers', os.path.getsize(out), 'bytes')
