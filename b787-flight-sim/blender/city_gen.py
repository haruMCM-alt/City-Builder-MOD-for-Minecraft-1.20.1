"""
City generator for the four airport regions (part of the Blender build; no bpy needed).

    python3 city_gen.py [id ...]      -> web/assets/cityN.bin (+ blender/output/cityN.png map)

Each city is laid out from the districts in geo.py: street blocks on a grid (rotated per city
or per 1.5 km cell for Tokyo's organic street pattern), lots subdivided per block, heights drawn
from the district profiles (downtown towers, dense mid-rise, suburbs of 2-3 storey houses,
industrial zones on the bays), everything clipped to the land (no buildings in the sea, in the
airports' flat zones or on the runway approaches: approach / transitional / horizontal
obstacle-limitation surfaces).  The simulator instances the buildings at run time
(web/js/cityscape.js) with the facade textures of world.glb.

Record (10 bytes, little endian), in the airport's Blender frame (x along the runway, y towards
the terminal), relative to the airport's runway centre:
    int16 x/2, int16 y/2 (metres), uint8 width, uint8 depth (m), uint16 height*10,
    uint8 rotation (256 steps), uint8 style
styles: 0 glass tower, 1 glass tower 2, 2 office, 3 apartment, 4 brick, 5 concrete,
        6 industrial / warehouse, 7 house, 8 Okinawan concrete (white, rooftop water tank)
"""
import math
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geo  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "assets")

# per city: block size (m), street width (m), base grid angle (deg, compass of the "north"
# streets; None = Tokyo-style organic cells), house share in the fill, extent (km)
CFG = {
    1: dict(block=86.0, street=12.0, grid=None, houses=0.55, seed=35),
    2: dict(block=96.0, street=14.0, grid=0.0, houses=0.45, seed=34),
    3: dict(block=106.0, street=18.0, grid=0.0, houses=0.4, seed=43),     # Sapporo's 60-ken grid
    4: dict(block=72.0, street=10.0, grid=12.0, houses=0.25, seed=26),
}
MAX_BUILDINGS = {1: 62000, 2: 26000, 3: 16000, 4: 14000}


def land_mask(apid, half, res):
    """raster (local Blender frame, x right, y up) of land minus water / airport flats"""
    from PIL import Image, ImageDraw
    n = int(2 * half / res)
    ap = geo.AP[apid]
    img = Image.new("L", (n, n), 0)
    dr = ImageDraw.Draw(img)

    def px(pt):
        x, z = pt
        lx, ly = x - ap["x"], -(z - ap["z"])
        return ((lx + half) / res, (half - ly) / res)
    D = geo.GEO_DATA
    for P in D["land"]:
        dr.polygon([px(p) for p in P], fill=255)
    for P in D["water"]:
        dr.polygon([px(p) for p in P], fill=0)
    for P in D["islands"]:
        dr.polygon([px(p) for p in P], fill=255)
    # airports: no city on the flats (+ margin)
    for f in D["flats"]:
        m = 150.0
        a = px((f["x0"] - m, f["z1"] + m))
        b = px((f["x1"] + m, f["z0"] - m))
        dr.rectangle([min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1])], fill=0)
    arr = np.asarray(img) > 127
    return arr, n


def runways_world():
    """all runways of all airports as (x, z, dir_x, dir_z, half_length) in world metres"""
    out = []
    for a in geo.AIRPORTS:
        L = a["rwy"]["len"] / 2
        out.append((a["x"], a["z"], 1.0, 0.0, L))
        for r in geo.EXTRA_RWYS.get(a["id"], []):
            ang = math.radians(r["hdg"] - a["north"])
            dx, dy = math.sin(ang), math.cos(ang)      # Blender local direction
            out.append((a["x"] + r["cx"], a["z"] - r["cy"], dx, -dy, r["len"] / 2))
    return out


RWYS = None


def height_limit(x, z):
    """obstacle limitation surfaces (simplified ICAO annex 14): approach 2 %, transitional 1:7,
    horizontal 45 m within 4 km"""
    lim = 1e9
    for (cx, cz, dx, dz, L) in RWYS:
        rx, rz = x - cx, z - cz
        s = rx * dx + rz * dz              # along
        l = abs(-rx * dz + rz * dx)        # lateral
        if abs(s) <= L + 60:
            lim = min(lim, max(0.0, (l - 150.0) / 7.0))
        else:
            beyond = abs(s) - (L + 60)
            if beyond < 15000 and l < 150 + 0.15 * beyond:
                lim = min(lim, beyond * 0.02)
            else:
                lim = min(lim, max(0.0, (l - 150.0) / 7.0) if l < 4000 and beyond < 1000 else 1e9)
        d = math.hypot(rx, rz)
        if d < 4000 + L:
            lim = min(lim, 45.0 + max(0.0, d - L - 1500) * 0.05)
    return lim


def district_field(apid):
    C = geo.CITIES[apid]
    ds = []
    for d in C["districts"]:
        x, y = geo.local_ll(apid, d["lat"], d["lon"])
        ds.append((x, y, d["r"] * 1000, d["h"], d["dens"]))
    fx, fy = geo.local_ll(apid, C["fill"]["lat"], C["fill"]["lon"])
    fill = (fx, fy, C["fill"]["r"] * 1000, C["fill"]["h"], C["fill"]["dens"])
    ind = [(*geo.local_ll(apid, i["lat"], i["lon"]), i["r"] * 1000) for i in C.get("industry", [])]
    return fill, ds, ind


def generate(apid):
    global RWYS
    RWYS = runways_world()
    cfg = CFG[apid]
    rng = np.random.default_rng(cfg["seed"])
    ap = geo.AP[apid]
    fill, ds, ind = district_field(apid)
    half = max(math.hypot(fill[0], fill[1]) + fill[2], *[math.hypot(d[0], d[1]) + d[2] for d in ds]) + 1000
    half = min(half, 60000.0)
    res = 25.0
    mask, n = land_mask(apid, half, res)

    def on_land(x, y):
        i, j = int((x + half) / res), int((half - y) / res)
        return 0 <= i < n and 0 <= j < n and mask[j, i]

    B, S = cfg["block"], cfg["street"]
    recs = []
    # street grid angle in the local frame: compass (grid) -> local angle
    def grid_angle(x, y):
        if cfg["grid"] is not None:
            return math.radians(cfg["grid"] - ap["north"])
        cell = (math.floor(x / 1500.0), math.floor(y / 1500.0))
        h = (hash(cell) % 1000) / 1000.0
        return math.radians(-ap["north"] + (h - 0.5) * 50.0)

    # sample blocks on a jittered lattice of cells; each cell uses its own grid orientation
    cell = 1500.0
    xs = np.arange(-half, half, cell)
    for cx0 in xs:
        for cy0 in xs:
            ccx, ccy = cx0 + cell / 2, cy0 + cell / 2
            # quick reject: far outside every district and the fill radius
            dmin = math.hypot(ccx - fill[0], ccy - fill[1]) - fill[2]
            for (dx_, dy_, r, _, _) in ds:
                dmin = min(dmin, math.hypot(ccx - dx_, ccy - dy_) - r * 2.5)
            if dmin > cell:
                continue
            a = grid_angle(ccx, ccy)
            ca, sa = math.cos(a), math.sin(a)
            nb = int(cell / B)
            for i in range(nb):
                for j in range(nb):
                    # block centre in the rotated grid, around the cell centre
                    u = (i + 0.5) * B - cell / 2
                    v = (j + 0.5) * B - cell / 2
                    bx = ccx + u * ca - v * sa
                    by = ccy + u * sa + v * ca
                    if not on_land(bx, by):
                        continue
                    # intensity: fill falloff + districts
                    rf = math.hypot(bx - fill[0], by - fill[1]) / fill[2]
                    dens = fill[4] * max(0.0, 1.0 - rf ** 2.2) if rf < 1 else 0.0
                    hlo, hhi = fill[3]
                    tall = 0.0
                    for (dx_, dy_, r, hr, dd) in ds:
                        q = math.hypot(bx - dx_, by - dy_) / r
                        if q < 2.5:
                            w = math.exp(-q * q * 1.2)
                            if w * dd > tall:
                                tall = w * dd
                                hlo2, hhi2 = hr
                            dens = max(dens, dd * math.exp(-q * q * 0.35))
                    indus = any(math.hypot(bx - ix, by - iy) < ir for (ix, iy, ir) in ind)
                    if rng.random() > dens * (0.55 + 0.45 * (1 - rf)) + (0.35 if indus else 0.0):
                        continue
                    wx, wz = ap["x"] + bx, ap["z"] - by
                    hmax = height_limit(wx, wz)
                    if hmax < 6:
                        continue
                    # lots inside the block
                    inner = B - S
                    if indus:
                        lots = [(0.0, 0.0, inner, inner)]
                    elif tall > 0.45 and rng.random() < 0.7:
                        lots = [(0.0, 0.0, inner - rng.uniform(4, 16), inner - rng.uniform(4, 16))]
                    else:
                        k = int(rng.integers(2, 6)) if rf > 0.35 or tall < 0.1 else int(rng.integers(1, 4))
                        lots = []
                        # split the block into a k x m grid of lots
                        kx = max(1, round(math.sqrt(k)))
                        ky = max(1, math.ceil(k / kx))
                        lw, lh = inner / kx, inner / ky
                        for p in range(kx):
                            for q in range(ky):
                                lots.append((-inner / 2 + (p + 0.5) * lw, -inner / 2 + (q + 0.5) * lh,
                                             lw - rng.uniform(2, 6), lh - rng.uniform(2, 6)))
                        lots = [(x, y, w, h) for (x, y, w, h) in lots]
                    for lot in lots:
                        if len(lot) == 4 and lot[2] > 0 and indus:
                            lu, lv, lw, lh = 0.0, 0.0, lot[2] * rng.uniform(0.6, 0.95), lot[3] * rng.uniform(0.5, 0.9)
                        else:
                            lu, lv, lw, lh = lot
                        if lw < 6 or lh < 6:
                            continue
                        # style + height
                        if indus:
                            style, h = 6, rng.uniform(8, 22)
                        elif tall > 0.25 and rng.random() < tall:
                            h = hlo2 + (hhi2 - hlo2) * rng.random() ** 1.6
                            style = int(rng.choice([0, 1, 2, 0, 1])) if h > 60 else int(rng.choice([2, 3, 5]))
                        else:
                            if apid == 4:
                                h = rng.uniform(6, 14) + (hhi - hlo) * rng.random() ** 3
                                style = 8 if rng.random() < 0.85 else 3
                            elif rng.random() < cfg["houses"] * min(1.0, rf * 1.4 + 0.2) and lw < 40:
                                style, h = 7, rng.uniform(6, 9.5)
                                lw, lh = min(lw, rng.uniform(9, 16)), min(lh, rng.uniform(9, 14))
                            else:
                                h = hlo + (hhi - hlo) * rng.random() ** 2.2
                                style = int(rng.choice([3, 3, 5, 2, 4])) if h < 40 else int(rng.choice([2, 5, 3, 1]))
                        h = min(h, hmax)
                        if h < 5:
                            continue
                        ox = bx + lu * ca - lv * sa
                        oy = by + lu * sa + lv * ca
                        recs.append((ox, oy, min(lw, 250), min(lh, 250), h, a, style))
    rng.shuffle(recs)
    recs = recs[:MAX_BUILDINGS[apid]]
    buf = bytearray()
    for (x, y, w, d, h, a, st) in recs:
        rot = int(round((a % (2 * math.pi)) / (2 * math.pi) * 256)) % 256
        buf += struct.pack("<hhBBHBB", int(round(x / 2)), int(round(y / 2)), int(round(w)), int(round(d)),
                           min(65535, int(round(h * 10))), rot, st)
    path = os.path.join(OUT, "city%d.bin" % apid)
    with open(path, "wb") as fh:
        fh.write(buf)
    hist = np.bincount([r[6] for r in recs], minlength=9)
    print("city%d: %d buildings, %d KiB, tallest %.0f m, styles %s" % (apid, len(recs), len(buf) // 1024,
                                                                      max(r[4] for r in recs), list(hist)))
    return recs, half


def preview(apid, recs, half):
    from PIL import Image, ImageDraw
    W = 900
    s = W / (2 * half)
    img = Image.new("RGB", (W, W), (20, 50, 90))
    mask, n = land_mask(apid, half, 2 * half / W)
    img.paste(Image.fromarray((mask * 90).astype(np.uint8)).convert("RGB"), (0, 0))
    dr = ImageDraw.Draw(img)
    for (x, y, w, d, h, a, st) in recs:
        c = int(min(255, 60 + h * 1.5))
        px, py = (x + half) * s, (half - y) * s
        dr.point((px, py), fill=(c, c, 255 if st in (0, 1) else c))
    img.save(os.path.join(HERE, "output", "city%d.png" % apid))


if __name__ == "__main__":
    ids = [int(a) for a in sys.argv[1:]] or [1, 2, 3, 4]
    for i in ids:
        recs, half = generate(i)
        preview(i, recs, half)
