"""
Blender model builder for the train simulator.

Run headless:
    blender -b -P train-sim/blender/build_models.py

Builds every vehicle (cars.py, modelled from reference photos), the cab interior
and the trackside props, saves an editable .blend file and exports one .glb per
vehicle series into train-sim/assets/models/.

Axes (Blender): X = forward (car front), Y = left, Z = up. Rail top is Z = 0.
The glTF exporter converts to Y-up, so in three.js: X forward, Y up, -Z left.
"""

import os
import sys
import math

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector, Matrix  # noqa: E402
from lib import materials, MB, OUT_DIR, HERE  # noqa: E402
import cars  # noqa: E402

def make_cab_interior(M, coll):
    """E231-1000 (late, 3-LCD desk) cab seen from the driver's seat - ref2/cab/SPEC.md.

    Spec frame: x forward from the inside face of the front wall (cab points have x < 0),
    y = left (+, driver's side), z above rail. E231 = E233 numbers + 0.035 in z.
    """
    from lib import mat, prism
    xF = 9.70                      # inside face of the front wall in car coordinates
    dz = 0.035                     # E231 floor heights vs the E233 numbers of the spec

    def P(x, y, z):
        return (xF + x, y, z + dz)

    def box(mb, x0, x1, y0, y1, z0, z1, m, R=None):
        mb.box(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), m, R)

    desk_top = mat("cab_desk_top", (0.485, 0.491, 0.456), 0.0, 0.55)        # #b9bab4
    panel = mat("cab_panel_face", (0.024, 0.026, 0.028), 0.1, 0.5)          # #2b2d2f
    hood = mat("cab_hood", (0.012, 0.013, 0.015), 0.1, 0.45)                # #1d1f21
    rim = mat("cab_rim", (0.008, 0.009, 0.010), 0.0, 0.7)                   # #16171a
    wall = mat("cab_wall3", (0.552, 0.565, 0.546), 0.0, 0.7)                # #c4c6c3
    ceil = mat("cab_ceiling", (0.686, 0.693, 0.665), 0.0, 0.7)              # #d8d9d5
    grille = mat("cab_grille", (0.333, 0.323, 0.287), 0.3, 0.6)             # #9c9a92
    floor = mat("cab_floor2", (0.070, 0.074, 0.078), 0.0, 0.9)              # #4b4d4f
    stain = mat("cab_stainless", (0.371, 0.381, 0.381), 0.9, 0.35)          # #a3a5a5
    moq = mat("cab_moquette", (0.050, 0.115, 0.392), 0.0, 0.9)             # #3f5fa8
    frame = mat("cab_frame", (0.010, 0.010, 0.010), 0.0, 0.5)
    blind = mat("cab_blind", (0.028, 0.032, 0.037), 0.0, 0.8, alpha=0.6)    # smoked fabric
    paper = mat("TIMETABLE", (0.85, 0.85, 0.80), 0.0, 0.7)
    red = mat("cab_red", (0.6, 0.02, 0.02), 0.0, 0.4)
    green = mat("cab_green", (0.02, 0.4, 0.08), 0.0, 0.4)
    lcd_meter = mat("LCD_METER", (0.007, 0.010, 0.023), 0.0, 0.25, (0.02, 0.03, 0.06), 0.5)
    lcd_tims = mat("LCD_TIMS", (0.013, 0.050, 0.27), 0.0, 0.25, (0.02, 0.05, 0.25), 0.5)
    lcd_mon = mat("LCD_MON", (0.007, 0.010, 0.023), 0.0, 0.25, (0.02, 0.03, 0.06), 0.5)
    mb = MB("cab_interior")
    W = 1.40
    zp, zr, zc = 1.650, 1.130, 3.40            # platform, rear floor (crew-door sill), ceiling (E233 frame)
    xr = -2.30                                  # partition (cab depth 2.30, E231)
    # floors: driver platform, two steps, rear area
    mb.poly([P(0, -W, zp), P(0, W, zp), P(-1.45, W, zp), P(-1.45, -W, zp)], floor, (0, 0, 1))
    for k, (xa, xb, z) in enumerate(((-1.45, -1.575, zp - 0.26), (-1.575, -1.70, zr + 0.0))):
        mb.poly([P(xa, -W, z), P(xa, W, z), P(xb, W, z), P(xb, -W, z)], floor, (0, 0, 1))
    mb.poly([P(-1.45, -W, zp), P(-1.45, W, zp), P(-1.45, W, zp - 0.26), P(-1.45, -W, zp - 0.26)], floor, (-1, 0, 0))
    mb.poly([P(-1.575, -W, zp - 0.26), P(-1.575, W, zp - 0.26), P(-1.575, W, zr), P(-1.575, -W, zr)], floor, (-1, 0, 0))
    mb.poly([P(-1.70, -W, zr), P(-1.70, W, zr), P(xr, W, zr), P(xr, -W, zr)], floor, (0, 0, 1))
    # ceiling with AC grille and lamp strips
    mb.poly([P(0, -1.33, zc), P(0, 1.33, zc), P(xr, 1.33, zc), P(xr, -1.33, zc)], ceil, (0, 0, -1))
    box(mb, -0.5, -2.1, -0.15, 0.15, zc - 0.012, zc, grille)
    for s in (-1, 1):
        box(mb, -0.6, -2.0, s * 0.55, s * 0.65, zc - 0.015, zc, M["lamp"])
    # side walls (tumble home 1.40 → 1.33) with the cab side window and the crew door
    for s in (-1, 1):
        def wq(xa, xb, za, zb):
            ya, yb = s * (W - 0.07 * (za - 2.0) / 1.4), s * (W - 0.07 * (zb - 2.0) / 1.4)
            mb.poly([P(xa, ya, za), P(xb, ya, za), P(xb, yb, zb), P(xa, yb, zb)], wall, (0, -s, 0))
        win = (-0.39, -1.12, 2.415, 2.975)          # cab side window (E231, into the E233 frame)
        door = (-1.25, -1.95)
        wq(0.0, xr, zr, 2.415) if False else None
        wq(0.0, win[1], zp, win[2]); wq(0.0, win[0], win[2], win[3]); wq(win[1], door[0], win[2], win[3])
        wq(0.0, door[0], win[3], zc); wq(win[1], door[0], zp, win[2])
        wq(door[1], xr, zr, zc)
        # crew door leaf with its window, frames
        y = s * (W - 0.01)
        mb.poly([P(door[0], y, zr), P(door[1], y, zr), P(door[1], y, 2.04), P(door[0], y, 2.04)], stain, (0, -s, 0))
        mb.poly([P(door[0], y, 2.82), P(door[1], y, 2.82), P(door[1], y, zc), P(door[0], y, zc)], stain, (0, -s, 0))
        mb.poly([P(door[0], y, 2.04), P(-1.37, y, 2.04), P(-1.37, y, 2.82), P(door[0], y, 2.82)], stain, (0, -s, 0))
        mb.poly([P(-1.83, y, 2.04), P(door[1], y, 2.04), P(door[1], y, 2.82), P(-1.83, y, 2.82)], stain, (0, -s, 0))
        for (xa, xb, za, zb) in (win, (-1.37, -1.83, 2.04, 2.82)):
            for (a, b) in (((xa, za), (xb, za)), ((xa, zb), (xb, zb)), ((xa, za), (xa, zb)), ((xb, za), (xb, zb))):
                mb.beam(P(a[0], s * (W - 0.03), a[1]), P(b[0], s * (W - 0.03), b[1]), 0.04, 0.03, frame)
        mb.beam(P(-0.75, s * (W - 0.03), win[2]), P(-0.75, s * (W - 0.03), win[3]), 0.03, 0.03, frame)  # pane divider
        # A-pillar trim: triangular in plan, glass edge (±1.30, x -0.02) → side window front (±1.40, x -0.39)
        a0, a1 = P(-0.02, s * 1.30, 2.00), P(-0.39, s * 1.40, 2.00)
        a2, a3 = P(-0.39, s * 1.40, 3.25), P(-0.02, s * 1.30, 3.25)
        mb.poly([a0, a1, a2, a3], wall, (1, -s * 0.6, 0))
    # front wall below the windscreen, header and blinds
    mb.poly([P(0.0, -W, zp), P(0.0, W, zp), P(0.0, W, 2.0), P(0.0, -W, 2.0)], panel, (-1, 0, 0))
    box(mb, -0.18, -0.45, -1.33, 1.33, 3.25, zc, wall)                              # header
    box(mb, -0.17, -0.18, 0.30, 0.80, 3.28, 3.34, rim)                              # car-number plate
    for (ya, yb, drop) in ((0.03, 1.25, 0.16), (-1.25, -0.03, 0.08)):
        mb.cyl(P(-0.20, (ya + yb) / 2, 3.24), (0, 1, 0), 0.03, yb - ya, wall, seg=10)
        mb.poly([P(-0.205, ya, 3.24), P(-0.205, yb, 3.24), P(-0.205, yb, 3.24 - drop), P(-0.205, ya, 3.24 - drop)], blind, (-1, 0, 0))
        box(mb, -0.20, -0.215, (ya + yb) / 2 - 0.04, (ya + yb) / 2 + 0.04, 3.24 - drop - 0.03, 3.24 - drop, rim)
    # ---- desk (driver side y +1.40 → -0.44)
    # hood top (black shelf) and tilted charcoal panel face
    box(mb, -0.30, -0.60, 0.06, W, 2.715, 2.745, hood)
    mb.poly([P(-0.56, 0.06, 2.70), P(-0.56, W, 2.70), P(-0.62, W, 2.45), P(-0.62, 0.06, 2.45)], panel, (-1, 0, 0.23))
    mb.poly([P(-0.30, 0.06, 2.73), P(-0.30, W, 2.73), P(-0.30, W, 2.45), P(-0.30, 0.06, 2.45)], panel, (-1, 0, 0))
    # desk top sloping 7° down to the driver, black padded rim, stainless knee panel
    mb.poly([P(-0.62, -0.44, 2.45), P(-0.62, W, 2.45), P(-0.93, W, 2.41), P(-0.93, -0.44, 2.41)], desk_top, (0, 0, 1))
    box(mb, -0.93, -1.00, 0.20, 1.30, 2.32, 2.42, rim)
    mb.poly([P(-0.88, -0.44, zp), P(-0.88, W, zp), P(-0.88, W, 2.32), P(-0.88, -0.44, 2.32)], stain, (-1, 0, 0))
    mb.poly([P(-0.93, -0.44, 2.41), P(-0.93, 0.20, 2.41), P(-0.93, 0.20, 2.32), P(-0.93, -0.44, 2.32)], desk_top, (-1, 0, 0))
    # right shelf (助士側) with handrail
    box(mb, 0.0, -0.80, -W, -0.44, 2.40, 2.45, desk_top)
    mb.poly([P(-0.80, -W, zp), P(-0.80, -0.44, zp), P(-0.80, -0.44, 2.40), P(-0.80, -W, 2.40)], wall, (-1, 0, 0))
    mb.beam(P(-0.78, -1.30, 2.50), P(-0.78, -0.50, 2.50), 0.025, 0.025, stain)
    # LCDs (4:3, tilted 13° back, centres z 2.59): No.1 meter, TIMS, right hooded monitor
    tilt = math.radians(13)
    n = Vector((-math.cos(tilt), 0, math.sin(tilt)))
    up = Vector((math.sin(tilt), 0, math.cos(tilt)))

    def screen(cx, cy, w, h, m, bw, bh, yaw=0.0):
        c = Vector(P(cx, cy, 2.59))
        Ry = Matrix.Rotation(yaw, 3, "Z")
        nn, uu = Ry @ n, Ry @ up
        r = uu.cross(nn).normalized()           # viewer's right
        def q(du, dv, e):
            return c + r * du + uu * dv + nn * e
        mb.poly([q(-bw / 2, -bh / 2, 0.004), q(bw / 2, -bh / 2, 0.004), q(bw / 2, bh / 2, 0.004), q(-bw / 2, bh / 2, 0.004)], rim, tuple(nn))
        mb.poly([q(-w / 2, -h / 2, 0.008), q(w / 2, -h / 2, 0.008), q(w / 2, h / 2, 0.008), q(-w / 2, h / 2, 0.008)], m, tuple(nn))
    screen(-0.60, 0.95, 0.211, 0.158, lcd_meter, 0.27, 0.21)
    screen(-0.59, 0.53, 0.211, 0.158, lcd_tims, 0.30, 0.22)
    # right monitor in its hood box, yawed 15° toward the driver
    box(mb, -0.40, -0.80, -0.44, 0.06, 2.45, 2.47, hood)
    box(mb, -0.40, -0.45, -0.44, 0.06, 2.47, 2.78, hood)
    box(mb, -0.40, -0.80, -0.44, 0.06, 2.76, 2.78, hood)
    screen(-0.66, -0.18, 0.246, 0.185, lcd_mon, 0.29, 0.22, yaw=math.radians(-15))
    # 緊急 button column, grab handle, radio, switch plinth
    mb.cyl(P(-0.585, 0.74, 2.66), (-1, 0, 0.23), 0.025, 0.03, red, seg=12)
    mb.cyl(P(-0.60, 0.74, 2.55), (-1, 0, 0.23), 0.012, 0.05, frame, seg=8)
    mb.cyl(P(-0.61, 0.74, 2.49), (-1, 0, 0.23), 0.02, 0.01, M["white"], seg=12)
    box(mb, -0.70, -0.76, 0.42, 0.62, 2.45, 2.51, rim)
    mb.cyl(P(-0.73, 0.52, 2.53), (0, 1, 0), 0.0175, 0.20, rim, seg=10)
    mb.cyl(P(-0.73, 0.415, 2.53), (0, 1, 0), 0.018, 0.012, green, seg=10)
    box(mb, -0.56, -0.60, 0.08, 0.36, 2.48, 2.66, panel)
    mb.cyl(P(-0.585, 0.25, 2.60), (-1, 0, 0.23), 0.03, 0.02, red, seg=14)
    mb.cyl(P(-0.60, 0.15, 2.52), (-1, 0, 0.23), 0.018, 0.02, green, seg=10)
    box(mb, -0.70, -0.80, -0.05, 0.30, 2.45, 2.49, panel)
    for k in range(6):
        mb.cyl(P(-0.75, -0.02 + k * 0.05, 2.505), (0, 0, 1), 0.008, 0.03, M["chrome"], seg=6)
    box(mb, -0.28, -0.32, 1.33, 1.39, 3.00, 3.10, panel)                            # 直通予備 switch box
    # master controller: inclined black plate, slot, notch strip (handle is a separate object)
    plate = Matrix.Rotation(math.radians(-8), 3, "Y")
    box(mb, -0.66, -0.92, 1.03, 1.21, 2.44, 2.46, rim, plate)
    box(mb, -0.68, -0.90, 1.11, 1.13, 2.462, 2.466, frame)
    for k, mm in enumerate([red] + [M["orange"]] * 8 + [M["white"]] + [green] * 5):
        box(mb, -0.68 - k * 0.0145, -0.68 - k * 0.0145 - 0.010, 1.15, 1.18, 2.462, 2.468, mm)
    # reverser
    box(mb, -0.78, -0.82, 1.27, 1.29, 2.45, 2.50, frame)
    mb.beam(P(-0.80, 1.28, 2.50), P(-0.80, 1.28, 2.58), 0.015, 0.015, frame)
    # timetable holder (right of the mascon, tilted 25° toward the driver)
    Rt = Matrix.Rotation(math.radians(25), 3, "Y")
    box(mb, -0.80, -0.95, 0.30, 0.80, 2.46, 2.47, rim, Rt)
    box(mb, -0.81, -0.94, 0.32, 0.78, 2.472, 2.474, paper, Rt)
    # driver's seat on a pedestal (blue moquette, stainless frame)
    box(mb, -1.075, -1.525, 0.625, 1.075, 2.06, 2.13, moq)
    Rb = Matrix.Rotation(math.radians(8), 3, "Y")
    mb.box(P(-1.57, 0.85, 2.43), (0.08, 0.44, 0.55), moq, Rb)
    mb.cyl(P(-1.30, 0.85, (zp + 2.06) / 2), (0, 0, 1), 0.04, 2.06 - zp, stain, seg=10)
    box(mb, -1.15, -1.45, 0.70, 1.00, zp, zp + 0.03, stain)
    # folding aux seat in the right rear corner
    box(mb, -1.75, -2.20, -1.35, -1.30, zr, 2.20, wall)
    box(mb, -1.80, -2.15, -1.32, -0.80, 1.60, 1.65, moq)
    # horn pedals
    for yy in (0.98, 0.72):
        box(mb, -0.70, -0.82, yy - 0.04, yy + 0.04, zp, zp + 0.04, frame)
    # partition at the back: rescue panel, big window with blind, door with window
    xp = xr
    mb.poly([P(xp, -W, zr), P(xp, W, zr), P(xp, W, 2.15), P(xp, -W, 2.15)], wall, (1, 0, 0))
    mb.poly([P(xp, -W, 2.94), P(xp, W, 2.94), P(xp, W, zc), P(xp, -W, zc)], wall, (1, 0, 0))
    mb.poly([P(xp, 0.43, 2.15), P(xp, W, 2.15), P(xp, W, 2.94), P(xp, 0.43, 2.94)], wall, (1, 0, 0))
    mb.poly([P(xp, -W, 2.15), P(xp, -0.43, 2.15), P(xp, -0.43, 2.94), P(xp, -W, 2.94)], wall, (1, 0, 0))
    mb.poly([P(xp + 0.01, -0.43, 2.15), P(xp + 0.01, 0.43, 2.15), P(xp + 0.01, 0.43, 2.94), P(xp + 0.01, -0.43, 2.94)], M["win"], (1, 0, 0))
    mb.poly([P(xp + 0.02, -0.43, 2.70), P(xp + 0.02, 0.43, 2.70), P(xp + 0.02, 0.43, 2.94), P(xp + 0.02, -0.43, 2.94)], blind, (1, 0, 0))
    box(mb, xp + 0.005, xp + 0.03, 0.50, 1.40, zr + 0.05, zr + 1.95, wall)          # 非常救出口 panel
    box(mb, xp + 0.005, xp + 0.03, -1.12, -0.55, zr, zr + 1.86, stain)              # door
    mb.poly([P(xp + 0.032, -1.04, zr + 1.18), P(xp + 0.032, -0.63, zr + 1.18), P(xp + 0.032, -0.63, zr + 1.75), P(xp + 0.032, -1.04, zr + 1.75)], M["win"], (1, 0, 0))
    cab = mb.build(coll)

    # master controller handle (separate object, animated): pivot 0.12 below the desk at the slot;
    # T grip laid along y, stainless shaft. Rotates about the car's lateral axis.
    hb = MB("mascon_handle")
    hb.beam((0, 0, 0), (0, 0, 0.21), 0.025, 0.025, stain)
    hb.cyl((0, 0, 0.225), (0, 1, 0), 0.0175, 0.13, M["handle"], seg=12)
    h = hb.build(coll)
    h.location = P(-0.79, 1.12, 2.45 - 0.12)
    return [cab, h]


# ---------------------------------------------------------------------------
# Trackside props
# ---------------------------------------------------------------------------
def make_env(M, coll):
    objs = []
    # catenary gate for double track (centre at y=0, tracks at +-2.0)
    mb = MB("catenary_gate")
    for s in (-1, 1):
        y = s * 4.4
        mb.box((0, y, 3.8), (0.25, 0.25, 7.6), M["steel_paint"])
        mb.box((0, y, 0.15), (0.6, 0.6, 0.3), M["concrete"])
    mb.box((0, 0, 7.45), (0.18, 9.2, 0.18), M["steel_paint"])
    mb.box((0, 0, 7.0), (0.12, 9.0, 0.12), M["steel_paint"])
    for k in range(-8, 9):
        mb.beam((0, k * 0.52, 7.0), (0, k * 0.52 + 0.26, 7.45), 0.05, 0.05, M["steel_paint"])
    for ty in (-2.0, 2.0):
        mb.beam((0, ty, 7.0), (0, ty, 6.15), 0.04, 0.04, M["steel"])
        mb.cyl((0, ty, 6.1), (0, 0, 1), 0.05, 0.25, M["dkgrey"], seg=8)
        mb.beam((0, ty, 6.0), (0, ty + 0.3, 5.15), 0.035, 0.035, M["steel"])
    objs.append(mb.build(coll))

    # platform canopy: 10 m unit, centred pillar line
    mb = MB("platform_roof")
    for x in (-2.5, 2.5):
        mb.box((x, 0, 2.0), (0.25, 0.25, 4.0), M["steel_paint"])
    mb.poly([(-5, -3.2, 4.0), (5, -3.2, 4.0), (5, 0, 4.3), (-5, 0, 4.3)], M["canopy"], (0, 0, 1))
    mb.poly([(-5, 3.2, 4.0), (5, 3.2, 4.0), (5, 0, 4.3), (-5, 0, 4.3)], M["canopy"], (0, 0, 1))
    mb.poly([(-5, -3.2, 3.95), (5, -3.2, 3.95), (5, 0, 4.25), (-5, 0, 4.25)], M["grey"], (0, 0, -1))
    mb.poly([(-5, 3.2, 3.95), (5, 3.2, 3.95), (5, 0, 4.25), (-5, 0, 4.25)], M["grey"], (0, 0, -1))
    for s in (-1, 1):
        mb.box((0, s * 1.6, 3.95), (8.0, 0.15, 0.06), M["lamp"])
    objs.append(mb.build(coll))

    mb = MB("bench")
    mb.box((0, 0, 0.42), (1.8, 0.45, 0.06), M["blue_seat"])
    mb.box((0, -0.2, 0.7), (1.8, 0.05, 0.4), M["blue_seat"])
    for x in (-0.7, 0.7):
        mb.box((x, 0, 0.2), (0.06, 0.4, 0.4), M["chrome"])
    objs.append(mb.build(coll))

    mb = MB("vending_machine")
    mb.box((0, 0, 0.92), (0.95, 0.75, 1.84), M["vend_red"])
    mb.poly([(0.4, 0.38, 0.9), (-0.4, 0.38, 0.9), (-0.4, 0.38, 1.75), (0.4, 0.38, 1.75)], M["vend_front"], (0, 1, 0))
    objs.append(mb.build(coll))

    # 3-aspect signal, lamps facing -X (towards the approaching train when placed at +X)
    mb = MB("signal")
    mb.cyl((0, 0, 2.6), (0, 0, 1), 0.08, 5.2, M["steel_paint"], seg=10)
    mb.box((0, 0, 4.9), (0.3, 0.55, 1.2), M["black"])
    mb.box((0.05, 0, 4.9), (0.2, 0.9, 1.4), M["black"])
    for z, mm in ((5.3, M["sig_g"]), (4.9, M["sig_y"]), (4.5, M["sig_r"])):
        mb.cyl((-0.17, 0, z), (1, 0, 0), 0.11, 0.04, mm, seg=14)
        mb.cyl((-0.2, 0, z + 0.06), (1, 0, 0), 0.14, 0.1, M["black"], seg=14, cap=False)
    objs.append(mb.build(coll))

    # stop position marker (the board is textured in three.js)
    mb = MB("stop_post")
    mb.cyl((0, 0, 0.9), (0, 0, 1), 0.04, 1.8, M["steel_paint"], seg=8)
    mb.box((0, 0, 1.95), (0.04, 0.5, 0.5), M["stop_sign"])
    objs.append(mb.build(coll))

    # houses
    for name, w, d, h, roofm, wallm in (("house_a", 8.0, 7.0, 5.6, M["roof_tile"], M["wall_white"]),
                                         ("house_b", 9.0, 7.5, 6.0, M["roof_red"], M["wall_beige"])):
        mb = MB(name)
        mb.box((0, 0, h / 2), (w, d, h), wallm)
        rh = 2.0
        mb.poly([(-w / 2 - 0.4, -d / 2 - 0.4, h), (w / 2 + 0.4, -d / 2 - 0.4, h), (w / 2 + 0.4, 0, h + rh), (-w / 2 - 0.4, 0, h + rh)], roofm, (0, -1, 1))
        mb.poly([(-w / 2 - 0.4, d / 2 + 0.4, h), (w / 2 + 0.4, d / 2 + 0.4, h), (w / 2 + 0.4, 0, h + rh), (-w / 2 - 0.4, 0, h + rh)], roofm, (0, 1, 1))
        for s in (-1, 1):
            mb.poly([(s * w / 2, -d / 2, h), (s * w / 2, d / 2, h), (s * w / 2, 0, h + rh)], wallm, (s, 0, 0))
        for k in (-1, 1):
            for z in (1.0, 3.8):
                mb.poly([(k * w / 4 - 0.7, -d / 2 - 0.01, z), (k * w / 4 + 0.7, -d / 2 - 0.01, z), (k * w / 4 + 0.7, -d / 2 - 0.01, z + 1.2), (k * w / 4 - 0.7, -d / 2 - 0.01, z + 1.2)], M["glass"], (0, -1, 0))
                mb.poly([(k * w / 4 - 0.7, d / 2 + 0.01, z), (k * w / 4 + 0.7, d / 2 + 0.01, z), (k * w / 4 + 0.7, d / 2 + 0.01, z + 1.2), (k * w / 4 - 0.7, d / 2 + 0.01, z + 1.2)], M["glass"], (0, 1, 0))
        objs.append(mb.build(coll))

    mb = MB("tree")
    mb.cyl((0, 0, 1.4), (0, 0, 1), 0.18, 2.8, M["wood"], seg=7)
    mb.sphere((0, 0, 4.0), 2.2, M["leaf"], seg=8, rings=5, sz=1.2)
    mb.sphere((0.9, 0.6, 3.3), 1.4, M["leaf"], seg=7, rings=4)
    objs.append(mb.build(coll))

    mb = MB("utility_pole")
    mb.cyl((0, 0, 5.5), (0, 0, 1), 0.16, 11.0, M["concrete"], seg=8, r2=0.12)
    mb.box((0, 0, 10.2), (0.12, 1.8, 0.12), M["steel"])
    mb.box((0, 0, 9.4), (0.12, 1.4, 0.12), M["steel"])
    mb.cyl((0.2, 0.3, 8.4), (0, 0, 1), 0.25, 0.8, M["grey"], seg=10)
    objs.append(mb.build(coll))
    return objs


# ---------------------------------------------------------------------------
def export(objs, path):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        for c in o.children:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False)
    print("exported", path, os.path.getsize(path), "bytes")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials()
    scene = bpy.context.scene
    spacing = 0
    only = os.environ.get("ONLY")
    for key, S in cars.SERIES.items():
        if only and key not in only.split(","):
            continue
        coll = bpy.data.collections.new(f"series_{key}")
        scene.collection.children.link(coll)
        kinds = ["cab", "mid", "mid_panto"] + (["green"] if S.green else [])
        objs = []
        for i, k in enumerate(kinds):
            o = cars.make_car(S, M, k, coll)
            print("built", o.name, len(o.data.polygons), "faces", flush=True)
            objs.append(o)
        export(objs, os.path.join(OUT_DIR, f"{key}.glb"))
        # lay out in the .blend for viewing
        for i, o in enumerate(objs):
            o.location = (i * 22.0, spacing, 0)
        spacing += 6.0
    coll = bpy.data.collections.new("cab_interior")
    scene.collection.children.link(coll)
    cab = make_cab_interior(M, coll)
    export(cab, os.path.join(OUT_DIR, "cab_interior.glb"))
    for o in cab:
        o.location.y += -12.0
    coll = bpy.data.collections.new("environment")
    scene.collection.children.link(coll)
    env = make_env(M, coll)
    export(env, os.path.join(OUT_DIR, "environment.glb"))
    for i, o in enumerate(env):
        o.location = (i * 12.0, -24.0, 0)
    blend = os.path.join(HERE, "train_models.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print("saved", blend)


main()
