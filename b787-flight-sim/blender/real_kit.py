"""
Real-airport kit (Blender / bpy): the pieces that make the four airports and their cities
look like Tokyo Haneda, Osaka Kansai, Sapporo New Chitose and Okinawa Naha.

  * extra_runway()      secondary runways (rotated, full markings, edge / threshold lights)
  * taxi_link()         straight taxiways with centre line and edge lights
  * vault_roof()        barrel-vault / arched terminal roofs (New Chitose, Naha)
  * aerofoil_roof()     Kansai's long curved wing roof
  * palm()              Okinawan palms (geometry: the instanced trees are temperate)
  * landmarks           Tokyo Skytree, Tokyo Tower, Rainbow Bridge, Landmark Tower, Bay Bridge,
                        Aqua-Line / Umihotaru; Abeno Harukas, Umeda Sky Building, Osaka Castle,
                        Rinku Gate Tower, Sky Gate Bridge, Cosmo Tower, Akashi Kaikyo Bridge;
                        Sapporo TV Tower, JR Tower, Clock Tower; Shuri Castle, Yui Rail monorail
  * build_landmarks()   places the landmarks of one airport (geo.CITIES) on the terrain

All positions in the airport's Blender frame (x along the main runway, y towards the terminal,
metres).  Terrain heights come from web/js/terrain.js (node), so the landmarks stand on the
same ground as the simulator draws.
"""
import json
import math
import os
import subprocess

import numpy as np

import common as C
import build_world as W
import airport_kit as K
import geo as G

HERE = os.path.dirname(os.path.abspath(__file__))

LM = ["steel", "paint_white", "tower_orange", "glass_tower", "concrete", "dark", "road", "bridge", "roof",
      "castle_wall", "castle_roof", "lacquer", "tile_red", "palm_leaf", "trunk", "metal", "glass_dark",
      "granite", "gold", "white", "yellow", "asphalt", "shoulder", "taxi", "facade_office", "skytree"]


def li(name):
    return LM.index(name)


def lm_materials(M):
    new = dict(tower_orange=("#e0501c", 0.45, 0.2), castle_wall=("#f1efe8", 0.8, 0.0), castle_roof=("#5f8f7c", 0.45, 0.35),
               lacquer=("#b3261e", 0.35, 0.0), tile_red=("#c2462b", 0.7, 0.0), palm_leaf=("#3f7a2a", 0.6, 0.0),
               granite=("#8b8a84", 0.9, 0.0), gold=("#d8a93a", 0.25, 0.9), skytree=("#dfe7ee", 0.35, 0.3))
    for k, (c, r, m) in new.items():
        if k not in M:
            M[k] = C.pbr_material("W_" + k.title().replace("_", ""), color=C.hex_color(c), roughness=r, metallic=m)
    return [M[k] for k in LM]


def local_ang(apid, compass):
    """compass heading -> angle from the airport frame's +x axis (rad, counter-clockwise)"""
    return math.radians(90.0 + G.AP[apid]["north"] - compass)


# ---------------------------------------------------------------------------------------------
# terrain heights (web/js/terrain.js through node)
# ---------------------------------------------------------------------------------------------
def terrain_heights(apid, pts):
    """[(x, y)] airport-frame metres -> terrain height (m) at each point"""
    ap = G.AP[apid]
    W3 = [[ap["x"] + x, ap["z"] - y] for (x, y) in pts]
    js = ("import { terrainHeight } from './web/js/terrain.js';"
          "const P = JSON.parse(process.argv[1]);"
          "console.log(JSON.stringify(P.map(([x, z]) => Math.round(terrainHeight(x, z) * 10) / 10)));")
    out = subprocess.run(["node", "--input-type=module", "-e", js, json.dumps(W3)], cwd=os.path.join(HERE, ".."),
                         capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ---------------------------------------------------------------------------------------------
# runways and taxiways
# ---------------------------------------------------------------------------------------------
def runway_markings(mk, cx, cy, ang, length, wid, names, z, white=0, rect=W.rect):
    """ICAO markings of a runway centred at (cx, cy) along ang; names[0] is flown along +ang."""
    ca, sa = math.cos(ang), math.sin(ang)
    P = lambda s, t: (cx + s * ca - t * sa, cy + s * sa + t * ca)
    h = length / 2
    n_bars = 6 if wid < 50 else 8
    for end, name in ((-1, names[0]), (1, names[1])):
        inward = -end
        thr = end * h
        for i in range(n_bars):
            for sy in (-1, 1):
                rect(mk, *P(thr + inward * 21, sy * (3.0 + 0.9 + i * 3.6)), 30, 1.8, ang, z, white)
        rect(mk, *P(thr + inward * 1.0, 0), 1.8, wid - 2, ang, z, white)
        land = ang if end < 0 else ang + math.pi
        num, letter = name.rstrip("LRC"), name[len(name.rstrip("LRC")):]
        if letter:
            W.text_mesh(mk, letter, *P(thr + inward * 50, 0), z, 14.0, land - math.pi / 2, white)
            W.text_mesh(mk, num, *P(thr + inward * 80, 0), z, 14.0, land - math.pi / 2, white)
        else:
            W.text_mesh(mk, num, *P(thr + inward * 60, 0), z, 14.0, land - math.pi / 2, white)
        aim = 400 if length > 2400 else 300
        for sy in (-1, 1):
            rect(mk, *P(thr + inward * (aim + 30), sy * (wid / 2 - 12)), 60, 8 if wid < 50 else 10, ang, z, white)
            for d, n in ((150, 3), (300, 3), (600, 2), (750, 2), (900, 1)):
                if d + 30 >= aim and d - 30 <= aim:
                    continue
                for k in range(n):
                    rect(mk, *P(thr + inward * (d + 11), sy * (3.8 + 0.9 + k * 3.0)), 22.5, 1.8, ang, z, white)
    s = -h + 90
    while s < h - 90:
        rect(mk, *P(s + 15, 0), 30, 0.9, ang, z, white)
        s += 50
    for sy in (-1, 1):
        rect(mk, *P(0, sy * (wid / 2 - 0.9)), length, 0.9, ang, z, white)


def extra_runway(pav, mk, cx, cy, ang, length, wid, names, z_pav, z_mk, mats=(0, 1, 0), lights=True):
    """A secondary runway: pavement + shoulders + blast pads + markings + lights.
    mats = (asphalt, shoulder, white) indices of the builders."""
    A, S, WH = mats
    W.rect(pav, cx, cy, length, wid, ang, z_pav, A)
    ca, sa = math.cos(ang), math.sin(ang)
    P = lambda s, t: (cx + s * ca - t * sa, cy + s * sa + t * ca)
    W.rect(pav, cx, cy, length + 120, wid + 15, ang, z_pav - 0.012, S)
    runway_markings(mk, cx, cy, ang, length, wid, names, z_mk, WH)
    if not lights:
        return
    h = length / 2
    s = -h
    while s <= h + 0.1:
        for sy in (-1, 1):
            x, y = P(s, sy * (wid / 2 + 1.0))
            W.add_light("rwy_edge", (x, y, 0.45), "#fff6dc", 1.6)
        s += 60
    s = -h + 7.5
    while s < h:
        x, y = P(s, 0)
        W.add_light("rwy_cl_x", (x, y, z_mk + 0.02), "#fff4d6", 1.0)
        s += 15
    for end in (-1, 1):
        for k in range(-(int(wid / 2.9) // 2), int(wid / 2.9) // 2 + 1):
            x, y = P(end * h + end * 1.5, k * 2.9)
            W.add_light("rwy_threshold", (x, y, 0.35), "#34ff5a", 1.4, direction=(end * ca, end * sa, 0.1), kind="directional")
            x, y = P(end * h + end * 0.5, k * 2.9)
            W.add_light("rwy_end", (x, y, 0.35), "#ff2a1a", 1.4, direction=(-end * ca, -end * sa, 0.1), kind="directional")
        for k in range(1, 21):
            x, y = P(end * (h + k * 30.0), 0)
            for j in (-1, 0, 1):
                xx, yy = x - j * sa, y + j * ca
                W.add_light("als", (xx, yy, 0.8 + k * 0.1), "#fff2d0", 1.8, direction=(end * ca, end * sa, 0.12), kind="directional")


def taxi_link(pav, mk, p0, p1, z_pav, z_mk, wid=23.0, mats=(2, 1), lights=True, step=30.0):
    """Straight taxiway from p0 to p1 with the yellow centre line and blue edge lights."""
    T, Y = mats
    (x0, y0), (x1, y1) = p0, p1
    L = math.hypot(x1 - x0, y1 - y0)
    ang = math.atan2(y1 - y0, x1 - x0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    W.rect(pav, cx, cy, L + wid, wid, ang, z_pav - 0.004, T)
    W.rect(mk, cx, cy, L, 0.3, ang, z_mk, Y)
    if lights:
        ca, sa = math.cos(ang), math.sin(ang)
        s = 0.0
        while s <= L:
            x, y = x0 + s * ca, y0 + s * sa
            W.add_light("twy_cl", (x, y, z_mk + 0.02), "#28ff6a", 0.8)
            for sy in (-1, 1):
                W.add_light("twy_edge", (x - sy * (wid / 2 + 1) * sa, y + sy * (wid / 2 + 1) * ca, 0.35), "#3a64ff", 1.0)
            s += step


# ---------------------------------------------------------------------------------------------
# terminal roofs
# ---------------------------------------------------------------------------------------------
def _roof_grid(mb, X, Y, Z, mat, thick=0.8, fascia=True):
    P = np.stack([X, Y, Z], -1)
    UV = np.stack([X / 20, Y / 20], -1)
    mb.add_grid(P, UV, outward=("dir", (0, 0, 1)), mat=mat)
    Pb = P.copy()
    Pb[..., 2] -= thick
    mb.add_grid(Pb, UV, outward=("dir", (0, 0, -1)), mat=mat)
    if fascia:
        for j in (0, -1):
            mb.add_grid(np.stack([P[:, j], Pb[:, j]], 1), outward=("dir", (0, 1 if j else -1, 0)), mat=mat, smooth=False)
        for i in (0, -1):
            mb.add_grid(np.stack([P[i, :], Pb[i, :]], 1), outward=("dir", (1 if i else -1, 0, 0)), mat=mat, smooth=False)


def vault_roof(mb, x0, x1, y0, y1, z_eave, rise, mat, n=48, m=16, end_taper=0.0):
    """Barrel vault spanning y (arch across), running along x; end_taper lowers the ends."""
    xs, ys = np.linspace(x0, x1, n), np.linspace(y0, y1, m)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    v = (Y - y0) / (y1 - y0)
    u = (X - x0) / (x1 - x0)
    taper = 1.0 - end_taper * (2 * np.abs(u - 0.5)) ** 3
    Z = z_eave + rise * np.sin(v * math.pi) * taper
    _roof_grid(mb, X, Y, Z, mat)


def aerofoil_roof(mb, x0, x1, y0, y1, z_mid, z_end, z_low, z_high, mat, n=160, m=14):
    """Kansai's wing: a roof that curves down along its length (a slice of a torus) and whose
    section rises from the airside (z_low) to the landside (z_high) like an aerofoil."""
    xs, ys = np.linspace(x0, x1, n), np.linspace(y0, y1, m)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    u = (X - (x0 + x1) / 2) / ((x1 - x0) / 2)
    v = (Y - y0) / (y1 - y0)
    along = z_end + (z_mid - z_end) * (1 - u * u)
    section = z_low + (z_high - z_low) * (np.sin(v * math.pi * 0.62) / math.sin(math.pi * 0.62))
    Z = along * section / max(z_high, 1e-6)
    _roof_grid(mb, X, Y, Z, mat)
    return Z


# ---------------------------------------------------------------------------------------------
# small pieces
# ---------------------------------------------------------------------------------------------
def palm(mb, x, y, h, rng, z0=0.0, leaf=None, trunk=None):
    leaf = li("palm_leaf") if leaf is None else leaf
    trunk = li("trunk") if trunk is None else trunk
    lean = rng.uniform(0, 2 * math.pi)
    lx, ly = math.cos(lean) * h * 0.08, math.sin(lean) * h * 0.08
    mid = (x + lx * 0.4, y + ly * 0.4, z0 + h * 0.55)
    top = (x + lx, y + ly, z0 + h)
    K.cyl(mb, (x, y, z0), mid, 0.28, trunk, n=6, r1=0.22, caps=False)
    K.cyl(mb, mid, top, 0.22, trunk, n=6, r1=0.18)
    for k in range(9):
        a = k * 2 * math.pi / 9 + rng.uniform(-0.2, 0.2)
        ca, sa = math.cos(a), math.sin(a)
        L = h * rng.uniform(0.38, 0.5)
        pts = []
        for i, t in enumerate((0.0, 0.35, 0.7, 1.0)):
            r = L * t
            z = top[2] + L * 0.25 * math.sin(t * math.pi * 0.9) - L * 0.45 * t * t
            w = 0.9 * math.sin(max(t, 0.12) * math.pi) + 0.1
            pts.append(((top[0] + ca * r, top[1] + sa * r, z), w))
        for (p, w), (q, w2) in zip(pts[:-1], pts[1:]):
            quad = [(p[0] - sa * w, p[1] + ca * w, p[2]), (q[0] - sa * w2, q[1] + ca * w2, q[2]),
                    (q[0] + sa * w2, q[1] - ca * w2, q[2]), (p[0] + sa * w, p[1] - ca * w, p[2])]
            mb.add_poly(quad, mat=leaf, normal=(0, 0, 1))
            mb.add_poly(quad[::-1], mat=leaf, normal=(0, 0, -1))


def _seg(mb, p0, p1, w, mat):
    K.beam(mb, p0, p1, w, w, mat)


def _obst_circle(x, y, r, h):
    W.obstacle(x - r, y - r, x + r, y + r, h)


# ---------------------------------------------------------------------------------------------
# towers
# ---------------------------------------------------------------------------------------------
def lattice_tower(mb, x, y, z0, h, base, top, decks, mast, band=None, bands=(li("tower_orange"), li("paint_white"))):
    """Square steel lattice tower (Tokyo Tower, Sapporo TV Tower): four splayed legs, X bracing,
    observation decks [(z, half_size, height)], antenna mast to h + mast."""
    band = band or h / 10.0
    def half(z):
        t = (z / h) ** 0.7
        return base / 2 + (top / 2 - base / 2) * t
    zs = list(np.arange(0.0, h, band)) + [h]
    for i, (za, zb) in enumerate(zip(zs[:-1], zs[1:])):
        mat = bands[i % 2]
        ha, hb = half(za), half(zb)
        w = max(0.8, ha * 0.12)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            _seg(mb, (x + sx * ha, y + sy * ha, z0 + za), (x + sx * hb, y + sy * hb, z0 + zb), w, mat)
        for (ax, ay, bx, by) in ((-1, -1, 1, -1), (1, -1, 1, 1), (1, 1, -1, 1), (-1, 1, -1, -1)):
            _seg(mb, (x + ax * ha, y + ay * ha, z0 + za), (x + bx * hb, y + by * hb, z0 + zb), w * 0.35, mat)
            _seg(mb, (x + bx * ha, y + by * ha, z0 + za), (x + ax * hb, y + ay * hb, z0 + zb), w * 0.35, mat)
            _seg(mb, (x + ax * hb, y + ay * hb, z0 + zb), (x + bx * hb, y + by * hb, z0 + zb), w * 0.4, mat)
    for (zd, hs, hd) in decks:
        K.box(mb, x - hs, x + hs, y - hs, y + hs, z0 + zd, z0 + zd + hd, li("glass_tower"))
        K.box(mb, x - hs - 0.5, x + hs + 0.5, y - hs - 0.5, y + hs + 0.5, z0 + zd + hd, z0 + zd + hd + 1.2, li("paint_white"))
        K.box(mb, x - hs - 0.5, x + hs + 0.5, y - hs - 0.5, y + hs + 0.5, z0 + zd - 1.2, z0 + zd, li("dark"))
        for k in range(24):
            a = k * 2 * math.pi / 24
            W.add_light("landmark", (x + (hs + 0.6) * math.cos(a) * 1.2, y + (hs + 0.6) * math.sin(a) * 1.2, z0 + zd + hd * 0.5), "#ffd9a0", 2.5)
    _seg(mb, (x, y, z0 + h), (x, y, z0 + h + mast), max(1.0, top * 0.25), li("tower_orange"))
    # night illumination along the legs
    for z in np.arange(10.0, h, h / 14):
        hz = half(z)
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            W.add_light("landmark", (x + sx * hz, y + sy * hz, z0 + z), "#ffb060", 3.0)
    for z in (h * 0.5, h, h + mast):
        W.add_light("obstruction", (x, y, z0 + z + 0.5), "#ff1a1a", 4.0, kind="blink")
    W.obstacle(x - base / 2, y - base / 2, x + base / 2, y + base / 2, z0 + h * 0.25)
    W.obstacle(x - top, y - top, x + top, y + top, z0 + h + mast)


def skytree(mb, x, y, z0):
    """Tokyo Skytree (634 m): triangular base morphing to a circle, two observation decks."""
    H1, H2, TOP = 350.0, 450.0, 634.0
    # three legs of the triangle
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2
        p0 = (x + 40 * math.cos(a), y + 40 * math.sin(a), z0)
        p1 = (x + 17 * math.cos(a), y + 17 * math.sin(a), z0 + H1 - 20)
        _seg(mb, p0, p1, 5.0, li("skytree"))
    # the lattice body: a tapering cylinder with a diagrid of rings / diagonals
    W.cylinder(mb, x, y, 22, 15, z0, z0 + H1, li("glass_dark"), n=24, top=False)
    for z in np.arange(10.0, H1, 14.0):
        r = 33 - 16 * (z / H1) ** 0.8
        W.cylinder(mb, x, y, r, r, z0 + z, z0 + z + 1.0, li("skytree"), n=24, top=False)
    for k in range(18):
        a0 = k * 2 * math.pi / 18
        for z in np.arange(0.0, H1 - 28, 28.0):
            r0, r1 = 33 - 16 * (z / H1) ** 0.8, 33 - 16 * ((z + 28) / H1) ** 0.8
            a1 = a0 + math.pi / 18
            _seg(mb, (x + r0 * math.cos(a0), y + r0 * math.sin(a0), z0 + z), (x + r1 * math.cos(a1), y + r1 * math.sin(a1), z0 + z + 28), 0.9, li("skytree"))
            _seg(mb, (x + r0 * math.cos(a1), y + r0 * math.sin(a1), z0 + z), (x + r1 * math.cos(a0), y + r1 * math.sin(a0), z0 + z + 28), 0.9, li("skytree"))
    # Tembo deck (350 m, three floors) and Tembo galleria (450 m)
    W.cylinder(mb, x, y, 18, 23, z0 + H1, z0 + H1 + 18, li("glass_tower"), n=32)
    W.cylinder(mb, x, y, 23, 18, z0 + H1 + 18, z0 + H1 + 24, li("skytree"), n=32)
    W.cylinder(mb, x, y, 13, 13, z0 + H1 + 24, z0 + H2, li("skytree"), n=24, top=False)
    W.cylinder(mb, x, y, 14, 16, z0 + H2, z0 + H2 + 10, li("glass_tower"), n=32)
    W.cylinder(mb, x, y, 16, 10, z0 + H2 + 10, z0 + H2 + 14, li("skytree"), n=32)
    W.cylinder(mb, x, y, 8, 4, z0 + H2 + 14, z0 + 500, li("skytree"), n=16, top=False)
    W.cylinder(mb, x, y, 4, 1.5, z0 + 500, z0 + TOP, li("paint_white"), n=12)
    # "Iki" light-blue illumination
    for z in np.arange(20.0, H1, 20.0):
        r = 33 - 16 * (z / H1) ** 0.8
        for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
            W.add_light("landmark", (x + (r + 0.5) * math.cos(a), y + (r + 0.5) * math.sin(a), z0 + z), "#9fd7ff", 3.0)
    for zz in (H1 + 9, H2 + 5):
        for a in np.linspace(0, 2 * math.pi, 24, endpoint=False):
            W.add_light("landmark", (x + 23.5 * math.cos(a), y + 23.5 * math.sin(a), z0 + zz), "#e3c4ff", 3.0)
    for z in (200.0, H1 + 24, H2 + 14, 560.0, TOP):
        W.add_light("obstruction", (x, y, z0 + z + 0.5), "#ff1a1a", 5.0, kind="blink")
    W.obstacle(x - 36, y - 36, x + 36, y + 36, z0 + H1 + 24)
    W.obstacle(x - 16, y - 16, x + 16, y + 16, z0 + TOP)


def tower_block(mb, x, y, z0, h, w, d, ang=0.0, mat=None, crown=None, setbacks=(), top_mat=None):
    """Office tower: optional setbacks [(z_from, scale)], crown pyramid height."""
    mat = li("glass_tower") if mat is None else mat
    top_mat = li("dark") if top_mat is None else top_mat
    levels = [(0.0, 1.0)] + list(setbacks) + [(h, None)]
    for (za, sc), (zb, _) in zip(levels[:-1], levels[1:]):
        K.obox(mb, x, y, w * sc, d * sc, ang, z0 + za, z0 + zb, mat, uv=0.05)
        # mullion bands
        for z in np.arange(za + 4.0, zb, 12.0):
            K.obox(mb, x, y, w * sc + 0.3, d * sc + 0.3, ang, z0 + z, z0 + z + 0.6, top_mat, uv=0.05)
    sc = levels[-2][1]
    if crown:
        for k, t in enumerate(np.linspace(0, 1, 6)[:-1]):
            s = sc * (1 - t * 0.8)
            K.obox(mb, x, y, w * s, d * s, ang, z0 + h + t * crown, z0 + h + (t + 0.2) * crown, top_mat, uv=0.05)
    r = max(w, d) * 0.6
    W.obstacle(x - r, y - r, x + r, y + r, z0 + h + (crown or 0))
    W.add_light("obstruction", (x, y, z0 + h + (crown or 0) + 1), "#ff1a1a", 3.0, kind="blink")
    for a in np.linspace(0, 2 * math.pi, 16, endpoint=False):
        W.add_light("landmark", (x + r * math.cos(a), y + r * math.sin(a), z0 + h - 2), "#fff0c8", 2.0)


# ---------------------------------------------------------------------------------------------
# bridges
# ---------------------------------------------------------------------------------------------
def _frame(cx, cy, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    return lambda s, t, z: (cx + s * ca - t * sa, cy + s * sa + t * ca, z)


def _deck(mb, P, s0, s1, z, width, ang, girder=3.0, mat=li("bridge")):
    a, b = P(s0, 0, z), P(s1, 0, z)
    K.beam(mb, (a[0], a[1], z - girder / 2), (b[0], b[1], z - girder / 2), width, girder, mat)
    W.rect(mb, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, abs(s1 - s0), width - 1.5, ang, z + 0.02, li("road"), ("road", 20.0, width))


def _ramp(mb, P, s0, s1, z0, z1, width, zg0=0.0, zg1=0.0):
    a, b = P(s0, 0, 0), P(s1, 0, 0)
    K.beam(mb, (a[0], a[1], z0 - 1.5), (b[0], b[1], z1 - 1.5), width, 3.0, li("concrete"))
    n = int(abs(s1 - s0) / 45)
    for k in range(1, n):
        t = k / n
        p = P(s0 + (s1 - s0) * t, 0, 0)
        z = z0 + (z1 - z0) * t
        zg = zg0 + (zg1 - zg0) * t
        if z - zg > 4:
            K.box(mb, p[0] - 2, p[0] + 2, p[1] - 2, p[1] + 2, zg - 20, z - 3, li("concrete"))


def suspension_bridge(mb, cx, cy, ang, main, side, tower_h, deck_z, width, tower_mat, approach=400.0, zg=0.0, anchor=True):
    P = _frame(cx, cy, ang)
    total = main + 2 * side
    _deck(mb, P, -total / 2, total / 2, deck_z, width, ang, girder=4.0 if main > 1000 else 3.0,
          mat=li("bridge") if main < 1000 else li("paint_white"))
    tw = max(3.0, tower_h * 0.03)
    for s in (-main / 2, main / 2):
        for t in (-1, 1):
            _seg(mb, P(s, t * (width / 2 + tw), zg - 20), P(s, t * (width / 2 + tw * 0.5), deck_z + tower_h - deck_z), tw, tower_mat)
        for z in (deck_z - 4, deck_z + (tower_h - deck_z) * 0.55, tower_h - 3):
            a, b = P(s, -(width / 2 + tw), z), P(s, width / 2 + tw, z)
            _seg(mb, a, b, tw * 0.9, tower_mat)
        p = P(s, 0, 0)
        W.obstacle(p[0] - width / 2 - tw * 2, p[1] - width / 2 - tw * 2, p[0] + width / 2 + tw * 2, p[1] + width / 2 + tw * 2, tower_h)
        W.add_light("obstruction", (p[0], p[1], tower_h + 1), "#ff1a1a", 4.0, kind="blink")
    # main cables and hangers
    sag_low = deck_z + 4.0
    def cable_z(s):
        if abs(s) <= main / 2:
            return sag_low + (tower_h - sag_low) * (s / (main / 2)) ** 2
        t = (total / 2 - abs(s)) / side
        return deck_z + 2 + (tower_h - deck_z - 2) * t ** 1.3
    ss = np.linspace(-total / 2, total / 2, 121)
    for t in (-1, 1):
        tt = t * (width / 2 + tw * 0.5)
        for a, b in zip(ss[:-1], ss[1:]):
            _seg(mb, P(a, tt, cable_z(a)), P(b, tt, cable_z(b)), max(0.6, tw * 0.25), li("steel"))
        step = 25.0 if main < 1000 else 40.0
        for s in np.arange(-total / 2 + step, total / 2, step):
            z = cable_z(s)
            if z - deck_z > 2:
                _seg(mb, P(s, tt, deck_z), P(s, tt, z), 0.25, li("steel"))
        for s in ss[::3]:
            W.add_light("bridge", P(s, tt, cable_z(s) + 0.8), "#fff1c8", 2.2)
    for s in np.arange(-total / 2, total / 2, 40.0):
        for t in (-1, 1):
            W.add_light("bridge", P(s, t * width / 2, deck_z + 1.2), "#ffcf88", 1.8)
    if anchor:
        for e in (-1, 1):
            p = P(e * (total / 2 + 20), 0, 0)
            K.obox(mb, p[0], p[1], 50, width + 20, ang, zg - 20, deck_z + 6, li("concrete"))
    for e in (-1, 1):
        _ramp(mb, P, e * (total / 2 + 45), e * (total / 2 + 45 + approach), deck_z, zg + 1.0, width, zg, zg)


def cable_stayed_bridge(mb, cx, cy, ang, main, side, tower_h, deck_z, width, tower_mat, approach=500.0, zg=0.0):
    P = _frame(cx, cy, ang)
    total = main + 2 * side
    _deck(mb, P, -total / 2, total / 2, deck_z, width, ang, girder=5.0, mat=li("paint_white"))
    for s in (-main / 2, main / 2):
        # H-shaped towers with a diamond-ish top
        for t in (-1, 1):
            _seg(mb, P(s, t * (width / 2 + 3), zg - 20), P(s, t * (width / 2 + 2), tower_h), 5.0, tower_mat)
        for z in (deck_z - 5, tower_h * 0.55, tower_h - 4):
            _seg(mb, P(s, -(width / 2 + 3), z), P(s, width / 2 + 3, z), 4.0, tower_mat)
        p = P(s, 0, 0)
        W.obstacle(p[0] - width, p[1] - width, p[0] + width, p[1] + width, tower_h)
        W.add_light("obstruction", (p[0], p[1], tower_h + 1), "#ff1a1a", 4.0, kind="blink")
        for k in range(1, 15):
            for d in (-1, 1):
                for t in (-1, 1):
                    top = P(s, t * (width / 2 + 2), tower_h - 6 - k * 3.6)
                    reach = k * (main / 2 - 20) / 14 if d * s < 0 else k * (side - 20) / 14
                    _seg(mb, top, P(s + d * reach, t * (width / 2 - 1), deck_z + 0.5), 0.3, li("steel"))
                    if k % 2 == 0:
                        W.add_light("bridge", P(s + d * reach * 0.6, t * (width / 2 + 1), deck_z + (tower_h - deck_z) * 0.45 - k * 2.5), "#dfeaff", 2.0)
    for s in np.arange(-total / 2, total / 2, 40.0):
        for t in (-1, 1):
            W.add_light("bridge", P(s, t * width / 2, deck_z + 1.2), "#ffcf88", 1.8)
    for e in (-1, 1):
        _ramp(mb, P, e * total / 2, e * (total / 2 + approach), deck_z, zg + 1.0, width, zg, zg)


def truss_bridge(mb, cx, cy, ang, length, deck_z, width, truss_h=14.0, pier_every=150.0):
    """Kansai's Sky Gate Bridge: 3.75 km double-deck truss (road on top, rail below)."""
    P = _frame(cx, cy, ang)
    _deck(mb, P, -length / 2, length / 2, deck_z, width, ang, girder=1.5, mat=li("paint_white"))
    a, b = P(-length / 2, 0, 0), P(length / 2, 0, 0)
    K.beam(mb, (a[0], a[1], deck_z - 8), (b[0], b[1], deck_z - 8), width * 0.7, 1.2, li("paint_white"))
    step = 15.0
    ss = np.arange(-length / 2, length / 2 + 0.1, step)
    for t in (-1, 1):
        tt = t * width / 2
        _seg(mb, P(ss[0], tt, deck_z + truss_h), P(ss[-1], tt, deck_z + truss_h), 1.1, li("paint_white"))
        _seg(mb, P(ss[0], tt, deck_z - 8), P(ss[-1], tt, deck_z - 8), 1.1, li("paint_white"))
        for i, s in enumerate(ss[:-1]):
            s2 = s + step
            if i % 2 == 0:
                _seg(mb, P(s, tt, deck_z - 8), P(s2, tt, deck_z + truss_h), 0.6, li("paint_white"))
            else:
                _seg(mb, P(s, tt, deck_z + truss_h), P(s2, tt, deck_z - 8), 0.6, li("paint_white"))
            _seg(mb, P(s, tt, deck_z - 8), P(s, tt, deck_z + truss_h), 0.5, li("paint_white"))
        for s in ss[::4]:
            W.add_light("bridge", P(s, tt, deck_z + truss_h + 0.8), "#e8f0ff", 1.8)
    for s in ss[::2]:
        _seg(mb, P(s, -width / 2, deck_z + truss_h), P(s, width / 2, deck_z + truss_h), 0.5, li("paint_white"))
    for s in np.arange(-length / 2, length / 2 + 1, pier_every):
        p = P(s, 0, 0)
        K.obox(mb, p[0], p[1], 8, width * 0.8, ang, -25, deck_z - 9, li("concrete"))
    W.obstacle(*_bbox(P, -length / 2, length / 2, width), deck_z + truss_h)


def _bbox(P, s0, s1, width):
    pts = [P(s, t, 0) for s in (s0, s1) for t in (-width / 2, width / 2)]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs), max(ys)


def viaduct(mb, pts, heights, deck_z, width, pier_every=30.0, mat=None):
    """Elevated guideway / road along a polyline; heights = ground height at each vertex."""
    mat = li("concrete") if mat is None else mat
    for (p, hp), (q, hq) in zip(zip(pts[:-1], heights[:-1]), zip(pts[1:], heights[1:])):
        L = math.hypot(q[0] - p[0], q[1] - p[1])
        K.beam(mb, (p[0], p[1], hp + deck_z - 0.9), (q[0], q[1], hq + deck_z - 0.9), width, 1.8, mat)
        n = max(1, int(L / pier_every))
        for k in range(n):
            t = k / n
            x, y = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
            z = hp + (hq - hp) * t
            K.box(mb, x - 0.9, x + 0.9, y - 0.9, y + 0.9, z - 5, z + deck_z - 1.8, mat)
            K.box(mb, x - width / 2, x + width / 2, y - 1.0, y + 1.0, z + deck_z - 2.6, z + deck_z - 1.8, mat)
            if k % 3 == 0:
                W.add_light("street", (x, y, z + deck_z + 3), "#ffd9a0", 1.6)


# ---------------------------------------------------------------------------------------------
# Japanese buildings
# ---------------------------------------------------------------------------------------------
def hip_roof(mb, x, y, z, w, d, rise, over, mat, ang=0.0, upturn=0.0):
    """Hipped roof (irimoya-ish) with eaves overhang; optional upturned corners."""
    hw, hd = w / 2 + over, d / 2 + over
    ridge = max(0.0, (w - d) / 2)
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda a, b, c: (x + a * ca - b * sa, y + a * sa + b * ca, c)
    e = [T(-hw, -hd, z - upturn * 0), T(hw, -hd, z), T(hw, hd, z), T(-hw, hd, z)]
    e = [(p[0], p[1], p[2] + upturn) for p in e]
    r0, r1 = T(-ridge, 0, z + rise), T(ridge, 0, z + rise)
    mb.add_poly([e[0], e[1], r1, r0], mat=mat, outward=(x, y, z))
    mb.add_poly([e[2], e[3], r0, r1], mat=mat, outward=(x, y, z))
    mb.add_poly([e[1], e[2], r1], mat=mat, outward=(x, y, z))
    mb.add_poly([e[3], e[0], r0], mat=mat, outward=(x, y, z))
    mb.add_poly(e[::-1], mat=mat, normal=(0, 0, -1))


def castle_keep(mb, x, y, z0, ang=0.0):
    """Osaka Castle: granite base, five tiers of white walls under green copper roofs, gold trim."""
    K.obox(mb, x, y, 70, 62, ang, z0 - 10, z0 + 3, li("granite"))
    K.obox(mb, x, y, 62, 55, ang, z0 + 3, z0 + 14, li("granite"))
    w, d, z = 48.0, 41.0, z0 + 14
    for tier in range(5):
        hgt = 7.0 if tier < 4 else 8.0
        K.obox(mb, x, y, w, d, ang, z, z + hgt, li("castle_wall"), uv=0.1)
        # windows band
        K.obox(mb, x, y, w + 0.2, d + 0.2, ang, z + hgt * 0.45, z + hgt * 0.62, li("dark"), uv=0.1)
        hip_roof(mb, x, y, z + hgt, w, d, 3.5 if tier < 4 else 9.0, 3.0, li("castle_roof"), ang, upturn=0.6)
        K.obox(mb, x, y, w * 0.25, 0.8, ang, z + hgt + 0.2, z + hgt + 2.5, li("gold"))
        z += hgt + 2.5
        w, d = w * 0.82, d * 0.82
    for sx in (-1, 1):
        ca, sa = math.cos(ang), math.sin(ang)
        px, py = x + sx * 6 * ca, y + sx * 6 * sa
        K.box(mb, px - 0.8, px + 0.8, py - 0.8, py + 0.8, z + 5, z + 8, li("gold"))
    for a in np.linspace(0, 2 * math.pi, 16, endpoint=False):
        W.add_light("landmark", (x + 40 * math.cos(a), y + 40 * math.sin(a), z0 + 20), "#fff4e0", 3.0)
    W.obstacle(x - 35, y - 35, x + 35, y + 35, z + 10)


def shuri_castle(mb, x, y, z0, ang):
    """Shuri Castle: red lacquered Seiden with a red-tiled hip roof, courtyard, curved stone walls."""
    K.obox(mb, x, y, 42, 40, ang, z0 - 6, z0 + 0.4, li("granite"))
    ca, sa = math.cos(ang), math.sin(ang)
    T = lambda a, b: (x + a * ca - b * sa, y + a * sa + b * ca)
    # courtyard stripes (red / white tiles)
    for k in range(-5, 6):
        p = T(0, -30 + k * 0.0)
        W.rect(mb, *T(k * 3.6, -32), 3.4, 30, ang + math.pi / 2 * 0, z0 + 0.45, li("tile_red") if k % 2 else li("white"))
    cx, cy = T(0, 0)
    K.obox(mb, cx, cy, 30, 17, ang, z0 + 0.4, z0 + 12, li("lacquer"), uv=0.1)
    K.obox(mb, cx, cy, 30.4, 17.4, ang, z0 + 5.5, z0 + 6.2, li("tile_red"), uv=0.1)
    hip_roof(mb, cx, cy, z0 + 6.2, 30, 17, 2.0, 2.2, li("tile_red"), ang)
    hip_roof(mb, cx, cy, z0 + 12, 28, 15, 6.5, 2.5, li("tile_red"), ang, upturn=0.4)
    fx, fy = T(0, -9.5)
    K.obox(mb, fx, fy, 10, 4, ang, z0 + 0.4, z0 + 7, li("lacquer"))
    hip_roof(mb, fx, fy, z0 + 7, 10, 4, 2.5, 1.5, li("tile_red"), ang, upturn=0.5)
    # stone walls: curved ring
    for k in range(40):
        a0, a1 = k * 2 * math.pi / 40, (k + 1) * 2 * math.pi / 40
        r0, r1 = 110 + 25 * math.sin(3 * a0), 110 + 25 * math.sin(3 * a1)
        p0 = (x + r0 * math.cos(a0), y + r0 * math.sin(a0))
        p1 = (x + r1 * math.cos(a1), y + r1 * math.sin(a1))
        K.beam(mb, (p0[0], p0[1], z0 - 8), (p1[0], p1[1], z0 - 8), 3.5, 18, li("granite"))
    for a in np.linspace(0, 2 * math.pi, 12, endpoint=False):
        W.add_light("landmark", (x + 22 * math.cos(a), y + 22 * math.sin(a), z0 + 8), "#ffcaa0", 2.6)
    W.obstacle(x - 25, y - 25, x + 25, y + 25, z0 + 19)


def clock_tower(mb, x, y, z0, ang):
    """Sapporo Clock Tower: white clapboard hall, red roof, clock turret."""
    K.obox(mb, x, y, 22, 14, ang, z0, z0 + 9, li("castle_wall"), uv=0.2)
    hip_roof(mb, x, y, z0 + 9, 22, 14, 4.0, 0.8, li("tile_red"), ang)
    ca, sa = math.cos(ang), math.sin(ang)
    tx, ty = x + 6 * ca, y + 6 * sa
    K.obox(mb, tx, ty, 5, 5, ang, z0 + 9, z0 + 17, li("castle_wall"))
    K.obox(mb, tx, ty, 5.2, 5.2, ang, z0 + 13, z0 + 15.5, li("dark"))
    hip_roof(mb, tx, ty, z0 + 17, 5, 5, 3.0, 0.5, li("tile_red"), ang)


# ---------------------------------------------------------------------------------------------
# per-airport landmark sets
# ---------------------------------------------------------------------------------------------
def build_landmarks(apid, M, col, name="Landmarks"):
    mats = lm_materials(M)
    mb = C.MeshBuilder()
    rng = np.random.default_rng(700 + apid)
    city = G.CITIES[apid]
    spots = {d["k"]: G.local_ll(apid, d["lat"], d["lon"]) for d in city["landmarks"]}
    extra = {}
    if apid == 1:
        extra = dict(rb_a=G.local_ll(1, 35.6395, 139.7575), aq_w=G.local_ll(1, 35.4990, 139.8010),
                     aq_k=G.local_ll(1, 35.4450, 139.8560), aq_e=G.local_ll(1, 35.4150, 139.9150))
    if apid == 2:
        extra = dict(sg_a=G.local_ll(2, 34.4270, 135.2470), sg_b=G.local_ll(2, 34.4120, 135.2860))
    if apid == 4:
        route = [(26.2066, 127.6523), (26.2100, 127.6600), (26.2116, 127.6746), (26.2144, 127.6795), (26.2173, 127.6905),
                 (26.2229, 127.6977), (26.2268, 127.7080), (26.2250, 127.7160), (26.2195, 127.7198)]
        extra["rail"] = [G.local_ll(4, a, b) for (a, b) in route]
    keys = list(spots) + [k for k in extra if k != "rail"]
    pts = [spots.get(k) or extra[k] for k in keys] + extra.get("rail", [])
    hs = terrain_heights(apid, pts)
    H = {k: max(0.0, h) for k, h in zip(keys, hs)}
    rail_h = hs[len(keys):]
    xy = lambda k: spots.get(k) or extra[k]
    a = lambda compass: local_ang(apid, compass)
    placed = []
    for k in spots:
        x, y = xy(k)
        z = H[k]
        placed.append((k, round(x), round(y), z))
        if k == "skytree":
            skytree(mb, x, y, z)
        elif k == "tokyotower":
            lattice_tower(mb, x, y, z, 250.0, 80.0, 9.0, [(145.0, 17.0, 10.0), (223.0, 7.0, 6.0)], 83.0, band=25.0)
        elif k == "landmarktower":
            tower_block(mb, x, y, z, 280.0, 64.0, 64.0, a(45), li("granite"), crown=16.0, setbacks=((120.0, 0.86), (200.0, 0.74)))
            tower_block(mb, x + 160 * math.cos(a(90)), y + 160 * math.sin(a(90)), z, 110.0, 50.0, 30.0, a(45), li("glass_tower"))
        elif k == "rainbowbridge":
            bx, by = x, y
            suspension_bridge(mb, bx, by, a(118), 570.0, 114.0, 126.0, 50.0, 30.0, li("paint_white"), approach=420.0, zg=0.0)
        elif k == "baybridge":
            cable_stayed_bridge(mb, x, y, a(50), 460.0, 200.0, 172.0, 55.0, 40.0, li("paint_white"), approach=700.0)
        elif k == "aqualine":
            # Umihotaru island (a ship-shaped parking area) + the 4.4 km bridge to Kisarazu; the
            # Kaze-no-To ventilation tower above the tunnel in mid-bay
            ux, uy = xy("aq_k")
            ang = math.atan2(xy("aq_e")[1] - uy, xy("aq_e")[0] - ux)
            K.obox(mb, ux, uy, 650, 100, ang, -8, 3, li("concrete"))
            for lv in range(5):
                K.obox(mb, ux - 40 * math.cos(ang), uy - 40 * math.sin(ang), 420 - lv * 40, 70 - lv * 6, ang, 3 + lv * 4.5, 7 + lv * 4.5, li("paint_white"), uv=0.1)
            K.obox(mb, ux, uy, 60, 60, ang, 25, 34, li("glass_tower"))
            ex, ey = xy("aq_e")
            L = math.hypot(ex - ux, ey - uy)
            n = int(L / 60)
            for i in range(n):
                t0, t1 = i / n, (i + 1) / n
                z0_, z1_ = 12 + 18 * math.sin(t0 * math.pi) ** 2, 12 + 18 * math.sin(t1 * math.pi) ** 2
                p0 = (ux + (ex - ux) * t0, uy + (ey - uy) * t0)
                p1 = (ux + (ex - ux) * t1, uy + (ey - uy) * t1)
                K.beam(mb, (p0[0], p0[1], z0_), (p1[0], p1[1], z1_), 24, 3, li("concrete"))
                K.box(mb, p0[0] - 3, p0[0] + 3, p0[1] - 3, p0[1] + 3, -15, z0_ - 1.5, li("concrete"))
                for sgn in (-1, 1):
                    W.add_light("bridge", (p0[0] - sgn * 12 * math.sin(ang), p0[1] + sgn * 12 * math.cos(ang), z0_ + 3), "#ffcf88", 1.8)
            wx, wy = xy("aq_w")
            W.cylinder(mb, wx, wy, 45, 45, -8, 6, li("concrete"), n=24)
            for kk in range(2):
                W.cylinder(mb, wx + (kk - 0.5) * 36, wy, 13, 11, 6, 90 - kk * 15, li("paint_white"), n=16)
            W.obstacle(wx - 40, wy - 20, wx + 40, wy + 20, 90.0)
            W.obstacle(ux - 250, uy - 250, ux + 250, uy + 250, 34.0)
        elif k == "harukas":
            tower_block(mb, x, y, z, 300.0, 76.0, 64.0, a(0), li("glass_tower"), setbacks=((120.0, 0.82), (200.0, 0.62)))
        elif k == "umedasky":
            ang = a(0)
            ca, sa = math.cos(ang), math.sin(ang)
            for sgn in (-1, 1):
                tx, ty = x + sgn * 27 * ca, y + sgn * 27 * sa
                K.obox(mb, tx, ty, 26, 40, ang, z, z + 165, li("glass_tower"), uv=0.05)
            K.obox(mb, x, y, 82, 40, ang, z + 160, z + 173, li("glass_tower"), uv=0.05)
            W.cylinder(mb, x, y, 26, 26, z + 160, z + 168, li("glass_dark"), n=24)
            for zb in (50, 70, 100, 130):
                K.obox(mb, x, y, 30, 4, ang, z + zb, z + zb + 3, li("steel"))
            W.obstacle(x - 45, y - 45, x + 45, y + 45, z + 173)
            W.add_light("obstruction", (x, y, z + 174), "#ff1a1a", 3.0, kind="blink")
            for aa in np.linspace(0, 2 * math.pi, 16, endpoint=False):
                W.add_light("landmark", (x + 27 * math.cos(aa), y + 27 * math.sin(aa), z + 164), "#9ff0ff", 2.4)
        elif k == "osakacastle":
            castle_keep(mb, x, y, z, a(0))
            for i in range(160):
                r, aa = rng.uniform(70, 330), rng.uniform(0, 2 * math.pi)
                W.tree(mb, x + r * math.cos(aa), y + r * math.sin(aa), rng.uniform(7, 13), rng)
        elif k == "rinkugate":
            ang = a(300)
            ca, sa = math.cos(ang), math.sin(ang)
            for sgn in (-1, 1):
                K.obox(mb, x + sgn * 22 * ca, y + sgn * 22 * sa, 22, 40, ang, z, z + 256, li("glass_tower"), uv=0.05)
            K.obox(mb, x, y, 66, 40, ang, z, z + 150, li("glass_tower"), uv=0.05)
            K.obox(mb, x, y, 66, 40, ang, z + 225, z + 256, li("glass_tower"), uv=0.05)
            K.obox(mb, x, y, 68, 42, ang, z + 256, z + 258, li("dark"))
            W.obstacle(x - 40, y - 40, x + 40, y + 40, z + 258)
            W.add_light("obstruction", (x, y, z + 259), "#ff1a1a", 3.0, kind="blink")
            for aa in np.linspace(0, 2 * math.pi, 12, endpoint=False):
                W.add_light("landmark", (x + 34 * math.cos(aa), y + 34 * math.sin(aa), z + 240), "#fff0c8", 2.4)
        elif k == "skygatebridge":
            (ax_, ay_), (bx_, by_) = xy("sg_a"), xy("sg_b")
            L = math.hypot(bx_ - ax_, by_ - ay_)
            truss_bridge(mb, (ax_ + bx_) / 2, (ay_ + by_) / 2, math.atan2(by_ - ay_, bx_ - ax_), L, 26.0, 30.0)
        elif k == "cosmotower":
            tower_block(mb, x, y, z, 236.0, 70.0, 36.0, a(20), li("glass_tower"), crown=20.0)
        elif k == "akashibridge":
            suspension_bridge(mb, x, y, a(162), 1991.0, 960.0, 298.0, 65.0, 36.0, li("paint_white"), approach=600.0)
        elif k == "tvtower":
            lattice_tower(mb, x, y, z, 110.0, 30.0, 8.0, [(90.0, 9.0, 6.0)], 37.0, band=22.0)
            K.obox(mb, x, y, 24, 24, 0, z, z + 12, li("concrete"))
            K.obox(mb, x, y, 7, 0.6, 0, z + 72, z + 80, li("paint_white"))       # the clock board
        elif k == "jrtower":
            tower_block(mb, x, y, z, 173.0, 44.0, 36.0, a(0), li("glass_tower"))
            K.obox(mb, x, y + 60, 240, 90, a(0), z, z + 30, li("facade_office"), uv=0.05)
        elif k == "clocktower":
            clock_tower(mb, x, y, z, a(0))
        elif k == "shuri":
            shuri_castle(mb, x, y, z, a(270))
            for i in range(120):
                r, aa = rng.uniform(40, 260), rng.uniform(0, 2 * math.pi)
                palm(mb, x + r * math.cos(aa), y + r * math.sin(aa), rng.uniform(8, 13), rng, z0=z - 1)
        elif k == "monorail":
            R = extra["rail"]
            viaduct(mb, R, rail_h, 13.0, 4.2, pier_every=30.0)
            # stations (every other vertex) and two trains
            for i, ((px, py), hz) in enumerate(zip(R, rail_h)):
                if i % 2 == 0:
                    K.box(mb, px - 40, px + 40, py - 9, py + 9, hz + 12, hz + 20, li("paint_white"))
                    W.rect(mb, px, py, 80, 18, 0, hz + 20.05, li("roof"))
            for i in (2, 5):
                (px, py), (qx, qy) = R[i], R[i + 1]
                ang = math.atan2(qy - py, qx - px)
                mx, my = (px + qx) / 2, (py + qy) / 2
                hz = (rail_h[i] + rail_h[i + 1]) / 2
                K.obox(mb, mx, my, 30, 3.0, ang, hz + 13.2, hz + 17.2, li("paint_white"))
                K.obox(mb, mx, my, 30.2, 3.1, ang, hz + 15.0, hz + 16.2, li("glass_dark"))
    mb.build(name, mats, col=col)
    return placed
