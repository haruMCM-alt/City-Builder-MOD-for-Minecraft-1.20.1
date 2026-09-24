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
import os

import numpy as np
from scipy.interpolate import PchipInterpolator

# ---------------------------------------------------------------------------
# Aircraft type (AC_TYPE environment variable): b789 (default), b738, b763.
# Everything below is first defined for the 787-9; the other types override the
# published figures and derive the rest by mapping the 787 shapes (see apply_type).
# ---------------------------------------------------------------------------
TYPE = os.environ.get("AC_TYPE", "b789")
ASSET = {"b789": "b787-9", "b738": "b737-800", "b763": "b767-300er"}[TYPE]
NAME = {"b789": "Boeing 787-9", "b738": "Boeing 737-800", "b763": "Boeing 767-300ER"}[TYPE]

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


BUMP = (19.0, 25.5, 36.5, 43.5)     # wing-to-body fairing extent (stations)
BUMP_W, BUMP_D = 0.105, 0.30


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
    A = _bump(s, *BUMP)
    d = np.where(lower, np.abs(cp), 0.0)
    side_w = np.where(lower, np.clip(1.0 - np.abs(cp - 0.55) / 0.55, 0, 1), 0.0)
    y = y * (1.0 + BUMP_W * A * side_w)
    z = z - BUMP_D * A * d ** 1.5
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
FILLET_W = 1.2
TC_Y = (3.0, 20.0)
TC = [0.150, 0.140, 0.113, 0.098, 0.092]
TWIST = [4.2, 3.8, 1.6, -1.2, -2.0]
WINGLET = None             # blended winglet (737): dict(r, theta, h, c_tip, sweep)


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
    k = np.exp(-((y - Y_KINK) / FILLET_W) ** 2) * 0.10
    return te + k


def wing_chord(y):
    return wing_te(y) - wing_le(y)


def wing_z(y):
    """Chord-plane height (static, 1g on ground) incl. slight upward curve."""
    y = np.abs(np.asarray(y, dtype=np.float64))
    return WING_Z0 + y * TAN(DIHEDRAL) + 0.00085 * y ** 2


def wing_tc(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    return np.interp(y, [0, TC_Y[0], Y_KINK, TC_Y[1], Y_TIP], TC)


def wing_twist(y):
    y = np.abs(np.asarray(y, dtype=np.float64))
    return np.interp(y, [0, TC_Y[0], Y_KINK, Y_RAKE, Y_TIP], TWIST) * D2R


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

ENG_FWD = 5.0              # inlet highlight ahead of the wing leading edge
ENG_S_HL = float(WING_S_LE0 + ENG_Y * TAN(LE_SWEEP)) - ENG_FWD   # inlet highlight station
ENG_KA, ENG_KR = 1.0, 1.0  # axial / radial scale of the (GEnx-sized) nacelle model
FAN_BLADES = 18
ENG_FLAT = 0.0             # flattened nacelle bottom (737 "hamster pouch")

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
VT_FIL = (1.55, 3.1)       # dorsal fillet height / length


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
    fil = np.clip(1.0 - h / VT_FIL[0], 0, 1) ** 2 * VT_FIL[1]
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
MAIN_AXLES = (-MAIN_AXLE_DS, MAIN_AXLE_DS)


# ---------------------------------------------------------------------------
# Crew / lights
# ---------------------------------------------------------------------------
EYE = (4.15, 0.53, 1.08)   # captain eye point (s, y, z)
EYE787 = EYE

# ---------------------------------------------------------------------------
# Fuselage openings / markings (787-9 values; overridden per type)
# ---------------------------------------------------------------------------
DOORS = [6.95, 17.55, 40.45, 53.85]
DOOR_W, DOOR_Z0, DOOR_Z1 = 1.07, -0.93, 1.00
DOOR_GAP = 0.95            # no windows closer than this to a door centre
EXITS = []                 # over-wing emergency exits (s, width, z0, z1)
WIN_Z, WIN_W, WIN_H, WIN_PITCH = 0.30, 0.27, 0.47, 0.965
WIN_S = (8.35, 55.2)       # first window / last window limit
CARGO = [(14.55, 2.69, -2.62, -0.98), (44.25, 2.69, -2.55, -0.95), (47.85, 0.95, -2.05, -0.95)]
MODEL_LABEL, REG = "787-9", "JA787C"
CK = (1.0, 0.0, 1.0, 1.0, 0.0)   # cockpit map from the 787 layout: (ks, ds, ky, kz, dz)
HR = WR = 1.0              # fuselage height / width ratio to the 787-9
SPEC = dict(S=377.0, b=60.12, c=7.71, OEW=128850, MTOW=254011, MLW=192777, MZFW=181437,
            fuelCapacity=101100, thrustSL=329600, VMO=350, MMO=0.90)
ENGINE_NAME = "GE GEnx-1B"

_S787 = [0.0, 11.0, 44.5, 62.81]
_SNEW = list(_S787)


def SMAP(s787):
    """Map a 787-9 fuselage station to this type (nose / cabin / tail cone piecewise)."""
    return np.interp(s787, _S787, _SNEW)


def SUNMAP(s):
    return np.interp(s, _SNEW, _S787)


def WY(y787):
    """Map a 787-9 spanwise position (y) to this type's wing."""
    r0, r1 = 2.9, 2.9 * WR
    return r1 + (np.asarray(y787, dtype=np.float64) - r0) * (Y_TIP - r1) / (30.06 - r0)


def ck(p):
    """787 cockpit layout point (s, y, z) -> this type's flight deck."""
    ks, ds, ky, kz, dz = CK
    p = np.asarray(p, dtype=np.float64)
    out = p.copy()
    out[..., 0] = ds + ks * p[..., 0]
    out[..., 1] = ky * p[..., 1]
    out[..., 2] = dz + kz * p[..., 2]
    return out


TYPES = {
    "b738": dict(
        LENGTH=39.47, SPAN=35.79, HEIGHT=12.55, FUS_W=3.76, FUS_H=4.01, NL=7.0, T0=27.55,
        GROUND_Z=-3.40, FLOOR_Z=-0.62, S_NOSE=4.4, WHEELBASE=15.60, TRACK=5.72,
        WING_C0=7.0, Y_KINK=4.3, Y_TIP=16.95, LE=28.0, TE_IN=0.0, TE_OUT=14.5, WING_Z0=-1.35,
        TC=[0.155, 0.145, 0.125, 0.105, 0.100], TWIST=[3.5, 3.2, 1.5, -1.0, -1.5],
        WINGLET=dict(r=0.6, theta=72.0, h=2.49, c_tip=0.6, sweep=40.0),
        ENG_Y=4.87, ENG_Z=-1.95, ENG_FWD=2.9, ENG_KA=0.59, ENG_KR=0.55, FAN_BLADES=24, ENG_FLAT=0.16,
        HT_S_LE0=32.4, HT_C0=4.0, HT_SEMI=7.17, HT_LE=33.0, HT_TIP_C=1.2, HT_Z0=0.45,
        VT_Z0=1.3, VT_S_LE0=28.0, VT_C0=5.9, VT_TIP_C=1.6, VT_LE=35.0, VT_FIL=(1.4, 4.2),
        NOSE_TIRE=(0.69, 0.20, 0.17), MAIN_TIRE=(1.13, 0.42, 0.43), MAIN_AXLE_DS=0.0,
        DOORS=[4.55, 33.9], DOOR=(0.86, -0.57, 1.26), DOOR_GAP=0.62,
        EXITS=[(15.9, 0.51, -0.18, 0.80), (16.8, 0.51, -0.18, 0.80)],
        WIN=(0.28, 0.25, 0.36, 0.508), WIN_S=(6.1, 33.0),
        CARGO=[(8.8, 1.22, -1.95, -1.05), (27.8, 1.22, -1.90, -1.05)],
        LABEL="737-800", REG="JA738C", CK=(0.70, -0.505, 0.90, 0.912, -0.365),
        SPEC=dict(S=124.6, b=35.79, c=3.96, OEW=41413, MTOW=79016, MLW=66361, MZFW=62732,
                  fuelCapacity=20894, thrustSL=117000, VMO=340, MMO=0.82),
        ENGINE="CFM International CFM56-7B26",
    ),
    "b763": dict(
        LENGTH=54.94, SPAN=47.57, HEIGHT=15.85, FUS_W=5.03, FUS_H=5.41, NL=9.6, T0=38.74,
        GROUND_Z=-4.75, FLOOR_Z=-0.95, S_NOSE=6.3, WHEELBASE=22.76, TRACK=9.30,
        WING_C0=12.0, Y_KINK=7.6, Y_TIP=23.785, LE=34.0, TE_IN=0.0, TE_OUT=20.0, WING_Z0=-1.75,
        TC=[0.150, 0.140, 0.115, 0.100, 0.095], TWIST=[4.0, 3.6, 1.6, -1.0, -1.8],
        WINGLET=None,
        ENG_Y=7.6, ENG_Z=-2.75, ENG_FWD=3.9, ENG_KA=0.75, ENG_KR=0.78, FAN_BLADES=38, ENG_FLAT=0.0,
        HT_S_LE0=43.9, HT_C0=5.6, HT_SEMI=9.31, HT_LE=34.0, HT_TIP_C=1.7, HT_Z0=0.9,
        VT_Z0=1.8, VT_S_LE0=41.3, VT_C0=8.2, VT_TIP_C=2.9, VT_LE=40.0, VT_FIL=(1.5, 2.8),
        NOSE_TIRE=(0.94, 0.33, 0.28), MAIN_TIRE=(1.17, 0.44, 0.57), MAIN_AXLE_DS=0.71,
        DOORS=[6.3, 17.2, 46.9], DOOR=(1.07, -0.88, 1.00), DOOR_GAP=0.85,
        EXITS=[(24.0, 0.51, -0.30, 0.68)],
        WIN=(0.30, 0.25, 0.38, 0.508), WIN_S=(8.0, 48.5),
        CARGO=[(12.3, 3.40, -2.35, -0.95), (40.8, 1.78, -2.25, -0.95), (44.1, 0.97, -1.95, -1.0)],
        LABEL="767-300ER", REG="JA763C", CK=(0.855, 0.0, 0.92, 0.906, 0.0),
        SPEC=dict(S=283.3, b=47.57, c=6.99, OEW=90010, MTOW=186880, MLW=145150, MZFW=133810,
                  fuelCapacity=73100, thrustSL=267000, VMO=360, MMO=0.86),
        ENGINE="GE CF6-80C2B6",
    ),
}

# 737-800: sharper nose (explicit profile, type coordinates) - top / bottom / half width / centre
NOSE_B738 = dict(
    top=([0, .04, .2, .5, 1, 1.5, 2, 2.5, 3, 3.6, 4.5, 5.5, 7],
         [-.60, -.42, -.22, 0, .28, .62, 1.0, 1.32, 1.58, 1.78, 1.93, 1.99, 2.005]),
    bot=([0, .04, .2, .5, 1, 1.6, 2.4, 3.4, 4.6, 6, 7],
         [-.60, -.76, -.92, -1.10, -1.33, -1.55, -1.75, -1.90, -1.97, -2.0, -2.005]),
    hw=([0, .04, .2, .5, 1, 1.6, 2.4, 3.4, 4.6, 6, 7],
        [0, .17, .36, .56, .84, 1.12, 1.40, 1.64, 1.80, 1.87, 1.88]),
    zw=([0, 1.5, 3.5, 6, 7], [-.6, -.45, -.18, -.02, 0]),
)


def apply_type(t):
    g = globals()
    T = TYPES[t]
    for k in ("LENGTH", "SPAN", "HEIGHT", "FUS_W", "FUS_H", "GROUND_Z", "FLOOR_Z", "WHEELBASE", "TRACK",
              "WING_C0", "Y_KINK", "Y_TIP", "WING_Z0", "TC", "TWIST", "WINGLET", "ENG_Y", "ENG_Z", "ENG_FWD",
              "ENG_KA", "ENG_KR", "FAN_BLADES", "ENG_FLAT", "HT_S_LE0", "HT_C0", "HT_SEMI", "HT_TIP_C",
              "HT_Z0", "VT_Z0", "VT_S_LE0", "VT_C0", "VT_TIP_C", "VT_FIL", "MAIN_AXLE_DS", "DOORS",
              "DOOR_GAP", "EXITS", "WIN_S", "CARGO", "REG", "CK", "SPEC"):
        g[k] = T[k]
    g["MODEL_LABEL"], g["ENGINE_NAME"] = T["LABEL"], T["ENGINE"]
    g["R_W"] = T["FUS_W"] / 2
    g["H_T"] = g["H_B"] = T["FUS_H"] / 2
    g["HR"], g["WR"] = T["FUS_H"] / 5.97, T["FUS_W"] / 5.77
    g["_SNEW"] = [0.0, T["NL"], T["T0"], T["LENGTH"]]
    # --- fuselage: 787 tables mapped (nose / tail), 737 nose explicit --------------
    def table(kn, vals, scale, key):
        kn = np.asarray(kn, dtype=np.float64)
        vals = np.asarray(vals, dtype=np.float64) * scale
        if t == "b738":
            keep = kn > 11.0
            ns, nv = NOSE_B738[key]
            s = np.r_[ns, SMAP(kn[keep])]
            v = np.r_[nv, vals[keep]]
        else:
            s, v = SMAP(kn), vals
        s[-1] = T["LENGTH"]
        return PchipInterpolator(s, v)
    g["_top"] = table(_top.x, _top(_top.x), HR, "top")
    g["_bot"] = table(_bot.x, _bot(_bot.x), HR, "bot")
    g["_hw"] = table(_hw.x, _hw(_hw.x), WR, "hw")
    g["_zw"] = table(_zw.x, _zw(_zw.x), HR, "zw")
    # --- wing -----------------------------------------------------------------
    g["LE_SWEEP"] = T["LE"] * D2R
    g["TE_IN_SWEEP"] = T["TE_IN"] * D2R
    g["TE_OUT_SWEEP"] = T["TE_OUT"] * D2R
    g["Y_RAKE"] = T["Y_TIP"]
    g["FILLET_W"] = 1.2 * T["Y_TIP"] / 30.06
    g["TC_Y"] = (0.1 * T["Y_TIP"], 0.665 * T["Y_TIP"])
    g["S_MAIN"] = T["S_NOSE"] + T["WHEELBASE"]
    g["S_NOSE"] = T["S_NOSE"]
    g["Y_MAIN"] = T["TRACK"] / 2
    g["WING_S_LE0"] = 0.0
    area, mac, ymac, lemac = wing_area_mac()
    g["S_CG"] = g["S_MAIN"] - 1.6
    g["WING_S_LE0"] = g["S_CG"] - (lemac + 0.25 * mac)
    # wing-to-body fairing follows the wing root
    le_r, te_r = float(wing_le(2.9 * WR)), float(wing_te(2.9 * WR))
    k = lambda s: le_r + (s - 24.21) * (te_r - le_r) / (35.26 - 24.21)  # noqa: E731
    g["BUMP"] = tuple(k(s) for s in BUMP)
    g["BUMP_W"], g["BUMP_D"] = 0.105, 0.30 * HR
    # control surfaces: spanwise positions mapped from the 787 layout
    for name in ("FLAP_IN", "FLAPERON", "FLAP_OUT", "AILERON", "SLAT"):
        d = dict(g[name])
        d["y0"], d["y1"] = float(WY(d["y0"])), float(WY(d["y1"]))
        g[name] = d
    g["SPOILERS"] = [(float(WY(a)), float(WY(b))) for a, b in SPOILERS]
    g["SLAT_SPLITS"] = [float(WY(v)) for v in SLAT_SPLITS]
    # --- engines ----------------------------------------------------------------
    g["FAN_R"] = 1.41 * T["ENG_KR"]
    g["CHEVRONS"] = 0
    g["ENG_S_HL"] = float(wing_le(T["ENG_Y"])) - T["ENG_FWD"]
    # --- empennage ---------------------------------------------------------------
    g["HT_LE_SWEEP"] = T["HT_LE"] * D2R
    g["HT_PIVOT_S"] = T["HT_S_LE0"] + 0.85 * T["HT_C0"]
    ks = T["HT_SEMI"] / 9.72
    g["ELEV"] = dict(y0=1.55 * WR, y1=9.35 * ks, x0=0.715)
    g["VT_ZTIP"] = T["HEIGHT"] + T["GROUND_Z"]
    g["VT_LE_SWEEP"] = T["VT_LE"] * D2R
    fr = lambda z: T["VT_Z0"] + (z - 2.0) / 9.77 * (g["VT_ZTIP"] - T["VT_Z0"])  # noqa
    g["RUDDER"] = dict(z0=fr(3.05), z1=fr(11.30), x0=0.695)
    # --- gear ----------------------------------------------------------------------
    g["NOSE_TIRE_D"], g["NOSE_TIRE_W"], g["NOSE_WHEEL_DY"] = T["NOSE_TIRE"]
    g["MAIN_TIRE_D"], g["MAIN_TIRE_W"], g["MAIN_WHEEL_DY"] = T["MAIN_TIRE"]
    ds = T["MAIN_AXLE_DS"]
    g["MAIN_AXLES"] = (-ds, ds) if ds > 0 else (0.0,)
    # --- openings --------------------------------------------------------------------
    g["DOOR_W"], g["DOOR_Z0"], g["DOOR_Z1"] = T["DOOR"]
    g["WIN_Z"], g["WIN_W"], g["WIN_H"], g["WIN_PITCH"] = T["WIN"]
    g["EYE"] = tuple(float(v) for v in ck(EYE))


if TYPE != "b789":
    apply_type(TYPE)


# ---------------------------------------------------------------------------
# Blended winglet (737): a lifting surface swept up from the wing tip
# ---------------------------------------------------------------------------
def winglet_frame(u):
    """Path of the winglet quarter... u 0..1 along the span of the winglet.

    Returns (y, z offset from the tip chord plane, local dihedral angle, arc length fraction)."""
    W = WINGLET
    r, th, h = W["r"], W["theta"] * D2R, W["h"]
    L_arc = r * th
    L_str = max(h - r * (1 - math.cos(th)), 0.0) / math.sin(th)
    Ltot = L_arc + L_str
    d = np.asarray(u, dtype=np.float64) * Ltot
    a = np.minimum(d, L_arc) / r
    y = r * np.sin(a) + np.maximum(d - L_arc, 0) * math.cos(th)
    z = r * (1 - np.cos(a)) + np.maximum(d - L_arc, 0) * math.sin(th)
    return y, z, a, d, Ltot


def winglet_point(u, x, upper, side=1):
    W = WINGLET
    y0 = Y_TIP
    c0 = float(wing_chord(y0))
    le0 = float(wing_le(y0))
    yy, zz, a, d, Ltot = winglet_frame(u)
    t = np.clip(d / Ltot, 0.0, 1.0)
    c = c0 + (W["c_tip"] - c0) * t ** 0.8
    le = le0 + d * math.tan(W["sweep"] * D2R) * t ** 0.35 + (c0 - c) * 0.15
    zu, zl = airfoil(x, 0.092 - 0.012 * t)
    zc = np.where(upper, zu, zl) * c
    tw = float(wing_twist(y0))
    s = le + x * c + zc * math.sin(tw)
    # thickness acts along the local normal of the (y, z) path: (-sin a, cos a)
    ydir = -np.sin(a + DIHEDRAL)
    zdir = np.cos(a + DIHEDRAL)
    base_z = float(wing_z(y0))
    # the path is laid out in the dihedral plane of the tip
    py = y0 + yy * math.cos(DIHEDRAL) - zz * math.sin(DIHEDRAL)
    pz = base_z + yy * math.sin(DIHEDRAL) + zz * math.cos(DIHEDRAL) - x * c * math.sin(tw) * 0
    Y = py + zc * ydir
    Z = pz + zc * zdir
    return np.stack([s, side * Y + 0 * s, Z + 0 * s], axis=-1)


def span_total():
    if WINGLET is None:
        return 2 * Y_TIP
    y, z, a, d, L = winglet_frame(1.0)
    return 2 * float(Y_TIP + y * math.cos(DIHEDRAL) - z * math.sin(DIHEDRAL))


def to_blender(p):
    """Design (s, y, z) -> Blender (X fwd, Y left, Z up) with CG at origin."""
    p = np.asarray(p, dtype=np.float64)
    out = p.copy()
    out[..., 0] = S_CG - p[..., 0]
    return out


def vec_to_blender(n):
    n = np.asarray(n, dtype=np.float64).copy()
    n[..., 0] = -n[..., 0]
    return n


class ScaledTB:
    """Design -> Blender transform that scales geometry modelled at 787 size about a centre.

    k = (axial, lateral, vertical) scale; flat > 0 flattens the lower outer cowl (radius > 1.47,
    787 units) like the CFM56-7 nacelle on the 737."""

    def __init__(self, center, k, flat=0.0):
        self.c = np.asarray(center, dtype=np.float64)
        self.k = np.asarray(k, dtype=np.float64)
        self.flat = flat

    def __call__(self, p):
        d = np.asarray(p, dtype=np.float64) - self.c
        if self.flat:
            d = d.copy()
            r = np.hypot(d[..., 1], d[..., 2])
            f = np.clip((-d[..., 2] / np.maximum(r, 1e-9) - 0.3) / 0.7, 0, 1) ** 2
            g = np.clip((r - 1.47) / 0.2, 0, 1)
            d[..., 2] *= 1 - self.flat * f * g
        return to_blender(self.c + d * self.k)

    def normal(self, N):
        return vec_to_blender(np.asarray(N) / self.k)


class CockpitTB:
    """787 flight-deck layout coordinates -> this type's flight deck (Blender frame)."""

    def __call__(self, p):
        return to_blender(ck(p))

    def normal(self, N):
        ks, ds, ky, kz, dz = CK
        return vec_to_blender(np.asarray(N) / np.array([ks, ky, kz]))


def ck_inv(p):
    ks, ds, ky, kz, dz = CK
    p = np.asarray(p, dtype=np.float64)
    out = p.copy()
    out[..., 0] = (p[..., 0] - ds) / ks
    out[..., 1] = p[..., 1] / ky
    out[..., 2] = (p[..., 2] - dz) / kz
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
    print("nose gear s", S_NOSE, "main", S_MAIN, "CG", S_CG, "wing LE0", WING_S_LE0)
    print("span (incl. winglets)", span_total(), "engine HL", ENG_S_HL, "fan R", FAN_R)
    print("eye", EYE)
