"""
Second airport ("Minato", ~200 km east of the home airport) and its town (Blender / bpy).

    python3 build_airport2.py

Local Blender frame: +X east, +Y north, +Z up, metres, origin = runway centre.  The simulator
places the model at three.js (200000, 0, -9000) (web/js/airport2.js, A2).

Contents
  * runway 09/27 3000 m x 45 m with shoulders, blast pads and full ICAO markings, parallel
    taxiway B with three connectors, holding positions and signs
  * apron with seven nose-in stands (lead-in lines, stop bars, safety lines, stand numbers),
    GSE service road and equipment parking
  * terminal: glazed gate pier with a wave roof on columns, three-level landside hall with a
    curbside canopy, seven boarding bridges, stair towers, docking guidance boards
  * control tower, maintenance hangar with office annex, fire station, cargo shed,
    multi-storey car park, floodlight masts, windsock, ILS localizer / glideslope, fence
  * the town around it: ~120 m blocks, streets, low / mid-rise buildings and a small centre
  * airport2.glb + airport2.json (lights, collision boxes, stands, sign anchors)
"""
import json
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import build_world as W  # noqa: E402  (materials, geometry helpers, light / obstacle registries)
import airport_kit as K  # noqa: E402
from airport_kit import mi  # noqa: E402

# which remote airport to build: python3 build_airport2.py [--id 3]
#   id 2 (default), 3, 4 -> airportN.glb / airportN.json, gates B1.., C1.., D1..; the airfield and
#   terminal are the same design, the town around each airport differs (seed, centre, density)
AID = int(sys.argv[sys.argv.index("--id") + 1]) if "--id" in sys.argv else 2
VARIANT = {2: dict(letter="B", seed=20250925, centre=(-1300.0, 1900.0), dens=1.0),
           3: dict(letter="C", seed=20260103, centre=(1600.0, 2300.0), dens=0.85),
           4: dict(letter="D", seed=20260417, centre=(-600.0, -2100.0), dens=1.15)}[AID]
GL = VARIANT["letter"]

RWY_LEN, RWY_W = 3000.0, 45.0
TWY_Y, TWY_W = 170.0, 23.0
CONNS = [-1480.0, 0.0, 1480.0]
APRON = (-450.0, 450.0, 190.0, 410.0)       # x0, x1, y0, y1
LANE_Y = 240.0                              # apron taxilane
SERVICE_Y = 398.0                           # GSE road in front of the terminal
STANDS = [-360.0 + 120.0 * k for k in range(7)]
STAND_CG_Y = 352.0                          # 787-9 CG on the stand (three.js z = -352)
S_CG_FROM_NOSE = 31.85
PIER_Y = 410.0                              # airside face of the terminal
Z_PAV, Z_MK = 0.12, 0.16                    # a little higher than at home: far from the origin


def rect(mb, cx, cy, L, Wd, ang, z, mat, uv=("world", 25.0)):
    W.rect(mb, cx, cy, L, Wd, ang, z, mat, uv)


# ---------------------------------------------------------------------------
def build_airfield(M, col):
    pav, mk = C.MeshBuilder(), C.MeshBuilder()
    h = RWY_LEN / 2
    rect(pav, 0, 0, RWY_LEN, RWY_W, 0, Z_PAV, 0)
    for sy in (-1, 1):
        rect(pav, 0, sy * (RWY_W / 2 + 3.75), RWY_LEN + 120, 7.5, 0, Z_PAV - 0.01, 1)
    for sx in (-1, 1):
        rect(pav, sx * (h + 60), 0, 120, RWY_W, 0, Z_PAV - 0.01, 1)
        for k in range(3):
            for sy in (-1, 1):
                rect(mk, sx * (h + 25 + k * 30) + sx * 8, sy * 10, 28, 1.2, math.radians(35) * sy * sx, Z_MK, 1)
    # taxiway B, connectors with fillets, end turn pads
    rect(pav, 0, TWY_Y, RWY_LEN + 60, TWY_W, 0, Z_PAV, 2)
    for xc in CONNS:
        rect(pav, xc, (TWY_Y + RWY_W / 2) / 2, TWY_W, TWY_Y - RWY_W / 2 + 2, 0, Z_PAV - 0.005, 2)
        for sx in (-1, 1):
            for yy in (RWY_W / 2 + 6, TWY_Y - 12):
                rect(pav, xc + sx * (TWY_W / 2 + 4), yy, 10, 12, 0, Z_PAV - 0.006, 2)
    # apron + link to the taxiway, maintenance / cargo aprons
    x0, x1, y0, y1 = APRON
    rect(pav, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0, Z_PAV + 0.002, 3)
    rect(pav, 790, 250, 260, 120, 0, Z_PAV + 0.002, 3)
    rect(pav, -700, 260, 260, 140, 0, Z_PAV + 0.002, 3)
    rect(pav, -420, (TWY_Y + y0) / 2, 60, y0 - TWY_Y + 10, 0, Z_PAV - 0.003, 2)
    rect(pav, 420, (TWY_Y + y0) / 2, 60, y0 - TWY_Y + 10, 0, Z_PAV - 0.003, 2)
    # --- runway markings ---
    for sx in (-1, 1):
        thr = sx * h
        inward = -sx
        for i in range(6):
            for sy in (-1, 1):
                rect(mk, thr + inward * 21, sy * (3.0 + 0.9 + i * 3.6), 30, 1.8, 0, Z_MK, 0)
        rect(mk, thr + inward * 1.0, 0, 1.8, RWY_W - 2, 0, Z_MK, 0)
        W.text_mesh(mk, "27" if sx > 0 else "09", thr + inward * 58, 0, Z_MK, 14.0, math.pi / 2 if sx > 0 else -math.pi / 2, 0)
        for sy in (-1, 1):
            rect(mk, thr + inward * 430, sy * 9.5, 60, 8, 0, Z_MK, 0)
            for d, n in ((150, 3), (300, 3), (600, 2), (750, 2), (900, 1)):
                for k in range(n):
                    rect(mk, thr + inward * (d + 11), sy * (3.8 + 0.9 + k * 3.0), 22.5, 1.8, 0, Z_MK, 0)
    x = -h + 90
    while x < h - 90:
        rect(mk, x + 15, 0, 30, 0.9, 0, Z_MK, 0)
        x += 50
    for sy in (-1, 1):
        rect(mk, 0, sy * (RWY_W / 2 - 0.9), RWY_LEN, 0.9, 0, Z_MK, 0)
    # --- taxiway markings: centre lines, holding positions, apron guidance ---
    rect(mk, 0, TWY_Y, RWY_LEN + 40, 0.3, 0, Z_MK, 1)
    for xc in CONNS:
        rect(mk, xc, (TWY_Y + RWY_W / 2) / 2, 0.3, TWY_Y - RWY_W / 2, 0, Z_MK, 1)
        for k in range(2):
            rect(mk, xc, 68 + k * 0.9, TWY_W, 0.3, 0, Z_MK, 1)
        for k in range(2):
            for d in range(-5, 6):
                rect(mk, xc + d * 2.1, 70.8 + k * 0.9, 1.0, 0.3, 0, Z_MK, 1)
    for xl in (-420, 420):
        rect(mk, xl, (TWY_Y + LANE_Y) / 2, 0.3, LANE_Y - TWY_Y, 0, Z_MK, 1)
    rect(mk, 0, LANE_Y, x1 - x0 - 20, 0.3, 0, Z_MK, 1)
    for sy in (-6.0, 6.0):
        rect(mk, 0, SERVICE_Y + sy * 0.5, x1 - x0 - 20, 0.2, 0, Z_MK, 0)
    for k, xs in enumerate(STANDS):
        nose_y = STAND_CG_Y + S_CG_FROM_NOSE
        rect(mk, xs, (LANE_Y + nose_y) / 2, 0.3, nose_y - LANE_Y, 0, Z_MK, 1)
        # stop bars for the three types (787 / 767 / 737 nose positions)
        for dy, wbar in ((0.0, 8.0), (-3.0, 5.0), (-9.5, 5.0)):
            rect(mk, xs, nose_y + dy - 1.0, wbar, 0.5, 0, Z_MK, 1)
        for sx in (-1, 1):
            rect(mk, xs + sx * 38, (LANE_Y + 18 + y1) / 2, 0.25, y1 - LANE_Y - 18, 0, Z_MK, 0)
        W.text_mesh(mk, GL + str(k + 1), xs + 12, LANE_Y + 40, Z_MK, 6.0, 0.0, 1)
    # GSE parking boxes at the east end of the apron
    for k in range(9):
        rect(mk, 400 + k * 6, 368, 0.15, 48, 0, Z_MK, 0)
    rect(mk, 424, 344, 48, 0.15, 0, Z_MK, 0)
    rect(mk, 424, 392, 48, 0.15, 0, Z_MK, 0)
    pav.build("A2_Pavement", [M["asphalt"], M["shoulder"], M["taxi"], M["concrete"]], col=col)
    mk.build("A2_Markings", [M["white"], M["yellow"]], col=col)


def build_lights(fx):
    """Runway / approach / taxiway / apron lights (W.LIGHTS, three.js frame) + fixtures."""
    h = RWY_LEN / 2
    add = W.add_light
    x = -h
    while x <= h + 0.1:
        for sy in (-1, 1):
            add("a2_rwy_edge", (x, sy * (RWY_W / 2 + 1.0), 0.45), "#fff6dc", 1.6)
            K.box(fx, x - 0.15, x + 0.15, sy * (RWY_W / 2 + 1.0) - 0.15, sy * (RWY_W / 2 + 1.0) + 0.15, 0, 0.4, mi("paint_white"))
        x += 60
    x = -h + 7.5
    while x < h:
        for d in (-1, 1):
            remaining = (x + h) if d < 0 else (h - x)
            c = "#ff2a1a" if remaining < 300 else ("#ff2a1a" if int(x / 15) % 2 and remaining < 900 else "#fff4d6")
            add("a2_rwy_cl_" + ("27" if d < 0 else "09"), (x, 0.0, Z_MK + 0.02), c, 1.1, direction=(-d, 0, 0.05), kind="directional")
        x += 15
    for sx in (-1, 1):
        thr = sx * h
        for k in range(-7, 8):
            add("a2_rwy_threshold", (thr + sx * 1.5, k * 2.9, 0.35), "#34ff5a", 1.4, direction=(sx, 0, 0.1), kind="directional")
            add("a2_rwy_end", (thr + sx * 0.5, k * 2.9, 0.35), "#ff2a1a", 1.4, direction=(-sx, 0, 0.1), kind="directional")
        for k in range(1, 31):
            d = k * 30.0
            xx = thr + sx * d
            for j in range(-2, 3):
                add("a2_als", (xx, j * 1.0, 0.8 + d * 0.004), "#fff2d0", 1.8, direction=(sx, 0, 0.12), kind="directional")
            K.beam(fx, (xx, 0, 0), (xx, 0, 0.7 + d * 0.004), 0.12, 0.12, mi("paint_grey"))
            K.beam(fx, (xx, -2.3, 0.75 + d * 0.004), (xx, 2.3, 0.75 + d * 0.004), 0.1, 0.1, mi("paint_grey"))
            if k >= 11:
                add("a2_als_flash", (xx, 0, 1.2 + d * 0.004), "#ffffff", 3.0, direction=(sx, 0, 0.12), kind="sequenced")
            if k == 10:
                for j in list(range(-9, -3)) + list(range(4, 10)):
                    add("a2_als", (xx, j * 1.5, 0.8), "#fff2d0", 1.8, direction=(sx, 0, 0.12), kind="directional")
                K.beam(fx, (xx, -14, 0.75), (xx, 14, 0.75), 0.1, 0.1, mi("paint_grey"))
        # PAPI left of the landing direction, 300 m in
        left_y = -1 if sx > 0 else 1
        px = thr - sx * 300
        for i in range(4):
            yy = left_y * (RWY_W / 2 + 15 + i * 9)
            ang = [3.5, 3.1667, 2.8333, 2.5][i]
            add("a2_papi_" + ("27" if sx > 0 else "09"), (px, yy, 0.9), "#ffffff", 3.2,
                direction=(sx, 0, math.tan(math.radians(ang))), kind="papi")
            K.box(fx, px - 0.6, px + 0.6, yy - 1.0, yy + 1.0, 0.0, 1.0, mi("paint_white"))
            K.box(fx, px + sx * 0.6 - 0.05, px + sx * 0.6 + 0.05, yy - 0.8, yy + 0.8, 0.5, 0.95, mi("dark"))
    x = -h - 20
    while x <= h + 20:
        for sy in (-1, 1):
            add("a2_twy_edge", (x, TWY_Y + sy * (TWY_W / 2 + 1), 0.35), "#3a64ff", 1.0)
        add("a2_twy_cl", (x, TWY_Y, Z_MK + 0.02), "#28ff6a", 0.8)
        x += 30
    for xc in CONNS:
        yy = RWY_W / 2 + 10
        while yy < TWY_Y - 10:
            for sx in (-1, 1):
                add("a2_twy_edge", (xc + sx * (TWY_W / 2 + 1), yy, 0.35), "#3a64ff", 1.0)
            add("a2_twy_cl", (xc, yy, Z_MK + 0.02), "#28ff6a", 0.8)
            yy += 15
        for d in range(-5, 6):
            add("a2_stopbar", (xc + d * 2.0, 66, 0.25), "#ff2020", 0.9)


def build_terminal(M, col):
    """Gate pier + landside hall + boarding bridges.  Returns stand records and sign anchors."""
    tb = C.MeshBuilder()
    rng = np.random.default_rng(11)
    # --- gate pier: apron-level service floor, glazed gate lounges, wave roof on columns ---
    px0, px1, py0, py1 = -470.0, 470.0, PIER_Y, 446.0
    K.box(tb, px0, px1, py0, py1, 0, 0.6, mi("concrete"))
    K.solid_wall_with_doors(tb, (px0, py0), (px1, py0), 0.6, 5.2, (0, -1))
    K.curtain_wall(tb, (px0, py0), (px1, py0), 5.2, 13.0, (0, -1), floor=7.8)
    K.curtain_wall(tb, (px1, py1), (px0, py1), 0.6, 13.0, (0, 1), floor=6.2)
    for (a, b, o) in (((px0, py1), (px0, py0), (-1, 0)), ((px1, py0), (px1, py1), (1, 0))):
        K.curtain_wall(tb, a, b, 0.6, 13.0, o, floor=6.2)
    K.box(tb, px0 + 0.4, px1 - 0.4, py0 + 0.4, py1 - 0.4, 0.6, 12.9, mi("dark"), uv=0.1)
    W.wave_roof(tb, px0 - 12, px1 + 12, py0 - 9, py1 + 4, 13.2, 2.8, mi("roof"), n=120, waves=7)
    K.eave_columns(tb, np.arange(px0 + 20, px1 - 10, 60.0), py0 - 7.0, 13.4)
    W.obstacle(px0, py0, px1, py1, 16.0)
    # --- landside hall: three levels, curtain walls, roof with a deep curbside canopy ---
    hx0, hx1, hy0, hy1 = -230.0, 230.0, py1, 530.0
    hh = K.terminal_block(tb, hx0, hx1, hy0, hy1, levels=4, floor=5.0, airside="S", eave=(4, 4, 0, 16), rng=rng, doors=False)
    K.eave_columns(tb, np.arange(hx0 + 10, hx1, 36.0), hy1 + 13.0, hh)
    W.obstacle(hx0, hy0, hx1, hy1, hh + 1.4)
    # curbside road deck and drop-off canopy columns
    K.box(tb, hx0 - 40, hx1 + 40, hy1 + 4, hy1 + 22, 0.0, 0.25, mi("concrete"))
    # entrance doors (glass portals) on the landside face
    for x in np.arange(hx0 + 30, hx1 - 20, 60.0):
        K.box(tb, x - 5, x + 5, hy1 - 0.2, hy1 + 1.8, 0.6, 4.2, mi("glass_dark"))
        K.box(tb, x - 5.4, x + 5.4, hy1 + 1.6, hy1 + 2.2, 4.2, 4.6, mi("paint_white"))
    # rooftop signage frame (the name itself is drawn by the simulator: sign anchors)
    K.box(tb, -90, 90, py0 - 0.8, py0 - 0.3, 9.0, 12.4, mi("dark"))
    K.box(tb, -110, 110, hy1 + 16.2, hy1 + 16.8, hh + 1.6, hh + 6.4, mi("dark"))
    signs = [dict(kind="airside", pos=[0.0, 10.7, -(py0 - 1.0)], ry=0.0, h=2.4, maxW=170.0),
             dict(kind="landside", pos=[0.0, hh + 4.0, -(hy1 + 17.1)], ry=math.pi, h=3.0, maxW=210.0)]
    # --- boarding bridges, stair towers, docking guidance, gate numbers ---
    stands = []
    for k, xs in enumerate(STANDS):
        nose_y = STAND_CG_Y + S_CG_FROM_NOSE
        door = (xs - 2.95, nose_y - 6.95)
        rot = (xs - 16.0, py0 - 9.0)
        K.jet_bridge(tb, (rot[0], py0), (0, -1), rot, door, 5.25 - 0.93, door_out=(-1.0, 0.0))
        K.stair_tower(tb, xs + 26.0, py0 - 2.3, 6.0, (0, -1))
        K.vdgs(tb, xs, py0 - 0.4, 8.2, (0, -1))
        K.vtext(tb, GL + str(k + 1), xs + 9.0, py0 - 0.35, 10.6, 2.2, -math.pi / 2, mi("sign_yellow"), extrude=0.15)
        stands.append(dict(id=GL + str(k + 1), x=xs, noseY=nose_y, heading=0.0, cg=[xs, 0.0, -STAND_CG_Y]))
    tb.build("A2_Terminal", K.kit_materials(M), col=col)
    return stands, signs


def build_airport_buildings(M, col):
    b = C.MeshBuilder()
    # control tower
    top = K.control_tower(b, 600.0, 440.0, cab_z=46.0, lights=W.add_light)
    W.obstacle(574, 424, 626, 456, 12.0)
    W.obstacle(587, 427, 613, 453, top)
    # maintenance hangar + annex (doors face the taxiway)
    K.hangar(b, 700.0, 880.0, 280.0, 400.0, 22.0, 32.0, door_side="S")
    W.obstacle(700, 280, 894, 400, 32.0)
    # fire station with bays facing the runway
    K.terminal_block(b, 180.0, 260.0, 120.0, 150.0, levels=2, floor=5.0, airside="S", eave=(1, 1, 3, 1))
    W.obstacle(180, 120, 260, 150, 11.0)
    # cargo shed + office
    K.hangar(b, -830.0, -570.0, 330.0, 420.0, 14.0, 17.0, door_side="S", annex=False)
    W.obstacle(-830, 330, -570, 420, 17.0)
    # multi-storey car park (open decks) landside
    for lvl in range(5):
        z = lvl * 3.2
        K.box(b, -200, 200, 580, 660, z, z + 0.45, mi("concrete"))
        for x in np.arange(-195, 200, 13.0):
            for y in (582, 658):
                K.box(b, x - 0.35, x + 0.35, y - 0.35, y + 0.35, z + 0.45, z + 3.2, mi("concrete"))
        K.box(b, -200, 200, 579.6, 580.2, z + 0.45, z + 1.5, mi("paint_white"))
        K.box(b, -200, 200, 659.8, 660.4, z + 0.45, z + 1.5, mi("paint_white"))
    K.box(b, -200, 200, 580, 660, 16.0, 16.45, mi("concrete"))
    W.obstacle(-200, 580, 200, 660, 16.5)
    # floodlight masts along the apron front and the GSE road
    for xm in np.arange(-420.0, 421.0, 140.0):
        K.flood_mast(b, xm, 404.0, 26.0, face=-math.pi / 2, lights=W.add_light, group="a2_apron_flood")
    # airside furniture
    K.windsock(b, 300.0, 95.0)
    K.windsock(b, -1100.0, -95.0, heading=2.4)
    K.ils_localizer(b, RWY_LEN / 2 + 300.0, 0.0)
    K.ils_localizer(b, -RWY_LEN / 2 - 300.0, 0.0, axis_ang=math.pi)
    K.glideslope_mast(b, -RWY_LEN / 2 + 300.0, -120.0)
    K.glideslope_mast(b, RWY_LEN / 2 - 300.0, 120.0)
    K.blast_fence(b, -1720, -1600, 150, face=1)
    for xc, name in zip(CONNS, ("B1", "B2", "B3")):
        K.taxi_sign(b, xc + 20, 60, 0.0, "09-27", mat_bg="red_white")
        K.taxi_sign(b, xc - 20, TWY_Y - 20, 0.0, name)
    K.taxi_sign(b, -440, TWY_Y + 25, 0.0, "APRON")
    K.fence(b, [(-30, 700), (-1900, 700), (-1900, -260), (1900, -260), (1900, 700), (30, 700)], step=5.0)
    b.build("A2_Buildings", K.kit_materials(M), col=col)


def build_landside(M, col):
    """Curbside roads, access road to the town, surface car parks with cars, bus / taxi shelters,
    median planting and street lights on the landside of the terminal."""
    mats = [M["road"], M["concrete"], M["white"], M["grass"], M["paint_white"], M["paint_grey"], M["dark"],
            M["red_white"], M["glass_dark"], M["steel"], M["crane"], M["yellow"], M["containers"]]
    R, CO, WH, GR, PW, PG, DK, RW, GD, ST, CR, YE, CT = range(len(mats))
    mb = C.MeshBuilder()
    rng = np.random.default_rng(530)

    def road(x0, x1, y0, y1, z=0.08):
        K.box(mb, x0, x1, y0, y1, 0.0, z, R, uv=0.05)

    def dashes(x0, x1, y, z=0.1, along_x=True, dash=6.0, gap=6.0, w=0.18):
        a = x0
        while a < x1 - dash:
            if along_x:
                K.box(mb, a, a + dash, y - w, y + w, z - 0.01, z, WH)
            else:
                K.box(mb, y - w, y + w, a, a + dash, z - 0.01, z, WH)
            a += dash + gap

    # curb / sidewalk in front of the hall, departures lane, median, through lanes
    K.box(mb, -290, 290, 530, 536, 0.0, 0.22, CO, uv=0.1)
    road(-320, 320, 536, 554)
    dashes(-300, 300, 545)
    K.box(mb, -300, 300, 554, 560, 0.0, 0.25, CO, uv=0.1)
    K.box(mb, -298, 298, 555, 559, 0.25, 0.3, GR, uv=0.1)
    road(-320, 320, 560, 574)
    dashes(-300, 300, 567)
    # ring road around the car park and the access road north into the town grid
    road(-232, -212, 536, 690); road(212, 232, 536, 690)
    road(-232, 232, 670, 690)
    road(-10, 10, 690, 900)
    dashes(536, 690, -222, along_x=False); dashes(536, 690, 222, along_x=False)
    dashes(690, 900, 0, along_x=False)
    # zebra crossings from the car park to the terminal
    for xc in (-120.0, 0.0, 120.0):
        for k in range(-4, 5):
            K.box(mb, xc + k * 1.2 - 0.3, xc + k * 1.2 + 0.3, 537, 573, 0.09, 0.11, WH)
    # surface car parks east and west (stall lines + cars)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 250.0, sx * 440.0))
        K.box(mb, x0, x1, 540, 690, 0.0, 0.07, R, uv=0.05)
        for row, yr in enumerate(np.arange(548.0, 688.0, 17.0)):
            face = 1 if row % 2 == 0 else -1
            for xst in np.arange(x0 + 4, x1 - 4, 2.7):
                K.box(mb, xst - 0.06, xst + 0.06, yr, yr + 5.2 * face, 0.07, 0.09, WH)
                if rng.random() < 0.72:
                    K.car(mb, xst + 1.35, yr + 2.6 * face, math.pi / 2 + rng.normal(0, 0.03), rng, (PW, PG, DK, RW, CR, CT), GD, DK)
        for yl in np.arange(560.0, 690.0, 40.0):
            W.add_light("a2_street", (sx * 345.0, yl, 10.0), "#ffc27a", 2.2)
            K.cyl(mb, (sx * 345.0, yl, 0), (sx * 345.0, yl, 10.0), 0.16, PG, n=8)
    # cars on the top deck of the multi-storey car park and at the curb
    for xst in np.arange(-195, 195, 2.7):
        for yr in (590.0, 650.0):
            if rng.random() < 0.55:
                K.car(mb, xst, yr, math.pi / 2, rng, (PW, PG, DK, RW, CR, CT), GD, DK, z0=16.45)
    for xc in np.arange(-260, 260, 7.5):
        if rng.random() < 0.35:
            K.car(mb, xc, 539.5, 0.0, rng, (PW, PG, DK, RW, CR, YE), GD, DK)
    # bus and taxi shelters on the median (steel columns, glass canopy)
    for xs in (-200.0, -60.0, 60.0, 200.0):
        for xx in np.arange(xs - 18, xs + 19, 6.0):
            K.cyl(mb, (xx, 557, 0.3), (xx, 557, 3.6), 0.12, ST, n=8)
        K.box(mb, xs - 20, xs + 20, 554.5, 559.5, 3.6, 3.8, GD)
        K.box(mb, xs - 20, xs + 20, 559.2, 559.4, 0.3, 3.6, GD)
    # street lights along the curbside roads
    for xl in np.arange(-300.0, 301.0, 40.0):
        K.cyl(mb, (xl, 557, 0.3), (xl, 557, 11.0), 0.16, PG, n=8)
        for dy in (-3.0, 3.0):
            K.beam(mb, (xl, 557, 10.8), (xl, 557 + dy, 11.0), 0.15, 0.15, PG)
            W.add_light("a2_street", (xl, 557 + dy, 10.8), "#ffc27a", 2.2)
    for yl in np.arange(700.0, 900.0, 40.0):
        W.add_light("a2_street", (12.0, yl, 9.0), "#ffc27a", 2.2)
        K.cyl(mb, (12.0, yl, 0), (12.0, yl, 9.0), 0.16, PG, n=8)
    # landscaping: lawns and trees around the hall and along the access road
    for (x0, x1, y0, y1) in ((-440, -250, 700, 718), (250, 440, 700, 718), (-205, 205, 692, 700)):
        K.box(mb, x0, x1, y0, y1, 0.0, 0.06, GR, uv=0.05)
    for x in np.arange(-290.0, 291.0, 11.0):
        W.tree(mb, x + rng.normal(0, 0.8), 557, rng.uniform(6, 9), rng)
    for y in np.arange(700.0, 900.0, 12.0):
        for sx in (-1, 1):
            W.tree(mb, sx * 18 + rng.normal(0, 0.8), y, rng.uniform(7, 11), rng)
    for x in np.arange(-440.0, 441.0, 14.0):
        if abs(x) > 250:
            W.tree(mb, x, 709 + rng.normal(0, 2), rng.uniform(7, 12), rng)
    mb.build("A2_Landside", mats, col=col)


# ---------------------------------------------------------------------------
# town
# ---------------------------------------------------------------------------
def build_town(M, col):
    rng = np.random.default_rng(VARIANT["seed"])
    ch = W.Chunks(1500.0)
    mats = [M[s] for s in W.STYLE_ORDER] + [M["roof"], M["paint_grey"], M["steel"], M["road"], M["concrete"],
                                            M["grass"], M["leaf"], M["leaf2"], M["trunk"], M["glass_tower"]]
    I_ROOF, I_GREY, I_STEEL, I_ROAD, I_CONC, I_GRASS, I_LEAF, I_LEAF2, I_TRUNK, I_GT = range(6, 16)
    B, ROAD = 120.0, 18.0
    centre = VARIANT["centre"]
    n_bld = 0
    in_airport = lambda x, y: -2100 < x < 2100 and -380 < y < 760
    in_corridor = lambda x, y: abs(y) < 700 and abs(x) > 1500
    for gx in np.arange(-5400.0, 5400.0, B):
        for gy in np.arange(-3000.0, 4200.0, B):
            x0, x1, y0, y1 = gx + ROAD / 2, gx + B - ROAD / 2, gy + ROAD / 2, gy + B - ROAD / 2
            cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
            if in_airport(cx, cy) or in_corridor(cx, cy):
                continue
            d = math.hypot(cx - centre[0], cy - centre[1])
            dens = math.exp(-d / 1700.0)
            if rng.random() > (0.25 + 0.75 * dens + (0.2 if d < 3200 else 0.0)) * VARIANT["dens"]:
                continue
            mb = ch.get(gx, gy)
            # streets (both sides of the block corner) and the block pavement
            W.rect(mb, gx + B / 2, gy, B + ROAD, ROAD, 0, 0.06, I_ROAD, ("road", 20.0, ROAD))
            W.rect(mb, gx, gy + B / 2, B, ROAD, math.pi / 2, 0.061, I_ROAD, ("road", 20.0, ROAD))
            park = rng.random() < 0.09
            W.rect(mb, cx, cy, x1 - x0, y1 - y0, 0, 0.05, I_GRASS if park else I_CONC)
            W.add_light("a2_street", (gx + B / 2, gy + ROAD / 2 + 1.5, 9.0), "#ffc27a", 2.2)
            W.add_light("a2_street", (gx + ROAD / 2 + 1.5, gy + B / 2, 9.0), "#ffc27a", 2.2)
            if park:
                for k in range(int(rng.integers(10, 22))):
                    W.tree(mb, rng.uniform(x0 + 5, x1 - 5), rng.uniform(y0 + 5, y1 - 5), rng.uniform(6, 12), rng,
                           I_LEAF if rng.random() < 0.5 else I_LEAF2, I_TRUNK)
                continue
            lots = 1 if (dens > 0.45 and rng.random() < 0.5) else int(rng.integers(2, 5))
            cells = [(x0, y0, x1, y1)]
            while len(cells) < lots:
                a, b_, c, e = cells.pop(0)
                if (c - a) > (e - b_):
                    m = (a + c) / 2
                    cells += [(a, b_, m - 2, e), (m + 2, b_, c, e)]
                else:
                    m = (b_ + e) / 2
                    cells += [(a, b_, c, m - 2), (a, m + 2, c, e)]
            for (a, b_, c, e) in cells:
                ins = rng.uniform(3, 7)
                a, b_, c, e = a + ins, b_ + ins, c - ins, e - ins
                if c - a < 8 or e - b_ < 8:
                    continue
                h = 8 + rng.random() ** 2 * 30 + dens * dens * 90 * rng.random()
                h = min(h, 35.0 if abs(cy) < 1400 else 140.0)
                if h > 60 and min(c - a, e - b_) > 22:
                    W.skyscraper(mb, a, b_, c, e, h, int(rng.choice([0, 1, 2])), rng, I_ROOF)
                else:
                    if h > 18:
                        style = int(rng.choice([2, 3, 5]))
                    else:
                        style = int(rng.choice([3, 4]))
                    tw, th = W.FACADES[W.STYLE_ORDER[style]]
                    h = round(h / (th / 4)) * (th / 4) or th / 4
                    W.box(mb, a, b_, c, e, 0, h, style, I_ROOF, (tw, th), float(rng.integers(0, 8)))
                    if (c - a) > 14 and (e - b_) > 14 and rng.random() < 0.7:
                        for k in range(int(rng.integers(1, 3))):
                            ux, uy = rng.uniform(a + 3, c - 8), rng.uniform(b_ + 3, e - 8)
                            W.box(mb, ux, uy, ux + rng.uniform(3, 6), uy + rng.uniform(3, 6), h, h + rng.uniform(1.5, 3.5), I_GREY, I_GREY)
                n_bld += 1
            if rng.random() < 0.5:
                for t in np.arange(x0 + 8, x1 - 4, 18):
                    W.tree(mb, t, y0 - 3, rng.uniform(6, 9), rng, I_LEAF, I_TRUNK)
    for k, mb in ch.b.items():
        mb.build("A2_Town_%d_%d" % k, mats, col=col)
    print("town buildings:", n_bld)


# ---------------------------------------------------------------------------
def main():
    C.reset_scene()
    col = C.collection("Airport2")
    M = W.materials()
    K.kit_materials(M)
    W.OBST.clear()
    W.LIGHTS.clear()
    W.TREES.clear()
    build_airfield(M, col)
    fx = C.MeshBuilder()
    build_lights(fx)
    fx.build("A2_Fixtures", K.kit_materials(M), col=col)
    stands, signs = build_terminal(M, col)
    build_airport_buildings(M, col)
    build_landside(M, col)
    build_town(M, col)
    data = dict(
        name="remote airport %d" % AID,
        frame="three.js local frame (+x east, +y up, +z south), origin = runway centre; placed at A2",
        runway=dict(length=RWY_LEN, width=RWY_W, idents=["09", "27"]),
        stands=stands, signs=signs,
        lights=W.LIGHTS,
        trees=[v for t in W.TREES for v in (t[0], t[2], -t[1], t[3])],
        obstacles=[round(v, 1) for (x0, y0, x1, y1, h) in W.OBST for v in (x0, -y1, x1, -y0, h)],
    )
    with open(os.path.join(C.WEB_ASSETS, "airport%d.json" % AID), "w") as fh:
        json.dump(data, fh, separators=(",", ":"), default=lambda o: o.item() if hasattr(o, "item") else str(o))
    C.export_glb(os.path.join(C.WEB_ASSETS, "airport%d.glb" % AID), draco=True)
    C.save_blend(os.path.join(C.OUT_DIR, "airport%d.blend" % AID))
    print("airport%d: obstacles" % AID, len(W.OBST), "light groups", len(W.LIGHTS))


if __name__ == "__main__":
    main()
