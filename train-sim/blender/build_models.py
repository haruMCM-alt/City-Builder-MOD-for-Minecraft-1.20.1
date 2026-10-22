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


# ---------------------------------------------------------------------------
# Cab surface textures (generated) and baked ambient occlusion
# ---------------------------------------------------------------------------
import numpy as np  # noqa: E402


def _hex(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def _img(name, arr, colorspace="sRGB", fmt="JPEG"):
    """numpy (H, W, 3) array, row 0 = bottom -> packed Blender image"""
    h, w = arr.shape[:2]
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    im = bpy.data.images.new(name, w, h, alpha=False)
    im.colorspace_settings.name = colorspace
    rgba = np.concatenate([np.clip(arr, 0, 1), np.ones((h, w, 1), np.float32)], axis=2).astype(np.float32)
    im.pixels.foreach_set(rgba.ravel())
    im.file_format = fmt
    im.pack()
    return im


def _normal_from_height(hgt, strength):
    gy, gx = np.gradient(hgt)
    n = np.stack([-gx * strength, -gy * strength, np.ones_like(hgt)], axis=2)
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def _grid(n):
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    return (x + 0.5) / n, (y + 0.5) / n


def _noise(n, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), np.float32)
    amp = 1.0
    for o in range(octaves):
        k = 4 * 2 ** o
        g = rng.random((k, k)).astype(np.float32)
        rep = n // k
        up = np.kron(g, np.ones((rep, rep), np.float32))
        # cheap smoothing (wraps -> tileable)
        for _ in range(2):
            up = (up + np.roll(up, rep // 2, 0) + np.roll(up, rep // 2, 1) + np.roll(np.roll(up, rep // 2, 0), rep // 2, 1)) / 4
        out += up * amp
        amp *= 0.5
    out -= out.min()
    return out / max(1e-6, out.max())


def cab_textures():
    """tileable surface textures; returns {key: (base, normal or None, tile metres)}"""
    T = {}
    # perforated ceiling panel, 600 mm modules with seams, 8 mm hole pitch
    n = 512
    u, v = _grid(n)
    pu, pv = (u * 600 / 8.0) % 1.0, (v * 600 / 8.0) % 1.0
    hole = (((pu - 0.5) ** 2 + (pv - 0.5) ** 2) < 0.22 ** 2).astype(np.float32)
    seam = ((u < 0.004) | (u > 0.996) | (v < 0.004) | (v > 0.996)).astype(np.float32)
    base = np.ones((n, n, 3), np.float32) * _hex("#d8d9d5")
    base *= (1 - 0.32 * hole)[..., None]
    base *= (1 - 0.45 * seam)[..., None]
    T["ceiling"] = (base, _normal_from_height(-hole * 0.6 - seam * 1.5, 1.5), 0.6)
    # melamine wall panels: subtle mottling, 1 m panels with a recessed joint
    nz = _noise(n, 3)
    seam = ((u < 0.003) | (u > 0.997)).astype(np.float32)
    base = np.ones((n, n, 3), np.float32) * _hex("#c4c6c3") * (0.96 + 0.06 * nz)[..., None]
    base *= (1 - 0.5 * seam)[..., None]
    T["wall"] = (base, _normal_from_height(-seam * 2.0 + nz * 0.15, 1.0), 1.0)
    # studded rubber floor (200 mm tile)
    n = 256
    u, v = _grid(n)
    pu, pv = (u * 8) % 1.0, (v * 8) % 1.0
    r = np.sqrt((pu - 0.5) ** 2 + (pv - 0.5) ** 2)
    stud = np.clip((0.30 - r) / 0.05, 0, 1)
    nz = _noise(n, 5)
    base = np.ones((n, n, 3), np.float32) * _hex("#4b4d4f") * (0.9 + 0.15 * nz)[..., None]
    base *= (1 + 0.12 * stud)[..., None]
    T["floor"] = (base, _normal_from_height(stud * 1.0, 2.0), 0.2)
    # knee panel: perforated stainless sheet (100 mm tile, 5 mm pitch, staggered)
    u, v = _grid(n)
    pv = (v * 20) % 1.0
    row = np.floor(v * 20)
    pu = (u * 20 + 0.5 * (row % 2)) % 1.0
    hole = (((pu - 0.5) ** 2 + (pv - 0.5) ** 2) < 0.28 ** 2).astype(np.float32)
    base = np.ones((n, n, 3), np.float32) * _hex("#9a9c9c") * (1 - 0.75 * hole)[..., None]
    T["perf"] = (base, _normal_from_height(-hole, 2.0), 0.1)
    # crinkle black FRP / panel paint (fine noise)
    nz = _noise(n, 7, 5)
    base = np.ones((n, n, 3), np.float32) * (0.92 + 0.12 * nz)[..., None]
    T["crinkle"] = (base, _normal_from_height(nz * 0.8, 3.0), 0.12)
    # desk top: light grey speckled laminate
    nz = _noise(n, 11, 5)
    rng = np.random.default_rng(2)
    spk = (rng.random((n, n)) < 0.02).astype(np.float32)
    base = np.ones((n, n, 3), np.float32) * _hex("#b9bab4") * (0.95 + 0.08 * nz - 0.12 * spk)[..., None]
    T["desk"] = (base, None, 0.4)
    # blue moquette (twill weave)
    n = 128
    y, x = np.mgrid[0:n, 0:n]
    weave = (((x // 2) + (y // 2)) % 4 < 2).astype(np.float32)
    rng = np.random.default_rng(4)
    base = np.ones((n, n, 3), np.float32) * _hex("#3f5fa8") * (0.82 + 0.18 * weave + 0.08 * rng.random((n, n)))[..., None]
    T["moquette"] = (base, _normal_from_height(weave * 0.5, 2.0), 0.06)
    # smoked sun-visor mesh fabric
    weave = (((x % 4) < 2) ^ ((y % 4) < 2)).astype(np.float32)
    base = np.ones((n, n, 3), np.float32) * _hex("#2a2f36") * (0.8 + 0.25 * weave)[..., None]
    T["blind"] = (base, None, 0.03)
    return T


def gauge_image(red_needle_deg, black_needle_deg, label_band="#e8e8e2"):
    """round analog pressure gauge (BC / MR): white dial, ticks, optional painted red + black needles"""
    n = 256
    u, v = _grid(n)
    x, y = (u - 0.5) * 2, (v - 0.5) * 2
    r = np.sqrt(x * x + y * y)
    ang = np.degrees(np.arctan2(y, x))
    base = np.zeros((n, n, 3), np.float32) + _hex("#202022")
    base[r < 0.94] = _hex(label_band)
    # ticks over a 270 deg arc from -135 (bottom left) .. +135 (bottom right), measured from up
    a_up = (90 - ang + 360) % 360          # clockwise from 12 o'clock
    a_up = np.where(a_up > 180, a_up - 360, a_up)
    on_arc = np.abs(a_up) <= 135
    minor = (np.abs(((a_up + 135) % 13.5) - 6.75) > 6.0) & on_arc & (r > 0.74) & (r < 0.84)
    major = (np.abs(((a_up + 135) % 27.0) - 13.5) > 12.6) & on_arc & (r > 0.66) & (r < 0.86)
    base[minor | major] = _hex("#151515")
    red_zone = (a_up > 100) & (a_up <= 135) & (r > 0.86) & (r < 0.9)
    base[red_zone] = _hex("#c42020")

    def needle(deg, col, w):
        t = np.radians(deg)
        dx, dy = math.sin(t), math.cos(t)
        along = x * dx + y * dy
        perp = np.abs(x * dy - y * dx)
        m = (along > -0.12) & (along < 0.78) & (perp < w * (1 - 0.6 * np.clip(along, 0, 1)))
        base[m] = _hex(col)
    if black_needle_deg is not None:
        needle(black_needle_deg, "#111111", 0.035)
    if red_needle_deg is not None:
        needle(red_needle_deg, "#d01818", 0.03)
    base[r < 0.07] = _hex("#303030")
    return base


def img_material(name, base, normal=None, rough=0.6, metal=0.0):
    from lib import _MATS
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = _img(name + "_col", base)
    nt.links.new(tc.outputs["Color"], b.inputs["Base Color"])
    if normal is not None:
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = _img(name + "_nrm", normal, "Non-Color", "PNG")
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], b.inputs["Normal"])
    _MATS[name] = m
    return m


def project_uvs(obj, scales, planar=()):
    """box-projected world-scale UVs (u, v in tiles) for materials in `scales`;
    planar 0..1 UVs (u = viewer's right, v = up) for the materials named in `planar`"""
    me = obj.data
    uv = me.uv_layers["UVMap"]
    up = Vector((0, 0, 1))
    for poly in me.polygons:
        m = me.materials[poly.material_index]
        if m is None:
            continue
        if m.name in planar:
            n = poly.normal
            right = (-n).cross(up)
            if right.length < 1e-6:
                right = Vector((1, 0, 0))
            right.normalize()
            vup = right.cross(-n).normalized()
            pts = [me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices]
            us = [p.dot(right) for p in pts]
            vs = [p.dot(vup) for p in pts]
            u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
            for li, uu, vv in zip(poly.loop_indices, us, vs):
                uv.data[li].uv = ((uu - u0) / max(1e-6, u1 - u0), (vv - v0) / max(1e-6, v1 - v0))
            continue
        tile = scales.get(m.name)
        if not tile:
            continue
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                a, b = co.y * (1 if n.x < 0 else -1), co.z
            elif ax == 1:
                a, b = co.x * (1 if n.y > 0 else -1), co.z
            else:
                a, b = co.x, co.y
            uv.data[li].uv = (a / tile, b / tile)


def _gltf_output_group():
    g = bpy.data.node_groups.get("glTF Material Output")
    if g is None:
        g = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        g.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def bake_ao(obj, size=2048, distance=0.45, samples=96, name="cab_ao"):
    """Bake Cycles ambient occlusion into a second UV set and wire it as the glTF occlusion map.
    Every material on `obj` is replaced by a private copy so shared materials stay untouched."""
    me = obj.data
    for i, m in enumerate(me.materials):
        if m is None:
            continue
        c = m.copy()
        c.name = m.name + "_ao" if not m.name.startswith("LCD_") else m.name
        if m.name.startswith("LCD_"):
            continue                       # replaced by live canvases in the game
        me.materials[i] = c
    ao_uv = me.uv_layers.new(name="AO")
    me.uv_layers.active = ao_uv
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(name, size, size, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    nodes = []
    for m in me.materials:
        if m is None or m.name.startswith("LCD_"):
            continue
        nt = m.node_tree
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = img
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "AO"
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.nodes.active = t
        nodes.append((m, t))
    sc = bpy.context.scene
    if sc.world is None:
        sc.world = bpy.data.worlds.new("bake_world")
    sc.world.light_settings.distance = distance
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.render.bake.margin = 6
    bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
    # soften the sampling noise and lift the blacks (AO only scales ambient light in the game)
    px = np.array(img.pixels[:], np.float32).reshape(size, size, 4)
    a = px[..., 0]
    for _ in range(2):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
    a = 0.30 + 0.70 * np.clip(a, 0, 1) ** 0.9
    px[..., 0] = px[..., 1] = px[..., 2] = a
    px[..., 3] = 1
    img.pixels.foreach_set(px.ravel())
    img.file_format = "JPEG"
    img.pack()
    group = _gltf_output_group()
    for m, t in nodes:
        nt = m.node_tree
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        gn = nt.nodes.new("ShaderNodeGroup")
        gn.node_tree = group
        nt.links.new(sep.outputs["Red"], gn.inputs["Occlusion"])
    me.uv_layers.active = me.uv_layers["UVMap"]
    me.uv_layers["UVMap"].active_render = True
    print("baked AO", name, size, flush=True)


# ---------------------------------------------------------------------------
# Cab interiors, one per series. Exported together in cab_interior.glb as root empties
# cab_<key>; each holds the baked cab mesh, the animated handles (mascon_handle_<key>,
# brake_handle_<key> on two-handle cabs), gauge needles (needle_<kind>_<key>) and the
# driver's eye point (eye_<key>).
#
# Spec frame: x forward from the inside face of the front wall (cab points have x < 0),
# y = left (+, driver's side), z above rail. Openings follow faces.py (front windows, cab_side).
# ---------------------------------------------------------------------------
CAB_CFG = {
    # E231-1000 late 3-LCD desk (ref2/cab/SPEC.md; E231 = E233 frame + 0.035 in z)
    "e231": dict(dz=0.035, desk="lcd", zp=1.650, zc=3.40, xr=-2.30,
                 side_win=(-0.39, -1.12, 2.415, 2.975), door=(-1.25, -1.95), door_win=(-1.37, -1.83, 2.04, 2.82),
                 eye=(8.32, 0.85, 2.965), ao=2048),
    # E233-3000: same desk family, black full-width panel, grey desk, big hooded right monitor
    "e233": dict(dz=0.0, desk="lcd", zp=1.650, zc=3.40, xr=-2.30,
                 side_win=(-0.49, -1.20, 2.425, 2.97), door=(-1.35, -1.99), door_win=(-1.48, -1.85, 2.07, 2.82),
                 eye=(8.32, 0.85, 2.93), ao=2048),
    # 211-3000: gangway door between the windscreens (black-painted below z 2,468), crew door
    # right behind the desk, two-handle desk with analogue meters
    "211": dict(dz=0.0, desk="jnr", zp=1.650, zc=3.36, xr=-1.95,
                side_win=None, door=(-0.34, -0.94), door_win=(-0.46, -0.82, 2.19, 2.91),
                front=[(0.487, 1.379, 2.47, 3.27), (-1.379, -0.487, 2.47, 3.27), (-0.28, 0.28, 2.271, 2.99)],
                gdoor=0.465, eye=(8.45, 0.88, 2.82), ao=1024),
    # 115-1000: small H-rubber windscreens + corner panes, gangway door, JNR light-green cab
    "115": dict(dz=0.0, desk="jnr", zp=1.560, zc=3.28, xr=-1.85,
                side_win=None, door=(-0.56, -1.06), door_win=(-0.66, -0.98, 2.35, 2.93),
                front=[(0.479, 1.230, 2.448, 3.049), (-1.230, -0.479, 2.448, 3.049), (-0.371, 0.371, 2.422, 3.017),
                       (1.245, 1.40, 2.448, 3.049), (-1.40, -1.245, 2.448, 3.049)],
                gdoor=0.418, eye=(8.48, 0.86, 2.74), ao=1024),
}
# surface colours per series (missing keys = the E231 textures as generated)
CAB_COLORS = {
    "e231": dict(),
    "e233": dict(desk="#c9cbc7", panel="#1c1d1f", hood="#141516", knee="#a6a9aa"),
    "211": dict(wall="#c8c5ba", desk="#9fa29a", panel="#5a5c5a", hood="#45484a", knee="#878b86", moq="#454c63",
                ceil="#dcdbd2"),
    "115": dict(wall="#a9c6a6", desk="#93ae96", panel="#5c7a62", hood="#4d6853", knee="#7f9e84", moq="#3f5246",
                ceil="#dfe1d6", floor="#5d5951"),
}

_CAB_T = {}
_CABM = {}
_CAB_TILE = {}


def _cab_tmat(name, key, tint=None, rough=0.6, metal=0.0, alpha=1.0):
    """textured cab material (cached by name); `tint` recolours the texture keeping its luminance pattern"""
    if name in _CABM:
        return _CABM[name]
    if not _CAB_T:
        _CAB_T.update(cab_textures())
    base, nrm, tile = _CAB_T[key]
    if tint is not None:
        lum = base.mean(axis=2, keepdims=True)
        base = np.clip(lum / max(1e-3, float(lum.mean())) * _hex(tint), 0, 1)
    m = img_material(name, base, None, rough, metal)
    if nrm is not None:
        # one normal-map image per texture kind, shared by every tinted variant
        img = bpy.data.images.get(f"cab_{key}_nrm") or _img(f"cab_{key}_nrm", nrm, "Non-Color", "PNG")
        nt = m.node_tree
        tn = nt.nodes.new("ShaderNodeTexImage")
        tn.image = img
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], nt.nodes["Principled BSDF"].inputs["Normal"])
    if alpha < 1.0:
        m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    _CABM[name] = m
    _CAB_TILE[m.name] = tile
    return m


def _cab_img(name, fn, rough=0.25):
    if name not in _CABM:
        _CABM[name] = img_material(name, fn(), None, rough)
    return _CABM[name]


def speedo_image(face="#ecebe4"):
    """analogue speedometer dial 0-120 km/h over 270 deg (numbers are separate text meshes)"""
    n = 256
    u, v = _grid(n)
    x, y = (u - 0.5) * 2, (v - 0.5) * 2
    r = np.sqrt(x * x + y * y)
    a_up = (90 - np.degrees(np.arctan2(y, x)) + 360) % 360
    a_up = np.where(a_up > 180, a_up - 360, a_up)
    on_arc = np.abs(a_up) <= 135.5
    base = np.zeros((n, n, 3), np.float32) + _hex("#202022")
    base[r < 0.94] = _hex(face)

    def tick(period, half_w, r0, r1):
        t = (a_up + 135) % period
        d = np.minimum(t, period - t)
        return (d < half_w) & on_arc & (r > r0) & (r < r1)
    base[tick(11.25, 0.7, 0.80, 0.88) | tick(22.5, 1.0, 0.74, 0.88) | tick(45, 1.5, 0.68, 0.88)] = _hex("#151515")
    base[(a_up > 103) & (a_up <= 135) & (r > 0.88) & (r < 0.92)] = _hex("#c42020")   # over the 110 km/h line
    base[r < 0.07] = _hex("#303030")
    return base


def _holed(mb, u0, u1, v0, v1, holes, quad, m, n):
    """rectangular wall u0..u1 x v0..v1 with rectangular holes (ua, ub, va, vb); quad(a, b, va, vb) -> 4 points"""
    cuts = {u0, u1}
    for h in holes:
        cuts.add(min(max(h[0], u0), u1))
        cuts.add(min(max(h[1], u0), u1))
    us = sorted(cuts)
    for a, b in zip(us, us[1:]):
        if b - a < 1e-5:
            continue
        mid = (a + b) / 2
        z = v0
        for (za, zb) in sorted((h[2], h[3]) for h in holes if h[0] < mid < h[1]):
            if za > z + 1e-5:
                mb.poly(quad(a, b, z, min(za, v1)), m, n)
            z = max(z, zb)
        if z < v1 - 1e-5:
            mb.poly(quad(a, b, z, v1), m, n)


def _rect(lo, hi):
    return (min(lo, hi), max(lo, hi))


def make_cab(M, coll, key):
    from lib import mat, text_mesh, join
    C = CAB_CFG[key]
    K = CAB_COLORS.get(key, {})
    lcd = C["desk"] == "lcd"
    xF = 9.70                      # inside face of the front wall in car coordinates
    dz = C["dz"]

    def P(x, y, z):
        return (xF + x, y, z + dz)

    def box(mb, x0, x1, y0, y1, z0, z1, m, R=None):
        mb.box(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)), m, R)

    def tm(name, tex, ckey, default=None, **kw):
        tint = K.get(ckey)
        if tint is None:
            return _cab_tmat(name, tex, default, **kw)
        return _cab_tmat(f"{name}_{key}", tex, tint, **kw)
    desk_top = tm("cab_desk_top", "desk", "desk", rough=0.55)
    panel = tm("cab_panel_face", "crinkle", "panel", "#2b2d2f", rough=0.55, metal=0.1)
    hood = tm("cab_hood", "crinkle", "hood", "#1d1f21", rough=0.5, metal=0.1)
    wall = tm("cab_wall3", "wall", "wall", rough=0.7)
    ceil = tm("cab_ceiling", "ceiling", "ceil", rough=0.7)
    floor = tm("cab_floor2", "floor", "floor", rough=0.9)
    moq = tm("cab_moquette", "moquette", "moq", rough=0.95)
    perf = _cab_tmat("cab_knee_perf", "perf", rough=0.45, metal=0.8)
    knee = tm("cab_knee", "crinkle", "knee", "#a6a9aa", rough=0.55) if "knee" in K else perf
    blind = _cab_tmat("cab_blind", "blind", rough=0.85, alpha=0.6)
    blind_r = _cab_tmat("cab_blind_rolled", "blind", rough=0.85)                 # opaque rolled-up front blinds
    cabinet = _cab_tmat("cab_cabinet", "wall", "#b8bab6", 0.6) if lcd else wall
    rim = mat("cab_rim", (0.008, 0.009, 0.010), 0.0, 0.7)
    grille = mat("cab_grille", (0.333, 0.323, 0.287), 0.3, 0.6)
    stain = mat("cab_stainless", (0.371, 0.381, 0.381), 0.9, 0.35)
    frame = mat("cab_frame", (0.010, 0.010, 0.010), 0.0, 0.5)
    ext_red = mat("cab_extinguisher", (0.55, 0.02, 0.02), 0.2, 0.35)
    lamp_w = mat("cab_lamp_white", (0.8, 0.8, 0.75), 0.0, 0.3, (1.0, 0.95, 0.85), 0.6)
    lamp_g = mat("cab_lamp_green", (0.05, 0.35, 0.08), 0.0, 0.3, (0.1, 1.0, 0.2), 0.8)
    lamp_o = mat("cab_lamp_amber", (0.5, 0.25, 0.02), 0.0, 0.3, (1.0, 0.5, 0.05), 0.0)
    label = mat("cab_label", (0.80, 0.80, 0.76), 0.0, 0.5)
    ink = mat("cab_dial_ink", (0.012, 0.012, 0.012), 0.0, 0.5)
    needle_red = mat("cab_needle_red", (0.62, 0.03, 0.02), 0.0, 0.4)
    needle_blk = mat("cab_needle_black", (0.01, 0.01, 0.01), 0.0, 0.4)
    gauge = _cab_img("GAUGE_DIAL", lambda: gauge_image(None, None))
    speedo = _cab_img("SPEEDO_DIAL", speedo_image)
    paper = mat("TIMETABLE", (0.85, 0.85, 0.80), 0.0, 0.7)
    red = mat("cab_red", (0.6, 0.02, 0.02), 0.0, 0.4)
    green = mat("cab_green", (0.02, 0.4, 0.08), 0.0, 0.4)
    lcd_meter = mat("LCD_METER", (0.007, 0.010, 0.023), 0.0, 0.25, (0.02, 0.03, 0.06), 0.5)
    lcd_tims = mat("LCD_TIMS", (0.013, 0.050, 0.27), 0.0, 0.25, (0.02, 0.05, 0.25), 0.5)
    lcd_mon = mat("LCD_MON", (0.007, 0.010, 0.023), 0.0, 0.25, (0.02, 0.03, 0.06), 0.5)
    mb = MB(f"cab_interior_{key}")
    texts, parts = [], []
    W = 1.40
    zp, zc, xr = C["zp"], C["zc"], C["xr"]
    zr = 1.130                                  # rear floor (crew-door sill)
    ds = zp - 1.650                             # platform offset vs the E231 numbers
    zs = (zp + zr) / 2
    # floors: driver platform, two steps, rear area
    mb.poly([P(0, -W, zp), P(0, W, zp), P(-1.45, W, zp), P(-1.45, -W, zp)], floor, (0, 0, 1))
    for (xa, xb, z) in ((-1.45, -1.575, zs), (-1.575, -1.70, zr)):
        mb.poly([P(xa, -W, z), P(xa, W, z), P(xb, W, z), P(xb, -W, z)], floor, (0, 0, 1))
    mb.poly([P(-1.45, -W, zp), P(-1.45, W, zp), P(-1.45, W, zs), P(-1.45, -W, zs)], floor, (-1, 0, 0))
    mb.poly([P(-1.575, -W, zs), P(-1.575, W, zs), P(-1.575, W, zr), P(-1.575, -W, zr)], floor, (-1, 0, 0))
    mb.poly([P(-1.70, -W, zr), P(-1.70, W, zr), P(xr, W, zr), P(xr, -W, zr)], floor, (0, 0, 1))
    # ceiling with AC grille and lamp strips
    mb.poly([P(0, -1.33, zc), P(0, 1.33, zc), P(xr, 1.33, zc), P(xr, -1.33, zc)], ceil, (0, 0, -1))
    box(mb, -0.5, max(-2.1, xr + 0.2), -0.15, 0.15, zc - 0.012, zc, grille)
    for s in (-1, 1):
        box(mb, -0.6, max(-2.0, xr + 0.3), s * 0.55, s * 0.65, zc - 0.015, zc, M["lamp"])
    # side walls (tumble home 1.40 -> 1.33) with the cab side window and the crew door
    d0, d1 = _rect(*C["door"])
    dw = C["door_win"]
    sw = C["side_win"]
    for s in (-1, 1):
        def yw(z, s=s):
            return s * (W - 0.07 * (z - 2.0) / 1.4)

        def quad(a, b, za, zb, yw=yw):
            return [P(a, yw(za), za), P(b, yw(za), za), P(b, yw(zb), zb), P(a, yw(zb), zb)]
        holes = [(d0, d1, zr, 3.01)]
        if sw:
            holes.append((*_rect(sw[0], sw[1]), sw[2], sw[3]))
        _holed(mb, xr, 0.0, zr, zc, holes, quad, wall, (0, -s, 0))
        y = s * (W - 0.01)

        def dquad(a, b, za, zb, y=y):
            return [P(a, y, za), P(b, y, za), P(b, y, zb), P(a, y, zb)]
        _holed(mb, d0, d1, zr, 3.01, [(*_rect(dw[0], dw[1]), dw[2], dw[3])], dquad, stain, (0, -s, 0))
        for (xa, xb, za, zb) in ([sw] if sw else []) + [dw]:
            for (a, b) in (((xa, za), (xb, za)), ((xa, zb), (xb, zb)), ((xa, za), (xa, zb)), ((xb, za), (xb, zb))):
                mb.beam(P(a[0], s * (W - 0.03), a[1]), P(b[0], s * (W - 0.03), b[1]), 0.04, 0.03, frame)
        if sw:
            xm = (sw[0] + sw[1]) / 2
            mb.beam(P(xm, s * (W - 0.03), sw[2]), P(xm, s * (W - 0.03), sw[3]), 0.03, 0.03, frame)  # pane divider
        if lcd:
            # A-pillar trim: triangular in plan, glass edge (+-1.30, x -0.02) -> side window front
            xs = sw[0]
            a0, a1 = P(-0.02, s * 1.30, 2.00), P(xs, s * 1.40, 2.00)
            a2, a3 = P(xs, s * 1.40, 3.25), P(-0.02, s * 1.30, 3.25)
            mb.poly([a0, a1, a2, a3], wall, (1, -s * 0.6, 0))
        # crew-door grab handle and door lever
        mb.cyl(P(d1 + 0.06, s * (W - 0.06), 2.55), (0, 0, 1), 0.016, 0.75, stain, seg=10)
        mb.beam(P(d1 + 0.06, s * (W - 0.06), 2.18), P(d1 + 0.06, s * (W - 0.005), 2.18), 0.03, 0.03, stain)
        mb.beam(P(d1 + 0.06, s * (W - 0.06), 2.92), P(d1 + 0.06, s * (W - 0.005), 2.92), 0.03, 0.03, stain)
        box(mb, d0 + 0.05, d0 + 0.13, s * (W - 0.03), s * (W - 0.06), 2.20, 2.24, stain)

    if lcd:
        # big windscreen: front wall below the glass, header and blinds
        mb.poly([P(0.0, -W, zp), P(0.0, W, zp), P(0.0, W, 2.0), P(0.0, -W, 2.0)], panel, (-1, 0, 0))
        box(mb, -0.18, -0.45, -1.33, 1.33, 3.25, zc, wall)                              # header
        box(mb, -0.17, -0.18, 0.30, 0.80, 3.28, 3.34, rim)                              # car-number plate
        # sun blinds rolled up into a housing under the header (an opaque strip + full-width bottom bar;
        # the old half-lowered see-through blind left its pull tab floating in the sky)
        for (ya, yb) in ((0.03, 1.25), (-1.25, -0.03)):
            box(mb, -0.17, -0.25, ya, yb, 3.19, 3.25, wall)                               # roller housing
            mb.poly([P(-0.252, ya, 3.19), P(-0.252, yb, 3.19), P(-0.252, yb, 3.165), P(-0.252, ya, 3.165)], blind_r, (-1, 0, 0))
            box(mb, -0.245, -0.26, ya, yb, 3.155, 3.168, rim)                              # bottom bar
        mb.beam(P(-0.012, -1.30, 3.245), P(-0.012, 1.30, 3.245), 0.03, 0.03, frame)     # windscreen gaskets
        mb.beam(P(-0.012, -1.30, 2.0), P(-0.012, 1.30, 2.0), 0.03, 0.03, frame)
        for yy in (0.33, 1.05):                                                         # wiper motor covers
            box(mb, -0.02, -0.10, yy - 0.06, yy + 0.06, 1.90, 1.98, panel)
    else:
        # gangway-door front: wall with the two windscreens, the door window and (115) corner panes
        holes = [(*_rect(a, b), za, zb) for (a, b, za, zb) in C["front"]]

        def fquad(a, b, za, zb):
            return [P(0, a, za), P(0, b, za), P(0, b, zb), P(0, a, zb)]
        _holed(mb, -W, W, zp, zc, holes, fquad, wall, (-1, 0, 0))
        for (ya, yb, za, zb) in holes:                                                 # H-rubber gaskets
            for (a, b) in (((ya, za), (yb, za)), ((ya, zb), (yb, zb)), ((ya, za), (ya, zb)), ((yb, za), (yb, zb))):
                mb.beam(P(-0.012, a[0], a[1]), P(-0.012, b[0], b[1]), 0.025, 0.025, frame)
        g = C["gdoor"]
        for (a, b) in (((g, zp), (g, 3.10)), ((-g, zp), (-g, 3.10)), ((-g, 3.10), (g, 3.10))):     # door leaf seam
            mb.beam(P(-0.008, a[0], a[1]), P(-0.008, b[0], b[1]), 0.02, 0.02, rim)
        box(mb, -0.01, -0.06, -g + 0.05, -g + 0.09, 2.08, 2.20, stain)                  # door handle
        for (ya, yb, za, zb) in holes[:2]:                                             # rolled-up blinds
            box(mb, -0.02, -0.09, ya, yb, zb - 0.01, zb + 0.05, wall)                       # housing over the glass
            mb.poly([P(-0.092, ya, zb - 0.01), P(-0.092, yb, zb - 0.01), P(-0.092, yb, zb - 0.03), P(-0.092, ya, zb - 0.03)], blind_r, (-1, 0, 0))
            box(mb, -0.085, -0.10, ya, yb, zb - 0.042, zb - 0.03, rim)

    # ---- dials and needles -----------------------------------------------------------
    def dial(c, n, up, r, face, bezel, nums=None, nums_r=0.64, size=None):
        c, n, up = Vector(c), Vector(n).normalized(), Vector(up).normalized()
        right = (-n).cross(up).normalized()
        mb.cyl(tuple(c + n * 0.010), tuple(n), r + 0.008, 0.02, bezel, seg=28)
        mb.cyl(tuple(c + n * 0.021), tuple(n), r, 0.004, face, seg=28)
        mb.cyl(tuple(c + n * 0.026), tuple(n), max(0.005, r * 0.09), 0.004, frame, seg=10)       # hub
        for k, txt in enumerate(nums or ()):
            a = math.radians(-135 + 270 * k / (len(nums) - 1))
            p = c + n * 0.0235 + (right * math.sin(a) + up * math.cos(a)) * r * nums_r
            ob = text_mesh(txt, size or r * 0.2, coll, name="dialtext", extrude=0.0)
            ob.data.materials.clear()
            ob.data.materials.append(ink)
            ob.matrix_world = Matrix.Translation(p) @ Matrix((right, up, n)).transposed().to_4x4()
            texts.append(ob)
        return c + n * 0.0245, n, up

    def needle(kind, d, length, m, width=None):
        c, n, up = d
        width = width or length * 0.09
        nb = MB(f"needle_{kind}_{key}")
        nb.poly([(-width / 2, 0, -0.18 * length), (width / 2, 0, -0.18 * length), (width * 0.12, 0, length), (-width * 0.12, 0, length)], m, (0, -1, 0))
        ob = nb.build(coll)
        right = (-n).cross(up).normalized()
        ob.matrix_world = Matrix.Translation(c) @ Matrix((right, -n, up)).transposed().to_4x4()
        parts.append(ob)

    if lcd:
        lcd_desk(mb, P, box, key, dict(desk_top=desk_top, panel=panel, hood=hood, rim=rim, wall=wall, stain=stain,
                                       knee=knee, frame=frame, red=red, green=green, paper=paper, lcd_meter=lcd_meter,
                                       lcd_tims=lcd_tims, lcd_mon=lcd_mon, lamp_w=lamp_w, lamp_g=lamp_g, lamp_o=lamp_o,
                                       cabinet=cabinet, label=label), M, zp)
        # left wall above the side window: equipment cabinet (E231: with the BC / MR air gauges, c01)
        yl = W - 0.075
        box(mb, -0.42, -0.78, yl, W - 0.005, 3.08, 3.34, cabinet)
        if key == "e231":
            for gx, kind, nm in ((-0.51, "bc", needle_blk), (-0.67, "mr", needle_red)):
                d = dial(P(gx, yl - 0.0, 3.22), (0, -1, 0), (0, 0, 1), 0.044, gauge, rim)
                needle(kind, d, 0.034, nm)
                box(mb, gx - 0.03, gx + 0.03, yl - 0.004, yl, 3.115, 3.13, label)
        for k in range(3):                                                             # switch boxes
            box(mb, -0.82, -0.95, yl - 0.045, yl, 3.12 + k * 0.07, 3.17 + k * 0.07, frame if k % 2 else cabinet)
        hb = MB(f"mascon_handle_{key}")       # one-handle T grip, pivot 0.12 below the desk slot
        hb.beam((0, 0, 0), (0, 0, 0.21), 0.025, 0.025, mat("cab_handle_shaft", (0.371, 0.381, 0.381), 0.9, 0.35))
        hb.cyl((0, 0, 0.225), (0, 1, 0), 0.0175, 0.13, M["handle"], seg=12)
        h = hb.build(coll)
        h.location = P(-0.79, 1.12, 2.45 - 0.12)
        parts.append(h)
    else:
        # ---- two-handle JNR desk on the driver's side of the gangway door -------------------
        y0, y1 = C["gdoor"] + 0.03, W - 0.01
        hz, pz = 2.43, 2.27            # hood top, desk front edge (= instrument panel bottom)
        xa, xb = -0.36, -0.54          # instrument panel top / bottom edge (tilted ~42 deg toward the driver)
        box(mb, 0.0, xa, y0, y1, zp, hz, hood)                                          # block under the glass
        pn = Vector((-(hz - pz), 0, xa - xb)).normalized()                              # panel normal
        pu = Vector((xa - xb, 0, hz - pz)).normalized()                                 # panel "up"
        mb.poly([P(xa, y0, hz), P(xa, y1, hz), P(xb, y1, pz), P(xb, y0, pz)], panel, tuple(pn))
        mb.poly([P(xb, y0, pz), P(xb, y1, pz), P(-0.88, y1, pz - 0.02), P(-0.88, y0, pz - 0.02)], desk_top, (0, 0, 1))
        box(mb, -0.88, -0.92, y0, y1, pz - 0.08, pz - 0.01, rim)                       # padded edge
        mb.cyl(P(-0.92, (y0 + y1) / 2, pz - 0.045), (0, 1, 0), 0.035, y1 - y0, rim, seg=12)
        mb.poly([P(-0.86, y0, zp), P(-0.86, y1, zp), P(-0.86, y1, pz - 0.08), P(-0.86, y0, pz - 0.08)], knee, (-1, 0, 0))
        mb.poly([P(0, y0, zp), P(-0.92, y0, zp), P(-0.92, y0, pz), P(0, y0, pz)], hood, (0, -1, 0))   # cheek
        mb.poly([P(0, y0, pz), P(xb, y0, pz), P(xa, y0, hz), P(0, y0, hz)], hood, (0, -1, 0))
        # indicator lamp block on the hood (知らせ灯)
        box(mb, -0.27, -0.34, 0.62, 1.20, hz, hz + 0.03, panel)
        for k in range(7):
            yy = 0.66 + k * 0.08
            box(mb, -0.341, -0.346, yy - 0.018, yy + 0.018, hz + 0.006, hz + 0.024, (lamp_w, lamp_o, lamp_g)[k % 3] if k != 3 else red)
        # meters on the tilted panel: speedometer in front of the driver, duplex air gauges either side
        pc = lambda y: Vector(P((xa + xb) / 2, y, (hz + pz) / 2))                       # noqa: E731
        bez = M["chrome"] if key == "115" else rim
        d = dial(pc(0.905), pn, pu, 0.072, speedo, bez, nums=["0", "20", "40", "60", "80", "100", "120"], nums_r=0.60)
        needle("speed", d, 0.060, needle_red)
        nums_p = ["0", "2", "4", "6", "8", "10"]
        if key == "115":
            # 元空気ダメ / 釣合空気ダメ (red MR, black ER) and ブレーキ管 / ブレーキシリンダ (red BP, black BC)
            d = dial(pc(1.195), pn, pu, 0.058, gauge, bez, nums=nums_p, nums_r=0.56)
            needle("mr", d, 0.046, needle_red)
            needle("er", d, 0.044, needle_blk)
            d = dial(pc(0.615), pn, pu, 0.058, gauge, bez, nums=nums_p, nums_r=0.56)
            needle("bp", d, 0.046, needle_red)
            needle("bc", d, 0.044, needle_blk)
        else:
            d = dial(pc(1.195), pn, pu, 0.058, gauge, bez, nums=nums_p, nums_r=0.56)
            needle("mr", d, 0.046, needle_red)
            needle("bc", d, 0.044, needle_blk)
            d = dial(pc(0.62), pn, pu, 0.045, gauge, bez)                               # 電流計
            needle("amp", d, 0.036, needle_blk)
        # master controller (left) and brake valve (right): vertical-axis handles on round housings
        zt = pz - 0.02 * (0.72 + xb) / (0.88 + xb) - 0.0                                 # desk top at x -0.72
        for (yy, r, hgt) in ((1.19, 0.072, 0.08), (0.64, 0.085, 0.09)):
            mb.cyl(P(-0.72, yy, zt + hgt / 2), (0, 0, 1), r, hgt, hood, seg=24)
            mb.cyl(P(-0.72, yy, zt + hgt + 0.003), (0, 0, 1), r * 0.92, 0.006, M["chrome"], seg=24)
            for k in range(9):                                                         # notch marks
                a = math.radians(180 + k * 12 * (1 if yy > 1 else -1.2))
                box(mb, -0.72 + math.cos(a) * r * 0.80 - 0.004, -0.72 + math.cos(a) * r * 0.80 + 0.004,
                    yy + math.sin(a) * r * 0.80 - 0.004, yy + math.sin(a) * r * 0.80 + 0.004, zt + hgt + 0.006, zt + hgt + 0.008, label)
        box(mb, -0.70, -0.76, 1.272, 1.29, zt, zt + 0.10, frame)                       # reverser key
        hm = mat("cab_handle_shaft", (0.371, 0.381, 0.381), 0.9, 0.35)
        for (nm, yy, top, ln) in (("mascon_handle", 1.19, zt + 0.08 + 0.006, 0.16), ("brake_handle", 0.64, zt + 0.09 + 0.006, 0.20)):
            hb = MB(f"{nm}_{key}")
            hb.cyl((0, 0, 0.012), (0, 0, 1), 0.02, 0.024, hm, seg=12)
            hb.beam((0, 0, 0.022), (-ln, 0, 0.022), 0.03, 0.018, M["handle"])
            hb.cyl((-ln, 0, 0.052), (0, 0, 1), 0.017, 0.06, M["handle"], seg=12)
            h = hb.build(coll)
            h.location = P(-0.72, yy, top)
            parts.append(h)
        # assistant's side: cabinet + shelf with a few switches, hand rail
        box(mb, 0.0, -0.62, -y1, -y0, zp, 2.30, hood)
        box(mb, 0.0, -0.66, -y1, -y0, 2.30, 2.33, desk_top)
        mb.beam(P(-0.64, -y1 + 0.08, 2.42), P(-0.64, -y0 - 0.05, 2.42), 0.025, 0.025, stain)
        for k in range(5):
            mb.cyl(P(-0.30, -y0 - 0.10 - k * 0.09, 2.34), (0, 0, 1), 0.012, 0.02, stain, seg=8)
        # timetable holder at the right end of the desk
        Rt = Matrix.Rotation(math.radians(25), 3, "Y")
        box(mb, -0.60, -0.76, y0 + 0.01, y0 + 0.09, pz + 0.005, pz + 0.015, rim, Rt)

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
    box(mb, xp + 0.035, xp + 0.06, -0.62, -0.58, zr + 0.95, zr + 1.10, stain)       # door lever
    mb.beam(P(xp + 0.07, -0.60, zr + 1.02), P(xp + 0.07, -0.74, zr + 1.02), 0.02, 0.02, stain)
    box(mb, xp + 0.03, xp + 0.035, 0.62, 0.98, zr + 1.62, zr + 1.72, label)
    mb.cyl(P(xp + 0.02, 0.0, min(3.15, zc - 0.2)), (1, 0, 0), 0.07, 0.01, grille, seg=18)
    # driver's seat on a pedestal (moquette, stainless frame), arm rests, headrest
    box(mb, -1.075, -1.525, 0.625, 1.075, 2.06 + ds, 2.13 + ds, moq)
    mb.box(P(-1.57, 0.85, 2.43 + ds), (0.08, 0.44, 0.55), moq, Matrix.Rotation(math.radians(8), 3, "Y"))
    mb.cyl(P(-1.30, 0.85, (zp + 2.06 + ds) / 2), (0, 0, 1), 0.04, 2.06 + ds - zp, stain, seg=10)
    box(mb, -1.15, -1.45, 0.70, 1.00, zp, zp + 0.03, stain)
    for yy in (0.62, 1.08):
        box(mb, -1.12, -1.48, yy - 0.025, yy + 0.025, 2.33 + ds, 2.37 + ds, frame)
    mb.box(P(-1.63, 0.85, 2.77 + ds), (0.07, 0.30, 0.16), moq)
    if xr <= -2.2:                                                                  # folding aux seat
        box(mb, -1.75, -2.20, -1.35, -1.30, zr, 2.20, wall)
        box(mb, -1.80, -2.15, -1.32, -0.80, 1.60, 1.65, moq)
    for yy in (0.98, 0.72):                                                         # horn pedals
        box(mb, -0.70, -0.82, yy - 0.04, yy + 0.04, zp, zp + 0.04, frame)
    # ceiling: speaker grille, cab lamp, fan, spot lamp
    mb.cyl(P(-1.05, 0.95, zc - 0.006), (0, 0, 1), 0.09, 0.012, grille, seg=20)
    mb.cyl(P(-1.20, -0.85, zc - 0.01), (0, 0, 1), 0.13, 0.02, cabinet, seg=24)
    mb.cyl(P(-1.20, -0.85, zc - 0.022), (0, 0, 1), 0.10, 0.006, grille, seg=24)
    mb.cyl(P(-0.75, 0.55, zc - 0.03), (0, 0, 1), 0.06, 0.06, cabinet, seg=16)
    mb.cyl(P(-0.75, 0.55, zc - 0.061), (0, 0, 1), 0.045, 0.004, lamp_w, seg=16)
    # fire extinguisher in the rear corner, on a bracket
    ex, ey = xr + 0.12, -1.22
    mb.cyl(P(ex, ey, zr + 0.24), (0, 0, 1), 0.065, 0.46, ext_red, seg=16)
    mb.cyl(P(ex, ey, zr + 0.50), (0, 0, 1), 0.03, 0.06, frame, seg=10)
    mb.beam(P(ex, ey, zr + 0.53), P(ex + 0.10, ey + 0.04, zr + 0.30), 0.015, 0.015, frame)
    box(mb, ex - 0.03, ex + 0.03, ey - 0.08, ey + 0.08, zr + 0.30, zr + 0.34, stain)

    cab = mb.build(coll)
    if texts:
        cab = join([cab] + texts, f"cab_interior_{key}")
    project_uvs(cab, _CAB_TILE, planar=("GAUGE_DIAL", "SPEEDO_DIAL"))
    # bake AO with nothing else in the way (the vehicles and other cabs share the origin)
    hidden = [o for o in bpy.data.objects if o is not cab and not o.hide_render]
    for o in hidden:
        o.hide_render = True
    bake_ao(cab, size=C["ao"], samples=96 if C["ao"] >= 2048 else 64, name=f"cab_ao_{key}")
    for o in hidden:
        o.hide_render = False
    eye = bpy.data.objects.new(f"eye_{key}", None)
    coll.objects.link(eye)
    eye.location = C["eye"]
    root = bpy.data.objects.new(f"cab_{key}", None)
    coll.objects.link(root)
    for o in [cab, eye] + parts:
        o.parent = root
    return root


def lcd_desk(mb, P, box, key, m, M, zp):
    """E231-1000 / E233-3000 one-handle desk with three LCDs (ref2/cab c01-c08)"""
    W = 1.40
    e233 = key == "e233"
    desk_top, panel, hood, rim, stain, knee, frame = m["desk_top"], m["panel"], m["hood"], m["rim"], m["stain"], m["knee"], m["frame"]
    red, green, paper = m["red"], m["green"], m["paper"]
    # hood top (black shelf) and tilted panel face
    box(mb, -0.30, -0.60, 0.06 if not e233 else -0.44, W, 2.715, 2.745, hood)
    y_lo = 0.06 if not e233 else -0.44         # E233: one black panel across the whole desk
    mb.poly([P(-0.56, y_lo, 2.70), P(-0.56, W, 2.70), P(-0.62, W, 2.45), P(-0.62, y_lo, 2.45)], panel, (-1, 0, 0.23))
    mb.poly([P(-0.30, y_lo, 2.73), P(-0.30, W, 2.73), P(-0.30, W, 2.45), P(-0.30, y_lo, 2.45)], panel, (-1, 0, 0))
    # desk top sloping 7 deg down to the driver, black padded rim, knee panel
    mb.poly([P(-0.62, -0.44, 2.45), P(-0.62, W, 2.45), P(-0.93, W, 2.41), P(-0.93, -0.44, 2.41)], desk_top, (0, 0, 1))
    box(mb, -0.93, -0.965, 0.20, 1.30, 2.33, 2.41, rim)
    mb.cyl(P(-0.965, 0.75, 2.37), (0, 1, 0), 0.042, 1.10, rim, seg=14)
    mb.poly([P(-0.88, -0.44, zp), P(-0.88, W, zp), P(-0.88, W, zp + 0.10), P(-0.88, -0.44, zp + 0.10)], stain, (-1, 0, 0))
    if e233:
        # stainless leg-room plate in front of the driver, grey cabinet doors elsewhere
        mb.poly([P(-0.88, 0.45, zp + 0.10), P(-0.88, W, zp + 0.10), P(-0.88, W, 2.32), P(-0.88, 0.45, 2.32)], stain, (-1, 0, 0))
        mb.poly([P(-0.881, -0.44, zp + 0.10), P(-0.881, 0.45, zp + 0.10), P(-0.881, 0.45, 2.32), P(-0.881, -0.44, 2.32)], knee, (-1, 0, 0))
        for (ya, yb) in ((-0.40, 0.0), (0.04, 0.42)):
            for z0, z1 in ((zp + 0.14, 1.98), (2.02, 2.28)):
                for (a, b) in (((ya, z0), (yb, z0)), ((ya, z1), (yb, z1)), ((ya, z0), (ya, z1)), ((yb, z0), (yb, z1))):
                    mb.beam(P(-0.886, a[0], a[1]), P(-0.886, b[0], b[1]), 0.006, 0.006, frame)
    else:
        mb.poly([P(-0.88, -0.44, zp + 0.10), P(-0.88, W, zp + 0.10), P(-0.88, W, 2.32), P(-0.88, -0.44, 2.32)], knee, (-1, 0, 0))
    mb.poly([P(-0.93, -0.44, 2.41), P(-0.93, 0.20, 2.41), P(-0.93, 0.20, 2.32), P(-0.93, -0.44, 2.32)], desk_top, (-1, 0, 0))
    # right shelf with handrail
    box(mb, 0.0, -0.80, -W, -0.44, 2.40, 2.45, desk_top)
    mb.poly([P(-0.80, -W, zp), P(-0.80, -0.44, zp), P(-0.80, -0.44, 2.40), P(-0.80, -W, 2.40)], m["wall"] if not e233 else knee, (-1, 0, 0))
    mb.beam(P(-0.78, -1.30, 2.50), P(-0.78, -0.50, 2.50), 0.025, 0.025, stain)
    # LCDs (4:3, tilted 13 deg back, centres z 2.59): No.1 meter, TIMS, right hooded monitor
    tilt = math.radians(13)
    n = Vector((-math.cos(tilt), 0, math.sin(tilt)))
    up = Vector((math.sin(tilt), 0, math.cos(tilt)))

    def screen(cx, cy, w, h, mm, bw, bh, yaw=0.0, cz=2.59):
        c = Vector(P(cx, cy, cz))
        Ry = Matrix.Rotation(yaw, 3, "Z")
        nn, uu = Ry @ n, Ry @ up
        r = uu.cross(nn).normalized()
        def q(du, dv, e):
            return c + r * du + uu * dv + nn * e
        mb.poly([q(-bw / 2, -bh / 2, 0.004), q(bw / 2, -bh / 2, 0.004), q(bw / 2, bh / 2, 0.004), q(-bw / 2, bh / 2, 0.004)], rim, tuple(nn))
        mb.poly([q(-w / 2, -h / 2, 0.008), q(w / 2, -h / 2, 0.008), q(w / 2, h / 2, 0.008), q(-w / 2, h / 2, 0.008)], mm, tuple(nn))
    if e233:
        screen(-0.60, 0.97, 0.235, 0.176, m["lcd_meter"], 0.29, 0.22)
        screen(-0.59, 0.50, 0.235, 0.176, m["lcd_tims"], 0.30, 0.23)
        # large right monitor in its own hood box (c07/c08), yawed toward the driver
        box(mb, -0.38, -0.82, -0.62, 0.02, 2.45, 2.47, hood)
        box(mb, -0.38, -0.44, -0.62, 0.02, 2.47, 2.84, hood)
        box(mb, -0.38, -0.60, -0.62, 0.02, 2.84, 2.86, hood)
        for yy in (-0.61, 0.01):
            mb.poly([P(-0.44, yy, 2.47), P(-0.80, yy, 2.47), P(-0.60, yy, 2.85), P(-0.44, yy, 2.85)], hood, (0, 1 if yy < 0 else -1, 0))
        screen(-0.66, -0.26, 0.27, 0.203, m["lcd_mon"], 0.32, 0.25, yaw=math.radians(-12), cz=2.62)
    else:
        screen(-0.60, 0.95, 0.211, 0.158, m["lcd_meter"], 0.27, 0.21)
        screen(-0.59, 0.53, 0.211, 0.158, m["lcd_tims"], 0.30, 0.22)
        box(mb, -0.40, -0.80, -0.44, 0.06, 2.45, 2.47, hood)
        box(mb, -0.40, -0.45, -0.44, 0.06, 2.47, 2.78, hood)
        box(mb, -0.40, -0.53, -0.44, 0.06, 2.79, 2.81, hood)          # short sun visor
        screen(-0.66, -0.18, 0.246, 0.185, m["lcd_mon"], 0.29, 0.22, yaw=math.radians(-15))
    # 緊急 button column, grab handle, radio, switch plinth
    mb.cyl(P(-0.585, 0.74, 2.66), (-1, 0, 0.23), 0.025, 0.03, red, seg=12)
    mb.cyl(P(-0.60, 0.74, 2.55), (-1, 0, 0.23), 0.012, 0.05, frame, seg=8)
    mb.cyl(P(-0.61, 0.74, 2.49), (-1, 0, 0.23), 0.02, 0.01, M["white"], seg=12)
    box(mb, -0.70, -0.76, 0.42, 0.62, 2.45, 2.51, rim)
    mb.cyl(P(-0.73, 0.52, 2.53), (0, 1, 0), 0.0175, 0.20, rim, seg=10)
    mb.cyl(P(-0.73, 0.415, 2.53), (0, 1, 0), 0.018, 0.012, green, seg=10)
    if not e233:
        box(mb, -0.56, -0.60, 0.08, 0.36, 2.48, 2.66, panel)
        mb.cyl(P(-0.585, 0.25, 2.60), (-1, 0, 0.23), 0.03, 0.02, red, seg=14)
        mb.cyl(P(-0.60, 0.15, 2.52), (-1, 0, 0.23), 0.018, 0.02, green, seg=10)
    box(mb, -0.70, -0.80, -0.05 if not e233 else -0.62, 0.30 if not e233 else -0.66, 2.45, 2.49, panel)
    for k in range(6):
        mb.cyl(P(-0.75, (-0.02 if not e233 else -0.62) + k * 0.05, 2.505), (0, 0, 1), 0.008, 0.03, M["chrome"], seg=6)
    box(mb, -0.28, -0.32, 1.33, 1.39, 3.00, 3.10, panel)                            # 直通予備 switch box
    # master controller: inclined black plate, slot, notch strip (handle is a separate object)
    plate = Matrix.Rotation(math.radians(-8), 3, "Y")
    box(mb, -0.66, -0.92, 1.03, 1.21, 2.44, 2.46, rim, plate)
    box(mb, -0.68, -0.90, 1.11, 1.13, 2.462, 2.466, frame)
    for k, mm in enumerate([red] + [M["orange"]] * 8 + [M["white"]] + [green] * 5):
        box(mb, -0.68 - k * 0.0145, -0.68 - k * 0.0145 - 0.010, 1.15, 1.18, 2.462, 2.468, mm)
    box(mb, -0.78, -0.82, 1.27, 1.29, 2.45, 2.50, frame)                            # reverser
    mb.beam(P(-0.80, 1.28, 2.50), P(-0.80, 1.28, 2.58), 0.015, 0.015, frame)
    Rt = Matrix.Rotation(math.radians(25), 3, "Y")                                  # timetable holder
    box(mb, -0.80, -0.95, 0.30, 0.80, 2.46, 2.47, rim, Rt)
    box(mb, -0.81, -0.94, 0.32, 0.78, 2.472, 2.474, paper, Rt)
    # push-button / indicator block left of the No.1 meter (2 x 3)
    tilt_n = Vector((-math.cos(math.radians(13)), 0, math.sin(math.radians(13))))
    lamps = (m["lamp_w"], m["lamp_g"], m["lamp_o"], m["lamp_w"], frame, m["lamp_g"])
    for i, yy in enumerate((1.13, 1.18, 1.23) if not e233 else (1.16, 1.21, 1.26)):
        for j, zz in enumerate((2.63, 2.585)):
            xf = -0.56 - (2.70 - zz) * (0.06 / 0.25)
            c = Vector(P(xf, yy, zz)) + tilt_n * 0.005
            mb.box(tuple(c), (0.01, 0.03, 0.026), lamps[i * 2 + j])
    for k in range(7):                                                              # indicator lamp row (c03)
        box(mb, -0.565, -0.58, 0.40 + k * 0.045, 0.43 + k * 0.045, 2.685, 2.705, m["lamp_w"] if k % 3 else m["lamp_o"])
    # right shelf: toggle switch rows with guards
    for r in range(2):
        for k in range(7):
            yy = -0.52 - k * 0.09
            xx = -0.18 - r * 0.22
            if e233 and yy > -0.66 and xx < -0.30:
                continue
            mb.cyl(P(xx, yy, 2.455), (0, 0, 1), 0.012, 0.012, stain, seg=8)
            mb.beam(P(xx, yy, 2.46), P(xx - 0.02, yy, 2.50), 0.008, 0.008, stain)
        box(mb, -0.10 - r * 0.22, -0.26 - r * 0.22, -1.20, -0.48, 2.45, 2.453, frame)


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
def export(objs, path, image_format="AUTO"):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
        for c in o.children:
            c.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True,
                              export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
                              export_image_format=image_format)
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
    cabs = [make_cab(M, coll, k) for k in CAB_CFG]
    export(cabs, os.path.join(OUT_DIR, "cab_interior.glb"), image_format="JPEG")   # baked AO maps as JPEG
    for i, o in enumerate(cabs):
        o.location.y = -12.0 - 5.0 * i
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
