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
    # centre-line setback of the face from the car end vs height: an almost
    # vertical face; the lower lamp panel band is the most forward part
    profile=[(1.00, 0.030), (1.20, 0.000), (1.70, 0.000), (2.10, 0.010), (3.30, 0.045), (3.62, 0.060)],
    plan_d=0.10, plan_e=2.2, plan_w=1.45,       # face curves back 10 cm towards the corners
    corner_r=0.24,                              # rounded silver frame where the face meets side/roof
    levels=[1.10, 1.24, 1.30, 1.40, 1.52, 1.60, 1.70, 1.80, 1.90, 2.00, 2.10, 2.30, 2.50, 2.70, 2.90],
    cols=28,
    # cab side: crew door with a tall window, narrow cab window behind the face corner
    cab_side=dict(crew=(8.20, 8.80, 1.14, 2.90), door_windows=[(8.50, 2.36, 0.36, 0.74, 0.04)], windows=[(9.06, 2.40, 0.36, 0.80, 0.05)]),
)


def paint_e231(P: Painter, S):
    """measured from a straight-on photo of a 1000番台 (scale ≈ 3.5 mm/px)"""
    P.col[:] = 0
    # silver painted FRP surround
    P.fill(P.sd_band(-9, 9), SILVER, 0.30, 0.70)
    # black panel: windscreen glass on top, black FRP band (wiper rest) below
    panel = P.sd_rrect(-1.38, 1.38, 1.88, 3.45, 0.20)
    P.fill(panel, BLACK_FRP, 0.12, 0.05)
    glass = P.sd_rrect(-1.33, 1.33, 2.13, 3.41, 0.17)
    P.fill(glass, BLACK_GLASS, 0.03, 0.0)
    P.fill(P.sd_rrect(-1.30, 1.30, 3.38, 3.41, 0.01), "#1b2a3a", 0.1, 0.0)        # blue sun strip at the top
    P.fill(P.sd_seg((-1.25, 1.99), (1.25, 1.99), 0.010), "#2b2d2f", 0.4, 0.2)       # wiper rest seam
    P.outline(panel, 0.010, "#060606", 0.5, 0.0)
    # bands: orange over green, white below
    P.fill(P.sd_band(1.65, 1.79), ORANGE, 0.40, 0.0)
    P.fill(P.sd_band(1.47, 1.65), GREEN, 0.40, 0.0)
    P.fill(P.sd_band(1.43, 1.47), WHITE_FRP, 0.35, 0.1)
    # black lamp panel across the face
    lp = P.sd_rrect(-1.35, 1.35, 1.155, 1.43, 0.08)
    P.fill(lp, BLACK_FRP, 0.2, 0.05)
    for s in (-1, 1):
        P.outline(P.sd_rrect(*sorted((s * 0.67, s * 1.21)), 1.17, 1.42, 0.03), 0.008, "#3a3c3e", 0.4, 0.4)
    # lower edge: silver, panel seam and a darker recessed lip
    P.fill(P.sd_band(0.80, 1.02), "#9fa2a5", 0.4, 0.6)
    P.outline(P.sd_band(1.035, 9), 0.006, "#4a4d50", 0.6, 0.3)
    P.grime(1.10, 0.25)


def features_e231(det, S, M, fp, fr, extra, add_logo):
    """3D parts on the E231-1000 face. fp(y, z, eps) -> point on the face."""
    for s in (-1, 1):
        y0, y1 = sorted((s * 0.67, s * 1.21))
        # combined unit: tail light lens on the inner side, headlight outer
        ti0, ti1 = sorted((s * 0.86, s * 1.06))
        fr(det, M["tail"], ti0, ti1, 1.22, 1.37, eps=0.004, r=0.01)
        ho0, ho1 = sorted((s * 0.70, s * 0.84))
        fr(det, M["head"], ho0, ho1, 1.22, 1.37, eps=0.004, r=0.01)
        hc0, hc1 = sorted((s * 1.08, s * 1.18))
        fr(det, M["head"], hc0, hc1, 1.22, 1.37, eps=0.004, r=0.01)
        # HID headlights behind the top of the windscreen
        det.cyl(fp(s * 0.95, 3.31, 0.004), (1, 0, 0), 0.045, 0.004, M["head"], seg=16)
    # destination LED, train number and operation number displays
    fr(det, M["dest"], -0.43, 0.40, 3.23, 3.42, eps=0.003)
    fr(det, M["lcd"], -1.15, -0.95, 2.99, 3.12, eps=0.003)
    fr(det, M["dest"], -1.23, -0.77, 2.18, 2.31, eps=0.003)
    # lower front apron below the body sill
    det.box((fp(0, 0.99)[0] - 0.06, 0, 0.99), (0.10, 2.70, 0.10), M["silver"])
    add_logo("JR", 1.16, 1.56, 0.13)
    # wipers: pivots at the bottom right of each pane, arms rising to the left
    return [(0.26, 2.08, -0.67, 2.28), (1.05, 2.08, 0.04, 2.28)]

# ---------------------------------------------------------------------------
# E233-3000 (measured from a near-frontal photo, ≈ 3.3 mm/px)
# ---------------------------------------------------------------------------
E233_FACE = dict(
    # protruding stainless bumper below 1.39 m; above it the face leans back to the roof
    profile=[(1.00, 0.000), (1.30, 0.000), (1.37, 0.030), (1.42, 0.170), (1.80, 0.210),
             (2.10, 0.250), (2.60, 0.310), (3.10, 0.370), (3.45, 0.420), (3.62, 0.470)],
    plan_d=0.26, plan_e=2.6, plan_w=1.45,       # flat centre, strongly rounded corners (the white pillars)
    corner_r=0.20,
    levels=[1.10, 1.20, 1.30, 1.36, 1.39, 1.42, 1.50, 1.60, 1.66, 1.72, 1.80, 1.90, 2.03, 2.20, 2.40, 2.60, 2.80, 3.00],
    cols=30,
    cab_side=dict(crew=(7.85, 8.45, 1.14, 2.90), door_windows=[(8.15, 2.36, 0.36, 0.74, 0.04)], windows=[(8.62, 2.42, 0.24, 0.78, 0.05)]),
)


def paint_e233(P: Painter, S):
    P.col[:] = 0
    P.fill(P.sd_band(-9, 9), "#e8eaeb", 0.32, 0.15)                 # white pillars / surround
    # black area: wide at the top, narrowing down to the bands between the pillars
    black = [(-1.31, 3.47), (1.31, 3.47), (1.14, 1.80), (-1.14, 1.80)]
    sd = P.sd_poly(black)
    sd = np.maximum(sd, P.sd_rrect(-1.40, 1.40, 1.70, 3.47, 0.26))  # round the top corners
    P.fill(sd, BLACK_FRP, 0.10, 0.05)
    glass = np.maximum(P.sd_poly([(-1.27, 3.43), (1.27, 3.43), (1.17, 2.03), (-1.17, 2.03)]), P.sd_rrect(-1.40, 1.40, 2.03, 3.43, 0.22))
    P.fill(glass, BLACK_GLASS, 0.03, 0.0)
    P.fill(P.sd_seg((-1.14, 2.03), (1.14, 2.03), 0.008), "#2a2c2e", 0.4, 0.2)
    # bands between the pillars
    P.fill(np.maximum(P.sd_band(1.66, 1.80), P.sd_poly([(-1.16, 1.3), (1.16, 1.3), (1.13, 1.9), (-1.13, 1.9)])), ORANGE, 0.40, 0.0)
    P.fill(np.maximum(P.sd_band(1.39, 1.66), P.sd_poly([(-1.19, 1.3), (1.19, 1.3), (1.15, 1.9), (-1.15, 1.9)])), GREEN, 0.40, 0.0)
    # protruding stainless bumper with a horizontal highlight crease, coupler recess
    P.fill(P.sd_band(0.80, 1.39), "#b9bcbf", 0.28, 0.85)
    P.fill(P.sd_band(1.17, 1.19), "#e2e5e7", 0.2, 0.85)
    P.fill(P.sd_rrect(-0.34, 0.34, 0.80, 1.06, 0.05), "#1a1b1c", 0.6, 0.2)
    P.outline(P.sd_band(1.39, 9), 0.006, "#5d6063", 0.5, 0.3)
    P.grime(1.10, 0.22)


def features_e233(det, S, M, fp, fr, extra, add_logo):
    for s in (-1, 1):
        det.cyl(fp(s * 0.93, 3.37, 0.004), (1, 0, 0), 0.05, 0.004, M["head"], seg=16)
        fr(det, M["tail"], *sorted((s * 0.72, s * 0.80)), 3.33, 3.41, eps=0.004, r=0.01)
    fr(det, M["dest"], -0.44, 0.50, 3.23, 3.46, eps=0.003)
    fr(det, M["lcd"], -1.07, -0.83, 2.41, 2.51, eps=0.003)
    fr(det, M["dest"], -1.05, -0.62, 2.18, 2.29, eps=0.003)
    add_logo("JR", 1.12, 1.845, 0.10)
    add_logo("EAST JAPAN RAILWAY COMPANY", 0.59, 1.84, 0.035)
    # bumper below the body sill
    det.box((fp(0, 0.96)[0] - 0.07, 0, 0.96), (0.14, 2.70, 0.14), M["silver"])
    return [(0.28, 2.06, -0.66, 2.33), (0.92, 2.06, -0.06, 2.33)]


FACES = {
    "e231": (E231_FACE, paint_e231, features_e231),
    "e233": (E233_FACE, paint_e233, features_e233),
}
