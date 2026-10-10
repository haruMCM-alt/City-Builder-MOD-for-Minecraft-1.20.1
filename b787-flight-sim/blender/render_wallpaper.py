"""
4K wallpaper renders (Cycles path tracing) of an aircraft taking off and landing.

    AC_TYPE=b789 python3 render_wallpaper.py takeoff|landing [--res 3840x2160] [--samples 64] [--out DIR]

takeoff: golden-hour sun, the moment of rotation (nose 9 deg up, mains just off), seen low
         from beside the runway with a telephoto lens
landing: blue hour after sunset, short final over the threshold with landing, nav, strobe and
         logo lights on, runway edge lights and approach lights below
The aircraft comes from output/<asset>.blend (flaps / slats set through the part hinges);
runway markings are painted into textures, grass / hills / haze are procedural.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import common as C  # noqa: E402
import b787_geometry as G  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
SCENE = ARGS[0] if ARGS else "takeoff"


def opt(name, default):
    return ARGS[ARGS.index(name) + 1] if name in ARGS else default


RES = tuple(int(v) for v in opt("--res", "3840x2160").split("x"))
SAMPLES = int(opt("--samples", "64"))
OUT = opt("--out", os.path.join(C.ROOT, "dist", "wallpapers"))
os.makedirs(OUT, exist_ok=True)
META = json.load(open(os.path.join(C.ROOT, "web", "assets", G.ASSET + ".json")))
GZ = G.GROUND_Z
K = G.LENGTH / 62.81          # camera distances scale with the aircraft
TEX_DIR = os.path.join(C.ROOT, "blender", "output", "wallpaper_tex")
os.makedirs(TEX_DIR, exist_ok=True)


def t2b(p):
    """three.js aircraft frame (x fwd, y up, z right) -> Blender (X fwd, Y left, Z up)."""
    return Vector((p[0], -p[2], p[1]))


# --------------------------------------------------------------------------- textures
def runway_textures():
    """Two 10 px/m textures (60 m wide): the first 600 m from the threshold, and a 300 m
    repeating middle section; asphalt with grain, patches and rubber deposits."""
    from PIL import Image, ImageDraw, ImageFilter
    paths = (os.path.join(TEX_DIR, "rwy_thr.png"), os.path.join(TEX_DIR, "rwy_mid.png"))
    if all(os.path.exists(p) for p in paths):
        return paths
    ppm, W = 10, 60
    rng = np.random.default_rng(7)

    def asphalt(L, rubber):
        h, w = L * ppm, W * ppm
        base = 0.115 + 0.018 * rng.standard_normal((h // 8 + 1, w // 8 + 1))
        img = Image.fromarray(np.clip(base * 255, 0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
        a = np.asarray(img, dtype=np.float32) / 255
        a += 0.035 * rng.standard_normal((h, w))                        # grain
        # slab / resurfacing patches (lighter and darker)
        for _ in range(int(L / 25)):
            y0, x0 = rng.integers(0, h), rng.integers(0, w)
            ph, pw = rng.integers(40, 400), rng.integers(30, 250)
            a[y0:y0 + ph, x0:x0 + pw] += rng.uniform(-0.025, 0.03)
        if rubber:      # tyre rubber in the wheel tracks of the touchdown zone
            y = np.arange(h)[:, None] / ppm
            x = (np.arange(w)[None, :] / ppm) - W / 2
            band = np.exp(-((np.abs(x) - 4.5) / 3.2) ** 2) + 0.6 * np.exp(-(x / 2.0) ** 2)
            along = np.clip((y - 120) / 80, 0, 1) * np.clip((L - y) / 60, 0, 1)
            streak = 0.6 + 0.4 * rng.random((h, 1))
            a -= 0.07 * band * along * streak
        return np.clip(a, 0, 1)

    def paint(a, rects):
        img = Image.fromarray((np.stack([a] * 3, -1) * 255).astype(np.uint8))
        d = ImageDraw.Draw(img)
        for (x0, y0, x1, y1) in rects:   # metres: x across (-30..30), y along
            d.rectangle([(x0 + W / 2) * ppm, y0 * ppm, (x1 + W / 2) * ppm, y1 * ppm], fill=(222, 222, 216))
        img = img.filter(ImageFilter.GaussianBlur(0.6))
        # worn paint: darken the markings a little at random
        arr = np.asarray(img, dtype=np.float32)
        wear = 1 - 0.18 * rng.random(arr.shape[:2])[..., None] * (arr > 150)
        return Image.fromarray(np.clip(arr * wear, 0, 255).astype(np.uint8))

    edges = lambda L: [(-29.1, 0, -28.2, L), (28.2, 0, 29.1, L)]   # noqa: E731
    # threshold section: piano keys, runway number, centre line, aiming point, TDZ bars
    L = 600
    R = edges(L)
    for i in range(8):
        for sgn in (-1, 1):
            x = sgn * (3.0 + i * 3.4)
            R.append((min(x, x + sgn * 1.8), 6, max(x, x + sgn * 1.8), 36))
    # "34" built from bars (7-segment style, 9 m wide digits, 18 m tall)
    def digit(cx, y0, n):
        segs = {"3": "abcdg", "4": "bcfg"}[n]
        w, hgt, t = 6.0, 18.0, 1.0
        S = dict(a=(cx - w / 2, y0, cx + w / 2, y0 + t), g=(cx - w / 2, y0 + hgt / 2 - t / 2, cx + w / 2, y0 + hgt / 2 + t / 2),
                 d=(cx - w / 2, y0 + hgt - t, cx + w / 2, y0 + hgt), b=(cx + w / 2 - t, y0, cx + w / 2, y0 + hgt / 2),
                 c=(cx + w / 2 - t, y0 + hgt / 2, cx + w / 2, y0 + hgt), f=(cx - w / 2, y0, cx - w / 2 + t, y0 + hgt / 2))
        return [S[s] for s in segs]
    R += digit(4.5, 48, "3") + digit(-4.5, 48, "4")
    for y in range(90, L, 50):
        R.append((-0.45, y, 0.45, y + 30))
    for y0 in (150, 450):
        for sgn in (-1, 1):
            for j in range(3):
                x = sgn * (6 + j * 2.6)
                R.append((min(x, x + sgn * 1.8), y0, max(x, x + sgn * 1.8), y0 + 22.5))
    for sgn in (-1, 1):     # aiming point
        R.append((min(sgn * 6, sgn * 16), 300, max(sgn * 6, sgn * 16), 345))
    a = asphalt(L, True)
    paint(a, R).save(paths[0])
    # middle section (300 m tile)
    L = 300
    R = edges(L) + [(-0.45, y, 0.45, y + 30) for y in range(10, L, 50)]
    paint(asphalt(L, False), R).save(paths[1])
    return paths


# --------------------------------------------------------------------------- scene
def material(name, build):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        if n.type != "OUTPUT_MATERIAL":
            nt.nodes.remove(n)
    out = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"][0]
    build(nt, out)
    return m


def plane(name, x0, x1, y0, y1, z, mat, uv=None, cuts=1):
    me = bpy.data.meshes.new(name)
    xs = np.linspace(x0, x1, cuts + 1)
    verts = [(x, y, z) for x in xs for y in (y0, y1)]
    faces = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(cuts)]
    me.from_pydata(verts, [], faces)
    if uv:
        lay = me.uv_layers.new()
        for poly in me.polygons:
            for li in poly.loop_indices:
                v = me.vertices[me.loops[li].vertex_index].co
                lay.data[li].uv = uv(v)
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def image_mat(name, path, rough=0.82):
    def b(nt, out):
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path)
        tex.interpolation = "Cubic"
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Specular IOR Level"].default_value = 0.3
        nt.links.new(tex.outputs[0], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.25
        bump.inputs["Distance"].default_value = 0.004
        nt.links.new(tex.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    return material(name, b)


def grass_mat():
    def b(nt, out):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        n1 = nt.nodes.new("ShaderNodeTexNoise")
        n1.inputs["Scale"].default_value = 0.004
        n1.inputs["Detail"].default_value = 8
        n2 = nt.nodes.new("ShaderNodeTexNoise")
        n2.inputs["Scale"].default_value = 0.35
        n2.inputs["Detail"].default_value = 6
        nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])
        nt.links.new(tc.outputs["Object"], n2.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.028, 0.055, 0.014, 1)
        ramp.color_ramp.elements[1].color = (0.085, 0.10, 0.032, 1)
        mix = nt.nodes.new("ShaderNodeMath")
        mix.operation = "MULTIPLY_ADD"
        mix.inputs[1].default_value = 0.5
        nt.links.new(n1.outputs[0], mix.inputs[0])
        nt.links.new(n2.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], ramp.inputs[0])
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Roughness"].default_value = 0.95
        bsdf.inputs["Specular IOR Level"].default_value = 0.08   # grass blades: no grazing sheen
        nt.links.new(ramp.outputs[0], bsdf.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.6
        nt.links.new(n2.outputs[0], bump.inputs["Height"])
        nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
        nt.links.new(bsdf.outputs[0], out.inputs[0])
    return material("Grass", b)


def emit_mat(name, rgb, strength):
    def b(nt, out):
        e = nt.nodes.new("ShaderNodeEmission")
        e.inputs["Color"].default_value = (*rgb, 1)
        e.inputs["Strength"].default_value = strength
        nt.links.new(e.outputs[0], out.inputs[0])
    return material(name, b)


def hills(seed=3):
    """A ring of low hills 7-16 km away (aerial perspective does the rest)."""
    rng = np.random.default_rng(seed)
    na, nr = 360, 10
    verts, faces = [], []
    for j in range(nr):
        r = 7000 + j * 1000
        for i in range(na):
            a = 2 * math.pi * i / na
            h = 0
            for f, amp in ((3, 160), (7, 90), (17, 45), (41, 20)):
                h += amp * (0.5 + 0.5 * math.sin(f * a + rng.uniform(0, 6.28) * 0 + j * 0.7 + f))
            h *= (j / (nr - 1)) ** 0.7 * (0.6 + 0.4 * math.sin(2 * a + 1.3))
            verts.append((r * math.cos(a), r * math.sin(a), GZ - 2 + h))
    for j in range(nr - 1):
        for i in range(na):
            a0, a1 = j * na + i, j * na + (i + 1) % na
            faces.append((a0, a1, a1 + na, a0 + na))
    me = bpy.data.meshes.new("Hills")
    me.from_pydata(verts, [], faces)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(grass_mat())
    ob = bpy.data.objects.new("Hills", me)
    bpy.context.scene.collection.objects.link(ob)


def clouds(alt, cover, scale, seed=0.0):
    """A thin broken cloud deck: a big plane whose alpha is fractal noise (lit by the sun /
    sky like any surface, translucent so the low sun glows through the thin parts)."""
    def b(nt, out):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Scale"].default_value = (1.0 / scale, 1.6 / scale, 1.0)
        mp.inputs["Location"].default_value = (seed, seed * 0.7, 0)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        n = nt.nodes.new("ShaderNodeTexNoise")
        n.inputs["Scale"].default_value = 1.0
        n.inputs["Detail"].default_value = 12
        n.inputs["Roughness"].default_value = 0.62
        nt.links.new(mp.outputs[0], n.inputs["Vector"])
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 1.0 - cover
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        ramp.color_ramp.elements[1].position = min(1.0, 1.0 - cover + 0.16)
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        nt.links.new(n.outputs[0], ramp.inputs[0])
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
        bsdf.inputs["Base Color"].default_value = (0.92, 0.93, 0.95, 1)
        bsdf.inputs["Roughness"].default_value = 1.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
        bsdf.inputs["Subsurface Weight"].default_value = 0.0
        tr = nt.nodes.new("ShaderNodeBsdfTranslucent")
        tr.inputs["Color"].default_value = (0.95, 0.92, 0.88, 1)
        mixs = nt.nodes.new("ShaderNodeMixShader")
        mixs.inputs[0].default_value = 0.7
        nt.links.new(bsdf.outputs[0], mixs.inputs[1])
        nt.links.new(tr.outputs[0], mixs.inputs[2])
        tp = nt.nodes.new("ShaderNodeBsdfTransparent")
        mixa = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(ramp.outputs[0], mixa.inputs[0])
        nt.links.new(tp.outputs[0], mixa.inputs[1])
        nt.links.new(mixs.outputs[0], mixa.inputs[2])
        nt.links.new(mixa.outputs[0], out.inputs[0])
    ob = plane("Clouds%d" % alt, -30000, 30000, -30000, 30000, GZ + alt, material("CloudM%d" % alt, b))
    ob.visible_shadow = False
    return ob


def airport_buildings():
    """Hangars, a terminal and a control tower 1.2-2.5 km to the far side of the runway (they
    end up soft in the depth of field and haze)."""
    rng = np.random.default_rng(11)
    concrete = material("Bldg", lambda nt, out: (lambda b: (setattr(b.inputs["Base Color"], "default_value", (0.30, 0.31, 0.32, 1)),
                                                             setattr(b.inputs["Roughness"], "default_value", 0.7),
                                                             nt.links.new(b.outputs[0], out.inputs[0])))(nt.nodes.new("ShaderNodeBsdfPrincipled")))
    glass = material("BldgGlass", lambda nt, out: (lambda b: (setattr(b.inputs["Base Color"], "default_value", (0.05, 0.07, 0.09, 1)),
                                                               setattr(b.inputs["Roughness"], "default_value", 0.08),
                                                               setattr(b.inputs["Metallic"], "default_value", 0.6),
                                                               nt.links.new(b.outputs[0], out.inputs[0])))(nt.nodes.new("ShaderNodeBsdfPrincipled")))

    def box(x, y, z0, sx, sy, sz, m):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z0 + sz / 2))
        o = bpy.context.active_object
        o.scale = (sx, sy, sz)
        o.data.materials.append(m)
        return o
    x = -3000
    while x < 4000:
        w = rng.uniform(90, 220)
        box(x, 2900 + rng.uniform(-80, 120), GZ, w, rng.uniform(70, 110), rng.uniform(16, 30), concrete)
        x += w + rng.uniform(30, 120)
    box(900, 3300, GZ, 1100, 120, 24, glass)                       # terminal
    t = box(-700, 2500, GZ, 9, 9, 62, concrete)                    # tower shaft
    box(-700, 2500, GZ + 62, 16, 16, 7, glass)                     # tower cab
    void_ = t


def haze(density):
    """Homogeneous aerial-perspective volume over the whole scene."""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, GZ + 499))
    cube = bpy.context.active_object
    cube.name = "Haze"
    cube.scale = (26000, 26000, 1000)

    def b(nt, out):
        v = nt.nodes.new("ShaderNodeVolumePrincipled")
        v.inputs["Density"].default_value = density
        v.inputs["Color"].default_value = (0.85, 0.9, 1.0, 1)
        v.inputs["Anisotropy"].default_value = 0.6
        nt.links.new(v.outputs[0], out.inputs["Volume"])
    cube.data.materials.append(material("HazeMat", b))
    cube.visible_shadow = False


def sun_and_sky(elev, az, strength=1.0, sun_energy=4.0, warm=1.0):
    """az: compass-like angle in the Blender XY plane (0 = +X, 90 = +Y) towards the sun."""
    scene = bpy.context.scene
    world = bpy.data.worlds.new("WSky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    for t in ("MULTIPLE_SCATTERING", "NISHITA"):
        try:
            sky.sky_type = t
            break
        except TypeError:
            pass
    sky.sun_elevation = math.radians(elev)
    # Blender's sky: rotation 0 puts the sun towards -Y; increasing turns it towards +X
    sky.sun_rotation = math.radians(az - 270.0)
    sky.altitude = 30
    for k, v in (("air_density", 1.0), ("aerosol_density", 1.0), ("ozone_density", 1.0)):
        if hasattr(sky, k):
            setattr(sky, k, v)
    try:
        sky.sun_disc = True
    except AttributeError:
        pass
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    if sun_energy > 0:
        sd = bpy.data.lights.new("Sun", "SUN")
        sd.energy = sun_energy
        sd.angle = math.radians(0.53)
        e = math.radians(elev)
        sd.color = (1.0, 0.86 * warm + (1 - warm), 0.68 * warm + (1 - warm))
        sun = bpy.data.objects.new("Sun", sd)
        scene.collection.objects.link(sun)
        to_sun = Vector((math.cos(math.radians(az)) * math.cos(e), math.sin(math.radians(az)) * math.cos(e), math.sin(e)))
        sun.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()


def camera(loc, target, lens, fstop=5.6):
    cd = bpy.data.cameras.new("WCam")
    cd.lens = lens
    cd.clip_start = 0.5
    cd.clip_end = 60000
    cd.dof.use_dof = True
    cd.dof.aperture_fstop = fstop
    cd.dof.focus_distance = (Vector(target) - Vector(loc)).length
    cam = bpy.data.objects.new("WCam", cd)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = loc
    cam.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def point_light(name, loc, energy, rgb, radius=0.05):
    ld = bpy.data.lights.new(name, "POINT")
    ld.energy = energy
    ld.color = rgb
    ld.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    bpy.context.scene.collection.objects.link(ob)
    return ob


def spot_light(name, loc, direction, energy, angle_deg, rgb=(1, 0.95, 0.85)):
    ld = bpy.data.lights.new(name, "SPOT")
    ld.energy = energy
    ld.color = rgb
    ld.spot_size = math.radians(angle_deg)
    ld.spot_blend = 0.6
    ld.shadow_soft_size = 0.12
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.collection.objects.link(ob)
    return ob


# --------------------------------------------------------------------------- aircraft
def pose_aircraft(flap_deg, slat_frac, pitch_deg, lift, along):
    """Flaps / slats through the part hinges (object local X = hinge axis), then pitch the
    whole aircraft about the main-gear contact and move it."""
    for o in bpy.data.objects:
        if o.name.startswith(("Proto_", "Cabin_")) or o.name.endswith("_Cabin"):
            o.hide_render = True
    parts = {p["name"]: p for p in META["parts"]}
    for o in bpy.data.objects:
        p = parts.get(o.name)
        if not p:
            continue
        a = 0.0
        if p["kind"] == "flap":
            a = min(flap_deg, p["max"])
        elif p["kind"] == "slat":
            a = p["max"] * slat_frac
        elif p["kind"] == "flaperon":
            a = min(flap_deg * 0.55, 18)
        elif p["kind"] == "aileron":
            a = min(flap_deg * 0.2, 5)
        if a:
            o.matrix_basis = o.matrix_basis @ Matrix.Rotation(math.radians(a), 4, "X")
    root = [o for o in bpy.data.objects if o.parent is None and o.type in ("EMPTY", "MESH") and not o.name.endswith("_Cabin")
            and not o.name.startswith(("Proto_", "Cabin_"))][0]
    mg = [p for p in META["parts"] if p["kind"] == "gear" and p["name"].startswith("MainGear")][0]
    piv = Vector((mg["contact"][0], 0.0, GZ))
    R = Matrix.Translation(piv) @ Matrix.Rotation(math.radians(-pitch_deg), 4, "Y") @ Matrix.Translation(-piv)
    root.matrix_world = Matrix.Translation((along, 0, lift)) @ R @ root.matrix_world
    bpy.context.view_layer.update()
    return root, R, Vector((along, 0, lift))


LIVERY = opt("--livery", None)
LIV_DIR = os.path.join(TEX_DIR, "livery")


def _lin(a8):
    a = np.asarray(a8, dtype=np.float64) / 255.0
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def _hex(h):
    return _lin([int(h[i:i + 2], 16) for i in (1, 3, 5)])


def _float_image(name, arr):
    """arr: (rows bottom-first, cols, 4) linear RGBA -> packed float image."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=True)
    img.pixels.foreach_set(np.ascontiguousarray(arr, dtype=np.float32).ravel())
    return img


def _rgba(path, w, h, flip_x=False):
    """PNG -> (h, w, 4) bottom-first rows, linear premultiplied rgb + alpha."""
    from PIL import Image
    im = Image.open(path).convert("RGBA").resize((max(1, int(round(w))), max(1, int(round(h)))), Image.LANCZOS)
    a = np.asarray(im, dtype=np.float64)
    if flip_x:
        a = a[:, ::-1]
    a = a[::-1]
    out = np.empty(a.shape)
    out[..., 3] = a[..., 3] / 255.0
    out[..., :3] = _lin(a[..., :3]) * out[..., 3:4]
    return out


def _over(dst, src, s0, z0, ppm, s_left, z_bottom, mult_white=None):
    """Alpha-over a bottom-first premultiplied patch whose lower-left corner is (s_left, z_bottom)."""
    j0, i0 = int(round((s_left - s0) * ppm)), int(round((z_bottom - z0) * ppm))
    h, w = src.shape[:2]
    a0, b0 = max(0, i0), max(0, j0)
    a1, b1 = min(dst.shape[0], i0 + h), min(dst.shape[1], j0 + w)
    if a1 <= a0 or b1 <= b0:
        return
    patch = src[a0 - i0:a1 - i0, b0 - j0:b1 - j0]
    al = patch[..., 3:4]
    rgb = patch[..., :3] / (mult_white if mult_white is not None else 1.0)
    dst[a0:a1, b0:b1, :3] = dst[a0:a1, b0:b1, :3] * (1 - al) + rgb


def _planar(nt, root, s_cg, s_a, s_rng, z_a, z_rng):
    """(u, v) = ((s - s_a) / s_rng, (z - z_a) / z_rng) from the aircraft-root object space, and
    the side factor (1 = left, Blender +Y)."""
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tc.object = root
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def m(op, a, b):
        n = nt.nodes.new("ShaderNodeMath")
        n.operation = op
        for k, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[k].default_value = v
            else:
                nt.links.new(v, n.inputs[k])
        return n.outputs[0]
    u = m("DIVIDE", m("SUBTRACT", m("SUBTRACT", s_cg, sep.outputs["X"]), s_a), s_rng)
    v = m("DIVIDE", m("SUBTRACT", sep.outputs["Z"], z_a), z_rng)
    cxyz = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(u, cxyz.inputs[0])
    nt.links.new(v, cxyz.inputs[1])
    side = m("GREATER_THAN", sep.outputs["Y"], 0.0)
    return cxyz.outputs[0], side


def _two_sided(nt, vec, side, img_l, img_r):
    texs = []
    for img in (img_r, img_l):
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        t.extension = "EXTEND"
        t.interpolation = "Cubic"
        nt.links.new(vec, t.inputs["Vector"])
        texs.append(t)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    nt.links.new(side, mix.inputs["Factor"])
    nt.links.new(texs[0].outputs["Color"], mix.inputs["A"])
    nt.links.new(texs[1].outputs["Color"], mix.inputs["B"])
    return mix.outputs["Result"]


def apply_livery(root, airline):
    """The game's JAL / ANA livery (web/js/livery.js) on the Blender model: the same belly paint,
    cheat lines and title as the fuselage shader (a planar side projection in s / z, exactly what
    the shader evaluates), the fin canvas + mark, and the nacelle colour.  The title / fin / mark
    images come from the game itself (tools/export_livery.mjs)."""
    base = os.path.join(LIV_DIR, "%s_%s" % (G.ASSET, airline))
    L = json.load(open(base + ".json"))
    lay = L["layout"]
    white = _hex(lay["white"])
    s_cg = lay["sCG"]
    B, TR, FR = lay["belly"], L["titleRect"], L["finRect"]
    prim, prim2, acc1, acc2 = (np.array(L[k]) for k in ("prim", "prim2", "acc1", "acc2"))
    # ---- fuselage multiplier map (s across, z up)
    ppm = 90.0
    s0, s1 = -2.0, G.LENGTH + 2.0
    z0 = min(B["z"]) - 1.5
    z1 = max(max(B["z"]), TR[2]) + 0.5
    W, H = int((s1 - s0) * ppm), int((z1 - z0) * ppm)
    S = s0 + (np.arange(W) + 0.5) / ppm
    Z = (z0 + (np.arange(H) + 0.5) / ppm)[:, None]
    zl = np.interp(S, B["s"], B["z"])[None, :]
    aw = 1.2 / ppm
    paint = np.clip(0.5 - (Z - zl) / aw, 0, 1)[..., None]
    fade = np.clip((zl - Z) / B["fade"], 0, 1)[..., None]
    col = (prim2 * (1 - fade) + prim * fade) / white
    f = 1 + (col - 1) * paint
    on = (S > B["stripeS0"])[None, :, None]
    for (off, wd), acc in zip(B["stripes"], (acc1, acc2)):
        d = np.abs(Z - (zl + off)) - 0.5 * wd
        k = np.clip(0.5 - d / aw, 0, 1)[..., None] * on
        f = f * (1 - k) + (acc / white) * k
    fl = np.concatenate([f, np.ones(f.shape[:2] + (1,))], -1)
    fr = fl.copy()
    tx, tlen, ttop, th = TR
    _over(fl, _rgba(base + "_title.png", tlen * ppm, th * ppm), s0, z0, ppm, tx, ttop - th, white)
    _over(fr, _rgba(base + "_title.png", tlen * ppm, th * ppm, flip_x=True), s0, z0, ppm, tx, ttop - th, white)
    fus_l, fus_r = _float_image("LivFusL", fl), _float_image("LivFusR", fr)
    # ---- fin: the game's fin canvas (gradient / sweep) + the mark, mirrored on the right
    T = lay["tail"]
    ppt = 120.0
    tw, thh = (T["s1"] - T["s0"]) * ppt, (T["z1"] - T["z0"]) * ppt
    canvas = _rgba(base + "_tail.png", tw, thh)
    tl, trr = canvas.copy(), canvas.copy()
    Rx, Ry, R = FR[0], FR[1], FR[2]
    _over(tl, _rgba(base + "_fin.png", 2 * R * ppt, 2 * R * ppt), T["s0"], T["z0"], ppt, Rx - R, Ry - R)
    _over(trr, _rgba(base + "_fin.png", 2 * R * ppt, 2 * R * ppt, flip_x=True), T["s0"], T["z0"], ppt, Rx - R, Ry - R)
    tail_l, tail_r = _float_image("LivTailL", tl), _float_image("LivTailR", trr)
    # ---- materials
    fus = bpy.data.materials.get("B787_Fuselage")
    if fus:
        plain = fus.copy()          # the gear legs keep the unpainted skin
        for o in bpy.data.objects:
            if o.name.startswith(("MainGear", "NoseGear")):
                for sl in o.material_slots:
                    if sl.material == fus:
                        sl.material = plain
        nt = fus.node_tree
        bsdf = [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"][0]
        lk = bsdf.inputs["Base Color"].links
        vec, side = _planar(nt, root, s_cg, s0, s1 - s0, z0, z1 - z0)
        liv = _two_sided(nt, vec, side, fus_l, fus_r)
        mul = nt.nodes.new("ShaderNodeMix")
        mul.data_type = "RGBA"
        mul.blend_type = "MULTIPLY"
        mul.inputs["Factor"].default_value = 1.0
        if lk:
            nt.links.new(lk[0].from_socket, mul.inputs["A"])
        else:
            mul.inputs["A"].default_value = bsdf.inputs["Base Color"].default_value
        nt.links.new(liv, mul.inputs["B"])
        nt.links.new(mul.outputs["Result"], bsdf.inputs["Base Color"])
    tail = bpy.data.materials.get("B787_Tail")
    if tail:
        nt = tail.node_tree
        bsdf = [n for n in nt.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled"][0]
        vec, side = _planar(nt, root, s_cg, T["s0"], T["s1"] - T["s0"], T["z0"], T["z1"] - T["z0"])
        nt.links.new(_two_sided(nt, vec, side, tail_l, tail_r), bsdf.inputs["Base Color"])
    nc = list(L["nacelle"]) + [1.0]
    for n in ("B787_Nacelle", "B787_Navy"):
        m = bpy.data.materials.get(n)
        if not m:
            continue
        bsdf = [x for x in m.node_tree.nodes if x.bl_idname == "ShaderNodeBsdfPrincipled"][0]
        for l in list(bsdf.inputs["Base Color"].links):
            m.node_tree.links.remove(l)
        bsdf.inputs["Base Color"].default_value = nc


def aircraft_lights(R, off, landing):
    L = META.get("lights", {})
    w = lambda n: Matrix.Translation(off) @ R @ t2b(L[n]) if n in L else None   # noqa: E731
    pitch_fwd = (R.to_3x3() @ Vector((1, 0, 0))).normalized()
    for side, col in (("L", (1, 0.05, 0.03)), ("R", (0.05, 1, 0.15))):
        p = w("NavLight_" + side)
        if p is not None:
            point_light("Nav" + side, p, 60, col, 0.08)
        p = w("Strobe_" + side)
        if p is not None and landing:
            point_light("Strobe" + side, p + Vector((0, 0, 0.05)), 900, (1, 1, 1), 0.06)
    for n in ("Beacon_Top", "Beacon_Bottom"):
        p = w(n)
        if p is not None:
            point_light(n, p, 120, (1, 0.08, 0.02), 0.08)
    if landing:
        for n in ("LandingLight_L", "LandingLight_R"):
            p = w(n)
            if p is None:
                continue
            d = (pitch_fwd + Vector((0, 0, -0.10))).normalized()
            spot_light(n, p + pitch_fwd * 0.2, d, 2.2e6 if n.startswith("Landing") else 6e5, 14 if n.startswith("Landing") else 40)
            # the lamp itself: a small bright emitter (seen head-on it flares in the haze)
            bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=p + pitch_fwd * 0.15, segments=12, ring_count=8)
            g = bpy.context.active_object
            g.data.materials.append(emit_mat(n + "_lamp", (1, 0.95, 0.85), 150))
            g.visible_shadow = False
        for n in ("LogoLight_L", "LogoLight_R"):
            p = w(n)
            if p is not None:
                spot_light(n, p, (0, 0, 1) if True else None, 6000, 70)


# --------------------------------------------------------------------------- build
def build(scene_name):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(C.OUT_DIR, G.ASSET + ".blend"))
    thr, mid = runway_textures()
    landing = scene_name == "landing"
    # runway along X (aircraft heading +X); threshold behind the aircraft for landing
    x_thr = -40 * K - 260 if landing else -1500
    t_mat, m_mat = image_mat("RwyThr", thr), image_mat("RwyMid", mid)
    plane("RunwayThr", x_thr, x_thr + 600, -30, 30, GZ + 0.004, t_mat, cuts=20,
          uv=lambda v: ((v.y + 30) / 60, (v.x - x_thr) / 600))
    plane("RunwayMid", x_thr + 600, x_thr + 4000, -30, 30, GZ + 0.004, m_mat, cuts=60,
          uv=lambda v: ((v.y + 30) / 60, (v.x - x_thr - 600) / 300))
    # shoulders (darker, older asphalt) and the grass
    plane("Shoulder", x_thr - 60, x_thr + 4060, -37.5, 37.5, GZ + 0.001,
          material("ShoulderM", lambda nt, out: (lambda b: (setattr(b.inputs["Base Color"], "default_value", (0.06, 0.06, 0.058, 1)),
                                                              setattr(b.inputs["Roughness"], "default_value", 0.9), setattr(b.inputs["Specular IOR Level"], "default_value", 0.3),
                                                              nt.links.new(b.outputs[0], out.inputs[0])))(nt.nodes.new("ShaderNodeBsdfPrincipled"))))
    plane("Grass", -15000, 15000, -15000, 15000, GZ - 0.02, grass_mat())
    hills()
    # runway edge lights every 60 m, threshold lights (green), approach lights for landing
    edge = emit_mat("EdgeLight", (1.0, 0.86, 0.6), 40 if landing else 2)
    green = emit_mat("ThrLight", (0.2, 1.0, 0.35), 40 if landing else 2)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.12, depth=0.35, vertices=10)
    proto = bpy.context.active_object
    proto.data.materials.append(edge)
    for x in np.arange(x_thr, x_thr + 4000, 60):
        for y in (-31.5, 31.5):
            o = proto.copy()
            o.location = (x, y, GZ + 0.18)
            bpy.context.scene.collection.objects.link(o)
    pg = proto.copy()
    pg.data = proto.data.copy()
    pg.data.materials[0] = green
    for y in np.arange(-30, 30.1, 3):
        o = pg.copy()
        o.location = (x_thr - 2, y, GZ + 0.18)
        bpy.context.scene.collection.objects.link(o)
    if landing:
        for i in range(1, 30):
            for y in np.arange(-4.5, 4.6, 1.5):
                o = proto.copy()
                o.location = (x_thr - i * 30, y, GZ + 0.6)
                bpy.context.scene.collection.objects.link(o)
    proto.location = (0, 0, -100)
    pg.location = (0, 0, -100)
    # aircraft
    if landing:
        root, R, off = pose_aircraft(30, 1.0, 4.0, 12 * K + 2, x_thr + 140)
        if LIVERY:
            apply_livery(root, LIVERY)
        aircraft_lights(R, off, True)
        sun_and_sky(-3.0, 170, strength=0.25, sun_energy=0)
        clouds(5500, 0.35, 5000, 5.0)
        airport_buildings()
        haze(0.00004)
        ac = off + Vector((0, 0, GZ + 6))
        camera(ac + Vector((150 * K, -55 * K, -10 * K - 3)), ac + Vector((-4 * K, 0, 0)), 70, 4.0)
    else:
        root, R, off = pose_aircraft(15, 0.75, 9.0, 1.4, 0)
        if LIVERY:
            apply_livery(root, LIVERY)
        aircraft_lights(R, off, False)
        sun_and_sky(4.0, 165, strength=0.25, sun_energy=3.4, warm=1.0)
        clouds(2200, 0.52, 2200, 3.0)
        clouds(7500, 0.40, 7000, 9.0)
        airport_buildings()
        if '--nohaze' not in ARGS:
            haze(0.00006)
        ac = off + Vector((0, 0, GZ + 5 * K))
        camera(ac + Vector((80 * K, -160 * K, 1.6 - 5 * K)), ac + Vector((2 * K, 0, 7 * K)), 70, 5.6)
    return landing


def render(path):
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    s.cycles.samples = SAMPLES
    s.cycles.use_adaptive_sampling = True
    s.cycles.adaptive_threshold = 0.02
    s.cycles.use_denoising = True
    try:
        s.cycles.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    s.cycles.max_bounces = 8
    s.cycles.volume_bounces = 1
    s.cycles.transparent_max_bounces = 8
    s.cycles.caustics_reflective = False
    s.cycles.caustics_refractive = False
    s.cycles.blur_glossy = 1.0
    s.render.resolution_x, s.render.resolution_y = RES
    s.render.resolution_percentage = 100
    vt = [i.identifier for i in s.view_settings.bl_rna.properties["view_transform"].enum_items]
    s.view_settings.view_transform = "AgX" if "AgX" in vt else "Filmic"
    try:
        s.view_settings.look = "AgX - Punchy"
    except TypeError:
        pass
    s.view_settings.exposure = float(opt("--exposure", "1.4" if SCENE == "landing" else "0.0"))
    s.render.image_settings.file_format = "JPEG"
    s.render.image_settings.quality = 94
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendered", path)


if __name__ == "__main__":
    landing = build(SCENE)
    name = "%s_%s%s_%dx%d.jpg" % (G.ASSET, (LIVERY + "_") if LIVERY else "", SCENE, RES[0], RES[1])
    render(os.path.join(OUT, name))
