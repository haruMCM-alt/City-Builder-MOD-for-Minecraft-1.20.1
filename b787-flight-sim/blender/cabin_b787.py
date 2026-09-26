"""
787-9 passenger cabin (Blender): sidewall lining with window reveals, overhead
bins, drop ceiling with mood-lighting coves, floor, galleys, lavatories,
class dividers, doors, seats and seated passengers.

Seats and passengers are exported once as prototypes ("Proto_*") plus a seat
map in the metadata; the simulator draws them with GPU instancing and fills
seats from the payload.  All geometry is built in the design frame
(s aft from the nose, y left, z up), floor at G.FLOOR_Z.

Layout (two-class + premium economy, 787-9 typical):
  L1 lav / G1 galley | Business 2-2-2 x5 | door 2 | lavs | Premium 2-3-2 x4 |
  Economy 3-3-3 | G3 galley + lavs | door 3 | Economy 3-3-3 (tapering to 2-3-2)
  | aft lavs | door 4 | aft galley
"""
import math
import os

import numpy as np
from PIL import Image

import b787_geometry as G
import common as C

TB = G.to_blender
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "textures") if G.TYPE == "b789" else os.path.join(HERE, "textures", G.ASSET)
os.makedirs(TEX, exist_ok=True)

# per-type cabin: extent (aft of the flight-deck bulkhead .. aft wall), sidewall window band,
# drop-ceiling height, side-bin bottom / aisle face, centre bins (twin aisle), aisle view y
CABIN = {
    "b789": dict(S0=6.92, S1=55.4, BAND=(-0.55, 0.95), CEIL=1.45, BIN_BOT=0.97, BIN_FRONT=1.36, centre=True,
                 aisle_y=0.955),
    "b738": dict(S0=4.32, S1=34.6, BAND=(-0.30, 0.92), CEIL=1.56, BIN_BOT=1.08, BIN_FRONT=0.60, centre=False,
                 aisle_y=0.0),
    "b763": dict(S0=5.94, S1=49.0, BAND=(-0.55, 0.95), CEIL=1.45, BIN_BOT=0.97, BIN_FRONT=1.33, centre=True,
                 aisle_y=0.985),
}[G.TYPE]
FL = G.FLOOR_Z                  # cabin floor (design z)
S0, S1 = CABIN["S0"], CABIN["S1"]
LINE = 0.13                     # lining inset from the skin
BAND = CABIN["BAND"]            # sidewall window band (skin z)
CEIL = CABIN["CEIL"]            # drop-ceiling height (design z) ~2.45 m above the floor (787)
BIN_BOT, BIN_FRONT = CABIN["BIN_BOT"], CABIN["BIN_FRONT"]  # side bin bottom z / aisle face y
DOORS = G.DOORS
DOOR_W, DOOR_Z0, DOOR_Z1 = G.DOOR_W, G.DOOR_Z0, G.DOOR_Z1
WIN_Z, WIN_W, WIN_H, WIN_PITCH = G.WIN_Z, G.WIN_W, G.WIN_H, G.WIN_PITCH
HOLE_W, HOLE_H = WIN_W + 0.07, WIN_H + 0.08     # lining window opening (reveal)
HOLE_R = min(0.13, HOLE_W / 2 - 0.01)
DOOR_VZ = DOOR_Z0 + 1.33 / 1.93 * (DOOR_Z1 - DOOR_Z0)   # door viewport height


def windows():
    out, s = [], G.WIN_S[0]
    while s < G.WIN_S[1]:
        if all(abs(s - d) > G.DOOR_GAP for d in DOORS):
            out.append(round(s, 4))
        s += WIN_PITCH
    return out


# --------------------------------------------------------------------------- section helpers
_PHI = np.linspace(0, 2 * math.pi, 1441)


def skin_y(s, z):
    """Half width of the skin at station s and height z (left side, >0)."""
    y, zz = G.fus_section(s, _PHI)
    m = y > 0
    o = np.argsort(zz[m])
    return np.interp(z, zz[m][o], y[m][o])


def lining_pt(s, z_skin, side):
    """Lining point radially inset from the skin point at (s, z_skin)."""
    y = float(skin_y(s, z_skin))
    zc = float(G.fus_profile(s)[3])
    r = math.hypot(y, z_skin - zc)
    k = max(r - LINE, 0.05) / max(r, 1e-6)
    return np.array([s, side * y * k, zc + (z_skin - zc) * k])


def lining_y(s, z):
    """Approximate lining half width at design height z."""
    return float(skin_y(s, z)) - LINE


# --------------------------------------------------------------------------- mesh helpers
def sgnpow(w, e):
    return np.sign(w) * np.abs(w) ** e


def sbox(mb, c, half, mat, e=0.25, n=(8, 14), tilt=0.0, tilt_axis="y", yaw=0.0):
    """Superellipsoid 'rounded box' centred at c with half sizes (s, y, z).
    tilt rotates about the lateral axis (+ = top goes aft)."""
    nu, nv = n
    u = np.linspace(-math.pi / 2, math.pi / 2, nu + 1)
    v = np.linspace(-math.pi, math.pi, nv + 1)
    U, V = np.meshgrid(u, v, indexing="ij")
    a, b, cz = half
    X = a * sgnpow(np.cos(U), e) * sgnpow(np.cos(V), e)
    Y = b * sgnpow(np.cos(U), e) * sgnpow(np.sin(V), e)
    Z = cz * sgnpow(np.sin(U), e)
    P = np.stack([X, Y, Z], -1)
    if tilt:
        ct, st = math.cos(tilt), math.sin(tilt)
        if tilt_axis == "y":
            P = np.stack([P[..., 0] * ct + P[..., 2] * st, P[..., 1], -P[..., 0] * st + P[..., 2] * ct], -1)
        else:  # about s axis
            P = np.stack([P[..., 0], P[..., 1] * ct - P[..., 2] * st, P[..., 1] * st + P[..., 2] * ct], -1)
    if yaw:
        cy, sy = math.cos(yaw), math.sin(yaw)
        P = np.stack([P[..., 0] * cy - P[..., 1] * sy, P[..., 0] * sy + P[..., 1] * cy, P[..., 2]], -1)
    P = P + np.asarray(c, dtype=np.float64)
    # planar side projection UVs (used by the seat-back screens)
    UV = np.stack([0.5 + 0.5 * np.clip(Y / max(b, 1e-6), -1, 1), 0.5 + 0.5 * np.clip(Z / max(cz, 1e-6), -1, 1)], -1)
    mb.add_grid(P, UV, mat=mat, wrap_v=True, outward=tuple(np.asarray(c, dtype=np.float64)),
                fallback=(0, 0, 1))


def cyl(mb, p0, p1, r, mat, n=10, r1=None):
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    r1 = r if r1 is None else r1
    ax = p1 - p0
    ax /= np.linalg.norm(ax)
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(ax, u)
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * u + np.sin(th)[:, None] * v
    P = np.stack([p0 + r * ring, p1 + r1 * ring], 0)
    mb.add_grid(P, N=np.stack([ring, ring], 0), mat=mat)
    mb.add_poly(p1 + r1 * ring[:-1], mat=mat, outward=("dir", ax))


def extrude_profile(mb, prof_fn, s_a, s_b, mat, caps=True, uv_scale=1.0):
    """Extrude a closed (y, z) polygon (evaluated at the segment centre) along s."""
    prof = np.asarray(prof_fn(0.5 * (s_a + s_b)), dtype=np.float64)
    n = len(prof)
    for i in range(n):
        (y0, z0), (y1, z1) = prof[i], prof[(i + 1) % n]
        quad = [(s_a, y0, z0), (s_b, y0, z0), (s_b, y1, z1), (s_a, y1, z1)]
        c = prof.mean(0)
        mid = np.array([(y0 + y1) / 2, (z0 + z1) / 2])
        L = math.hypot(y1 - y0, z1 - z0)
        mb.add_poly(quad, uvs=[(0, 0), ((s_b - s_a) * uv_scale, 0), ((s_b - s_a) * uv_scale, L * uv_scale),
                               (0, L * uv_scale)],
                    mat=mat, outward=("dir", (0, mid[0] - c[0], mid[1] - c[1])))
    if caps:
        mb.add_poly([(s_a, y, z) for y, z in prof], mat=mat, outward=("dir", (-1, 0, 0)))
        mb.add_poly([(s_b, y, z) for y, z in prof], mat=mat, outward=("dir", (1, 0, 0)))


def panel(mb, s, y0, y1, z0, z1, t, mat):
    """Thin transverse wall at station s."""
    mb.add_box((s, 0.5 * (y0 + y1), 0.5 * (z0 + z1)), (t, abs(y1 - y0), z1 - z0), mat=mat)


# --------------------------------------------------------------------------- textures
def sidewall_texture(W=8192, H=512):
    """Sidewall band: u = (s - S0)/(S1 - S0), v = (z - BAND0)/(BAND1 - BAND0) (skin z, v=0 bottom).
    Window openings are cut out with alpha; bezels, panel joints and doors are painted."""
    su = S0 + (np.arange(W) + 0.5) / W * (S1 - S0)
    zv = BAND[1] - (np.arange(H) + 0.5) / H * (BAND[1] - BAND[0])     # image top = band top
    S, Z = np.meshgrid(su, zv)
    col = np.empty((H, W, 3), np.float32)
    base = np.array([0.905, 0.895, 0.870], np.float32)
    col[:] = base
    # soft vertical shading (sidewall curves in toward the bins)
    col *= (0.93 + 0.07 * np.clip((Z - BAND[0]) / 1.2, 0, 1))[..., None]
    alpha = np.ones((H, W), np.float32)
    px = (S1 - S0) / W * 1.5

    def rr(ds, dz, hw, hh, r):
        qx = np.abs(ds) - (hw - r)
        qz = np.abs(dz) - (hh - r)
        return np.hypot(np.maximum(qx, 0), np.maximum(qz, 0)) + np.minimum(np.maximum(qx, qz), 0) - r

    for wc in windows():
        m = np.abs(su - wc) < 0.6
        if not m.any():
            continue
        sl = np.s_[:, m]
        d = rr(S[sl] - wc, Z[sl] - WIN_Z, HOLE_W / 2, HOLE_H / 2, HOLE_R)
        bez = np.clip(0.5 - (d - 0.045) / px, 0, 1)
        col[sl] = col[sl] * (1 - 0.12 * bez[..., None])
        ring = np.clip(0.5 - (np.abs(d - 0.045) - 0.004) / px, 0, 1)
        col[sl] = col[sl] * (1 - 0.18 * ring[..., None])
        alpha[sl] = np.minimum(alpha[sl], np.clip(0.5 + d / px, 0, 1))
    # panel joints every second window
    for k, wc in enumerate(windows()):
        if k % 2 == 0:
            d = np.abs(S - (wc + WIN_PITCH / 2)) - 0.003
            col *= (1 - 0.25 * np.clip(0.5 - d / px, 0, 1))[..., None]
    # doors: lighter panel with a groove
    for dc in DOORS:
        d = rr(S - dc, Z - 0.5 * (DOOR_Z0 + DOOR_Z1), DOOR_W / 2, (DOOR_Z1 - DOOR_Z0) / 2, 0.18)
        inside = np.clip(0.5 - d / px, 0, 1)
        col = col * (1 - inside[..., None]) + np.array([0.94, 0.935, 0.92], np.float32) * inside[..., None]
        groove = np.clip(0.5 - (np.abs(d) - 0.006) / px, 0, 1)
        col *= (1 - 0.45 * groove)[..., None]
        # door viewport
        dv = rr(S - dc, Z - DOOR_VZ, 0.10, 0.16, 0.08)
        alpha = np.minimum(alpha, np.clip(0.5 + dv / px, 0, 1))
    rgba = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(TEX, "cabin_sidewall.png"),
                                                                      optimize=True)


def carpet_texture(W=512):
    """Tileable carpet (1 m tile): deep blue-grey with a small woven motif."""
    rng = np.random.default_rng(3)
    x = (np.arange(W) + 0.5) / W
    X, Y = np.meshgrid(x, x)
    base = np.array([0.20, 0.22, 0.29], np.float32)
    col = np.empty((W, W, 3), np.float32)
    col[:] = base
    # woven texture noise
    n = rng.random((W, W)).astype(np.float32)
    n = (n + np.roll(n, 1, 0) + np.roll(n, 1, 1) + np.roll(n, -1, 0)) / 4
    col *= (0.85 + 0.3 * n)[..., None]
    # repeating diamond motif
    d = np.abs(((X * 4) % 1) - 0.5) + np.abs(((Y * 4) % 1) - 0.5)
    motif = np.clip(1 - np.abs(d - 0.32) / 0.03, 0, 1)
    col = col * (1 - 0.35 * motif[..., None]) + np.array([0.42, 0.45, 0.55], np.float32) * 0.35 * motif[..., None]
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "cabin_carpet.jpg"), quality=90)


def screen_texture(W=256, H=160):
    """Seat-back IFE screen: moving-map style picture."""
    x = (np.arange(W) + 0.5) / W
    y = (np.arange(H) + 0.5) / H
    X, Y = np.meshgrid(x, y)
    col = np.empty((H, W, 3), np.float32)
    col[..., 0] = 0.05 + 0.10 * Y
    col[..., 1] = 0.12 + 0.20 * Y
    col[..., 2] = 0.30 + 0.35 * Y
    land = (np.sin(X * 9 + 1.3) * 0.12 + np.sin(X * 23) * 0.04 + 0.55) < Y
    col[land] = [0.18, 0.36, 0.20]
    # route arc
    d = np.abs(Y - (0.75 - 0.9 * (X - 0.5) ** 2 - 0.2)) - 0.006
    col[d < 0] = [0.95, 0.85, 0.3]
    col[np.hypot(X - 0.55, (Y - 0.53) * H / W) < 0.02] = [1, 1, 1]
    col[:14] = [0.02, 0.03, 0.05]
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "cabin_screen.jpg"), quality=90)


def generate_textures():
    sidewall_texture()
    carpet_texture()
    screen_texture()


# --------------------------------------------------------------------------- materials
def materials(tex):
    P = C.pbr_material
    h = C.hex_color
    return {
        "wall": P("Cabin_Sidewall", color=h("#e6e3dc"), roughness=0.75, base_tex=tex("cabin_sidewall.png"),
                  alpha_from_tex=True),
        "lining": P("Cabin_Lining", color=h("#e9e6df"), roughness=0.8),
        "dado": P("Cabin_Dado", color=h("#8d8a86"), roughness=0.85),
        "ceiling": P("Cabin_Ceiling", color=h("#f1efea"), roughness=0.7),
        "bin": P("Cabin_Bin", color=h("#eceae4"), roughness=0.5),
        "binline": P("Cabin_BinLine", color=h("#9da2a8"), roughness=0.4, metallic=0.6),
        "mood": P("Cabin_Mood", color=h("#c8c2ff"), roughness=0.5, emission=h("#b9b0ff"), emission_strength=2.5),
        "light": P("Cabin_Light", color=h("#fff4e6"), roughness=0.4, emission=h("#fff1dc"), emission_strength=3.0),
        "exit": P("Cabin_Exit", color=h("#1fd060"), roughness=0.4, emission=h("#26ff6a"), emission_strength=3.0),
        "carpet": P("Cabin_Carpet", color=h("#ffffff"), roughness=0.95, base_tex=tex("cabin_carpet.jpg")),
        "floor": P("Cabin_FloorVinyl", color=h("#7e7a74"), roughness=0.6),
        "monument": P("Cabin_Monument", color=h("#efece6"), roughness=0.55),
        "accent": P("Cabin_Accent", color=h("#6b5c52"), roughness=0.45),
        "steel": P("Cabin_Steel", color=h("#c9ced3"), roughness=0.25, metallic=0.9),
        "dark": P("Cabin_Dark", color=h("#2a2c30"), roughness=0.6),
        "mirror": P("Cabin_Mirror", color=h("#dfe6ee"), roughness=0.02, metallic=1.0),
        "porcelain": P("Cabin_Porcelain", color=h("#f7f7f5"), roughness=0.15),
        "glass": P("Cabin_WindowPane", color=h("#9fb6c9"), roughness=0.05, alpha=0.18, blend=True),
        "screen": P("Cabin_Screen", color=h("#111418"), roughness=0.2, base_tex=tex("cabin_screen.jpg"),
                    emissive_tex=tex("cabin_screen.jpg"), emission_strength=1.2),
        # seats (fabric colours are tinted per airline in the simulator)
        "fabricY": P("Seat_FabricY", color=h("#3c4a63"), roughness=0.95),
        "fabricJ": P("Seat_FabricJ", color=h("#4a3f3a"), roughness=0.7),
        "shell": P("Seat_Shell", color=h("#e7e3dc"), roughness=0.35),
        "plastic": P("Seat_Plastic", color=h("#55595f"), roughness=0.5),
        "headrest": P("Seat_Headrest", color=h("#f2efe8"), roughness=0.9),
        "seatmetal": P("Seat_Metal", color=h("#9aa0a6"), roughness=0.3, metallic=0.85),
        "seatscreen": P("Seat_Screen", color=h("#0d1015"), roughness=0.15, base_tex=tex("cabin_screen.jpg"),
                        emissive_tex=tex("cabin_screen.jpg"), emission_strength=1.0),
        # passengers (colours varied per instance in the simulator)
        "skin": P("Pax_Skin", color=h("#e0b896"), roughness=0.6),
        "shirt": P("Pax_Shirt", color=h("#ffffff"), roughness=0.9),
        "pants": P("Pax_Pants", color=h("#ffffff"), roughness=0.9),
        "hair": P("Pax_Hair", color=h("#ffffff"), roughness=0.7),
        "shoes": P("Pax_Shoes", color=h("#1d1d20"), roughness=0.5),
        # cabin crew (uniform tinted with the airline colour in the simulator), trolley, meal tray
        "uniform": P("Crew_Uniform", color=h("#ffffff"), roughness=0.8),
        "crewpants": P("Crew_Pants", color=h("#1f2633"), roughness=0.8),
        "crewaccent": P("Crew_Accent", color=h("#f2b233"), roughness=0.5),
        "crewskin": P("Crew_Skin", color=h("#e6bf9c"), roughness=0.6),
        "crewhair": P("Crew_Hair", color=h("#1c1714"), roughness=0.6),
        "cartalu": P("Cart_Aluminium", color=h("#c7ccd1"), roughness=0.3, metallic=0.85),
        "cartred": P("Cart_Bottle", color=h("#b83a2e"), roughness=0.3),
        "cup": P("Tray_Cup", color=h("#f4f1ea"), roughness=0.4),
        "trayplastic": P("Tray_Plastic", color=h("#3b4048"), roughness=0.5),
        "dish": P("Tray_Dish", color=h("#fbfbf9"), roughness=0.2),
        "food": P("Tray_Food", color=h("#b86b2e"), roughness=0.7),
        "salad": P("Tray_Salad", color=h("#5f9a3a"), roughness=0.7),
    }


# --------------------------------------------------------------------------- lining
def build_lining(M, parent, col):
    mb = C.MeshBuilder(TB)
    ss = np.unique(np.r_[np.linspace(S0, S1, 160), np.linspace(S1 - 9.4, S1, 60)])
    for side in (1, -1):
        # window band (textured, alpha cut-outs)
        zs = np.linspace(BAND[0], BAND[1], 16)
        P = np.array([[lining_pt(s, z, side) for z in zs] for s in ss])
        UV = np.stack([np.repeat(((ss - S0) / (S1 - S0))[:, None], len(zs), 1),
                       np.repeat(((zs - BAND[0]) / (BAND[1] - BAND[0]))[None], len(ss), 0)], -1)
        mb.add_grid(P, UV, mat=0, outward=("dir", (0, -side, 0)))
        # dado panel (band bottom -> floor), with a dark air-return grille strip
        zd = np.linspace(FL + 0.02, BAND[0], 5)
        P = np.array([[lining_pt(s, z, side) for z in zd] for s in ss])
        mb.add_grid(P, mat=2, outward=("dir", (0, -side, 0)))
        # upper lining above the band (hidden mostly by bins, closes the gap to the ceiling)
        zu = np.linspace(BAND[1], CEIL + 0.35, 6)
        P = np.array([[lining_pt(s, z, side) for z in zu] for s in ss])
        mb.add_grid(P, mat=1, outward=("dir", (0, -side, 0)))
    ob = mb.build("Cabin_Lining", [M["wall"], M["lining"], M["dado"]], col=col)
    C.set_parent(ob, parent)

    # window reveals: rounded-rect tunnels from the lining opening to the skin, plus a tinted pane
    rv = C.MeshBuilder(TB)
    th = np.linspace(0, 2 * math.pi, 29)

    def rr_pts(w, h, r):
        # rounded rectangle outline (s offset, z offset)
        out = []
        for t in th:
            cx, cz = math.cos(t), math.sin(t)
            qs = np.sign(cx) * (w / 2 - r) + r * cx
            qz = np.sign(cz) * (h / 2 - r) + r * cz
            out.append((qs, qz))
        return np.array(out)
    inner = rr_pts(HOLE_W, HOLE_H, HOLE_R)
    outer = rr_pts(WIN_W + 0.02, WIN_H + 0.02, 0.11)
    for side in (1, -1):
        for wc in windows():
            a = np.array([lining_pt(wc + ds, WIN_Z + dz, side) for ds, dz in inner])
            b = []
            for ds, dz in outer:
                y = float(skin_y(wc + ds, WIN_Z + dz)) - 0.02
                b.append((wc + ds, side * y, WIN_Z + dz))
            b = np.array(b)
            P = np.stack([a, b], 0)
            # normals point at the window axis (seen from inside the opening)
            d = np.stack([np.c_[-inner[:, 0], np.zeros(len(th)), -inner[:, 1]],
                          np.c_[-outer[:, 0], np.zeros(len(th)), -outer[:, 1]]], 0)
            d /= np.maximum(np.linalg.norm(d, axis=-1, keepdims=True), 1e-9)
            rv.add_grid(P, N=d, mat=0, smooth=True)
            # inner pane just inside the skin (electro-chromic window, slightly tinted)
            pane = b.copy()
            pane[:, 1] -= side * 0.03
            rv.add_poly(pane[:-1], mat=1, outward=("dir", (0, -side, 0)))
    ob = rv.build("Cabin_Reveals", [M["lining"], M["glass"]], col=col)
    C.set_parent(ob, parent)


def bin_profile(side):
    def f(s):
        yl = lining_y(s, BIN_BOT - 0.17)
        yt = lining_y(s, CEIL + 0.05)
        prof = [(yl, BIN_BOT - 0.17), (BIN_FRONT + 0.20, BIN_BOT - 0.02), (BIN_FRONT + 0.02, BIN_BOT),
                (BIN_FRONT - 0.03, BIN_BOT + 0.15), (BIN_FRONT - 0.04, BIN_BOT + 0.29), (BIN_FRONT - 0.01, BIN_BOT + 0.41),
                (BIN_FRONT + 0.03, CEIL + 0.03), (yt, CEIL + 0.05)]
        return [(side * y, z) for y, z in prof]
    return f


def build_ceiling_and_bins(M, parent, col, zones):
    mb = C.MeshBuilder(TB)
    ss = np.linspace(S0, S1, 90)
    # drop ceiling: gentle arch between the side bins
    ys = np.linspace(-1.0, 1.0, 17)
    P = np.zeros((len(ss), len(ys), 3))
    for i, s in enumerate(ss):
        w = min(BIN_FRONT + 0.05, lining_y(s, CEIL) - 0.05)
        P[i, :, 0] = s
        P[i, :, 1] = ys * w
        P[i, :, 2] = CEIL + 0.10 + 0.14 * (1 - ys ** 2)
    mb.add_grid(P, mat=0, outward=("dir", (0, 0, -1)))
    # side bins: segments with small gaps (door zones stay open above the doors)
    for side in (1, -1):
        f = bin_profile(side)
        s = S0
        while s < S1 - 0.01:
            L = min(1.62, S1 - s)
            near_door = any(abs(s + L / 2 - d) < 1.25 for d in DOORS) or s + L / 2 < S0 + 0.98 or s > S1 - 4.5
            if near_door:
                # flat soffit closing the gap between the ceiling and the lining
                def soffit(_s, side=side):
                    yt = max(lining_y(_s, CEIL + 0.08), BIN_FRONT + 0.1)
                    return [(side * BIN_FRONT, CEIL + 0.06), (side * yt, CEIL + 0.06),
                            (side * yt, CEIL + 0.1), (side * BIN_FRONT, CEIL + 0.1)]
                extrude_profile(mb, soffit, s, s + L, 0, caps=False)
            else:
                extrude_profile(mb, f, s, s + L - 0.012, 1)
                # latch line / handle recess
                mb.add_box((s + L / 2, side * (BIN_FRONT - 0.045), BIN_BOT + 0.36), (0.30, 0.012, 0.03), mat=2)
                # mood-lighting cove strip along the ceiling edge
                mb.add_box((s + L / 2, side * (BIN_FRONT + 0.04), CEIL + 0.07), (L - 0.02, 0.05, 0.012), mat=3)
                # passenger service units under the bin: reading lights + vents per row
                mb.add_box((s + L / 2, side * (BIN_FRONT + 0.45), BIN_BOT - 0.03), (L - 0.05, 0.5, 0.02), mat=5)
                for k in range(2):
                    for j in range(3):
                        c = (s + 0.4 + k * 0.81, side * (BIN_FRONT + 0.25 + j * 0.18), BIN_BOT - 0.045)
                        cyl(mb, c, (c[0], c[1], c[2] - 0.012), 0.025, 4, n=8)
            s += L
    # centre bins over the middle seat block in the seating zones
    for (za, zb) in (zones if CABIN["centre"] else []):
        s = za
        while s + 1.5 <= zb + 0.01:
            L = min(1.62, zb - s)
            prof = lambda _s: [(-0.72, 1.06), (0.72, 1.06), (0.76, 1.24), (0.70, CEIL + 0.1),
                               (-0.70, CEIL + 0.1), (-0.76, 1.24)]
            extrude_profile(mb, prof, s, s + L - 0.012, 1)
            for side in (1, -1):
                mb.add_box((s + L / 2, side * 0.745, 1.2), (0.3, 0.012, 0.03), mat=2)
            mb.add_box((s + L / 2, 0, 1.055), (L - 0.05, 1.0, 0.02), mat=5)
            s += L
    ob = mb.build("Cabin_Overhead", [M["ceiling"], M["bin"], M["binline"], M["mood"], M["light"], M["dark"]],
                  col=col)
    C.set_parent(ob, parent)


def build_floor(M, parent, col):
    mb = C.MeshBuilder(TB)
    ss = np.linspace(S0, S1, 80)
    ys = np.linspace(-1, 1, 9)
    P = np.zeros((len(ss), len(ys), 3))
    UV = np.zeros((len(ss), len(ys), 2))
    for i, s in enumerate(ss):
        w = max(lining_y(s, FL + 0.02), 0.3)
        P[i, :, 0] = s
        P[i, :, 1] = ys * w
        P[i, :, 2] = FL
        UV[i, :, 0] = s
        UV[i, :, 1] = ys * w
    mb.add_grid(P, UV, mat=0, outward=("dir", (0, 0, 1)))
    # vinyl floor in the door / galley areas
    for dc in DOORS:
        a, b = dc - 0.7, dc + 0.7
        w = max(lining_y(dc, FL + 0.02), 0.3)
        mb.add_poly([(a, w, FL + 0.004), (b, w, FL + 0.004), (b, -w, FL + 0.004), (a, -w, FL + 0.004)], mat=1,
                    outward=("dir", (0, 0, 1)))
    ob = mb.build("Cabin_Floor", [M["carpet"], M["floor"]], col=col)
    C.set_parent(ob, parent)


# --------------------------------------------------------------------------- monuments
def lavatory(mb, sa, sb, side, open_door=False):
    """Lavatory against the sidewall: y from the aisle edge to the lining."""
    yo = lining_y(0.5 * (sa + sb), 0.0) - 0.02
    yi = 1.05 if yo > 2.0 else max(0.45, yo - 1.1)
    Y = lambda y: side * y
    h = FL + 2.05
    mat_w, mat_a, mat_s, mat_m, mat_p, mat_l = 0, 1, 2, 3, 4, 5
    # walls (fore, aft) and ceiling
    for s in (sa, sb):
        mb.add_box((s, Y(0.5 * (yi + yo)), 0.5 * (FL + h)), (0.05, yo - yi, h - FL), mat=mat_w)
    mb.add_box((0.5 * (sa + sb), Y(0.5 * (yi + yo)), h), (sb - sa, yo - yi, 0.04), mat=mat_w)
    # aisle wall with door (bi-fold door panel or an open doorway)
    dw = 0.62
    dc = 0.5 * (sa + sb)
    for (a, b) in ((sa, dc - dw / 2), (dc + dw / 2, sb)):
        if b - a > 0.02:
            mb.add_box((0.5 * (a + b), Y(yi), 0.5 * (FL + h)), (b - a, 0.05, h - FL), mat=mat_w)
    mb.add_box((dc, Y(yi), h - 0.1), (dw, 0.05, 0.2), mat=mat_w)
    if not open_door:
        mb.add_box((dc, Y(yi - 0.01), 0.5 * (FL + h - 0.2)), (dw - 0.02, 0.04, h - FL - 0.22), mat=mat_a)
        # occupied / vacant sign + handle
        mb.add_box((dc + 0.18, Y(yi - 0.04), FL + 1.05), (0.1, 0.02, 0.05), mat=mat_s)
        mb.add_box((dc, Y(yi - 0.04), FL + 1.75), (0.16, 0.02, 0.07), mat=mat_l)
    # toilet: bowl + shroud + seat/lid against the fore wall
    ts = sa + 0.33
    ty = 0.5 * (yi + yo) + 0.05
    sbox(mb, (ts, Y(ty), FL + 0.22), (0.24, 0.2, 0.22), mat_p, e=0.5, n=(8, 16))
    sbox(mb, (ts - 0.02, Y(ty), FL + 0.45), (0.23, 0.19, 0.025), mat_p, e=0.35, n=(4, 16))
    sbox(mb, (sa + 0.08, Y(ty), FL + 0.72), (0.06, 0.2, 0.26), mat_p, e=0.3, n=(6, 12))    # lid (up)
    mb.add_box((sa + 0.05, Y(ty), FL + 0.35), (0.08, 0.36, 0.7), mat=mat_w)                 # shroud
    # sink counter + basin + faucet + mirror on the outboard side
    cs = sb - 0.32
    mb.add_box((cs, Y(yo - 0.25), FL + 0.85), (0.55, 0.46, 0.06), mat=mat_a)
    sbox(mb, (cs, Y(yo - 0.25), FL + 0.84), (0.16, 0.13, 0.05), mat_p, e=0.5, n=(6, 14))
    cyl(mb, (cs + 0.2, Y(yo - 0.25), FL + 0.88), (cs + 0.2, Y(yo - 0.25), FL + 1.02), 0.012, mat_s, n=8)
    cyl(mb, (cs + 0.2, Y(yo - 0.25), FL + 1.02), (cs + 0.09, Y(yo - 0.25), FL + 1.02), 0.01, mat_s, n=8)
    mb.add_box((cs, Y(yo - 0.26), FL + 0.45), (0.5, 0.42, 0.75), mat=mat_w)                 # cabinet
    mb.add_box((sb - 0.03, Y(yo - 0.3), FL + 1.35), (0.02, 0.5, 0.6), mat=mat_m)            # mirror (aft wall)
    mb.add_box((0.5 * (sa + sb), Y(0.5 * (yi + yo)), h - 0.03), (0.3, 0.3, 0.02), mat=mat_l)
    # grab bar
    cyl(mb, (sa + 0.5, Y(yo - 0.06), FL + 0.9), (sa + 0.9, Y(yo - 0.06), FL + 0.9), 0.014, mat_s, n=8)


def galley(mb, sa, sb, y0, y1, facing):
    """Galley block between y0..y1, working face at s = sa (facing=-1) or sb (facing=+1)."""
    mat_w, mat_s, mat_d, mat_a = 0, 2, 6, 1
    sc = 0.5 * (sa + sb)
    yc, wy = 0.5 * (y0 + y1), abs(y1 - y0)
    face = sa if facing < 0 else sb
    fd = -1 if facing < 0 else 1
    # lower cart bay + worktop + upper compartments
    mb.add_box((sc, yc, FL + 0.52), (sb - sa, wy, 1.04), mat=mat_w)
    mb.add_box((sc, yc, FL + 1.06), (sb - sa + 0.04, wy + 0.02, 0.04), mat=mat_s)
    mb.add_box((sc + fd * 0.15, yc, FL + 1.62), (sb - sa - 0.3, wy, 0.95), mat=mat_w)
    # trolleys (aluminium fronts with a latch and handle)
    n = max(1, int(wy / 0.32))
    w = wy / n
    for i in range(n):
        y = min(y0, y1) + (i + 0.5) * w
        mb.add_box((face + fd * 0.012, y, FL + 0.52), (0.02, w - 0.03, 1.0), mat=mat_s)
        mb.add_box((face + fd * 0.03, y, FL + 0.95), (0.02, w * 0.6, 0.025), mat=mat_d)
    # ovens / coffee makers on the upper row
    for i in range(n):
        y = min(y0, y1) + (i + 0.5) * w
        f2 = face + fd * 0.15
        mb.add_box((f2 + fd * 0.012, y, FL + 1.42), (0.02, w - 0.05, 0.3), mat=mat_d)
        mb.add_box((f2 + fd * 0.02, y, FL + 1.78), (0.02, w - 0.05, 0.22), mat=mat_a)


def wall(mb, s, z0, z1, mat, door=None, n=10):
    """Transverse wall following the lining outline (in strips), optional centred doorway."""
    zs = np.linspace(z0, z1, n + 1)
    if door:
        zs = np.unique(np.r_[zs, door[1]])
    for za, zb in zip(zs[:-1], zs[1:]):
        w = min(lining_y(s, za), lining_y(s, zb)) - 0.02
        if w <= 0.05:
            continue
        if door and za < door[1] - 1e-6:
            for (a, b) in ((-w, -door[0]), (door[0], w)):
                if b > a:
                    panel(mb, s, a, b, za, zb, 0.06, mat)
        else:
            panel(mb, s, -w, w, za, zb, 0.06, mat)


def divider(mb, s, zones_y, mat):
    """Class divider: partitions over the seat blocks (aisles left open)."""
    for (ya, yb) in zones_y:
        panel(mb, s, ya, yb, FL, BIN_BOT - 0.02, 0.05, mat)


def build_monuments(M, parent, col):
    mb = C.MeshBuilder(TB)
    mats = [M["monument"], M["accent"], M["steel"], M["mirror"], M["porcelain"], M["light"], M["dark"],
            M["exit"], M["screen"]]
    # forward: flight-deck bulkhead (cabin side) with the cockpit door
    wall(mb, S0, FL, CEIL + 0.3, 1, door=(0.5, FL + 2.0))
    mb.add_box((S0 + 0.02, 0, FL + 1.0), (0.05, 0.96, 2.0), mat=6)          # cockpit door
    mb.add_box((S0 + 0.05, 0.3, FL + 1.55), (0.02, 0.08, 0.08), mat=6)      # camera / keypad
    if G.TYPE == "b738":
        # forward lav (left) + galley (right) between door 1 and row 1; aft lavs + galley
        lavatory(mb, 5.05, 6.15, 1)
        galley(mb, 5.05, 6.15, -0.35, -1.55, +1)
        divider(mb, 9.62, [(0.3, 1.7), (-1.7, -0.3)], 1)
        lavatory(mb, 32.35, 33.35, 1)
        lavatory(mb, 32.35, 33.35, -1)
        galley(mb, 34.2, 34.55, -1.2, 1.2, -1)
    elif G.TYPE == "b763":
        lavatory(mb, 6.95, 8.05, 1)
        galley(mb, 6.95, 8.05, -0.4, -2.0, +1)
        divider(mb, 8.35, [(1.25, 2.3), (-0.72, 0.72), (-2.3, -1.25)], 1)
        lavatory(mb, 15.2, 16.4, 1)
        lavatory(mb, 15.2, 16.4, -1)
        galley(mb, 15.2, 16.4, -0.55, 0.55, +1)
        divider(mb, 16.5, [(1.25, 2.3), (-0.72, 0.72), (-2.3, -1.25)], 1)
        lavatory(mb, 45.05, 46.15, 1)
        lavatory(mb, 45.05, 46.15, -1)
        galley(mb, 47.8, 48.9, -1.2, 1.2, -1)
    else:
        monuments_787(mb)
    finish_monuments(mb)
    ob = mb.build("Cabin_Monuments", mats, col=col)
    C.set_parent(ob, parent)


def monuments_787(mb):
    # L1 lavatory + G1 galley (forward, aft of door 1)
    lavatory(mb, 7.55, 8.75, 1)
    galley(mb, 7.55, 8.75, -0.45, -2.2, +1)
    # business screen divider at the cabin front
    divider(mb, 9.0, [(0.7, 2.6), (-0.68, 0.68), (-2.6, -0.7)], 1)
    for yy in (1.6, 0.0, -1.6):
        mb.add_box((9.03, yy, 0.55), (0.02, 0.9, 0.5), mat=8)
    # door 2: lavatories behind, premium divider
    lavatory(mb, 18.35, 19.55, 1, open_door=True)
    lavatory(mb, 18.35, 19.55, -1)
    galley(mb, 18.35, 19.55, -0.45, 0.45, +1)
    divider(mb, 19.65, [(0.7, 2.6), (-0.7, 0.7), (-2.6, -0.7)], 1)
    # mid galley + lavs ahead of door 3
    lavatory(mb, 38.4, 39.6, 1)
    lavatory(mb, 38.4, 39.6, -1)
    galley(mb, 38.4, 39.6, -0.65, 0.65, -1)
    # aft lavs ahead of door 4 and aft galley
    lavatory(mb, 51.45, 52.75, 1)
    lavatory(mb, 51.45, 52.75, -1)
    galley(mb, 54.55, 55.35, -1.1, 1.1, -1)


def finish_monuments(mb):
    # aft wall
    wall(mb, S1, FL, CEIL + 0.3, 0)
    # exit signs above every door, both sides
    for dc in DOORS:
        for side in (1, -1):
            y = lining_y(dc, 1.1) - 0.12
            mb.add_box((dc, side * min(y, BIN_FRONT + 0.3), CEIL + 0.0), (0.32, 0.03, 0.1), mat=7)
    # interior door hardware: handle + a slightly proud panel edge
    for dc in DOORS[1:]:
        for side in (1, -1):
            y = lining_y(dc, 0.0) - 0.03
            mb.add_box((dc + 0.25, side * y, 0.05), (0.2, 0.05, 0.05), mat=2)
            mb.add_box((dc - 0.35, side * y, -0.35), (0.06, 0.04, 0.35), mat=1)


# --------------------------------------------------------------------------- seat map
ZONES = {
    # (class, s_first, pitch, rows, blocks [(y_centre, seats, seat_w)], letters)
    "b789": [
        ("J", 9.95, 1.5, 5, [(1.91, 2, 0.66), (0.0, 2, 0.66), (-1.91, 2, 0.66)], "AC" "DG" "HK"),
        ("W", 20.05, 0.97, 4, [(1.81, 2, 0.50), (0.0, 3, 0.50), (-1.81, 2, 0.50)], "AC" "DEG" "HK"),
        ("Y", 24.05, 0.81, 17, [(1.91, 3, 0.46), (0.0, 3, 0.46), (-1.91, 3, 0.46)], "ABC" "DEG" "HJK"),
        ("Y", 41.35, 0.81, 12, [(1.91, 3, 0.46), (0.0, 3, 0.46), (-1.91, 3, 0.46)], "ABC" "DEG" "HJK"),
    ],
    # 737-800: 2-2 front cabin, 3-3 economy (break for the two over-wing exit rows)
    "b738": [
        ("J", 6.75, 0.97, 3, [(0.88, 2, 0.56), (-0.88, 2, 0.56)], "AC" "DF"),
        ("Y", 10.1, 0.79, 7, [(1.0, 3, 0.44), (-1.0, 3, 0.44)], "ABC" "DEF"),
        ("Y", 16.35, 0.86, 2, [(1.0, 3, 0.44), (-1.0, 3, 0.44)], "ABC" "DEF"),
        ("Y", 18.2, 0.79, 18, [(1.0, 3, 0.44), (-1.0, 3, 0.44)], "ABC" "DEF"),
    ],
    # 767-300ER: business 2-2-2, economy 2-3-2
    "b763": [
        ("J", 8.95, 1.5, 4, [(1.72, 2, 0.58), (0.0, 2, 0.58), (-1.72, 2, 0.58)], "AC" "DG" "HK"),
        ("Y", 17.95, 0.81, 7, [(1.73, 2, 0.46), (0.0, 3, 0.46), (-1.73, 2, 0.46)], "AC" "DEG" "HK"),
        ("Y", 24.6, 0.81, 25, [(1.73, 2, 0.46), (0.0, 3, 0.46), (-1.73, 2, 0.46)], "AC" "DEG" "HK"),
    ],
}[G.TYPE]
AISLES = {"b789": [0.955, -0.955], "b738": [0.0], "b763": [0.985, -0.985]}[G.TYPE]   # aisle centres (design y)
MY_SEAT_S = {"b789": 36.2, "b738": 20.57, "b763": 30.27}[G.TYPE]


def seat_map():
    seats = []
    row = 1
    for cls, s0, pitch, rows, blocks, letters in ZONES:
        for r in range(rows):
            s = s0 + r * pitch
            li = 0
            for (yc, n, w) in blocks:
                for k in range(n):
                    y = yc - (k - (n - 1) / 2) * w          # A = left window ... K = right window
                    letter = letters[li]
                    li += 1
                    # drop seats that do not fit the tapering tail
                    lim = lining_y(s + 0.3, -0.35) - 0.06
                    if abs(y) + w / 2 > lim:
                        continue
                    seats.append(dict(c=cls, row=row, l=letter, s=round(s, 3), y=round(y, 3), w=w,
                                      p=[round(v, 3) for v in G.to_three([s, y, FL])]))
            row += 1
    return seats


def zones_for_bins():
    out = []
    for cls, s0, pitch, rows, blocks, letters in ZONES:
        out.append((s0 - 0.45, s0 - 0.45 + rows * pitch))
    return out


# --------------------------------------------------------------------------- prototypes
def proto_seat_y(M, col, parent):
    """Economy / premium seat, origin at the floor under the cushion centre, facing -s."""
    mb = C.MeshBuilder(TB)
    FAB, HEAD, PL, MET, SCR = 0, 1, 2, 3, 4
    sbox(mb, (0.0, 0, 0.44), (0.23, 0.215, 0.065), FAB, e=0.3, n=(6, 14))
    tilt = math.radians(14)
    sbox(mb, (0.24, 0, 0.84), (0.07, 0.215, 0.37), FAB, e=0.3, n=(6, 14), tilt=tilt)
    sbox(mb, (0.33, 0, 1.12), (0.075, 0.2, 0.09), HEAD, e=0.3, n=(4, 12), tilt=tilt)
    # seat back shell (plastic) with IFE screen and tray table for the row behind
    sbox(mb, (0.30, 0, 0.82), (0.03, 0.22, 0.4), PL, e=0.2, n=(4, 12), tilt=tilt)
    ct, st = math.cos(tilt), math.sin(tilt)

    def on_back(dz, ds=0.0):
        return (0.30 + 0.035 + dz * st + ds, 0.0, 0.82 + dz * ct)
    c = on_back(0.2)
    sbox(mb, c, (0.006, 0.12, 0.075), SCR, e=0.15, n=(12, 16), tilt=tilt)
    c = on_back(-0.08)
    sbox(mb, c, (0.012, 0.19, 0.12), PL, e=0.2, n=(2, 8), tilt=tilt)
    # armrests
    for sy in (-1, 1):
        mb.add_box((0.02, sy * 0.235, 0.63), (0.42, 0.05, 0.05), mat=PL)
        mb.add_box((0.14, sy * 0.235, 0.52), (0.05, 0.04, 0.2), mat=MET)
    # legs + tube
    for sy in (-0.16, 0.16):
        cyl(mb, (-0.14, sy, 0.0), (-0.1, sy, 0.38), 0.018, MET, n=8)
        cyl(mb, (0.2, sy, 0.0), (0.05, sy, 0.38), 0.018, MET, n=8)
    cyl(mb, (0.0, -0.23, 0.36), (0.0, 0.23, 0.36), 0.02, MET, n=8)
    ob = mb.build("Proto_SeatY", [M["fabricY"], M["headrest"], M["plastic"], M["seatmetal"], M["seatscreen"]],
                  col=col)
    C.set_parent(ob, parent)


def proto_seat_j(M, col, parent):
    """Business seat (lie-flat style): shell, cushions, console, ottoman, large screen."""
    mb = C.MeshBuilder(TB)
    FAB, HEAD, SHELL, MET, SCR, PL = 0, 1, 2, 3, 4, 5
    sbox(mb, (0.05, 0, 0.46), (0.33, 0.25, 0.07), FAB, e=0.3, n=(6, 14))
    tilt = math.radians(18)
    sbox(mb, (0.40, 0, 0.88), (0.08, 0.25, 0.4), FAB, e=0.3, n=(6, 14), tilt=tilt)
    sbox(mb, (0.52, 0, 1.24), (0.08, 0.22, 0.1), HEAD, e=0.3, n=(4, 12), tilt=tilt)
    # wrap-around shell
    sbox(mb, (0.52, 0, 0.72), (0.06, 0.33, 0.62), SHELL, e=0.2, n=(4, 14), tilt=math.radians(8))
    for sy in (-1, 1):
        sbox(mb, (0.15, sy * 0.33, 0.62), (0.42, 0.035, 0.5), SHELL, e=0.2, n=(4, 10))
        sbox(mb, (0.0, sy * 0.30, 0.66), (0.3, 0.05, 0.03), PL, e=0.25, n=(4, 8))
    # IFE screen on the back of the shell (for the row behind)
    sbox(mb, (0.59, 0, 1.0), (0.008, 0.19, 0.12), SCR, e=0.12, n=(12, 16), tilt=math.radians(8))
    # ottoman / foot well
    sbox(mb, (-0.72, 0, 0.3), (0.16, 0.2, 0.13), FAB, e=0.3, n=(6, 12))
    mb.add_box((-0.72, 0, 0.1), (0.25, 0.3, 0.2), mat=SHELL)
    # base
    mb.add_box((0.1, 0, 0.18), (0.6, 0.45, 0.36), mat=MET)
    ob = mb.build("Proto_SeatJ", [M["fabricJ"], M["headrest"], M["shell"], M["seatmetal"], M["seatscreen"],
                                  M["plastic"]], col=col)
    C.set_parent(ob, parent)


# pivots of the articulated passenger (design frame, seat origin): the simulator poses the head
# and both arms (shoulder + elbow) per instance for random motions (look around, phone, sleep, eat ...)
PAX_PIVOTS = dict(neck=(0.20, 0.0, 1.12), shoulderL=(0.19, 0.21, 1.00), shoulderR=(0.19, -0.21, 1.00),
                  elbowL=(0.13, 0.205, 0.70), elbowR=(0.13, -0.205, 0.70))
PAX_MATS = ["skin", "shirt", "pants", "hair", "shoes"]


def proto_pax(M, col, parent):
    """Seated passenger (origin = seat origin, facing -s), split into posable parts."""
    SK, SH, PA, HA, SO = 0, 1, 2, 3, 4
    lean = math.radians(12)
    n = (6, 12)
    mats = [M[k] for k in PAX_MATS]

    def part(name, fn):
        mb = C.MeshBuilder(TB)
        fn(mb)
        ob = mb.build(name, mats, col=col)
        C.set_parent(ob, parent)

    def body(mb):
        for sy in (-1, 1):
            sbox(mb, (0.0, sy * 0.10, 0.55), (0.14, 0.085, 0.1), PA, e=0.5, n=n)
            sbox(mb, (-0.2, sy * 0.10, 0.56), (0.22, 0.07, 0.07), PA, e=0.6, n=n)
            sbox(mb, (-0.43, sy * 0.10, 0.3), (0.055, 0.055, 0.23), PA, e=0.6, n=n, tilt=math.radians(-8))
            sbox(mb, (-0.5, sy * 0.10, 0.045), (0.12, 0.05, 0.045), SO, e=0.5, n=n)
        sbox(mb, (0.14, 0, 0.88), (0.11, 0.18, 0.27), SH, e=0.55, n=n, tilt=lean)
        sbox(mb, (0.19, 0, 1.1), (0.09, 0.2, 0.06), SH, e=0.5, n=n, tilt=lean)

    def head(mb):
        cyl(mb, (0.2, 0, 1.12), (0.22, 0, 1.22), 0.05, SK, n=10)
        sbox(mb, (0.21, 0, 1.31), (0.1, 0.08, 0.11), SK, e=0.9, n=(8, 12))
        sbox(mb, (0.235, 0, 1.335), (0.102, 0.09, 0.1), HA, e=0.8, n=(8, 12))
        sbox(mb, (0.12, 0, 1.30), (0.015, 0.02, 0.02), SK, e=0.9, n=(4, 6))       # nose
        for sy in (-1, 1):
            sbox(mb, (0.125, sy * 0.035, 1.335), (0.006, 0.012, 0.008), HA, e=0.8, n=(4, 6))   # eyes

    part("Proto_Pax", body)
    part("Proto_PaxHead", head)
    for sy, L in ((1, "L"), (-1, "R")):
        part("Proto_PaxUArm" + L, lambda mb, sy=sy: sbox(mb, (0.16, sy * 0.21, 0.86), (0.05, 0.05, 0.15), SH, e=0.6,
                                                           n=n, tilt=lean))

        def farm(mb, sy=sy):
            sbox(mb, (-0.02, sy * 0.2, 0.68), (0.15, 0.045, 0.045), SH, e=0.6, n=n)
            sbox(mb, (-0.2, sy * 0.17, 0.66), (0.05, 0.035, 0.03), SK, e=0.7, n=n)
        part("Proto_PaxFArm" + L, farm)


# --------------------------------------------------------------------------- cabin crew, cart, meal tray
CREW_PIVOTS = dict(shoulderL=(0.0, 0.20, 1.42), shoulderR=(0.0, -0.20, 1.42), hipL=(0.0, 0.09, 0.90),
                   hipR=(0.0, -0.09, 0.90))


def proto_crew(M, col, parent):
    """Standing flight attendant (origin between the feet, facing -s): body + head, arms, legs."""
    U, A, SK, HA, SO, PA = 0, 1, 2, 3, 4, 5
    mats = [M["uniform"], M["crewaccent"], M["crewskin"], M["crewhair"], M["shoes"], M["crewpants"]]
    n = (6, 12)

    def part(name, fn):
        mb = C.MeshBuilder(TB)
        fn(mb)
        ob = mb.build(name, mats, col=col)
        C.set_parent(ob, parent)

    def body(mb):
        sbox(mb, (0.0, 0, 1.22), (0.11, 0.18, 0.28), U, e=0.5, n=n)            # jacket
        sbox(mb, (0.0, 0, 0.95), (0.12, 0.17, 0.08), PA, e=0.5, n=n)           # hips
        sbox(mb, (0.0, 0, 1.46), (0.1, 0.21, 0.05), U, e=0.5, n=n)             # shoulders
        sbox(mb, (-0.1, 0, 1.40), (0.02, 0.06, 0.05), A, e=0.5, n=(4, 8))      # scarf
        mb.add_box((-0.105, 0.07, 1.30), (0.01, 0.05, 0.015), mat=A)          # name badge
        cyl(mb, (0.0, 0, 1.48), (0.0, 0, 1.56), 0.045, SK, n=10)
        sbox(mb, (0.0, 0, 1.64), (0.1, 0.08, 0.11), SK, e=0.9, n=(8, 12))
        sbox(mb, (0.03, 0, 1.67), (0.1, 0.09, 0.1), HA, e=0.8, n=(8, 12))
        sbox(mb, (0.11, 0, 1.64), (0.05, 0.05, 0.05), HA, e=0.8, n=(6, 8))     # bun
        sbox(mb, (-0.1, 0, 1.63), (0.015, 0.02, 0.02), SK, e=0.9, n=(4, 6))    # nose

    def arm(mb, sy):
        sbox(mb, (0.0, sy * 0.225, 1.26), (0.045, 0.045, 0.17), U, e=0.6, n=n)
        sbox(mb, (-0.01, sy * 0.225, 0.98), (0.04, 0.04, 0.13), U, e=0.6, n=n)
        sbox(mb, (-0.01, sy * 0.225, 0.81), (0.03, 0.025, 0.05), SK, e=0.7, n=n)

    def leg(mb, sy):
        sbox(mb, (0.0, sy * 0.09, 0.62), (0.06, 0.06, 0.28), PA, e=0.6, n=n)
        sbox(mb, (-0.03, sy * 0.09, 0.04), (0.11, 0.045, 0.04), SO, e=0.5, n=n)
        cyl(mb, (0.0, sy * 0.09, 0.34), (0.0, sy * 0.09, 0.07), 0.045, SK, n=8)   # stockings / ankles

    part("Proto_Crew", body)
    for sy, L in ((1, "L"), (-1, "R")):
        part("Proto_CrewArm" + L, lambda mb, sy=sy: arm(mb, sy))
        part("Proto_CrewLeg" + L, lambda mb, sy=sy: leg(mb, sy))


def proto_cart(M, col, parent):
    """Half-size galley trolley (0.30 wide x 0.81 x 1.03 m) with meal trays on top, origin on the floor."""
    AL, DK, TR, CUP = 0, 1, 2, 3
    mb = C.MeshBuilder(TB)
    mb.add_box((0, 0, 0.56), (0.81, 0.30, 0.95), mat=AL)
    for s_ in (-0.4, 0.4):
        mb.add_box((s_, 0, 0.56), (0.012, 0.28, 0.93), mat=DK)                  # door seams / latches
        mb.add_box((s_ * 1.01, 0.0, 0.95), (0.01, 0.12, 0.03), mat=TR)
    mb.add_box((0, 0, 1.045), (0.83, 0.32, 0.02), mat=DK)                       # top
    for (s_, y_) in ((-0.33, 0.1), (-0.33, -0.1), (0.33, 0.1), (0.33, -0.1)):
        cyl(mb, (s_, y_, 0.07), (s_, y_, 0.0), 0.045, DK, n=10)                 # castors
    cyl(mb, (0.42, -0.14, 0.95), (0.42, 0.14, 0.95), 0.012, AL, n=8)            # handle
    # drinks and cups on top
    for k in range(4):
        cyl(mb, (-0.25 + k * 0.1, 0.07, 1.055), (-0.25 + k * 0.1, 0.07, 1.26), 0.035, CUP if k % 2 else TR, n=10)
    for k in range(5):
        cyl(mb, (0.05 + k * 0.06, -0.08, 1.055), (0.05 + k * 0.06, -0.08, 1.14), 0.03, CUP, n=8)
    ob = mb.build("Proto_Cart", [M["cartalu"], M["dark"], M["cartred"], M["cup"]], col=col)
    C.set_parent(ob, parent)


def proto_tray(M, col, parent):
    """Meal on a deployed tray table (origin = passenger seat origin, table 0.45 m ahead)."""
    TB_, TRAY, DISH, FOOD, CUP, SAL = 0, 1, 2, 3, 4, 5
    mb = C.MeshBuilder(TB)
    s0, z0 = -0.45, 0.70
    mb.add_box((s0, 0, z0), (0.26, 0.40, 0.018), mat=TB_)                     # tray table
    mb.add_box((s0, 0, z0 + 0.018), (0.25, 0.36, 0.012), mat=TRAY)
    cyl(mb, (s0 - 0.03, 0.06, z0 + 0.024), (s0 - 0.03, 0.06, z0 + 0.05), 0.075, DISH, n=16)   # main dish
    sbox(mb, (s0 - 0.03, 0.06, z0 + 0.052), (0.05, 0.06, 0.012), FOOD, e=0.6, n=(4, 10))
    mb.add_box((s0 + 0.06, -0.09, z0 + 0.035), (0.08, 0.1, 0.025), mat=SAL)   # salad bowl
    cyl(mb, (s0 - 0.07, -0.12, z0 + 0.024), (s0 - 0.07, -0.12, z0 + 0.09), 0.03, CUP, n=10)   # cup
    sbox(mb, (s0 + 0.07, 0.1, z0 + 0.04), (0.035, 0.03, 0.02), FOOD, e=0.7, n=(4, 8))       # bread roll
    ob = mb.build("Proto_Tray", [M["dark"], M["trayplastic"], M["dish"], M["food"], M["cup"], M["salad"]], col=col)
    C.set_parent(ob, parent)


# --------------------------------------------------------------------------- entry
def build_cabin(col, tex):
    generate_textures()
    M = materials(tex)
    root = C.empty("B787-9_Cabin", col=col)   # (name kept for every type: the simulator looks it up)
    build_lining(M, root, col)
    build_ceiling_and_bins(M, root, col, zones_for_bins())
    build_floor(M, root, col)
    build_monuments(M, root, col)
    protos = C.empty("Cabin_Prototypes", col=col, parent=root)
    proto_seat_y(M, col, protos)
    proto_seat_j(M, col, protos)
    proto_pax(M, col, protos)
    proto_crew(M, col, protos)
    proto_cart(M, col, protos)
    proto_tray(M, col, protos)
    seats = seat_map()
    my = next((i for i, st in enumerate(seats) if st["l"] == "A" and abs(st["s"] - MY_SEAT_S) < 0.2), None)
    y_win = seats[my]["y"] - 0.07 if my is not None else 1.0
    if G.TYPE != "b789":
        # small windows: put the eye close to the window reveal so the wing is in view
        y_win = max(y_win, lining_y(MY_SEAT_S, FL + 1.18) - 0.16)
    counts = {}
    for st in seats:
        counts[st["c"]] = counts.get(st["c"], 0) + 1
    info = dict(
        seats=[dict(c=st["c"], r=st["row"], l=st["l"], p=st["p"], w=st["w"]) for st in seats],
        counts=counts, total=len(seats),
        mySeat=my,
        views=dict(
            aisle=G.to_three([MY_SEAT_S + 1.55, CABIN["aisle_y"], FL + 1.62]),
            window=G.to_three([MY_SEAT_S + 0.08, y_win, FL + 1.18]),
        ),
        paxMass=100,
        protoOrigin=G.to_three([0.0, 0.0, 0.0]),
        paxPivots={k: G.to_three(list(v)) for k, v in PAX_PIVOTS.items()},
        crewPivots={k: G.to_three(list(v)) for k, v in CREW_PIVOTS.items()},
        aisles=[-y for y in AISLES],
        floorY=FL,
        galley=G.to_three([S0 + 1.0, 0.0, FL])[0],
        jOffset=[-0.12, 0.03, 0.0],
    )
    print("cabin seats:", counts, "total", len(seats))
    return root, info
