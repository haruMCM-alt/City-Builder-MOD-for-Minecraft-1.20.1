"""
Airport ground support equipment (GSE) for the apron, built procedurally in Blender.

    blender --background --python build_gse.py        (or: python3 build_gse.py with the bpy module)

Vehicles (Blender frame: +X forward, +Y left, +Z up, origin on the ground at the vehicle centre):
  * Tug            towbarless pushback tractor (cradle opening at the front)
  * BagTractor     baggage tow tractor
  * Dolly          ULD dolly carrying an LD3 (AKE) container
  * BagCart        covered baggage cart with canvas curtains
  * BeltLoader     self-propelled belt loader (belt pivots up to the cargo sill)
  * Catering       hi-lift catering truck (scissor lift, box, fold-out front platform)
  * Fuel           aviation refueller (JET A-1 tanker, elevating rear deck)
  * FollowMe       FOLLOW ME car with a lit roof sign
  * Van            airport operations van
  * Bus            apron bus (low floor, glazed sides)

Wheels are separate objects (origin at the wheel centre, spun / steered by the simulator),
as are the moving parts (belt, scissor, catering box + platform, fuel deck, container).
Exports web/assets/gse.glb and web/assets/gse.json (dimensions, wheel list, attach points).
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

TEX = C.TEX_DIR
FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_N = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
AW, AH = 2048, 1024                  # decal atlas size

# atlas regions (pixels, top-left origin)
REG = {
    "hazard": (0, 0, 1024, 128),          # black / yellow chevrons
    "redwhite": (0, 128, 1024, 256),      # red / white stripes
    "followme": (1024, 0, 2048, 256),     # FOLLOW ME sign
    "checker": (1024, 256, 2048, 384),    # black / yellow checker band
    "fuel": (0, 256, 1024, 512),          # JET A-1 tanker side
    "catering": (0, 512, 1024, 768),      # catering box side
    "ground": (1024, 384, 2048, 512),     # ground services band (tug, tractor, loader)
    "uld": (1024, 512, 1536, 1024),       # LD3 side panel
    "uldfront": (1536, 512, 2048, 1024),  # LD3 front (door curtain)
    "canvas": (0, 768, 512, 1024),        # bag cart curtain
    "grille": (512, 768, 768, 1024),      # radiator / vent grille
    "bus": (768, 768, 1024, 1024),        # bus destination display
}


# ------------------------------------------------------------------------------ textures
def make_textures():
    img = Image.new("RGB", (AW, AH), (200, 200, 200))
    d = ImageDraw.Draw(img)
    f = lambda s, fn=FONT: ImageFont.truetype(fn, s)

    x0, y0, x1, y1 = REG["hazard"]
    d.rectangle(REG["hazard"], fill=(245, 190, 10))
    for k in range(-4, 40):
        xa = x0 + k * 64
        d.polygon([(xa, y1), (xa + 32, y1), (xa + 32 + 128, y0), (xa + 128, y0)], fill=(20, 20, 20))
    x0, y0, x1, y1 = REG["redwhite"]
    for k in range(16):
        d.rectangle((x0 + k * 64, y0, x0 + k * 64 + 31, y1), fill=(200, 20, 25))
        d.rectangle((x0 + k * 64 + 32, y0, x0 + k * 64 + 63, y1), fill=(245, 245, 245))

    # FOLLOW ME: black letters on yellow, checker frame
    x0, y0, x1, y1 = REG["followme"]
    d.rectangle(REG["followme"], fill=(255, 205, 20))
    for k in range(32):
        c = (15, 15, 15) if k % 2 == 0 else (255, 205, 20)
        d.rectangle((x0 + k * 32, y0, x0 + k * 32 + 31, y0 + 31), fill=c)
        c = (15, 15, 15) if k % 2 == 1 else (255, 205, 20)
        d.rectangle((x0 + k * 32, y1 - 32, x0 + k * 32 + 31, y1 - 1), fill=c)
    d.text(((x0 + x1) / 2, (y0 + y1) / 2), "FOLLOW ME", fill=(10, 10, 10), font=f(150), anchor="mm")

    x0, y0, x1, y1 = REG["checker"]
    for i in range(16):
        for j in range(2):
            c = (15, 15, 15) if (i + j) % 2 == 0 else (255, 205, 20)
            d.rectangle((x0 + i * 64, y0 + j * 64, x0 + i * 64 + 63, y0 + j * 64 + 63), fill=c)

    # refueller side: white with red band, JET A-1, flammable diamond
    x0, y0, x1, y1 = REG["fuel"]
    d.rectangle(REG["fuel"], fill=(236, 238, 240))
    d.rectangle((x0, y1 - 46, x1, y1 - 20), fill=(200, 25, 30))
    d.text((x0 + 60, y0 + 40), "JET A-1", fill=(200, 25, 30), font=f(120))
    d.text((x0 + 64, y0 + 170), "RJCB AVIATION FUEL SERVICES", fill=(40, 40, 50), font=f(34))
    cx, cy = x1 - 130, y0 + 110
    d.polygon([(cx, cy - 80), (cx + 80, cy), (cx, cy + 80), (cx - 80, cy)], fill=(210, 30, 30), outline=(255, 255, 255))
    d.text((cx, cy - 10), "3", fill=(255, 255, 255), font=f(64), anchor="mm")
    d.text((cx, cy + 40), "FLAMMABLE", fill=(255, 255, 255), font=f(18), anchor="mm")
    d.text((x1 - 330, y0 + 30), "NO SMOKING", fill=(200, 25, 30), font=f(30))

    # catering box
    x0, y0, x1, y1 = REG["catering"]
    d.rectangle(REG["catering"], fill=(240, 241, 243))
    d.rectangle((x0, y1 - 60, x1, y1 - 30), fill=(215, 110, 60))
    d.rectangle((x0, y1 - 26, x1, y1 - 16), fill=(40, 60, 110))
    d.text((x0 + 50, y0 + 50), "Claude", fill=(215, 110, 60), font=ImageFont.truetype(
        "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf", 110))
    d.text((x0 + 440, y0 + 88), "SKY CATERING", fill=(40, 60, 110), font=f(64))
    d.text((x0 + 54, y0 + 175), "INFLIGHT MEALS · RJCB", fill=(90, 95, 105), font=f(26))

    # ground services band
    x0, y0, x1, y1 = REG["ground"]
    d.rectangle(REG["ground"], fill=(245, 190, 10))
    d.text((x0 + 30, (y0 + y1) / 2), "RJCB GROUND SERVICES", fill=(20, 20, 20), font=f(64), anchor="lm")
    d.text((x1 - 40, (y0 + y1) / 2), "GSE-07", fill=(20, 20, 20), font=f(48), anchor="rm")

    # LD3 side: ribbed aluminium, identification
    x0, y0, x1, y1 = REG["uld"]
    d.rectangle(REG["uld"], fill=(176, 180, 186))
    for k in range(0, 512, 32):
        d.rectangle((x0 + k, y0, x0 + k + 3, y1), fill=(140, 145, 152))
        d.rectangle((x0 + k + 4, y0, x0 + k + 6, y1), fill=(205, 208, 212))
    d.rectangle((x0, y0, x1, y0 + 14), fill=(120, 124, 130))
    d.rectangle((x0, y1 - 14, x1, y1), fill=(120, 124, 130))
    d.rectangle((x0 + 60, y0 + 150, x0 + 452, y0 + 250), fill=(230, 232, 235))
    d.text((x0 + 256, y0 + 200), "AKE 21873 CA", fill=(20, 20, 20), font=f(50), anchor="mm")
    d.text((x0 + 256, y0 + 300), "MAX GROSS 1588 KG", fill=(30, 30, 30), font=f(26), anchor="mm")
    # LD3 front: canvas door with straps
    x0, y0, x1, y1 = REG["uldfront"]
    d.rectangle(REG["uldfront"], fill=(60, 70, 88))
    for k in range(4):
        yy = y0 + 70 + k * 120
        d.rectangle((x0 + 10, yy, x1 - 10, yy + 16), fill=(230, 180, 30))
    d.rectangle((x0, y0, x0 + 14, y1), fill=(150, 155, 160))
    d.rectangle((x1 - 14, y0, x1, y1), fill=(150, 155, 160))

    # canvas curtain (blue with vertical folds)
    x0, y0, x1, y1 = REG["canvas"]
    for k in range(x0, x1):
        s = 0.75 + 0.25 * math.sin((k - x0) / 512 * math.pi * 18)
        d.line((k, y0, k, y1), fill=(int(30 * s), int(70 * s), int(130 * s)))
    d.rectangle((x0, y0, x1, y0 + 20), fill=(40, 40, 45))
    d.text(((x0 + x1) / 2, (y0 + y1) / 2), "RJCB", fill=(220, 225, 235), font=f(90), anchor="mm")

    x0, y0, x1, y1 = REG["grille"]
    d.rectangle(REG["grille"], fill=(30, 32, 35))
    for k in range(y0 + 10, y1 - 10, 16):
        d.rectangle((x0 + 10, k, x1 - 10, k + 8), fill=(12, 12, 14))

    x0, y0, x1, y1 = REG["bus"]
    d.rectangle(REG["bus"], fill=(10, 10, 10))
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 - 40), "APRON", fill=(255, 170, 30), font=f(46), anchor="mm")
    d.text(((x0 + x1) / 2, (y0 + y1) / 2 + 30), "BUS 3", fill=(255, 170, 30), font=f(46), anchor="mm")
    img.save(os.path.join(TEX, "gse_atlas.png"), optimize=True)

    # emissive version: only the FOLLOW ME letters / bus display glow
    em = Image.new("RGB", (AW, AH), (0, 0, 0))
    em.paste(img.crop(REG["followme"]), REG["followme"][:2])
    em.paste(img.crop(REG["bus"]), REG["bus"][:2])
    em.save(os.path.join(TEX, "gse_atlas_em.png"), optimize=True)

    # conveyor belt (tiles along the belt)
    b = Image.new("RGB", (256, 256), (28, 28, 30))
    db = ImageDraw.Draw(b)
    for k in range(0, 256, 32):
        db.polygon([(0, k), (128, k + 14), (256, k), (256, k + 6), (128, k + 20), (0, k + 6)], fill=(55, 55, 58))
    b.save(os.path.join(TEX, "gse_belt.png"), optimize=True)


def uvr(name):
    x0, y0, x1, y1 = REG[name]
    return (x0 / AW, 1 - y1 / AH, x1 / AW, 1 - y0 / AH)     # u0, v0 (bottom), u1, v1 (top)


def tex(n):
    return os.path.join(TEX, n)


def materials():
    h = C.hex_color
    M = {}
    M["yellow"] = C.pbr_material("GSE_Yellow", color=h("#f2b705"), roughness=0.45, clearcoat=0.4)
    M["white"] = C.pbr_material("GSE_White", color=h("#eceef0"), roughness=0.4, clearcoat=0.4)
    M["blue"] = C.pbr_material("GSE_Blue", color=h("#1f4e8c"), roughness=0.45, clearcoat=0.4)
    M["orange"] = C.pbr_material("GSE_Orange", color=h("#e8641c"), roughness=0.45, clearcoat=0.3)
    M["grey"] = C.pbr_material("GSE_Grey", color=h("#6b7178"), roughness=0.6)
    M["dark"] = C.pbr_material("GSE_DarkGrey", color=h("#2b2f33"), roughness=0.7)
    M["black"] = C.pbr_material("GSE_Black", color=h("#101112"), roughness=0.6)
    M["rubber"] = C.pbr_material("GSE_Rubber", color=h("#151515"), roughness=0.92)
    M["metal"] = C.pbr_material("GSE_Metal", color=h("#a9b0b7"), roughness=0.35, metallic=0.85)
    M["chrome"] = C.pbr_material("GSE_Chrome", color=h("#d8dde2"), roughness=0.12, metallic=1.0)
    M["glass"] = C.pbr_material("GSE_Glass", color=h("#1b2631"), roughness=0.05, metallic=0.1, clearcoat=1.0)
    M["head"] = C.pbr_material("GSE_Headlight", color=h("#f4f4ee"), roughness=0.1,
                               emission=h("#fff6e0"), emission_strength=1.0)
    M["tail"] = C.pbr_material("GSE_Tail", color=h("#8a0d0d"), roughness=0.2,
                               emission=h("#ff1a10"), emission_strength=1.0)
    M["beacon"] = C.pbr_material("GSE_Beacon", color=h("#e08a00"), roughness=0.2,
                                 emission=h("#ffa010"), emission_strength=1.0)
    M["decal"] = C.pbr_material("GSE_Decal", base_tex=tex("gse_atlas.png"), roughness=0.45, clearcoat=0.3)
    M["sign"] = C.pbr_material("GSE_SignLit", base_tex=tex("gse_atlas.png"), emissive_tex=tex("gse_atlas_em.png"),
                               roughness=0.3, emission_strength=1.0)
    M["belt"] = C.pbr_material("GSE_Belt", base_tex=tex("gse_belt.png"), roughness=0.9)
    M["seat"] = C.pbr_material("GSE_Seat", color=h("#22252a"), roughness=0.85)
    return M


# ------------------------------------------------------------------------------ primitives
def rbox(mb, x0, x1, y0, y1, z0, z1, r, mat, rt=None, n=3, top=True, bottom=False, uv=1.0):
    """Box with rounded vertical edges (r) and a rounded top edge (rt)."""
    rt = r if rt is None else rt
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    hx, hy = (x1 - x0) / 2, (y1 - y0) / 2
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    r = max(min(r, hx * 0.98, hy * 0.98), 0.004)
    rt = min(rt, (z1 - z0) * 0.9)

    def ring(inset, z):
        rc = max(r - inset, 0.003)
        sh = max(inset - r, 0.0)            # beyond the corner radius: shrink the straight parts
        pts = []
        for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            ccx = cx + sx * max(hx - r - sh, 0.0)
            ccy = cy + sy * max(hy - r - sh, 0.0)
            for k in range(n + 1):
                a = math.radians(a0 + 90 * k / n)
                pts.append((ccx + rc * math.cos(a), ccy + rc * math.sin(a), z))
        pts.append(pts[0])
        return pts
    levels = [(0.0, z0), (0.0, z1 - rt)]
    if rt > 0.002:
        for th in np.linspace(0, math.pi / 2, n + 2)[1:]:
            levels.append((rt * (1 - math.cos(th)), z1 - rt + rt * math.sin(th)))
    else:
        levels[-1] = (0.0, z1)
    P = np.array([ring(i, z) for i, z in levels])
    seg = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P[0], axis=0), axis=1))]
    UV = np.stack([np.repeat(seg[None, :] * uv, len(levels), 0),
                   np.repeat(np.array([z for _, z in levels])[:, None] * uv, P.shape[1], 1)], -1)
    ctr = np.array([cx, cy, (z0 + z1) / 2])
    mb.add_grid(P, UV, outward=tuple(ctr), mat=mat)
    if top:
        mb.add_poly(P[-1, :-1], mat=mat, normal=(0, 0, 1))
    if bottom:
        mb.add_poly(P[0, :-1][::-1], mat=mat, normal=(0, 0, -1))


def box(mb, x0, x1, y0, y1, z0, z1, mat, rot=0.0):
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))
    mb.add_box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat=mat, rot_z=rot)


def basis(a):
    a = np.asarray(a, dtype=np.float64)
    a = a / np.linalg.norm(a)
    t = np.cross(a, [0, 0, 1.0])
    if np.linalg.norm(t) < 1e-6:
        t = np.cross(a, [0, 1.0, 0])
    t /= np.linalg.norm(t)
    return a, t, np.cross(a, t)


def cyl(mb, p0, p1, r, mat, n=14, caps=True, r1=None):
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    a, t, b = basis(p1 - p0)
    r1 = r if r1 is None else r1
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * t + np.sin(th)[:, None] * b
    P = np.stack([p0 + r * ring, p1 + r1 * ring])
    L = float(np.linalg.norm(p1 - p0))
    UV = np.stack(np.meshgrid(th / (2 * math.pi), [0, L], indexing="xy"), -1)
    mb.add_grid(P, UV, N=np.stack([ring, ring]), mat=mat)
    if caps:
        mb.add_poly(p1 + r1 * ring[:-1], mat=mat, normal=a)
        mb.add_poly((p0 + r * ring[:-1])[::-1], mat=mat, normal=-a)


def quad(mb, p0, ex, ey, w, h, mat, uv=None, off=0.004, normal=None):
    """Quad from corner p0 spanned by unit vectors ex (w) and ey (h); pushed out by off."""
    p0 = np.asarray(p0, dtype=np.float64)
    ex = np.asarray(ex, dtype=np.float64)
    ey = np.asarray(ey, dtype=np.float64)
    n = np.cross(ex, ey) if normal is None else np.asarray(normal, dtype=np.float64)
    n = n / np.linalg.norm(n)
    p0 = p0 + n * off
    pts = [p0, p0 + ex * w, p0 + ex * w + ey * h, p0 + ey * h]
    if uv is not None:
        u0, v0, u1, v1 = uv
        uvs = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    else:
        uvs = None
    mb.add_poly(pts, uvs=uvs, mat=mat, normal=n)


def decal_side(mb, x0, x1, z0, z1, y, side, reg, mat, off=0.006):
    """Decal on a vertical side face (side = +1 left face at +y, -1 right face at -y).
    The image reads front-to-back on the left side and back-to-front on the right (as painted)."""
    u0, v0, u1, v1 = uvr(reg)
    if side > 0:
        quad(mb, (x1, y, z0), (-1, 0, 0), (0, 0, 1), x1 - x0, z1 - z0, mat, (u0, v0, u1, v1), off, normal=(0, 1, 0))
    else:
        quad(mb, (x0, y, z0), (1, 0, 0), (0, 0, 1), x1 - x0, z1 - z0, mat, (u0, v0, u1, v1), off, normal=(0, -1, 0))


def decal_end(mb, x, y0, y1, z0, z1, front, reg, mat, off=0.006):
    u0, v0, u1, v1 = uvr(reg)
    if front:
        quad(mb, (x, y0, z0), (0, 1, 0), (0, 0, 1), y1 - y0, z1 - z0, mat, (u0, v0, u1, v1), off, normal=(1, 0, 0))
    else:
        quad(mb, (x, y1, z0), (0, -1, 0), (0, 0, 1), y1 - y0, z1 - z0, mat, (u0, v0, u1, v1), off, normal=(-1, 0, 0))


def prism(mb, prof, y0, y1, mat, uv=1.0):
    """Extrude a convex X-Z profile (counter-clockwise seen from +Y) between y0 and y1."""
    prof = [np.asarray(p, dtype=np.float64) for p in prof]
    n = len(prof)
    left = [np.array([p[0], y1, p[1]]) for p in prof]
    right = [np.array([p[0], y0, p[1]]) for p in prof]
    mb.add_poly(left, mat=mat, normal=(0, 1, 0), uvs=[(p[0] * uv, p[1] * uv) for p in prof])
    mb.add_poly(right[::-1], mat=mat, normal=(0, -1, 0), uvs=[(p[0] * uv, p[1] * uv) for p in prof[::-1]])
    ctr = np.mean(prof, axis=0)
    for i in range(n):
        a, b = prof[i], prof[(i + 1) % n]
        e = b - a
        nrm = np.array([e[1], 0, -e[0]])
        if np.dot(nrm, np.array([(a + b)[0] / 2 - ctr[0], 0, (a + b)[1] / 2 - ctr[1]])) < 0:
            nrm = -nrm
        L = float(np.linalg.norm(e))
        mb.add_poly([right[i], right[(i + 1) % n], left[(i + 1) % n], left[i]], mat=mat, normal=nrm,
                    uvs=[(0, 0), (L * uv, 0), (L * uv, (y1 - y0) * uv), (0, (y1 - y0) * uv)])


def beacon(mb, x, y, z, m, r=0.09, h=0.16):
    cyl(mb, (x, y, z), (x, y, z + 0.04), r * 1.15, m("black"), n=12)
    cyl(mb, (x, y, z + 0.04), (x, y, z + h), r, m("beacon"), n=12, r1=r * 0.8)


def mirror(mb, x, y, z, side, m):
    cyl(mb, (x, y, z), (x - 0.05, y + side * 0.28, z + 0.05), 0.015, m("black"), n=6)
    y0, y1 = sorted((y + side * 0.26, y + side * 0.31))
    box(mb, x - 0.1, x, y0, y1, z - 0.15, z + 0.12, m("black"))


# ------------------------------------------------------------------------------ wheels
def wheel(name, c, R, W, M, col, parent, hub="metal", side=1, dual=False):
    """Tyre + rim at centre c (axle along Y). side: +1 outer face towards +Y."""
    mb = C.MeshBuilder()
    c = np.asarray(c, dtype=np.float64)
    Rr = R * 0.62
    w = W / 2

    def tyre(ca):
        prof = [(-w, Rr), (-w, R * 0.86), (-w + 0.25 * w, R * 0.975), (-w + 0.45 * w, R), (w - 0.45 * w, R),
                (w - 0.25 * w, R * 0.975), (w, R * 0.86), (w, Rr)]
        P, UV = C.revolve(prof, n=28, axis="y", center=tuple(ca))
        mb.add_grid(P, UV, outward=tuple(ca), mat=0)
    if dual:
        tyre(c + np.array([0, side * W * 0.52, 0]))
        tyre(c - np.array([0, side * W * 0.52, 0]))
        face = c + np.array([0, side * (W * 0.52 + w * 0.9), 0])
    else:
        tyre(c)
        face = c + np.array([0, side * w * 0.9, 0])
    # rim face (dished annulus) + hub + wheel nuts
    th = np.linspace(0, 2 * math.pi, 29)
    ring = np.stack([np.sin(th), np.zeros_like(th), np.cos(th)], -1)
    P = np.stack([face + Rr * ring, face - np.array([0, side * 0.03, 0]) + Rr * 0.85 * ring,
                  face - np.array([0, side * 0.05, 0]) + R * 0.3 * ring])
    mb.add_grid(P, outward=("dir", (0, side, 0)), mat=1)
    hc = face - np.array([0, side * 0.05, 0])
    cyl(mb, hc, hc + np.array([0, side * 0.06, 0]), R * 0.2, 2, n=14)
    for k in range(6):
        a = k / 6 * 2 * math.pi
        p = hc + np.array([math.sin(a) * R * 0.25, 0, math.cos(a) * R * 0.25])
        cyl(mb, p, p + np.array([0, side * 0.03, 0]), R * 0.035, 2, n=6)
    # inner face closed
    back = c - np.array([0, side * (w * 0.9 + (W * 0.52 if dual else 0)), 0])
    mb.add_poly(back + Rr * ring[:-1], mat=1, normal=(0, -side, 0))
    T = np.eye(4)
    T[:3, 3] = c
    ob = mb.build(name, [M["rubber"], M[hub], M["chrome"]], col=col, matrix=T)
    C.set_parent(ob, parent)
    return ob


class Vehicle:
    def __init__(self, name, col, M, y_off):
        self.name = name
        self.col = col
        self.M = M
        self.off = np.array([0.0, y_off, 0.0])
        self.root = C.empty("GSE_" + name, loc=tuple(self.off), col=col)
        self.mb = C.MeshBuilder()
        self.wheels = []
        self.parts = {}
        self.info = dict(name=name)

    def mats(self):
        M = self.M
        return [M[k] for k in MAT_ORDER]

    def m(self, key):
        return MAT_ORDER.index(key)

    def wheel(self, tag, x, y, z, R, W, steer=False, hub="metal", dual=False):
        side = 1 if y > 0 else -1
        ob = wheel(f"{self.name}_W_{tag}", self.off + np.array([x, y, z]), R, W, self.M, self.col, self.root,
                   hub=hub, side=side, dual=dual)
        self.wheels.append(dict(name=ob.name, x=x, y=y, r=R, steer=steer))

    def part(self, key, mb, pivot, parent=None):
        """Separate moving object with its origin at pivot (vehicle-local)."""
        T = np.eye(4)
        T[:3, 3] = self.off + np.asarray(pivot, dtype=np.float64)
        # geometry was given in vehicle-local coordinates: shift to the scene position
        mb.verts = [v + self.off for v in mb.verts]
        ob = mb.build(f"{self.name}_{key}", self.mats(), col=self.col, matrix=T)
        C.set_parent(ob, parent if parent is not None else self.root)
        self.parts[key] = dict(name=ob.name, pivot=list(pivot))
        return ob

    def finish(self):
        self.mb.verts = [v + self.off for v in self.mb.verts]
        ob = self.mb.build(f"{self.name}_Body", self.mats(), col=self.col)
        C.set_parent(ob, self.root)
        self.info["wheels"] = self.wheels
        self.info["parts"] = self.parts
        self.info["root"] = self.root.name
        return self.info


MAT_ORDER = ["yellow", "white", "blue", "orange", "grey", "dark", "black", "rubber", "metal", "chrome", "glass",
             "head", "tail", "beacon", "decal", "sign", "belt", "seat"]


# ------------------------------------------------------------------------------ shared pieces
def truck_cab(v, xb, xf, W, zb, zt, body, slope=0.35, beacon_on=True, grille=True):
    """Forward-control truck cab between xb (back) and xf (front)."""
    mb, m = v.mb, v.m
    zw = zb + (zt - zb) * 0.42              # belt line
    prof = [(xb, zb), (xf, zb), (xf, zw), (xf - slope, zt - 0.06), (xf - slope - 0.1, zt), (xb, zt)]
    prism(mb, prof, -W / 2, W / 2, m(body))
    # windshield
    g = m("glass")
    d = np.array([-slope, 0, zt - 0.08 - zw])
    L = float(np.linalg.norm(d))
    d /= L
    quad(mb, (xf - 0.01, W / 2 - 0.12, zw + 0.06), (0, -1, 0), d, W - 0.24, L - 0.12, g, off=0.012,
         normal=np.cross(d, (0, -1, 0)))
    # side windows
    for s in (1, -1):
        y = s * W / 2
        x_front = xf - slope * 0.35
        pts = [(xb + 0.18, y, zw + 0.05), (x_front - 0.12, y, zw + 0.05), (xf - slope - 0.02, y, zt - 0.12),
               (xb + 0.18, y, zt - 0.12)]
        pts = [np.array(p) + np.array([0, s * 0.008, 0]) for p in pts]
        mb.add_poly(pts, mat=g, normal=(0, s, 0))
        # door shut line + handle
        box(mb, xb + 0.12, xb + 0.14, y - s * 0.001, y + s * 0.006, zb + 0.15, zt - 0.1, m("black"))
        box(mb, xf - 0.55, xf - 0.35, y, y + s * 0.03, zw - 0.12, zw - 0.08, m("chrome"))
        mirror(mb, xf - 0.1, y, zw + 0.25, s, v.m)
        # step
        box(mb, xf - 0.8, xf - 0.3, y - s * 0.15, y + s * 0.02, zb - 0.25, zb - 0.2, m("metal"))
    # front: grille, headlights, bumper, wipers
    if grille:
        u = uvr("grille")
        quad(mb, (xf, 0.45, zb + 0.15), (0, -1, 0), (0, 0, 1), 0.9, zw - zb - 0.3, m("decal"), u, 0.008,
             normal=(1, 0, 0))
    for s in (1, -1):
        box(mb, xf - 0.02, xf + 0.02, s * (W / 2 - 0.35), s * (W / 2 - 0.08), zb + 0.2, zb + 0.38, m("head"))
        box(mb, xf - 0.02, xf + 0.025, s * (W / 2 - 0.46), s * (W / 2 - 0.37), zb + 0.2, zb + 0.3, m("beacon"))
    box(mb, xf - 0.05, xf + 0.18, -W / 2 + 0.02, W / 2 - 0.02, zb - 0.1, zb + 0.14, m("black"))
    for s in (0.35, -0.35):
        cyl(mb, (xf - 0.02, s, zw + 0.1), (xf - slope * 0.5, s - 0.45, zt - 0.3), 0.012, m("black"), n=5)
    # roof marker lights + beacon
    for s in (1, -1):
        box(mb, xf - slope - 0.08, xf - slope - 0.02, s * (W / 2 - 0.25), s * (W / 2 - 0.12), zt - 0.02, zt + 0.03,
            m("beacon"))
    if beacon_on:
        beacon(mb, (xb + xf - slope) / 2, 0, zt, v.m)


# ------------------------------------------------------------------------------ vehicles
def build_tug(v):
    mb, m = v.mb, v.m
    L, W = 8.6, 4.0
    x0, x1 = -L / 2, L / 2
    # side pods and rear crossmember (the front between the pods is open for the nose wheel)
    for s in (1, -1):
        rbox(mb, x0, x1, s * 0.95 if s > 0 else -2.0, 2.0 if s > 0 else -0.95, 0.55, 1.35, 0.18, m("yellow"), rt=0.08)
        box(mb, x0 + 0.3, x1 - 0.3, s * 0.95 - s * 0.02, s * 0.95, 0.35, 0.6, m("dark"))
        decal_end(mb, x1, (0.95 if s > 0 else -2.0) + 0.05, (2.0 if s > 0 else -0.95) - 0.05, 0.7, 1.2, True,
                  "hazard", m("decal"))
        decal_side(mb, x0 + 2.5, x1 - 1.5, 0.75, 1.15, s * 2.0, s, "ground", m("decal"))
        # front lamps on the pod noses
        box(mb, x1 - 0.02, x1 + 0.03, s * 1.55, s * 1.85, 1.15, 1.28, m("head"))
        box(mb, x0 - 0.03, x0 + 0.02, s * 1.6, s * 1.85, 1.15, 1.25, m("tail"))
        # push pads
        box(mb, x1, x1 + 0.12, s * 1.1, s * 1.85, 0.6, 1.0, m("rubber"))
    rbox(mb, x0, x0 + 2.0, -1.0, 1.0, 0.55, 1.3, 0.1, m("yellow"), rt=0.06)
    decal_end(mb, x0, -1.9, 1.9, 0.62, 0.9, False, "hazard", m("decal"))
    # engine hood on the right rear with grille
    rbox(mb, x0 + 0.15, x0 + 2.2, -1.95, -1.0, 1.3, 1.85, 0.12, m("yellow"), rt=0.1)
    quad(mb, (x0 + 0.5, -1.95, 1.4), (1, 0, 0), (0, 0, 1), 1.2, 0.35, m("decal"), uvr("grille"), 0.008,
         normal=(0, -1, 0))
    cyl(mb, (x0 + 0.6, -1.4, 1.85), (x0 + 0.6, -1.4, 2.35), 0.06, m("black"))
    # driver cab on the left rear
    cz0, cz1 = 1.3, 2.1
    rbox(mb, x0 + 0.1, x0 + 2.3, 0.95, 1.98, cz0, cz0 + 0.35, 0.1, m("yellow"), rt=0.02)
    for (xa, ya) in ((x0 + 0.15, 1.0), (x0 + 0.15, 1.93), (x0 + 2.25, 1.0), (x0 + 2.25, 1.93)):
        box(mb, xa - 0.05, xa + 0.05, ya - 0.05, ya + 0.05, cz0 + 0.3, cz1, m("black"))
    rbox(mb, x0 + 0.05, x0 + 2.35, 0.9, 2.02, cz1 - 0.08, cz1 + 0.08, 0.1, m("yellow"), rt=0.05)
    g = m("glass")
    quad(mb, (x0 + 2.25, 1.9, cz0 + 0.38), (0, -1, 0), (0, 0, 1), 0.85, cz1 - cz0 - 0.5, g, off=0.02, normal=(1, 0, 0))
    quad(mb, (x0 + 0.15, 1.05, cz0 + 0.38), (0, 1, 0), (0, 0, 1), 0.85, cz1 - cz0 - 0.5, g, off=0.02, normal=(-1, 0, 0))
    quad(mb, (x0 + 0.2, 1.98, cz0 + 0.38), (1, 0, 0), (0, 0, 1), 2.0, cz1 - cz0 - 0.5, g, off=0.01, normal=(0, 1, 0))
    quad(mb, (x0 + 2.2, 0.95, cz0 + 0.38), (-1, 0, 0), (0, 0, 1), 2.0, cz1 - cz0 - 0.5, g, off=0.01,
         normal=(0, -1, 0))
    box(mb, x0 + 0.8, x0 + 1.4, 1.2, 1.7, cz0 + 0.35, cz0 + 0.8, m("seat"))
    beacon(mb, x0 + 1.2, 1.45, cz1 + 0.08, v.m)
    beacon(mb, x0 + 1.2, -1.45, 1.85, v.m)
    # nose-wheel cradle: platform, clamp arms, entry ramp
    box(mb, -1.7, 3.2, -0.85, 0.85, 0.22, 0.4, m("dark"))
    for s in (1, -1):
        box(mb, -0.4, 1.6, s * 0.55, s * 0.9, 0.4, 0.95, m("yellow"))
        box(mb, 0.0, 0.3, s * 0.2, s * 0.6, 0.4, 0.75, m("metal"))
    prism(mb, [(3.2, 0.22), (4.2, 0.08), (4.2, 0.12), (3.2, 0.4)], -0.8, 0.8, m("dark"))
    decal_end(mb, -1.7, -0.84, 0.84, 0.4, 1.3, True, "hazard", m("decal"), off=0.01)
    for (tag, x, y) in (("FL", 2.9, 1.65), ("FR", 2.9, -1.65), ("RL", -2.9, 1.65), ("RR", -2.9, -1.65)):
        v.wheel(tag, x, y, 0.55, 0.55, 0.5, steer=x > 0, hub="grey")
    v.info.update(length=L, width=W, height=cz1 + 0.25, wheelbase=5.8, cradle=[0.6, 0.0], color="yellow")


def build_bag_tractor(v):
    mb, m = v.mb, v.m
    L, W = 3.2, 1.55
    rbox(mb, -1.6, 1.6, -W / 2, W / 2, 0.32, 0.95, 0.12, m("blue"), rt=0.05)
    rbox(mb, 0.35, 1.62, -W / 2 + 0.05, W / 2 - 0.05, 0.9, 1.15, 0.15, m("blue"), rt=0.1)
    quad(mb, (1.6, 0.4, 0.45), (0, -1, 0), (0, 0, 1), 0.8, 0.4, m("decal"), uvr("grille"), 0.01, normal=(1, 0, 0))
    for s in (1, -1):
        box(mb, 1.58, 1.64, s * 0.5, s * 0.7, 0.95, 1.08, m("head"))
        box(mb, -1.64, -1.58, s * 0.55, s * 0.7, 0.75, 0.85, m("tail"))
        decal_side(mb, -1.4, 0.3, 0.45, 0.8, s * W / 2, s, "ground", m("decal"))
    # cab frame (open sides), roof, windshield, rear window
    for (x, y) in ((0.38, 0.72), (0.38, -0.72), (-1.45, 0.72), (-1.45, -0.72)):
        box(mb, x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0.95, 2.0, m("black"))
    rbox(mb, -1.55, 0.5, -0.8, 0.8, 1.98, 2.08, 0.08, m("white"), rt=0.04)
    quad(mb, (0.41, 0.69, 1.2), (0, -1, 0), (0, 0, 1), 1.38, 0.72, m("glass"), off=0.0, normal=(1, 0, 0))
    quad(mb, (-1.48, -0.69, 1.3), (0, 1, 0), (0, 0, 1), 1.38, 0.6, m("glass"), off=0.0, normal=(-1, 0, 0))
    box(mb, -0.9, -0.4, -0.3, 0.3, 0.95, 1.4, m("seat"))
    box(mb, -1.0, -0.9, -0.3, 0.3, 1.2, 1.7, m("seat"))
    cyl(mb, (0.1, 0.0, 1.05), (-0.1, 0.0, 1.35), 0.02, m("black"), n=6)
    cyl(mb, (-0.12, 0.0, 1.36), (-0.14, 0.0, 1.38), 0.17, m("black"), n=16)
    beacon(mb, -0.5, 0.0, 2.08, v.m)
    box(mb, -1.75, -1.6, -0.1, 0.1, 0.35, 0.5, m("metal"))       # tow hitch
    for (tag, x, y) in (("FL", 1.0, 0.62), ("FR", 1.0, -0.62), ("RL", -1.0, 0.62), ("RR", -1.0, -0.62)):
        v.wheel(tag, x, y, 0.3, 0.3, 0.24, steer=x > 0, hub="grey")
    v.info.update(length=L, width=W, height=2.1, wheelbase=2.0, hitchRear=[-1.72, 0.4], color="blue")


def uld_mesh(mb, m, x0, z0):
    """LD3 (AKE): 1.56 m deep (x) x 1.53 m base / 2.01 m top width, 1.63 m high, contour on -y."""
    D, Hh = 1.53, 1.63
    prof = [(0.765, 0.0), (0.765, Hh), (-1.245, Hh), (-1.245, 1.0), (-0.765, 0.0)]      # (y, z)
    xa, xb = x0 - D / 2, x0 + D / 2
    pts0 = [np.array([xa, y, z0 + z]) for y, z in prof]
    pts1 = [np.array([xb, y, z0 + z]) for y, z in prof]
    u = uvr("uldfront")
    uvs = [((y + 1.245) / 2.01, z / Hh) for y, z in prof]
    uvs = [(u[0] + (u[2] - u[0]) * a, u[1] + (u[3] - u[1]) * b) for a, b in uvs]
    mb.add_poly(pts1, mat=m("decal"), normal=(1, 0, 0), uvs=uvs)
    mb.add_poly(pts0[::-1], mat=m("decal"), normal=(-1, 0, 0), uvs=uvs[::-1])
    us = uvr("uld")
    for i in range(len(prof)):
        a, b = prof[i], prof[(i + 1) % len(prof)]
        e = np.array([0, b[0] - a[0], b[1] - a[1]])
        nrm = np.array([0, e[2], -e[1]])
        mid = np.array([0, (a[0] + b[0]) / 2 + 0.24, (a[1] + b[1]) / 2 - Hh / 2])
        if np.dot(nrm, mid) < 0:
            nrm = -nrm
        mb.add_poly([pts0[i], pts0[(i + 1) % 5], pts1[(i + 1) % 5], pts1[i]], mat=m("decal"), normal=nrm,
                    uvs=[(us[0], us[1]), (us[0], us[3]), (us[2], us[3]), (us[2], us[1])])
    # base rails
    box(mb, xa - 0.02, xb + 0.02, -0.785, 0.785, z0 - 0.03, z0 + 0.03, m("metal"))


def build_dolly(v):
    mb, m = v.mb, v.m
    L, W = 3.0, 1.9
    box(mb, -1.3, 1.3, -W / 2, W / 2, 0.38, 0.5, m("grey"))
    box(mb, -1.3, 1.3, -0.3, 0.3, 0.26, 0.38, m("dark"))
    for k in range(11):
        x = -1.2 + k * 0.24
        cyl(mb, (x, -0.85, 0.53), (x, 0.85, 0.53), 0.035, m("metal"), n=8)
    for s in (1, -1):
        box(mb, -1.3, 1.3, s * 0.9, s * 0.95, 0.5, 0.62, m("yellow"))
        for x in (-1.25, 1.25):
            box(mb, x - 0.03, x + 0.03, s * 0.88, s * 0.95, 0.5, 0.75, m("yellow"))
        box(mb, -1.32, -1.28, s * 0.4, s * 0.9, 0.3, 0.45, m("tail"))
    # drawbar (towing eye at the front)
    cyl(mb, (1.1, 0.0, 0.35), (2.55, 0.0, 0.42), 0.04, m("dark"), n=8)
    cyl(mb, (2.55, -0.08, 0.42), (2.55, 0.08, 0.42), 0.07, m("metal"), n=10)
    box(mb, -1.48, -1.3, -0.1, 0.1, 0.32, 0.46, m("metal"))       # rear hitch
    for (tag, x, y) in (("FL", 0.95, 0.7), ("FR", 0.95, -0.7), ("RL", -0.95, 0.7), ("RR", -0.95, -0.7)):
        v.wheel(tag, x, y, 0.2, 0.2, 0.15, steer=x > 0, hub="grey")
    cm = C.MeshBuilder()
    uld_mesh(cm, m, 0.0, 0.575)
    v.part("ULD", cm, (0.0, 0.0, 0.575))
    v.info.update(length=L, width=W, height=2.2, wheelbase=1.9, hitchFront=[2.6, 0.42], hitchRear=[-1.45, 0.4],
                  towed=True, color="grey")


def build_bag_cart(v):
    mb, m = v.mb, v.m
    L, W = 2.8, 1.55
    box(mb, -1.35, 1.35, -W / 2, W / 2, 0.4, 0.5, m("grey"))
    for (x, y) in ((-1.33, 0.75), (-1.33, -0.75), (1.33, 0.75), (1.33, -0.75), (0.0, 0.75), (0.0, -0.75)):
        box(mb, x - 0.03, x + 0.03, y - 0.03, y + 0.03, 0.5, 1.85, m("metal"))
    rbox(mb, -1.42, 1.42, -0.82, 0.82, 1.83, 1.95, 0.1, m("white"), rt=0.06)
    u = uvr("canvas")
    for s in (1, -1):
        decal_side(mb, -1.3, 1.3, 0.55, 1.8, s * 0.77, s, "canvas", m("decal"), off=0.0)
        box(mb, -1.35, -1.31, s * 0.4, s * 0.75, 0.3, 0.42, m("tail"))
    for x in (-1.35, 1.35):
        for z in (0.9, 1.3):
            cyl(mb, (x, -0.75, z), (x, 0.75, z), 0.02, m("metal"), n=6)
    # a few bags visible through the open ends
    rng = np.random.default_rng(3)
    for k in range(9):
        x = -1.0 + (k % 3) * 0.75 + rng.uniform(-0.1, 0.1)
        y = -0.45 + (k // 3) * 0.45
        hh = rng.uniform(0.35, 0.6)
        col = ["black", "blue", "dark", "orange", "grey"][k % 5]
        rbox(mb, x - 0.3, x + 0.3, y - 0.18, y + 0.18, 0.5, 0.5 + hh, 0.06, m(col), rt=0.05)
    cyl(mb, (1.2, 0.0, 0.35), (2.45, 0.0, 0.42), 0.035, m("dark"), n=8)
    cyl(mb, (2.45, -0.07, 0.42), (2.45, 0.07, 0.42), 0.06, m("metal"), n=10)
    box(mb, -1.52, -1.35, -0.1, 0.1, 0.32, 0.46, m("metal"))
    for (tag, x, y) in (("FL", 0.95, 0.62), ("FR", 0.95, -0.62), ("RL", -0.95, 0.62), ("RR", -0.95, -0.62)):
        v.wheel(tag, x, y, 0.2, 0.2, 0.14, steer=x > 0, hub="grey")
    v.info.update(length=L, width=W, height=1.95, wheelbase=1.9, hitchFront=[2.5, 0.42], hitchRear=[-1.5, 0.4],
                  towed=True, color="white")


def build_belt_loader(v):
    mb, m = v.mb, v.m
    L, W = 7.6, 2.1
    rbox(mb, -3.8, 3.8, -W / 2, W / 2, 0.32, 0.9, 0.12, m("white"), rt=0.05)
    for s in (1, -1):
        decal_side(mb, -3.6, 3.6, 0.36, 0.52, s * W / 2, s, "hazard", m("decal"))
        box(mb, 3.78, 3.83, s * 0.7, s * 0.95, 0.6, 0.75, m("head"))
        box(mb, -3.83, -3.78, s * 0.7, s * 0.95, 0.6, 0.72, m("tail"))
    # driver station on the left side, just behind the middle
    rbox(mb, -1.0, 0.4, 0.3, 1.05, 0.9, 1.2, 0.08, m("white"), rt=0.04)
    box(mb, -0.8, -0.3, 0.45, 0.95, 1.2, 1.55, m("seat"))
    box(mb, -0.85, -0.75, 0.45, 0.95, 1.35, 1.9, m("seat"))
    cyl(mb, (0.15, 0.7, 1.2), (0.0, 0.7, 1.5), 0.02, m("black"), n=6)
    cyl(mb, (-0.02, 0.7, 1.5), (-0.04, 0.7, 1.52), 0.16, m("black"), n=16)
    quad(mb, (0.35, 1.02, 1.2), (0, -1, 0), (0, 0, 1), 0.7, 0.55, m("glass"), off=0.0, normal=(1, 0, 0))
    beacon(mb, -1.8, -0.8, 0.9, v.m)
    # hydraulic rams (static, below the belt)
    for y in (0.3, -0.3):
        cyl(mb, (1.6, y, 0.9), (1.2, y, 1.25), 0.06, m("chrome"), n=8)
    # belt: pivots about its rear end (x = -3.5, z = 1.05); simulator raises the front
    bm = C.MeshBuilder()
    x0, x1 = -3.9, 3.95
    bw = 0.45
    box(bm, x0, x1, -bw - 0.08, bw + 0.08, 0.95, 1.1, m("white"))
    quad(bm, (x0 + 0.05, -bw, 1.1), (1, 0, 0), (0, 1, 0), x1 - x0 - 0.1, 2 * bw, m("belt"),
         (0, 0, (x1 - x0) / 0.8, 1), off=0.01, normal=(0, 0, 1))
    for s in (1, -1):
        box(bm, x0, x1, s * (bw + 0.02), s * (bw + 0.1), 1.1, 1.22, m("white"))
        for k in range(5):
            x = x0 + 0.5 + k * 1.7
            cyl(bm, (x, s * (bw + 0.06), 1.2), (x, s * (bw + 0.06), 1.95), 0.022, m("yellow"), n=6)
        cyl(bm, (x0 + 0.5, s * (bw + 0.06), 1.95), (x1 - 0.4, s * (bw + 0.06), 1.95), 0.025, m("yellow"), n=6)
    box(bm, x1 - 0.1, x1 + 0.12, -bw - 0.1, bw + 0.1, 0.95, 1.25, m("rubber"))
    v.part("Belt", bm, (-3.5, 0.0, 1.05))
    for (tag, x, y) in (("FL", 2.6, 0.82), ("FR", 2.6, -0.82), ("RL", -2.6, 0.82), ("RR", -2.6, -0.82)):
        v.wheel(tag, x, y, 0.32, 0.32, 0.26, steer=x > 0)
    v.info.update(length=L, width=W, height=2.0, wheelbase=5.2, beltPivot=[-3.5, 1.05], beltLen=7.45,
                  color="white")


def build_catering(v):
    mb, m = v.mb, v.m
    L, W = 9.0, 2.5
    truck_cab(v, 2.4, 4.5, W, 0.75, 2.75, "white")
    for s in (1, -1):
        decal_side(mb, 2.5, 4.3, 0.85, 1.1, s * W / 2, s, "redwhite", m("decal"))
    # chassis, fenders, fuel tank, stabilisers
    box(mb, -4.5, 2.4, -0.5, 0.5, 0.6, 0.95, m("dark"))
    for s in (1, -1):
        box(mb, -4.5, 2.4, s * 0.9, s * 1.24, 0.6, 1.0, m("dark"))
        box(mb, -0.8, 0.4, s * 0.95, s * 1.2, 0.4, 0.75, m("metal"))
        for x in (-4.2, 1.8):
            cyl(mb, (x, s * 1.3, 0.8), (x, s * 1.3, 0.1), 0.06, m("chrome"), n=8)
            box(mb, x - 0.15, x + 0.15, s * 1.15, s * 1.45, 0.02, 0.1, m("black"))
        box(mb, -4.55, -4.5, s * 0.8, s * 1.1, 0.7, 0.9, m("tail"))
    decal_end(mb, -4.5, -1.2, 1.2, 0.6, 0.95, False, "redwhite", m("decal"))
    # scissor lift: collapsed height 0.6 (z 1.0 .. 1.6); simulator scales it in z
    sm = C.MeshBuilder()
    for s in (1, -1):
        y = s * 0.95
        cyl(sm, (-3.9, y, 1.02), (1.8, y, 1.58), 0.07, m("grey"), n=6)
        cyl(sm, (-3.9, y, 1.58), (1.8, y, 1.02), 0.07, m("grey"), n=6)
    cyl(sm, (-1.05, -1.0, 1.3), (-1.05, 1.0, 1.3), 0.05, m("metal"), n=6)
    v.part("Scissor", sm, (0.0, 0.0, 1.0))
    # box body (moves up); platform folds out from its front
    bx = C.MeshBuilder()
    z0, z1 = 1.6, 4.25
    rbox(bx, -4.5, 2.25, -W / 2, W / 2, z0, z1, 0.08, m("white"), rt=0.08)
    for s in (1, -1):
        decal_side(bx, -4.3, 1.9, z0 + 0.3, z1 - 0.4, s * W / 2, s, "catering", m("decal"))
        box(bx, -4.4, 2.1, s * W / 2 - s * 0.001, s * W / 2 + s * 0.01, z0 + 0.05, z0 + 0.12, m("orange"))
    decal_end(bx, -4.5, -1.1, 1.1, z0 + 0.05, z0 + 0.3, False, "redwhite", m("decal"))
    # front door (roller shutter) and marker lights
    box(bx, 2.25, 2.27, -0.9, 0.9, z0 + 0.1, z1 - 0.2, m("grey"))
    for s in (1, -1):
        box(bx, 2.24, 2.28, s * 1.1, s * 1.2, z1 - 0.15, z1 - 0.05, m("beacon"))
    beacon(bx, -4.1, 0.9, z1, v.m)
    beacon(bx, -4.1, -0.9, z1, v.m)
    box_ob = v.part("Box", bx, (0.0, 0.0, z0))
    pm = C.MeshBuilder()
    px0, px1 = 2.25, 4.35
    box(pm, px0, px1, -1.1, 1.1, z0, z0 + 0.12, m("metal"))
    box(pm, px1 - 0.04, px1 + 0.12, -1.1, 1.1, z0 - 0.02, z0 + 0.14, m("rubber"))
    for s in (1, -1):
        for k in range(4):
            x = px0 + 0.15 + k * 0.6
            cyl(pm, (x, s * 1.05, z0 + 0.12), (x, s * 1.05, z0 + 1.1), 0.022, m("yellow"), n=6)
        cyl(pm, (px0 + 0.15, s * 1.05, z0 + 1.1), (px1 - 0.2, s * 1.05, z0 + 1.1), 0.025, m("yellow"), n=6)
    v.part("Platform", pm, (px0, 0.0, z0 + 0.06), parent=box_ob)
    for (tag, x, y) in (("FL", 3.3, 1.02), ("FR", 3.3, -1.02)):
        v.wheel(tag, x, y, 0.5, 0.5, 0.32, steer=True)
    for (tag, x, y) in (("RL", -2.6, 0.92), ("RR", -2.6, -0.92)):
        v.wheel(tag, x, y, 0.5, 0.5, 0.26, dual=True)
    v.info.update(length=L, width=W, height=4.4, wheelbase=5.9, boxFloor=z0, platformTip=4.47, color="white")


def build_fuel(v):
    mb, m = v.mb, v.m
    L, W = 10.5, 2.55
    truck_cab(v, 3.15, 5.25, W, 0.8, 2.85, "white")
    for s in (1, -1):
        decal_side(mb, 3.25, 5.0, 0.9, 1.15, s * W / 2, s, "redwhite", m("decal"))
    box(mb, -5.2, 3.15, -0.5, 0.5, 0.6, 0.98, m("dark"))
    # elliptical tank with domed ends
    xs0, xs1 = -4.6, 2.95
    zc, ay, az = 2.1, 1.22, 1.08
    th = np.linspace(0, 2 * math.pi, 41)
    ring = np.stack([np.zeros_like(th), ay * np.cos(th), az * np.sin(th)], -1)
    P = np.stack([np.array([x, 0, zc]) + ring for x in (xs0, xs1)])
    UV = np.stack(np.meshgrid(th / (2 * math.pi), [0, 1], indexing="xy"), -1)
    mb.add_grid(P, UV, outward=(0.0, 0.0, zc), mat=m("white"))
    for x, sgn in ((xs1, 1), (xs0, -1)):
        prof = [(0.0, 1.0), (0.12, 0.94), (0.22, 0.75), (0.28, 0.4), (0.3, 0.03)]
        rings = [np.array([x + sgn * a, 0, zc]) + ring * r for a, r in prof]
        mb.add_grid(np.stack(rings), outward=(x - sgn * 1.0, 0.0, zc), mat=m("white"))
    for s in (1, -1):
        decal_side(mb, -4.3, 2.6, zc - 0.55, zc + 0.35, s * (ay + 0.004), s, "fuel", m("decal"), off=0.0)
    # top walkway, folding rails, manholes, ladder
    box(mb, -4.3, 2.6, -0.35, 0.35, zc + az - 0.02, zc + az + 0.04, m("metal"))
    for x in (-3.0, -0.8, 1.4):
        cyl(mb, (x, 0, zc + az), (x, 0, zc + az + 0.12), 0.28, m("metal"), n=14)
    for s in (1, -1):
        cyl(mb, (-4.2, s * 0.4, zc + az + 0.05), (2.5, s * 0.4, zc + az + 0.05), 0.02, m("yellow"), n=6)
    for k in range(6):
        z = 0.5 + k * 0.33
        box(mb, -5.0, -4.95, -0.3, 0.3, z, z + 0.03, m("metal"))
    for s in (1, -1):
        cyl(mb, (-4.98, s * 0.3, 0.4), (-4.98, s * 0.3, zc + az + 0.2), 0.02, m("metal"), n=6)
        # side cabinets with hose reels
        box(mb, -2.2, 1.8, s * 0.95, s * 1.26, 0.55, 1.05, m("grey"))
        box(mb, -5.25, -5.2, s * 0.8, s * 1.1, 0.75, 0.95, m("tail"))
    cyl(mb, (-4.9, -1.0, 1.0), (-4.9, 1.0, 1.0), 0.42, m("dark"), n=18)
    cyl(mb, (-4.9, -0.8, 1.0), (-4.9, 0.8, 1.0), 0.45, m("black"), n=18)
    # elevating rear deck (lifts to reach the wing coupling)
    dm = C.MeshBuilder()
    box(dm, -5.9, -5.25, -1.1, 1.1, 1.05, 1.18, m("metal"))
    for s in (1, -1):
        cyl(dm, (-5.85, s * 1.05, 1.18), (-5.85, s * 1.05, 2.15), 0.022, m("yellow"), n=6)
        cyl(dm, (-5.3, s * 1.05, 1.18), (-5.3, s * 1.05, 2.15), 0.022, m("yellow"), n=6)
        cyl(dm, (-5.85, s * 1.05, 2.15), (-5.3, s * 1.05, 2.15), 0.025, m("yellow"), n=6)
    cyl(dm, (-5.85, -1.05, 2.15), (-5.85, 1.05, 2.15), 0.025, m("yellow"), n=6)
    cyl(dm, (-5.6, 0.6, 1.18), (-5.6, 0.6, 1.9), 0.09, m("black"), n=10)          # hose + nozzle stowed
    v.part("Deck", dm, (-5.6, 0.0, 1.1))
    for (tag, x, y) in (("FL", 4.2, 1.03), ("FR", 4.2, -1.03)):
        v.wheel(tag, x, y, 0.52, 0.52, 0.34, steer=True)
    for (tag, x) in (("R1", -2.4), ("R2", -3.75)):
        for s, ss in ((1, "L"), (-1, "R")):
            v.wheel(tag + ss, x, s * 0.95, 0.52, 0.52, 0.26, dual=True)
    v.info.update(length=L + 0.65, width=W, height=zc + az + 0.3, wheelbase=7.3, color="white",
                  frontX=5.3, rearX=-5.9)


def build_followme(v):
    mb, m = v.mb, v.m
    L, W = 4.9, 1.9
    # lower body with a raked nose, cabin greenhouse, pickup bed
    prism(mb, [(-2.45, 0.35), (2.2, 0.35), (2.45, 0.55), (2.4, 0.95), (1.2, 1.05), (-2.45, 1.05)], -W / 2, W / 2,
          m("yellow"))
    prism(mb, [(-0.9, 1.05), (1.2, 1.05), (0.45, 1.72), (-0.8, 1.74)], -W / 2 + 0.06, W / 2 - 0.06, m("yellow"))
    g = m("glass")
    d = np.array([-0.75, 0, 0.67])
    d /= np.linalg.norm(d)
    quad(mb, (1.12, 0.8, 1.09), (0, -1, 0), d, 1.6, 0.86, g, off=0.012, normal=np.cross(d, (0, -1, 0)))
    for s in (1, -1):
        y = s * (W / 2 - 0.06)
        mb.add_poly([np.array(p) + np.array([0, s * 0.008, 0]) for p in
                     [(-0.75, y, 1.12), (1.05, y, 1.12), (0.44, y, 1.66), (-0.72, y, 1.68)]], mat=g, normal=(0, s, 0))
        box(mb, 0.2, 0.22, y, y + s * 0.01, 1.1, 1.68, m("black"))
        decal_side(mb, -2.35, 2.2, 0.55, 0.8, s * W / 2, s, "checker", m("decal"))
        box(mb, 2.38, 2.44, s * 0.55, s * 0.85, 0.75, 0.88, m("head"))
        box(mb, -2.47, -2.43, s * 0.6, s * 0.85, 0.75, 0.95, m("tail"))
        mirror(mb, 1.1, s * (W / 2), 1.2, s, v.m)
    box(mb, 2.3, 2.5, -0.9, 0.9, 0.32, 0.5, m("black"))
    box(mb, -2.55, -2.4, -0.9, 0.9, 0.32, 0.5, m("black"))
    box(mb, -2.35, -0.95, -0.8, 0.8, 1.0, 1.06, m("dark"))            # bed floor
    # FOLLOW ME sign box with beacons
    box(mb, -0.35, 0.35, -0.72, 0.72, 1.74, 1.8, m("black"))
    box(mb, -0.18, 0.18, -0.7, 0.7, 1.8, 2.25, m("yellow"))
    u = uvr("followme")
    quad(mb, (0.18, -0.7, 1.82), (0, 1, 0), (0, 0, 1), 1.4, 0.41, m("sign"), u, 0.004, normal=(1, 0, 0))
    quad(mb, (-0.18, 0.7, 1.82), (0, -1, 0), (0, 0, 1), 1.4, 0.41, m("sign"), u, 0.004, normal=(-1, 0, 0))
    beacon(mb, 0.0, 0.78, 1.8, v.m)
    beacon(mb, 0.0, -0.78, 1.8, v.m)
    for (tag, x, y) in (("FL", 1.5, 0.8), ("FR", 1.5, -0.8), ("RL", -1.6, 0.8), ("RR", -1.6, -0.8)):
        v.wheel(tag, x, y, 0.37, 0.37, 0.25, steer=x > 0)
    v.info.update(length=L, width=W, height=2.3, wheelbase=3.1, color="yellow")


def build_van(v):
    mb, m = v.mb, v.m
    L, W = 5.2, 2.0
    prism(mb, [(-2.6, 0.35), (2.35, 0.35), (2.6, 0.6), (2.55, 1.05), (1.7, 1.3), (1.0, 2.25), (-2.6, 2.25)],
          -W / 2, W / 2, m("white"))
    g = m("glass")
    d = np.array([-0.7, 0, 0.95])
    d /= np.linalg.norm(d)
    quad(mb, (1.66, 0.85, 1.33), (0, -1, 0), d, 1.7, 0.95, g, off=0.012, normal=np.cross(d, (0, -1, 0)))
    for s in (1, -1):
        y = s * W / 2
        mb.add_poly([np.array(p) + np.array([0, s * 0.008, 0]) for p in
                     [(0.3, y, 1.3), (1.6, y, 1.3), (1.05, y, 2.08), (0.3, y, 2.08)]], mat=g, normal=(0, s, 0))
        mb.add_poly([np.array(p) + np.array([0, s * 0.008, 0]) for p in
                     [(-2.3, y, 1.4), (-0.1, y, 1.4), (-0.1, y, 2.05), (-2.3, y, 2.05)]], mat=g, normal=(0, s, 0))
        box(mb, -2.6, 2.4, y - s * 0.001, y + s * 0.006, 0.8, 0.95, m("orange"))
        box(mb, 2.5, 2.58, s * 0.6, s * 0.9, 0.75, 0.92, m("head"))
        box(mb, -2.63, -2.59, s * 0.7, s * 0.95, 0.9, 1.3, m("tail"))
        mirror(mb, 1.6, y, 1.4, s, v.m)
        box(mb, 0.25, 0.27, y, y + s * 0.01, 0.4, 2.1, m("black"))
    box(mb, 2.45, 2.62, -0.95, 0.95, 0.3, 0.5, m("black"))
    box(mb, -2.7, -2.55, -0.95, 0.95, 0.3, 0.5, m("black"))
    quad(mb, (-2.6, -0.75, 1.4), (0, 1, 0), (0, 0, 1), 1.5, 0.65, g, off=0.008, normal=(-1, 0, 0))
    box(mb, -1.5, 0.5, -0.6, 0.6, 2.25, 2.3, m("black"))            # light bar base
    beacon(mb, -0.3, 0.45, 2.3, v.m)
    beacon(mb, -0.3, -0.45, 2.3, v.m)
    for (tag, x, y) in (("FL", 1.7, 0.82), ("FR", 1.7, -0.82), ("RL", -1.7, 0.82), ("RR", -1.7, -0.82)):
        v.wheel(tag, x, y, 0.36, 0.36, 0.24, steer=x > 0)
    v.info.update(length=L, width=W, height=2.35, wheelbase=3.4, color="white")


def build_bus(v):
    mb, m = v.mb, v.m
    L, W, H = 13.9, 3.0, 2.95
    rbox(mb, -L / 2, L / 2, -W / 2, W / 2, 0.3, H, 0.25, m("white"), rt=0.2)
    g = m("glass")
    for s in (1, -1):
        y = s * W / 2
        quad(mb, (-L / 2 + 0.4, y, 0.85) if s < 0 else (L / 2 - 0.4, y, 0.85), (s * -1, 0, 0) if s > 0 else (1, 0, 0),
             (0, 0, 1), L - 0.8, 1.85, g, off=0.012, normal=(0, s, 0))
        box(mb, -L / 2 + 0.1, L / 2 - 0.1, y - s * 0.001, y + s * 0.01, 0.35, 0.8, m("blue"))
        for k in range(8):
            x = -L / 2 + 0.4 + k * (L - 0.8) / 7
            box(mb, x - 0.04, x + 0.04, y, y + s * 0.02, 0.85, 2.7, m("dark"))
        box(mb, L / 2 - 0.02, L / 2 + 0.02, s * 1.0, s * 1.35, 0.55, 0.75, m("head"))
        box(mb, -L / 2 - 0.02, -L / 2 + 0.02, s * 1.0, s * 1.35, 0.55, 0.85, m("tail"))
    for x in (L / 2, -L / 2):
        sgn = 1 if x > 0 else -1
        quad(mb, (x, -sgn * 1.3, 0.9), (0, sgn, 0), (0, 0, 1), 2.6, 1.75, g, off=0.012, normal=(sgn, 0, 0))
        quad(mb, (x, -sgn * 0.6, 2.4), (0, sgn, 0), (0, 0, 1), 1.2, 0.3, m("sign"), uvr("bus"), 0.02,
             normal=(sgn, 0, 0))
    rbox(mb, -2.0, 2.0, -0.9, 0.9, H, H + 0.3, 0.2, m("white"), rt=0.15)      # roof A/C
    beacon(mb, 3.5, 0.0, H, v.m)
    beacon(mb, -3.5, 0.0, H, v.m)
    for (tag, x, y) in (("FL", 4.9, 1.2), ("FR", 4.9, -1.2), ("RL", -4.9, 1.2), ("RR", -4.9, -1.2)):
        v.wheel(tag, x, y, 0.45, 0.45, 0.3, steer=x > 0)
    v.info.update(length=L, width=W, height=H + 0.3, wheelbase=9.8, color="white")


BUILDERS = [("Tug", build_tug), ("BagTractor", build_bag_tractor), ("Dolly", build_dolly),
            ("BagCart", build_bag_cart), ("BeltLoader", build_belt_loader), ("Catering", build_catering),
            ("Fuel", build_fuel), ("FollowMe", build_followme), ("Van", build_van), ("Bus", build_bus)]


def main():
    make_textures()
    C.reset_scene()
    col = C.collection("GSE")
    M = materials()
    info = {}
    for k, (name, fn) in enumerate(BUILDERS):
        v = Vehicle(name, col, M, y_off=k * 8.0)
        fn(v)
        info[name] = v.finish()
    # rest positions back to the origin: the simulator places every clone
    for name in info:
        bpy.data.objects["GSE_" + name].location = (0.0, 0.0, 0.0)
    bpy.context.view_layer.update()
    C.save_blend(os.path.join(C.OUT_DIR, "gse.blend"))
    C.export_glb(os.path.join(C.WEB_ASSETS, "gse.glb"), draco=True)
    with open(os.path.join(C.WEB_ASSETS, "gse.json"), "w") as fh:
        json.dump(info, fh, indent=1)
    polys = {n: 0 for n in info}
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            for n in info:
                if ob.name.startswith(n + "_"):
                    polys[n] += len(ob.data.polygons)
    print("GSE polygons:", polys)


if __name__ == "__main__":
    main()
