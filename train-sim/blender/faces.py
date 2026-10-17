"""
Cab face definitions per series: 3D shape of the nose (side profile, plan curve,
edge radius), the painted face layout, and the 3D parts mounted on it.

Coordinates: metres, front view. y = horizontal (+ = viewer's right when facing
the cab = the car's left side, Blender +Y), z = height above rail top.
Numbers come from the measured reference specs in REFERENCES.md.
"""

from frontpaint import Painter

# ---------------------------------------------------------------------------
# colours (sRGB)
# ---------------------------------------------------------------------------
ORANGE = "#f07a1e"
GREEN = "#1f8f4a"
BLACK_GLASS = "#0b0d0f"
BLACK_FRP = "#121416"
SILVER = "#b7babd"
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
    P.col[:] = 0
    # base: silver painted FRP surround / stainless corners
    P.fill(P.sd_band(-9, 9), SILVER, 0.32, 0.75)
    # black windscreen panel (glass + black FRP below the glass), rounded
    win = P.sd_rrect(-1.30, 1.30, 2.06, 3.47, 0.16)
    P.fill(win, BLACK_FRP, 0.15, 0.1)
    glass = P.sd_rrect(-1.24, 1.24, 2.24, 3.42, 0.12)
    P.fill(glass, BLACK_GLASS, 0.04, 0.0)
    P.outline(win, 0.012, "#050505", 0.5, 0.0)
    # lower edge of the black panel: wiper rest strip
    P.fill(P.sd_rrect(-1.22, 1.22, 2.11, 2.20, 0.03), "#191b1d", 0.4, 0.1)
    # bands: orange over green
    P.fill(P.sd_band(1.80, 1.92), ORANGE, 0.42, 0.0)
    P.fill(P.sd_band(1.56, 1.80), GREEN, 0.42, 0.0)
    # black lamp panel spanning the face
    lp = P.sd_rrect(-1.32, 1.32, 1.24, 1.52, 0.07)
    P.fill(lp, BLACK_FRP, 0.2, 0.1)
    # lower face and panel seams
    P.outline(P.sd_band(1.17, 9), 0.004, "#55585b", 0.6, 0.3)
    P.outline(P.sd_rrect(-1.40, 1.40, 1.02, 3.55, 0.25), 0.004, "#6b6e71", 0.6, 0.3)
    P.grime(1.25, 0.22)


def features_e231(det, S, M, fp, fr, extra, add_logo):
    """3D parts on the E231-1000 face. fp(y, z, eps) -> point on the face."""
    # head / tail light units at both ends of the black lamp panel
    for s in (-1, 1):
        y0, y1 = sorted((s * 0.84, s * 1.24))
        fr(det, M["dkgrey"], y0, y1, 1.29, 1.47, eps=0.004, r=0.03)
        fr(det, M["head"], y0 + 0.05, y1 - 0.05, 1.32, 1.44, eps=0.010, r=0.02)
        ty = s * 0.70
        fr(det, M["tail"], ty - 0.07, ty + 0.07, 1.32, 1.44, eps=0.008, r=0.02)
    # destination LED and train-number display behind the windscreen
    fr(det, M["dest"], -0.42, 0.42, 3.18, 3.36, eps=0.004)
    fr(det, M["dest"], -1.05, -0.78, 2.32, 2.42, eps=0.004)
    add_logo("JR", 0.95, 1.67, 0.15)
    return [(-0.70, 2.16, 0.05, 2.36), (0.10, 2.16, 0.85, 2.36)]   # wipers (y0, z0, y1, z1)


FACES = {
    "e231": (E231_FACE, paint_e231, features_e231),
}
