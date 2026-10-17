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
    """E231/E233-style cab seen from the driver's seat (left side, +Y)."""
    from lib import mat
    wall = mat("cab_wall2", (0.30, 0.32, 0.32), 0.0, 0.75)
    desk = mat("cab_desk2", (0.035, 0.037, 0.04), 0.1, 0.55)
    panel = mat("cab_panel2", (0.06, 0.065, 0.07), 0.15, 0.5)
    trim = mat("cab_trim", (0.18, 0.19, 0.20), 0.3, 0.45)
    floor = mat("cab_floor", (0.12, 0.13, 0.14), 0.0, 0.9)
    tt = mat("TIMETABLE", (0.85, 0.85, 0.80), 0.0, 0.7)
    needle = mat("needle", (0.95, 0.35, 0.05), 0.0, 0.4, (1.0, 0.4, 0.05), 0.6)
    mb = MB("cab_interior")
    L = 19.9
    xF = L / 2 - 0.22
    W = 1.40
    zf, zc = 1.25, 3.25
    xB = xF - 2.6
    mb.poly([(xB, -W, zf), (xF, -W, zf), (xF, W, zf), (xB, W, zf)], floor, (0, 0, 1))
    mb.poly([(xB, -W, zc), (xF, -W, zc), (xF, W, zc), (xB, W, zc)], wall, (0, 0, -1))
    for s in (-1, 1):
        y = s * W
        x0, x1 = xF - 1.6, xF - 0.35
        mb.poly([(xB, y, zf), (xF, y, zf), (xF, y, 2.0), (xB, y, 2.0)], wall, (0, -s, 0))
        mb.poly([(xB, y, 2.8), (xF, y, 2.8), (xF, y, zc), (xB, y, zc)], wall, (0, -s, 0))
        mb.poly([(xB, y, 2.0), (x0, y, 2.0), (x0, y, 2.8), (xB, y, 2.8)], wall, (0, -s, 0))
        mb.poly([(x1, y, 2.0), (xF, y, 2.0), (xF, y, 2.8), (x1, y, 2.8)], wall, (0, -s, 0))
        # side window frame + sill
        mb.box(((x0 + x1) / 2, y - s * 0.03, 1.99), (x1 - x0 + 0.06, 0.08, 0.04), trim)
        mb.box(((x0 + x1) / 2, y - s * 0.02, 2.81), (x1 - x0 + 0.06, 0.05, 0.03), trim)
    mb.poly([(xB, -W, zf), (xB, W, zf), (xB, W, zc), (xB, -W, zc)], wall, (1, 0, 0))
    # back wall door with window
    mb.box((xB + 0.01, -0.35, 2.15), (0.03, 0.75, 1.80), trim)
    mb.box((xB + 0.03, -0.35, 2.55), (0.01, 0.45, 0.55), M["win"])
    # front wall around the windscreen (sill 1.85, header 3.08)
    fx = xF + 0.02
    sill, head = 1.85, 3.08
    mb.poly([(fx, -W, head), (fx, W, head), (fx, W, zc), (fx, -W, zc)], wall, (-1, 0, 0))
    mb.poly([(fx, -W, zf), (fx, W, zf), (fx, W, sill), (fx, -W, sill)], panel, (-1, 0, 0))
    for (y0, y1) in ((-W, -1.30), (-0.40, -0.30), (0.02, 0.10), (1.30, W)):
        mb.poly([(fx, y0, sill), (fx, y1, sill), (fx, y1, head), (fx, y0, head)], M["black"], (-1, 0, 0))
    # rubber gaskets around the windscreen openings
    for (y0, y1) in ((-1.30, -0.40), (-0.30, 0.02), (0.10, 1.30)):
        mb.box((fx - 0.01, (y0 + y1) / 2, sill + 0.012), (0.03, y1 - y0, 0.025), M["rubber"])
        mb.box((fx - 0.01, (y0 + y1) / 2, head - 0.012), (0.03, y1 - y0, 0.025), M["rubber"])
    # header box (destination unit back) + roller sun blind
    mb.box((xF - 0.15, -0.2, 3.16), (0.30, 1.6, 0.18), wall)
    mb.box((xF - 0.08, 0.72, 3.04), (0.06, 0.95, 0.05), M["dkgrey"])
    mb.box((xF - 0.05, 0.72, 2.96), (0.012, 0.92, 0.14), mat("blind", (0.25, 0.22, 0.15), 0.0, 0.8, alpha=0.6))
    # wiper arm resting on the driver's window
    mb.beam((fx + 0.01, 0.25, sill + 0.03), (fx + 0.01, 1.15, sill + 0.10), 0.015, 0.012, M["black"])
    # ---- desk: low console across the cab
    mb.poly([(xF - 0.95, -W, 1.70), (xF - 0.95, W, 1.70), (xF - 0.02, W, 1.83), (xF - 0.02, -W, 1.83)], desk, (0, 0, 1))
    mb.poly([(xF - 0.95, -W, 1.70), (xF - 0.95, W, 1.70), (xF - 0.95, W, 1.30), (xF - 0.95, -W, 1.30)], panel, (-1, 0, 0))
    mb.box((xF - 0.96, 0, 1.70), (0.04, 2 * W, 0.03), trim)                        # desk edge
    # driver's instrument hood (in front of the driver, +Y side)
    hood = [(0.0, 0.0), (0.42, 0.0), (0.42, 0.20), (0.06, 0.12)]
    from lib import prism
    prism(mb, hood, lambda u, v, d: (xF - 0.86 + u, d, 1.77 + v), 0.12, 1.16, panel)
    # gauges on the hood face (sloped toward the driver)
    face_n = Vector((-0.08, 0, 0.36)).normalized()
    def on_face(y, t):
        # point on the sloped face: t = 0..1 from the lower front edge to the top
        return Vector((xF - 0.80 + 0.36 * t, y, 1.89 + 0.08 * t)) + face_n * 0.004
    ax = Vector((0.36, 0, 0.08)).normalized().cross(Vector((0, 1, 0)))
    for (y, r, t) in ((0.64, 0.105, 0.45), (0.93, 0.065, 0.45), (0.36, 0.065, 0.45)):
        c = on_face(y, t)
        mb.cyl(c, face_n, r + 0.012, 0.02, M["chrome"], seg=24)
        mb.cyl(c + face_n * 0.006, face_n, r, 0.02, M["black"], seg=24)
        mb.cyl(c + face_n * 0.011, face_n, r * 0.92, 0.01, M["gauge_face"], seg=24)
        mb.beam(c + face_n * 0.018, c + face_n * 0.018 + Vector((0.6 * r, -0.55 * r, 0.12 * r)), 0.006, 0.003, needle)
    # TIMS monitors: one in the hood, one in the centre console
    for (yc, w) in ((0.0, 0.42), (-0.62, 0.48)):
        mb.box((xF - 0.62, yc, 1.92), (0.06, w + 0.06, 0.30), panel, Matrix.Rotation(math.radians(-25), 3, "Y"))
        mb.poly([(xF - 0.66, yc - w / 2, 1.80), (xF - 0.66, yc + w / 2, 1.80), (xF - 0.55, yc + w / 2, 2.04), (xF - 0.55, yc - w / 2, 2.04)], M["screen"], (-1, 0, 0.45))
    # staff timetable holder (left of the driver) + clock
    mb.poly([(xF - 0.90, 0.95, 1.73), (xF - 0.90, 1.25, 1.73), (xF - 0.62, 1.25, 1.80), (xF - 0.62, 0.95, 1.80)], tt, (-0.2, 0, 1))
    mb.box((xF - 0.76, 1.10, 1.76), (0.32, 0.34, 0.02), trim)
    # switches / lamps rows on the centre console
    for k in range(10):
        mb.cyl((xF - 0.82, -1.25 + k * 0.085, 1.735), (0, 0, 1), 0.018, 0.025, M[["head", "tail", "green_mark", "chrome", "chrome"][k % 5]], seg=8)
        mb.box((xF - 0.70, -1.25 + k * 0.085, 1.75), (0.05, 0.04, 0.02), M["dkgrey"])
    # one-handle master controller base (left of driver)
    mb.box((xF - 0.80, 1.18, 1.55), (0.45, 0.22, 0.32), panel)
    mb.box((xF - 0.80, 1.18, 1.715), (0.40, 0.03, 0.01), M["black"])            # handle slot
    # driver seat
    seat = mat("cab_seat", (0.08, 0.10, 0.16), 0.0, 0.85)
    mb.box((xF - 1.40, 0.72, 1.70), (0.5, 0.5, 0.1), seat)
    mb.box((xF - 1.67, 0.72, 2.05), (0.08, 0.5, 0.6), seat)
    mb.cyl((xF - 1.40, 0.72, 1.47), (0, 0, 1), 0.05, 0.45, M["chrome"], seg=8)
    # ceiling light + speaker
    mb.box((xF - 1.2, 0, zc - 0.02), (0.6, 0.25, 0.02), M["lamp"])
    cab = mb.build(coll)

    # master controller handle as its own object (animated by the sim).
    hb = MB("mascon_handle")
    hb.beam((0, 0, 0), (0, 0, 0.22), 0.03, 0.03, M["chrome"])
    hb.cyl((0, 0, 0.24), (0, 1, 0), 0.03, 0.22, M["handle"], seg=10)
    hb.box((0, 0, 0.0), (0.06, 0.06, 0.03), M["dkgrey"])
    h = hb.build(coll)
    h.location = (xF - 0.80, 1.18, 1.71)
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
