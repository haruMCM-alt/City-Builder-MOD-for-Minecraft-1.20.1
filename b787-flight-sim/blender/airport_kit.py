"""
Detailed airport building kit (Blender / bpy), shared by build_world.py (home airport) and
build_airport2.py (second airport).

Blender frame: +X east, +Y north, +Z up, metres.  Every builder writes into a
common.MeshBuilder whose material list is KIT (use mi('name') for the slot index), so a
whole airport's structures become a handful of draw calls.

    terminal_block   glazed multi-level building: mullions, transoms, slab bands, plinth,
                     roller doors, roof slab with overhang, fascia, soffit, rooftop plant
    concourse        airside pier: apron-level service floor + glazed gate level, wave roof
                     with eaves on slender columns, stair towers, gate numbers
    jet_bridge       fixed link, rotunda on its column, two telescopic tunnels with window
                     bands and ribs, drive column with wheel bogie, cab with bellows canopy,
                     service stair, docking guidance board on the facade
    control_tower    office podium, ribbed shaft with window slots, octagonal cab with
                     leaning glass and mullions, catwalk and railing, antennas, radome
    hangar           barrel roof, segmented doors with header and tracks, office annex
    flood_mast, windsock, blast_fence, taxi_sign, ils_localizer, glideslope_mast, fence
"""
import math

import numpy as np

import common as C

KIT = ["facade_terminal", "curtain", "steel", "metal", "paint_white", "dark", "concrete", "roof",
       "sign_yellow", "rubber", "glass_tower", "red_white", "facade_office", "paint_grey", "sign",
       "hangar_door", "glass_dark"]


def mi(name):
    return KIT.index(name)


def kit_materials(M):
    """Adds the kit's own materials to the world material dict and returns the KIT list."""
    if "curtain" not in M:
        M["curtain"] = C.pbr_material("W_Curtain", color=C.hex_color("#3f5866"), roughness=0.06, metallic=0.75)
        M["sign_yellow"] = C.pbr_material("W_SignYellow", color=C.hex_color("#f2c418"), roughness=0.5)
        M["rubber"] = C.pbr_material("W_Rubber", color=C.hex_color("#1b1c1e"), roughness=0.9)
    return [M[k] for k in KIT]


UP = (0, 0, 1)


# ---------------------------------------------------------------------------
# primitives
# ---------------------------------------------------------------------------
def box(mb, x0, x1, y0, y1, z0, z1, mat, uv=0.25):
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))
    mb.add_box(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), mat=mat, uv_scale=uv)


def obox(mb, cx, cy, L, W, ang, z0, z1, mat, uv=0.25):
    mb.add_box((cx, cy, (z0 + z1) / 2), (L, W, z1 - z0), mat=mat, uv_scale=uv, rot_z=ang)


def beam(mb, p0, p1, w, h, mat):
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    ax = p1 - p0
    L = np.linalg.norm(ax)
    if L < 1e-6:
        return
    ax /= L
    up = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.95 else np.array([1.0, 0, 0])
    side = np.cross(ax, up)
    side /= np.linalg.norm(side)
    upv = np.cross(side, ax)
    hw, hh = w / 2, h / 2
    offs = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
    r0 = [p0 + side * a + upv * b for a, b in offs]
    r1 = [p1 + side * a + upv * b for a, b in offs]
    for i in range(4):
        j = (i + 1) % 4
        n = side * (offs[i][0] + offs[j][0]) + upv * (offs[i][1] + offs[j][1])
        mb.add_poly([r0[i], r0[j], r1[j], r1[i]], [(0, 0), (1, 0), (1, L / 5), (0, L / 5)], mat=mat, normal=n)
    mb.add_poly(r0[::-1], mat=mat, normal=-ax)
    mb.add_poly(r1, mat=mat, normal=ax)


def _basis(a):
    a = np.asarray(a, dtype=np.float64)
    a = a / np.linalg.norm(a)
    t = np.cross(a, [0, 0, 1.0])
    if np.linalg.norm(t) < 1e-6:
        t = np.cross(a, [0, 1.0, 0])
    t /= np.linalg.norm(t)
    return a, t, np.cross(a, t)


def cyl(mb, p0, p1, r, mat, n=16, caps=True, r1=None):
    """Cylinder / cone between two points."""
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    a, t, b = _basis(p1 - p0)
    r1 = r if r1 is None else r1
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * t + np.sin(th)[:, None] * b
    P = np.stack([p0 + r * ring, p1 + r1 * ring])
    L = float(np.linalg.norm(p1 - p0))
    UV = np.stack(np.meshgrid(th / (2 * math.pi) * 2 * math.pi * max(r, r1) / 4, [0, L / 4], indexing="xy"), -1)
    mb.add_grid(P, UV, N=np.stack([ring, ring]), mat=mat)
    if caps:
        mb.add_poly(p1 + r1 * ring[:-1], mat=mat, normal=a)
        mb.add_poly((p0 + r * ring[:-1])[::-1], mat=mat, normal=-a)


def dome(mb, c, r, mat, n=16, rings=6):
    """Upper hemisphere (radomes, cab roofs)."""
    c = np.asarray(c, dtype=np.float64)
    th = np.linspace(0, 2 * math.pi, n + 1)
    ph = np.linspace(0, math.pi / 2, rings + 1)
    P = np.array([[c + r * np.array([math.cos(p) * math.cos(t), math.cos(p) * math.sin(t), math.sin(p)]) for t in th] for p in ph])
    mb.add_grid(P, outward=tuple(c), mat=mat)


def quad(mb, p0, ex, ey, w, h, mat, off=0.0, uv=0.25):
    p0 = np.asarray(p0, dtype=np.float64)
    ex = np.asarray(ex, dtype=np.float64)
    ey = np.asarray(ey, dtype=np.float64)
    n = np.cross(ex, ey)
    n /= np.linalg.norm(n)
    p0 = p0 + n * off
    pts = [p0, p0 + ex * w, p0 + ex * w + ey * h, p0 + ey * h]
    mb.add_poly(pts, [(0, 0), (w * uv, 0), (w * uv, h * uv), (0, h * uv)], mat=mat, normal=n)


def vtext(mb, text, x, y, z, size, facing, mat, extrude=0.25):
    """Upright letters on a facade (facing = outward normal angle)."""
    import bpy
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
    if len(V) == 0:
        return
    fx, fy = math.cos(facing), math.sin(facing)
    rx, ry = math.cos(facing + math.pi / 2), math.sin(facing + math.pi / 2)
    W = np.stack([x + V[:, 0] * rx + V[:, 2] * fx, y + V[:, 0] * ry + V[:, 2] * fy, z + V[:, 1]], -1)
    mb.add_mesh(W, F, mat=mat, smooth=False)


# ---------------------------------------------------------------------------
# facades
# ---------------------------------------------------------------------------
def curtain_wall(mb, p0, p1, z0, z1, out, bay=3.0, floor=4.5, slabs=True):
    """Glazed wall from p0 to p1 (x, y) between z0 and z1; out = outward unit normal (x, y).
    Glass set back, vertical mullions every bay, transoms every 1.5 m, projecting slab bands."""
    p0 = np.array([p0[0], p0[1], 0.0])
    p1 = np.array([p1[0], p1[1], 0.0])
    ex = p1 - p0
    L = float(np.linalg.norm(ex))
    ex /= L
    o = np.array([out[0], out[1], 0.0])
    ez = np.array([0, 0, 1.0])
    # make the quad face outwards
    if np.dot(np.cross(ex, ez), o) < 0:
        p0, p1, ex = p1, p0, -ex
    quad(mb, p0 - o * 0.15 + ez * z0, ex, ez, L, z1 - z0, mi("curtain"), uv=1 / 6)
    nb = max(1, int(round(L / bay)))
    for k in range(nb + 1):
        q = p0 + ex * (L * k / nb) + o * 0.05
        beam(mb, q + ez * z0, q + ez * z1, 0.12, 0.28, mi("steel"))
    z = z0 + 1.5
    while z < z1 - 0.3:
        beam(mb, p0 + o * 0.05 + ez * z, p1 + o * 0.05 + ez * z, 0.22, 0.08, mi("steel"))
        z += 1.5 if abs(((z - z0) % floor)) > 0.01 else 1.5
    if slabs:
        z = z0 + floor
        while z < z1 - 0.5:
            c = (p0 + p1) / 2 + o * 0.2
            obox(mb, c[0], c[1], L + 0.4, 0.7, math.atan2(ex[1], ex[0]), z - 0.35, z + 0.35, mi("paint_white"))
            z += floor


def solid_wall_with_doors(mb, p0, p1, z0, z1, out, door_every=24.0, door_w=5.0, door_h=4.5):
    """Apron-level service wall: metal panels, roller doors (dark) with frames."""
    p0 = np.array([p0[0], p0[1], 0.0])
    p1 = np.array([p1[0], p1[1], 0.0])
    ex = p1 - p0
    L = float(np.linalg.norm(ex))
    ex /= L
    o = np.array([out[0], out[1], 0.0])
    ez = np.array([0, 0, 1.0])
    if np.dot(np.cross(ex, ez), o) < 0:
        p0, p1, ex = p1, p0, -ex
    quad(mb, p0 + ez * z0, ex, ez, L, z1 - z0, mi("metal"), uv=1 / 4)
    n = int(L // door_every)
    for k in range(n):
        c = p0 + ex * (door_every * (k + 0.5))
        quad(mb, c - ex * door_w / 2 + ez * z0, ex, ez, door_w, door_h, mi("hangar_door"), off=0.04, uv=1 / 3)
        beam(mb, c - ex * (door_w / 2 + 0.15) + o * 0.1 + ez * z0, c - ex * (door_w / 2 + 0.15) + o * 0.1 + ez * (door_h + 0.2), 0.3, 0.2, mi("paint_grey"))
        beam(mb, c + ex * (door_w / 2 + 0.15) + o * 0.1 + ez * z0, c + ex * (door_w / 2 + 0.15) + o * 0.1 + ez * (door_h + 0.2), 0.3, 0.2, mi("paint_grey"))
        beam(mb, c - ex * (door_w / 2 + 0.3) + o * 0.1 + ez * (door_h + 0.3), c + ex * (door_w / 2 + 0.3) + o * 0.1 + ez * (door_h + 0.3), 0.3, 0.35, mi("paint_grey"))


def roof_slab(mb, x0, x1, y0, y1, z, eave=(0, 0, 0, 0), thick=1.2, plant=True, rng=None):
    """Flat roof with overhangs (eave: west, east, south, north), metal fascia, soffit,
    rooftop plant and skylight strips."""
    ew, ee, es, en = eave
    X0, X1, Y0, Y1 = x0 - ew, x1 + ee, y0 - es, y1 + en
    box(mb, X0, X1, Y0, Y1, z, z + thick, mi("metal"), uv=0.1)
    box(mb, X0 + 0.5, X1 - 0.5, Y0 + 0.5, Y1 - 0.5, z + thick, z + thick + 0.05, mi("roof"), uv=0.05)
    if plant:
        rng = rng or np.random.default_rng(7)
        W, D = x1 - x0, y1 - y0
        for k in range(max(2, int(W * D / 1800))):
            cx = rng.uniform(x0 + 8, x1 - 8)
            cy = rng.uniform(y0 + 6, y1 - 6)
            box(mb, cx - 3, cx + 3, cy - 2, cy + 2, z + thick, z + thick + 2.2, mi("paint_grey"))
            cyl(mb, (cx + 4.2, cy, z + thick), (cx + 4.2, cy, z + thick + 1.2), 0.9, mi("steel"), n=10)
        # skylight strips (glass prisms)
        if W > 60 and D > 30:
            for yy in np.linspace(y0 + D * 0.3, y1 - D * 0.3, 2):
                box(mb, x0 + 10, x1 - 10, yy - 1.2, yy + 1.2, z + thick, z + thick + 0.8, mi("curtain"), uv=0.1)


def eave_columns(mb, xs, y, z_top, r=0.35):
    for x in xs:
        cyl(mb, (x, y, 0), (x, y, z_top), r, mi("steel"), n=10, r1=r * 0.7)
        # a tree-like fork into the roof
        for dx in (-2.2, 2.2):
            beam(mb, (x, y, z_top - 3.0), (x + dx, y, z_top), 0.22, 0.22, mi("steel"))


# ---------------------------------------------------------------------------
# buildings
# ---------------------------------------------------------------------------
def terminal_block(mb, x0, x1, y0, y1, levels, floor=5.0, airside="S", eave=(3, 3, 6, 6), rng=None, doors=True):
    """Terminal hall: plinth, apron-level service floor on the airside face (roller doors),
    glazed upper floors all round, roof slab with overhangs."""
    h = levels * floor
    box(mb, x0, x1, y0, y1, 0, 0.6, mi("concrete"))
    faces = {"S": ((x0, y0), (x1, y0), (0, -1)), "N": ((x1, y1), (x0, y1), (0, 1)),
             "W": ((x0, y1), (x0, y0), (-1, 0)), "E": ((x1, y0), (x1, y1), (1, 0))}
    for side, (a, b, o) in faces.items():
        if side == airside and doors:
            solid_wall_with_doors(mb, a, b, 0.6, floor, o)
            curtain_wall(mb, a, b, floor, h, o, floor=floor)
        else:
            curtain_wall(mb, a, b, 0.6, h, o, floor=floor)
    # the slab behind the glass (reads as a building, not a glass box)
    box(mb, x0 + 0.4, x1 - 0.4, y0 + 0.4, y1 - 0.4, 0.6, h - 0.1, mi("dark"), uv=0.1)
    roof_slab(mb, x0, x1, y0, y1, h, eave=eave, rng=rng)
    return h


def stair_tower(mb, x, y, h, out):
    """Small enclosed apron stair at a gate (door towards the apron)."""
    ox, oy = out
    box(mb, x - 2.2, x + 2.2, y - 2.2 * abs(oy) - 1.8 * abs(ox), y + 2.2 * abs(oy) + 1.8 * abs(ox), 0, h, mi("metal"), uv=0.2)
    fx, fy = x + ox * 2.3, y + oy * 2.3
    quad(mb, (fx - 0.9 * abs(oy), fy - 0.9 * abs(ox), 0), (abs(oy), abs(ox), 0), (0, 0, 1), 1.8, 2.4, mi("glass_dark"), off=0.03)
    box(mb, x - 2.4, x + 2.4, y - 2.4, y + 2.4, h, h + 0.4, mi("paint_white"))


def jet_bridge(mb, face_pt, face_out, rot, door, z_door, door_out=(-1.0, 0.0)):
    """Apron-drive boarding bridge from the terminal face to the aircraft door.
    face_pt: (x, y) on the facade, face_out: outward unit normal; rot: rotunda (x, y);
    door: aircraft door (x, y); door_out: outward normal of the fuselage skin at the door
    (the cab stands off the door along it and faces the fuselage); z_door: sill height."""
    fx, fy = face_pt
    ox, oy = face_out
    rx, ry = rot
    dox, doy = door_out
    cab = (door[0] + dox * 2.35, door[1] + doy * 2.35)
    cab_ang = math.atan2(-doy, -dox)          # the cab looks at the fuselage
    z0 = 5.3
    # fixed link from the building to the rotunda
    ang_f = math.atan2(ry - fy, rx - fx)
    Lf = math.hypot(rx - fx, ry - fy)
    obox(mb, (fx + rx) / 2, (fy + ry) / 2, Lf, 3.0, ang_f, z0, z0 + 3.0, mi("metal"))
    # rotunda on its column
    cyl(mb, (rx, ry, 0), (rx, ry, z0 - 0.4), 0.75, mi("paint_grey"), n=14)
    box(mb, rx - 1.4, rx + 1.4, ry - 1.4, ry + 1.4, 0, 0.35, mi("concrete"))
    cyl(mb, (rx, ry, z0 - 0.4), (rx, ry, z0 + 3.6), 2.7, mi("metal"), n=24)
    cyl(mb, (rx, ry, z0 + 3.6), (rx, ry, z0 + 3.9), 2.9, mi("dark"), n=24)
    # telescopic tunnels, sloping from the rotunda floor to the door sill
    tail = (cab[0] + dox * 2.0, cab[1] + doy * 2.0)
    dx, dy = tail[0] - rx, tail[1] - ry
    L = math.hypot(dx, dy)
    ang = math.atan2(dy, dx)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    z_end = z_door - 0.35
    for (t0, t1, w, h) in ((0.0, 0.56, 3.5, 3.3), (0.48, 1.0, 3.2, 3.0)):
        cx, cy = rx + dx * (t0 + t1) / 2, ry + dy * (t0 + t1) / 2
        zz = z0 + (z_end - z0) * (t0 + t1) / 2
        Ls = L * (t1 - t0)
        obox(mb, cx, cy, Ls, w, ang, zz, zz + h, mi("metal"))
        # window bands both sides and a darker skirt
        for s in (-1, 1):
            px, py = cx + nx * s * (w / 2 + 0.02), cy + ny * s * (w / 2 + 0.02)
            ex = (ux * -s, uy * -s, 0) if s > 0 else (ux, uy, 0)
            start = (px - ex[0] * Ls / 2 + 0.0, py - ex[1] * Ls / 2, zz + 1.25)
            quad(mb, start, ex, (0, 0, 1), Ls, 0.95, mi("glass_dark"), off=0.0)
        # ribs
        k = 0.0
        while k <= Ls:
            px, py = cx - ux * Ls / 2 + ux * k, cy - uy * Ls / 2 + uy * k
            for s in (-1, 1):
                beam(mb, (px + nx * s * (w / 2 + 0.06), py + ny * s * (w / 2 + 0.06), zz), (px + nx * s * (w / 2 + 0.06), py + ny * s * (w / 2 + 0.06), zz + h), 0.12, 0.12, mi("paint_grey"))
            beam(mb, (px + nx * (w / 2 + 0.06), py + ny * (w / 2 + 0.06), zz + h + 0.05), (px - nx * (w / 2 + 0.06), py - ny * (w / 2 + 0.06), zz + h + 0.05), 0.12, 0.1, mi("paint_grey"))
            k += 2.4
    # drive column: A-frame legs, lifting column and wheel bogie
    t = 0.72
    cx, cy = rx + dx * t, ry + dy * t
    zb = z0 + (z_end - z0) * t
    for s in (-1, 1):
        beam(mb, (cx + nx * s * 1.2, cy + ny * s * 1.2, zb), (cx + nx * s * 0.5, cy + ny * s * 0.5, 1.3), 0.35, 0.35, mi("paint_grey"))
    beam(mb, (cx, cy, 1.1), (cx, cy, zb), 0.5, 0.5, mi("steel"))
    obox(mb, cx, cy, 1.2, 3.4, ang, 0.5, 1.2, mi("paint_grey"))
    for s in (-1, 1):
        c0 = np.array([cx + nx * s * 1.35 - ux * 0.0, cy + ny * s * 1.35, 0.5])
        cyl(mb, c0 - np.array([nx, ny, 0]) * s * 0.25, c0 + np.array([nx, ny, 0]) * s * 0.25, 0.5, mi("rubber"), n=14)
    # cab (turns to the door) with a bellows canopy
    cxx, cyy = cab
    cux, cuy = math.cos(cab_ang), math.sin(cab_ang)
    cnx, cny = -cuy, cux
    obox(mb, cxx, cyy, 4.2, 4.6, cab_ang, z_end - 0.2, z_end + 3.0, mi("metal"))
    for s in (-1, 1):
        px, py = cxx + cnx * s * 2.32, cyy + cny * s * 2.32
        quad(mb, (px - cux * 1.6 * s, py - cuy * 1.6 * s, z_end + 1.1), (cux * s, cuy * s, 0), (0, 0, 1), 3.2, 1.2, mi("glass_dark"), off=0.0)
    for k in range(4):
        e = 2.1 + 0.07 * k
        obox(mb, cxx + cux * e, cyy + cuy * e, 0.07, 3.6 + 0.14 * k, cab_ang, z_end - 0.1 - 0.05 * k, z_end + 2.8 + 0.05 * k, mi("rubber"))
    # joint between the inner tunnel and the cab
    cyl(mb, (tail[0], tail[1], z_end - 0.2), (tail[0], tail[1], z_end + 2.9), 1.9, mi("rubber"), n=16)
    box(mb, cxx - 0.4, cxx + 0.4, cyy - 0.4, cyy + 0.4, z_end + 3.0, z_end + 3.25, mi("paint_white"))
    # service stair down from the cab platform
    sx, sy = cxx - cux * 0.8 + cnx * 3.1, cyy - cuy * 0.8 + cny * 3.1
    obox(mb, sx, sy, 1.6, 1.6, ang, z_end - 0.3, z_end - 0.15, mi("steel"))
    nst = int(max(z_end - 0.3, 0.5) / 0.2)
    for i in range(nst):
        zi = (z_end - 0.3) * (1 - (i + 1) / (nst + 1))
        d = 0.28 * (i + 1)
        obox(mb, sx - ux * (0.8 + d) , sy - uy * (0.8 + d), 0.3, 1.1, ang, zi - 0.04, zi, mi("steel"))
    run = 0.28 * nst
    for s in (-1, 1):
        a = (sx - ux * 0.8 + nx * s * 0.6, sy - uy * 0.8 + ny * s * 0.6, z_end - 0.3)
        b = (sx - ux * (0.8 + run) + nx * s * 0.6, sy - uy * (0.8 + run) + ny * s * 0.6, 0.0)
        beam(mb, a, b, 0.08, 0.25, mi("steel"))
        beam(mb, (a[0], a[1], a[2] + 1.0), (b[0], b[1], 1.0), 0.05, 0.05, mi("sign_yellow"))
    return dict(rot=(rx, ry), cab=(cxx, cyy), ang=ang)


def vdgs(mb, x, y, z, out):
    ox, oy = out
    box(mb, x - 1.0, x + 1.0, y - 0.25, y + 0.25, z, z + 1.2, mi("dark"))
    quad(mb, (x - 0.8 * abs(oy) + ox * 0.26, y - 0.8 * abs(ox) + oy * 0.26, z + 0.15), (abs(oy), abs(ox), 0), (0, 0, 1), 1.6, 0.9, mi("sign_yellow"), off=0.0)


def control_tower(mb, x, y, cab_z=88.0, lights=None):
    """Office podium, ribbed shaft, octagonal cab with leaning glass, catwalk, antennas, radome."""
    # podium: two floors, glazed lobby
    box(mb, x - 26, x + 26, y - 16, y + 16, 0, 0.5, mi("concrete"))
    for side, (a, b, o) in {"S": ((x - 25, y - 15), (x + 25, y - 15), (0, -1)), "N": ((x + 25, y + 15), (x - 25, y + 15), (0, 1)),
                            "W": ((x - 25, y + 15), (x - 25, y - 15), (-1, 0)), "E": ((x + 25, y - 15), (x + 25, y + 15), (1, 0))}.items():
        curtain_wall(mb, a, b, 0.5, 12.0, o, floor=4.0)
    box(mb, x - 24.6, x + 24.6, y - 14.6, y + 14.6, 0.5, 11.9, mi("dark"))
    roof_slab(mb, x - 25, x + 25, y - 15, y + 15, 12.0, eave=(1, 1, 1, 1), thick=0.8, plant=False)
    # shaft (tapering) with four ribs and window slots
    cyl(mb, (x, y, 12.8), (x, y, cab_z - 6), 7.4, mi("paint_white"), n=32, r1=5.6, caps=False)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        beam(mb, (x + 7.5 * math.cos(a), y + 7.5 * math.sin(a), 12.8), (x + 5.7 * math.cos(a), y + 5.7 * math.sin(a), cab_z - 6), 0.9, 0.9, mi("paint_grey"))
    for zz in np.arange(18, cab_z - 10, 7.0):
        r = 7.4 + (5.6 - 7.4) * (zz - 12.8) / (cab_z - 6 - 12.8)
        for k in range(4):
            a = k * math.pi / 2
            cx, cy = x + (r + 0.02) * math.cos(a), y + (r + 0.02) * math.sin(a)
            quad(mb, (cx - 0.5 * math.sin(a), cy + 0.5 * math.cos(a), zz), (math.sin(a), -math.cos(a), 0), (0, 0, 1), 1.0, 2.4, mi("glass_dark"), off=0.02)
    # equipment floor below the cab (wider), then the cab
    cyl(mb, (x, y, cab_z - 6), (x, y, cab_z - 1.2), 6.0, mi("paint_white"), n=8, r1=11.0)
    cyl(mb, (x, y, cab_z - 1.2), (x, y, cab_z), 11.4, mi("paint_grey"), n=8)
    # leaning glass: 8 panels between mullions
    cyl(mb, (x, y, cab_z), (x, y, cab_z + 6.2), 11.0, mi("glass_tower"), n=8, r1=12.4, caps=False)
    for k in range(8):
        a = (k + 0.5) * math.pi / 4
        beam(mb, (x + 11.0 * math.cos(a), y + 11.0 * math.sin(a), cab_z), (x + 12.4 * math.cos(a), y + 12.4 * math.sin(a), cab_z + 6.2), 0.18, 0.25, mi("dark"))
    cyl(mb, (x, y, cab_z + 6.2), (x, y, cab_z + 7.4), 13.2, mi("paint_white"), n=8)
    cyl(mb, (x, y, cab_z + 7.4), (x, y, cab_z + 8.0), 9.0, mi("paint_grey"), n=8)
    # catwalk with railing
    cyl(mb, (x, y, cab_z - 1.4), (x, y, cab_z - 1.2), 12.6, mi("steel"), n=8)
    for k in range(32):
        a = k * 2 * math.pi / 32
        beam(mb, (x + 12.5 * math.cos(a), y + 12.5 * math.sin(a), cab_z - 1.2), (x + 12.5 * math.cos(a), y + 12.5 * math.sin(a), cab_z - 0.1), 0.06, 0.06, mi("steel"))
    # roof: antenna mast, dishes, radome on a lattice
    top = cab_z + 8.0
    beam(mb, (x - 3, y, top), (x - 3, y, top + 14), 0.35, 0.35, mi("steel"))
    for zz in (top + 5, top + 9):
        cyl(mb, (x - 3 + 0.3, y, zz), (x - 3 + 0.9, y, zz), 0.9, mi("paint_white"), n=16, r1=0.2)
    for (a, b) in (((x + 2, y - 2), (x + 2, y + 2)), ((x + 6, y - 2), (x + 6, y + 2))):
        beam(mb, (a[0], a[1], top), (a[0], a[1], top + 5), 0.25, 0.25, mi("steel"))
        beam(mb, (b[0], b[1], top), (b[0], b[1], top + 5), 0.25, 0.25, mi("steel"))
    box(mb, x + 1.5, x + 6.5, y - 2.5, y + 2.5, top + 5, top + 5.4, mi("steel"))
    dome(mb, (x + 4, y, top + 5.4), 2.6, mi("paint_white"))
    if lights is not None:
        lights("obstruction", (x - 3, y, top + 14.3), "#ff1a1a", 3.0, None, "blink")
    return top + 14


def hangar(mb, x0, x1, y0, y1, h_wall, h_top, door_side="S", annex=True):
    """Maintenance hangar: barrel roof, segmented doors with header and tracks, office annex."""
    n = 28
    xs = np.linspace(x0, x1, n)
    zs = h_wall + (h_top - h_wall) * np.sin((xs - x0) / (x1 - x0) * math.pi)
    P = np.zeros((n, 2, 3))
    for i in range(n):
        P[i, 0] = (xs[i], y0, zs[i])
        P[i, 1] = (xs[i], y1, zs[i])
    mb.add_grid(P, np.stack([P[..., 0] / 10, P[..., 1] / 10], -1), outward=("dir", (0, 0, 1)), mat=mi("metal"))
    # roof ribs
    for i in range(0, n, 3):
        beam(mb, (xs[i], y0 - 0.3, zs[i] + 0.2), (xs[i], y1 + 0.3, zs[i] + 0.2), 0.3, 0.4, mi("paint_grey"))
    for (yy, nrm) in ((y0, -1), (y1, 1)):
        pts = [(x0, yy, 0)] + [(xs[i], yy, zs[i]) for i in range(n)] + [(x1, yy, 0)]
        mb.add_poly(pts, [(p[0] / 12, p[2] / 12) for p in pts], mat=mi("metal"), normal=(0, nrm, 0))
    for (xx, nrm) in ((x0, -1), (x1, 1)):
        mb.add_poly([(xx, y0, 0), (xx, y1, 0), (xx, y1, h_wall), (xx, y0, h_wall)], [(0, 0), (12, 0), (12, 2), (0, 2)], mat=mi("metal"), normal=(nrm, 0, 0))
    # doors on the south face: six leaves between posts, header girder, floor track
    yd = y0 if door_side == "S" else y1
    s = -1 if door_side == "S" else 1
    dh = h_wall - 3.0
    leaves = 6
    for k in range(leaves):
        a = x0 + 4 + (x1 - x0 - 8) * k / leaves
        b = x0 + 4 + (x1 - x0 - 8) * (k + 1) / leaves
        quad(mb, (a if s < 0 else b, yd + s * 0.25, 0), (1 if s < 0 else -1, 0, 0), (0, 0, 1), b - a - 0.3, dh, mi("hangar_door"), uv=1 / 4)
        beam(mb, (b, yd + s * 0.4, 0), (b, yd + s * 0.4, dh), 0.35, 0.3, mi("paint_grey"))
    box(mb, x0, x1, yd + s * 0.2, yd + s * 1.4, dh, dh + 2.2, mi("paint_grey"))
    box(mb, x0 + 2, x1 - 2, yd + s * 0.2, yd + s * 0.8, 0, 0.12, mi("steel"))
    if annex:
        box(mb, x1, x1 + 14, y0 + 6, y1 - 6, 0, 0.4, mi("concrete"))
        box(mb, x1 + 0.2, x1 + 13.8, y0 + 6.2, y1 - 6.2, 0.4, 11.6, mi("facade_office"), uv=1 / 12.8)
        box(mb, x1, x1 + 14, y0 + 6, y1 - 6, 11.6, 12.4, mi("paint_white"))
    # roof ventilators
    for i in range(3, n - 3, 6):
        cyl(mb, (xs[i], (y0 + y1) / 2, zs[i]), (xs[i], (y0 + y1) / 2, zs[i] + 1.6), 0.8, mi("steel"), n=10)


# ---------------------------------------------------------------------------
# airside furniture
# ---------------------------------------------------------------------------
def flood_mast(mb, x, y, h=28.0, face=0.0, lights=None, group="apron_flood"):
    cyl(mb, (x, y, 0), (x, y, h), 0.45, mi("paint_grey"), n=12, r1=0.25)
    box(mb, x - 1.2, x + 1.2, y - 1.2, y + 1.2, 0, 0.4, mi("concrete"))
    cyl(mb, (x, y, h), (x, y, h + 0.25), 1.8, mi("steel"), n=12)
    for k in range(6):
        a = face + (k - 2.5) * 0.35
        cx, cy = x + 1.3 * math.cos(a), y + 1.3 * math.sin(a)
        obox(mb, cx, cy, 0.9, 0.7, a, h + 0.3, h + 1.0, mi("dark"))
    if lights is not None:
        lights(group, (x + 1.3 * math.cos(face), y + 1.3 * math.sin(face), h + 0.4), "#ffe2b0", 6.0, None, "steady")


def windsock(mb, x, y, heading=0.4):
    cyl(mb, (x, y, 0), (x, y, 8.0), 0.12, mi("paint_white"), n=8)
    for k in range(5):
        a0 = k / 5
        c0 = np.array([x, y, 7.6]) + np.array([math.cos(heading), math.sin(heading), -0.05]) * (a0 * 3.6)
        c1 = np.array([x, y, 7.6]) + np.array([math.cos(heading), math.sin(heading), -0.05]) * ((a0 + 0.2) * 3.6)
        cyl(mb, c0, c1, 0.45 - 0.22 * a0, mi("red_white" if k % 2 == 0 else "paint_white"), n=12, r1=0.45 - 0.22 * (a0 + 0.2), caps=False)


def blast_fence(mb, x0, x1, y, h=4.0, face=1):
    x = x0
    while x < x1:
        beam(mb, (x, y, 0), (x, y + face * 1.2, h), 0.25, 0.25, mi("steel"))
        x += 3.0
    for k in range(6):
        z = 0.4 + k * (h - 0.6) / 5
        yy = y + face * 1.2 * (z / h)
        box(mb, x0, x1, yy - 0.05, yy + 0.05, z, z + (h - 0.6) / 5 - 0.05, mi("paint_grey"), uv=0.2)


def taxi_sign(mb, x, y, rot, text, mat_bg="sign_yellow"):
    """Two-sided taxiway sign on frangible legs."""
    w = 1.0 + 0.8 * len(text)
    obox(mb, x, y, w, 0.35, rot, 0.4, 1.5, mi(mat_bg))
    for s in (-1, 1):
        px, py = x + math.cos(rot) * s * (w / 2 - 0.3), y + math.sin(rot) * s * (w / 2 - 0.3)
        beam(mb, (px, py, 0), (px, py, 0.4), 0.12, 0.12, mi("steel"))
    for side in (1, -1):
        nx, ny = -math.sin(rot) * side, math.cos(rot) * side
        vtext(mb, text, x + nx * 0.19, y + ny * 0.19, 0.95, 0.75, math.atan2(ny, nx), mi("sign"), extrude=0.02)


def ils_localizer(mb, x, y, axis_ang=0.0, n=16, span=40.0):
    """Antenna array across the runway axis beyond the far end + equipment shelter."""
    px, py = -math.sin(axis_ang), math.cos(axis_ang)
    for k in range(n):
        t = (k / (n - 1) - 0.5) * span
        cx, cy = x + px * t, y + py * t
        beam(mb, (cx, cy, 0), (cx, cy, 2.6), 0.1, 0.1, mi("steel"))
        beam(mb, (cx - math.cos(axis_ang) * 0.6, cy - math.sin(axis_ang) * 0.6, 2.4), (cx + math.cos(axis_ang) * 0.6, cy + math.sin(axis_ang) * 0.6, 2.4), 0.06, 0.06, mi("steel"))
    beam(mb, (x - px * span / 2, y - py * span / 2, 1.2), (x + px * span / 2, y + py * span / 2, 1.2), 0.15, 0.15, mi("steel"))
    obox(mb, x + math.cos(axis_ang) * 18, y + math.sin(axis_ang) * 18, 4, 3, axis_ang, 0, 2.8, mi("paint_white"))


def glideslope_mast(mb, x, y):
    for (a, b) in ((0, 0), (1.2, 0), (0, 1.2), (1.2, 1.2)):
        beam(mb, (x + a, y + b, 0), (x + 0.6 + (a - 0.6) * 0.3, y + 0.6 + (b - 0.6) * 0.3, 16), 0.12, 0.12, mi("red_white"))
    for z in np.arange(2, 16, 3.0):
        f = 1 - 0.7 * z / 16
        c = 0.6
        for (p, q) in (((-1, -1), (1, -1)), ((1, -1), (1, 1)), ((1, 1), (-1, 1)), ((-1, 1), (-1, -1))):
            beam(mb, (x + c + p[0] * 0.6 * f, y + c + p[1] * 0.6 * f, z), (x + c + q[0] * 0.6 * f, y + c + q[1] * 0.6 * f, z), 0.06, 0.06, mi("paint_white"))
    obox(mb, x + 6, y, 3.5, 2.6, 0, 0, 2.6, mi("paint_white"))


def fence(mb, pts, h=2.6, step=4.0):
    """Perimeter fence: posts, top rail with barbed-wire outriggers, mesh panels (dark)."""
    for a, b in zip(pts[:-1], pts[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        ux, uy = (b[0] - a[0]) / L, (b[1] - a[1]) / L
        k = 0.0
        while k <= L:
            cx, cy = a[0] + ux * k, a[1] + uy * k
            beam(mb, (cx, cy, 0), (cx, cy, h), 0.08, 0.08, mi("steel"))
            k += step
        for z in (0.3, h * 0.5, h):
            beam(mb, (a[0], a[1], z), (b[0], b[1], z), 0.04, 0.04, mi("steel"))


def car(mb, x, y, ang, rng, paints, glass, wheel, z0=0.07):
    """A parked car: body, glasshouse, dark wheels (4.5 x 1.8 m)."""
    paint = paints[int(rng.integers(len(paints)))]
    L, Wd = rng.uniform(4.2, 4.9), rng.uniform(1.72, 1.85)
    ca, sa = math.cos(ang), math.sin(ang)
    obox(mb, x, y, L, Wd, ang, z0 + 0.3, z0 + 0.95, paint)
    obox(mb, x - ca * 0.2, y - sa * 0.2, L * 0.52, Wd * 0.9, ang, z0 + 0.95, z0 + 1.42, glass)
    obox(mb, x - ca * 0.2, y - sa * 0.2, L * 0.5, Wd * 0.86, ang, z0 + 1.42, z0 + 1.48, paint)
    for f in (-0.32, 0.32):
        obox(mb, x + ca * L * f, y + sa * L * f, 0.64, Wd * 1.02, ang, z0, z0 + 0.62, wheel)
