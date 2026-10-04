"""
Texture generator for the 787-9 (numpy + Pillow, no Blender needed).

Everything is drawn in *aircraft coordinates*: for every texel of the
fuselage texture we know the exact 3-D skin point (s, y, z) because the UV
layout is analytic (u = s / length, v = arc-length fraction around the
section, see b787_geometry.fus_section).  Windows, doors, cockpit panes,
titles and panel lines are therefore defined in metres and land exactly
where they belong on the mesh.

Livery: original "CITY BUILDER AIRWAYS" design (fictional airline).
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

import b787_geometry as G

HERE = os.path.dirname(os.path.abspath(__file__))
# type-specific maps (fuselage, fin, wing, flight-deck lining) go to textures/<asset>/ for the
# 737 / 767 (the 787-9 keeps the original textures/ directory)
TEX = os.path.join(HERE, "textures") if G.TYPE == "b789" else os.path.join(HERE, "textures", G.ASSET)
os.makedirs(TEX, exist_ok=True)

FONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_BOLD_IT = "/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf"
FONT_JP = "/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"


def srgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


WHITE = srgb("#f5f7f9")
NAVY = srgb("#0b2a5c")
NAVY2 = srgb("#123f86")
CYAN = srgb("#1fb4e6")
GOLD = srgb("#f2b233")
GLASS = srgb("#141a22")
GASKET = srgb("#3a4048")
DOORLINE = srgb("#59616b")

# door stations (centre), width, height, windows, cargo doors: per type (b787_geometry)
DOORS = G.DOORS
DOOR_W, DOOR_Z0, DOOR_Z1 = G.DOOR_W, G.DOOR_Z0, G.DOOR_Z1
WIN_Z, WIN_W, WIN_H, WIN_PITCH = G.WIN_Z, G.WIN_W, G.WIN_H, G.WIN_PITCH
CARGO = G.CARGO


def CS(s):
    """787 flight-deck station -> this type."""
    return float(G.ck(np.array([s, 0.0, 0.0]))[0])


def CZ(z):
    return float(G.ck(np.array([0.0, 0.0, z]))[2])


# ---------------------------------------------------------------------------
# SDF helpers
# ---------------------------------------------------------------------------
def sd_round_box(px, py, hx, hy, r):
    qx = np.abs(px) - hx + r
    qy = np.abs(py) - hy + r
    out = np.hypot(np.maximum(qx, 0), np.maximum(qy, 0))
    ins = np.minimum(np.maximum(qx, qy), 0)
    return out + ins - r


def offset_convex(poly, r):
    """Offset a CCW/CW convex polygon inwards by r."""
    P = np.asarray(poly, dtype=np.float64)
    n = len(P)
    # make CCW
    area = 0.5 * np.sum(P[:, 0] * np.roll(P[:, 1], -1) - np.roll(P[:, 0], -1) * P[:, 1])
    if area < 0:
        P = P[::-1]
    lines = []
    for i in range(n):
        a, b = P[i], P[(i + 1) % n]
        d = (b - a) / np.linalg.norm(b - a)
        nrm = np.array([-d[1], d[0]])  # inward for CCW
        lines.append((a + nrm * r, d))
    out = []
    for i in range(n):
        (p1, d1), (p2, d2) = lines[i - 1], lines[i]
        A = np.array([d1, -d2]).T
        t = np.linalg.solve(A, p2 - p1)
        out.append(p1 + d1 * t[0])
    return np.array(out)


def sd_polygon(px, py, poly):
    """Exact signed distance to polygon (negative inside)."""
    P = np.asarray(poly, dtype=np.float64)
    d = (px - P[0, 0]) ** 2 + (py - P[0, 1]) ** 2
    s = np.ones_like(px)
    n = len(P)
    j = n - 1
    for i in range(n):
        ex, ey = P[j, 0] - P[i, 0], P[j, 1] - P[i, 1]
        wx, wy = px - P[i, 0], py - P[i, 1]
        t = np.clip((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
        bx, by = wx - ex * t, wy - ey * t
        d = np.minimum(d, bx * bx + by * by)
        c1 = py >= P[i, 1]
        c2 = py < P[j, 1]
        c3 = ex * wy > ey * wx
        flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
        s = np.where(flip, -s, s)
        j = i
    return s * np.sqrt(d)


def sd_round_poly(px, py, poly, r):
    return sd_polygon(px, py, offset_convex(poly, r)) - r


def aa(d, w):
    """coverage from signed distance (negative inside) with AA width w."""
    return np.clip(0.5 - d / w, 0.0, 1.0)


def blend(dst, color, alpha):
    a = alpha[..., None]
    dst *= (1 - a)
    dst += a * np.asarray(color, dtype=np.float32)


# ---------------------------------------------------------------------------
# Fuselage texel -> skin position maps
# ---------------------------------------------------------------------------
class FuselageMaps:
    def __init__(self, W=8192, H=2048, s_range=(0.0, G.LENGTH), shell_scale=1.0):
        self.W, self.H = W, H
        s0, s1 = s_range
        self.S1d = s0 + (np.arange(W) + 0.5) / W * (s1 - s0)
        v = 1.0 - (np.arange(H) + 0.5) / H
        self.v = v
        Y = np.zeros((H, W), np.float32)
        Z = np.zeros((H, W), np.float32)
        Cs = np.zeros(W, np.float32)
        self.sec = []
        for i, s in enumerate(self.S1d):
            phi, arcn, Cc = G.section_arc(s, 720)
            y, z = G.fus_section(s, phi)
            if shell_scale != 1.0:
                zc = float(G.fus_profile(s)[3])
                y = y * shell_scale
                z = zc + (z - zc) * shell_scale
            Y[:, i] = np.interp(v, arcn, y)
            Z[:, i] = np.interp(v, arcn, z)
            Cs[i] = Cc
            self.sec.append((arcn * Cc, y, z))
        self.Y, self.Z, self.Cs = Y, Z, Cs
        self.S = np.broadcast_to(self.S1d[None, :], (H, W))
        self.A = (v[:, None] * Cs[None, :]).astype(np.float32)   # arc distance from bottom
        self.du = (s1 - s0) / W
        self.dv = Cs / H
        self._arc_cache = {}

    def col(self, s):
        return int(np.clip((s - self.S1d[0]) / (self.S1d[1] - self.S1d[0]), 0, self.W - 1))

    def arc_at_z(self, z, side):
        """Arc distance (per column) where the skin reaches height z on a side."""
        key = (round(float(z), 4), side)
        if key in self._arc_cache:
            return self._arc_cache[key]
        out = np.full(self.W, np.nan, np.float32)
        for i, (arc, y, zz) in enumerate(self.sec):
            n = len(arc)
            half = n // 2
            if side > 0:   # left: phi pi..2pi, z decreasing
                a, zs = arc[half:], zz[half:]
                if zs[-1] <= z <= zs[0]:
                    out[i] = np.interp(z, zs[::-1], a[::-1])
            else:          # right: phi 0..pi, z increasing
                a, zs = arc[:half + 1], zz[:half + 1]
                if zs[0] <= z <= zs[-1]:
                    out[i] = np.interp(z, zs, a)
        self._arc_cache[key] = out
        return out

    def rows_for_arc(self, a0, a1, i0, i1):
        C = self.Cs[i0:i1].max()
        v0, v1 = a0 / C, a1 / C
        Cmin = self.Cs[i0:i1].min()
        v0 = min(v0, a0 / Cmin)
        v1 = max(v1, a1 / Cmin)
        r0 = int(np.clip((1 - v1) * self.H - 2, 0, self.H))
        r1 = int(np.clip((1 - v0) * self.H + 2, 0, self.H))
        return r0, r1


def side_feature(fm, s_c, z_c, hs, ha, side, r, pad=0.05):
    """Rounded rect centred at (s_c, z_c) on a side, half sizes in metres
    (hs along s, ha along the skin).  Returns (slices, sdf)."""
    i0 = fm.col(s_c - hs - pad)
    i1 = fm.col(s_c + hs + pad) + 1
    ac = fm.arc_at_z(z_c, side)[i0:i1]
    if np.all(np.isnan(ac)) or not np.isfinite(ha):
        return None, None
    ac = np.where(np.isnan(ac), np.nanmean(ac), ac)
    r0, r1 = fm.rows_for_arc(np.nanmin(ac) - ha - pad, np.nanmax(ac) + ha + pad, i0, i1)
    if r1 <= r0 or i1 <= i0:
        return None, None
    S = fm.S[r0:r1, i0:i1]
    A = fm.A[r0:r1, i0:i1]
    d = sd_round_box(S - s_c, A - ac[None, :], hs, ha, r)
    return (slice(r0, r1), slice(i0, i1)), d


# ---------------------------------------------------------------------------
# Cockpit window outlines
# ---------------------------------------------------------------------------
# 787: four large panes -- two front windshields and one big side window per side.
# 737 / 767 (and 707 / 727 / 757): the classic Boeing six-window flight deck -- No. 1
# windshield (flat glass, the bottom edges forming a shallow "V" at the centre post), No. 2
# sliding side window, No. 3 small fixed aft window with its sill rising steeply aft.
# Layout coordinates are the 787 flight deck's, mapped to the type (CK) so the panes sit where
# the pilots' eyes are.
SIX = G.TYPE in ("b738", "b763", "b744")
if SIX:
    # No. 1: narrow flat panes on the top front of the nose (a slanted wedge seen from the side)
    FRONT_PANE = [(G.CK[2] * y, CZ(z)) for (y, z) in
                  [(0.07, 0.76), (0.74, 0.80), (0.78, 1.29), (0.07, 1.31)]]
    SIDE_PANE_Z = (CZ(0.80), CZ(1.29))
    WIN_POST = 0.07      # width of the posts between the panes (m): the six panes read as one band
else:
    FRONT_PANE = [(G.CK[2] * y, CZ(z)) for (y, z) in
                  [(0.07, 0.70), (0.98, 0.55), (1.03, 1.25), (0.07, 1.36)]]   # front view (y, z), left
    SIDE_PANE_Z = (CZ(0.57), CZ(1.30))


def skin_s_at(y_target, z_target, s_lo=None, s_hi=None):
    """Station where the left skin passes through (y_target, z_target) (approx)."""
    best = None
    s_lo = CS(1.0) if s_lo is None else s_lo
    s_hi = CS(6.0) if s_hi is None else s_hi
    for s in np.linspace(s_lo, s_hi, 400):
        phi, arcn, C = G.section_arc(s, 720)
        y, z = G.fus_section(s, phi)
        half = len(phi) // 2
        yl, zl = y[half:], z[half:]
        if zl[-1] <= z_target <= zl[0]:
            yy = np.interp(z_target, zl[::-1], yl[::-1])
            if best is None and yy >= y_target:
                best = s
    return best if best is not None else s_hi


def skin_y_at(s, z_target):
    """half-width of the skin at station s and height z"""
    phi, arcn, C = G.section_arc(s, 720)
    y, z = G.fus_section(s, phi)
    half = len(phi) // 2
    yl, zl = np.abs(y[half:]), z[half:]
    return float(np.interp(z_target, zl[::-1], yl[::-1]))


# Side-view proportions of the band, measured from photographs (units of h, the band height at
# the No. 1 outer corner): the top edge is one straight line; post 1 (No. 1 / No. 2) rakes aft
# by rake1 per unit height (737 ~55 deg, 767 ~75 deg); No. 2 is w2 long at the top and its sill
# drops d2 aft; post 2 rakes by rake2; No. 3 is w3 long at the top with a vertical aft edge and
# its sill ending at e3 (737: rising steeply aft, 767: level).
# ytop: half-width of No. 1 at its top outer corner (m); the corners are found on the skin
# from it and the post rake, so post 1 is a straight line on the side of the nose.
WIN6 = {"b738": dict(ytop=0.42, rake1=0.70, w2=1.10, d2=0.30, rake2=0.25, w3=1.35, e3=-0.02),
        "b763": dict(ytop=0.70, rake1=0.27, w2=1.15, d2=0.22, rake2=0.05, w3=0.90, e3=-0.22),
        "b744": dict(ytop=0.78, rake1=0.35, w2=1.10, d2=0.20, rake2=0.08, w3=0.95, e3=-0.15)}
_SIX_CACHE = {}


def six_layout():
    """post-1 line and the No. 2 / No. 3 polygons in (s, z)"""
    if "L" in _SIX_CACHE:
        return _SIX_CACHE["L"]
    P = WIN6[G.TYPE]
    zb, zt = FRONT_PANE[1][1], FRONT_PANE[2][1]
    h = zt - zb
    st = next(s for s in np.linspace(CS(1.0), CS(6.0), 500) if skin_y_at(s, zt) >= P["ytop"])
    sb = st - P["rake1"] * h                          # post 1: bottom (No. 1 outer bottom corner)
    t2 = st + WIN_POST
    b2 = sb + WIN_POST
    t2a = t2 + P["w2"] * h
    zb2a = zb - P["d2"] * h
    b2a = t2a - P["rake2"] * (zt - zb2a)
    no2 = [(b2, zb), (b2a, zb2a), (t2a, zt), (t2, zt)]
    t3, b3 = t2a + WIN_POST, b2a + WIN_POST
    t3a = t3 + P["w3"] * h
    zb3 = zb2a + 0.03 * h
    no3 = [(b3, zb3), (t3a, zb + P["e3"] * h), (t3a, zt), (t3, zt)]
    _SIX_CACHE["L"] = ((sb, st, zb, zt), no2, no3)
    return _SIX_CACHE["L"]


if SIX:
    # No. 1 reaches out to post 1; its top outer corner is where the skin is at the top of the
    # post (a trapezoid narrower at the top, as on the aircraft)
    _sb, _st, _zb, _zt = six_layout()[0]
    FRONT_PANE[1] = (skin_y_at(_sb, _zb) + 0.03, _zb)
    FRONT_PANE[2] = (skin_y_at(_st, _zt) + 0.03, _zt)


def side_panes():
    """side windows as polygons in (s, z)"""
    if not SIX:
        return [side_pane_poly()]
    _, no2, no3 = six_layout()
    return [no2, no3]


def post1_sd(S, Z):
    """signed distance to the aft edge of No. 1 (negative forward of post 1)"""
    sb, st, zb, zt = six_layout()[0]
    k = (st - sb) / (zt - zb)
    return (S - (sb + k * (Z - zb))) / np.sqrt(1 + k * k)


def side_pane_poly():
    ky, kz = G.CK[2], G.CK[3]
    s_fb = skin_s_at(FRONT_PANE[1][0] + 0.10 * ky, SIDE_PANE_Z[0]) + 0.02
    s_ft = skin_s_at(FRONT_PANE[2][0] + 0.10 * ky, SIDE_PANE_Z[1]) + 0.02
    return [(s_fb, SIDE_PANE_Z[0]), (CS(4.92), SIDE_PANE_Z[0] + 0.05 * kz), (CS(4.66), SIDE_PANE_Z[1] + 0.08 * kz),
            (s_ft, SIDE_PANE_Z[1])]


def cockpit_window_masks(S, Y, Z, px):
    """Coverage of cockpit glass and of the surrounding gasket (both sides)."""
    ay = np.abs(Y)
    glass = np.zeros(S.shape, np.float32)
    frame = np.zeros(S.shape, np.float32)
    sps = side_panes()
    s_side0 = min(p[0] for p in sps[0])
    if SIX:
        d_front = np.maximum(sd_round_poly(ay, Z, FRONT_PANE, 0.04), post1_sd(S, Z))
        d_front = np.where(S < six_layout()[0][1] + 0.3, d_front, 9.0)
    else:
        d_front = np.where(S < CS(4.3), sd_round_poly(ay, Z, FRONT_PANE, 0.07), 9.0)
    d_side = np.full(S.shape, 9.0)
    for sp in sps:
        ds = sd_round_poly(S, Z, sp, 0.08 if not SIX else 0.03)
        d_side = np.minimum(d_side, ds)
    d_side = np.where((ay > (0.95 * G.CK[2] if not SIX else 0.2)) & (S < CS(5.3) + (0.6 if SIX else 0.0)), d_side, 9.0)
    d = np.minimum(d_front, d_side)
    glass = aa(d, px)
    frame = aa(np.abs(d + 0.012) - 0.018, px) * (1 - glass * 0.0)
    return glass, frame, d


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------
def text_image(text, font_path, height_m, ppm=220, italic_skew=0.0, tracking=0.0, index=0):
    size = int(height_m * ppm * 1.32)
    font = ImageFont.truetype(font_path, size, index=index)
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0] + int(tracking * ppm * len(text)) + 40
    h = bbox[3] - bbox[1] + 40
    img = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(img)
    if tracking:
        x = 20
        for ch in text:
            d.text((x - bbox[0], 20 - bbox[1]), ch, font=font, fill=255)
            x += font.getlength(ch) + tracking * ppm
    else:
        d.text((20 - bbox[0], 20 - bbox[1]), text, font=font, fill=255)
    if italic_skew:
        img = img.transform(img.size, Image.AFFINE, (1, italic_skew, -italic_skew * h * 0.5, 0, 1, 0),
                            resample=Image.BICUBIC)
    arr = np.asarray(img, np.float32) / 255.0
    rows = np.where(arr.max(1) > 0.01)[0]
    cols = np.where(arr.max(0) > 0.01)[0]
    arr = arr[rows[0]:rows[-1] + 1, cols[0]:cols[-1] + 1]
    return arr, ppm


def sample_text(arr, ppm, S, Z, s_start, z_top, side, s_len=None):
    """Side-view text lookup. Left side reads nose->tail, right side mirrored."""
    h, w = arr.shape
    L = w / ppm
    if side > 0:
        x = (S - s_start) * ppm
    else:
        x = (s_start + L - S) * ppm
    y = (z_top - Z) * ppm
    x0 = np.floor(x).astype(np.int64)
    y0 = np.floor(y).astype(np.int64)
    fx, fy = x - x0, y - y0
    inside = (x0 >= 0) & (y0 >= 0) & (x0 < w - 1) & (y0 < h - 1)
    x0c = np.clip(x0, 0, w - 2)
    y0c = np.clip(y0, 0, h - 2)
    v = (arr[y0c, x0c] * (1 - fx) * (1 - fy) + arr[y0c, x0c + 1] * fx * (1 - fy)
         + arr[y0c + 1, x0c] * (1 - fx) * fy + arr[y0c + 1, x0c + 1] * fx * fy)
    return np.where(inside, v, 0.0).astype(np.float32), L


def stamp_text(img_rgb, fm, text, font, height_m, s_start, z_center, color, sides=(1, -1), ppm=220,
               italic=0.0, tracking=0.0, index=0, height_map=None):
    arr, ppm = text_image(text, font, height_m, ppm, italic, tracking, index)
    h, w = arr.shape
    L = w / ppm
    H = h / ppm
    z_top = z_center + H / 2
    i0, i1 = fm.col(s_start - 0.1), fm.col(s_start + L + 0.1) + 1
    for side in sides:
        mask_side = (fm.Y[:, i0:i1] > 0) if side > 0 else (fm.Y[:, i0:i1] < 0)
        a, _ = sample_text(arr, ppm, fm.S[:, i0:i1], fm.Z[:, i0:i1], s_start, z_top, side)
        a = a * mask_side
        # only the outward facing half of the side
        blend(img_rgb[:, i0:i1], color, a)
    return L


# ---------------------------------------------------------------------------
# Fuselage
# ---------------------------------------------------------------------------
def belly_line(s):
    """Height of the navy belly boundary (design z) along the fuselage."""
    s = np.asarray(s, dtype=np.float64)
    z = np.interp(s, [0, 5.5, 9.0, 14.0, 30.0, 36.0, 42.0, 47.0, 51.0, 55.0, 70],
                  [-3.6, -3.4, -2.35, -1.62, -1.55, -1.45, -0.95, 0.10, 1.35, 3.5, 4.0])
    return z


# livery layout shared with the simulator (web/js/livery.js)
BELLY_S = [0, 5.5, 9.0, 14.0, 30.0, 36.0, 42.0, 47.0, 51.0, 55.0, 70]
BELLY_Z = [-3.6, -3.4, -2.35, -1.62, -1.55, -1.45, -0.95, 0.10, 1.35, 3.5, 4.0]
TITLE = dict(s0=10.4, zc=1.5, capHeight=1.2, maxLen=27.0)
TAIL = dict(s0=46.0, s1=G.LENGTH, z0=G.VT_Z0, z1=G.VT_ZTIP, logo=[55.6, 7.6, 1.55], k=1.0, sRef=48.0)
if G.TYPE != "b789":
    # belly sweep / titles / fin logo mapped from the 787 layout (fuselage stations, fin fractions)
    BELLY_S = [round(float(G.SMAP(s)), 3) if s <= 62.81 else round(G.LENGTH + s - 62.81, 3) for s in BELLY_S]
    BELLY_Z = [round(z * G.HR, 3) for z in BELLY_Z]
    TITLE = dict(s0=round(float(G.SMAP(10.4)), 3), zc=round(1.5 * G.HR, 3), capHeight=round(1.2 * G.HR, 3),
                 maxLen=round(27.0 * (G._SNEW[2] - G._SNEW[1]) / 33.5, 2))
    _zl = G.VT_Z0 + 0.5732 * (G.VT_ZTIP - G.VT_Z0)
    _le = float(G.vt_le(_zl))
    _c = float(G.vt_te(_zl)) - _le
    _k = (G.VT_ZTIP - G.VT_Z0) / 9.77
    TAIL = dict(s0=G.VT_S_LE0 - 3.25, s1=G.LENGTH, z0=G.VT_Z0, z1=G.VT_ZTIP,
                logo=[round(_le + 0.2398 * _c, 3), round(_zl, 3), round(0.2841 * _c, 3)],
                k=round(_k, 4), sRef=round(G.VT_S_LE0 - 1.25 * _k, 3))


# fin outline for fitting the airline mark inside it: [z, leading edge s, trailing edge s]
TAIL["fin"] = [[round(z, 2), round(float(G.vt_le(z)), 2), round(float(G.vt_te(z)), 2)]
               for z in np.arange(G.VT_Z0, G.VT_ZTIP + 0.01, 0.5)]


def livery_layout():
    return dict(
        note="design frame: s aft from nose, z up; three.js x = sCG - s, y = z, z = -y",
        sCG=G.S_CG, white="#f5f7f9",
        belly=dict(s=BELLY_S, z=BELLY_Z, fade=1.6, stripes=[[0.10, 0.075], [0.215, 0.022]], stripeS0=8.5),
        title=TITLE, tail=TAIL,
    )


def write_livery_json():
    import json
    out = livery_layout()
    if G.TYPE != "b789":
        return          # the other types carry their layout in <asset>.json
    path = os.path.join(HERE, "..", "web", "assets", "livery.json")
    with open(path, "w") as fh:
        json.dump(out, fh, indent=1)


def fuselage_textures(W=8192, H=2048):
    print("fuselage maps ...")
    fm = FuselageMaps(W, H)
    S, Y, Z, A = fm.S, fm.Y, fm.Z, fm.A
    px = float(G.LENGTH / W) * 1.2
    col = np.empty((H, W, 3), np.float32)
    col[:] = WHITE
    rough = np.full((H, W), 0.30, np.float32)
    height = np.zeros((H, W), np.float32)
    emis = np.zeros((H, W, 3), np.float32)

    # --- belly + sweep -----------------------------------------------------------
    # The livery paint (belly colour, pin-stripes, titles, fin) is applied at run time
    # by the simulator from assets/livery.json, so the airline can be customised.  The
    # baked texture is bare white paint with the windows, doors and panel lines, which
    # the livery shader multiplies (paint over detail).
    write_livery_json()

    # --- passenger windows -------------------------------------------------------
    print("windows ...")
    rows = G.window_rows()
    for side in (1, -1):
        for wz, sc in ((wz, sc) for wz, ws in rows for sc in ws):
            sl, d = side_feature(fm, sc, wz, WIN_W / 2, WIN_H / 2, side, 0.11)
            if sl is None:
                continue
            g = aa(d, px)
            ring = aa(np.abs(d + 0.006) - 0.012, px)
            sub = col[sl]
            blend(sub, GASKET, ring)
            blend(sub, GLASS, g)
            rough[sl] = rough[sl] * (1 - g) + 0.05 * g
            height[sl] -= 0.0025 * g + 0.0015 * ring
            # warm cabin light at night
            e = g[..., None] * np.array([1.0, 0.78, 0.48], np.float32)
            emis[sl] = np.maximum(emis[sl], e)

    # --- doors ------------------------------------------------------------------
    print("doors ...")
    for side in (1, -1):
        for dc in DOORS:
            zc = 0.5 * (DOOR_Z0 + DOOR_Z1)
            a0 = fm.arc_at_z(DOOR_Z0, side)[fm.col(dc)]
            a1 = fm.arc_at_z(DOOR_Z1, side)[fm.col(dc)]
            ha = abs(a1 - a0) / 2
            sl, d = side_feature(fm, dc, zc, DOOR_W / 2, ha, side, 0.19)
            if sl is None:
                continue
            line = aa(np.abs(d) - 0.0065, px)
            blend(col[sl], DOORLINE, line)
            height[sl] -= 0.004 * line
            # door window
            kd = DOOR_W / 1.07
            sl2, d2 = side_feature(fm, dc, DOOR_Z0 + 1.33 / 1.93 * (DOOR_Z1 - DOOR_Z0), 0.11 * kd, 0.17 * kd, side, 0.09 * kd)
            if sl2 is not None:
                g = aa(d2, px)
                blend(col[sl2], GLASS, g)
                rough[sl2] = rough[sl2] * (1 - g) + 0.05 * g
                emis[sl2] = np.maximum(emis[sl2], g[..., None] * np.array([1.0, 0.78, 0.48], np.float32))
            # handle recess
            sl3, d3 = side_feature(fm, dc - 0.02, DOOR_Z0 + 0.98 / 1.93 * (DOOR_Z1 - DOOR_Z0), 0.13 * kd, 0.05, side, 0.03)
            if sl3 is not None:
                a3 = aa(d3, px)
                blend(col[sl3], srgb("#9aa2ab"), a3)
                height[sl3] -= 0.002 * a3
            # red "door arming" stripe marks
            sl4, d4 = side_feature(fm, dc + DOOR_W / 2 + 0.09, DOOR_Z0 + 0.95 / 1.93 * (DOOR_Z1 - DOOR_Z0), 0.012,
                                   0.25, side, 0.005)
            if sl4 is not None:
                blend(col[sl4], srgb("#c8202a"), aa(d4, px))
        # over-wing emergency exits (737 / 767): outlined hatch with one window
        for (ec, ew, ez0, ez1) in G.EXITS:
            a0 = fm.arc_at_z(ez0, side)[fm.col(ec)]
            a1 = fm.arc_at_z(ez1, side)[fm.col(ec)]
            sl, d = side_feature(fm, ec, 0.5 * (ez0 + ez1), ew / 2, abs(a1 - a0) / 2, side, 0.08)
            if sl is not None:
                line = aa(np.abs(d) - 0.006, px)
                blend(col[sl], DOORLINE, line)
                height[sl] -= 0.004 * line
            # its window: on the main deck, or (747 upper-deck door) level with the upper windows
            wz = WIN_Z if ez0 < WIN_Z < ez1 else (G.WIN2[0] if G.WIN2 else WIN_Z)
            sl, d = side_feature(fm, ec, wz, WIN_W / 2, WIN_H / 2, side, 0.11)
            if sl is not None:
                g = aa(d, px)
                blend(col[sl], GLASS, g)
                rough[sl] = rough[sl] * (1 - g) + 0.05 * g
                emis[sl] = np.maximum(emis[sl], g[..., None] * np.array([1.0, 0.78, 0.48], np.float32))

    # --- cargo doors (right side) -----------------------------------------------
    for (sc, w, z0, z1) in CARGO:
        a0 = fm.arc_at_z(z0, -1)[fm.col(sc)]
        a1 = fm.arc_at_z(z1, -1)[fm.col(sc)]
        sl, d = side_feature(fm, sc, 0.5 * (z0 + z1), w / 2, abs(a1 - a0) / 2, -1, 0.15)
        if sl is None:
            continue
        line = aa(np.abs(d) - 0.006, px)
        blend(col[sl], DOORLINE if z1 > -1.2 else srgb("#5b6b82"), line)
        height[sl] -= 0.004 * line

    # --- barrel splice & panel lines (normal map only, very faint in colour) --------
    print("panel lines ...")
    for sj in G.SMAP([4.9, 12.35, 20.9, 35.9, 46.3, 52.6, 57.4]):
        d = np.abs(S - sj) - 0.003
        a = aa(d, px)
        height -= 0.0022 * a
        blend(col, srgb("#8e959d"), a * 0.18)
    # longitudinal skin laps at a few heights
    for zz in (1.95 * G.HR, -1.9 * G.HR):
        d = np.abs(Z - zz) - 0.0025
        a = aa(d, px) * ((S > G.SMAP(5)) & (S < G.SMAP(57)))
        height -= 0.0015 * a
    rng = np.random.default_rng(787)
    for k in range(70):
        sc = float(G.SMAP(rng.uniform(3.0, 58.0)))
        zc = float(rng.choice([-2.4, -2.1, -1.6, 1.9, 2.4, -0.2])) * G.HR
        side = int(rng.choice([1, -1]))
        w = float(rng.uniform(0.18, 0.55))
        h = float(rng.uniform(0.14, 0.4))
        if any(abs(sc - d) < 1.0 for d in DOORS):
            continue
        sl, d = side_feature(fm, sc, zc, w / 2, h / 2, side, 0.04)
        if sl is None:
            continue
        a = aa(np.abs(d) - 0.003, px)
        height[sl] -= 0.0015 * a
        blend(col[sl], srgb("#7b838c"), a * 0.25)

    # --- cockpit windows ------------------------------------------------------------
    print("cockpit ...")
    i1 = fm.col(CS(5.6))
    glass, frame, dwin = cockpit_window_masks(S[:, :i1], Y[:, :i1], Z[:, :i1], 0.009)
    sub = col[:, :i1]
    # painted black surround ("mask") around the flight-deck glass, as on the real 787
    mask = aa(dwin - 0.15, 0.02) if G.TYPE == "b789" else np.zeros_like(dwin)
    blend(sub, srgb("#101216"), mask)
    rough[:, :i1] = rough[:, :i1] * (1 - mask) + 0.22 * mask
    if SIX:
        # unpainted metal window frame around the whole band; the thin posts between the panes
        # are covered by it, so the six panes read as one strip of glass (as on 737 / 767)
        band = aa(dwin - 0.045, 0.012)
        blend(sub, srgb("#aab0b6"), band)
        rough[:, :i1] = rough[:, :i1] * (1 - band) + 0.38 * band
        blend(sub, srgb("#262b31"), aa(np.abs(dwin) - 0.005, 0.009) * 0.85)
    else:
        blend(sub, srgb("#1b2129"), frame)
    # slight vertical sky reflection gradient on the glass
    zz = Z[:, :i1]
    refl = np.clip((zz - CZ(0.5)) / 1.0, 0, 1)[..., None]
    gcol = srgb("#0e1319") * (1 - refl) + srgb("#28323f") * refl
    sub[:] = sub * (1 - glass[..., None]) + gcol * glass[..., None]
    rough[:, :i1] = rough[:, :i1] * (1 - glass) + 0.03 * glass
    height[:, :i1] -= 0.004 * glass + 0.002 * frame
    # windshield wiper hints
    # --- titles ------------------------------------------------------------------------
    print("titles ...")
    kt = max(G.HR, 0.8)
    stamp_text(col, fm, G.MODEL_LABEL, FONT_BOLD_IT, 0.38 * kt, CS(5.3), CZ(-0.62), NAVY, tracking=0.02)
    s_reg = float(G.SMAP(49.9))
    stamp_text(col, fm, G.REG, FONT_BOLD, 0.40 * kt, s_reg, 1.48 * G.HR, NAVY, tracking=0.03)
    # small door labels / static port markings
    for dc in DOORS:
        for side in (1, -1):
            pass
    # Japanese flag next to the registration (left & right)
    for side in (1, -1):
        s_fl = s_reg - 0.6 * kt
        sl, d = side_feature(fm, s_fl, 1.49 * G.HR, 0.30 * kt, 0.20 * kt, side, 0.0)
        if sl is not None:
            blend(col[sl], srgb("#ffffff"), aa(d, px))
            blend(col[sl], srgb("#d8d8d8"), aa(np.abs(d) - 0.004, px))
        sl, d = side_feature(fm, s_fl, 1.49 * G.HR, 0.12 * kt, 0.12 * kt, side, 0.12 * kt)
        if sl is not None:
            blend(col[sl], srgb("#bc002d"), aa(d, px))

    # --- output -----------------------------------------------------------------------
    print("writing fuselage textures ...")
    img = Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    img.save(os.path.join(TEX, "fuselage_base.jpg"), quality=93, subsampling=0)
    orm = np.zeros((H, W, 3), np.uint8)
    orm[..., 0] = 255
    orm[..., 1] = (np.clip(rough, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(orm, "RGB").resize((W // 2, H // 2), Image.LANCZOS).save(
        os.path.join(TEX, "fuselage_orm.jpg"), quality=92)
    write_normal(height, fm.du, float(np.mean(fm.dv)), os.path.join(TEX, "fuselage_normal.png"),
                 size=(W // 2, H // 2))
    em = Image.fromarray((np.clip(emis, 0, 1) * 255).astype(np.uint8), "RGB")
    em = em.resize((W // 2, H // 2), Image.LANCZOS)
    em.save(os.path.join(TEX, "fuselage_emissive.jpg"), quality=90)
    return fm


def write_normal(height, du, dv, path, size=None, strength=1.0):
    h = height.astype(np.float64)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * du)
    gy = -(np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * dv)   # rows go down = -v
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    img = Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB")
    if size:
        img = img.resize(size, Image.LANCZOS)
    if path.endswith(".png"):
        img.save(path, optimize=True)
    else:
        img.save(path, quality=95)


# ---------------------------------------------------------------------------
# Tail (fin + rudder) - planar side projection s in [46, L], z in [2, 11.77]
# ---------------------------------------------------------------------------
def tail_texture(W=2048, H=1536):
    s0, s1, z0, z1 = TAIL["s0"], G.LENGTH, G.VT_Z0, G.VT_ZTIP
    u = (np.arange(W) + 0.5) / W
    v = 1 - (np.arange(H) + 0.5) / H
    S, Zt = np.meshgrid(s0 + u * (s1 - s0), z0 + v * (z1 - z0))
    if G.TYPE != "b789":
        # paint in 787 fin coordinates: same height fraction and chord fraction on the fin
        k = TAIL["k"]
        h = (Zt - z0) / (z1 - z0)
        le = G.VT_S_LE0 + (Zt - z0) * math.tan(G.VT_LE_SWEEP)
        c = G.vt_te(Zt) - le
        x = (S - le) / c
        Zt = 2.0 + h * 9.77
        le7 = 49.25 + (Zt - 2.0) * math.tan(42.0 * G.D2R)
        c7 = (57.8 + (61.197 - 57.8) * h) - le7
        S = le7 + x * c7
        s0, s1, z0, z1 = 46.0, 62.81, 2.0, 11.77
        del k
    col = np.empty((H, W, 3), np.float32)
    # deep navy with a diagonal gradient
    t = np.clip((Zt - z0) / (z1 - z0) * 0.8 + (S - s0) / (s1 - s0) * 0.2, 0, 1)[..., None]
    col[:] = NAVY * (1 - t) + srgb("#08204a") * t
    px = (s1 - s0) / W * 1.5
    # sweeping cyan / gold ribbons from the root leading edge
    for (off, w, c) in ((0.0, 0.34, CYAN), (0.55, 0.07, GOLD)):
        zc = z0 + 1.2 + off + (S - 48.0) * 0.36 + 0.035 * (S - 48.0) ** 2
        d = np.abs(Zt - zc) - w / 2
        blend(col, c, aa(d, px) * (S > 47.0))
    # logo: rising sun + city skyline silhouette (white)
    cs, cz = 55.6, 7.6
    r = 1.55
    d = np.hypot(S - cs, Zt - cz) - r
    blend(col, srgb("#f6f8fb"), aa(d, px))
    d2 = np.hypot(S - cs, Zt - cz) - (r - 0.12)
    blend(col, GOLD, aa(d2, px))
    # skyline inside the disc (buildings as boxes)
    rng = np.random.default_rng(12)
    xs = np.linspace(cs - r, cs + r, 17)
    base = cz - 0.55
    sky = np.zeros_like(S, np.float32)
    for i in range(len(xs) - 1):
        hgt = float(rng.uniform(0.35, 1.35))
        if i in (7, 8):
            hgt = 1.9 if i == 7 else 1.55
        bx = 0.5 * (xs[i] + xs[i + 1])
        w = (xs[1] - xs[0]) * 0.45
        dd = sd_round_box(S - bx, Zt - (base + hgt / 2), w, hgt / 2, 0.01)
        sky = np.maximum(sky, aa(dd, px))
    # spire
    dd = sd_round_box(S - 0.5 * (xs[7] + xs[8]), Zt - (base + 2.25), 0.03, 0.35, 0.0)
    sky = np.maximum(sky, aa(dd, px))
    ground = aa(Zt - base, px)
    inside = aa(np.hypot(S - cs, Zt - cz) - (r - 0.12), px)
    blend(col, NAVY, np.maximum(sky, ground) * inside)
    # thin white rim
    dr = np.abs(np.hypot(S - cs, Zt - cz) - (r + 0.12)) - 0.035
    blend(col, srgb("#f6f8fb"), aa(dr, px))
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "tail_base.jpg"), quality=93)


# ---------------------------------------------------------------------------
# Wing: u = span / semi-span, v = 0.5 + 0.5*x (upper) / 0.5 - 0.5*x (lower)
# ---------------------------------------------------------------------------
def wing_textures(W=2048, H=2048):
    u = (np.arange(W) + 0.5) / W
    v = 1 - (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    span = U * G.Y_TIP
    upper = V >= 0.5
    x = np.abs(V - 0.5) * 2
    col = np.empty((H, W, 3), np.float32)
    col[:] = srgb("#cdd2d7")
    col[~upper] = srgb("#c2c7cd")
    height = np.zeros((H, W), np.float32)
    c = G.wing_chord(span)
    px_s = G.Y_TIP / W * 1.3
    px_x = 1.0 / H * 2 * 1.3
    # spanwise lines (spars / panel edges) in chord fraction
    for xf in (0.12, 0.16, 0.58, 0.64):
        d = np.abs(x - xf) * c - 0.004
        a = aa(d, px_x * c)
        height -= 0.002 * a
        blend(col, srgb("#9aa1a9"), a * 0.25)
    # chordwise panel joints every ~1.6 m
    for yy in np.arange(2.5, G.Y_TIP, 1.6):
        d = np.abs(span - yy) - 0.004
        a = aa(d, px_s) * ((x > 0.16) & (x < 0.58))
        height -= 0.0015 * a
        blend(col, srgb("#9aa1a9"), a * 0.2)
    # walkway (upper, inboard) - darker grey with "no step" border
    w0, w1 = float(G.WY(3.4)), float(G.WY(8.6))
    wk = (span > w0) & (span < w1) & (x > 0.18) & (x < 0.52) & upper
    blend(col, srgb("#b3b9c0"), wk.astype(np.float32) * 0.6)
    edge = ((np.abs(span - w0) < 0.03) | (np.abs(span - w1) < 0.03)) & (x > 0.18) & (x < 0.52) & upper
    blend(col, srgb("#1c1f24"), edge.astype(np.float32) * 0.8)
    # fuel caps / access panels on the lower skin
    rng = np.random.default_rng(9)
    for k in range(40):
        yy = float(G.WY(rng.uniform(3, 26)))
        xf = rng.uniform(0.25, 0.5)
        d = np.hypot(span - yy, (x - xf) * c) - 0.12
        a = aa(np.abs(d) - 0.004, px_s) * (~upper)
        height -= 0.0015 * a
        blend(col, srgb("#8d949c"), a * 0.4)
    Image.fromarray((np.clip(col, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(
        os.path.join(TEX, "wing_base.jpg"), quality=92)
    write_normal(height, G.Y_TIP / W, 0.5 * 7.0 / H, os.path.join(TEX, "wing_normal.png"))


def small_textures():
    # spinner spiral (u around, v along profile)
    W, H = 512, 512
    u = (np.arange(W) + 0.5) / W
    v = 1 - (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    col = np.empty((H, W, 3), np.float32)
    col[:] = srgb("#1c1f24")
    t = (U - V * 0.85) % 1.0
    a = np.clip(1 - np.abs(t - 0.06) / 0.05, 0, 1) ** 0.5 * (V < 0.8)
    blend(col, srgb("#f2f2f2"), a)
    Image.fromarray((col * 255).astype(np.uint8), "RGB").save(os.path.join(TEX, "spinner_base.jpg"), quality=90)
    # tyre tread (u around, v across)
    W, H = 64, 256
    v = (np.arange(H) + 0.5) / H
    col = np.empty((H, W, 3), np.float32)
    col[:] = srgb("#1a1a1a")
    for g in (0.34, 0.45, 0.55, 0.66):
        a = np.clip(1 - np.abs(v - g) / 0.012, 0, 1)[:, None]
        col = col * (1 - a[..., None]) + srgb("#070707") * a[..., None]
    side = ((v < 0.2) | (v > 0.8))[:, None, None]
    col = np.where(side, srgb("#232323"), col)
    Image.fromarray((col * 255).astype(np.uint8), "RGB").save(os.path.join(TEX, "tire_base.jpg"), quality=90)


def cockpit_shell_texture():
    """RGBA interior skin for the flight deck: alpha 0 where the windows are.
    Uses the same UV as the fuselage (u = s/L) but only s in [0, 7] matters;
    the texture spans u = 0 .. 7/L."""
    W, H = 1024, 2048
    s_max = CS(7.0)
    fm = FuselageMaps(W, H, s_range=(0.0, s_max))
    glass, frame, d = cockpit_window_masks(fm.S, fm.Y, fm.Z, 0.01)
    # interior: lining grey, darker frame around windows
    col = np.empty((H, W, 3), np.float32)
    col[:] = srgb("#b3b7ba")                       # light grey flight-deck lining
    zrel = np.clip((fm.Z - CZ(-0.2)) / 2.0, 0, 1)[..., None]
    col = col * (0.82 + 0.18 * zrel)
    low = (fm.Z < CZ(-0.35))[..., None]                # darker kick panels low down
    col = np.where(low, col * 0.55, col)
    # lining panel seams every ~0.55 m along the fuselage and a horizontal seam
    seam = np.clip(1 - np.abs(((fm.S + 0.1) % 0.55) - 0.275) / 0.004, 0, 1) * (np.abs(d) > 0.08)
    seam = np.maximum(seam, np.clip(1 - np.abs(fm.Z - CZ(0.62)) / 0.004, 0, 1))
    col = col * (1 - 0.35 * seam[..., None])
    blend(col, srgb("#2a2e33"), aa(np.abs(d) - 0.05, 0.02))
    alpha = 1.0 - aa(d + 0.02, 0.01)
    rgba = np.concatenate([np.clip(col, 0, 1), alpha[..., None]], -1)
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(TEX, "cockpit_shell.png"),
                                                                      optimize=True)
    return s_max


def generate_all():
    fuselage_textures()
    tail_texture()
    wing_textures()
    small_textures()
    cockpit_shell_texture()
    print("textures done")


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1:
        for name in sys.argv[1:]:
            globals()[name]()
    else:
        generate_all()
