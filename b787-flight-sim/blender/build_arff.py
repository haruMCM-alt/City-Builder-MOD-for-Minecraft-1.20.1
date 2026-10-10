"""
Airport rescue and fire fighting (ARFF): crash tender, fire fighters, evacuating passengers and
the inflatable escape slide, built procedurally in Blender.

    blender --background --python build_arff.py        (or: python3 build_arff.py with the bpy module)

Objects (Blender frame: +X forward, +Y left, +Z up, origin on the ground):
  * ARFF         6x6 crash tender (Rosenbauer Panther class, 12.2 x 3.0 x 3.6 m): forward cab
                 with a panoramic windscreen, red body with roller-shutter lockers, reflective
                 stripes, 'AIRPORT FIRE / 空港消防' lettering.  Separate objects: six wheels, the
                 roof monitor (turret, pivot at its base, nozzle along +X), the bumper turret, and
                 the two halves of the light bar (ARFF_LampRed / ARFF_LampBlue, flashed by the
                 simulator).
  * Firefighter  fire fighter in a silver proximity suit with yellow reflective bands and helmet;
                 legs and arms are separate objects (pivot at hip / shoulder) for walking.
  * Person       passenger (shirt / trousers / skin / hair materials are re-coloured per clone),
                 legs and arms separate like the fire fighter.
  * EvacSlide    two-lane escape slide, normalised: sill at (0, 0, 1), toe at (1, 0, 0), width 1;
                 the simulator scales it to each door (length, sill height, width).
Exports web/assets/arff.glb and web/assets/arff.json (dimensions, part names).
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import build_gse as G  # noqa: E402  (primitives: rbox, box, cyl, prism, quad, wheel, beacon, mirror)

FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
JFONTS = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", "/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc",
          "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf", "/usr/share/fonts/truetype/fonts-japanese-gothic.ttf"]


def make_decal():
    """Side lettering: white text on the red body colour, plus a reflective chevron band."""
    W, H = 1024, 256
    img = Image.new("RGB", (W, H), (200, 20, 30))
    d = ImageDraw.Draw(img)
    f = ImageFont.truetype(FONT, 92)
    jf = None
    for p in JFONTS:
        if os.path.exists(p):
            jf = ImageFont.truetype(p, 80)
            break
    d.text((30, 18), "AIRPORT FIRE", font=f, fill=(250, 250, 250))
    d.text((30, 140), "空港消防" if jf else "RESCUE", font=jf or ImageFont.truetype(FONT, 80), fill=(250, 250, 250))
    d.text((520, 150), "ARFF", font=ImageFont.truetype(FONT, 76), fill=(255, 214, 0))
    path = os.path.join(C.TEX_DIR, "arff_decal.png")
    img.save(path)
    # chevron band (rear): red / fluorescent yellow
    band = Image.new("RGB", (512, 128), (200, 20, 30))
    bd = ImageDraw.Draw(band)
    for k in range(-2, 10):
        x = k * 64
        bd.polygon([(x, 128), (x + 32, 128), (x + 96, 0), (x + 64, 0)], fill=(235, 225, 30))
    band.save(os.path.join(C.TEX_DIR, "arff_chevron.png"))
    return path


def materials():
    h = C.hex_color
    M = {}
    M["red"] = C.pbr_material("ARFF_Red", color=h("#c8141e"), roughness=0.35, clearcoat=0.6)
    M["white"] = C.pbr_material("ARFF_White", color=h("#eef0f2"), roughness=0.4, clearcoat=0.4)
    M["stripe"] = C.pbr_material("ARFF_Reflective", color=h("#f4ea2a"), roughness=0.3,
                                 emission=h("#f4ea2a"), emission_strength=0.08)
    M["shutter"] = C.pbr_material("ARFF_Shutter", color=h("#b9bec4"), roughness=0.3, metallic=0.8)
    M["grey"] = C.pbr_material("ARFF_Grey", color=h("#5f656b"), roughness=0.6)
    M["dark"] = C.pbr_material("ARFF_Dark", color=h("#23272b"), roughness=0.7)
    M["black"] = C.pbr_material("ARFF_Black", color=h("#101112"), roughness=0.6)
    M["rubber"] = C.pbr_material("ARFF_Rubber", color=h("#151515"), roughness=0.92)
    M["metal"] = C.pbr_material("ARFF_Metal", color=h("#a9b0b7"), roughness=0.35, metallic=0.85)
    M["chrome"] = C.pbr_material("ARFF_Chrome", color=h("#d8dde2"), roughness=0.12, metallic=1.0)
    M["glass"] = C.pbr_material("ARFF_Glass", color=h("#16212b"), roughness=0.05, metallic=0.1, clearcoat=1.0)
    M["head"] = C.pbr_material("ARFF_Headlight", color=h("#f4f4ee"), roughness=0.1,
                               emission=h("#fff6e0"), emission_strength=1.0)
    M["tail"] = C.pbr_material("ARFF_Tail", color=h("#8a0d0d"), roughness=0.2, emission=h("#ff1a10"), emission_strength=1.0)
    M["amber"] = C.pbr_material("ARFF_Amber", color=h("#e08a00"), roughness=0.2, emission=h("#ffa010"), emission_strength=1.0)
    M["lampR"] = C.pbr_material("ARFF_LampRed", color=h("#5a0505"), roughness=0.15, emission=h("#ff1e10"), emission_strength=1.0)
    M["lampB"] = C.pbr_material("ARFF_LampBlue", color=h("#05105a"), roughness=0.15, emission=h("#2a5cff"), emission_strength=1.0)
    M["decal"] = C.pbr_material("ARFF_Decal", base_tex=os.path.join(C.TEX_DIR, "arff_decal.png"), roughness=0.35, clearcoat=0.5)
    M["chevron"] = C.pbr_material("ARFF_Chevron", base_tex=os.path.join(C.TEX_DIR, "arff_chevron.png"), roughness=0.35)
    # fire fighter
    M["suit"] = C.pbr_material("FF_Suit", color=h("#b7bbc0"), roughness=0.3, metallic=0.55)
    M["band"] = C.pbr_material("FF_Band", color=h("#e6e635"), roughness=0.3, emission=h("#e6e635"), emission_strength=0.1)
    M["helmet"] = C.pbr_material("FF_Helmet", color=h("#e3b416"), roughness=0.25, clearcoat=0.8)
    M["visor"] = C.pbr_material("FF_Visor", color=h("#c9a13a"), roughness=0.05, metallic=0.9)
    M["boot"] = C.pbr_material("FF_Boot", color=h("#141414"), roughness=0.7)
    M["glove"] = C.pbr_material("FF_Glove", color=h("#3a3026"), roughness=0.8)
    M["tank"] = C.pbr_material("FF_Tank", color=h("#d8d8d0"), roughness=0.3, metallic=0.4)
    # passenger (re-coloured by the simulator)
    M["shirt"] = C.pbr_material("P_Shirt", color=h("#3a6ea5"), roughness=0.8)
    M["pants"] = C.pbr_material("P_Pants", color=h("#2d2f36"), roughness=0.8)
    M["skin"] = C.pbr_material("P_Skin", color=h("#e0b896"), roughness=0.6)
    M["hair"] = C.pbr_material("P_Hair", color=h("#1d1712"), roughness=0.7)
    M["shoe"] = C.pbr_material("P_Shoe", color=h("#1a1a1a"), roughness=0.7)
    # escape slide
    M["slide"] = C.pbr_material("Slide_Yellow", color=h("#f0b416"), roughness=0.45, double_sided=True)
    M["slidebed"] = C.pbr_material("Slide_Bed", color=h("#9aa0a6"), roughness=0.5, double_sided=True)
    return M


class Part:
    """One mesh object with its own material list."""

    def __init__(self, M, keys):
        self.M = M
        self.keys = keys
        self.mb = C.MeshBuilder()

    def m(self, k):
        if k not in self.keys:
            self.keys.append(k)
        return self.keys.index(k)

    def shift(self, d):
        d = np.asarray(d, dtype=np.float64)
        self.mb.verts = [v + d for v in self.mb.verts]

    def build(self, name, col, parent, pivot=(0, 0, 0), off=(0, 0, 0)):
        """Geometry is in model-local coordinates; the object origin goes to the pivot."""
        off = np.asarray(off, dtype=np.float64)
        self.mb.verts = [v + off for v in self.mb.verts]
        T = np.eye(4)
        T[:3, 3] = off + np.asarray(pivot, dtype=np.float64)
        ob = self.mb.build(name, [self.M[k] for k in self.keys], col=col, matrix=T)
        C.set_parent(ob, parent)
        return ob


def sphere(mb, c, r, mat, n=14, sz=1.0):
    prof = [(r * sz * math.cos(t), r * math.sin(t)) for t in np.linspace(math.pi, 0, n // 2 + 2)]
    prof = [(-a, b) for a, b in prof]
    P, UV = C.revolve(prof, n=n, axis="z", center=tuple(c))
    mb.add_grid(P, UV, outward=tuple(c), mat=mat)


# ------------------------------------------------------------------------------ crash tender
def build_truck(M, col, off):
    root = C.empty("ARFF", loc=tuple(off), col=col)
    body = Part(M, [])
    mb, m = body.mb, body.m
    L, W = 12.2, 3.0
    x0, x1 = -L / 2, L / 2
    zb = 0.95                      # underside of the body
    zt = 3.05                      # body roof
    # chassis rails, bumpers
    G.box(mb, x0 + 0.3, x1 - 0.3, -0.55, 0.55, 0.55, zb, m("dark"))
    G.box(mb, x1 - 0.1, x1 + 0.25, -W / 2 + 0.05, W / 2 - 0.05, 0.55, 0.95, m("white"))
    G.box(mb, x0 - 0.2, x0 + 0.05, -W / 2 + 0.1, W / 2 - 0.1, 0.6, 0.95, m("dark"))
    # rear body (tank / lockers): rounded box
    xc = x1 - 3.1                  # cab / body joint
    G.rbox(mb, x0, xc, -W / 2, W / 2, zb, zt, 0.12, m("red"), rt=0.15)
    # locker shutters (3 per side) with vertical ribs, reflective stripe below
    for s in (1, -1):
        y = s * W / 2
        for k, (a, b) in enumerate(((x0 + 0.4, x0 + 2.6), (x0 + 2.8, x0 + 5.0), (x0 + 5.2, xc - 0.3))):
            G.quad(mb, (a if s < 0 else b, y, zb + 0.35), (s * -1 if s > 0 else 1, 0, 0), (0, 0, 1), b - a, zt - zb - 1.05,
                   m("shutter"), off=0.01, normal=(0, s, 0))
            for r in np.arange(a + 0.25, b, 0.25):
                G.box(mb, r - 0.012, r + 0.012, y - s * 0.001, y + s * 0.02, zb + 0.35, zt - 0.7, m("metal"))
            G.box(mb, (a + b) / 2 - 0.15, (a + b) / 2 + 0.15, y, y + s * 0.04, zb + 0.38, zb + 0.45, m("chrome"))
        G.box(mb, x0 + 0.1, xc - 0.1, y - s * 0.005, y + s * 0.012, zb + 0.12, zb + 0.28, m("stripe"))
        # lettering above the lockers
        u = (0, 0, 1, 1)
        if s > 0:
            G.quad(mb, (xc - 0.6, y, zt - 0.62), (-1, 0, 0), (0, 0, 1), 2.2, 0.55, m("decal"), u, 0.012,
                   normal=(0, 1, 0))
        else:
            G.quad(mb, (xc - 2.8, y, zt - 0.62), (1, 0, 0), (0, 0, 1), 2.2, 0.55, m("decal"), u, 0.012,
                   normal=(0, -1, 0))
        # side marker lamps, grab rails, ladder at the rear
        for xm in (x0 + 0.3, xc - 0.3):
            G.box(mb, xm - 0.06, xm + 0.06, y, y + s * 0.03, zt - 0.2, zt - 0.1, m("amber"))
        G.cyl(mb, (x0 + 0.25, y - s * 0.1, zb + 0.4), (x0 + 0.25, y - s * 0.1, zt - 0.2), 0.03, m("chrome"), n=8)
    # rear: chevron, lamps, ladder
    G.quad(mb, (x0, W / 2 - 0.1, zb + 0.1), (0, -1, 0), (0, 0, 1), W - 0.2, 0.55, m("chevron"), (0, 0, 1, 1), 0.012,
           normal=(-1, 0, 0))
    for s in (1, -1):
        G.box(mb, x0 - 0.03, x0, s * (W / 2 - 0.45), s * (W / 2 - 0.15), zb + 0.75, zb + 1.0, m("tail"))
        G.box(mb, x0 - 0.03, x0, s * (W / 2 - 0.45), s * (W / 2 - 0.15), zb + 1.05, zb + 1.2, m("amber"))
    for zz in np.arange(zb + 0.3, zt, 0.32):
        G.box(mb, x0 - 0.12, x0 - 0.05, -0.35, 0.35, zz - 0.02, zz + 0.02, m("metal"))
    for s in (0.35, -0.35):
        G.box(mb, x0 - 0.12, x0 - 0.06, s - 0.03, s + 0.03, zb + 0.2, zt + 0.1, m("metal"))
    # roof: walkway, hose reels, roof rails
    G.box(mb, x0 + 0.2, xc - 0.2, -0.9, 0.9, zt, zt + 0.04, m("grey"))
    for s in (1, -1):
        G.cyl(mb, (x0 + 0.2, s * 1.35, zt + 0.25), (xc - 0.4, s * 1.35, zt + 0.25), 0.03, m("chrome"), n=8)
        for xx in (x0 + 0.3, (x0 + xc) / 2, xc - 0.5):
            G.cyl(mb, (xx, s * 1.35, zt), (xx, s * 1.35, zt + 0.25), 0.025, m("chrome"), n=6)
    G.cyl(mb, (x0 + 1.2, -0.6, zt + 0.35), (x0 + 1.2, 0.6, zt + 0.35), 0.32, m("red"), n=18)
    G.cyl(mb, (x0 + 1.2, -0.62, zt + 0.35), (x0 + 1.2, 0.62, zt + 0.35), 0.18, m("dark"), n=12)
    # cab: panoramic windscreen, low front, deep side glass
    zc = 3.3                       # cab roof
    zw = 1.75                      # belt line
    prof = [(xc, zb), (x1, zb), (x1, zw), (x1 - 0.55, zc - 0.05), (x1 - 0.7, zc), (xc, zc)]
    G.prism(mb, prof, -W / 2, W / 2, m("red"))
    d = np.array([-0.55, 0, zc - 0.1 - zw])
    Ld = float(np.linalg.norm(d))
    d /= Ld
    G.quad(mb, (x1 - 0.01, W / 2 - 0.1, zw + 0.05), (0, -1, 0), d, W - 0.2, Ld - 0.08, m("glass"), off=0.012,
           normal=np.cross(d, (0, -1, 0)))
    for s in (1, -1):
        y = s * W / 2
        pts = [(xc + 0.2, y, zw + 0.05), (x1 - 0.1, y, zw + 0.05), (x1 - 0.6, y, zc - 0.12), (xc + 0.2, y, zc - 0.12)]
        mb.add_poly([np.array(p) + np.array([0, s * 0.01, 0]) for p in pts], mat=m("glass"), normal=(0, s, 0))
        # lower door glass (see-down window) and door lines
        mb.add_poly([np.array(p) + np.array([0, s * 0.01, 0]) for p in
                     [(x1 - 1.1, y, zb + 0.35), (x1 - 0.2, y, zb + 0.35), (x1 - 0.2, y, zw - 0.2), (x1 - 1.1, y, zw - 0.2)]],
                    mat=m("glass"), normal=(0, s, 0))
        for xl in (xc + 0.1, x1 - 1.3):
            G.box(mb, xl, xl + 0.02, y - s * 0.001, y + s * 0.008, zb + 0.1, zc - 0.1, m("black"))
        G.box(mb, x1 - 2.2, x1 - 2.0, y, y + s * 0.03, zw - 0.15, zw - 0.1, m("chrome"))
        G.mirror(mb, x1 - 0.2, y, zw + 0.35, s, m)
        G.box(mb, xc + 0.25, x1 - 1.4, y - s * 0.2, y + s * 0.02, 0.45, 0.52, m("metal"))       # steps
        G.box(mb, xc + 0.25, x1 - 1.4, y - s * 0.2, y + s * 0.02, 0.8, 0.86, m("metal"))
        G.box(mb, xc + 0.1, x1 - 0.1, y - s * 0.005, y + s * 0.012, zb + 0.12, zb + 0.28, m("stripe"))
    # front face: grille, headlights, amber, emblem stripe, wipers
    G.box(mb, x1 - 0.01, x1 + 0.02, -0.7, 0.7, zb + 0.2, zw - 0.25, m("dark"))
    for zz in np.arange(zb + 0.28, zw - 0.3, 0.09):
        G.box(mb, x1 + 0.02, x1 + 0.04, -0.68, 0.68, zz - 0.012, zz + 0.012, m("chrome"))
    for s in (1, -1):
        G.box(mb, x1 - 0.01, x1 + 0.03, s * 0.85, s * 1.35, zb + 0.35, zb + 0.6, m("head"))
        G.box(mb, x1 - 0.01, x1 + 0.03, s * 0.85, s * 1.35, zb + 0.65, zb + 0.78, m("amber"))
        G.box(mb, x1 - 0.01, x1 + 0.03, s * 1.38, s * 1.46, zb + 0.35, zb + 0.78, m("lampR" if s > 0 else "lampB"))
    G.box(mb, x1 - 0.005, x1 + 0.015, -W / 2 + 0.05, W / 2 - 0.05, zw - 0.2, zw - 0.08, m("stripe"))
    for s in (0.5, -0.5):
        G.cyl(mb, (x1 - 0.03, s, zw + 0.1), (x1 - 0.3, s - 0.5, zc - 0.5), 0.014, m("black"), n=5)
    # wheel arches (dark) over 3 axles
    axles = [x1 - 1.9, x0 + 3.2, x0 + 1.5]
    for ax in axles:
        for s in (1, -1):
            G.box(mb, ax - 0.85, ax + 0.85, s * (W / 2 - 0.02), s * (W / 2 + 0.03), zb - 0.05, zb + 0.18, m("black"))
    ob = body.build("ARFF_Body", col, root, off=off)
    # wheels
    wheels = []
    for i, ax in enumerate(axles):
        for s, tag in ((1, "L"), (-1, "R")):
            name = f"ARFF_W_{i}{tag}"
            w = G.wheel(name, np.asarray(off) + np.array([ax, s * 1.22, 0.62]), 0.62, 0.55,
                        {"rubber": M["rubber"], "grey": M["grey"], "chrome": M["chrome"], "metal": M["metal"]},
                        col, root, hub="grey", side=s)
            wheels.append(dict(name=w.name, x=ax, y=s * 1.22, r=0.62, steer=i == 0))
    # light bar on the cab roof: red half (left) / blue half (right) + centre amber
    for key, s, name in (("lampR", 1, "ARFF_LampRed"), ("lampB", -1, "ARFF_LampBlue")):
        lp = Part(M, [])
        yl0, yl1 = sorted((s * 0.12, s * 1.2))
        G.rbox(lp.mb, x1 - 1.48, x1 - 1.12, yl0, yl1, zc, zc + 0.16, 0.06, lp.m(key), rt=0.05)
        lp.build(name, col, root, pivot=(x1 - 1.3, 0, zc), off=off)
    lb = Part(M, [])
    G.box(lb.mb, x1 - 1.5, x1 - 1.1, -1.25, 1.25, zc - 0.01, zc + 0.02, lb.m("dark"))
    lb.build("ARFF_LightBase", col, root, off=off)
    # roof monitor (turret): base at the cab roof rear, barrel along +X
    mon = Part(M, [])
    mm = mon.m
    G.cyl(mon.mb, (0, 0, 0), (0, 0, 0.28), 0.22, mm("white"), n=16)
    G.rbox(mon.mb, -0.25, 0.25, -0.18, 0.18, 0.28, 0.55, 0.08, mm("white"), rt=0.05)
    G.cyl(mon.mb, (0.1, 0, 0.45), (1.7, 0, 0.5), 0.09, mm("chrome"), n=14, r1=0.075)
    G.cyl(mon.mb, (1.7, 0, 0.5), (1.95, 0, 0.51), 0.075, mm("black"), n=14, r1=0.11)
    mpos = (xc + 0.8, 0, zc)
    mon.shift(mpos)
    mon.build("ARFF_Monitor", col, root, pivot=mpos, off=off)
    # bumper turret
    bt = Part(M, [])
    G.cyl(bt.mb, (0, 0, 0), (0, 0, 0.18), 0.12, bt.m("white"), n=12)
    G.cyl(bt.mb, (0.05, 0, 0.14), (0.75, 0, 0.14), 0.05, bt.m("chrome"), n=10)
    bpos = (x1 + 0.2, 0, 0.95)
    bt.shift(bpos)
    bt.build("ARFF_Bumper", col, root, pivot=bpos, off=off)
    # body mesh vertices were given in local coordinates relative to the root
    return dict(root=root.name, length=L, width=W, height=zc + 0.2, wheels=wheels,
                monitor=dict(name="ARFF_Monitor", pivot=list(mpos), tip=[1.95, 0, 0.51]),
                bumper=dict(name="ARFF_Bumper", pivot=list(bpos), tip=[0.75, 0, 0.14]),
                lamps=["ARFF_LampRed", "ARFF_LampBlue"], doors=[[x1 - 1.7, 1.55], [x1 - 1.7, -1.55], [x0 - 0.3, 0]])


# ------------------------------------------------------------------------------ people
def build_person(M, col, off, name, ff):
    """ff: fire fighter (suit / helmet / breathing apparatus), else passenger."""
    root = C.empty(name, loc=tuple(off), col=col)
    top = "suit" if ff else "shirt"
    low = "suit" if ff else "pants"
    foot = "boot" if ff else "shoe"
    hand = "glove" if ff else "skin"
    b = Part(M, [])
    m = b.m
    hip, sh = 0.92, 1.42
    # torso and pelvis
    G.rbox(b.mb, -0.13, 0.13, -0.21, 0.21, hip - 0.08, sh + 0.04, 0.09, m(top), rt=0.08)
    if ff:
        for zz in (hip + 0.08, sh - 0.2):
            G.box(b.mb, -0.14, 0.14, -0.215, 0.215, zz, zz + 0.06, m("band"))
        G.rbox(b.mb, -0.3, -0.13, -0.13, 0.13, hip + 0.1, sh - 0.02, 0.07, m("tank"), rt=0.06)     # SCBA cylinder
        G.box(b.mb, -0.14, -0.12, -0.16, 0.16, hip + 0.3, hip + 0.36, m("boot"))
    # neck, head
    G.cyl(b.mb, (0, 0, sh), (0, 0, sh + 0.1), 0.055, m("skin"), n=10)
    sphere(b.mb, (0.0, 0, sh + 0.22), 0.11, m("skin"), n=14, sz=1.15)
    if ff:
        sphere(b.mb, (-0.01, 0, sh + 0.27), 0.14, m("helmet"), n=16, sz=0.9)
        G.cyl(b.mb, (-0.01, 0, sh + 0.2), (-0.01, 0, sh + 0.22), 0.17, m("helmet"), n=16)
        G.rbox(b.mb, 0.07, 0.13, -0.1, 0.1, sh + 0.14, sh + 0.28, 0.04, m("visor"), rt=0.02)
        G.rbox(b.mb, -0.14, 0.02, -0.14, 0.14, sh + 0.05, sh + 0.2, 0.05, m("suit"), rt=0.04)     # hood
    else:
        sphere(b.mb, (-0.015, 0, sh + 0.26), 0.115, m("hair"), n=14, sz=0.85)
    b.build(name + "_Body", col, root, off=off)
    # legs (pivot at the hip) and arms (pivot at the shoulder)
    parts = {}
    for s, tag in ((1, "L"), (-1, "R")):
        lg = Part(M, [])
        yc = s * 0.1
        G.rbox(lg.mb, -0.075, 0.075, yc - 0.075, yc + 0.075, 0.1, hip, 0.05, lg.m(low), rt=0.02, bottom=True)
        G.rbox(lg.mb, -0.08, 0.16, yc - 0.065, yc + 0.065, 0.0, 0.11, 0.04, lg.m(foot), rt=0.03)
        if ff:
            G.box(lg.mb, -0.08, 0.08, yc - 0.08, yc + 0.08, 0.35, 0.4, lg.m("band"))
        piv = (0.0, yc, hip)
        ob = lg.build(f"{name}_Leg{tag}", col, root, pivot=piv, off=off)
        parts["leg" + tag] = dict(name=ob.name, pivot=list(piv))
        ar = Part(M, [])
        piv = (0.0, s * 0.25, sh - 0.02)
        G.rbox(ar.mb, -0.055, 0.055, -0.055, 0.055, -0.6, 0.0, 0.045, ar.m(top), rt=0.03, bottom=True)
        sphere(ar.mb, (0.0, 0, -0.64), 0.055, ar.m(hand), n=10)
        if ff:
            G.box(ar.mb, -0.06, 0.06, -0.06, 0.06, -0.3, -0.25, ar.m("band"))
        ar.shift(piv)
        ob = ar.build(f"{name}_Arm{tag}", col, root, pivot=piv, off=off)
        parts["arm" + tag] = dict(name=ob.name, pivot=list(piv))
    return dict(root=root.name, height=sh + 0.38, parts=parts)


# ------------------------------------------------------------------------------ escape slide
def build_slide(M, col, off):
    """Normalised two-lane slide: sill (0, 0, 1) -> toe (1, 0, 0), width 1 (y -0.5 .. 0.5)."""
    root = C.empty("EvacSlide", loc=tuple(off), col=col)
    p = Part(M, [])
    ts = np.linspace(0, 1, 24)
    # profile: steep upper part, run-out at the toe
    def prof(t):
        x = t
        z = (1 - t) ** 1.35 * (1 - 0.08 * math.sin(t * math.pi))
        return x, z
    tube = 0.07
    # bed (two lanes) - a strip slightly below the tubes' centre line
    P = np.array([[[prof(t)[0], y, prof(t)[1] + 0.01] for y in (-0.44, 0.0, 0.44)] for t in ts])
    p.mb.add_grid(P, outward=("dir", (0, 0, 1)), mat=p.m("slidebed"))
    P2 = P.copy()
    P2[..., 2] -= 0.004
    p.mb.add_grid(P2[:, ::-1], outward=("dir", (0, 0, -1)), mat=p.m("slidebed"))
    # inflated side and centre tubes along the profile
    for y, r in ((-0.47, tube), (0.47, tube), (0.0, tube * 0.45)):
        pts = [np.array([prof(t)[0], y, prof(t)[1] + r * 0.6]) for t in ts]
        for a, bb in zip(pts[:-1], pts[1:]):
            G.cyl(p.mb, a, bb, r, p.m("slide"), n=10, caps=False)
    # top girt / sill tube and toe tube
    G.cyl(p.mb, (0, -0.5, 1.02), (0, 0.5, 1.02), tube * 0.9, p.m("slide"), n=10)
    G.cyl(p.mb, (1.0, -0.5, 0.05), (1.0, 0.5, 0.05), tube * 1.1, p.m("slide"), n=10)
    # side walls (tube supports)
    for y in (-0.5, 0.5):
        for t in (0.25, 0.5, 0.72):
            x, z = prof(t)
            G.cyl(p.mb, (x, y, 0.0), (x, y, z), tube * 0.7, p.m("slide"), n=8)
    p.build("EvacSlide_Mesh", col, root, off=off)
    return dict(root=root.name)


def main():
    make_decal()
    C.reset_scene()
    col = C.collection("ARFF")
    M = materials()
    info = {}
    info["ARFF"] = build_truck(M, col, np.array([0.0, 0.0, 0.0]))
    info["Firefighter"] = build_person(M, col, np.array([0.0, 8.0, 0.0]), "Firefighter", True)
    info["Person"] = build_person(M, col, np.array([0.0, 10.0, 0.0]), "Person", False)
    info["EvacSlide"] = build_slide(M, col, np.array([0.0, 14.0, 0.0]))
    for k in info:
        bpy.data.objects[info[k]["root"]].location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    C.save_blend(os.path.join(C.OUT_DIR, "arff.blend"))
    C.export_glb(os.path.join(C.WEB_ASSETS, "arff.glb"), draco=True)
    with open(os.path.join(C.WEB_ASSETS, "arff.json"), "w") as fh:
        json.dump(info, fh, indent=1)
    polys = {}
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            k = ob.name.split("_")[0]
            polys[k] = polys.get(k, 0) + len(ob.data.polygons)
    print("ARFF polygons:", polys)


if __name__ == "__main__":
    main()
