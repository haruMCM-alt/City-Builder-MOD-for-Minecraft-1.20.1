"""
Procedural airport + city for the flight simulator (Blender / bpy).

    python3 build_world.py [--quick]

World frame (Blender): +X east, +Y north, +Z up, metres.  Origin = runway centre.
The glTF export turns this into three.js (+x east, +y up, +z south).

Contents
  * "City Builder International" (RJCB): runway 09/27 3500 m x 60 m with full ICAO
    markings, parallel taxiway, rapid exits, apron, 14 contact stands with jet
    bridges, terminal + pier, control tower, maintenance hangars, cargo area,
    fuel farm, fire station, car park, hotel, ILS / PAPI / approach-light hardware.
  * a coastal city: downtown skyscrapers, mid/low rise districts, parks, streets,
    a river with road bridges and a cable-stayed landmark bridge, a 450 m
    broadcast tower, a container port with gantry cranes.
  * world.json: runway / ILS data, stands, lights (for the simulator's light
    renderer, incl. directional PAPI), flat-terrain zone, river and coastline.
"""
import json
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402

QUICK = "--quick" in sys.argv
RNG = np.random.default_rng(42)

RWY_LEN, RWY_W = 3500.0, 60.0
RWY_X0, RWY_X1 = -RWY_LEN / 2, RWY_LEN / 2
TWY_Y = 185.0
TWY_W = 23.0
APRON_Y0, APRON_Y1 = 215.0, 505.0
COAST_Y = -1400.0
RIVER_X, RIVER_W = 3000.0, 220.0
DOWNTOWN = (5600.0, 3000.0)
FLAT = dict(x0=-5200.0, x1=11200.0, y0=COAST_Y, y1=9800.0)
STAND_XS = [-520.0 + 80.0 * k for k in range(14)]
STAND_NOSE_Y = 488.0
APRON_LINKS = [-640.0, -240.0, 240.0, 640.0]   # apron taxilane <-> taxiway A
TAXILANE_Y = 262.0
PUSH_Y = 340.0                                 # push-back / departure taxilane
SERVICE_Y = 415.0                              # GSE service road behind the parked tails
GSE_DEPOTS = [(-690.0, 460.0), (690.0, 460.0)]  # ground-equipment parking at the apron ends
S_CG_FROM_NOSE = 31.85

LIGHTS = {}          # name -> dict(color, size, pos[], dir[] (optional), kind)


def add_light(group, pos, color=None, size=None, direction=None, kind="steady"):
    g = LIGHTS.setdefault(group, dict(color=color, size=size, kind=kind, pos=[], dir=[]))
    # store in three.js frame (x east, y up, z south)
    x, y, z = pos
    g["pos"].extend([round(x, 2), round(z, 2), round(-y, 2)])
    if direction is not None:
        dx, dy, dz = direction
        g["dir"].extend([round(dx, 3), round(dz, 3), round(-dy, 3)])


# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
def tex(n):
    p = os.path.join(C.TEX_DIR, n)
    return p if os.path.exists(p) else None


FACADES = {
    # name: (tile_w, tile_h)
    "facade_glass": (12.0, 16.0),
    "facade_glass2": (14.4, 16.0),
    "facade_office": (12.8, 14.4),
    "facade_resid": (14.0, 12.0),
    "facade_brick": (14.0, 12.8),
    "facade_concrete": (16.0, 14.0),
    "facade_terminal": (24.0, 9.0),
}


def materials():
    M = {}
    M["asphalt"] = C.pbr_material("W_Asphalt", roughness=0.9, base_tex=tex("asphalt.jpg"))
    M["shoulder"] = C.pbr_material("W_Shoulder", roughness=0.9, base_tex=tex("asphalt_light.jpg"))
    M["taxi"] = C.pbr_material("W_TaxiAsphalt", roughness=0.88, base_tex=tex("asphalt_taxi.jpg"))
    M["concrete"] = C.pbr_material("W_Concrete", roughness=0.85, base_tex=tex("concrete.jpg"))
    M["road"] = C.pbr_material("W_Road", roughness=0.9, base_tex=tex("road.jpg"))
    M["white"] = C.pbr_material("W_MarkWhite", color=C.hex_color("#e9ebe8"), roughness=0.7)
    M["yellow"] = C.pbr_material("W_MarkYellow", color=C.hex_color("#f0b81e"), roughness=0.7)
    M["roof"] = C.pbr_material("W_Roof", roughness=0.9, base_tex=tex("roof.jpg"))
    M["metal"] = C.pbr_material("W_MetalPanel", roughness=0.55, metallic=0.3, base_tex=tex("metal_panel.jpg"))
    M["hangar_door"] = C.pbr_material("W_HangarDoor", roughness=0.5, metallic=0.3, base_tex=tex("hangar_door.jpg"))
    M["containers"] = C.pbr_material("W_Containers", roughness=0.7, metallic=0.2, base_tex=tex("containers.jpg"))
    M["paint_white"] = C.pbr_material("W_PaintWhite", color=C.hex_color("#e8eaec"), roughness=0.5)
    M["paint_grey"] = C.pbr_material("W_PaintGrey", color=C.hex_color("#8d9399"), roughness=0.6)
    M["dark"] = C.pbr_material("W_Dark", color=C.hex_color("#23272b"), roughness=0.6)
    M["steel"] = C.pbr_material("W_Steel", color=C.hex_color("#c7ccd1"), roughness=0.35, metallic=0.9)
    M["crane"] = C.pbr_material("W_CraneRed", color=C.hex_color("#c9412e"), roughness=0.5, metallic=0.2)
    M["bridge"] = C.pbr_material("W_BridgeWhite", color=C.hex_color("#f1f2ee"), roughness=0.45)
    M["glass_dark"] = C.pbr_material("W_GlassDark", color=C.hex_color("#1e2a33"), roughness=0.05, metallic=0.7)
    M["glass_tower"] = C.pbr_material("W_GlassTower", color=C.hex_color("#3d6b7e"), roughness=0.04,
                                      metallic=0.8, emission=(0.6, 0.8, 1.0, 1), emission_strength=0.0)
    M["leaf"] = C.pbr_material("W_Leaf", color=C.hex_color("#3f6b2f"), roughness=0.85)
    M["leaf2"] = C.pbr_material("W_Leaf2", color=C.hex_color("#2f5a2d"), roughness=0.85)
    M["trunk"] = C.pbr_material("W_Trunk", color=C.hex_color("#5b4633"), roughness=0.9)
    M["grass"] = C.pbr_material("W_ParkGrass", color=C.hex_color("#4f7a37"), roughness=0.95)
    M["red_white"] = C.pbr_material("W_TowerOrange", color=C.hex_color("#e2572b"), roughness=0.5)
    M["tank"] = C.pbr_material("W_Tank", color=C.hex_color("#f0f0ec"), roughness=0.4, metallic=0.4)
    M["papi"] = C.pbr_material("W_PAPIBox", color=C.hex_color("#d9d7c6"), roughness=0.6)
    M["sign"] = C.pbr_material("W_Sign", color=C.hex_color("#111111"), roughness=0.5,
                               emission=(1, 0.85, 0.1, 1), emission_strength=0.0)
    for name, (tw, th) in FACADES.items():
        M[name] = C.pbr_material("W_" + name, roughness=0.5, base_tex=tex(name + ".jpg"),
                                 orm_tex=tex(name + "_orm.jpg"), emissive_tex=tex(name + "_em.jpg"),
                                 emission_strength=1.0)
    return M


# ---------------------------------------------------------------------------
# geometry helpers (all in world coordinates)
# ---------------------------------------------------------------------------
UP = (0, 0, 1)


def rect(mb, cx, cy, L, W, ang, z, mat, uv=("world", 25.0), u_len=None):
    """Horizontal rectangle, length L along angle ang (rad), width W."""
    ca, sa = math.cos(ang), math.sin(ang)
    hx, hy = L / 2, W / 2
    pts = []
    for (a, b) in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy)):
        pts.append((cx + a * ca - b * sa, cy + a * sa + b * ca, z))
    if uv[0] == "world":
        t = uv[1]
        uvs = [(p[0] / t, p[1] / t) for p in pts]
    else:  # road-style: u along, v across
        tl, tw = uv[1], uv[2]
        uvs = [(-hx / tl, 0), (hx / tl, 0), (hx / tl, 1.0 * W / tw), (-hx / tl, 1.0 * W / tw)]
    mb.add_poly(pts, uvs, mat=mat, normal=UP)


OBST = []      # collision boxes for the simulator: (x0, y0, x1, y1, top) in Blender x / y, metres


def obstacle(x0, y0, x1, y1, h):
    OBST.append((min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1), h))


def box(mb, x0, y0, x1, y1, z0, z1, wall_mat, roof_mat=None, tile=(10, 10), uoff=0.0, top=True, bottom=False):
    """Axis aligned box, walls with facade UV (u along wall / tile_w, v height / tile_h)."""
    if z0 < 2.0 and z1 - z0 > 4.0:
        obstacle(x0, y0, x1, y1, z1)
    tw, th = tile
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    u = uoff
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        pts = [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)]
        uvs = [(u, z0 / th), (u + L / tw, z0 / th), (u + L / tw, z1 / th), (u, z1 / th)]
        nx, ny = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
        mb.add_poly(pts, uvs, mat=wall_mat, normal=(nx, ny, 0))
        u += L / tw
    if top:
        rm = wall_mat if roof_mat is None else roof_mat
        pts = [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]
        mb.add_poly(pts, [(p[0] / 20, p[1] / 20) for p in pts], mat=rm, normal=UP)
    if bottom:
        pts = [(x0, y0, z0), (x0, y1, z0), (x1, y1, z0), (x1, y0, z0)]
        mb.add_poly(pts, [(p[0] / 20, p[1] / 20) for p in pts], mat=wall_mat if roof_mat is None else roof_mat,
                    normal=(0, 0, -1))


def obox(mb, cx, cy, L, W, ang, z0, z1, wall_mat, roof_mat=None, tile=(10, 10), top=True):
    """Oriented box (rotated about Z)."""
    ca, sa = math.cos(ang), math.sin(ang)
    hx, hy = L / 2, W / 2
    corners = [(cx + a * ca - b * sa, cy + a * sa + b * ca) for (a, b) in ((-hx, -hy), (hx, -hy), (hx, hy), (-hx, hy))]
    tw, th = tile
    u = 0
    for i in range(4):
        a = corners[i]
        b = corners[(i + 1) % 4]
        Ls = math.hypot(b[0] - a[0], b[1] - a[1])
        pts = [(a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1)]
        uvs = [(u, z0 / th), (u + Ls / tw, z0 / th), (u + Ls / tw, z1 / th), (u, z1 / th)]
        mb.add_poly(pts, uvs, mat=wall_mat, normal=((b[1] - a[1]) / Ls, -(b[0] - a[0]) / Ls, 0))
        u += Ls / tw
    if top:
        pts = [(c[0], c[1], z1) for c in corners]
        mb.add_poly(pts, [(p[0] / 20, p[1] / 20) for p in pts], mat=wall_mat if roof_mat is None else roof_mat,
                    normal=UP)


def cylinder(mb, cx, cy, r0, r1, z0, z1, mat, n=24, tile=(10, 10), top_mat=None, top=True, cap_z=None):
    th = np.linspace(0, 2 * math.pi, n + 1)
    tw, thh = tile
    circ = 2 * math.pi * max(r0, r1)
    P = np.zeros((2, n + 1, 3))
    UV = np.zeros((2, n + 1, 2))
    for k, (r, z) in enumerate(((r0, z0), (r1, z1))):
        P[k, :, 0] = cx + r * np.cos(th)
        P[k, :, 1] = cy + r * np.sin(th)
        P[k, :, 2] = z
        UV[k, :, 0] = th / (2 * math.pi) * circ / tw
        UV[k, :, 1] = z / thh
    slope = (r0 - r1) / max(z1 - z0, 1e-6)
    N = np.stack([np.cos(th), np.sin(th), np.full_like(th, slope)], -1)
    N /= np.linalg.norm(N, axis=-1, keepdims=True)
    mb.add_grid(P, UV, N=np.stack([N, N]), mat=mat)
    if top and r1 > 0.01:
        pts = [(cx + r1 * math.cos(a), cy + r1 * math.sin(a), z1) for a in th[:-1]]
        mb.add_poly(pts, [(p[0] / 20, p[1] / 20) for p in pts], mat=mat if top_mat is None else top_mat, normal=UP)


def beam(mb, p0, p1, w, h, mat):
    """Box beam between two points (w horizontal, h vertical-ish)."""
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    ax = p1 - p0
    L = np.linalg.norm(ax)
    ax /= L
    up = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.95 else np.array([1.0, 0, 0])
    side = np.cross(ax, up)
    side /= np.linalg.norm(side)
    upv = np.cross(side, ax)
    hw, hh = w / 2, h / 2
    offs = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    ring0 = [p0 + side * a + upv * b for a, b in offs]
    ring1 = [p1 + side * a + upv * b for a, b in offs]
    for i in range(4):
        j = (i + 1) % 4
        nrm = side * (offs[i][0] + offs[j][0]) + upv * (offs[i][1] + offs[j][1])
        mb.add_poly([ring0[i], ring0[j], ring1[j], ring1[i]], [(0, 0), (1, 0), (1, L / 5), (0, L / 5)], mat=mat,
                    normal=nrm)
    mb.add_poly(ring0[::-1], mat=mat, normal=-ax)
    mb.add_poly(ring1, mat=mat, normal=ax)


def text_mesh(mb, text, x, y, z, size, rot_z, mat, extrude=0.0, align="CENTER"):
    """Blender font -> mesh, merged into builder (flat on the ground if extrude==0)."""
    cu = bpy.data.curves.new("txt", type="FONT")
    cu.body = text
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.fill_mode = "BOTH" if extrude else "FRONT"
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    V = np.array([v.co[:] for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    if len(V) == 0:
        return
    c, s = math.cos(rot_z), math.sin(rot_z)
    W = np.stack([x + V[:, 0] * c - V[:, 1] * s, y + V[:, 0] * s + V[:, 1] * c, z + V[:, 2]], -1)
    mb.add_mesh(W, F, mat=mat, smooth=False)


def vertical_text(mb, text, x, y, z, size, facing, mat, extrude=0.3):
    """Upright letters on a facade. facing = outward normal angle (rad, 0 = +X)."""
    cu = bpy.data.curves.new("txt", type="FONT")
    cu.body = text
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = extrude
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    V = np.array([v.co[:] for v in me.vertices])
    F = [list(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bpy.data.meshes.remove(me)
    # text local: X right, Y up, Z out  ->  world: right = facing+90deg, up = Z, out = facing
    fx, fy = math.cos(facing), math.sin(facing)
    rx, ry = math.cos(facing + math.pi / 2), math.sin(facing + math.pi / 2)
    W = np.stack([x + V[:, 0] * rx + V[:, 2] * fx, y + V[:, 0] * ry + V[:, 2] * fy, z + V[:, 1]], -1)
    mb.add_mesh(W, F, mat=mat, smooth=False)


# ---------------------------------------------------------------------------
# Airport surfaces and markings
# ---------------------------------------------------------------------------
def build_airfield(M, col):
    pav = C.MeshBuilder()
    mk = C.MeshBuilder()
    Z_PAV, Z_MK = 0.06, 0.10
    # runway + shoulders + blast pads
    rect(pav, 0, 0, RWY_LEN, RWY_W, 0, Z_PAV, 0, ("world", 25.0))
    for sy in (-1, 1):
        rect(pav, 0, sy * (RWY_W / 2 + 3.75), RWY_LEN + 120, 7.5, 0, Z_PAV - 0.01, 1)
    for sx in (-1, 1):
        rect(pav, sx * (RWY_LEN / 2 + 60), 0, 120, RWY_W, 0, Z_PAV - 0.01, 1)
        # yellow chevrons on blast pads
        for k in range(3):
            xc = sx * (RWY_LEN / 2 + 25 + k * 30)
            for sy in (-1, 1):
                ang = math.radians(35) * sy * sx
                rect(mk, xc + sx * 8, sy * 13, 34, 1.2, ang, Z_MK, 1)
    # parallel taxiway A + connectors
    rect(pav, 0, TWY_Y, RWY_LEN + 60, TWY_W, 0, Z_PAV, 2)
    conns = [RWY_X0 + 25, -950.0, -80.0, 700.0, RWY_X1 - 25]
    for xc in conns:
        rect(pav, xc, (TWY_Y + RWY_W / 2) / 2, TWY_W, TWY_Y - RWY_W / 2 + 2, 0, Z_PAV - 0.005, 2)
        # fillets
        for sx in (-1, 1):
            for yy in (RWY_W / 2 + 6, TWY_Y - 12):
                rect(pav, xc + sx * (TWY_W / 2 + 4), yy, 10, 12, 0, Z_PAV - 0.006, 2)
    # rapid exit taxiways (angled 30 deg) for both directions
    for (x_start, direction) in ((350.0, -1), (-450.0, 1)):
        ang = math.radians(30) * (1 if direction < 0 else -1)
        L = (TWY_Y - RWY_W / 2) / math.sin(math.radians(30))
        cx = x_start + direction * (L / 2) * math.cos(math.radians(30)) * -1
        rect(pav, cx, (TWY_Y + RWY_W / 2) / 2, L + 20, TWY_W, math.pi - ang if direction < 0 else ang, Z_PAV - 0.004, 2)
    # apron (concrete)
    rect(pav, 0, (APRON_Y0 + APRON_Y1) / 2, 1500, APRON_Y1 - APRON_Y0, 0, Z_PAV + 0.002, 3)
    # apron links between taxiway A and the apron taxilane
    for xl in APRON_LINKS:
        rect(pav, xl, (TWY_Y + APRON_Y0) / 2 + 2, TWY_W + 4, APRON_Y0 - TWY_Y + 8, 0, Z_PAV - 0.003, 2)
        for sx in (-1, 1):
            rect(pav, xl + sx * (TWY_W / 2 + 7), APRON_Y0 - 5, 14, 12, 0, Z_PAV - 0.004, 2)
            rect(pav, xl + sx * (TWY_W / 2 + 7), TWY_Y + TWY_W / 2 + 5, 14, 12, 0, Z_PAV - 0.004, 2)
    rect(pav, 1150, 330, 700, 240, 0, Z_PAV + 0.002, 3)       # maintenance apron
    rect(pav, -1150, 330, 700, 240, 0, Z_PAV + 0.002, 3)      # cargo apron
    # --- runway markings (white) ------------------------------------------------
    for sx in (-1, 1):          # sx=+1: east end (rwy 27 threshold)
        thr = sx * RWY_LEN / 2
        inward = -sx
        # piano keys: 16 stripes, 30 m long, 1.8 m wide
        for i in range(8):
            for sy in (-1, 1):
                yy = sy * (3.0 + 1.8 / 2 + i * 3.6)
                rect(mk, thr + inward * (6 + 15), yy, 30, 1.8, 0, Z_MK, 0)
        # threshold bar
        rect(mk, thr + inward * 1.0, 0, 1.8, RWY_W - 2, 0, Z_MK, 0)
        # designator
        txt = "27" if sx > 0 else "09"
        rot = math.pi / 2 if sx > 0 else -math.pi / 2
        text_mesh(mk, txt, thr + inward * 62, 0, Z_MK, 16.0, rot, 0)
        # aiming point (400 m) and touchdown zone pairs
        for sy in (-1, 1):
            rect(mk, thr + inward * (400 + 30), sy * 11.0, 60, 10, 0, Z_MK, 0)
            for d, n in ((150, 3), (300, 3), (600, 2), (750, 2), (900, 1)):
                for k in range(n):
                    rect(mk, thr + inward * (d + 11), sy * (4.5 + 1.8 / 2 + k * 3.3), 22.5, 1.8, 0, Z_MK, 0)
    # centreline 30 m stripes / 20 m gaps
    x = RWY_X0 + 90
    while x < RWY_X1 - 90:
        rect(mk, x + 15, 0, 30, 0.9, 0, Z_MK, 0)
        x += 50
    # edge lines
    for sy in (-1, 1):
        rect(mk, 0, sy * (RWY_W / 2 - 0.9), RWY_LEN, 0.9, 0, Z_MK, 0)
    # --- taxiway markings (yellow) ------------------------------------------------
    rect(mk, 0, TWY_Y, RWY_LEN + 40, 0.3, 0, Z_MK, 1)
    for xc in conns:
        rect(mk, xc, (TWY_Y + RWY_W / 2) / 2, 0.3, TWY_Y - RWY_W / 2, 0, Z_MK, 1)
        # holding position (2 solid + 2 dashed) 90 m from runway centre
        for k in range(2):
            rect(mk, xc, 88 + k * 0.9, TWY_W, 0.3, 0, Z_MK, 1)
        for k in range(2):
            for d in range(-5, 6):
                rect(mk, xc + d * 2.1, 90.8 + k * 0.9, 1.0, 0.3, 0, Z_MK, 1)
    for x_start, direction in ((350.0, -1), (-450.0, 1)):
        pass
    # apron taxilane + stand lead-in lines + stop bars + stand numbers
    rect(mk, 0, 262, 1480, 0.3, 0, Z_MK, 1)
    for xl in APRON_LINKS:
        rect(mk, xl, (TWY_Y + TAXILANE_Y) / 2, 0.3, TAXILANE_Y - TWY_Y, 0, Z_MK, 1)
    # inner push-back lane in front of the stands (departures taxi out along it)
    rect(mk, 0, PUSH_Y, 1480, 0.3, 0, Z_MK, 1)
    for xl in APRON_LINKS:
        rect(mk, xl, (TAXILANE_Y + PUSH_Y) / 2, 0.3, PUSH_Y - TAXILANE_Y, 0, Z_MK, 1)
    # GSE service road (white edge lines, dashed centre) and equipment parking boxes
    for sy in (-6.0, 6.0):
        rect(mk, 0, SERVICE_Y + sy, 1480, 0.2, 0, Z_MK, 0)
    xx = -735.0
    while xx < 735.0:
        rect(mk, xx + 1.5, SERVICE_Y, 3.0, 0.15, 0, Z_MK, 0)
        xx += 6.0
    for (dx, dy) in GSE_DEPOTS:
        for k in range(9):
            rect(mk, dx - 40 + k * 10, dy, 0.15, 60, 0, Z_MK, 0)
        for sy in (-30.0, 30.0):
            rect(mk, dx, dy + sy, 80, 0.15, 0, Z_MK, 0)
    for k, xs in enumerate(STAND_XS):
        rect(mk, xs, (262 + STAND_NOSE_Y) / 2, 0.3, STAND_NOSE_Y - 262, 0, Z_MK, 1)
        rect(mk, xs, STAND_NOSE_Y - 1.0, 8, 0.6, 0, Z_MK, 1)
        # red safety line (use white here) around the stand envelope
        for sx in (-1, 1):
            rect(mk, xs + sx * 38, (275 + APRON_Y1) / 2, 0.25, APRON_Y1 - 275, 0, Z_MK, 0)
        text_mesh(mk, str(k + 1), xs + 12, 300, Z_MK, 7.0, 0.0, 1)
    ob = pav.build("Airfield_Pavement", [M["asphalt"], M["shoulder"], M["taxi"], M["concrete"]], col=col)
    ob2 = mk.build("Airfield_Markings", [M["white"], M["yellow"]], col=col)
    return conns


# ---------------------------------------------------------------------------
# Airfield lighting (exported as data) + physical fixtures
# ---------------------------------------------------------------------------
def build_airfield_lights(M, col, conns):
    fx = C.MeshBuilder()
    # runway edge lights (every 60 m, bidirectional white)
    x = RWY_X0
    while x <= RWY_X1 + 0.1:
        for sy in (-1, 1):
            add_light("rwy_edge", (x, sy * (RWY_W / 2 + 1.0), 0.4), "#fff6dc", 1.6)
            box(fx, x - 0.15, sy * (RWY_W / 2 + 1.0) - 0.15, x + 0.15, sy * (RWY_W / 2 + 1.0) + 0.15, 0, 0.35,
                0, top=True)
        x += 60
    # centreline lights (15 m) - colour coded per direction
    x = RWY_X0 + 7.5
    while x < RWY_X1:
        for d in (-1, 1):               # d=-1: landing westward (rwy 27), remaining = x - x0
            remaining = (x - RWY_X0) if d < 0 else (RWY_X1 - x)
            if remaining < 300:
                c = "#ff2a1a"
            elif remaining < 900:
                c = "#ff2a1a" if int(x / 15) % 2 else "#fff4d6"
            else:
                c = "#fff4d6"
            add_light("rwy_cl_" + ("27" if d < 0 else "09"), (x, 0.0, 0.12), c, 1.1, direction=(-d, 0, 0.05),
                      kind="directional")
        x += 15
    # threshold (green, facing approach) and runway end (red, facing runway)
    for sx in (-1, 1):
        thr = sx * RWY_LEN / 2
        for k in range(-10, 11):
            yy = k * 2.9
            add_light("rwy_threshold", (thr + sx * 1.5, yy, 0.3), "#34ff5a", 1.4, direction=(sx, 0, 0.1),
                      kind="directional")
            add_light("rwy_end", (thr + sx * 0.5, yy, 0.3), "#ff2a1a", 1.4, direction=(-sx, 0, 0.1),
                      kind="directional")
        # wing bars
        for sy in (-1, 1):
            for k in range(5):
                add_light("rwy_threshold", (thr + sx * 1.5, sy * (RWY_W / 2 + 3 + k * 3), 0.3), "#34ff5a", 1.4,
                          direction=(sx, 0, 0.1), kind="directional")
        # approach lighting system: 900 m, bars every 30 m, crossbar at 300 m
        for k in range(1, 31):
            d = k * 30.0
            xx = thr + sx * d
            for j in range(-2, 3):
                add_light("als", (xx, j * 1.0, 0.8 + d * 0.004), "#fff2d0", 1.8, direction=(sx, 0, 0.12),
                          kind="directional")
            beam(fx, (xx, 0, 0), (xx, 0, 0.7 + d * 0.004), 0.12, 0.12, 1)
            beam(fx, (xx, -2.3, 0.75 + d * 0.004), (xx, 2.3, 0.75 + d * 0.004), 0.1, 0.1, 1)
            if k >= 11:
                add_light("als_flash", (xx, 0, 1.2 + d * 0.004), "#ffffff", 3.0, direction=(sx, 0, 0.12),
                          kind="sequenced")
            if k == 10:
                for j in list(range(-11, -3)) + list(range(4, 12)):
                    add_light("als", (xx, j * 1.5, 0.8), "#fff2d0", 1.8, direction=(sx, 0, 0.12), kind="directional")
                beam(fx, (xx, -17, 0.75), (xx, 17, 0.75), 0.1, 0.1, 1)
        # PAPI (left of the landing direction, 300 m in)
        left_y = -1 if sx > 0 else 1       # rwy 27 (land westward): left = south
        px = thr - sx * 300
        for i in range(4):
            yy = left_y * (RWY_W / 2 + 15 + i * 9)
            ang = [3.5, 3.1667, 2.8333, 2.5][i]      # inner unit highest
            add_light("papi_" + ("27" if sx > 0 else "09"), (px, yy, 0.9), "#ffffff", 3.2,
                      direction=(sx, 0, math.tan(math.radians(ang))), kind="papi")
            box(fx, px - 0.6, yy - 1.0, px + 0.6, yy + 1.0, 0.0, 1.0, 2)
            box(fx, px + sx * 0.6 - 0.05, yy - 0.8, px + sx * 0.6 + 0.05, yy + 0.8, 0.5, 0.95, 3)
    # taxiway edge (blue) & centre (green)
    x = RWY_X0 - 20
    while x <= RWY_X1 + 20:
        for sy in (-1, 1):
            add_light("twy_edge", (x, TWY_Y + sy * (TWY_W / 2 + 1), 0.35), "#3a64ff", 1.0)
        add_light("twy_cl", (x, TWY_Y, 0.1), "#28ff6a", 0.8)
        x += 30
    for xc in conns:
        yy = RWY_W / 2 + 10
        while yy < TWY_Y - 10:
            for sx in (-1, 1):
                add_light("twy_edge", (xc + sx * (TWY_W / 2 + 1), yy, 0.35), "#3a64ff", 1.0)
            add_light("twy_cl", (xc, yy, 0.1), "#28ff6a", 0.8)
            yy += 15
        # stop bar (red) at the holding point
        for d in range(-5, 6):
            add_light("stopbar", (xc + d * 2.0, 86, 0.2), "#ff2020", 0.9)
    for xl in APRON_LINKS:
        yy = TWY_Y + 15
        while yy < TAXILANE_Y:
            add_light("twy_cl", (xl, yy, 0.1), "#28ff6a", 0.8)
            yy += 15
    # apron flood light masts
    for xm in range(-700, 701, 140):
        beam(fx, (xm, APRON_Y1 - 5, 0), (xm, APRON_Y1 - 5, 30), 0.8, 0.8, 1)
        box(fx, xm - 3, APRON_Y1 - 6, xm + 3, APRON_Y1 - 4, 30, 31.5, 1)
        for k in range(-2, 3):
            add_light("apron_flood", (xm + k * 1.2, APRON_Y1 - 6.5, 30.5), "#ffe6b8", 6.0)
    # ILS hardware: localizer arrays beyond each runway end, glideslope masts
    for sx in (-1, 1):
        xl = -sx * (RWY_LEN / 2 + 300)       # localizer for rwy (sx) is at the far end
        for k in range(-12, 13):
            beam(fx, (xl, k * 2.4, 0), (xl, k * 2.4, 2.8), 0.12, 0.12, 1)
        beam(fx, (xl, -29, 2.8), (xl, 29, 2.8), 0.15, 0.15, 1)
        gx = sx * (RWY_LEN / 2 - 300)
        gy = 130 * (1 if sx > 0 else -1) * -1
        beam(fx, (gx, gy, 0), (gx, gy, 14), 0.4, 0.4, 3)
        box(fx, gx - 2, gy - 1.5, gx + 2, gy + 1.5, 0, 2.6, 0)
        add_light("obstruction", (gx, gy, 14.3), "#ff1a1a", 1.8)
    fx.build("Airfield_Fixtures", [M["paint_white"], M["paint_grey"], M["papi"], M["dark"]], col=col)


# ---------------------------------------------------------------------------
# Terminal, jet bridges, tower, hangars ...
# ---------------------------------------------------------------------------
def wave_roof(mb, x0, x1, y0, y1, z_base, amp, mat, n=40, waves=3.0):
    xs = np.linspace(x0, x1, n)
    ys = np.linspace(y0, y1, 12)
    X, Y = np.meshgrid(xs, ys, indexing="ij")
    Zr = z_base + amp * (0.6 + 0.4 * np.sin((X - x0) / (x1 - x0) * math.pi * waves)) \
        * np.sin((Y - y0) / (y1 - y0) * math.pi) ** 0.5
    P = np.stack([X, Y, Zr], -1)
    UV = np.stack([X / 20, Y / 20], -1)
    mb.add_grid(P, UV, outward=("dir", (0, 0, 1)), mat=mat)
    # underside (visible from the apron)
    Pb = P.copy()
    Pb[..., 2] -= 0.6
    mb.add_grid(Pb, UV, outward=("dir", (0, 0, -1)), mat=mat)
    # fascia strips
    for j in (0, -1):
        strip = np.stack([P[:, j], Pb[:, j]], 1)
        mb.add_grid(strip, outward=("dir", (0, 1 if j else -1, 0)), mat=mat, smooth=False)


def build_terminal(M, col):
    tb = C.MeshBuilder()
    mats = [M["facade_terminal"], M["roof"], M["paint_white"], M["steel"], M["dark"], M["concrete"],
            M["glass_dark"], M["sign"], M["facade_office"]]
    tile = FACADES["facade_terminal"]
    # pier (airside)
    box(tb, -640, 505, 640, 548, 0, 17, 0, 1, tile)
    wave_roof(tb, -660, 660, 498, 556, 17.2, 3.5, 2, n=90, waves=7)
    # main hall
    box(tb, -260, 548, 260, 690, 0, 28, 0, 1, tile)
    wave_roof(tb, -285, 285, 540, 710, 28.2, 9.0, 2, n=60, waves=2)
    # departures curb / canopy on the landside
    box(tb, -300, 700, 300, 712, 9.0, 10.0, 2)
    for xc in range(-280, 281, 40):
        beam(tb, (xc, 706, 0), (xc, 706, 9.0), 0.6, 0.6, 3)
    # elevated departure road
    box(tb, -330, 712, 330, 735, 8.2, 9.0, 5)
    for xc in range(-320, 321, 40):
        beam(tb, (xc, 723, 0), (xc, 723, 8.2), 1.6, 1.6, 5)
    # airport name on the pier roof fascia (facing the runway) and landside
    vertical_text(tb, "CITY BUILDER INTERNATIONAL AIRPORT", 0, 504.5, 13.0, 4.2, -math.pi / 2, 7, extrude=0.4)
    vertical_text(tb, "シティビルダー国際空港", 0, 690.5, 20.0, 5.0, math.pi / 2, 7, extrude=0.4)
    # jet bridges (one per stand, to door L1 of a nose-in 787)
    stands = []
    for k, xs in enumerate(STAND_XS):
        door = (xs - 2.95, STAND_NOSE_Y - 6.95)
        rot = (xs - 14.0, 520.0)
        # rotunda + column
        cylinder(tb, rot[0], rot[1], 2.4, 2.4, 3.2, 7.4, 0, n=16, tile=(8, 9), top_mat=1)
        cylinder(tb, rot[0], rot[1], 0.7, 0.7, 0, 3.2, 3, n=10)
        # tunnel (two telescopic sections)
        cab = (door[0] - 2.6, door[1])
        dx, dy = cab[0] - rot[0], cab[1] - rot[1]
        L = math.hypot(dx, dy)
        ang = math.atan2(dy, dx)
        z_door = 5.25 - 0.93
        z0 = 5.3
        for (t0, t1, w, h) in ((0.0, 0.55, 3.4, 3.2), (0.5, 1.0, 3.1, 2.9)):
            cx = rot[0] + dx * (t0 + t1) / 2
            cy = rot[1] + dy * (t0 + t1) / 2
            zz = z0 + (z_door - 0.3 - z0) * (t0 + t1) / 2
            obox(tb, cx, cy, L * (t1 - t0), w, ang, zz, zz + h, 0, 1, tile=(12, 9))
        # cab + drive column
        obox(tb, cab[0], cab[1], 4.0, 4.4, ang, z_door - 0.4, z_door + 2.6, 2, 1)
        col_x = rot[0] + dx * 0.72
        col_y = rot[1] + dy * 0.72
        beam(tb, (col_x, col_y, 0.6), (col_x, col_y, z0 + 0.4), 0.5, 0.5, 3)
        box(tb, col_x - 1.6, col_y - 0.6, col_x + 1.6, col_y + 0.6, 0, 0.9, 4)
        # gate number sign on the pier
        vertical_text(tb, str(k + 1), xs, 504.6, 7.5, 3.2, -math.pi / 2, 7, extrude=0.2)
        stands.append(dict(id=k + 1, x=xs, noseY=STAND_NOSE_Y, heading=0.0,
                           cg=[xs, 0.0, -(STAND_NOSE_Y - S_CG_FROM_NOSE)]))
    tb.build("Terminal", mats, col=col)
    return stands


def build_tower(M, col):
    tb = C.MeshBuilder()
    x, y = 830.0, 640.0
    box(tb, x - 25, y - 15, x + 25, y + 15, 0, 12, 0, 1, FACADES["facade_office"])
    cylinder(tb, x, y, 7.5, 5.5, 12, 82, 2, n=32, tile=(6, 6))
    for zz in range(20, 80, 12):
        cylinder(tb, x, y, 7.3, 7.3, zz, zz + 0.6, 3, n=32)
    cylinder(tb, x, y, 6.5, 11.5, 82, 88, 2, n=8)
    # cab glass (octagonal, outward-leaning)
    cylinder(tb, x, y, 11.5, 12.5, 88, 94, 4, n=8)
    cylinder(tb, x, y, 12.5, 12.8, 94, 95.5, 2, n=8, top_mat=1)
    cylinder(tb, x, y, 6.0, 5.5, 95.5, 99, 2, n=8, top_mat=1)
    beam(tb, (x, y, 99), (x, y, 112), 0.5, 0.5, 3)
    tb.build("ControlTower", [M["facade_office"], M["roof"], M["paint_white"], M["steel"], M["glass_tower"]], col=col)
    add_light("obstruction", (x, y, 112.5), "#ff1a1a", 3.0, kind="blink")
    return dict(x=x, y=y, h=91.0)


def barrel_hangar(mb, x0, x1, y0, y1, h_wall, h_top, wall, roof, door):
    n = 24
    xs = np.linspace(x0, x1, n)
    zs = h_wall + (h_top - h_wall) * np.sin((xs - x0) / (x1 - x0) * math.pi)
    P = np.zeros((n, 2, 3))
    for i in range(n):
        P[i, 0] = (xs[i], y0, zs[i])
        P[i, 1] = (xs[i], y1, zs[i])
    mb.add_grid(P, np.stack([P[..., 0] / 10, P[..., 1] / 10], -1), outward=("dir", (0, 0, 1)), mat=roof)
    # gable walls
    for (yy, nrm, m) in ((y0, -1, door), (y1, 1, wall)):
        pts = [(x0, yy, 0)] + [(xs[i], yy, zs[i]) for i in range(n)] + [(x1, yy, 0)]
        uvs = [(p[0] / 12, p[2] / 12) for p in pts]
        mb.add_poly(pts, uvs, mat=m, normal=(0, nrm, 0))
    for (xx, nrm) in ((x0, -1), (x1, 1)):
        pts = [(xx, y0, 0), (xx, y1, 0), (xx, y1, h_wall), (xx, y0, h_wall)]
        mb.add_poly(pts, [(p[1] / 12, p[2] / 12) for p in pts], mat=wall, normal=(nrm, 0, 0))


def build_airport_buildings(M, col):
    b = C.MeshBuilder()
    mats = [M["metal"], M["roof"], M["hangar_door"], M["paint_white"], M["tank"], M["facade_office"],
            M["facade_concrete"], M["facade_glass"], M["red_white"], M["dark"], M["steel"]]
    # maintenance hangars
    for (x0, x1) in ((880, 1060), (1080, 1260)):
        barrel_hangar(b, x0, x1, 330, 470, 26, 38, 0, 1, 2)
        vertical_text(b, "CITY BUILDER", (x0 + x1) / 2, 329.4, 31, 7, -math.pi / 2, 8, extrude=0.3)
    box(b, 1280, 360, 1420, 460, 0, 14, 5, 1, FACADES["facade_office"])        # engineering office
    # cargo terminal
    box(b, -1420, 330, -900, 450, 0, 16, 0, 1, (12, 12))
    box(b, -1420, 450, -1300, 520, 0, 22, 5, 1, FACADES["facade_office"])
    # fuel farm
    for i in range(3):
        for j in range(2):
            cylinder(b, -1100 + i * 42, 640 + j * 42, 16, 16, 0, 17, 4, n=32, tile=(10, 10))
    box(b, -1180, 590, -980, 592, 0, 2.5, 9)
    # fire station (south side, midfield)
    box(b, 180, -300, 260, -260, 0, 9, 3, 1, (10, 10))
    box(b, 245, -265, 260, -250, 0, 22, 8, 1)
    # car park + hotel + offices (landside)
    box(b, -240, 760, 240, 850, 0, 18, 6, 1, FACADES["facade_concrete"])
    box(b, 330, 760, 400, 830, 0, 72, 7, 1, FACADES["facade_glass"])
    box(b, -420, 760, -320, 840, 0, 36, 5, 1, FACADES["facade_office"])
    add_light("obstruction", (365, 795, 72.5), "#ff1a1a", 2.0, kind="blink")
    # (apron ground vehicles are separate, animated models: build_gse.py)
    b.build("AirportBuildings", mats, col=col)


# ---------------------------------------------------------------------------
# City
# ---------------------------------------------------------------------------
STYLE_ORDER = ["facade_glass", "facade_glass2", "facade_office", "facade_resid", "facade_brick", "facade_concrete"]


class Chunks:
    """Spatial chunking so the simulator can frustum-cull the city."""

    def __init__(self, size=2500.0):
        self.size = size
        self.b = {}

    def get(self, x, y):
        k = (int(math.floor(x / self.size)), int(math.floor(y / self.size)))
        if k not in self.b:
            self.b[k] = C.MeshBuilder()
        return self.b[k]


def in_airport(x, y, margin=0.0):
    return (-2700 - margin < x < 2450 + margin) and (COAST_Y < y < 1150 + margin)


def in_river(x0, x1):
    return not (x1 < RIVER_X - RIVER_W / 2 - 15 or x0 > RIVER_X + RIVER_W / 2 + 15)


def skyscraper(mb, x0, y0, x1, y1, h, style, rng, roofm):
    """Towers with setbacks / crowns / spires."""
    obstacle(x0, y0, x1, y1, h)
    tw, th = FACADES[STYLE_ORDER[style]]
    kind = rng.random()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    wx, wy = (x1 - x0) / 2, (y1 - y0) / 2
    uoff = float(rng.integers(0, 8))
    if kind < 0.45:
        # setback tower
        tiers = int(rng.integers(2, 4))
        z = 0.0
        for t in range(tiers):
            f = 1.0 - 0.18 * t
            zt = h * (t + 1) / tiers if t < tiers - 1 else h
            box(mb, cx - wx * f, cy - wy * f, cx + wx * f, cy + wy * f, z, zt, style, roofm, (tw, th), uoff)
            z = zt
        top = (cx, cy, h)
    elif kind < 0.75:
        # cylindrical / octagonal tower
        r = min(wx, wy)
        n = 8 if rng.random() < 0.5 else 32
        cylinder(mb, cx, cy, r, r * 0.92, 0, h, style, n=n, tile=(tw, th), top_mat=roofm)
        top = (cx, cy, h)
    else:
        # slab + podium
        box(mb, x0, y0, x1, y1, 0, 22, style, roofm, (tw, th), uoff)
        f = 0.7
        box(mb, cx - wx * f, cy - wy * 0.55, cx + wx * f, cy + wy * 0.55, 22, h, style, roofm, (tw, th), uoff)
        top = (cx, cy, h)
    # crown & mechanical floor
    if rng.random() < 0.6:
        box(mb, top[0] - wx * 0.35, top[1] - wy * 0.35, top[0] + wx * 0.35, top[1] + wy * 0.35, h, h + 6, 6, roofm)
    if rng.random() < 0.35:
        beam(mb, (top[0], top[1], h), (top[0], top[1], h + h * 0.15), 1.2, 1.2, 7)
        add_light("obstruction", (top[0], top[1], h + h * 0.15 + 0.5), "#ff1a1a", 2.5, kind="blink")
    else:
        add_light("obstruction", (top[0], top[1], h + 6.5), "#ff1a1a", 2.5, kind="blink")


TREES = []   # (x, y, h, kind) -> instanced by the simulator from world.json


def tree(mb, x, y, h, rng, leaf_mat=None, trunk_mat=None):
    """Record a tree instance (kind 0 = conifer, 1 = broadleaf)."""
    TREES.append((round(float(x), 1), round(float(y), 1), round(float(h), 1), int(rng.random() < 0.6)))


def build_tree_prototypes(M, col):
    """Unit-height (1 m) tree models; the simulator instances them."""
    rng = np.random.default_rng(1)
    for kind in (0, 1):
        mb = C.MeshBuilder()
        h = 1.0
        cylinder(mb, 0, 0, 0.03, 0.02, 0, 0.35, 2, n=6, top=False)
        if kind == 0:
            for (z0, z1, r) in ((0.22, 0.62, 0.34), (0.45, 0.85, 0.26), (0.66, 1.0, 0.17)):
                cylinder(mb, 0, 0, r, 0.01, z0, z1, 0, n=9, top=False)
                pts = [(r * math.cos(a), r * math.sin(a), z0) for a in np.linspace(0, 2 * math.pi, 10)[:-1]]
                mb.add_poly(pts[::-1], mat=0, normal=(0, 0, -1))
        else:
            prof = [(0.30, 0.18), (0.40, 0.33), (0.55, 0.37), (0.72, 0.33), (0.88, 0.22), (1.0, 0.02)]
            n = 10
            th = np.linspace(0, 2 * math.pi, n + 1)
            P = np.zeros((len(prof), n + 1, 3))
            for i, (z, r) in enumerate(prof):
                rr = r * (1 + 0.12 * np.sin(th * 3 + i))
                rr[-1] = rr[0]
                P[i, :, 0] = rr * np.cos(th)
                P[i, :, 1] = rr * np.sin(th)
                P[i, :, 2] = z
            mb.add_grid(P, outward=(0, 0, 0.6), mat=1, wrap_v=True)
            pts = [(P[0, j, 0], P[0, j, 1], P[0, j, 2]) for j in range(n)]
            mb.add_poly(pts[::-1], mat=1, normal=(0, 0, -1))
        ob = mb.build("TreeProto_%d" % kind, [M["leaf2"], M["leaf"], M["trunk"]], col=col)
        ob.location = (0, 0, -1000.0)   # parked out of sight; the sim clones it


def build_city(M, col):
    rng = RNG
    ch = Chunks()
    mats = [M[s] for s in STYLE_ORDER] + [M["roof"], M["paint_grey"], M["steel"], M["road"], M["concrete"],
                                          M["grass"], M["leaf"], M["leaf2"], M["trunk"], M["glass_tower"]]
    I_ROOF, I_GREY, I_STEEL, I_ROAD, I_CONC, I_GRASS, I_LEAF, I_LEAF2, I_TRUNK, I_GT = range(6, 16)
    BLOCK, ROAD_W = 150.0, 24.0
    gx = np.arange(-4800, 11000, BLOCK)
    gy = np.arange(300, 9400, BLOCK)
    n_build = 0
    for x0 in gx:
        for y0 in gy:
            x1, y1 = x0 + BLOCK - ROAD_W, y0 + BLOCK - ROAD_W
            if in_airport(x0, y0, 60) or in_airport(x1, y1, 60) or in_airport(x0, y1, 60) or in_airport(x1, y0, 60):
                continue
            if in_river(x0, x1 + ROAD_W):
                continue
            mb = ch.get(x0, y0)
            d = math.hypot((x0 + x1) / 2 - DOWNTOWN[0], (y0 + y1) / 2 - DOWNTOWN[1])
            # density falls off with distance; west side is industrial / suburban
            dens = math.exp(-d / 2600.0)
            if (x0 < -1000) and y0 < 2500:
                zone = "industrial"
            elif rng.random() < 0.08 + 0.05 * (d > 3000):
                zone = "park"
            else:
                zone = "urban"
            # block pavement
            rect(mb, (x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0, 0.03,
                 I_GRASS if zone == "park" else I_CONC, ("world", 25.0))
            if zone == "park":
                for k in range(int(rng.integers(12, 30))):
                    tree(mb, rng.uniform(x0 + 6, x1 - 6), rng.uniform(y0 + 6, y1 - 6), rng.uniform(7, 14), rng,
                         I_LEAF if rng.random() < 0.5 else I_LEAF2, I_TRUNK)
                continue
            # subdivide into lots
            lots = [(x0 + 4, y0 + 4, x1 - 4, y1 - 4)]
            splits = 0 if (d < 900 and rng.random() < 0.5) else int(rng.integers(1, 4 if dens > 0.3 else 5))
            for _ in range(splits):
                new = []
                for (a, b, c, e) in lots:
                    if (c - a) > (e - b):
                        m = rng.uniform(a + (c - a) * 0.35, a + (c - a) * 0.65)
                        new += [(a, b, m - 3, e), (m + 3, b, c, e)]
                    else:
                        m = rng.uniform(b + (e - b) * 0.35, b + (e - b) * 0.65)
                        new += [(a, b, c, m - 3), (a, m + 3, c, e)]
                lots = new
            for (a, b, c, e) in lots:
                if (c - a) < 8 or (e - b) < 8:
                    continue
                inset = rng.uniform(1, 6)
                a, b, c, e = a + inset, b + inset, c - inset, e - inset
                if zone == "industrial":
                    h = rng.uniform(8, 18)
                    box(mb, a, b, c, e, 0, h, I_GREY if rng.random() < 0.5 else 5, I_ROOF, (14, 14))
                    n_build += 1
                    continue
                base_h = 12 + 330 * dens ** 1.6
                h = float(np.clip(rng.lognormal(math.log(base_h), 0.45), 7, 390))
                if h > 110 and min(c - a, e - b) > 22:
                    style = int(rng.choice([0, 1, 2, 5], p=[0.45, 0.3, 0.15, 0.1]))
                    skyscraper(mb, a, b, c, e, h, style, rng, I_ROOF)
                else:
                    if h > 45:
                        style = int(rng.choice([0, 1, 2, 5], p=[0.3, 0.2, 0.35, 0.15]))
                    elif h > 20:
                        style = int(rng.choice([2, 3, 5, 4], p=[0.35, 0.35, 0.15, 0.15]))
                    else:
                        style = int(rng.choice([3, 4, 2], p=[0.5, 0.35, 0.15]))
                    tw, th = FACADES[STYLE_ORDER[style]]
                    h = round(h / (th / 4)) * (th / 4) or th / 4
                    box(mb, a, b, c, e, 0, h, style, I_ROOF, (tw, th), float(rng.integers(0, 8)))
                    # roof equipment
                    if (c - a) > 14 and (e - b) > 14 and rng.random() < 0.7:
                        for k in range(int(rng.integers(1, 4))):
                            ux = rng.uniform(a + 3, c - 8)
                            uy = rng.uniform(b + 3, e - 8)
                            box(mb, ux, uy, ux + rng.uniform(3, 7), uy + rng.uniform(3, 7), h, h + rng.uniform(2, 4),
                                I_GREY, I_GREY)
                n_build += 1
            # street trees along the block edge
            if rng.random() < 0.5:
                for t in np.arange(x0 + 8, x1 - 4, 18):
                    tree(mb, t, y0 - 3, rng.uniform(6, 9), rng, I_LEAF, I_TRUNK)
    # --- streets: segments + intersections, street lights ----------------------
    for x0 in gx:
        for y0 in gy:
            xr = x0 + BLOCK - ROAD_W / 2        # vertical road centre (x)
            yr = y0 + BLOCK - ROAD_W / 2        # horizontal road centre (y)
            xa, ya = x0, y0
            if in_airport(xa + BLOCK / 2, ya + BLOCK / 2, 0):
                continue
            mb = ch.get(x0, y0)
            # horizontal segment from x0 to x0+BLOCK-ROAD_W at y=yr
            if not in_river(x0, x0 + BLOCK - ROAD_W):
                rect(mb, x0 + (BLOCK - ROAD_W) / 2, yr, BLOCK - ROAD_W, ROAD_W, 0, 0.05, I_ROAD, ("road", 20.0, 24.0))
                for t in (x0 + 20, x0 + 70, x0 + 110):
                    add_light("street", (t, yr - ROAD_W / 2 + 1.5, 9.0), "#ffc27a", 2.2)
            if not in_river(xr - ROAD_W / 2, xr + ROAD_W / 2):
                rect(mb, xr, y0 + (BLOCK - ROAD_W) / 2, BLOCK - ROAD_W, ROAD_W, math.pi / 2, 0.05, I_ROAD,
                     ("road", 20.0, 24.0))
                rect(mb, xr, yr, ROAD_W, ROAD_W, 0, 0.049, I_CONC, ("world", 25.0))
                for t in (y0 + 40, y0 + 95):
                    add_light("street", (xr + ROAD_W / 2 - 1.5, t, 9.0), "#ffc27a", 2.2)
    objs = []
    for k, mb in ch.b.items():
        objs.append(mb.build("City_%d_%d" % k, mats, col=col))
    print("city buildings:", n_build)
    return objs


def build_landmarks(M, col):
    mb = C.MeshBuilder()
    mats = [M["steel"], M["glass_tower"], M["bridge"], M["road"], M["paint_white"], M["dark"], M["concrete"],
            M["crane"], M["containers"], M["roof"], M["metal"]]
    # --- broadcast tower (450 m) --------------------------------------------------
    tx, ty = 6400.0, 4300.0
    obstacle(tx - 40, ty - 40, tx + 40, ty + 40, 60.0)          # tower legs
    obstacle(tx - 18, ty - 18, tx + 18, ty + 18, 452.0)         # shaft
    for k in range(3):
        a = k * 2 * math.pi / 3
        beam(mb, (tx + 38 * math.cos(a), ty + 38 * math.sin(a), 0), (tx + 12 * math.cos(a), ty + 12 * math.sin(a), 330),
             6, 6, 4)
    cylinder(mb, tx, ty, 16, 9, 0, 350, 0, n=24, tile=(6, 6), top=False)
    for zz in range(20, 340, 20):
        r = 16 + (9 - 16) * zz / 350
        cylinder(mb, tx, ty, r + 1.5, r + 1.5, zz, zz + 1.2, 4, n=24)
    cylinder(mb, tx, ty, 17, 20, 340, 352, 1, n=32, tile=(8, 6))
    cylinder(mb, tx, ty, 20, 17, 352, 358, 4, n=32)
    cylinder(mb, tx, ty, 9, 8, 358, 440, 0, n=16, tile=(6, 6), top=False)
    cylinder(mb, tx, ty, 12, 13, 440, 448, 1, n=32, tile=(8, 6))
    cylinder(mb, tx, ty, 13, 6, 448, 452, 4, n=32)
    beam(mb, (tx, ty, 452), (tx, ty, 520), 2.0, 2.0, 4)
    for zz in (120, 240, 350, 452, 520):
        add_light("obstruction", (tx, ty, zz + 0.5), "#ff1a1a", 5.0, kind="blink")
    for zz in (346.0, 444.0):
        for a in np.linspace(0, 2 * math.pi, 24, endpoint=False):
            add_light("landmark", (tx + 20.5 * math.cos(a), ty + 20.5 * math.sin(a), zz), "#9fd7ff", 3.0)
    # --- river bridges -------------------------------------------------------------
    for y in np.arange(450, 9400, 150 * 6):
        yb = y + 150 - 12
        rect(mb, RIVER_X, yb, RIVER_W + 60, 24, 0, 6.0, 3, ("road", 20.0, 24.0))
        box(mb, RIVER_X - RIVER_W / 2 - 30, yb - 12, RIVER_X + RIVER_W / 2 + 30, yb + 12, 3.0, 5.95, 6, None, (10, 10),
            top=False, bottom=True)
        for xx in np.linspace(RIVER_X - RIVER_W / 2, RIVER_X + RIVER_W / 2, 4):
            box(mb, xx - 2, yb - 8, xx + 2, yb + 8, -6, 3.0, 6)
    # --- cable-stayed landmark bridge at the river mouth (y = 820) ------------------
    yb = 820.0
    span_x0, span_x1 = RIVER_X - 420, RIVER_X + 420
    rect(mb, RIVER_X, yb, span_x1 - span_x0, 30, 0, 22.0, 3, ("road", 20.0, 30.0))
    box(mb, span_x0, yb - 15, span_x1, yb + 15, 19.5, 21.95, 2, None, (10, 10), top=False, bottom=True)
    for px in (RIVER_X - 150, RIVER_X + 150):
        for sy in (-1, 1):
            beam(mb, (px, yb + sy * 17, -8), (px, yb + sy * 4, 135), 5, 5, 2)
        beam(mb, (px, yb - 10, 110), (px, yb + 10, 110), 4, 4, 2)
        for k in range(1, 12):
            for dirx in (-1, 1):
                for sy in (-1, 1):
                    top = (px, yb + sy * 5.0, 132 - k * 2.2)
                    deck = (px + dirx * k * 12.5, yb + sy * 14.5, 22.0)
                    beam(mb, top, deck, 0.35, 0.35, 0)
        add_light("obstruction", (px, yb, 135.5), "#ff1a1a", 3.0, kind="blink")
    for x in np.arange(span_x0, span_x1 + 1, 30):
        for sy in (-1, 1):
            add_light("bridge", (x, yb + sy * 15, 23.5), "#ffe2a8", 2.0)
    # approach ramps to the ground
    for sx in (-1, 1):
        x_end = RIVER_X + sx * 420
        rect(mb, x_end + sx * 150, yb, 300, 30, 0, 11.0, 3, ("road", 20.0, 30.0))
    # --- container port (west, on the coast) -------------------------------------------
    for i in range(24):
        for j in range(10):
            x = -4600 + i * 70
            y = -1300 + j * 30
            if rng_bool(0.15):
                continue
            hgt = 2.6 * int(RNG.integers(1, 5))
            box(mb, x, y, x + 60, y + 12, 0, hgt, 8, 9, (12.2, 2.6 * 8 / 1.0))
    for i in range(6):
        x = -4550 + i * 230
        # gantry crane
        for sy in (-1, 1):
            beam(mb, (x - 12, -1390 + sy * 14, 0), (x - 12, -1390 + sy * 14, 48), 2.2, 2.2, 7)
            beam(mb, (x + 12, -1390 + sy * 14, 0), (x + 12, -1390 + sy * 14, 48), 2.2, 2.2, 7)
        beam(mb, (x - 12, -1430, 48), (x - 12, -1350, 48), 2.5, 3.0, 7)
        beam(mb, (x + 12, -1430, 48), (x + 12, -1350, 48), 2.5, 3.0, 7)
        beam(mb, (x, -1480, 50), (x, -1340, 50), 5, 3, 7)
        box(mb, x - 5, -1400, x + 5, -1392, 44, 52, 4)
        add_light("obstruction", (x, -1480, 51), "#ff1a1a", 2.0, kind="blink")
    # quay
    box(mb, -4700, -1440, -2500, -1400, -4, 0.8, 6, 6, (10, 10))
    mb.build("Landmarks", mats, col=col)
    return dict(tower=[tx, ty, 520.0])


def rng_bool(p):
    return RNG.random() < p


def build_airport_trees(M, col):
    mb = C.MeshBuilder()
    rng = np.random.default_rng(3)
    for k in range(700):
        x = rng.uniform(-2400, 2400)
        y = rng.uniform(870, 1120)
        tree(mb, x, y, rng.uniform(6, 12), rng, 0, 2)
    for k in range(250):
        x = rng.uniform(-900, 900)
        y = rng.uniform(730, 760)
        tree(mb, x, y, rng.uniform(5, 9), rng, 1, 2)
    # airport access road
    for x in np.arange(-2300, 2450, 20):
        rect(mb, x + 10, 880, 20, 24, 0, 0.05, 3, ("road", 20.0, 24.0))
        if int(x) % 60 == 0:
            add_light("street", (x, 868, 10), "#ffc27a", 2.2)
    for y in np.arange(735, 880, 20):
        rect(mb, 0, y + 10, 20, 24, math.pi / 2, 0.05, 3, ("road", 20.0, 24.0))
    mb.build("AirportLandscape", [M["leaf"], M["leaf2"], M["trunk"], M["road"]], col=col)


# ---------------------------------------------------------------------------
def main():
    if not QUICK:
        import textures_world
        textures_world.generate_all()
    C.reset_scene()
    col = C.collection("World")
    M = materials()
    conns = build_airfield(M, col)
    build_airfield_lights(M, col, conns)
    stands = build_terminal(M, col)
    tower = build_tower(M, col)
    build_airport_buildings(M, col)
    build_airport_trees(M, col)
    build_city(M, col)
    lm = build_landmarks(M, col)
    build_tree_prototypes(M, col)

    def rwy(ident, thr_x, hdg):
        return dict(ident=ident, threshold=[thr_x, 0.0, 0.0], heading=hdg, length=RWY_LEN, width=RWY_W,
                    elevation=0.0, ils=dict(course=hdg, glideslope=3.0, gsAntennaFromThr=300.0,
                                            freq="110.30" if ident == "27" else "109.50"))
    world = dict(
        name="City Builder International (RJCB)",
        frame="three.js: +x east, +y up, +z south; metres",
        runways=[rwy("27", RWY_X1, 270.0), rwy("09", RWY_X0, 90.0)],
        stands=stands,
        tower=dict(pos=[tower["x"], tower["h"], -tower["y"]]),
        landmarkTower=[lm["tower"][0], lm["tower"][2], -lm["tower"][1]],
        flatZone=dict(x0=FLAT["x0"], x1=FLAT["x1"], z0=-FLAT["y1"], z1=-FLAT["y0"]),
        coastZ=-COAST_Y,
        river=dict(x=RIVER_X, width=RIVER_W, z0=-9800.0, z1=-COAST_Y),
        lights=LIGHTS,
        # ground movement network (three.js x, z = -design y)
        ground=dict(twyZ=-TWY_Y, taxilaneZ=-TAXILANE_Y, pushZ=-PUSH_Y, serviceZ=-SERVICE_Y, apronZ=[-APRON_Y1, -APRON_Y0],
                    connectors=conns, apronLinks=APRON_LINKS, holdZ=-89.0,
                    rapidExits=[dict(rwy="27", x0=350.0, x1=350.0 - 310.0 * math.cos(math.radians(30))),
                                dict(rwy="09", x0=-450.0, x1=-450.0 + 310.0 * math.cos(math.radians(30)))],
                    gseDepots=[[x, -y] for (x, y) in GSE_DEPOTS], standLaneDX=40.0),
        trees=[v for t in TREES for v in (t[0], t[2], -t[1], t[3])],
        # buildings / towers as boxes for collisions (three.js x0, z0, x1, z1, top)
        obstacles=[round(v, 1) for (x0, y0, x1, y1, h) in OBST for v in (x0, -y1, x1, -y0, h)] +
        [round(v, 1) for v in (tower["x"] - 6, -tower["y"] - 6, tower["x"] + 6, -tower["y"] + 6, tower["h"])],
    )
    with open(os.path.join(C.WEB_ASSETS, "world.json"), "w") as fh:
        json.dump(world, fh, separators=(",", ":"), default=lambda o: o.item() if hasattr(o, "item") else str(o))
    cams = {
        "airport": [(2600, -1500, 350), (0, 300, 0), 35],
        "terminal": [(-150, 250, 40), (200, 560, 15), 30],
        "city": [(1200, -2600, 700), (5600, 3200, 100), 32],
        "tower": [(5200, 2400, 420), (6400, 4300, 300), 35],
        "approach": [(6500, -60, 400), (0, 0, 0), 40],
    }
    with open(os.path.join(C.HERE, "world_cameras.json"), "w") as fh:
        json.dump(cams, fh)
    C.save_blend(os.path.join(C.OUT_DIR, "world.blend"))
    C.export_glb(os.path.join(C.WEB_ASSETS, "world.glb"), draco=True)
    print("trees:", len(TREES))
    polys = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print("world objects:", len(bpy.data.objects), "polygons:", polys,
          "lights:", {k: len(v["pos"]) // 3 for k, v in LIGHTS.items()})


if __name__ == "__main__":
    main()
