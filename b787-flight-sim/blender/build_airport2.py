"""
The remote airports (Blender / bpy): Osaka Kansai (--id 2), Sapporo New Chitose (--id 3) and
Okinawa Naha (--id 4).

    python3 build_airport2.py --id 2

Local Blender frame: +X along the main runway (world +x), +Y towards the terminal (world -z),
+Z up, metres, origin = runway centre.  The simulator places the model at the airport's world
position (geo.py -> web/js/geo_data.js); each airport has its own compass north there.

Contents
  * the main runway at its real length / width and names (Kansai 06R/24L 3500 m, New Chitose
    01R/19L 3000 m, Naha 36R/18L 3000 m) with shoulders, blast pads and ICAO markings, parallel
    taxiway with three connectors, holding positions and signs
  * the second runway of each airport (Kansai 06L/24R on the second island, New Chitose
    01L/19R, Naha 36L/18R on the reclaimed land) with taxiway links
  * apron with seven nose-in stands (lead-in lines, stop bars, safety lines, stand numbers),
    GSE service road and equipment parking
  * terminal: glazed gate pier with a wave roof on columns, three-level landside hall with a
    curbside canopy, seven boarding bridges, stair towers, docking guidance boards
  * control tower, maintenance hangar with office annex, fire station, cargo shed,
    multi-storey car park, floodlight masts, windsock, ILS localizer / glideslope, fence
  * each airport's own terminal architecture: Kansai's 1.7 km curved wing and aerofoil hall,
    New Chitose's arched hall and international terminal, Naha's vaulted hall and palms
  * the city's landmarks (real_kit.py); the city itself is instanced (city_gen.py)
  * airportN.glb + airportN.json (lights, collision boxes, stands, sign anchors)
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
import geo as G  # noqa: E402
import real_kit as R  # noqa: E402

# which remote airport to build: python3 build_airport2.py [--id 3]
#   id 2 (default), 3, 4 -> airportN.glb / airportN.json, gates B1.., C1.., D1..; runways,
#   terminal architecture and landmarks per airport (geo.py, real_kit.py)
AID = int(sys.argv[sys.argv.index("--id") + 1]) if "--id" in sys.argv else 2
GL = {2: "B", 3: "C", 4: "D"}[AID]

AP = G.AP[AID]
RWY_LEN, RWY_W = float(AP["rwy"]["len"]), float(AP["rwy"]["wid"])
K09, K27 = AP["rwy"]["k09"], AP["rwy"]["k27"]
TWY_Y, TWY_W = 170.0, 23.0
CONNS = [-(RWY_LEN / 2 - 20.0), 0.0, RWY_LEN / 2 - 20.0]
TOWER_CAB = {2: 64.0, 3: 30.0, 4: 66.0}[AID]     # Kansai 86 m, New Chitose 51 m, Naha 88 m
APRON = (-450.0, 450.0, 190.0, 410.0)       # x0, x1, y0, y1
LANE_Y = 240.0                              # apron taxilane
SERVICE_Y = 398.0                           # GSE road in front of the terminal
STANDS = [-360.0 + 120.0 * k for k in range(7)]
STAND_CG_Y = 352.0                          # 787-9 CG on the stand (three.js z = -352)
S_CG_FROM_NOSE = 31.85
import ops_layout as OL  # noqa: E402
OPS = OL.layout(AID)                        # all-runway taxiways, extra stands, terminals
PIER_X = {2: 880.0, 3: 1210.0, 4: 1210.0}[AID]                 # the main pier's extended length
BLD_X = PIER_X + 250.0                                          # tower / hangar / cargo beyond it
LAND_DY = {2: 30.0, 3: 15.0, 4: 10.0}[AID]     # landside roads / car parks moved out past the bigger halls
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
    rect(pav, BLD_X + 90, 250, 260, 120, 0, Z_PAV + 0.002, 3)
    rect(pav, -BLD_X - 130, 260, 260, 140, 0, Z_PAV + 0.002, 3)
    rect(pav, -420, (TWY_Y + y0) / 2, 60, y0 - TWY_Y + 10, 0, Z_PAV - 0.003, 2)
    rect(pav, 420, (TWY_Y + y0) / 2, 60, y0 - TWY_Y + 10, 0, Z_PAV - 0.003, 2)
    # --- runway markings (real names: "24L" at the threshold flown towards +x) ---
    R.runway_markings(mk, 0.0, 0.0, 0.0, RWY_LEN, RWY_W, (K09, K27), Z_MK, 0, rect=rect)
    # --- the second runway and the links to it ---
    for er in G.EXTRA_RWYS[AID]:
        R.extra_runway(pav, mk, er["cx"], er["cy"], R.local_ang(AID, er["hdg"]), er["len"], er["wid"], er["names"],
                       Z_PAV, Z_MK, mats=(0, 1, 0))
    # taxiways to it round the ends of the main runway, the extended apron and stands; the
    # segments that already exist (taxiway B, the apron taxilane and its links) are not redrawn
    def existing(p, q):
        if p[1] == q[1] == TWY_Y and max(abs(p[0]), abs(q[0])) <= RWY_LEN / 2 + 30:
            return True
        if p[1] == q[1] == LANE_Y and max(abs(p[0]), abs(q[0])) <= 420:
            return True
        return p[0] == q[0] and abs(p[0]) == 420 and {p[1], q[1]} == {TWY_Y, LANE_Y}
    R.draw_ops(OPS, pav, mk, Z_PAV, Z_MK, mats=(2, 1, 3, 0), skip=existing)
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


def _hall_walls(tb, x0, x1, y0, y1, h, levels):
    """Glazed hall on four sides with floor slabs and a dark interior block."""
    K.box(tb, x0, x1, y0, y1, 0, 0.6, mi("concrete"))
    for (a, b, o) in (((x0, y1), (x1, y1), (0, 1)), ((x1, y0), (x0, y0), (0, -1)),
                      ((x0, y0), (x0, y1), (-1, 0)), ((x1, y1), (x1, y0), (1, 0))):
        K.curtain_wall(tb, a, b, 0.6, h, o, floor=h / levels)
    K.box(tb, x0 + 0.5, x1 - 0.5, y0 + 0.5, y1 - 0.5, 0.6, h - 0.1, mi("dark"), uv=0.1)


def terminal_architecture(tb, px0, px1, py0, py1, rng):
    """Each airport's own terminal: roofs over the gate pier and the landside hall.
    Returns the hall rectangle and the height of its landside eave."""
    if AID == 2:
        # Kansai (Renzo Piano): the 1.7 km wing -- the pier continues past the seven contact
        # stands, under one roof that curves down towards both tips -- and the main building
        # whose roof rises like an aerofoil from the airside to the landside canyon
        for sx in (-1, 1):
            a, b = sorted((sx * px1, sx * (PIER_X + 20.0)))
            K.box(tb, a, b, py0, py1, 0, 0.6, mi("concrete"))
            K.curtain_wall(tb, (a, py0), (b, py0), 0.6, 9.0, (0, -1), floor=4.5)
            K.curtain_wall(tb, (b, py1), (a, py1), 0.6, 9.0, (0, 1), floor=4.5)
            K.box(tb, a, b, py0 + 0.4, py1 - 0.4, 0.6, 8.9, mi("dark"), uv=0.1)
            K.eave_columns(tb, np.arange(a + 15, b, 45.0), py0 - 6.0, 10.0)
            W.obstacle(a, py0, b, py1, 14.0)
        e = PIER_X + 20.0
        K.curtain_wall(tb, (-e, py1), (-e, py0), 0.6, 9.0, (-1, 0), floor=4.5)
        K.curtain_wall(tb, (e, py0), (e, py1), 0.6, 9.0, (1, 0), floor=4.5)
        R.aerofoil_roof(tb, -e - 12, e + 12, py0 - 9, py1 + 4, 19.0, 11.5, 0.8, 1.0, mi("roof"), n=220)
        K.eave_columns(tb, np.arange(px0 + 20, px1 - 10, 60.0), py0 - 7.0, 13.4)
        W.obstacle(px0, py0, px1, py1, 17.0)
        hx0, hx1, hy0, hy1 = -300.0, 300.0, py1, 560.0
        _hall_walls(tb, hx0, hx1, hy0, hy1, 24.0, 4)
        K.curtain_wall(tb, (hx0, hy1), (hx1, hy1), 24.0, 31.0, (0, 1), floor=7.0, slabs=False)
        R.aerofoil_roof(tb, hx0 - 12, hx1 + 12, hy0 - 6, hy1 + 16, 40.0, 31.0, 0.6, 1.0, mi("roof"), n=80)
        K.eave_columns(tb, np.arange(hx0 + 10, hx1, 36.0), hy1 + 13.0, 30.0)
        W.obstacle(hx0, hy0, hx1, hy1, 40.0)
        return hx0, hx1, hy0, hy1, 30.0
    if AID == 3:
        # New Chitose: domestic terminal under a long arched roof; the international terminal
        # (arched too) to the east of the tower
        R.vault_roof(tb, -PIER_X - 32, PIER_X + 32, py0 - 9, py1 + 4, 13.2, 4.5, mi("roof"), n=240, end_taper=0.3)
        K.eave_columns(tb, np.arange(px0 + 20, px1 - 10, 60.0), py0 - 7.0, 13.4)
        W.obstacle(px0, py0, px1, py1, 18.0)
        hx0, hx1, hy0, hy1 = -300.0, 300.0, py1, 545.0
        _hall_walls(tb, hx0, hx1, hy0, hy1, 20.0, 4)
        R.vault_roof(tb, hx0 - 10, hx1 + 10, hy0 - 8, hy1 + 16, 20.0, 14.0, mi("roof"), n=60, m=20, end_taper=0.25)
        K.eave_columns(tb, np.arange(hx0 + 10, hx1, 36.0), hy1 + 13.0, 21.0)
        W.obstacle(hx0, hy0, hx1, hy1, 34.0)
        ix0, ix1, iy0, iy1 = 470.0, 770.0, 468.0, 560.0
        _hall_walls(tb, ix0, ix1, iy0, iy1, 18.0, 3)
        R.vault_roof(tb, ix0 - 8, ix1 + 8, iy0 - 6, iy1 + 10, 18.0, 9.0, mi("roof"), n=40, m=16)
        W.obstacle(ix0, iy0, ix1, iy1, 27.0)
        K.box(tb, 440.0, 470.0, 480.0, 500.0, 6.0, 12.0, mi("curtain"))     # link bridge
        return hx0, hx1, hy0, hy1, 20.0
    # Naha: a vaulted hall behind a big curbside canopy, the pier under a low vault; the
    # international / domestic link building to the west
    R.vault_roof(tb, -PIER_X - 32, PIER_X + 32, py0 - 9, py1 + 4, 13.2, 3.0, mi("roof"), n=240, end_taper=0.2)
    K.eave_columns(tb, np.arange(px0 + 20, px1 - 10, 60.0), py0 - 7.0, 13.4)
    W.obstacle(px0, py0, px1, py1, 16.5)
    hx0, hx1, hy0, hy1 = -280.0, 280.0, py1, 540.0
    _hall_walls(tb, hx0, hx1, hy0, hy1, 22.0, 4)
    R.vault_roof(tb, hx0 - 14, hx1 + 14, hy0 - 6, hy1 + 22, 22.0, 9.0, mi("roof"), n=60, m=18, end_taper=0.35)
    K.eave_columns(tb, np.arange(hx0 + 10, hx1, 28.0), hy1 + 19.0, 23.0)
    W.obstacle(hx0, hy0, hx1, hy1, 31.0)
    _hall_walls(tb, -560.0, -300.0, 450.0, 520.0, 16.0, 3)
    R.vault_roof(tb, -566.0, -294.0, 444.0, 526.0, 16.0, 5.0, mi("roof"), n=30, m=12)
    W.obstacle(-560, 450, -300, 520, 21.0)
    return hx0, hx1, hy0, hy1, 22.0


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
    hx0, hx1, hy0, hy1, hh = terminal_architecture(tb, px0, px1, py0, py1, rng)
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
    # the extended pier (walls: the Kansai wing above has its own) and Kansai terminal 2, with
    # jet bridges for the extra stands (ops_layout.py)
    for t in OPS["terminals"]:
        sts = [s for s in OPS["stands"] if s["group"] == ("T2" if t["kind"] == "kix_t2" else "pier")]
        if t["kind"] == "pier_ext" and AID == 2:
            for s in sts:
                R.stand_furniture(tb, s, PIER_Y, mi)
            for xm in list(np.arange(-PIER_X, -470.0, 140.0)) + list(np.arange(PIER_X, 470.0, -140.0)):
                K.flood_mast(tb, xm, 404.0, 26.0, face=-math.pi / 2, lights=W.add_light, group="apron_flood")
            continue
        R.ops_terminal(tb, t, sts, mi, rng, W.add_light)
    tb.build("A2_Terminal", K.kit_materials(M), col=col)
    return stands, signs


def build_airport_buildings(M, col):
    b = C.MeshBuilder()
    # control tower
    tx = BLD_X + 60.0
    top = K.control_tower(b, tx, 480.0, cab_z=TOWER_CAB, lights=W.add_light)
    W.obstacle(tx - 26, 464, tx + 26, 496, 12.0)
    W.obstacle(tx - 13, 467, tx + 13, 493, top)
    # maintenance hangar + annex (doors face the taxiway), past the extended pier
    K.hangar(b, BLD_X, BLD_X + 180.0, 280.0, 400.0, 22.0, 32.0, door_side="S")
    W.obstacle(BLD_X, 280, BLD_X + 194, 400, 32.0)
    # fire station with bays facing the runway
    K.terminal_block(b, 180.0, 260.0, 120.0, 150.0, levels=2, floor=5.0, airside="S", eave=(1, 1, 3, 1))
    W.obstacle(180, 120, 260, 150, 11.0)
    # cargo shed + office
    K.hangar(b, -BLD_X - 260.0, -BLD_X, 330.0, 420.0, 14.0, 17.0, door_side="S", annex=False)
    W.obstacle(-BLD_X - 260, 330, -BLD_X, 420, 17.0)
    # multi-storey car park (open decks) landside
    for lvl in range(5):
        z = lvl * 3.2
        K.box(b, -200, 200, (580 + LAND_DY), (660 + LAND_DY), z, z + 0.45, mi("concrete"))
        for x in np.arange(-195, 200, 13.0):
            for y in ((582 + LAND_DY), (658 + LAND_DY)):
                K.box(b, x - 0.35, x + 0.35, y - 0.35, y + 0.35, z + 0.45, z + 3.2, mi("concrete"))
        K.box(b, -200, 200, (579.6 + LAND_DY), (580.2 + LAND_DY), z + 0.45, z + 1.5, mi("paint_white"))
        K.box(b, -200, 200, (659.8 + LAND_DY), (660.4 + LAND_DY), z + 0.45, z + 1.5, mi("paint_white"))
    K.box(b, -200, 200, (580 + LAND_DY), (660 + LAND_DY), 16.0, 16.45, mi("concrete"))
    W.obstacle(-200, (580 + LAND_DY), 200, (660 + LAND_DY), 16.5)
    # floodlight masts along the apron front and the GSE road
    for xm in np.arange(-420.0, 421.0, 140.0):
        K.flood_mast(b, xm, 404.0, 26.0, face=-math.pi / 2, lights=W.add_light, group="a2_apron_flood")
    # airside furniture
    K.windsock(b, 300.0, 95.0)
    K.windsock(b, -1100.0, -95.0, heading=2.4)
    K.ils_localizer(b, RWY_LEN / 2 + 300.0, 0.0)
    K.ils_localizer(b, -RWY_LEN / 2 - 300.0, 0.0, axis_ang=math.pi)
    for er in G.EXTRA_RWYS[AID]:
        for sx in (-1, 1):
            K.ils_localizer(b, er["cx"] + sx * (er["len"] / 2 + 300.0), er["cy"], axis_ang=0.0 if sx > 0 else math.pi)
        K.windsock(b, er["cx"] - er["len"] / 2 + 350, er["cy"] - 90)
        for c in OPS["runways"][1]["conns"]:
            K.taxi_sign(b, c["twy"][0] + 20, er["cy"] + 68, 0.0, er["names"][0] + "-" + er["names"][1], mat_bg="red_white")
    K.glideslope_mast(b, -RWY_LEN / 2 + 300.0, -120.0)
    K.glideslope_mast(b, RWY_LEN / 2 - 300.0, 120.0)
    for xc, name in zip(CONNS, (GL + "1", GL + "2", GL + "3")):
        K.taxi_sign(b, xc + 20, 60, 0.0, K09 + "-" + K27, mat_bg="red_white")
        K.taxi_sign(b, xc - 20, TWY_Y - 20, 0.0, name)
    K.taxi_sign(b, -440, TWY_Y + 25, 0.0, "APRON")
    fx0 = RWY_LEN / 2 + 400
    fy0 = min([-260.0] + [er["cy"] - 260 for er in G.EXTRA_RWYS[AID]])
    if AID != 2:                       # Kansai is an island: the sea wall is the fence
        K.fence(b, [(-30, 700), (-fx0, 700), (-fx0, fy0), (fx0, fy0), (fx0, 700), (30, 700)], step=5.0)
    b.build("A2_Buildings", K.kit_materials(M), col=col)


def build_landside(M, col):
    """Curbside roads, access road to the town, surface car parks with cars, bus / taxi shelters,
    median planting and street lights on the landside of the terminal."""
    mats = [M["road"], M["concrete"], M["white"], M["grass"], M["paint_white"], M["paint_grey"], M["dark"],
            M["red_white"], M["glass_dark"], M["steel"], M["crane"], M["yellow"], M["containers"]]
    R, CO, WH, GR, PW, PG, DK, RW, GD, ST, CR, YE, CT = range(len(mats))
    mb = C.MeshBuilder()
    mb.transform = lambda V: V + np.array([0.0, LAND_DY, 0.0])
    n_l0, n_t0 = len(W.LIGHTS.get("a2_street", {}).get("pos", [])), len(W.TREES)
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
    pos = W.LIGHTS["a2_street"]["pos"]
    for i in range(n_l0 + 2, len(pos), 3):
        pos[i] = round(pos[i] - LAND_DY, 2)
    for i in range(n_t0, len(W.TREES)):
        x, y, h, k = W.TREES[i]
        W.TREES[i] = (x, y + LAND_DY, h, k)


def build_local(M, col):
    """Regional touches around the terminal: Naha's palms and red-tiled entrance gate,
    snow-country windbreak conifers at New Chitose."""
    mats = R.lm_materials(M)
    mb = C.MeshBuilder()
    rng = np.random.default_rng(90 + AID)
    if AID == 4:
        for x in np.arange(-290.0, 291.0, 14.0):
            R.palm(mb, x + rng.normal(0, 1), 557 + LAND_DY, rng.uniform(8, 12), rng)
        for y in np.arange(700.0, 900.0, 16.0):
            for sx in (-1, 1):
                R.palm(mb, sx * 18 + rng.normal(0, 0.8), y + LAND_DY, rng.uniform(9, 13), rng)
        for k in range(260):
            x, y = rng.uniform(-2000, 2000), rng.uniform(760, 1300)
            R.palm(mb, x, y, rng.uniform(7, 12), rng)
        gx, gy = 0.0, 568.0 + LAND_DY
        for sx in (-1, 1):
            K.box(mb, gx + sx * 9 - 1, gx + sx * 9 + 1, gy - 1, gy + 1, 0, 6.5, R.li("lacquer"))
        R.hip_roof(mb, gx, gy, 6.5, 22, 5, 2.4, 1.5, R.li("tile_red"), 0.0, upturn=0.4)
    elif AID == 3:
        for k in range(900):
            x, y = rng.uniform(-3200, 3200), rng.uniform(1400, 1650)
            W.TREES.append((round(x, 1), round(y, 1), round(float(rng.uniform(10, 18)), 1), 0))
    mb.build("A2_Local", mats, col=col)


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
    build_local(M, col)
    landmarks = R.build_landmarks(AID, M, col, name="A2_Landmarks")
    data = dict(
        name="%s (%s)" % (AP["name"], AP["icao"]),
        frame="three.js local frame (x along the main runway, +y up, z = -Blender y), origin = runway centre; "
              "placed at the airport's world position (geo_data.js)",
        runway=dict(length=RWY_LEN, width=RWY_W, idents=["09", "27"], names=[K09, K27]),
        extraRunways=G.EXTRA_RWYS[AID],
        ops=R.ops_export(OPS),
        landmarks=landmarks,
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
