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
    "ma3": dict(S0=5.66, S1=40.15, BAND=(-0.38, 0.84), CEIL=1.46, BIN_BOT=1.00, BIN_FRONT=0.72, centre=False,
                aisle_y=0.0),
    "ma7": dict(S0=7.85, S1=61.35, BAND=(-0.55, 0.95), CEIL=1.45, BIN_BOT=0.97, BIN_FRONT=1.36, centre=True,
                aisle_y=0.955),
    "ma9": dict(S0=8.42, S1=69.1, BAND=(-0.80, 0.70), CEIL=1.35, BIN_BOT=0.82, BIN_FRONT=2.0, centre=True,
                aisle_y=1.30),
    # 747-400: the main deck runs into the nose (the flight deck is upstairs)
    "b744": dict(S0=4.6, S1=60.6, BAND=(-0.63, 0.87), CEIL=1.45, BIN_BOT=1.02, BIN_FRONT=1.55, centre=True,
                 aisle_y=1.20),
    # (the A340 floor sits 0.55 m higher in the section than the 787's: heights follow it, so the
    # bins clear the window tops and the ceiling is ~2.4 m above the floor)
    "maw": dict(S0=6.6, S1=65.0, BAND=(0.0, 1.30), CEIL=1.95, BIN_BOT=1.47, BIN_FRONT=1.30, centre=True,
                aisle_y=1.20),
    "at76": dict(S0=3.95, S1=21.3, BAND=(-0.49, 0.73), CEIL=1.20, BIN_BOT=0.80, BIN_FRONT=0.50, centre=False,
                 aisle_y=0.0),
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
    return G.window_stations(skip_exits=False)


# --------------------------------------------------------------------------- section helpers
_PHI = np.linspace(0, 2 * math.pi, 1441)


def skin_y(s, z):
    """Half width of the skin at station s and height z (left side, >0)."""
    y, zz = G.fus_section(s, _PHI)
    m = y > 0
    o = np.argsort(zz[m])
    return np.interp(z, zz[m][o], y[m][o])


def lining_pt(s, z_skin, side, extra=0.0):
    """Lining point radially inset from the skin point at (s, z_skin) (extra: further inwards)."""
    y = float(skin_y(s, z_skin))
    zc = float(G.fus_profile(s)[3])
    r = math.hypot(y, z_skin - zc)
    k = max(r - LINE - extra, 0.05) / max(r, 1e-6)
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
        # (the bezel around the opening is geometry: build_lining)
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


def _tile_noise(W, scales, seed):
    """tileable value noise (sum of bicubic-upsampled random grids), mean ~0.5"""
    rng = np.random.default_rng(seed)
    out = np.zeros((W, W), np.float32)
    tot = 0.0
    for k, a in scales:
        g = rng.random((k, k)).astype(np.float32)
        g = np.tile(g, (3, 3))
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((W * 3, W * 3), Image.BICUBIC)
        out += a * np.asarray(im, np.float32)[W:2 * W, W:2 * W] / 255
        tot += a
    return out / tot


def carpet_texture(W=1024):
    """Tileable carpet (1 m tile): dense cut-pile in deep blue-grey, a heather of darker and lighter
    yarns and a small geometric motif (the airline pattern of most long-haul cabins)."""
    rng = np.random.default_rng(3)
    x = (np.arange(W) + 0.5) / W
    X, Y = np.meshgrid(x, x)
    base = np.array([0.155, 0.175, 0.235], np.float32)
    col = np.empty((W, W, 3), np.float32)
    col[:] = base
    # pile: per-pixel tufts, slightly clumped, plus a soft heather
    n = rng.random((W, W)).astype(np.float32)
    n = (n + np.roll(n, 1, 0) + np.roll(n, 1, 1)) / 3
    col *= (0.78 + 0.44 * n)[..., None]
    col *= (0.88 + 0.24 * _tile_noise(W, [(16, 1.0), (64, 0.6)], 5))[..., None]
    # motif: small staggered squares on a 12.5 cm grid, one in a lighter yarn
    gx, gy = (X * 8) % 1, (Y * 8) % 1
    stag = ((np.floor(Y * 8) % 2) * 0.5)
    gx = (X * 8 + stag) % 1
    sq = np.maximum(np.abs(gx - 0.5), np.abs(gy - 0.5))
    ring = np.clip(1 - np.abs(sq - 0.16) / 0.025, 0, 1)
    col = col * (1 - 0.45 * ring[..., None]) + np.array([0.36, 0.38, 0.47], np.float32) * 0.45 * ring[..., None]
    dot = np.clip(1 - sq / 0.05, 0, 1)
    col = col * (1 - 0.5 * dot[..., None]) + np.array([0.55, 0.45, 0.32], np.float32) * 0.5 * dot[..., None]
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "cabin_carpet.jpg"), quality=88)


def fabric_texture(W=512):
    """Seat cover (u = across the seat, v = up the seat): a woven melange, close to white so the
    airline tint multiplies it, with a fine twill, slightly darker side panels and a centre band."""
    rng = np.random.default_rng(11)
    x = (np.arange(W) + 0.5) / W
    X, Y = np.meshgrid(x, x)
    v = 0.80 + 0.10 * (_tile_noise(W, [(32, 1.0), (128, 0.8)], 7) - 0.5)
    n = rng.random((W, W)).astype(np.float32)
    v *= 0.90 + 0.20 * n                                            # yarn melange
    tw = 0.5 + 0.5 * np.sin((X * W + Y * W) * 2 * math.pi / 3.0)   # 3 px twill
    v *= 0.94 + 0.08 * tw
    side = 1 - C.smoothstep(0.10, 0.13, X) * C.smoothstep(0.90, 0.87, X)
    v *= 1 - 0.16 * side
    seam = np.clip(1 - np.abs(np.abs(X - 0.5) - 0.38) / 0.004, 0, 1)
    v *= 1 - 0.35 * seam
    band = C.smoothstep(0.0, 0.01, np.abs(Y - 0.62) - 0.06)
    v *= 0.93 + 0.07 * band
    col = np.stack([v, v * 0.99, v * 0.985], -1)
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "cabin_fabric.jpg"), quality=88)


def lining_texture(W=512):
    """Sidewall / bin / ceiling laminate (1 m tile): a fine stipple grain, near white."""
    v = 0.95 + 0.05 * (_tile_noise(W, [(64, 1.0), (256, 1.0)], 21) - 0.5) * 2
    rng = np.random.default_rng(22)
    v *= 0.985 + 0.03 * rng.random((W, W)).astype(np.float32)
    col = np.stack([v, v, v], -1)
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "cabin_grain.jpg"), quality=85)


def _font(px, bold=True):
    from PIL import ImageFont
    for f in (("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"), "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(f, px)
        except OSError:
            pass
    return ImageFont.load_default()


def psu_texture(W=1024, H=256):
    """Passenger service unit strip under the bins (u along the cabin over one 1.62 m bin, v across
    from the aisle edge to the sidewall): per row three reading lights, three gaspers and the call
    button; a lit seat-belt / no-smoking sign panel. Colour + emission maps."""
    from PIL import ImageDraw
    col = Image.new("RGB", (W, H), (214, 212, 206))
    emi = Image.new("RGB", (W, H), (0, 0, 0))
    d, e = ImageDraw.Draw(col), ImageDraw.Draw(emi)
    # panel joints
    for u in (0.0, 0.5, 1.0):
        d.line([(u * W, 0), (u * W, H)], fill=(150, 150, 146), width=3)
    d.line([(0, 6), (W, 6)], fill=(170, 170, 165), width=4)
    for r in range(2):                         # two rows per bin
        u0 = (0.12 + r * 0.5) * W
        for j in range(3):
            cx, cy = u0 + j * 0.075 * W, 0.34 * H
            d.ellipse([cx - 17, cy - 17, cx + 17, cy + 17], fill=(120, 122, 124))       # reading light bezel
            d.ellipse([cx - 11, cy - 11, cx + 11, cy + 11], fill=(236, 236, 230))       # lens
            gx, gy = cx, 0.70 * H                                                     # gasper
            d.ellipse([gx - 15, gy - 15, gx + 15, gy + 15], fill=(176, 176, 172))
            d.ellipse([gx - 7, gy - 7, gx + 7, gy + 7], fill=(60, 62, 66))
            d.rectangle([cx - 8, 0.48 * H, cx + 8, 0.53 * H], fill=(90, 92, 96))         # light switch
        # call button
        bx = u0 + 0.255 * W
        d.ellipse([bx - 12, 0.34 * H - 12, bx + 12, 0.34 * H + 12], fill=(60, 64, 70))
        d.ellipse([bx - 7, 0.34 * H - 7, bx + 7, 0.34 * H + 7], fill=(240, 236, 228))
        # sign panel: seat belt + no smoking pictograms
        sx = u0 + 0.30 * W
        d.rounded_rectangle([sx, 0.18 * H, sx + 0.09 * W, 0.56 * H], 8, fill=(28, 30, 34))
        for k, glyph in enumerate(("belt", "smoke")):
            gx0 = sx + 8 + k * 0.045 * W
            box = [gx0, 0.24 * H, gx0 + 0.035 * W, 0.50 * H]
            for dr, c in ((d, (200, 200, 196)), (e, (210, 205, 190))):
                if glyph == "belt":
                    dr.arc([box[0] + 4, box[1] + 10, box[2] - 4, box[3] - 4], 200, 340, fill=c, width=5)
                    dr.rectangle([box[0] + 14, box[3] - 22, box[2] - 14, box[3] - 12], fill=c)
                else:
                    dr.rectangle([box[0] + 5, box[1] + 28, box[2] - 5, box[1] + 38], fill=c)
                    dr.line([box[0] + 3, box[3] - 4, box[2] - 3, box[1] + 4], fill=c, width=4)
    col.save(os.path.join(TEX, "cabin_psu.jpg"), quality=88)
    emi.save(os.path.join(TEX, "cabin_psu_e.jpg"), quality=88)


def exit_texture(W=256, H=96):
    """EXIT / 非常口 sign (green pictogram style)."""
    from PIL import ImageDraw
    im = Image.new("RGB", (W, H), (18, 150, 70))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, W - 4, H - 4], outline=(235, 255, 240), width=3)
    d.text((W * 0.40, H * 0.5), "EXIT", font=_font(46), fill=(245, 255, 248), anchor="mm")
    # running figure + arrow
    d.ellipse([18, 18, 32, 32], fill=(245, 255, 248))
    d.line([(25, 34), (22, 58), (14, 78)], fill=(245, 255, 248), width=6)
    d.line([(22, 58), (34, 78)], fill=(245, 255, 248), width=6)
    d.line([(10, 44), (40, 46)], fill=(245, 255, 248), width=5)
    d.polygon([(W - 46, H * 0.3), (W - 18, H * 0.5), (W - 46, H * 0.7)], fill=(245, 255, 248))
    im.save(os.path.join(TEX, "cabin_exit.jpg"), quality=90)


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
    fabric_texture()
    lining_texture()
    psu_texture()
    exit_texture()


# --------------------------------------------------------------------------- materials
def materials(tex):
    P = C.pbr_material
    h = C.hex_color
    return {
        "wall": P("Cabin_Sidewall", color=h("#e6e3dc"), roughness=0.75, base_tex=tex("cabin_sidewall.png"),
                  alpha_from_tex=True),
        "lining": P("Cabin_Lining", color=h("#ece9e2"), roughness=0.8, base_tex=tex("cabin_grain.jpg")),
        "reveal": P("Cabin_Reveal", color=h("#e6e3dc"), roughness=0.55, double_sided=True),
        "dado": P("Cabin_Dado", color=h("#8d8a86"), roughness=0.85),
        "ceiling": P("Cabin_Ceiling", color=h("#f3f1ec"), roughness=0.7, base_tex=tex("cabin_grain.jpg")),
        "bin": P("Cabin_Bin", color=h("#efede8"), roughness=0.45, base_tex=tex("cabin_grain.jpg")),
        "psu": P("Cabin_PSU", color=h("#ffffff"), roughness=0.5, base_tex=tex("cabin_psu.jpg"),
                 emissive_tex=tex("cabin_psu_e.jpg"), emission_strength=1.5),
        "shade": P("Cabin_Shade", color=h("#e4e2dc"), roughness=0.6),
        "exitsign": P("Cabin_ExitSign", color=h("#ffffff"), roughness=0.4, base_tex=tex("cabin_exit.jpg"),
                      emissive_tex=tex("cabin_exit.jpg"), emission_strength=2.0),
        "binline": P("Cabin_BinLine", color=h("#9da2a8"), roughness=0.4, metallic=0.6),
        "mood": P("Cabin_Mood", color=h("#c8c2ff"), roughness=0.5, emission=h("#b9b0ff"), emission_strength=2.5),
        "light": P("Cabin_Light", color=h("#fff4e6"), roughness=0.4, emission=h("#fff1dc"), emission_strength=3.0),
        "exit": P("Cabin_Exit", color=h("#1fd060"), roughness=0.4, emission=h("#26ff6a"), emission_strength=3.0),
        "floorlight": P("Cabin_FloorLight", color=h("#fff2d8"), roughness=0.4, emission=h("#ffe2b0"), emission_strength=1.2),
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
        "fabricY": P("Seat_FabricY", color=h("#ffffff"), roughness=0.95, base_tex=tex("cabin_fabric.jpg")),
        "fabricJ": P("Seat_FabricJ", color=h("#ffffff"), roughness=0.75, base_tex=tex("cabin_fabric.jpg")),
        "shell": P("Seat_Shell", color=h("#e9e6df"), roughness=0.35),
        "plastic": P("Seat_Plastic", color=h("#b4b3ae"), roughness=0.45),
        "headrest": P("Seat_Headrest", color=h("#f2efe8"), roughness=0.9),
        "seatmetal": P("Seat_Metal", color=h("#a7adb3"), roughness=0.3, metallic=0.85),
        "seatdark": P("Seat_Trim", color=h("#2b2d31"), roughness=0.55),
        "belt": P("Seat_Belt", color=h("#3a3d42"), roughness=0.8),
        "accent": P("Seat_Accent", color=h("#6e5440"), roughness=0.4),
        "seatscreen": P("Seat_Screen", color=h("#0d1015"), roughness=0.15, base_tex=tex("cabin_screen.jpg"),
                        emissive_tex=tex("cabin_screen.jpg"), emission_strength=1.0),
        # passengers (colours varied per instance in the simulator)
        "skin": P("Pax_Skin", color=h("#e0b896"), roughness=0.6),
        "shirt": P("Pax_Shirt", color=h("#ffffff"), roughness=0.9),
        "pants": P("Pax_Pants", color=h("#ffffff"), roughness=0.9),
        "hair": P("Pax_Hair", color=h("#ffffff"), roughness=0.7),
        "shoes": P("Pax_Shoes", color=h("#1d1d20"), roughness=0.5),
        "hairlong": P("Pax_HairLong", color=h("#ffffff"), roughness=0.7, double_sided=True),
        "brow": P("Pax_Brow", color=h("#ffffff"), roughness=0.8),
        "eyewhite": P("Pax_EyeWhite", color=h("#e9e4dc"), roughness=0.25),
        "hairbun": P("Pax_HairBun", color=h("#ffffff"), roughness=0.7),
        "glasses": P("Pax_Glasses", color=h("#1a1b1e"), roughness=0.3),
        "eye": P("Pax_Eye", color=h("#17120f"), roughness=0.2),
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
    ss = np.unique(np.r_[np.linspace(S0, S1, 140), np.linspace(S1 - 9.4, S1, 40)])
    for side in (1, -1):
        # window band (textured, alpha cut-outs)
        zs = np.linspace(BAND[0], BAND[1], 12)
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
        mb.add_grid(P, np.stack([P[..., 0], P[..., 2]], -1), mat=1, outward=("dir", (0, -side, 0)))
    ob = mb.build("Cabin_Lining", [M["wall"], M["lining"], M["dado"]], col=col)
    C.set_parent(ob, parent)

    # window reveals: rounded-rect tunnels from the lining opening to the skin, plus a tinted pane,
    # framed by a slightly raised bezel that overlaps the edge of the cut-out in the sidewall
    rv = C.MeshBuilder(TB)
    inner = rr_outline(HOLE_W, HOLE_H, HOLE_R)
    bezel = rr_outline(HOLE_W + 0.075, HOLE_H + 0.075, HOLE_R + 0.037)
    outer = rr_outline(WIN_W + 0.02, WIN_H + 0.02, 0.11)
    for side in (1, -1):
        for wc in windows():
            a0 = np.array([lining_pt(wc + ds, WIN_Z + dz, side, 0.014) for ds, dz in inner])
            a1 = np.array([lining_pt(wc + ds, WIN_Z + dz, side, 0.011) for ds, dz in bezel])
            a2 = np.array([lining_pt(wc + ds, WIN_Z + dz, side, -0.003) for ds, dz in bezel])
            b = []
            for ds, dz in outer:
                y = float(skin_y(wc + ds, WIN_Z + dz)) - 0.02
                b.append((wc + ds, side * y, WIN_Z + dz))
            b = np.array(b)
            cax = np.array([wc, side * float(skin_y(wc, WIN_Z)) * 0.9, WIN_Z])     # on the window axis
            # tunnel: normals towards the window axis (seen from inside the opening)
            P = np.stack([a0, b], 0)
            N, _ = C.MeshBuilder.grid_normals(P, wrap_v=True)
            if np.sum(N * (P - cax)) > 0:
                N = -N
            rv.add_grid(P, N=N, mat=4, wrap_v=True, smooth=True)
            # bezel: flat frame facing the cabin + its outer lip down to the lining
            for Q in (np.stack([a1, a0], 0), np.stack([a2, a1], 0)):
                rv.add_grid(Q, mat=4, wrap_v=True, outward=("dir", (0, -side, 0)))
            # inner pane just inside the skin (electro-chromic window, slightly tinted)
            pane = b.copy()
            pane[:, 1] -= side * 0.03
            rv.add_poly(pane[:-1], mat=1, outward=("dir", (0, -side, 0)))
            # window shade, pulled down by a random amount (yours and your neighbours' are open)
            f = SHADES[side].get(int(round((wc - SHADE_X0) / WIN_PITCH)), 0.0)
            if f > 0.01:
                yy = side * (float(skin_y(wc, WIN_Z)) - 0.06)
                zt, zb = WIN_Z + WIN_H / 2 + 0.01, WIN_Z + WIN_H / 2 + 0.01 - f * (WIN_H + 0.02)
                hw = WIN_W / 2 + 0.005
                rv.add_poly([(wc - hw, yy, zb), (wc + hw, yy, zb), (wc + hw, yy, zt), (wc - hw, yy, zt)], mat=2,
                            outward=("dir", (0, -side, 0)))
                rv.add_box((wc, yy - side * 0.006, zb + 0.008), (0.06, 0.01, 0.014), mat=3)     # pull tab
    ob = rv.build("Cabin_Reveals", [M["lining"], M["glass"], M["shade"], M["dark"], M["reveal"]], col=col)
    C.set_parent(ob, parent)


def rr_outline(w, h, r, edge=(6, 4), arc=7):
    """closed rounded rectangle (s, z offsets): fixed point counts per edge / corner arc, so that
    outlines of different sizes correspond point by point (no twisted quads between them).
    Last point = first point."""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    a, b = w / 2 - r, h / 2 - r
    pts = []

    def line(p0, p1, n):
        for k in range(n):
            t = k / n
            pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))

    def corner(cx, cz, a0):
        for k in range(arc):
            t = a0 + (k / arc) * math.pi / 2
            pts.append((cx + r * math.cos(t), cz + r * math.sin(t)))
    line((w / 2, -b), (w / 2, b), edge[0]); corner(a, b, 0.0)
    line((a, h / 2), (-a, h / 2), edge[1]); corner(-a, b, math.pi / 2)
    line((-w / 2, b), (-w / 2, -b), edge[0]); corner(-a, -b, math.pi)
    line((-a, -h / 2), (a, -h / 2), edge[1]); corner(a, -b, 1.5 * math.pi)
    pts.append(pts[0])
    return np.array(pts)


def psu_strip(mb, sc, yc, z, L, width, mat, side=1):
    """passenger service unit under a bin: a thin panel whose underside carries the PSU texture"""
    mb.add_box((sc, yc, z + 0.012), (L, width, 0.024), mat=1)
    s0, s1 = sc - L / 2, sc + L / 2
    ya, yw = yc - side * width / 2, yc + side * width / 2          # aisle edge -> wall
    zz = z - 0.0005
    mb.add_poly([(s0, ya, zz), (s1, ya, zz), (s1, yw, zz), (s0, yw, zz)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)],
                mat=mat, outward=("dir", (0, 0, -1)))


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
    mb.add_grid(P, np.stack([P[..., 0], P[..., 1]], -1), mat=0, outward=("dir", (0, 0, -1)))
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
                # passenger service units under the bin: reading lights, gaspers, call button, signs
                psu_strip(mb, s + L / 2, side * (BIN_FRONT + 0.45), BIN_BOT - 0.045, L - 0.05, 0.5, 6, side)
            s += L
    # centre bins over the middle seat block in the seating zones
    for (za, zb) in (zones if CABIN["centre"] else []):
        s = za
        while s + 1.5 <= zb + 0.01:
            L = min(1.62, zb - s)
            cb = BIN_BOT + 0.09            # centre bin bottom (~2.05 m above the floor)
            prof = lambda _s, cb=cb: [(-0.72, cb), (0.72, cb), (0.76, cb + 0.18), (0.70, CEIL + 0.1),
                                      (-0.70, CEIL + 0.1), (-0.76, cb + 0.18)]
            extrude_profile(mb, prof, s, s + L - 0.012, 1)
            for side in (1, -1):
                mb.add_box((s + L / 2, side * 0.745, cb + 0.14), (0.3, 0.012, 0.03), mat=2)
            mb.add_box((s + L / 2, 0, cb - 0.005 + 0.012), (L - 0.05, 1.0, 0.022), mat=1)
            for side in (1, -1):
                psu_strip(mb, s + L / 2, side * 0.25, cb - 0.006, L - 0.05, 0.5, 6, side)
            s += L
    ob = mb.build("Cabin_Overhead", [M["ceiling"], M["bin"], M["binline"], M["mood"], M["light"], M["dark"],
                                     M["psu"]], col=col)
    C.set_parent(ob, parent)


def build_floor(M, parent, col):
    mb = C.MeshBuilder(TB)
    ss = np.linspace(S0, S1, int((S1 - S0) / 0.2) + 1)       # fine enough to carry the baked seat shadows
    ys = np.linspace(-1, 1, 17)
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
    # floor proximity lighting along the aisles (emergency path marking)
    for ya in AISLES:
        for dy in (-0.27, 0.27):
            mb.add_box((0.5 * (S0 + S1), ya + dy, FL + 0.004), (S1 - S0 - 3.0, 0.018, 0.008), mat=2)
    ob = mb.build("Cabin_Floor", [M["carpet"], M["floor"], M["floorlight"]], col=col)
    C.set_parent(ob, parent)


# --------------------------------------------------------------------------- monuments
def lavatory(mb, sa, sb, side, open_door=False):
    """Lavatory against the sidewall: y from the aisle edge to the lining."""
    h = FL + 2.05
    # outboard face: inside the lining up to the lav ceiling (narrow fuselages curve in)
    yo = min(lining_y(0.5 * (sa + sb), 0.0), lining_y(min(sa, sb), h), lining_y(max(sa, sb), h)) - 0.02
    yi = 1.05 if yo > 2.0 else max(0.45, yo - 1.1)
    Y = lambda y: side * y
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
    # keep the 2.1 m tall block inside the lining (narrow fuselages, tapering tail)
    lim = min(lining_y(sa, FL + 2.1), lining_y(sb, FL + 2.1)) - 0.02
    y0, y1 = max(-lim, min(lim, y0)), max(-lim, min(lim, y1))
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
            M["exit"], M["screen"], M["exitsign"]]
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
    elif G.TYPE in MONUMENTS:
        monuments_table(mb, MONUMENTS[G.TYPE])
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


# original designs: (kind, s0, s1, args) -- lav: side; galley: y0, y1, facing; div: blocks
MONUMENTS = {
    "ma3": [("lav", 6.55, 7.65, 1), ("gal", 6.55, 7.65, (-0.35, -1.75, +1)),
            ("div", 10.95, None, [(0.35, 1.85), (-1.85, -0.35)]),
            ("lav", 37.6, 38.6, 1), ("lav", 37.6, 38.6, -1), ("gal", 39.75, 40.1, (-1.3, 1.3, -1))],
    "ma7": [("lav", 8.6, 9.8, 1), ("gal", 8.6, 9.8, (-0.45, -2.2, +1)),
            ("div", 10.05, None, [(0.7, 2.6), (-0.68, 0.68), (-2.6, -0.7)]),
            ("lav", 20.4, 21.6, 1), ("lav", 20.4, 21.6, -1), ("gal", 20.4, 21.6, (-0.45, 0.45, +1)),
            ("div", 21.7, None, [(0.7, 2.6), (-0.7, 0.7), (-2.6, -0.7)]),
            ("lav", 43.5, 44.1, 1), ("lav", 43.5, 44.1, -1),
            ("lav", 58.4, 59.2, 1), ("lav", 58.4, 59.2, -1), ("gal", 60.5, 61.3, (-1.1, 1.1, -1))],
    "ma9": [("lav", 9.1, 10.3, 1), ("gal", 9.1, 10.3, (-0.5, -2.6, +1)),
            ("div", 10.6, None, [(0.75, 3.1), (-0.75, 0.75), (-3.1, -0.75)]),
            ("lav", 22.5, 23.4, 1), ("lav", 22.5, 23.4, -1), ("gal", 22.5, 23.4, (-0.7, 0.7, +1)),
            ("div", 23.5, None, [(1.6, 3.1), (-1.0, 1.0), (-3.1, -1.6)]),
            ("lav", 37.2, 38.2, 1), ("lav", 37.2, 38.2, -1),
            ("lav", 54.4, 55.4, 1), ("lav", 54.4, 55.4, -1),
            ("lav", 66.8, 67.6, 1), ("lav", 66.8, 67.6, -1), ("gal", 68.3, 69.0, (-1.4, 1.4, -1))],
    # doors 9.5 / 19.3 / 31.9 / 42.4 / 57.2 (measured): galley and lavatories behind each
    "b744": [("gal", 10.45, 11.25, (-0.6, 0.6, +1)),
             ("lav", 20.15, 20.95, 1), ("lav", 20.15, 20.95, -1), ("gal", 20.15, 20.95, (-0.7, 0.7, +1)),
             ("div", 21.2, None, [(1.6, 3.0), (-0.95, 0.95), (-3.0, -1.6)]),
             ("lav", 32.85, 33.65, 1), ("lav", 32.85, 33.65, -1),
             ("lav", 43.35, 44.15, 1), ("lav", 43.35, 44.15, -1),
             ("lav", 58.1, 58.9, 1), ("lav", 58.1, 58.9, -1), ("gal", 59.3, 60.1, (-1.2, 1.2, -1))],
    "maw": [("lav", 16.5, 17.3, 1), ("gal", 16.5, 17.3, (-0.6, 0.6, +1)),
            ("div", 17.5, None, [(1.4, 2.6), (-0.9, 0.9), (-2.6, -1.4)]),
            ("lav", 25.7, 26.5, 1), ("lav", 25.7, 26.5, -1),
            ("lav", 63.1, 63.9, 1), ("lav", 63.1, 63.9, -1), ("gal", 64.1, 64.8, (-1.2, 1.2, -1))],
    "at76": [("gal", 4.0, 4.7, (-0.3, -1.1, +1)), ("lav", 19.4, 20.3, -1)],
}


def monuments_table(mb, T):
    for kind, a, b, arg in T:
        if kind == "lav":
            lavatory(mb, a, b, arg)
        elif kind == "gal":
            galley(mb, a, b, *arg)
        else:
            divider(mb, a, arg, 1)


def finish_monuments(mb):
    # aft wall
    wall(mb, S1, FL, CEIL + 0.3, 0)
    # exit signs above every door, both sides
    for dc in DOORS:
        for side in (1, -1):
            y = side * min(lining_y(dc, 1.1) - 0.12, BIN_FRONT + 0.3)
            mb.add_box((dc, y, CEIL), (0.32, 0.03, 0.1), mat=6)
            yf = y - side * 0.016
            mb.add_poly([(dc + 0.15, yf, CEIL - 0.045), (dc - 0.15, yf, CEIL - 0.045), (dc - 0.15, yf, CEIL + 0.045),
                         (dc + 0.15, yf, CEIL + 0.045)], uvs=[(0, 0), (1, 0), (1, 1), (0, 1)] if side > 0 else
                        [(1, 0), (0, 0), (0, 1), (1, 1)], mat=9, outward=("dir", (0, -side, 0)))
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
    # MA-300: business 2-2, economy 3-3 at 18.5 in seats (two over-wing exit rows)
    "ma3": [
        ("J", 8.0, 0.97, 3, [(0.98, 2, 0.56), (-0.98, 2, 0.56)], "AC" "DF"),
        ("Y", 11.6, 0.80, 9, [(1.03, 3, 0.47), (-1.03, 3, 0.47)], "ABC" "DEF"),
        ("Y", 19.45, 0.90, 2, [(1.03, 3, 0.47), (-1.03, 3, 0.47)], "ABC" "DEF"),
        ("Y", 21.2, 0.80, 20, [(1.03, 3, 0.47), (-1.03, 3, 0.47)], "ABC" "DEF"),
    ],
    # MA-700: business 2-2-2, premium 2-3-2, economy 3-3-3 (the 787 cabin, stretched)
    "ma7": [
        ("J", 10.9, 1.5, 5, [(1.91, 2, 0.66), (0.0, 2, 0.66), (-1.91, 2, 0.66)], "AC" "DG" "HK"),
        ("W", 22.1, 0.97, 4, [(1.81, 2, 0.50), (0.0, 3, 0.50), (-1.81, 2, 0.50)], "AC" "DEG" "HK"),
        ("Y", 26.1, 0.86, 20, [(1.91, 3, 0.46), (0.0, 3, 0.46), (-1.91, 3, 0.46)], "ABC" "DEG" "HJK"),
        ("Y", 45.7, 0.86, 14, [(1.91, 3, 0.46), (0.0, 3, 0.46), (-1.91, 3, 0.46)], "ABC" "DEG" "HJK"),
    ],
    # MA-900: business 2-2-2, premium 2-4-2, economy 3-4-3 at 20 in seats
    "ma9": [
        ("J", 11.4, 1.55, 6, [(2.25, 2, 0.70), (0.0, 2, 0.70), (-2.25, 2, 0.70)], "AC" "DG" "HK"),
        ("W", 24.2, 0.97, 5, [(2.30, 2, 0.52), (0.0, 4, 0.52), (-2.30, 2, 0.52)], "AC" "DEFG" "HK"),
        ("Y", 29.0, 0.86, 9, [(2.35, 3, 0.50), (0.0, 4, 0.50), (-2.35, 3, 0.50)], "ABC" "DEFG" "HJK"),
        ("Y", 38.9, 0.86, 17, [(2.35, 3, 0.50), (0.0, 4, 0.50), (-2.35, 3, 0.50)], "ABC" "DEFG" "HJK"),
        ("Y", 56.1, 0.86, 11, [(2.35, 3, 0.50), (0.0, 4, 0.50), (-2.35, 3, 0.50)], "ABC" "DEFG" "HJK"),
    ],
    # 747-400 main deck: first class in the nose, business 2-3-2, economy 3-4-3
    "b744": [
        ("J", 5.0, 1.25, 3, [(1.15, 2, 0.62), (-1.15, 2, 0.62)], "AC" "HK"),
        ("J", 12.0, 1.25, 5, [(2.15, 2, 0.60), (0.0, 3, 0.60), (-2.15, 2, 0.60)], "AC" "DEG" "HK"),
        ("Y", 21.9, 0.81, 11, [(2.30, 3, 0.46), (0.0, 4, 0.46), (-2.30, 3, 0.46)], "ABC" "DEFG" "HJK"),
        ("Y", 34.1, 0.81, 9, [(2.30, 3, 0.46), (0.0, 4, 0.46), (-2.30, 3, 0.46)], "ABC" "DEFG" "HJK"),
        ("Y", 44.5, 0.81, 14, [(2.30, 3, 0.46), (0.0, 4, 0.46), (-2.30, 3, 0.46)], "ABC" "DEFG" "HJK"),
    ],
    # MA-W8: business 2-2-2, economy 2-4-2 (A340-600 cabin)
    "maw": [
        ("J", 7.6, 1.45, 6, [(1.85, 2, 0.60), (0.0, 2, 0.60), (-1.85, 2, 0.60)], "AC" "DG" "HK"),
        ("Y", 18.2, 0.81, 6, [(1.95, 2, 0.46), (0.0, 4, 0.46), (-1.95, 2, 0.46)], "AC" "DEFG" "HK"),
        ("Y", 27.1, 0.81, 24, [(1.95, 2, 0.46), (0.0, 4, 0.46), (-1.95, 2, 0.46)], "AC" "DEFG" "HK"),
        ("Y", 48.9, 0.81, 15, [(1.95, 2, 0.46), (0.0, 4, 0.46), (-1.95, 2, 0.46)], "AC" "DEFG" "HK"),
    ],
    # ATR 72-600: 2-2
    "at76": [
        ("Y", 5.2, 0.76, 19, [(0.70, 2, 0.43), (-0.70, 2, 0.43)], "AC" "DF"),
    ],
}[G.TYPE]
AISLES = {"b789": [0.955, -0.955], "b738": [0.0], "b763": [0.985, -0.985],
          "ma3": [0.0], "ma7": [0.955, -0.955], "ma9": [1.30, -1.30], "b744": [1.20, -1.20], "at76": [0.0], "maw": [1.20, -1.20]}[G.TYPE]   # aisle centres (design y)
MY_SEAT_S = {"b789": 36.2, "b738": 20.57, "b763": 30.27, "ma3": 22.0, "ma7": 32.98, "ma9": 34.16,
             "b744": 36.53, "at76": 11.28, "maw": 43.3}[G.TYPE]


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


# window shades: lowered fraction per side, keyed by the window index counted in pitches from
# the first window (the simulator lights the cabin through the same open part of each window)
def shade_map():
    st = windows()
    x0 = float(st[0])
    rng = np.random.default_rng(1234 + len(st))
    out = {1: {}, -1: {}}
    for side in (1, -1):
        for wc in st:
            k = int(round((wc - x0) / WIN_PITCH))
            r = rng.random()
            f = 0.0 if r < 0.55 else float(rng.uniform(0.25, 0.7)) if r < 0.86 else 0.97
            if side == 1 and abs(wc - MY_SEAT_S) < 2.2:
                f = 0.0                                  # your window and the next ones stay open
            out[side][k] = f
    return x0, out


SHADE_X0, SHADES = shade_map()


# --------------------------------------------------------------------------- prototypes
def ring(c, u, v, a, b, e=2.0, n=20):
    """closed super-ellipse ring (n points, last != first) about centre c in the plane (u, v)"""
    t = np.linspace(0, 2 * math.pi, n, endpoint=False)
    k = 2.0 / e
    cu, sv = sgnpow(np.cos(t), k), sgnpow(np.sin(t), k)
    return np.asarray(c, np.float64) + np.outer(a * cu, u) + np.outer(b * sv, v)


def loft(mb, rings, mat, caps=(True, True), uv=None):
    """skin through closed rings (list of (n, 3)); uv: optional (len(rings), n+1, 2)"""
    R = np.asarray(rings, np.float64)
    P = np.concatenate([R, R[:, :1]], 1)
    if uv is None:
        nu, nv = P.shape[:2]
        uv = np.stack(np.meshgrid(np.linspace(0, 1, nu), np.linspace(0, 1, nv), indexing="ij"), -1)
    cen = R.mean(1)
    N, bad = C.MeshBuilder.grid_normals(P, wrap_v=True)
    # outward: away from the ring centres
    d = P - np.concatenate([cen[:, None]] * P.shape[1], 1)
    if np.sum(N * d) < 0:
        N = -N
    mb.add_grid(P, uv, N=N, mat=mat, wrap_v=True)
    ax = cen[-1] - cen[0]
    if caps[0]:
        mb.add_poly(R[0], mat=mat, outward=("dir", -ax))
    if caps[1]:
        mb.add_poly(R[-1], mat=mat, outward=("dir", ax))


def capsule(mb, p0, p1, r0, r1, mat, n=12, m=5):
    """tapered limb with rounded ends"""
    p0, p1 = np.asarray(p0, np.float64), np.asarray(p1, np.float64)
    ax = p1 - p0
    L = np.linalg.norm(ax)
    ax /= L
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, tmp); u /= np.linalg.norm(u)
    v = np.cross(ax, u)
    rings = []
    for k in range(m + 1):                               # start cap
        ph = -math.pi / 2 + k * (math.pi / 2) / m
        rings.append(ring(p0 + ax * r0 * math.sin(ph), u, v, max(r0 * math.cos(ph), 1e-4), max(r0 * math.cos(ph), 1e-4), n=n))
    for k in range(1, 4):
        t = k / 4
        r = r0 + (r1 - r0) * t
        rings.append(ring(p0 + ax * L * t, u, v, r, r, n=n))
    for k in range(m + 1):                               # end cap
        ph = k * (math.pi / 2) / m
        rings.append(ring(p1 + ax * r1 * math.sin(ph), u, v, max(r1 * math.cos(ph), 1e-4), max(r1 * math.cos(ph), 1e-4), n=n))
    loft(mb, rings, mat, caps=(False, False))


SEAT_TILT = math.radians(14)


def back_s(z):
    """seat-back shell centre line (s) at height z: the IFE screen geometry (ife.js) relies on it"""
    return 0.30 + (z - 0.82) * math.tan(SEAT_TILT)


def proto_seat_y(M, col, parent):
    """Economy / premium seat after current slimline long-haul seats (Collins / Recaro): contoured
    back with lumbar support, winged headrest with a cover, seat-back shell with the IFE screen,
    tray table and literature pocket, armrests, legs with baggage bar, seat belt.
    Origin at the floor under the cushion centre, facing -s."""
    mb = C.MeshBuilder(TB)
    FAB, HEAD, PL, MET, SCR, DK, BELT = 0, 1, 2, 3, 4, 5, 6
    st, ct = math.sin(SEAT_TILT), math.cos(SEAT_TILT)
    U, Y, Z = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    # seat cushion with a rounded front edge ("waterfall")
    sbox(mb, (-0.01, 0, 0.425), (0.235, 0.217, 0.06), FAB, e=0.22, n=(8, 18))
    sbox(mb, (-0.215, 0, 0.405), (0.045, 0.215, 0.06), FAB, e=0.5, n=(8, 18))
    # back cushion: lofted, lumbar bulge, slightly narrower at the shoulders
    rings, uvs = [], []
    zs = np.linspace(0.50, 1.00, 12)
    for z in zs:
        lumbar = 0.022 * math.exp(-((z - 0.62) / 0.07) ** 2)
        hs = 0.042 + lumbar * 0.5
        cs = back_s(z) - 0.03 - hs - lumbar * 0.5
        hy = 0.212 - 0.012 * C.smoothstep(0.85, 1.0, z)
        rings.append(ring((cs, 0, z), U, Y, hs, hy, e=3.2, n=24))
    loft(mb, rings, FAB)
    # stitch lines down the front of the back cushion
    for yy in (-0.125, 0.125):
        for z0, z1 in ((0.52, 0.98),):
            zm = 0.5 * (z0 + z1)
            mb.add_box((back_s(zm) - 0.03 - 0.088, yy, zm), (0.004, 0.004, z1 - z0), mat=DK)
    # headrest with folding wings and a white cover
    zh = 1.075
    sbox(mb, (back_s(zh) - 0.075, 0, zh), (0.048, 0.17, 0.072), FAB, e=0.3, n=(6, 14), tilt=SEAT_TILT)
    for sy in (-1, 1):
        sbox(mb, (back_s(zh) - 0.095, sy * 0.185, zh), (0.045, 0.028, 0.07), FAB, e=0.35, n=(6, 10), tilt=SEAT_TILT,
             yaw=sy * math.radians(-22))
    sbox(mb, (back_s(zh) - 0.123, 0, zh + 0.005), (0.004, 0.155, 0.062), HEAD, e=0.3, n=(3, 12), tilt=SEAT_TILT)
    # seat-back shell (plastic), wrapping the back cushion
    rings = []
    for z in np.linspace(0.47, 1.16, 12):
        hy = 0.226 - 0.02 * C.smoothstep(1.05, 1.16, z)
        hs = 0.03 - 0.008 * C.smoothstep(1.0, 1.16, z)
        rings.append(ring((back_s(z), 0, z), U, Y, hs, hy, e=3.0, n=24))
    loft(mb, rings, PL)

    def on_back(dz, ds=0.0):
        return (0.30 + 0.035 + dz * st + ds, 0.0, 0.82 + dz * ct)
    # IFE screen in a dark bezel (position fixed: ife.js places your own screen on it)
    sbox(mb, on_back(0.2, -0.004), (0.008, 0.135, 0.09), DK, e=0.15, n=(4, 12), tilt=SEAT_TILT)
    sbox(mb, on_back(0.2), (0.006, 0.12, 0.075), SCR, e=0.15, n=(12, 16), tilt=SEAT_TILT)
    # tray table (stowed) with its latch, literature pocket, coat hook
    sbox(mb, on_back(-0.08), (0.012, 0.19, 0.12), PL, e=0.2, n=(2, 8), tilt=SEAT_TILT)
    sbox(mb, on_back(0.055, 0.012), (0.006, 0.025, 0.008), DK, e=0.3, n=(3, 6), tilt=SEAT_TILT)
    sbox(mb, on_back(-0.33, 0.006), (0.014, 0.175, 0.07), DK, e=0.3, n=(4, 10), tilt=SEAT_TILT)
    sbox(mb, on_back(0.33, 0.006), (0.01, 0.02, 0.012), MET, e=0.4, n=(3, 6), tilt=SEAT_TILT)
    # armrests (each seat carries the inner half of each shared armrest), dark pad on top
    for sy in (-1, 1):
        yy = sy * 0.2185
        sbox(mb, (0.02, yy, 0.628), (0.21, 0.0135, 0.026), PL, e=0.35, n=(6, 8))
        sbox(mb, (0.02, yy, 0.656), (0.2, 0.0125, 0.006), DK, e=0.35, n=(4, 8))
        sbox(mb, (0.13, yy, 0.53), (0.026, 0.012, 0.09), MET, e=0.4, n=(4, 8))
    # legs, cross tubes, baggage bar, track feet
    for yy in (-0.17, 0.17):
        cyl(mb, (-0.17, yy, 0.0), (-0.12, yy, 0.37), 0.017, MET, n=10)
        cyl(mb, (0.24, yy, 0.0), (0.09, yy, 0.37), 0.017, MET, n=10)
        mb.add_box((0.03, yy, 0.012), (0.46, 0.035, 0.024), mat=MET)
    for s_ in (-0.12, 0.09):
        cyl(mb, (s_, -0.23, 0.37), (s_, 0.23, 0.37), 0.019, MET, n=10)
    cyl(mb, (-0.2, -0.23, 0.12), (-0.2, 0.23, 0.12), 0.011, MET, n=8)
    mb.add_box((-0.17, 0, 0.345), (0.07, 0.25, 0.05), mat=DK)                    # life vest pouch
    # seat belt halves across the cushion with the buckle
    for sy in (-1, 1):
        mb.add_box((0.06, sy * 0.115, 0.487), (0.045, 0.19, 0.004), mat=BELT)
    mb.add_box((0.06, 0.0, 0.489), (0.06, 0.05, 0.008), mat=MET)
    ob = mb.build("Proto_SeatY", [M["fabricY"], M["headrest"], M["plastic"], M["seatmetal"], M["seatscreen"],
                                  M["seatdark"], M["belt"]], col=col)
    C.set_parent(ob, parent)


def proto_seat_j(M, col, parent):
    """Business seat (lie-flat, staggered): wrap-around shell with a wood-tone accent, cushions
    with seams, side console with a reading lamp, ottoman, large screen."""
    mb = C.MeshBuilder(TB)
    FAB, HEAD, SHELL, MET, SCR, PL, DK, ACC, LAMP = 0, 1, 2, 3, 4, 5, 6, 7, 8
    U, Y = np.array([1.0, 0, 0]), np.array([0, 1.0, 0])
    sbox(mb, (0.05, 0, 0.455), (0.33, 0.245, 0.07), FAB, e=0.25, n=(8, 16))
    sbox(mb, (-0.26, 0, 0.44), (0.05, 0.243, 0.07), FAB, e=0.5, n=(6, 16))
    tilt = math.radians(18)
    rings = []
    for z in np.linspace(0.52, 1.12, 12):
        lumbar = 0.025 * math.exp(-((z - 0.66) / 0.08) ** 2)
        cs = 0.40 + (z - 0.88) * math.tan(tilt) - lumbar
        rings.append(ring((cs, 0, z), U, Y, 0.075 + lumbar * 0.4, 0.245 - 0.02 * C.smoothstep(0.95, 1.12, z), e=3.0, n=24))
    loft(mb, rings, FAB)
    for yy in (-0.13, 0.13):
        mb.add_box((0.40 - 0.08 - 0.01, yy, 0.82), (0.004, 0.004, 0.55), mat=DK)
    sbox(mb, (0.52, 0, 1.24), (0.08, 0.22, 0.1), FAB, e=0.3, n=(6, 12), tilt=tilt)
    sbox(mb, (0.44, 0, 1.25), (0.005, 0.19, 0.085), HEAD, e=0.3, n=(3, 12), tilt=tilt)
    # wrap-around shell with an accent strip along its top edge
    sbox(mb, (0.52, 0, 0.72), (0.06, 0.33, 0.62), SHELL, e=0.2, n=(4, 14), tilt=math.radians(8))
    for sy in (-1, 1):
        sbox(mb, (0.15, sy * 0.33, 0.62), (0.42, 0.035, 0.5), SHELL, e=0.2, n=(4, 10))
        sbox(mb, (0.15, sy * 0.33, 1.125), (0.41, 0.037, 0.012), ACC, e=0.3, n=(3, 8))
        sbox(mb, (0.0, sy * 0.30, 0.66), (0.3, 0.05, 0.03), PL, e=0.25, n=(4, 8))
    # side console: dark top, reading lamp, controller
    sbox(mb, (-0.05, 0.40, 0.68), (0.25, 0.07, 0.03), DK, e=0.3, n=(4, 8))
    sbox(mb, (-0.05, 0.40, 0.42), (0.25, 0.065, 0.24), SHELL, e=0.2, n=(4, 8))
    cyl(mb, (0.12, 0.40, 0.71), (0.12, 0.40, 0.95), 0.008, MET, n=8)
    cyl(mb, (0.12, 0.40, 0.95), (0.06, 0.37, 0.98), 0.008, MET, n=8)
    sbox(mb, (0.05, 0.365, 0.975), (0.025, 0.02, 0.012), LAMP, e=0.5, n=(4, 8))
    sbox(mb, (-0.18, 0.40, 0.715), (0.04, 0.025, 0.008), DK, e=0.4, n=(3, 6))
    # IFE screen on the back of the shell (for the row behind)
    sbox(mb, (0.59, 0, 1.0), (0.01, 0.205, 0.135), DK, e=0.12, n=(4, 12), tilt=math.radians(8))
    sbox(mb, (0.592, 0, 1.0), (0.008, 0.19, 0.12), SCR, e=0.12, n=(12, 16), tilt=math.radians(8))
    # ottoman / foot well
    sbox(mb, (-0.72, 0, 0.3), (0.16, 0.2, 0.13), FAB, e=0.3, n=(6, 12))
    mb.add_box((-0.72, 0, 0.1), (0.25, 0.3, 0.2), mat=SHELL)
    mb.add_box((0.1, 0, 0.18), (0.6, 0.45, 0.36), mat=MET)
    ob = mb.build("Proto_SeatJ", [M["fabricJ"], M["headrest"], M["shell"], M["seatmetal"], M["seatscreen"],
                                  M["plastic"], M["seatdark"], M["accent"], M["light"]], col=col)
    C.set_parent(ob, parent)


# pivots of the articulated passenger (design frame, seat origin): the simulator poses the head
# and both arms (shoulder + elbow) per instance for random motions (look around, phone, sleep, eat ...)
PAX_PIVOTS = dict(neck=(0.20, 0.0, 1.12), shoulderL=(0.19, 0.21, 1.00), shoulderR=(0.19, -0.21, 1.00),
                  elbowL=(0.13, 0.205, 0.70), elbowR=(0.13, -0.205, 0.70))
# hair / glasses variants (Pax_HairLong, Pax_HairBun, Pax_Glasses) are switched per instance
PAX_MATS = ["skin", "shirt", "pants", "hair", "shoes", "hairlong", "hairbun", "glasses", "eye", "brow", "eyewhite"]


def head_points(c, r, lat, lon, jaw=0.3):
    """deformed sphere (skull + face): r = (depth s, width y, height z); face toward -s.
    lat, lon grids in radians (lon 0 = front)."""
    cl, sl = np.cos(lat), np.sin(lat)
    x = -np.cos(lon) * cl                      # -1 = front
    y = np.sin(lon) * cl
    z = sl.copy() * np.ones_like(lon)
    low = np.clip(-z, 0, 1)                    # below the eyes
    front = np.clip(-x, 0, 1)
    wy = 1 - jaw * low ** 1.3                  # jaw narrows
    wx = 1 - 0.18 * low * (1 - front)          # back of the neck
    face_flat = 1 - 0.12 * front ** 4 * (1 - low)   # flatter forehead / face plane
    zz = z * (1 + 0.12 * low * front)          # chin a little lower at the front
    xx = x * wx * face_flat - 0.06 * low ** 2 * front    # chin forward
    return np.stack([c[0] + r[0] * xx, c[1] + r[1] * y * wy, c[2] + r[2] * zz], -1)


def proto_pax(M, col, parent):
    """Seated passenger (origin = seat origin, facing -s), split into posable parts: torso + legs,
    head (with face, ears, hair and the hair / glasses variants), upper arms, forearms + hands."""
    SK, SH, PA, HA, SO, HL, HB, GL, EY = range(9)
    mats = [M[k] for k in PAX_MATS]
    U, Yv, Zv = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])
    lean = math.radians(12)
    axis = np.array([math.sin(lean), 0, math.cos(lean)])
    fwd = np.array([math.cos(lean), 0, -math.sin(lean)])        # +s, perpendicular to the spine
    hip = np.array([0.075, 0.0, 0.50])

    def part(name, fn):
        mb = C.MeshBuilder(TB)
        fn(mb)
        ob = mb.build(name, mats, col=col)
        C.set_parent(ob, parent)

    def body(mb):
        # torso: elliptical sections up the leaning spine (hips, waist, chest, shoulders)
        prof = [(0.00, 0.165, 0.125, 0.0), (0.08, 0.158, 0.118, 0.0), (0.17, 0.142, 0.105, -0.005),
                (0.27, 0.158, 0.115, -0.012), (0.36, 0.172, 0.118, -0.016), (0.44, 0.182, 0.108, -0.01),
                (0.495, 0.172, 0.097, 0.0), (0.522, 0.135, 0.082, 0.0), (0.545, 0.075, 0.06, 0.0)]
        rings = [ring(hip + axis * t + fwd * dc, fwd, Yv, ds, w, e=2.3, n=24) for t, w, ds, dc in prof]
        loft(mb, rings[:3], PA, caps=(True, False))
        loft(mb, rings[2:], SH, caps=(False, True))
        # collar
        top = hip + axis * 0.53
        loft(mb, [ring(top + axis * 0.0, fwd, Yv, 0.06, 0.068, n=20), ring(top + axis * 0.025, fwd, Yv, 0.052, 0.06, n=20)],
             SH, caps=(False, False))
        # pelvis / seat
        sbox(mb, (0.06, 0, 0.53), (0.14, 0.165, 0.085), PA, e=0.6, n=(8, 14))
        for sy in (-1, 1):
            y = sy * 0.095
            capsule(mb, (0.05, y, 0.52), (-0.40, sy * 0.105, 0.535), 0.088, 0.062, PA)      # thigh
            capsule(mb, (-0.405, sy * 0.105, 0.52), (-0.455, sy * 0.11, 0.11), 0.058, 0.04, PA)   # shin
            sbox(mb, (-0.405, sy * 0.105, 0.53), (0.06, 0.06, 0.06), PA, e=0.8, n=(6, 10))  # knee
            # shoe: sole + upper
            sbox(mb, (-0.52, sy * 0.11, 0.05), (0.125, 0.048, 0.045), SO, e=0.45, n=(8, 12))
            sbox(mb, (-0.505, sy * 0.11, 0.012), (0.13, 0.05, 0.012), SO, e=0.3, n=(4, 10))

    def head(mb):
        c = (0.212, 0.0, 1.245)
        r = (0.097, 0.074, 0.106)
        capsule(mb, (0.198, 0, 1.06), (0.21, 0, 1.19), 0.047, 0.045, SK)                # neck
        lat = np.linspace(-math.pi / 2, math.pi / 2, 16)[:, None]
        lon = np.linspace(0, 2 * math.pi, 29)[None, :]
        P = head_points(c, r, lat, lon * np.ones_like(lat))
        mb.add_grid(P, mat=SK, wrap_v=True, outward=c)
        # nose, ears, eyes, brows, mouth line
        sbox(mb, (c[0] - 0.103, 0, c[2] - 0.012), (0.018, 0.013, 0.03), SK, e=0.7, n=(6, 8),
             tilt=math.radians(-12))
        for sy in (-1, 1):
            sbox(mb, (c[0] + 0.005, sy * 0.079, c[2] - 0.005), (0.02, 0.009, 0.03), SK, e=0.7, n=(6, 8))
            sbox(mb, (c[0] - 0.088, sy * 0.031, c[2] + 0.012), (0.006, 0.012, 0.007), EY, e=0.8, n=(4, 8))
            sbox(mb, (c[0] - 0.093, sy * 0.032, c[2] + 0.034), (0.006, 0.019, 0.004), HA, e=0.6, n=(3, 6))
        mb.add_box((c[0] - 0.094, 0, c[2] - 0.058), (0.004, 0.03, 0.004), mat=EY)
        # short hair: a cap over the skull down to a hairline (forehead, temples, nape)
        lon2 = np.linspace(0, 2 * math.pi, 29)
        lim = np.radians(np.interp(np.cos(lon2), [-1, 0, 1], [-38, 2, 32]))       # back / side / front
        rows = 9
        LAT = np.array([lim + (math.pi / 2 - lim) * k / (rows - 1) for k in range(rows)])
        LON = np.tile(lon2, (rows, 1))
        # (a little volume on the crown and at the back, a side parting)
        Ph = head_points(c, (r[0] * 1.07, r[1] * 1.09, r[2] * 1.035), LAT, LON, jaw=0.0)
        crown = np.clip(np.sin(LAT), 0, 1) ** 2
        Ph[..., 2] += 0.008 * crown
        Ph[..., 0] += 0.006 * crown * np.clip(-np.cos(LON), 0, 1)
        part_l = np.exp(-((LON - 0.55) / 0.05) ** 2) * np.clip(np.sin(LAT) - 0.4, 0, 1)
        Ph -= (Ph - np.asarray(c)) * (0.025 * part_l)[..., None]
        mb.add_grid(Ph, mat=HA, wrap_v=True, outward=c)
        # long hair (variant): a fall of hair over the back of the neck to the shoulders
        rings = []
        for k, z in enumerate(np.linspace(c[2] + 0.05, 1.04, 7)):
            t = k / 6
            ang = np.linspace(-math.pi * 0.6, math.pi * 0.6, 15)
            rr = (0.1 + 0.022 * t, 0.083 + 0.026 * t)
            pts = np.stack([c[0] + 0.012 + rr[0] * np.cos(ang) * (0.9 + 0.1 * t), rr[1] * np.sin(ang),
                            np.full_like(ang, z)], -1)
            rings.append(pts)
        R = np.asarray(rings)
        inner = R.copy(); inner[..., 0] -= 0.02 * np.cos(np.linspace(-1, 1, 15))[None] ; inner[..., 1] *= 0.86
        mb.add_grid(R, mat=HL, outward=(c[0] - 0.2, 0, 1.2))
        mb.add_grid(inner[:, ::-1], mat=HL, outward=(c[0] + 0.5, 0, 1.2))
        # bun (variant)
        sbox(mb, (c[0] + 0.105, 0, c[2] + 0.055), (0.036, 0.04, 0.036), HB, e=0.9, n=(8, 12))
        # glasses (variant)
        for sy in (-1, 1):
            cx = (c[0] - 0.099, sy * 0.032, c[2] + 0.01)
            for dz, dy, w, hgt in ((0.017, 0, 0.05, 0.004), (-0.017, 0, 0.05, 0.004)):
                mb.add_box((cx[0], cx[1] + dy, cx[2] + dz), (0.004, w, hgt), mat=GL)
            for dy in (-0.025, 0.025):
                mb.add_box((cx[0], cx[1] + dy, cx[2]), (0.004, 0.004, 0.034), mat=GL)
            mb.add_box((c[0] - 0.045, sy * 0.079, c[2] + 0.02), (0.11, 0.003, 0.004), mat=GL)     # temples
        mb.add_box((c[0] - 0.1, 0, c[2] + 0.017), (0.004, 0.016, 0.004), mat=GL)                    # bridge

    part("Proto_Pax", body)
    part("Proto_PaxHead", head)
    for sy, L in ((1, "L"), (-1, "R")):
        sh = np.array(PAX_PIVOTS["shoulder" + L])
        el = np.array(PAX_PIVOTS["elbow" + L])

        def uarm(mb, sy=sy, sh=sh, el=el):
            sbox(mb, tuple(sh + np.array([0.0, -sy * 0.01, -0.01])), (0.06, 0.055, 0.06), SH, e=0.8, n=(8, 10))
            capsule(mb, sh + np.array([0, 0, -0.03]), el, 0.05, 0.042, SH)
        part("Proto_PaxUArm" + L, uarm)

        def farm(mb, sy=sy, el=el):
            wr = np.array([-0.135, sy * 0.19, 0.68])
            capsule(mb, el, wr + np.array([0.02, 0, 0]), 0.04, 0.031, SH)
            # hand: palm + fingers + thumb
            sbox(mb, (-0.175, sy * 0.188, 0.674), (0.045, 0.034, 0.016), SK, e=0.7, n=(6, 8))
            sbox(mb, (-0.235, sy * 0.188, 0.668), (0.03, 0.03, 0.012), SK, e=0.75, n=(6, 8))
            sbox(mb, (-0.17, sy * 0.155, 0.68), (0.028, 0.012, 0.012), SK, e=0.8, n=(4, 6), yaw=sy * 0.5)
        part("Proto_PaxFArm" + L, farm)


# --------------------------------------------------------------------------- cabin crew, cart, meal tray
CREW_PIVOTS = dict(shoulderL=(0.0, 0.20, 1.42), shoulderR=(0.0, -0.20, 1.42), hipL=(0.0, 0.09, 0.90),
                   hipR=(0.0, -0.09, 0.90))


def proto_crew(M, col, parent):
    """Standing flight attendant (origin between the feet, facing -s): body + head, arms, legs."""
    U_, A, SK, HA, SO, PA, EY = 0, 1, 2, 3, 4, 5, 6
    mats = [M["uniform"], M["crewaccent"], M["crewskin"], M["crewhair"], M["shoes"], M["crewpants"], M["eye"]]
    Uv, Yv, Zv = np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0])

    def part(name, fn):
        mb = C.MeshBuilder(TB)
        fn(mb)
        ob = mb.build(name, mats, col=col)
        C.set_parent(ob, parent)

    def body(mb):
        prof = [(0.88, 0.150, 0.110), (0.96, 0.152, 0.108), (1.05, 0.128, 0.092), (1.16, 0.142, 0.10),
                (1.27, 0.162, 0.108), (1.37, 0.172, 0.098), (1.43, 0.158, 0.085), (1.465, 0.10, 0.065), (1.48, 0.055, 0.05)]
        rings = [ring((0.0, 0, z), Uv, Yv, ds, w, e=2.3, n=24) for z, w, ds in prof]
        loft(mb, rings[:2], PA, caps=(True, False))
        loft(mb, rings[1:], U_, caps=(False, True))
        # skirt / trouser top + jacket hem
        loft(mb, [ring((0.0, 0, 0.93), Uv, Yv, 0.115, 0.155, n=24), ring((0.0, 0, 0.62), Uv, Yv, 0.13, 0.17, n=24)],
             PA, caps=(False, True))
        # scarf, name badge, wings pin
        sbox(mb, (-0.085, 0, 1.40), (0.025, 0.065, 0.05), A, e=0.5, n=(4, 8))
        mb.add_box((-0.1, 0.07, 1.30), (0.01, 0.05, 0.015), mat=A)
        c = (0.0, 0.0, 1.635)
        capsule(mb, (0.0, 0, 1.46), (0.0, 0, 1.56), 0.044, 0.043, SK)
        lat = np.linspace(-math.pi / 2, math.pi / 2, 16)[:, None]
        lon = np.linspace(0, 2 * math.pi, 29)[None, :]
        mb.add_grid(head_points(c, (0.1, 0.075, 0.115), lat, lon * np.ones_like(lat)), mat=SK, wrap_v=True, outward=c)
        lon2 = np.linspace(0, 2 * math.pi, 29)
        lim = np.radians(np.interp(np.cos(lon2), [-1, 0, 1], [-30, 5, 34]))
        LAT = np.array([lim + (math.pi / 2 - lim) * k / 8 for k in range(9)])
        mb.add_grid(head_points(c, (0.107, 0.083, 0.122), LAT, np.tile(lon2, (9, 1)), jaw=0.0), mat=HA, wrap_v=True,
                    outward=c)
        sbox(mb, (0.115, 0, 1.66), (0.05, 0.052, 0.05), HA, e=0.9, n=(8, 10))           # bun
        sbox(mb, (-0.1, 0, 1.625), (0.017, 0.013, 0.028), SK, e=0.7, n=(6, 8), tilt=math.radians(-12))
        for sy in (-1, 1):
            sbox(mb, (-0.086, sy * 0.03, 1.648), (0.006, 0.012, 0.007), EY, e=0.8, n=(4, 8))
            sbox(mb, (0.005, sy * 0.077, 1.63), (0.02, 0.009, 0.03), SK, e=0.7, n=(6, 8))

    def arm(mb, sy):
        sh = np.array([0.0, sy * 0.205, 1.42])
        sbox(mb, tuple(sh + np.array([0, -sy * 0.01, -0.01])), (0.055, 0.055, 0.058), U_, e=0.8, n=(8, 10))
        capsule(mb, sh + np.array([0, 0, -0.03]), (0.0, sy * 0.225, 1.12), 0.046, 0.04, U_)
        capsule(mb, (0.0, sy * 0.225, 1.12), (-0.01, sy * 0.225, 0.86), 0.04, 0.03, U_)
        sbox(mb, (-0.01, sy * 0.222, 0.80), (0.03, 0.02, 0.05), SK, e=0.7, n=(6, 8))

    def leg(mb, sy):
        capsule(mb, (0.0, sy * 0.085, 0.86), (0.0, sy * 0.09, 0.47), 0.07, 0.05, PA)
        capsule(mb, (0.0, sy * 0.09, 0.47), (0.0, sy * 0.09, 0.08), 0.048, 0.033, SK)
        sbox(mb, (-0.035, sy * 0.09, 0.045), (0.11, 0.042, 0.045), SO, e=0.5, n=(8, 10))

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


def rel3(v):
    """design point relative to the design origin, three.js axes"""
    a, o = G.to_three(list(v)), G.to_three([0.0, 0.0, 0.0])
    return [round(float(a[i] - o[i]), 4) for i in range(3)]


def center_protos(protos):
    """move the prototype meshes so that the seat origin (design 0, 0, 0) is the file origin (the
    vertices themselves: the simulator places each part relative to its own node)"""
    from mathutils import Matrix
    o = TB(np.array([[0.0, 0.0, 0.0]]))[0]
    for ob in protos.children_recursive:
        if ob.type == "MESH":
            ob.data.transform(Matrix.Translation((-o[0], -o[1], -o[2])))
            ob.data.update()


def cabin_light_info():
    """what the simulator's cabin lighting needs (three.js aircraft frame: x fwd, y up, z right):
    ceiling / bin heights, the sidewall at the windows, the window band and the shade state of every
    window (index k counted in pitches from the first window; 1 = closed or no window)"""
    st = windows()
    nk = int(round((st[-1] - SHADE_X0) / WIN_PITCH)) + 1
    r3 = lambda v: round(float(v), 3)          # noqa: E731
    return dict(floor=r3(FL), ceil=r3(CEIL), binBot=r3(BIN_BOT), binFront=r3(BIN_FRONT),
                wall=r3(lining_y(MY_SEAT_S, WIN_Z)), winY=[r3(WIN_Z - WIN_H / 2), r3(WIN_Z + WIN_H / 2)],
                winW=r3(WIN_W), winX0=r3(G.to_three([SHADE_X0, 0, 0])[0]), winDX=r3(-WIN_PITCH),
                shadeL=[r3(SHADES[1].get(k, 1.0)) for k in range(nk)],
                shadeR=[r3(SHADES[-1].get(k, 1.0)) for k in range(nk)])


# --------------------------------------------------------------------------- baked ambient occlusion
def bake_vertex_ao(targets, occluders, distance, samples=48, lo=0.36):
    """Cycles AO into a vertex colour attribute 'AO' (exported as COLOR_0, multiplies the albedo).
    Only targets + occluders are renderable during the bake."""
    import bpy
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.light_settings.distance = distance
    keep = set(o.name for o in list(targets) + list(occluders))
    saved = {o.name: o.hide_render for o in sc.objects}
    for o in sc.objects:
        o.hide_render = o.name not in keep
    targets = [o for o in targets if o.type == "MESH" and len(o.data.vertices)]
    for o in targets:
        ca = o.data.color_attributes
        a = ca.get("AO") or ca.new("AO", "BYTE_COLOR", "POINT")
        ca.active_color = a
        ca.render_color_index = list(ca).index(a)
    bpy.ops.object.select_all(action="DESELECT")
    for o in targets:
        o.select_set(True)
    bpy.context.view_layer.objects.active = targets[0]
    t0 = __import__("time").time()
    bpy.ops.object.bake(type="AO", target="VERTEX_COLORS", use_clear=True)
    for o in targets:
        a = o.data.color_attributes["AO"]
        buf = np.empty(len(a.data) * 4, np.float32)
        a.data.foreach_get("color", buf)
        b4 = buf.reshape(-1, 4)
        v = lo + (1 - lo) * np.clip((b4[:, 0] - 0.04) / 0.92, 0, 1) ** 0.85
        b4[:, 0] = b4[:, 1] = b4[:, 2] = v
        b4[:, 3] = 1.0
        a.data.foreach_set("color", buf)
    for o in sc.objects:
        o.hide_render = saved.get(o.name, False)
    print("baked AO: %d objects, %.0fs" % (len(targets), __import__("time").time() - t0))


def bake_cabin(root, protos, seats):
    import bpy
    # (the window reveals stay unbaked: their bezel lip touches the lining and would turn black)
    statics = [o for o in root.children if o.type == "MESH" and not o.name.startswith("Cabin_Reveals")]
    P = {o.name: o for o in protos.children_recursive if o.type == "MESH"}
    # the shell sees the seats (temporary instances of the seat prototypes) but not the passengers
    tmp = []
    o0 = TB(np.array([[0.0, 0.0, 0.0]]))[0]
    from mathutils import Matrix
    for st in seats:
        pr = P.get("Proto_SeatJ" if st["c"] == "J" else "Proto_SeatY")
        if pr is None:
            continue
        d = TB(np.array([[st["s"], st["y"], FL]]))[0] - o0
        ob = bpy.data.objects.new("_bake_seat", pr.data)
        ob.matrix_world = Matrix.Translation(tuple(d)) @ pr.matrix_world
        root.users_collection[0].objects.link(ob)
        tmp.append(ob)
    bake_vertex_ao(statics, tmp, 0.9, samples=40, lo=0.30)
    for ob in tmp:
        bpy.data.objects.remove(ob)
    pax = [o for n, o in P.items() if n.startswith("Proto_Pax")]
    crew = [o for n, o in P.items() if n.startswith("Proto_Crew")]
    seatY, seatJ = P.get("Proto_SeatY"), P.get("Proto_SeatJ")
    if seatY:
        bake_vertex_ao([seatY], [], 0.3, lo=0.38)
    if seatJ:
        bake_vertex_ao([seatJ], [], 0.3, lo=0.38)
    if pax:
        # the two body variants share the seat: each is baked with the head / arms, never the other
        seat = [seatY] if seatY else []
        male = [o for o in pax if o.name != "Proto_PaxF"]
        female = [o for o in pax if o.name == "Proto_PaxF"]
        bake_vertex_ao(male, seat, 0.22, lo=0.45)
        if female:
            bake_vertex_ao(female, seat + [o for o in male if o.name != "Proto_Pax"], 0.22, lo=0.45)
    if crew:
        bake_vertex_ao(crew, [], 0.2, lo=0.45)
    for n in ("Proto_Cart", "Proto_Tray"):
        if n in P:
            bake_vertex_ao([P[n]], [], 0.2, lo=0.45)


# --------------------------------------------------------------------------- entry
def build_cabin(col, tex, bake=True):
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
    import pax_meta
    pax_meta.build_pax(M, col, protos, PAX_PIVOTS)
    pax_meta.build_crew(M, col, protos)
    proto_cart(M, col, protos)
    proto_tray(M, col, protos)
    seats = seat_map()
    if bake:
        bake_cabin(root, protos, seats)
    my = next((i for i, st in enumerate(seats) if st["l"] == "A" and abs(st["s"] - MY_SEAT_S) < 0.2), None)
    y_win = seats[my]["y"] - 0.07 if my is not None else 1.0
    # the window beside your seat: the eye sits at its height, close to the reveal, a little aft
    win_s = float(min(windows(), key=lambda w: abs(w - MY_SEAT_S)))
    if G.TYPE != "b789":
        # small windows: put the eye close to the window reveal so the wing is in view
        y_win = max(y_win, lining_y(win_s, WIN_Z) - 0.22)
    counts = {}
    for st in seats:
        counts[st["c"]] = counts.get(st["c"], 0) + 1
    info = dict(
        seats=[dict(c=st["c"], r=st["row"], l=st["l"], p=st["p"], w=st["w"]) for st in seats],
        counts=counts, total=len(seats),
        mySeat=my,
        views=dict(
            aisle=G.to_three([MY_SEAT_S + 1.55, CABIN["aisle_y"], FL + 1.62]),
            window=G.to_three([win_s + 0.10, y_win, WIN_Z + 0.02]),
        ),
        paxMass=100,
        # the prototypes are shared by every type (cabin-protos.glb) with the seat origin at 0
        protoOrigin=[0.0, 0.0, 0.0],
        protoFile="cabin-protos",
        paxPivots={k: rel3(v) for k, v in PAX_PIVOTS.items()},
        crewPivots={k: rel3(v) for k, v in CREW_PIVOTS.items()},
        aisles=[-y for y in AISLES],
        floorY=FL,
        galley=G.to_three([S0 + 1.0, 0.0, FL])[0],
        jOffset=[-0.12, 0.03, 0.0],
        light=cabin_light_info(),
    )
    print("cabin seats:", counts, "total", len(seats))
    return root, info
