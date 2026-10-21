"""
Cab face definitions per series: 3D shape of the nose (side profile, plan curve,
edge radius), the painted face layout, and the 3D parts mounted on it.

Coordinates: metres, front view. y = horizontal (+ = viewer's right when facing
the cab = the car's left side, Blender +Y), z = height above rail top.
Numbers come from the measured reference specs in REFERENCES.md.
"""

import numpy as np
from frontpaint import Painter

# ---------------------------------------------------------------------------
# colours (sRGB)
# ---------------------------------------------------------------------------
ORANGE = "#f39a28"
GREEN = "#2fa860"
BLACK_GLASS = "#0b0d0f"
BLACK_FRP = "#121416"
SILVER = "#c6c9cc"
STAINLESS = "#c4c7c9"
WHITE_FRP = "#e6e7e5"
GREY_DARK = "#2a2c2e"


def mirror(y0, y1):
    return [(y0, y1), (-y1, -y0)]


# ---------------------------------------------------------------------------
# E231-1000
# ---------------------------------------------------------------------------
E231_FACE = dict(
    # ref2/e231/SPEC.md: flat upright "box" cab, vertical to z 3.476 then rounding into the
    # roof (r ≈ 200); flat in plan with small vertical corners (r ≈ 120)
    profile=[(0.90, 0.000), (3.45, 0.000), (3.655, 0.050)],
    plan_d=0.0, plan_e=2.0, plan_w=1.45,
    corner_r=0.14,
    frp_wrap=0.40,                       # grey FRP mask runs ≈ 400 back along each side
    levels=[1.029, 1.148, 1.30, 1.426, 1.463, 1.655, 1.79, 1.879, 2.10, 2.40, 2.70, 3.00, 3.27, 3.40],
    cols=28,
    cab_side=dict(crew=(7.85, 8.335, 1.127, 3.006), door_windows=[(8.093, 2.60, 0.33, 0.66, 0.04)],
                  windows=[(8.946, 2.728, 0.725, 0.555, 0.06)]),
)


def _arch_panel():
    """black upper panel outline: straight bottom (r 200 corners), shallow arched top (r 100)"""
    import math
    pts = []
    def arc(cy, cz, r, a0, a1, n=8):
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            pts.append((cy + r * math.cos(a), cz + r * math.sin(a)))
    arc(1.341 - 0.20, 1.879 + 0.20, 0.20, -90, 0)            # bottom right
    arc(1.316 - 0.10, 3.475 - 0.10, 0.10, 0, 75)             # top right
    for k in range(1, 12):                                     # arch 3.480 @ ±1.14 → 3.548 centre
        y = 1.14 - 2.28 * k / 12
        pts.append((y, 3.548 - 0.068 * (y / 1.14) ** 2))
    arc(-1.316 + 0.10, 3.475 - 0.10, 0.10, 105, 180)         # top left
    arc(-1.341 + 0.20, 1.879 + 0.20, 0.20, 180, 270)         # bottom left
    return pts


def paint_e231(P: Painter, S):
    """ref2/e231/SPEC.md (two near head-on telephoto photos, ±40 mm)"""
    P.col[:] = 0
    P.fill(P.sd_band(-9, 9), "#d9d9db", 0.38, 0.0)            # light-grey FRP mask
    panel = P.sd_poly(_arch_panel())
    P.fill(panel, BLACK_FRP, 0.08, 0.05)                      # one glossy-black element
    glass = np.maximum(panel + 0.03, P.sd_band(2.10, 9))
    P.fill(glass, BLACK_GLASS, 0.03, 0.0)
    P.fill(P.sd_seg((-1.25, 2.06), (1.25, 2.06), 0.008), "#24272a", 0.4, 0.2)
    P.outline(panel, 0.008, "#050505", 0.5, 0.0)
    # bands: orange on top, green below, full face width
    P.fill(P.sd_band(1.660, 1.790), "#f68a1e", 0.40, 0.0)
    P.fill(P.sd_band(1.463, 1.655), "#1faf55", 0.40, 0.0)
    # black lamp strip, ends leaning in
    lamp = P.sd_poly([(-1.275, 1.148), (1.275, 1.148), (1.314, 1.426), (-1.314, 1.426)])
    P.fill(np.maximum(lamp, P.sd_rrect(-1.40, 1.40, 1.148, 1.426, 0.06)), BLACK_FRP, 0.2, 0.05)
    for s in (-1, 1):
        P.outline(P.sd_rrect(*sorted((s * 0.617, s * 1.238)), 1.155, 1.415, 0.03), 0.008, "#3a3c3e", 0.4, 0.4)
    P.outline(P.sd_band(1.029, 9), 0.005, "#7a7c7e", 0.6, 0.0)
    P.grime(1.10, 0.22)


def features_e231(det, S, M, fp, fr, extra, add_logo):
    for s in (-1, 1):
        # lower lamp unit: the inboard half is an unlit clear lens, only the outboard red
        # tail light lights up (the E231's headlights are the two round lamps up top)
        hi0, hi1 = sorted((s * 0.64, s * 0.93))
        fr(det, M["lens"], hi0, hi1, 1.19, 1.38, eps=0.004, r=0.015)
        ti0, ti1 = sorted((s * 0.95, s * 1.215))
        fr(det, M["tail"], ti0, ti1, 1.19, 1.38, eps=0.004, r=0.015)
        # headlights: round lamps either side of the destination display, in a dark bezel
        det.cyl(fp(s * 0.92, 3.35, 0.003), (1, 0, 0), 0.085, 0.003, M["black"], seg=24)
        det.cyl(fp(s * 0.92, 3.35, 0.007), (1, 0, 0), 0.068, 0.004, M["head"], seg=24)
        # light-grey lower plates either side of the coupler gap
        y0, y1 = sorted((s * 0.333, s * 1.30))
        det.box((fp(0, 0.96)[0] - 0.05, (y0 + y1) / 2, 0.9625), (0.10, y1 - y0, 0.105), M["light_grey"])
    fr(det, M["dest"], -0.388, 0.388, 3.274, 3.457, eps=0.003)
    fr(det, M["lcd"], -1.15, -0.95, 3.00, 3.12, eps=0.003)
    fr(det, M["dest"], -1.23, -0.77, 2.16, 2.29, eps=0.003)
    add_logo("JR", 1.10, 1.56, 0.115)
    # wipers: pivots (y +0.327, z 2.05) and (y +1.049, z 2.045), ≈1.0 m long, parked to the left ~15° up
    return [(0.327, 2.05, 0.327 - 0.966, 2.05 + 0.259), (1.049, 2.045, 1.049 - 0.966, 2.045 + 0.259)]


# ---------------------------------------------------------------------------
# E233-3000 (ref2/e233/SPEC.md: head-on telephoto, 3.46 mm/px, ±15 mm)
# ---------------------------------------------------------------------------
E233_FACE = dict(
    # upright face, no nose: silver lower section with a crease (1,100-1,165) barely proud,
    # vertical 1.5-2.1 m, windscreen leaning back ≈200 mm to its top at 3,140, then the
    # dark-grey visor overhanging the glass by ≈90 mm
    profile=[(0.93, 0.060), (1.06, 0.020), (1.10, 0.000), (1.165, 0.000), (1.25, 0.020), (1.41, 0.025),
             (1.50, 0.020), (2.10, 0.020), (3.14, 0.220), (3.16, 0.130), (3.48, 0.130), (3.62, 0.260)],
    plan_d=0.03, plan_e=2.0, plan_w=1.45,
    corner_r=0.18,
    frp_wrap=0.495, frp_mat="white",      # the white corner runs ≈495 mm back along the side
    levels=[1.06, 1.10, 1.165, 1.25, 1.41, 1.50, 1.644, 1.772, 1.90, 2.026, 2.10, 2.40, 2.70, 3.00, 3.14, 3.16],
    cols=30,
    cab_side=dict(crew=(7.71, 8.347, 1.13, 2.945), door_windows=[(8.035, 2.443, 0.37, 0.75, 0.05)],
                  windows=[(8.857, 2.698, 0.715, 0.545, 0.08)]),
)

_E233_INNER = [(-1.123, 1.41), (1.123, 1.41), (1.200, 2.026), (1.336, 3.294), (1.36, 3.70), (-1.36, 3.70), (-1.336, 3.294), (-1.200, 2.026)]


def paint_e233(P: Painter, S):
    P.col[:] = 0
    P.fill(P.sd_band(-9, 9), "#e8e8e6", 0.32, 0.05)                      # white pillars
    inner = P.sd_poly(_E233_INNER)
    P.fill(inner, BLACK_FRP, 0.10, 0.05)                                   # black panel between the pillars
    P.fill(np.maximum(inner, P.sd_band(2.10, 3.14)), BLACK_GLASS, 0.03, 0.0)
    arch = (3.48 - 0.139 * P.Y ** 2) - P.Z                                  # visor's arched lower edge
    P.fill(np.maximum(inner, arch), "#4f5359", 0.35, 0.3)
    P.fill(np.maximum(inner, P.sd_band(1.644, 1.772)), "#e8822a", 0.40, 0.0)
    P.fill(np.maximum(inner, P.sd_band(1.41, 1.644)), "#1f8a4c", 0.40, 0.0)
    P.fill(P.sd_band(0.80, 1.41), "#c4c4c2", 0.28, 0.85)                   # silver lower section
    P.fill(P.sd_band(1.10, 1.165), "#e4e5e6", 0.18, 0.9)                   # bright crease
    P.fill(P.sd_rrect(-0.37, 0.37, 0.80, 1.06, 0.04), "#1a1b1c", 0.6, 0.2) # coupler notch
    P.fill(P.sd_rrect(-0.79, 0.79, 3.148, 3.387, 0.03), "#2a2e33", 0.3, 0.2)   # destination housing
    P.outline(inner, 0.006, "#a9abad", 0.4, 0.3)
    P.grime(1.05, 0.22)


def features_e233(det, S, M, fp, fr, extra, add_logo):
    for s in (-1, 1):
        det.cyl(fp(s * 0.94, 3.294, 0.004), (1, 0, 0), 0.055, 0.004, M["head"], seg=16)
        fr(det, M["tail"], *sorted((s * 0.66, s * 0.78)), 3.198, 3.338, eps=0.004, r=0.01)
    fr(det, M["dest"], -0.58, 0.58, 3.18, 3.36, eps=0.004)
    fr(det, M["lcd"], -1.07, -0.83, 2.41, 2.51, eps=0.003)
    fr(det, M["dest"], -1.05, -0.62, 2.18, 2.29, eps=0.003)
    add_logo("JR", 1.062, 1.85, 0.10)
    add_logo("EAST JAPAN RAILWAY COMPANY", 0.536, 1.85, 0.042)
    det.box((fp(0, 0.95)[0] - 0.07, 0, 0.95), (0.14, 2.70, 0.06), M["silver"])
    return [(0.19, 2.065, -0.58, 2.275), (0.78, 2.065, 0.01, 2.275), (0.90, 2.065, 0.52, 2.17)]


# ---------------------------------------------------------------------------
# 211-3000 (ref2/s211/SPEC.md: square-on depot photo, 8.7 mm/px)
# ---------------------------------------------------------------------------
S211_FACE = dict(
    profile=[(0.98, 0.000), (3.40, 0.000), (3.652, 0.040)],   # flat, upright white FRP mask
    plan_d=0.02, plan_e=2.0, plan_w=1.45,
    corner_r=0.10,
    levels=[1.144, 1.232, 1.261, 1.405, 1.559, 1.575, 1.716, 1.857, 1.863, 2.011, 2.251, 2.468, 2.70, 3.010, 3.076, 3.20],
    cols=30,
    cab_side=dict(crew=(8.764, 9.364, 1.15, 2.98), door_windows=[(9.064, 2.55, 0.36, 0.72, 0.03)], windows=[]),
)


def _211_window(s):
    """one black front opening: y ±487…±1,379, z 2,011 → top edge sloping with the roof (3,542 → 3,423), r 150 outer corner"""
    import math
    pts = [(0.487, 2.011), (1.379, 2.011), (1.379, 3.273)]
    for k in range(1, 7):
        a = math.radians(90 * k / 6)
        pts.append((1.229 + 0.15 * math.cos(a), 3.273 + 0.15 * math.sin(a)))
    pts.append((0.487, 3.542))
    return [(s * y, z) for (y, z) in pts]


def paint_211(P: Painter, S):
    P.col[:] = 0
    P.fill(P.sd_band(-9, 9), "#e0dfda", 0.40, 0.0)                         # white FRP mask
    P.fill(P.sd_rrect(-0.465, 0.465, 0.5, 4.0, 0.0), "#a8aaac", 0.30, 0.85)  # stainless gangway panel
    for s in (-1, 1):
        w = P.sd_poly(_211_window(s))
        P.fill(w, "#16191e", 0.35, 0.05)                                     # black-painted lower part
        P.fill(np.maximum(w + 0.02, P.sd_band(2.468, 9)), BLACK_GLASS, 0.03, 0.0)
        y0, y1 = sorted((s * 0.465, s * 1.60))
        P.fill(P.sd_rrect(y0, y1, 1.559, 1.863, 0.0), "#e07a2c", 0.4, 0.0)
        P.fill(P.sd_rrect(y0, y1, 1.405, 1.559, 0.0), "#1e6a4e", 0.4, 0.0)
        h0, h1 = sorted((s * 0.722, s * 1.318))
        P.fill(P.sd_rrect(h0, h1, 1.575, 1.857, 0.03), "#b8babc", 0.35, 0.5)  # light-grey lamp bezel
    P.fill(P.sd_rrect(-0.313, 0.313, 3.252, 3.533, 0.03), BLACK_GLASS, 0.05, 0.0)    # destination window
    P.outline(P.sd_rrect(-0.352, 0.352, 1.261, 3.076, 0.04), 0.010, "#3c3f42", 0.5, 0.3)
    P.fill(P.sd_rrect(-0.30, 0.30, 2.251, 3.010, 0.05), "#151617", 0.5, 0.0)
    P.fill(P.sd_rrect(-0.28, 0.28, 2.271, 2.990, 0.04), BLACK_GLASS, 0.03, 0.0)
    P.outline(P.sd_band(0.99, 9), 0.005, "#6a6d70", 0.5, 0.2)
    P.grime(1.20, 0.22)


def features_211(det, S, M, fp, fr, extra, add_logo):
    for s in (-1, 1):
        det.cyl(fp(s * 0.909, 1.716, 0.010), (1, 0, 0), 0.0825, 0.02, M["chrome"], seg=20)
        det.cyl(fp(s * 0.909, 1.716, 0.021), (1, 0, 0), 0.070, 0.004, M["head"], seg=20)
        det.cyl(fp(s * 1.161, 1.716, 0.010), (1, 0, 0), 0.065, 0.02, M["chrome"], seg=16)
        det.cyl(fp(s * 1.161, 1.716, 0.021), (1, 0, 0), 0.052, 0.004, M["tail"], seg=16)
        a, b = sorted((s * 0.55, s * 1.30))
        det.box(fp(s * 0.925, 1.188, 0.04), (0.08, 0.75, 0.088), M["light_grey"])            # foot-step ledge
        det.beam(fp(a, 2.24, 0.03), fp(b, 2.24, 0.03), 0.02, 0.02, M["chrome"])              # grab bar
    fr(det, M["dest"], -0.29, 0.29, 3.272, 3.513, eps=0.004)
    add_logo("JR", 0.92, 3.25, 0.20)
    for z in (2.18, 1.55):
        det.box(fp(0.0, z, 0.02), (0.03, 0.28, 0.02), M["chrome"])
    det.box((fp(0, 0.96)[0] - 0.05, 0, 0.96), (0.10, 2.80, 0.06), M["light_grey"])
    return [(-0.60, 2.55, -0.72, 2.95), (0.60, 2.55, 0.72, 2.95)]


# ---------------------------------------------------------------------------
# 115 (湘南色, 1000番台; proportions from frontal / 3/4 photos)
# ---------------------------------------------------------------------------
P_ORANGE = "#d9692e"   # 黄かん色 (measured, ref2/s115/SPEC.md)
P_GREEN = "#2e4636"    # 緑2号
S115_FACE = dict(
    # ref2/s115/SPEC.md: vertical face (no 80系 slant) to z≈3,250, おでこ rolls into the roof
    # with R≈300; nearly flat in plan, corners R≈300-400
    # the おでこ roll is carried by the profile and the plan corners by plan_d, so the edge
    # rounding can stay small (a large inset folds over the 115's tight roof shoulder)
    profile=[(0.99, 0.000), (3.20, 0.000), (3.32, 0.030), (3.42, 0.090), (3.50, 0.170), (3.58, 0.280)],
    plan_d=0.16, plan_e=4.0, plan_w=1.45,
    corner_r=0.12,
    roof_cap=1.20,                        # the green cab-roof cap runs ≈1.2 m back
    levels=[1.118, 1.249, 1.40, 1.56, 1.711, 1.90, 2.08, 2.30, 2.422, 2.448, 2.70, 3.017, 3.049, 3.085],
    cols=32,
    cab_side=dict(crew=(8.642, 9.143, 1.15, 2.98), door_windows=[(8.879, 2.64, 0.316, 0.58, 0.04)], windows=[]),
)


def paint_115(P: Painter, S):
    P.col[:] = 0
    P.fill(P.sd_band(-9, 9), P_ORANGE, 0.35, 0.0)
    P.fill(P.sd_band(3.142, 9), P_GREEN, 0.35, 0.0)                         # green おでこ
    for s in (-1, 1):                                                        # green lower blocks, rounded inner corners
        y0, y1 = sorted((s * 0.477, s * 3.0))
        P.fill(P.sd_rrect(y0, y1, -1.0, 1.711, 0.115), P_GREEN, 0.35, 0.0)
    P.fill(P.sd_band(-9, 1.118), P_GREEN, 0.35, 0.0)                         # strip under the orange U
    u = P.sd_rrect(-0.477, 0.477, 1.118, 3.30, 0.08)
    P.fill(np.maximum(u, P.sd_band(1.0, 3.142)), P_ORANGE, 0.35, 0.0)        # orange gangway U
    P.outline(P.sd_rrect(-0.418, 0.418, 1.249, 3.085, 0.05), 0.010, "#5a3518", 0.6, 0.0)   # door leaf seam
    # windows with black H-rubber (≈25 mm)
    wins = [(-1.230, -0.479, 2.448, 3.049, 0.06), (0.479, 1.230, 2.448, 3.049, 0.06),
            (-1.52, -1.245, 2.448, 3.049, 0.04), (1.245, 1.52, 2.448, 3.049, 0.04),
            (-0.371, 0.371, 2.422, 3.017, 0.07)]
    for (y0, y1, z0, z1, r) in wins:
        P.fill(P.sd_rrect(y0, y1, z0, z1, r), "#1c1d1e", 0.6, 0.0)
        P.fill(P.sd_rrect(y0 + 0.025, y1 - 0.025, z0 + 0.025, z1 - 0.025, max(0.01, r - 0.02)), BLACK_GLASS, 0.03, 0.0)
    for s in (-1, 1):
        P.fill(P.sd_rrect(*sorted((s * 1.215, s * 1.245)), 2.448, 3.049, 0.0), "#8a8d90", 0.3, 0.8)   # corner mullion
    P.outline(P.sd_band(1.711, 9), 0.003, "#2a2018", 0.5, 0.0)
    P.grime(1.30, 0.30)


def features_115(det, S, M, fp, fr, extra, add_logo):
    for s in (-1, 1):
        # sealed-beam headlight in a short protruding housing
        det.cyl(fp(s * 1.00, 2.08, 0.045), (1, 0, 0), 0.115, 0.09, M["paint_orange"], seg=24)
        det.cyl(fp(s * 1.00, 2.08, 0.092), (1, 0, 0), 0.110, 0.012, M["chrome"], seg=24)
        det.cyl(fp(s * 1.00, 2.08, 0.099), (1, 0, 0), 0.085, 0.004, M["head"], seg=24)
        # horn shutter cover + small box above
        det.cyl(fp(s * 0.633, 2.085, 0.040), (1, 0, 0), 0.0975, 0.08, M["paint_orange"], seg=20)
        det.box(fp(s * 0.633, 2.085, 0.082), (0.004, 0.13, 0.018), M["black"])
        det.box(fp(s * 0.633, 2.28, 0.03), (0.06, 0.09, 0.06), M["paint_orange"])
        # tail light in the green
        det.cyl(fp(s * 0.99, 1.56, 0.02), (1, 0, 0), 0.08, 0.04, M["chrome"], seg=18)
        det.cyl(fp(s * 0.99, 1.56, 0.041), (1, 0, 0), 0.055, 0.004, M["tail"], seg=18)
        # handrail under the windscreen, step bar in the green
        a, b = sorted((s * 0.549, s * 1.236))
        det.beam(fp(a, 2.35, 0.05), fp(b, 2.35, 0.05), 0.022, 0.022, M["paint_orange"])
        a, b = sorted((s * 0.55, s * 1.215))
        det.beam(fp(a, 1.258, 0.05), fp(b, 1.258, 0.05), 0.025, 0.025, M["paint_green"])
        det.box(fp(s * 0.633, 3.255, 0.02), (0.03, 0.025, 0.07), M["paint_green"])              # forehead lugs
    det.box(fp(-0.342, 2.212, 0.02), (0.03, 0.10, 0.02), M["chrome"])                          # door lever
    # raised 種別 box: green housing y ±0.42 from the band line to the roof, 「普通」 window
    x = fp(0, 3.30)[0]
    det.box((x - 0.10, 0, 3.32), (0.22, 0.84, 0.36), M["paint_green"])
    det.poly([(x + 0.012, -0.333, 3.186), (x + 0.012, 0.333, 3.186), (x + 0.012, 0.333, 3.415), (x + 0.012, -0.333, 3.415)], M["dest"], (1, 0, 0))
    # folded 渡り板 on the door bottom
    det.box(fp(0.0, 1.32, 0.03), (0.05, 0.62, 0.30), M["paint_orange"])
    det.box((fp(0, 0.94)[0] - 0.06, 0, 0.94), (0.12, 2.70, 0.10), M["dkgrey"])               # end beam / apron
    for k in range(3):
        det.box((fp(0, 0.80)[0] - 0.08, -0.70 - k * 0.17, 0.80), (0.12, 0.10, 0.18), M["dkgrey"])   # jumper receptacles
    # wipers: pivot (±0.925, 2.40), ≈0.55 long, parked up-inward ~60°
    return [(0.925, 2.40, 0.65, 2.876), (-0.925, 2.40, -0.65, 2.876)]

FACES = {
    "e231": (E231_FACE, paint_e231, features_e231),
    "e233": (E233_FACE, paint_e233, features_e233),
    "211": (S211_FACE, paint_211, features_211),
    "115": (S115_FACE, paint_115, features_115),
}
