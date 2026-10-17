"""
Render preview images of the generated .blend files with Cycles (CPU).

    python3 render_previews.py aircraft [--fast] [view ...]
    python3 render_previews.py world    [--fast]
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import b787_geometry as G  # noqa: E402  (AC_TYPE selects the aircraft type)

PREV_DIR = os.path.join(C.ROOT, "docs", "images")
os.makedirs(PREV_DIR, exist_ok=True)


def setup_world(strength=1.0, sun_elev=35, sun_az=-40):
    scene = bpy.context.scene
    world = bpy.data.worlds.new("Sky") if not bpy.data.worlds else bpy.data.worlds[0]
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "MULTIPLE_SCATTERING"
    except TypeError:
        try:
            sky.sky_type = "NISHITA"
        except TypeError:
            pass
    try:
        sky.sun_elevation = math.radians(sun_elev)
        sky.sun_rotation = math.radians(sun_az)
        sky.altitude = 200
    except AttributeError:
        pass
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = math.radians(0.6)
    sun = bpy.data.objects.new("Sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (math.radians(90 - sun_elev), 0, math.radians(sun_az + 180 + 90))


def ground(size=4000, z=-5.25, color=(0.18, 0.18, 0.19, 1)):
    me = bpy.data.meshes.new("PreviewGround")
    s = size / 2
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)])
    ob = bpy.data.objects.new("PreviewGround", me)
    bpy.context.scene.collection.objects.link(ob)
    mat = C.pbr_material("PreviewGroundMat", color=color, roughness=0.8)
    me.materials.append(mat)
    return ob


def camera(loc, target, lens=50):
    cam_data = bpy.data.cameras.new("Cam")
    cam_data.lens = lens
    cam_data.clip_end = 20000
    cam = bpy.data.objects.new("Cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    d = Vector(target) - Vector(loc)
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def render(path, res=(1600, 900), samples=64):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = samples
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    s.render.resolution_x, s.render.resolution_y = res
    s.render.resolution_percentage = 100
    s.render.film_transparent = False
    s.view_settings.view_transform = "AgX" if "AgX" in [i.identifier for i in s.view_settings.bl_rna.properties["view_transform"].enum_items] else "Filmic"
    s.render.image_settings.file_format = "JPEG"
    s.render.image_settings.quality = 90
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


AIRCRAFT_VIEWS = {
    # name: (camera location (Blender), target, lens)
    "hero": ((-38, -44, 6), (2, 0, -1.5), 35),
    "front": ((58, -30, 0.5), (0, 0, -1.5), 50),
    "side": ((0, -120, -2.0), (0, 0, 0.5), 50),
    "top": ((0, 0, 140), (0, 0, 0), 50),
    "rear": ((-70, 30, 4), (0, 0, 0), 45),
    "nose": ((42, -15, 1.0), (27.5, 0, 0.3), 40),
    "engine": ((16, -22, -3.5), (6, -9.8, -2.5), 40),
    "gear": ((6, -16, -4.4), (-1.7, -3, -3.6), 40),
    "tail": ((-10, -30, 8), (-24, 0, 5), 45),
    "front_low": ((45, -8, -4.2), (0, 0, -1.0), 40),
    "cockpit": ((27.7, 0.53, 1.08), (40, 0.4, -0.6), 22),
}


def main():
    what = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else (sys.argv[1] if len(sys.argv) > 1 else "aircraft")
    fast = "--fast" in sys.argv
    views = [a for a in sys.argv[2:] if not a.startswith("--")]
    if what == "aircraft":
        bpy.ops.wm.open_mainfile(filepath=os.path.join(C.OUT_DIR, G.ASSET + ".blend"))
        setup_world(0.22, 32, -35)
        ground(z=G.GROUND_Z)
        k = G.LENGTH / 62.81
        prefix = "b787" if G.TYPE == "b789" else G.ASSET
        for o in bpy.data.objects:
            if o.name.startswith("Proto_") or o.name.startswith("Cabin_"):
                o.hide_render = True
        m = bpy.data.materials.get("B787_Fuselage")
        if m:
            m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 0.0
        for name, (loc, tgt, lens) in AIRCRAFT_VIEWS.items():
            if views and name not in views:
                continue
            if name == "cockpit":
                e = G.to_blender(G.EYE)
                loc, tgt = tuple(e), (e[0] + 12.3, e[1] - 0.13, e[2] - 1.68)
            elif G.TYPE != "b789":
                loc = tuple(v * k for v in loc)
                tgt = tuple(v * k for v in tgt)
                if name in ("engine", "gear", "front_low"):
                    loc = (loc[0], loc[1], max(loc[2], G.GROUND_Z + 0.9))
            camera(loc, tgt, lens)
            fus = bpy.data.objects.get("Fuselage")
            if fus:
                fus.visible_camera = (name != "cockpit")
            if name == "cockpit":
                bpy.context.scene.camera.data.lens = 14
            res = (960, 540) if fast else (1600, 900)
            render(os.path.join(PREV_DIR, "%s_%s.jpg" % (prefix, name)), res, 16 if fast else 96)
    else:
        bpy.ops.wm.open_mainfile(filepath=os.path.join(C.OUT_DIR, "world.blend"))
        setup_world(0.22, 28, 60)
        # preview-only terrain: grass land, sea south of the coast, river
        def plane(name, x0, y0, x1, y1, z, col, rough=0.9, metal=0.0):
            me = bpy.data.meshes.new(name)
            me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)])
            ob = bpy.data.objects.new(name, me)
            bpy.context.scene.collection.objects.link(ob)
            me.materials.append(C.pbr_material(name + "M", color=col, roughness=rough, metallic=metal))
        plane("Land", -30000, -1400, 30000, 30000, -0.02, C.hex_color("#4d6b35"))
        plane("Sea", -30000, -30000, 30000, -1400, -0.5, C.hex_color("#1d3b52"), 0.08)
        plane("River", 2890, -1400, 3110, 9800, -0.01, C.hex_color("#23465e"), 0.08)
        for o in bpy.data.objects:
            if o.name.startswith("TreeProto"):
                o.hide_render = True
        import json
        cams = json.load(open(os.path.join(C.HERE, "world_cameras.json")))
        for name, (loc, tgt, lens) in cams.items():
            if views and name not in views:
                continue
            camera(loc, tgt, lens)
            res = (960, 540) if fast else (1600, 900)
            render(os.path.join(PREV_DIR, "world_%s.jpg" % name), res, 16 if fast else 64)


if __name__ == "__main__":
    main()
