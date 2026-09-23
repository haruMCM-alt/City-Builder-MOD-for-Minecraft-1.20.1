"""
Boeing 787-9 geometry definition (pure numpy, no bpy).

Design coordinate system (used everywhere in this file):
    s : station, metres aft of the nose tip           (0 .. 62.81)
    y : lateral, metres, +left  (right wing is y < 0)
    z : vertical, metres, 0 = fuselage reference line (+up)

Published figures this geometry is built to (see ../docs/SPECS.md):
    overall length 62.81 m, wingspan 60.12 m, height 17.02 m,
    fuselage 5.77 m wide x 5.97 m high, wing area 377 m^2,
    1/4-chord sweep 32.2 deg, wheelbase 25.83 m, main-gear track 9.80 m,
    GEnx-1B fan diameter 2.82 m (111 in).
"""
import math

import numpy as np
from scipy.interpolate import PchipInterpolator

# ---------------------------------------------------------------------------
# Global figures
# ---------------------------------------------------------------------------
LENGTH = 62.81
SPAN = 60.12
HEIGHT = 17.02
FUS_W = 5.77
FUS_H = 5.97
R_W = FUS_W / 2.0          # 2.885
H_T = FUS_H / 2.0          # 2.985 above reference line
H_B = FUS_H / 2.0          # 2.985 below
WHEELBASE = 25.83
TRACK = 9.80

GROUND_Z = -5.25           # ground plane (static, gear uncompressed-ish)
S_CG = 31.85               # reference CG station (~25 % MAC)
FLOOR_Z = -1.00            # main deck floor

S_MAIN = 33.55             # main gear station
S_NOSE = S_MAIN - WHEELBASE  # 7.72
Y_MAIN = TRACK / 2.0

# ---------------------------------------------------------------------------
# Fuselage
# ---------------------------------------------------------------------------
_top = PchipInterpolator(
    [0.0, 0.05, 0.25, 0.6, 1.2, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0, 7.0, 8.0, 9.5,
     11.0, 49.0, 52.0, 55.0, 58.0, 60.5, LENGTH],
    [-0.55, -0.34, -0.10, 0.10, 0.33, 0.57, 0.78, 1.01, 1.26, 1.50, 1.72, 1.92, 2.10, 2.27,
     2.54, 2.75, 2.92, H_T, H_T, 2.90, 2.66, 2.32, 2.02, 1.72])
_bot = PchipInterpolator(
    [0.0, 0.05, 0.25, 0.6, 1.2, 2.0, 3.0, 4.2, 5.5, 7.0, 8.5, 40.5, 44.0, 48.0, 52.0,
     55.0, 58.0, 60.5, LENGTH],
    [-0.55, -0.76, -1.02, -1.32, -1.70, -2.08, -2.42, -2.68, -2.85, -2.955, -H_B, -H_B,
     -2.90, -2.55, -1.85, -1.15, -0.35, 0.35, 0.92])
_hw = PchipInterpolator(
    [0.0, 0.05, 0.25, 0.6, 1.2, 2.0, 3.0, 4.2, 5.5, 7.0, 8.5, 10.0, 44.5, 48.0, 52.0,
     56.0, 59.5, LENGTH],
    [0.0, 0.22, 0.50, 0.78, 1.12, 1.50, 1.88, 2.22, 2.50, 2.72, 2.84, R_W, R_W, 2.72,
     2.20, 1.45, 0.78, 0.36])
_zw = PchipInterpolator([0.0, 2.0, 5.0, 8.5, 44.0, 50.0, 56.0, LENGTH],
                        [-0.55, -0.42, -0.18, 0.0, 0.0, 0.25, 0.75, 1.32])


def fus_profile(s):
    s = np.asarray(s, dtype=np.float64)
    return _top(s), _bot(s), _hw(s), _zw(s)


def _bump(s, a, b, c, d):
    s = np.asarray(s, dtype=np.float64)
    up = np.clip((s - a) / (b - a), 0, 1)
    dn = np.clip((d - s) / (d - c), 0, 1)
    up = up * up * (3 - 2 * up)
    dn = dn * dn * (3 - 2 * dn)
    return np.minimum(up, dn)


def fus_section(s, phi):
    """Points of the fuselage skin at station s for parameter(s) phi.

    phi = 0 bottom centre, pi/2 right side (y<0), pi top, 3pi/2 left side.
    Returns y, z arrays (broadcast over s, phi).
    """
    s = np.asarray(s, dtype=np.float64)
    phi = np.asarray(phi, dtype=np.float64)
    zt, zb, hw, zw = fus_profile(s)
    sp, cp = np.sin(phi), np.cos(phi)
    lower = cp > 0
    n_side_top, n_side_bot = 2.0, 2.15
    ex_top, ex_bot = 2.0, 2.3
    n_y = np.where(lower, n_side_bot, n_side_top)
    n_z = np.where(lower, ex_bot, ex_top)
    y = -hw * np.sign(sp) * np.abs(sp) ** (2.0 / n_y)
    z_up = zw + (zt - zw) * np.abs(cp) ** (2.0 / n_z)
    z_dn = zw - (zw - zb) * np.abs(cp) ** (2.0 / n_z)
    z = np.where(lower, z_dn, z_up)
    # wing-to-body (belly) fairing: broadens and deepens the lower lobe
    A = _bump(s, 19.0, 25.5, 36.5, 43.5)
    d = np.where(lower, np.abs(cp), 0.0)
    side_w = np.where(lower, np.clip(1.0 - np.abs(cp - 0.55) / 0.55, 0, 1), 0.0)
    y = y * (1.0 + 0.105 * A * side_w)
    z = z - 0.30 * A * d ** 1.5
    return y, z


def section_arc(s, n=512):
    """Return phi samples and normalised arc length (0..1) for station s."""
    phi = np.linspace(0.0, 2 * math.pi, n + 1)
    y, z = fus_section(s, phi)
    seg = np.hypot(np.diff(y), np.diff(z))
    arc = np.r_[0.0, np.cumsum(seg)]
    C = arc[-1]
    return phi, arc / max(C, 1e-9), C


def fus_stations():
    """Station distribution: dense at nose and tail."""
    a = np.linspace(0.0, 1.0, 40) ** 2 * 1.2          # 0 .. 1.2 (blunt tip)
    b = np.linspace(1.2, 11.0, 70)[1:]
    c = np.linspace(11.0, 40.0, 70)[1:]
    d = np.linspace(40.0, LENGTH, 110)[1:]
    st = np.unique(np.r_[a, b, c, d])
    st[0] = 0.0015
    return st


# ---------------------------------------------------------------------------
# Airfoils (CST parameterisation)
# ---------------------------------------------------------------------------
def _bernstein(x, n):
    from math import comb
    return np.stack([comb(n, i) * x ** i * (1 - x) ** (n - i) for i in range(n + 1)], axis=-1)


def cst(x, A, n1=0.5, n2=1.0, te=0.0):
    C = x ** n1 * (1 - x) ** n2
    S = _bernstein(x, len(A) - 1) @ np.asarray(A)
    return C * S + x * te


# supercritical (SC(2)-07xx-like) upper/lower CST weights
SC_UP = [0.1305, 0.1355, 0.1560, 0.1480, 0.2150, 0.2080]
SC_LO = [-0.1290, -0.1195, -0.0560, -0.1950, 0.0180, 0.0820]
SYM = [0.1450, 0.1250, 0.1400, 0.1150, 0.1100, 0.1000]


def airfoil(x, tc, kind="sc"):
    """Upper / lower z (fraction of chord) at chord stations x for thickness tc."""
    x = np.clip(np.asarray(x, dtype=np.float64), 0.0, 1.0)
    if kind == "sc":
        zu = cst(x, SC_UP, te=0.0012)
        zl = cst(x, SC_LO, te=-0.0012)
        ref_t = 0.09833
    else:
        zu = cst(x, SYM, te=0.001)
        zl = -zu
        ref_t = 0.10120
    k = tc / ref_t
    camber = (zu + zl) * 0.5
    thick = (zu - zl) * 0.5 * k
    ck = 1.0 if kind == "sc" else 0.0
    cm = camber * ck * np.minimum(1.0, 0.55 + 0.45 * k)
    return cm + thick, cm - thick


def cos_space(a, b, n):
    t = (1 - np.cos(np.linspace(0, math.pi, n))) / 2
    return a + (b - a) * t


# ---------------------------------------------------------------------------
# Main wing
# ---------------------------------------------------------------------------
TAN = math.tan
_trapz = getattr(np, "trapezoid", None) or np.trapz
D2R = math.pi / 180.0
WING_S_LE0 = 22.15         # LE station at the aircraft centreline (virtual)
WING_C0 = 12.70            # centreline chord (gross)
Y_KINK = 9.85              # trailing-edge kink (engine)
Y_RAKE = 27.55             # start of raked tip
Y_TIP = SPAN / 2.0         # 30.06
LE_SWEEP = 35.4 * D2R
TE_IN_SWEEP = 8.0 * D2R
TE_OUT_SWEEP = 24.8 * D2R
RAKE_LE_SWEEP = 55.0 * D2R
RAKE_TE_SWEEP = 32.0 * D2R
WING_Z0 = -1.78            # chord plane height at centreline
DIHEDRAL = 6.0 * D2R


def wing_le(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    le = WING_S_LE0 + np.minimum(y, Y_RAKE) * TAN(LE_SWEEP)
    le = le + np.maximum(y - Y_RAKE, 0) * TAN(RAKE_LE_SWEEP)
    return le


def wing_te(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    te0 = WING_S_LE0 + WING_C0
    te = te0 + np.minimum(y, Y_KINK) * TAN(TE_IN_SWEEP)
    te = te + np.clip(y - Y_KINK, 0, Y_RAKE - Y_KINK) * TAN(TE_OUT_SWEEP)
    te = te + np.maximum(y - Y_RAKE, 0) * TAN(RAKE_TE_SWEEP)
    # soften the TE kink a little (yehudi fillet)
    k = np.exp(-((y - Y_KINK) / 1.2) ** 2) * 0.10
    return te + k


def wing_chord(y):
    return wing_te(y) - wing_le(y)


def wing_z(y):
    """Chord-plane height (static, 1g on ground) incl. slight upward curve."""
    y = np.abs(np.asarray(y, dtype=np.float64))
    return WING_Z0 + y * TAN(DIHEDRAL) + 0.00085 * y ** 2


def wing_tc(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    return np.interp(y, [0, 3.0, Y_KINK, 20.0, Y_TIP], [0.150, 0.140, 0.113, 0.098, 0.092])


def wing_twist(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    return np.interp(y, [0, 3.0, Y_KINK, Y_RAKE, Y_TIP], [4.2, 3.8, 1.6, -1.2, -2.0]) * D2R


def wing_point(y, x, upper, side=1):
    """3-D point (s, y, z) on the wing skin.

    y  : spanwise distance (>=0), x : chord fraction, upper: bool, side +1 left / -1 right
    """
    y = np.asarray(y, dtype=np.float64)
    x = np.asarray(x, dtype=np.float64)
    c = wing_chord(y)
    le = wing_le(y)
    zu, zl = airfoil(x, wing_tc(y))
    zc = np.where(upper, zu, zl)
    tw = wing_twist(y)
    # rotate about 40 % chord (nose-up twist positive)
    dx = (x - 0.40) * c
    dz = zc * c
    ct, st = np.cos(tw), np.sin(tw)
    s = le + 0.40 * c + dx * ct + dz * st
    z = wing_z(y) - dx * st + dz * ct
    return np.stack([s, side * y + 0 * s, z], axis=-1)


def wing_area_mac():
    ys = np.linspace(0, Y_TIP, 4001)
    c = wing_chord(ys)
    area = 2 * _trapz(c, ys)
    mac = 2 * _trapz(c * c, ys) / area
    y_mac = 2 * _trapz(c * ys, ys) / area
    le_mac = float(wing_le(y_mac))
    return area, mac, y_mac, le_mac


# control-surface layout (spanwise y0..y1, chord fraction start)
FLAP_IN = dict(y0=3.25, y1=9.30, x0=0.725)
FLAPERON = dict(y0=9.95, y1=12.15, x0=0.745)
FLAP_OUT = dict(y0=12.20, y1=21.85, x0=0.745)
AILERON = dict(y0=21.95, y1=27.20, x0=0.760)
SLAT = dict(y0=11.25, y1=27.20, x1=0.140)
SPOILERS = [(4.05, 6.55), (6.60, 9.20), (12.35, 14.25), (14.30, 16.20), (16.25, 18.15),
            (18.20, 20.05), (20.10, 21.75)]
SPOILER_X = (0.585, 0.722)
SLAT_SPLITS = [11.25, 13.9, 16.5, 19.1, 21.7, 24.4, 27.20]

# ---------------------------------------------------------------------------
# Engines (GE GEnx-1B)
# ---------------------------------------------------------------------------
ENG_Y = 9.85
ENG_Z = -2.50
FAN_R = 1.41               # 2.82 m fan
NAC_OUTER = [(0.00, 1.515), (0.03, 1.585), (0.10, 1.640), (0.25, 1.690), (0.55, 1.735),
             (1.00, 1.760), (1.60, 1.765), (2.40, 1.748), (3.20, 1.700), (3.90, 1.620),
             (4.55, 1.505), (5.10, 1.385)]
NAC_INNER = [(0.00, 1.515), (0.02, 1.480), (0.08, 1.450), (0.20, 1.428), (0.45, 1.418),
             (0.80, 1.414), (1.15, 1.412)]
FAN_A = 1.20               # fan axial position from highlight
NOZZLE_A = 5.10            # fan nozzle exit (mean)
CHEVRONS = 18
CORE_A0, CORE_A1 = 5.10, 6.62
PLUG_A1 = 7.72

ENG_S_HL = float(WING_S_LE0 + ENG_Y * TAN(LE_SWEEP)) - 5.0   # inlet highlight station

# ---------------------------------------------------------------------------
# Empennage
# ---------------------------------------------------------------------------
HT_S_LE0 = 50.85
HT_C0 = 6.30
HT_SEMI = 9.72
HT_LE_SWEEP = 37.5 * D2R
HT_TIP_C = 1.80
HT_Z0 = 0.95
HT_DIHEDRAL = 7.0 * D2R
ELEV = dict(y0=1.55, y1=9.35, x0=0.715)
HT_PIVOT_S = 56.2

VT_Z0 = 2.0                # root section (inside fuselage)
VT_ZTIP = HEIGHT + GROUND_Z  # 11.77 -> 17.02 m above ground
VT_S_LE0 = 49.25
VT_C0 = 8.55
VT_TIP_C = 3.15
VT_LE_SWEEP = 42.0 * D2R
RUDDER = dict(z0=3.05, z1=11.30, x0=0.695)


def ht_le(y):
    return HT_S_LE0 + np.abs(y) * TAN(HT_LE_SWEEP)


def ht_chord(y):
    return HT_C0 + (HT_TIP_C - HT_C0) * np.clip(np.abs(y) / HT_SEMI, 0, 1)


def ht_point(y, x, upper, side=1):
    y = np.asarray(y, dtype=np.float64)
    x = np.asarray(x, dtype=np.float64)
    c = ht_chord(y)
    zu, zl = airfoil(x, 0.105 - 0.02 * np.clip(y / HT_SEMI, 0, 1), kind="sym")
    zc = np.where(upper, zu, zl)
    s = ht_le(y) + x * c
    z = HT_Z0 + y * TAN(HT_DIHEDRAL) + zc * c
    return np.stack([s, side * y + 0 * s, z], axis=-1)


def vt_le(z):
    z = np.asarray(z, dtype=np.float64)
    h = z - VT_Z0
    le = VT_S_LE0 + h * TAN(VT_LE_SWEEP)
    # dorsal fillet: LE pulled forward near the root
    fil = np.clip(1.0 - h / 1.55, 0, 1) ** 2 * 3.1
    return le - fil


def vt_te(z):
    z = np.asarray(z, dtype=np.float64)
    h = (z - VT_Z0) / (VT_ZTIP - VT_Z0)
    te0 = VT_S_LE0 + VT_C0
    te1 = VT_S_LE0 + (VT_ZTIP - VT_Z0) * TAN(VT_LE_SWEEP) + VT_TIP_C
    return te0 + (te1 - te0) * h


def vt_point(z, x, side):
    """Fin skin point. side +1 left skin, -1 right skin."""
    z = np.asarray(z, dtype=np.float64)
    x = np.asarray(x, dtype=np.float64)
    le = vt_le(z)
    c = vt_te(z) - le
    zu, _ = airfoil(x, 0.105, kind="sym")
    # thickness based on the un-filleted chord so the dorsal fin stays slim
    c_ref = vt_te(z) - (VT_S_LE0 + (z - VT_Z0) * TAN(VT_LE_SWEEP))
    s = le + x * c
    y = side * zu * c_ref
    return np.stack([s, y, z + 0 * s], axis=-1)


# ---------------------------------------------------------------------------
# Landing gear
# ---------------------------------------------------------------------------
NOSE_TIRE_D, NOSE_TIRE_W = 1.02, 0.40
MAIN_TIRE_D, MAIN_TIRE_W = 1.37, 0.53
MAIN_AXLE_DS = 0.80        # half of bogie wheelbase
MAIN_WHEEL_DY = 0.74       # half of tyre spacing on an axle
NOSE_WHEEL_DY = 0.34


# ---------------------------------------------------------------------------
# Crew / lights
# ---------------------------------------------------------------------------
EYE = (4.15, 0.53, 1.08)   # captain eye point (s, y, z)


def to_blender(p):
    """Design (s, y, z) -> Blender (X fwd, Y left, Z up) with CG at origin."""
    p = np.asarray(p, dtype=np.float64)
    out = p.copy()
    out[..., 0] = S_CG - p[..., 0]
    return out


def to_three(p):
    """Design -> three.js aircraft frame (x fwd, y up, z right)."""
    s, y, z = p
    return [S_CG - s, z, -y]


if __name__ == "__main__":
    a, mac, ymac, lemac = wing_area_mac()
    print("wing area %.1f m2  MAC %.2f m at y=%.2f  LE(MAC) s=%.2f" % (a, mac, ymac, lemac))
    print("CG at 25%% MAC -> s=%.2f" % (lemac + 0.25 * mac))
    print("span", 2 * Y_TIP, "tip chord", wing_chord(Y_TIP))
    for yy in (0, 2.9, Y_KINK, Y_RAKE, Y_TIP):
        print("y=%.2f  le=%.2f te=%.2f c=%.2f z=%.2f" % (yy, wing_le(yy), wing_te(yy), wing_chord(yy), wing_z(yy)))
    zu, zl = airfoil(np.linspace(0, 1, 201), 0.12)
    print("t/c check", (zu - zl).max())
    print("HT area", 2 * _trapz(ht_chord(np.linspace(0, HT_SEMI, 100)), np.linspace(0, HT_SEMI, 100)))
    zz = np.linspace(2.9, VT_ZTIP, 100)
    print("VT exposed area", _trapz(vt_te(zz) - vt_le(zz), zz))
    print("nose gear s", S_NOSE)
