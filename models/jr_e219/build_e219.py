"""
JR東日本 E219系 近郊形直流電車（架空） クモハE219-1 ― 高精細 Blender モデル生成スクリプト
=====================================================================================

2000年代初頭（2002年登場想定）の JR 近郊形電車をイメージしたオリジナル車両を、
Blender の Python API だけで手続き的にモデリングします。

  * 20m 4扉 軽量ステンレス車体（ビードレス・拡幅車体 2,950mm・裾絞り）
  * FRP 製 貫通形前頭部（ブラックフェイス / HID 前照灯 + LED 尾灯）
  * 3色LED 行先表示器（前面・側面）、シングルアームパンタグラフ
  * ボルスタレス台車（軸梁式・空気ばね）、IGBT-VVVF インバータ等の床下機器
  * 室内（ロングシート + セミクロスシート、つり革、荷棚、天井照明）
  * 線路・架線・空を含むレンダリング用シーン

使い方:
    # bpy モジュール（pip install bpy）の場合
    python build_e219.py               # .blend / .glb を生成
    python build_e219.py --render      # 生成後にレンダリングも行う
    python build_e219.py --render --preview   # 低解像度・低サンプルで試し描き

    # Blender 本体の場合
    blender -b -P build_e219.py -- --render

座標系: X = 車両長手方向（+X が運転台側）, Y = 枕木方向, Z = 上（レール面 = 0）, 単位 m
"""

import bpy
import bmesh
import math
import os
import sys
from math import pi, sin, cos, sqrt
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = "/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf"

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
DO_RENDER = "--render" in ARGS
PREVIEW = "--preview" in ARGS
ONLY = [a.split("=", 1)[1] for a in ARGS if a.startswith("--only=")]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


# ---------------------------------------------------------------------------
# コレクション / オブジェクト生成ユーティリティ
# ---------------------------------------------------------------------------

def make_col(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


C_TRAIN = make_col("E219_Kumoha")
C_TRACK = make_col("Track")
C_ENV = make_col("Environment")
C_TMP = make_col("_tmp")

_ctx = {"col": C_TRAIN, "parent": None}


def add_obj(name, data, loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    o = bpy.data.objects.new(name, data)
    _ctx["col"].objects.link(o)
    o.location = loc
    o.rotation_euler = rot
    o.scale = scale
    if _ctx["parent"] is not None:
        o.parent = _ctx["parent"]
    return o


def frame_matrix(origin, xaxis, yaxis):
    x = Vector(xaxis).normalized()
    y = Vector(yaxis).normalized()
    z = x.cross(y).normalized()
    y = z.cross(x)
    return Matrix(((x[0], y[0], z[0], origin[0]),
                   (x[1], y[1], z[1], origin[1]),
                   (x[2], y[2], z[2], origin[2]),
                   (0, 0, 0, 1)))


# ---------------------------------------------------------------------------
# マテリアル
# ---------------------------------------------------------------------------

def _set(b, key, val):
    try:
        b.inputs[key].default_value = val
    except (KeyError, TypeError):
        pass


def mat(name, color, metal=0.0, rough=0.5, coat=0.0, coat_rough=0.03, emit=None,
        emit_str=0.0, trans=0.0, thin=False, ior=1.45, sheen=0.0, spec=0.5, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    _set(b, "Base Color", (*color, 1.0))
    _set(b, "Metallic", metal)
    _set(b, "Roughness", rough)
    _set(b, "IOR", ior)
    _set(b, "Specular IOR Level", spec)
    _set(b, "Coat Weight", coat)
    _set(b, "Coat Roughness", coat_rough)
    _set(b, "Transmission Weight", trans)
    _set(b, "Sheen Weight", sheen)
    _set(b, "Alpha", alpha)
    if thin:
        _set(b, "Thin Wall", True)
    if emit is not None:
        _set(b, "Emission Color", (*emit, 1.0))
        _set(b, "Emission Strength", emit_str)
    m.diffuse_color = (*color, 1.0)
    m.metallic = metal
    m.roughness = rough
    return m


def _nodes(m):
    nt = m.node_tree
    return nt, nt.nodes["Principled BSDF"]


def add_noise_rough(m, scale_vec, noise_scale, rmin, rmax, bump=0.0, detail=6.0):
    """オブジェクト座標の引き伸ばしノイズで粗さを揺らがせる（ヘアライン/汚れ表現）"""
    nt, b = _nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp = nt.nodes.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = scale_vec
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = noise_scale
    nz.inputs["Detail"].default_value = detail
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value = 0.3
    mr.inputs["From Max"].default_value = 0.7
    mr.inputs["To Min"].default_value = rmin
    mr.inputs["To Max"].default_value = rmax
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    nt.links.new(mp.outputs["Vector"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Roughness"])
    if bump > 0:
        bp = nt.nodes.new("ShaderNodeBump")
        bp.inputs["Strength"].default_value = bump
        bp.inputs["Distance"].default_value = 0.002
        nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


def add_grime(m, c_dark, scale=3.0, amount=0.45):
    """ベースカラーにノイズで汚れ（暗色）を混ぜる"""
    nt, b = _nodes(m)
    base = tuple(b.inputs["Base Color"].default_value)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nz = nt.nodes.new("ShaderNodeTexNoise")
    nz.inputs["Scale"].default_value = scale
    nz.inputs["Detail"].default_value = 10
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = base
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (*[base[i] * (1 - amount) + c_dark[i] * amount for i in range(3)], 1)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    nt.links.new(nz.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    return m


def mat_led(name, color, strength=7.0, pitch=0.0085):
    """3色LED表示器風：テキストのローカル座標でドットマトリクスを作る発光マテリアル"""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    dark = nt.nodes.new("ShaderNodeBsdfPrincipled")
    dark.inputs["Base Color"].default_value = (0.01, 0.01, 0.01, 1)
    dark.inputs["Roughness"].default_value = 0.4
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def wave(socket):
        mu = nt.nodes.new("ShaderNodeMath"); mu.operation = "MULTIPLY"
        mu.inputs[1].default_value = pi / pitch
        nt.links.new(socket, mu.inputs[0])
        sn = nt.nodes.new("ShaderNodeMath"); sn.operation = "SINE"
        nt.links.new(mu.outputs[0], sn.inputs[0])
        ab = nt.nodes.new("ShaderNodeMath"); ab.operation = "ABSOLUTE"
        nt.links.new(sn.outputs[0], ab.inputs[0])
        return ab.outputs[0]

    pr = nt.nodes.new("ShaderNodeMath"); pr.operation = "MULTIPLY"
    nt.links.new(wave(sep.outputs[0]), pr.inputs[0])
    nt.links.new(wave(sep.outputs[1]), pr.inputs[1])
    gt = nt.nodes.new("ShaderNodeMath"); gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 0.42
    nt.links.new(pr.outputs[0], gt.inputs[0])
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(gt.outputs[0], mix.inputs[0])
    nt.links.new(dark.outputs[0], mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    m.diffuse_color = (*color, 1)
    return m


def mat_ground(name, c1, c2, scale, bump, rough=0.9, voronoi=False):
    m = mat(name, c1, rough=rough)
    nt, b = _nodes(m)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    if voronoi:
        tx = nt.nodes.new("ShaderNodeTexVoronoi")
        tx.inputs["Scale"].default_value = scale
        fac = tx.outputs["Distance"]
        col_src = tx.outputs["Color"]
    else:
        tx = nt.nodes.new("ShaderNodeTexNoise")
        tx.inputs["Scale"].default_value = scale
        tx.inputs["Detail"].default_value = 12
        fac = tx.outputs["Fac"]
        col_src = None
    nt.links.new(tc.outputs["Object"], tx.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c1, 1)
    ramp.color_ramp.elements[1].color = (*c2, 1)
    if col_src is not None:
        # 石ごとに明度をばらつかせる
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(col_src, sep.inputs[0])
        nt.links.new(sep.outputs[0], ramp.inputs["Fac"])
    else:
        nt.links.new(fac, ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bp = nt.nodes.new("ShaderNodeBump")
    bp.inputs["Strength"].default_value = bump
    if voronoi:
        inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(fac, inv.inputs[1])
        nt.links.new(inv.outputs[0], bp.inputs["Height"])
    else:
        nt.links.new(fac, bp.inputs["Height"])
    nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    return m


M = {}
# 車体
M["stainless"] = add_noise_rough(mat("Stainless", (0.60, 0.61, 0.62), metal=1.0, rough=0.26),
                                 (0.15, 25.0, 25.0), 5.0, 0.24, 0.40, bump=0.03)
M["navy"] = mat("Band_Navy", (0.012, 0.030, 0.150), rough=0.35, coat=0.6)
M["sky"] = mat("Band_Sky", (0.06, 0.38, 0.78), rough=0.35, coat=0.6)
M["frp"] = mat("FRP_Silver", (0.62, 0.64, 0.66), metal=0.55, rough=0.32, coat=0.8, coat_rough=0.06)
M["roof"] = add_grime(mat("Roof_Gray", (0.30, 0.31, 0.32), rough=0.8), (0.08, 0.07, 0.06), 2.0, 0.4)
M["black_gloss"] = mat("Black_Gloss", (0.006, 0.006, 0.007), rough=0.12, coat=1.0, coat_rough=0.02)
M["rubber"] = mat("Rubber_Black", (0.018, 0.018, 0.018), rough=0.65)
M["glass"] = mat("Glass_UVcut", (0.55, 0.68, 0.64), rough=0.0, trans=1.0, thin=True, ior=1.52)
M["glass_clear"] = mat("Glass_Clear", (0.95, 0.95, 0.95), rough=0.0, trans=1.0, thin=True, ior=1.5)
M["chrome"] = mat("Chrome", (0.9, 0.9, 0.9), metal=1.0, rough=0.06)
M["alu"] = mat("Aluminium", (0.80, 0.81, 0.82), metal=1.0, rough=0.35)
M["headlamp"] = mat("HID_Headlamp", (1, 1, 1), emit=(0.92, 0.95, 1.0), emit_str=40.0)
M["tail_off"] = mat("Taillight_Off", (0.25, 0.01, 0.01), rough=0.15, coat=1.0)
M["lamp_red"] = mat("Lamp_Red", (0.6, 0.02, 0.02), rough=0.15, emit=(1.0, 0.05, 0.02), emit_str=1.5)
M["led_orange"] = mat_led("LED_Orange", (1.0, 0.42, 0.04))
M["led_red"] = mat_led("LED_Red", (1.0, 0.06, 0.03))
M["led_green"] = mat_led("LED_Green", (0.25, 1.0, 0.1))
M["led_back"] = mat("LED_Back", (0.008, 0.008, 0.008), rough=0.5)
M["text_black"] = mat("Lettering_Black", (0.02, 0.02, 0.02), rough=0.4)
M["skirt"] = add_grime(mat("Skirt_Gray", (0.20, 0.205, 0.21), metal=0.2, rough=0.55), (0.05, 0.04, 0.03), 4.0, 0.35)
# 床下・台車
M["bogie"] = add_grime(mat("Bogie_DarkGray", (0.085, 0.088, 0.092), metal=0.3, rough=0.6), (0.05, 0.035, 0.02), 3.0, 0.5)
M["equip"] = add_grime(mat("Equip_Gray", (0.26, 0.27, 0.28), metal=0.25, rough=0.55), (0.05, 0.04, 0.03), 2.5, 0.45)
M["equip_dark"] = add_grime(mat("Equip_Dark", (0.06, 0.062, 0.065), metal=0.2, rough=0.6), (0.04, 0.03, 0.02), 2.5, 0.4)
M["wheel"] = add_grime(mat("Wheel_Steel", (0.20, 0.19, 0.18), metal=0.85, rough=0.5), (0.12, 0.06, 0.03), 6.0, 0.5)
M["tread"] = mat("Wheel_Tread", (0.75, 0.74, 0.72), metal=1.0, rough=0.12)
M["spring"] = mat("Spring_Steel", (0.03, 0.03, 0.032), metal=0.4, rough=0.45)
M["copper"] = mat("Copper", (0.8, 0.45, 0.3), metal=1.0, rough=0.3)
# 屋根上
M["insulator"] = mat("Insulator", (0.80, 0.80, 0.77), rough=0.12, coat=0.8)
M["panto"] = mat("Pantograph", (0.55, 0.57, 0.60), metal=0.6, rough=0.35)
M["carbon"] = mat("Carbon_Strip", (0.03, 0.03, 0.03), rough=0.55)
M["ac_body"] = add_grime(mat("AC_Unit", (0.58, 0.60, 0.62), metal=0.7, rough=0.35), (0.12, 0.11, 0.1), 2.0, 0.3)
M["grille"] = mat("Fan_Grille", (0.05, 0.05, 0.05), metal=0.5, rough=0.4)
M["walkway"] = mat_ground("Roof_Walkway", (0.10, 0.10, 0.10), (0.16, 0.16, 0.16), 80.0, 0.3)
# 室内
M["int_wall"] = mat("Interior_Laminate", (0.82, 0.82, 0.80), rough=0.35)
M["int_floor"] = mat_ground("Interior_Floor", (0.30, 0.30, 0.29), (0.36, 0.36, 0.34), 40.0, 0.05, rough=0.7)
M["seat"] = mat_ground("Seat_Moquette", (0.05, 0.10, 0.36), (0.08, 0.15, 0.48), 120.0, 0.25, rough=0.95)
M["seat_red"] = mat_ground("Seat_Priority", (0.36, 0.06, 0.07), (0.48, 0.09, 0.10), 120.0, 0.25, rough=0.95)
M["ceiling_light"] = mat("Ceiling_Light", (1, 1, 1), emit=(1.0, 0.97, 0.92), emit_str=9.0)
M["strap"] = mat("Strap_White", (0.85, 0.85, 0.83), rough=0.3)
M["blind"] = mat("Roller_Blind", (0.72, 0.66, 0.52), rough=0.8)
M["console"] = mat("Cab_Console", (0.10, 0.12, 0.13), rough=0.5)
# 線路・環境
M["rail_top"] = mat("Rail_Head", (0.70, 0.70, 0.70), metal=1.0, rough=0.18)
M["rail_side"] = add_grime(mat("Rail_Rust", (0.16, 0.08, 0.05), metal=0.4, rough=0.75), (0.05, 0.03, 0.02), 8, 0.5)
M["concrete"] = add_grime(mat_ground("PC_Sleeper", (0.50, 0.49, 0.47), (0.58, 0.57, 0.55), 30.0, 0.15), (0.2, 0.16, 0.12), 4, 0.3)
M["ballast"] = mat_ground("Ballast", (0.17, 0.155, 0.14), (0.42, 0.40, 0.37), 18.0, 0.9, voronoi=True)
M["grass"] = mat_ground("Grass", (0.13, 0.15, 0.07), (0.25, 0.24, 0.13), 0.8, 0.3)
M["foliage"] = mat_ground("Foliage", (0.03, 0.07, 0.02), (0.11, 0.18, 0.05), 9.0, 1.0)
M["bark"] = mat("Bark", (0.10, 0.07, 0.05), rough=0.9)
M["duct_slot"] = mat("Duct_Slot", (0.30, 0.30, 0.30), rough=0.6)
M["steel_pole"] = add_grime(mat("Pole_Steel", (0.42, 0.43, 0.44), metal=0.8, rough=0.45), (0.15, 0.08, 0.05), 3, 0.3)
M["wire"] = mat("Overhead_Wire", (0.55, 0.32, 0.22), metal=1.0, rough=0.4)


# ---------------------------------------------------------------------------
# メッシュ生成ユーティリティ
# ---------------------------------------------------------------------------

_mesh_cache = {}


def bm_finish(bm, name, mats, smooth=True, angle=30):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m_ in mats:
        me.materials.append(m_)
    if smooth:
        me.shade_smooth()
        me.set_sharp_from_angle(angle=math.radians(angle))
    return me


def mesh_from(name, verts, faces, mats, fmat=None, smooth=True, angle=30, merge=False, recalc=True):
    bm = bmesh.new()
    vs = [bm.verts.new(v) for v in verts]
    bm.verts.ensure_lookup_table()
    for i, f in enumerate(faces):
        try:
            face = bm.faces.new([vs[k] for k in f])
        except ValueError:
            continue
        if fmat:
            face.material_index = fmat[i]
    if merge:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
        bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    if recalc:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm_finish(bm, name, mats, smooth, angle)


class Geo:
    """複数パーツを1メッシュにまとめるための頂点/面バッファ"""

    def __init__(self):
        self.v, self.f, self.m = [], [], []

    def add(self, verts, faces, mi=0):
        o = len(self.v)
        self.v += list(verts)
        if isinstance(mi, (list, tuple)):
            self.m += list(mi)
        else:
            self.m += [mi] * len(faces)
        self.f += [tuple(i + o for i in f) for f in faces]

    def mesh(self, name, mats, **kw):
        return mesh_from(name, self.v, self.f, mats, self.m, **kw)

    def obj(self, name, mats, **kw):
        return add_obj(name, self.mesh(name, mats, **kw))


def box_bm(sx, sy, sz, bevel=0.0, seg=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=bevel, offset_type="OFFSET",
                        segments=seg, profile=0.5, affect="EDGES", clamp_overlap=True)
    return bm


def box_mesh(sx, sy, sz, mat_, bevel=0.0, seg=2):
    key = ("box", round(sx, 5), round(sy, 5), round(sz, 5), round(bevel, 5), seg, mat_.name)
    if key not in _mesh_cache:
        _mesh_cache[key] = bm_finish(box_bm(sx, sy, sz, bevel, seg), "box", [mat_], smooth=bevel > 0, angle=40)
    return _mesh_cache[key]


def box(name, size, loc, mat_, bevel=0.0, seg=2, rot=(0, 0, 0)):
    return add_obj(name, box_mesh(*size, mat_, bevel, seg), loc, rot)


def box2(name, x0, x1, y0, y1, z0, z1, mat_, bevel=0.0, seg=2):
    return box(name, (abs(x1 - x0), abs(y1 - y0), abs(z1 - z0)),
               ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), mat_, bevel, seg)


def cyl_mesh(r, depth, mat_, seg=32, r2=None, bevel=0.0):
    key = ("cyl", round(r, 5), round(depth, 5), seg, None if r2 is None else round(r2, 5), round(bevel, 5), mat_.name)
    if key in _mesh_cache:
        return _mesh_cache[key]
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth)
    if bevel > 0:
        rim = [e for e in bm.edges if any(len(f.verts) > 4 for f in e.link_faces)]
        bmesh.ops.bevel(bm, geom=rim + list({v for e in rim for v in e.verts}), offset=bevel,
                        offset_type="OFFSET", segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    me = bm_finish(bm, "cyl", [mat_], smooth=True, angle=40)
    _mesh_cache[key] = me
    return me


_AX = {"Z": (0, 0, 0), "X": (0, pi / 2, 0), "Y": (pi / 2, 0, 0)}


def cyl(name, r, depth, loc, mat_, axis="Z", seg=32, r2=None, bevel=0.0):
    return add_obj(name, cyl_mesh(r, depth, mat_, seg, r2, bevel), loc, _AX[axis])


def rod(name, p0, p1, r, mat_, seg=16, r2=None):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_euler()
    return add_obj(name, cyl_mesh(r, d.length, mat_, seg, r2), (p0 + p1) / 2, rot)


def lathe_geo(profile, seg=48, axis="Z", closed=True):
    verts, faces = [], []
    n = len(profile)
    for i in range(seg):
        a = 2 * pi * i / seg
        c, s = cos(a), sin(a)
        for (r, h) in profile:
            if axis == "Z":
                verts.append((r * c, r * s, h))
            elif axis == "Y":
                verts.append((r * c, h, r * s))
            else:
                verts.append((h, r * c, r * s))
    for i in range(seg):
        i2 = (i + 1) % seg
        for j in range(n if closed else n - 1):
            j2 = (j + 1) % n
            faces.append((i * n + j, i2 * n + j, i2 * n + j2, i * n + j2))
    return verts, faces


def lathe_mesh(name, profile, mats, seg=48, axis="Z", closed=True, mi_fn=None, angle=35):
    key = ("lathe", name, seg, axis)
    if key in _mesh_cache:
        return _mesh_cache[key]
    v, f = lathe_geo(profile, seg, axis, closed)
    fm = None
    if mi_fn:
        n = len(profile)
        fm = []
        for i in range(seg):
            for j in range(n if closed else n - 1):
                j2 = (j + 1) % n
                fm.append(mi_fn(profile[j], profile[j2]))
    me = mesh_from(name, v, f, mats, fm, merge=True, angle=angle)
    _mesh_cache[key] = me
    return me


def prism_geo(pts, a, b, plane="XZ"):
    n = len(pts)

    def P(u, v, w):
        if plane == "XZ":
            return (u, w, v)
        if plane == "YZ":
            return (w, u, v)
        return (u, v, w)

    verts = [P(u, v, a) for u, v in pts] + [P(u, v, b) for u, v in pts]
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    faces += [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return verts, faces


def rr(cx, cy, w, h, r, n=8):
    """角丸長方形の輪郭（反時計回り）"""
    r = max(1e-4, min(r, w / 2 - 1e-4, h / 2 - 1e-4))
    pts = []
    corners = [(cx + w / 2 - r, cy - h / 2 + r, -pi / 2), (cx + w / 2 - r, cy + h / 2 - r, 0.0),
               (cx - w / 2 + r, cy + h / 2 - r, pi / 2), (cx - w / 2 + r, cy - h / 2 + r, pi)]
    for (ux, uy, a0) in corners:
        for i in range(n + 1):
            a = a0 + (pi / 2) * i / n
            pts.append((ux + r * cos(a), uy + r * sin(a)))
    return pts


def rr_box(u0, u1, v0, v1, r, n=8):
    return rr((u0 + u1) / 2, (v0 + v1) / 2, u1 - u0, v1 - v0, r, n)


def circle(cx, cy, r, n=32):
    return [(cx + r * cos(2 * pi * i / n), cy + r * sin(2 * pi * i / n)) for i in range(n)]


def densify(pts, step=0.02):
    """閉じた輪郭の直線区間を細分化（曲面に投影したとき弦が沈み込まないように）"""
    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        m = max(1, math.ceil(math.hypot(b[0] - a[0], b[1] - a[1]) / step))
        for k in range(m):
            t = k / m
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def densify_pair(outer, inner, step=0.02):
    oo, ii = [], []
    n = len(outer)
    for i in range(n):
        a, b = outer[i], outer[(i + 1) % n]
        c, d = inner[i], inner[(i + 1) % n]
        L = max(math.hypot(b[0] - a[0], b[1] - a[1]), math.hypot(d[0] - c[0], d[1] - c[1]))
        m = max(1, math.ceil(L / step))
        for k in range(m):
            t = k / m
            oo.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
            ii.append((c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t))
    return oo, ii


def disk_geo(outline, nr=12, center=None):
    """凸形状の輪郭を同心リング＋中心ファンで面張り（曲面への投影用）"""
    n = len(outline)
    c = center or (sum(p[0] for p in outline) / n, sum(p[1] for p in outline) / n)
    verts, faces = [], []
    for k in range(nr):
        s = 1 - k / nr
        for (u, v) in outline:
            verts.append((c[0] + (u - c[0]) * s, c[1] + (v - c[1]) * s))
    for k in range(nr - 1):
        for i in range(n):
            i2 = (i + 1) % n
            faces.append((k * n + i, k * n + i2, (k + 1) * n + i2, (k + 1) * n + i))
    ci = len(verts)
    verts.append(c)
    k = nr - 1
    for i in range(n):
        faces.append((k * n + i, k * n + (i + 1) % n, ci))
    return verts, faces


def ring_geo(outer, inner):
    n = len(outer)
    verts = list(outer) + list(inner)
    faces = [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
    return verts, faces


def fillet(points, radius, seg=6):
    """折れ線の角をRで丸める（手すり等のパイプ用）"""
    pts = [Vector(p) for p in points]
    if len(pts) < 3:
        return [tuple(p) for p in pts]
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        a, b, c = pts[i - 1], pts[i], pts[i + 1]
        d1, d2 = (a - b), (c - b)
        l1, l2 = d1.length, d2.length
        rr_ = min(radius, l1 * 0.45, l2 * 0.45)
        d1.normalize(); d2.normalize()
        p1, p2 = b + d1 * rr_, b + d2 * rr_
        for k in range(seg + 1):
            t = k / seg
            q = (1 - t) ** 2 * p1 + 2 * (1 - t) * t * b + t * t * p2
            out.append(q)
    out.append(pts[-1])
    return [tuple(p) for p in out]


def tube(name, pts, r, mat_, kind="POLY", res=6, closed=False):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_mode = "ROUND"
    cu.bevel_depth = r
    cu.bevel_resolution = res
    cu.use_fill_caps = True
    sp = cu.splines.new(kind)
    sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (q[0], q[1], q[2], 1.0)
    if kind == "NURBS":
        sp.use_endpoint_u = True
        sp.order_u = min(4, len(pts))
        sp.resolution_u = 16
    sp.use_cyclic_u = closed
    cu.materials.append(mat_)
    return add_obj(name, cu)


def helix(name, center, r, wire, z0, z1, turns, mat_):
    n = int(turns * 24)
    pts = [(center[0] + r * cos(2 * pi * turns * i / n), center[1] + r * sin(2 * pi * turns * i / n),
            z0 + (z1 - z0) * i / n) for i in range(n + 1)]
    o = tube(name, pts, wire, mat_, res=3)
    o.data.splines[0].resolution_u = 2
    return o


_font = [None]


def text(name, s, size, mat_, matrix, align="CENTER", extrude=0.0, spacing=1.0):
    if _font[0] is None:
        _font[0] = bpy.data.fonts.load(FONT_PATH) if os.path.exists(FONT_PATH) else None
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = s
    if _font[0]:
        cu.font = _font[0]
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.extrude = extrude
    cu.space_character = spacing
    cu.materials.append(mat_)
    o = add_obj(name, cu)
    o.matrix_world = matrix
    return o


def boolean_apply(target, cutter_geo, op="DIFFERENCE", cutter_mat=None, solver="MANIFOLD"):
    """cutter_geo (Geo) でブーリアン演算し、結果を target のメッシュに確定する"""
    cme = cutter_geo.mesh("cutter", [cutter_mat or M["rubber"]], smooth=False)
    cut = bpy.data.objects.new("cutter", cme)
    C_TMP.objects.link(cut)
    cut.matrix_world = target.matrix_world.copy()
    md = target.modifiers.new("bool", "BOOLEAN")
    md.operation = op
    md.solver = solver
    md.object = cut
    try:
        md.material_mode = "TRANSFER"
    except (AttributeError, TypeError):
        pass
    dg = bpy.context.evaluated_depsgraph_get()
    ev = target.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev)
    if len(me.polygons) == 0 and solver == "MANIFOLD":
        # Manifold が非多様体入力で失敗した場合は Exact で再試行
        bpy.data.meshes.remove(me)
        md.solver = "EXACT"
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(target.evaluated_get(dg))
    old = target.data
    target.modifiers.clear()
    target.data = me
    me.name = old.name
    bpy.data.meshes.remove(old)
    bpy.data.objects.remove(cut)
    bpy.data.meshes.remove(cme)
    me.shade_smooth()
    me.set_sharp_from_angle(angle=math.radians(30))
    return target


# ---------------------------------------------------------------------------
# 車体断面（拡幅・裾絞り車体）
# ---------------------------------------------------------------------------

W = 1.475          # 車体半幅（最大幅 2,950mm）
ZB = 1.02          # 車体裾
ZV0 = 1.75         # 裾絞り終わり
ZV1 = 3.00         # 側板上端（肩Rの始まり）
ZTOP = 3.62        # 屋根頂部
NSE = 2.6          # 屋根形状（超楕円）指数
T_WALL = 0.035
ZF = 1.13          # 床面高さ
XR = -9.75         # 連結面側 車端
XB = 9.20          # 前頭部付け根
XF = 9.75          # 前頭部先端（概略）

BANDS = [(1.58, 1.62, "sky"), (1.64, 1.86, "navy")]


def lower_y(z):
    return W - 0.085 * ((ZV0 - z) / (ZV0 - ZB)) ** 1.8


def build_half_profile():
    zs = [ZB + (ZV0 - ZB) * i / 14 for i in range(15)]
    feats = [1.58, 1.62, 1.64]
    zs = sorted([z for z in zs if all(abs(z - f) > 0.012 for f in feats)] + feats)
    half = [(lower_y(z), z) for z in zs]
    half += [(W, 1.86), (W, 2.45), (W, ZV1)]
    N = 40
    for i in range(1, N + 1):
        th = (pi / 2) * i / N
        half.append((W * max(cos(th), 0.0) ** (2 / NSE), ZV1 + (ZTOP - ZV1) * sin(th) ** (2 / NSE)))
    half[-1] = (0.0, ZTOP)
    return half


def offset_half(half, d):
    out = []
    n = len(half)
    for i in range(n):
        p0, p1 = half[max(i - 1, 0)], half[min(i + 1, n - 1)]
        ty, tz = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(ty, tz)
        ny, nz = tz / L, -ty / L
        out.append((half[i][0] - ny * d, half[i][1] - nz * d))
    out[-1] = (0.0, out[-1][1])
    return out


HALF = build_half_profile()
HALF_IN = offset_half(HALF, T_WALL)


def interp_y(half, z):
    if z <= half[0][1]:
        return half[0][0]
    if z >= half[-1][1]:
        return 0.0
    lo, hi = 0, len(half) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if half[mid][1] <= z:
            lo = mid
        else:
            hi = mid
    (y0, z0), (y1, z1) = half[lo], half[hi]
    if z1 - z0 < 1e-9:
        return y0
    return y0 + (y1 - y0) * (z - z0) / (z1 - z0)


def yw(z):
    return interp_y(HALF, z)


def yw_in(z):
    return interp_y(HALF_IN, z)


def roof_z(y):
    """屋根上の高さ（|y| < W）"""
    y = abs(y)
    if y >= W:
        return ZV1
    return ZV1 + (ZTOP - ZV1) * (1 - (y / W) ** NSE) ** (1 / NSE)


def full_loop(half):
    return [(-y, z) for (y, z) in half] + [(y, z) for (y, z) in reversed(half[:-1])]


def extrude_loop(loop, x0, x1, edge_mi, cap_mi, caps=True):
    n = len(loop)
    verts = [(x0, y, z) for y, z in loop] + [(x1, y, z) for y, z in loop]
    faces, mi = [], []
    for k in range(n):
        k2 = (k + 1) % n
        faces.append((k, k2, n + k2, n + k))
        mi.append(edge_mi[k])
    if caps:
        faces.append(tuple(range(n))[::-1]); mi.append(cap_mi)
        faces.append(tuple(range(n, 2 * n))); mi.append(cap_mi)
    return verts, faces, mi


def band_mi(zmid, base=0, roof=None):
    """断面の区間中心高さから塗装（帯）マテリアル番号を決める。0=地 1=紺 2=水色 3=屋根"""
    if 1.64 <= zmid <= 1.86:
        return 1
    if 1.58 <= zmid <= 1.62:
        return 2
    if roof is not None and zmid > 3.46:
        return roof
    return base


# ---------------------------------------------------------------------------
# 配置寸法（側窓・扉）
# ---------------------------------------------------------------------------

DOORS = [7.25, 2.45, -2.35, -7.15]       # 客用扉中心（両開き 1,300mm）
DOOR_W = 1.30
DOOR_Z = (1.15, 2.98)
CAB_DOOR = (8.47, 9.03)
CAB_DOOR_Z = (1.15, 2.98)
WIN_Z = (1.93, 2.74)
WINDOWS = [(3.32, 4.77), (4.93, 6.38), (-1.48, -0.03), (0.13, 1.58), (-6.28, -4.83),
           (-4.67, -3.22), (-9.40, -8.05)]
WIN_R = 0.07
SIDE_LED_X = (3.62, 4.47)
SIDE_LED_Z = (2.79, 2.955)
X_PARTITION = 8.05


# ---------------------------------------------------------------------------
# 車体
# ---------------------------------------------------------------------------

def build_body():
    O = full_loop(HALF)
    I = full_loop(HALF_IN)
    loop = O + list(reversed(I))
    nO = len(O)
    edge_mi = []
    for k in range(len(loop)):
        a, b = loop[k], loop[(k + 1) % len(loop)]
        zmid = (a[1] + b[1]) / 2
        if k < nO - 1:
            edge_mi.append(band_mi(zmid, 0, roof=3))
        elif k == nO - 1 or k == len(loop) - 1:
            edge_mi.append(0)
        else:
            edge_mi.append(4)
    g = Geo()
    v, f, mi = extrude_loop(loop, XR, XB, edge_mi, 0)
    g.add(v, f, mi)
    body = g.obj("Body_Shell", [M["stainless"], M["navy"], M["sky"], M["roof"], M["int_wall"]])

    # 窓・扉の開口
    cut = Geo()
    for (x0, x1) in WINDOWS:
        v, f = prism_geo(rr_box(x0, x1, WIN_Z[0], WIN_Z[1], WIN_R), -1.8, 1.8, "XZ")
        cut.add(v, f)
    for xc in DOORS:
        v, f = prism_geo(rr_box(xc - DOOR_W / 2, xc + DOOR_W / 2, DOOR_Z[0], DOOR_Z[1], 0.03), -1.8, 1.8, "XZ")
        cut.add(v, f)
    v, f = prism_geo(rr_box(CAB_DOOR[0], CAB_DOOR[1], CAB_DOOR_Z[0], CAB_DOOR_Z[1], 0.04), -1.8, 1.8, "XZ")
    cut.add(v, f)
    boolean_apply(body, cut, cutter_mat=M["stainless"])

    # 台枠（床下）
    box2("Underframe", XR + 0.02, XB + 0.3, -1.37, 1.37, 0.96, ZB + 0.005, M["equip_dark"])
    for s in (-1, 1):
        box2("Side_Sill", XR + 0.02, XB, s * 1.33, s * 1.40, 0.93, ZB, M["equip_dark"])

    # 雨樋
    zg = 3.22
    for s in (-1, 1):
        box2("Rain_Gutter", XR + 0.05, XB - 0.02, s * (yw(zg) - 0.004), s * (yw(zg) + 0.016), zg - 0.008, zg + 0.012,
             M["stainless"], bevel=0.004)
    # 屋根端の水切り（前頭部側）
    build_windows_and_doors()
    build_end_rear()
    build_side_details()


def side_y(z, inset=0.0):
    return yw(z) - inset


def build_windows_and_doors():
    # 側窓：ガラス・黒枠
    gl = Geo()
    fr = Geo()
    for (x0, x1) in WINDOWS:
        for s in (-1, 1):
            out = rr_box(x0 - 0.028, x1 + 0.028, WIN_Z[0] - 0.028, WIN_Z[1] + 0.028, WIN_R + 0.028)
            inn = rr_box(x0 + 0.012, x1 - 0.012, WIN_Z[0] + 0.012, WIN_Z[1] - 0.012, WIN_R - 0.01)
            v, f = ring_geo(out, inn)
            fr.add([(u, s * (W + 0.0025), w) for (u, w) in v], f)
            # ガラス（窓中央に方立て付きの2枚窓は1枚扱い）
            v, f = disk_geo(rr_box(x0 + 0.005, x1 - 0.005, WIN_Z[0] + 0.005, WIN_Z[1] - 0.005, WIN_R), nr=2)
            gl.add([(u, s * (W - 0.016), w) for (u, w) in v], f)
            # 下降窓の桟（ステンレスの横桟）
            if x1 - x0 > 1.0:
                zbar = WIN_Z[0] + 0.40
                box2("Window_Rail", x0 + 0.01, x1 - 0.01, s * (W - 0.030), s * (W - 0.012), zbar - 0.012, zbar + 0.012,
                     M["alu"])
                xm = (x0 + x1) / 2
                box2("Window_Mullion", xm - 0.018, xm + 0.018, s * (W - 0.030), s * (W - 0.010), WIN_Z[0], WIN_Z[1],
                     M["rubber"])
    fr.obj("Window_Frames", [M["rubber"]], angle=60)
    gl.obj("Window_Glass", [M["glass"]], smooth=False)

    # 客用扉（車体断面に沿った曲面扉）
    leaves = Geo()
    seams = Geo()
    zs = sorted(set([z for (_, z) in HALF if DOOR_Z[0] < z < DOOR_Z[1]] +
                    [DOOR_Z[0] + 0.005, DOOR_Z[1] - 0.005, 1.58, 1.62, 1.64, 1.86, 2.2, 2.6]))

    def leaf(x0, x1, s, inset, thick, geo, seg_band=True):
        outer = [(yw(z) - inset, z) for z in zs]
        inner = [(y - thick, z) for (y, z) in outer]
        loop = [(s * y, z) for (y, z) in outer + list(reversed(inner))]
        n, no = len(loop), len(outer)
        emi = []
        for k in range(n):
            zmid = (loop[k][1] + loop[(k + 1) % n][1]) / 2
            emi.append(band_mi(zmid) if (seg_band and k < no - 1) else 0)
        v, f, mi = extrude_loop(loop, x0, x1, emi, 0)
        geo.add(v, f, mi)

    for xc in DOORS:
        for s in (-1, 1):
            leaf(xc - DOOR_W / 2 + 0.005, xc - 0.006, s, 0.014, 0.03, leaves)
            leaf(xc + 0.006, xc + DOOR_W / 2 - 0.005, s, 0.014, 0.03, leaves)
            leaf(xc - 0.012, xc + 0.012, s, 0.030, 0.02, seams, seg_band=False)
    # 乗務員扉
    for s in (-1, 1):
        leaf(CAB_DOOR[0] + 0.006, CAB_DOOR[1] - 0.006, s, 0.010, 0.03, leaves)
    dobj = leaves.obj("Doors", [M["stainless"], M["navy"], M["sky"]])
    seams.obj("Door_Seal", [M["rubber"]])
    cut = Geo()
    DW = []
    for xc in DOORS:
        for (a, b) in ((xc - 0.56, xc - 0.10), (xc + 0.10, xc + 0.56)):
            DW.append((a, b, 1.98, 2.73))
    DW.append((CAB_DOOR[0] + 0.09, CAB_DOOR[1] - 0.09, 1.97, 2.72))
    for (a, b, z0, z1) in DW:
        v, f = prism_geo(rr_box(a, b, z0, z1, 0.05), -1.8, 1.8, "XZ")
        cut.add(v, f)
    boolean_apply(dobj, cut, cutter_mat=M["rubber"])
    dg = Geo()
    for (a, b, z0, z1) in DW:
        for s in (-1, 1):
            v, f = disk_geo(rr_box(a - 0.01, b + 0.01, z0 - 0.01, z1 + 0.01, 0.05), nr=2)
            dg.add([(u, s * (W - 0.028), w) for (u, w) in v], f)
    dg.obj("Door_Glass", [M["glass"]], smooth=False)
    # 乗務員扉 下降窓の桟・取っ手
    for s in (-1, 1):
        box2("CabDoor_Rail", CAB_DOOR[0] + 0.09, CAB_DOOR[1] - 0.09, s * (W - 0.036), s * (W - 0.022), 2.30, 2.325,
             M["alu"])
        box2("CabDoor_Handle", 8.92, 8.95, s * (W - 0.012), s * (W + 0.010), 1.72, 1.86, M["chrome"], bevel=0.006)
    # 扉レール（敷居）
    for xc in DOORS:
        for s in (-1, 1):
            box2("Door_Sill", xc - DOOR_W / 2, xc + DOOR_W / 2, s * 1.36, s * (yw(1.13) - 0.002), 1.105, 1.138,
                 M["alu"], bevel=0.003)


def build_end_rear():
    """連結面側の妻板・貫通扉・幌・転落防止幌"""
    loop = [(y, z) for (y, z) in full_loop(HALF_IN)]
    g = Geo()
    v, f = prism_geo(loop, XR, XR + 0.04, "YZ")
    g.add(v, f)
    wall = g.obj("End_Wall", [M["stainless"]])
    cut = Geo()
    v, f = prism_geo(rr_box(-0.42, 0.42, 1.15, 3.04, 0.05), XR - 0.1, XR + 0.2, "YZ")
    cut.add(v, f)
    boolean_apply(wall, cut, cutter_mat=M["stainless"])
    # 貫通扉
    g = Geo()
    v, f = prism_geo(rr_box(-0.40, 0.40, 1.155, 3.03, 0.04), XR + 0.012, XR + 0.040, "YZ")
    g.add(v, f)
    door = g.obj("End_Door", [M["stainless"]])
    cut = Geo()
    v, f = prism_geo(rr_box(-0.27, 0.27, 2.02, 2.80, 0.05), XR - 0.1, XR + 0.2, "YZ")
    cut.add(v, f)
    boolean_apply(door, cut, cutter_mat=M["rubber"])
    v, f = disk_geo(rr_box(-0.28, 0.28, 2.01, 2.81, 0.05), nr=2)
    g = Geo(); g.add([(XR + 0.026, u, w) for (u, w) in v], f)
    g.obj("End_Door_Glass", [M["glass"]], smooth=False)
    box2("End_Door_Handle", XR + 0.002, XR + 0.012, 0.30, 0.34, 1.80, 2.00, M["chrome"], bevel=0.004)

    # 幌（ひだ付き）
    cy, cz, bw, bh, br = 0.0, 2.10, 1.18, 2.14, 0.14
    nx = 28
    x0, x1 = XR, XR - 0.30
    base = rr(cy, cz, bw, bh, br, 6)
    nb = len(base)

    def off_rr(o):
        return rr(cy, cz, bw + 2 * o, bh + 2 * o, br + o, 6)

    verts, faces = [], []
    rings = []
    for i in range(nx + 1):
        t = i / nx
        x = x0 + (x1 - x0) * t
        o = 0.035 * abs(sin(pi * t * 7)) + 0.005
        rings.append([(x, u, w) for (u, w) in off_rr(o)])
    inner = [[(x0 + (x1 - x0) * i, u, w) for (u, w) in off_rr(-0.11)] for i in (0, 1)]
    allr = rings + [inner[1], inner[0]]
    for r_ in allr:
        verts += r_
    for k in range(len(allr)):
        k2 = (k + 1) % len(allr)
        for i in range(nb):
            i2 = (i + 1) % nb
            faces.append((k * nb + i, k * nb + i2, k2 * nb + i2, k2 * nb + i))
    add_obj("Gangway_Bellows", mesh_from("bellows", verts, faces, [M["rubber"]], angle=50))
    # 幌枠
    v, f = ring_geo([(XR - 0.30, u, w) for (u, w) in off_rr(0.04)], [(XR - 0.30, u, w) for (u, w) in off_rr(-0.11)])
    g = Geo(); g.add(v, f)
    v, f = ring_geo([(XR - 0.32, u, w) for (u, w) in off_rr(0.04)], [(XR - 0.32, u, w) for (u, w) in off_rr(-0.11)])
    g.add(v, f)
    for i in range(nb):
        i2 = (i + 1) % nb
        g.f.append((i, i2, 2 * nb + i2, 2 * nb + i)); g.m.append(0)
        g.f.append((nb + i, nb + i2, 3 * nb + i2, 3 * nb + i)); g.m.append(0)
    g.obj("Gangway_Face_Plate", [M["equip_dark"]], angle=50)

    # 転落防止幌（2000年代に普及した妻面の安全装置）
    for s in (-1, 1):
        box2("Platform_Guard", XR - 0.22, XR - 0.005, s * 1.02, s * 1.36, 1.16, 2.25, M["rubber"], bevel=0.02)
        for zz in (1.30, 1.70, 2.10):
            box2("Platform_Guard_Bracket", XR - 0.06, XR - 0.002, s * 1.05, s * 1.33, zz, zz + 0.03, M["stainless"])
    # 妻面 手すり・ジャンパ栓受け
    for s in (-1, 1):
        tube("End_Grab", fillet([(XR + 0.002, s * 0.62, 1.35), (XR - 0.06, s * 0.62, 1.38),
                                 (XR - 0.06, s * 0.62, 2.15), (XR + 0.002, s * 0.62, 2.18)], 0.03), 0.013,
             M["stainless"])
        box2("Jumper_Receptacle", XR - 0.10, XR + 0.0, s * 0.70, s * 0.95, 0.80, 0.95, M["equip_dark"], bevel=0.015)
        cyl("Jumper_Plug", 0.04, 0.10, (XR - 0.13, s * 0.82, 0.875), M["rubber"], axis="X", bevel=0.01)
    # 高圧ケーブル引き通し（パンタ → 床下）
    tube("HV_Conduit", [(XR - 0.05, 0.98, 3.30), (XR - 0.05, 0.98, 1.00)], 0.03, M["equip_dark"])
    for zz in (1.4, 2.0, 2.6, 3.2):
        box2("HV_Clamp", XR - 0.09, XR + 0.0, 0.93, 1.03, zz, zz + 0.04, M["stainless"])
    # 棒連結器
    cyl("Bar_Coupler", 0.065, 0.85, (XR - 0.12, 0, 0.88), M["equip_dark"], axis="X", bevel=0.01)
    box2("Bar_Coupler_Head", XR - 0.58, XR - 0.50, -0.12, 0.12, 0.78, 0.98, M["equip_dark"], bevel=0.02)
    box2("Draft_Gear_R", XR + 0.10, XR + 0.75, -0.22, 0.22, 0.74, 0.97, M["equip_dark"], bevel=0.02)
    tube("Air_Hose_R", [(XR + 0.05, -0.35, 0.92), (XR - 0.18, -0.35, 0.80), (XR - 0.30, -0.30, 0.70)], 0.02,
         M["rubber"], kind="NURBS")


def build_side_details():
    # 側面 行先表示器（3色LED）
    x0, x1 = SIDE_LED_X
    z0, z1 = SIDE_LED_Z
    for s in (-1, 1):
        g = Geo()
        v, f = prism_geo(rr_box(x0, x1, z0, z1, 0.02), 0, 0.012, "XZ")
        g.add([(a, s * (W - 0.002) + (b if s > 0 else -b), c) for (a, b, c) in v], f)
        g.obj("Side_LED_Frame", [M["rubber"]])
        g = Geo()
        v, f = disk_geo(rr_box(x0 + 0.02, x1 - 0.02, z0 + 0.018, z1 - 0.018, 0.01), nr=1)
        g.add([(a, s * (W + 0.0125), b) for (a, b) in v], f)
        g.obj("Side_LED_Back", [M["led_back"]], smooth=False)
        xa = -1 if s > 0 else 1   # 外から見て文字が正立する向き
        xm1 = x0 + 0.17 if s < 0 else x1 - 0.17
        xm2 = x1 - 0.30 if s < 0 else x0 + 0.30
        zc = (z0 + z1) / 2
        nrm = (0, s, 0)
        text("Side_LED_Type", "快速", 0.085, M["led_red"],
             frame_matrix((xm1, s * (W + 0.0135), zc), (xa, 0, 0), (0, 0, 1)))
        text("Side_LED_Dest", "上野", 0.098, M["led_orange"],
             frame_matrix((xm2, s * (W + 0.0135), zc), (xa, 0, 0), (0, 0, 1)), spacing=1.3)
        g = Geo()
        v, f = disk_geo(rr_box(x0 + 0.015, x1 - 0.015, z0 + 0.012, z1 - 0.012, 0.01), nr=1)
        g.add([(a, s * (W + 0.0145), b) for (a, b) in v], f)
        g.obj("Side_LED_Cover", [M["glass_clear"]], smooth=False)

    # 車番・形式表記
    for s in (-1, 1):
        xa = -1 if s > 0 else 1
        z = 1.33
        y = s * (yw(z) + 0.0015)
        tilt = (0, s * (yw(z + 0.01) - yw(z - 0.01)) / 0.02, 1)
        text("Car_Number", "クモハE219-1", 0.072, M["text_black"],
             frame_matrix((-8.65, y, z), (xa, 0, 0), tilt))
        text("Car_Number_Front", "クモハE219-1", 0.072, M["text_black"],
             frame_matrix((6.05, y, z), (xa, 0, 0), tilt))
        # 車側灯（戸閉表示灯）
        box2("Side_Lamp_Base", -9.32, -9.20, s * (W - 0.002), s * (W + 0.022), 2.86, 2.95, M["stainless"], bevel=0.008)
        box2("Side_Lamp", -9.31, -9.21, s * (W + 0.02), s * (W + 0.034), 2.87, 2.94, M["lamp_red"], bevel=0.008)
        # 乗務員扉脇 手すり
        for xg in (CAB_DOOR[0] - 0.07, CAB_DOOR[1] + 0.07):
            za, zb_ = 1.32, 2.30
            pts = [(xg, s * (yw(za) - 0.002), za), (xg, s * (yw(za) + 0.055), za + 0.03),
                   (xg, s * (W + 0.055), zb_ - 0.03), (xg, s * (W - 0.002), zb_)]
            tube("Cab_Grab", fillet(pts, 0.03), 0.0125, M["stainless"])
        # 乗務員ステップ
        box2("Cab_Step", 8.55, 8.95, s * 1.20, s * 1.42, 0.62, 0.65, M["equip_dark"], bevel=0.005)
        for xh in (8.58, 8.92):
            box2("Cab_Step_Hanger", xh - 0.015, xh + 0.015, s * 1.36, s * 1.40, 0.62, 0.97, M["equip_dark"])
        # 列車無線 / ATS 表記風の小窓は省略
    # 客用扉上 戸袋部の化粧ライン（細い溝）
    for xc in DOORS:
        for s in (-1, 1):
            for xe in (xc - DOOR_W / 2 - 0.035, xc + DOOR_W / 2 + 0.035):
                box2("Door_Frame_Line", xe - 0.004, xe + 0.004, s * (W - 0.001), s * (W + 0.0015), 1.90, DOOR_Z[1] + 0.02,
                     M["rubber"])


# ---------------------------------------------------------------------------
# 前頭部（FRP製 貫通形）
# ---------------------------------------------------------------------------

LEAN_ZK, LEAN_H, ZT = 1.92, 0.10, 3.08
LEAN_SLOPE = 0.22 / (ZT - LEAN_ZK)


def g_fn(t):
    t = min(abs(t), 1.0)
    return (1.0 - t ** 5) ** 0.2


def lean(z):
    if z < LEAN_ZK - LEAN_H:
        return 0.0
    if z < LEAN_ZK + LEAN_H:
        return LEAN_SLOPE * (z - (LEAN_ZK - LEAN_H)) ** 2 / (4 * LEAN_H)
    return LEAN_SLOPE * (z - LEAN_ZK)


def Dz(z):
    if z <= ZT:
        base = 0.55 if z >= 1.30 else 0.55 - 0.06 * ((1.30 - z) / 0.28) ** 2
        return base - lean(z)
    D0 = 0.55 - lean(ZT)
    L = ZTOP - ZT
    u = min((z - ZT) / L, 1.0)
    return D0 * sqrt(max(0.0, 1 - u * u)) - LEAN_SLOPE * L * u * (1 - u)


def front_x(y, z):
    w = yw(z)
    if w < 1e-6:
        return XB
    t = max(-1.0, min(1.0, y / w))
    return XB + g_fn(t) * (Dz(z) - 0.06 * t * t)


def fproj(pts2d, off):
    return [(front_x(y, z) + off, y, z) for (y, z) in pts2d]


def front_patch(name, outline, off, mat_, nr=14):
    v, f = disk_geo(densify(outline, 0.025), nr)
    g = Geo()
    g.add(fproj(v, off), f)
    return g.obj(name, [mat_], angle=50)


def front_ring(name, outer, inner, off, mat_):
    v, f = ring_geo(*densify_pair(outer, inner, 0.025))
    g = Geo()
    g.add(fproj(v, off), f)
    return g.obj(name, [mat_], angle=50)


def surface_frame(y, z, off):
    e = 0.01
    dxdz = (front_x(y, z + e) - front_x(y, z - e)) / (2 * e)
    dxdy = (front_x(y + e, z) - front_x(y - e, z)) / (2 * e)
    origin = (front_x(y, z) + off, y, z)
    return origin, (dxdy, 1, 0), (dxdz, 0, 1)


def build_front():
    zr = [ZB + (ZV1 - ZB) * i / 120 for i in range(121)]
    feats = [1.58, 1.62, 1.64, 1.86]
    zr = [z for z in zr if all(abs(z - f) > 0.005 for f in feats)] + feats
    for i in range(1, 56):
        th = (pi / 2) * i / 56
        zr.append(ZV1 + (ZTOP - ZV1) * sin(th) ** (2 / NSE))
    zr.append(ZTOP)
    zr = sorted(set(round(z, 6) for z in zr))
    NC = 110
    ts = [sin(pi / 2 * (-1 + 2 * i / NC)) for i in range(NC + 1)]
    verts, faces, mi = [], [], []
    for z in zr:
        w = yw(z)
        for t in ts:
            verts.append((XB + g_fn(t) * (Dz(z) - 0.06 * t * t), t * w, z))
    nc = NC + 1
    for j in range(len(zr) - 1):
        zmid = (zr[j] + zr[j + 1]) / 2
        m_ = band_mi(zmid)
        for i in range(NC):
            faces.append((j * nc + i, j * nc + i + 1, (j + 1) * nc + i + 1, (j + 1) * nc + i))
            mi.append(m_)
    faces.append(tuple(range(nc)))
    mi.append(0)
    add_obj("Front_Mask_FRP", mesh_from("front_mask", verts, faces, [M["frp"], M["navy"], M["sky"]], mi,
                                        merge=True, angle=40))

    # ブラックフェイス
    front_patch("Front_BlackFace", rr_box(-1.34, 1.34, 1.92, 3.13, 0.16, 10), 0.004, M["black_gloss"], nr=26)
    # 前面窓（左右）・貫通扉窓
    for s in (-1, 1):
        a, b = sorted((s * 0.40, s * 1.24))
        front_patch("Front_Windshield", rr_box(a, b, 2.02, 3.02, 0.08), 0.0080, M["glass"], nr=16)
        front_ring("Front_Windshield_Seal", rr_box(a - 0.018, b + 0.018, 2.002, 3.038, 0.095),
                   rr_box(a, b, 2.02, 3.02, 0.08), 0.0062, M["rubber"])
    # 貫通扉
    front_ring("Front_Door_Gap", rr_box(-0.345, 0.345, 1.16, 3.075, 0.05), rr_box(-0.333, 0.333, 1.172, 3.063, 0.045),
               0.0048, M["rubber"])
    front_patch("Front_Door_Window", rr_box(-0.24, 0.24, 2.10, 2.97, 0.05), 0.0080, M["glass"], nr=10)
    front_ring("Front_Door_Window_Seal", rr_box(-0.256, 0.256, 2.084, 2.986, 0.06), rr_box(-0.24, 0.24, 2.10, 2.97, 0.05),
               0.0062, M["rubber"])
    o, xa, ya = surface_frame(0.22, 1.62, 0.006)
    box("Front_Door_Handle", (0.03, 0.10, 0.025), o, M["chrome"], bevel=0.008)
    # 行先表示器（運転台窓上部、ガラス内側） / 運行番号表示器
    front_patch("Front_LED_Back", rr_box(-1.13, -0.51, 2.83, 2.975, 0.012), 0.0054, M["led_back"], nr=4)
    o, xa, ya = surface_frame(-0.82, 2.902, 0.0059)
    text("Front_LED_Dest", "快速 上野", 0.092, M["led_orange"], frame_matrix(o, xa, ya), spacing=1.05)
    front_patch("Front_LED_RunNo_Back", rr_box(0.78, 1.13, 2.83, 2.975, 0.012), 0.0054, M["led_back"], nr=4)
    o, xa, ya = surface_frame(0.955, 2.902, 0.0059)
    text("Front_LED_RunNo", "1520M", 0.092, M["led_orange"], frame_matrix(o, xa, ya))

    # 前照灯・尾灯ユニット（帯の中に一体化）
    for s in (-1, 1):
        a, b = sorted((s * 0.86, s * 1.30))
        front_patch("Light_Unit_Housing", rr_box(a, b, 1.665, 1.835, 0.04), 0.0050, M["black_gloss"], nr=8)
        for yc in (s * 0.975, s * 1.105):
            front_ring("HID_Reflector", circle(yc, 1.75, 0.056, 40), circle(yc, 1.75, 0.030, 40), 0.0065, M["chrome"])
            front_patch("HID_Lamp", circle(yc, 1.75, 0.0305, 40), 0.0072, M["headlamp"], nr=4)
        ta, tb = sorted((s * 1.165, s * 1.27))
        front_patch("Tail_LED", rr_box(ta, tb, 1.700, 1.800, 0.015), 0.0068, M["tail_off"], nr=4)
        front_patch("Light_Unit_Cover", rr_box(a + 0.004, b - 0.004, 1.669, 1.831, 0.036), 0.0110, M["glass_clear"], nr=8)

    # ワイパー
    for s in (-1, 1):
        piv = (s * 0.47, 2.05)
        arm = [(piv[0] + s * 0.36 * k / 6, piv[1] + 0.01 * k / 6) for k in range(7)]
        tube("Wiper_Arm", [(front_x(y, z) + 0.016, y, z) for (y, z) in arm], 0.006, M["rubber"])
        blade = [(s * (0.55 + 0.6 * k / 8), 2.042) for k in range(9)]
        tube("Wiper_Blade", [(front_x(y, z) + 0.012, y, z) for (y, z) in blade], 0.005, M["rubber"])
        o, xa, ya = surface_frame(piv[0], piv[1], 0.008)
        cyl("Wiper_Pivot", 0.018, 0.03, o, M["rubber"], axis="X")
    # 前面 手すり・足掛け
    for s in (-1, 1):
        ys = s * 0.43
        pts = [(front_x(ys, 1.26) + 0.003, ys, 1.26), (front_x(ys, 1.29) + 0.05, ys, 1.29),
               (front_x(ys, 1.51) + 0.05, ys, 1.51), (front_x(ys, 1.54) + 0.003, ys, 1.54)]
        tube("Front_Grab", fillet(pts, 0.025), 0.012, M["stainless"])
        # 前面角の手すり
        xg = XB - 0.06
        za, zb_ = 1.40, 2.28
        pts = [(xg, s * (yw(za) - 0.002), za), (xg, s * (yw(za) + 0.05), za + 0.03),
               (xg, s * (W + 0.05), zb_ - 0.03), (xg, s * (W - 0.002), zb_)]
        tube("Front_Corner_Grab", fillet(pts, 0.03), 0.0125, M["stainless"])
    o, xa, ya = surface_frame(0.0, 1.10, 0.0)
    box("Front_Footstep", (0.10, 0.50, 0.025), (o[0] + 0.03, 0, 1.08), M["alu"], bevel=0.005)
    # 形式エンブレム
    o, xa, ya = surface_frame(-0.86, 1.40, 0.0015)
    text("Front_Emblem", "E219", 0.10, M["sky"], frame_matrix(o, xa, ya), extrude=0.0012)

    # 前頭部の床下閉じ（ZB面）は Front_Mask の底面で兼用。運転台仕切りと簡易コンソール
    box2("Cab_Console", 8.85, XB + 0.25, -1.30, 1.30, ZF, 2.02, M["console"], bevel=0.03)
    box2("Cab_Seat", 8.45, 8.80, 0.35, 0.85, ZF, 1.62, M["console"], bevel=0.04)

    build_skirt_and_coupler()


def build_skirt_and_coupler():
    zs = [0.30 + 0.70 * i / 28 for i in range(29)]
    zs = sorted(set([round(z, 5) for z in zs] + [0.56]))
    us = [-1 + 2 * i / 64 for i in range(65)]
    UO = 0.33
    us = sorted(set([round(u, 5) for u in us] + [-UO, UO]))

    def hw(z):
        return 1.15 + 0.15 * (z - 0.30) / 0.70

    def xs(y, z):
        return 9.62 - 0.42 * (y / 1.30) ** 2 + 0.06 * (1.0 - z) / 0.70

    verts, faces = [], []
    nu = len(us)
    for z in zs:
        for u in us:
            y = u * hw(z)
            verts.append((xs(y, z), y, z))
    for j in range(len(zs) - 1):
        zm = (zs[j] + zs[j + 1]) / 2
        for i in range(nu - 1):
            um = (us[i] + us[i + 1]) / 2
            if abs(um) < UO and zm > 0.56:
                continue
            faces.append((j * nu + i, j * nu + i + 1, (j + 1) * nu + i + 1, (j + 1) * nu + i))
    me = mesh_from("skirt", verts, faces, [M["skirt"]], angle=40)
    o = add_obj("Skirt", me)
    sm = o.modifiers.new("thick", "SOLIDIFY")
    sm.thickness = 0.014
    sm.offset = -1
    # リブ・下端補強
    for yy in (-1.05, -0.62, 0.62, 1.05):
        xf = xs(yy, 0.6)
        box2("Skirt_Rib", xf - 0.32, xf - 0.012, yy - 0.006, yy + 0.006, 0.34, 0.99, M["skirt"])
    for u in (-UO, UO):
        yy = u * hw(0.8)
        xf = xs(yy, 0.8)
        box2("Skirt_Rib_C", xf - 0.30, xf - 0.012, yy - 0.006, yy + 0.006, 0.56, 0.99, M["skirt"])
    lip = [(xs(u * hw(0.30), 0.30) - 0.03, u * hw(0.30), 0.30) for u in [-1 + 2 * i / 30 for i in range(31)]]
    tube("Skirt_Lip", lip, 0.012, M["skirt"])

    # 密着連結器（柴田式）＋電気連結器
    zc = 0.88
    box2("Coupler_Shank", 8.95, 9.86, -0.075, 0.075, zc - 0.07, zc + 0.07, M["equip_dark"], bevel=0.02)
    box2("Coupler_Head", 9.82, 10.04, -0.16, 0.16, zc - 0.12, zc + 0.12, M["equip_dark"], bevel=0.03)
    # 案内（凸）と受け（凹）
    g = Geo()
    v, f = prism_geo([(0.02, -0.07), (0.12, -0.05), (0.14, 0.0), (0.12, 0.05), (0.02, 0.07)], 0.02, 0.15, "XY")
    g.add([(10.02 + p[0], p[1] - 0.08, zc - 0.08 + p[2]) for p in v], f)
    g.obj("Coupler_Guide", [M["equip_dark"]], angle=40)
    cyl("Coupler_Socket", 0.05, 0.02, (10.041, 0.08, zc), M["rubber"], axis="X")
    box2("Coupler_AirPort", 10.035, 10.045, -0.03, 0.03, zc - 0.11, zc - 0.08, M["copper"])
    box2("Elec_Coupler", 9.72, 10.03, -0.22, 0.22, 0.58, 0.74, M["equip"], bevel=0.02)
    box2("Elec_Coupler_Face", 10.03, 10.04, -0.20, 0.20, 0.60, 0.72, M["rubber"])
    rod("Elec_Coupler_Link", (9.80, 0.0, 0.74), (9.90, 0.0, zc - 0.12), 0.02, M["equip_dark"])
    box2("Draft_Gear_F", 8.55, 9.05, -0.22, 0.22, 0.74, 0.97, M["equip_dark"], bevel=0.02)
    # 空気笛・ATS車上子
    for s in (-1, 1):
        cyl("Air_Horn", 0.05, 0.30, (9.10, s * 0.55, 0.88), M["equip_dark"], axis="X", r2=0.03)
    box2("ATS_P_Antenna", 8.75, 9.05, -0.20, 0.20, 0.22, 0.28, M["equip_dark"], bevel=0.01)
    for yy in (-0.15, 0.15):
        box2("ATS_Hanger", 8.88, 8.92, yy - 0.02, yy + 0.02, 0.28, 0.96, M["equip_dark"])


# ---------------------------------------------------------------------------
# 台車（ボルスタレス・軸梁式）
# ---------------------------------------------------------------------------

WHEEL_PROFILE = [
    (0.090, -0.015), (0.150, -0.015), (0.168, 0.010), (0.250, 0.040), (0.335, 0.050), (0.370, 0.000),
    (0.440, 0.000), (0.455, 0.008), (0.459, 0.018), (0.452, 0.029), (0.432, 0.040), (0.4315, 0.044),
    (0.430, 0.070), (0.4265, 0.125), (0.421, 0.131), (0.370, 0.131), (0.340, 0.092), (0.250, 0.086),
    (0.172, 0.096), (0.160, 0.150), (0.090, 0.150)]
AIRSPRING_PROFILE = [(0.0, 0.0), (0.22, 0.0), (0.22, 0.02), (0.26, 0.04), (0.30, 0.10), (0.305, 0.13),
                     (0.29, 0.18), (0.25, 0.215), (0.30, 0.215), (0.30, 0.24), (0.0, 0.24)]
INSULATOR_PROFILE = [(0.0, 0.0), (0.065, 0.0), (0.065, 0.02), (0.042, 0.03), (0.078, 0.045), (0.078, 0.052),
                     (0.042, 0.062), (0.042, 0.075), (0.074, 0.088), (0.074, 0.095), (0.042, 0.105),
                     (0.042, 0.118), (0.07, 0.13), (0.07, 0.137), (0.042, 0.147), (0.05, 0.15), (0.05, 0.17),
                     (0.0, 0.17)]


def wheel_mi(a, b):
    return 1 if (a[0] > 0.42 and b[0] > 0.42) else 0


def build_bogie(xc, name, front=False):
    wm = lathe_mesh("wheel", WHEEL_PROFILE, [M["wheel"], M["tread"]], seg=72, axis="Y", mi_fn=wheel_mi)
    for dx in (-1.05, 1.05):
        wx = xc + dx
        sgn = 1 if dx > 0 else -1     # 台車中心から見た車軸の方向
        for s in (-1, 1):
            add_obj(f"{name}_Wheel", wm, (wx, s * 0.495, 0.43), (0, 0, 0 if s > 0 else pi))
        cyl(f"{name}_Axle", 0.09, 2.08, (wx, 0, 0.43), M["wheel"], axis="Y")
        for s in (-1, 1):
            yb = s * 0.98
            cyl(f"{name}_AxleBox", 0.118, 0.18, (wx, yb, 0.43), M["bogie"], axis="Y", bevel=0.015)
            cyl(f"{name}_AxleBox_Cap", 0.095, 0.035, (wx, s * 1.085, 0.43), M["bogie"], axis="Y", bevel=0.008)
            for k in range(6):
                a = 2 * pi * k / 6
                cyl(f"{name}_Bolt", 0.012, 0.02, (wx + 0.075 * cos(a), s * 1.105, 0.43 + 0.075 * sin(a)), M["bogie"],
                    axis="Y", seg=6)
            box(f"{name}_SpringSeat", (0.26, 0.20, 0.06), (wx, yb, 0.555), M["bogie"], bevel=0.012)
            # 軸梁
            box(f"{name}_AxleBeam", (0.56, 0.12, 0.10), (wx - sgn * 0.30, yb, 0.38), M["bogie"], bevel=0.02)
            cyl(f"{name}_AxleBeam_Bush", 0.07, 0.16, (wx - sgn * 0.58, yb, 0.40), M["rubber"], axis="Y", bevel=0.01)
            helix(f"{name}_CoilSpring", (wx, yb), 0.08, 0.016, 0.585, 0.70, 4.5, M["spring"])
            # 踏面ブレーキユニット
            box(f"{name}_BrakeUnit", (0.20, 0.17, 0.26), (wx - sgn * 0.58, s * 0.58, 0.47), M["bogie"], bevel=0.02)
            box(f"{name}_BrakeShoe", (0.05, 0.12, 0.30), (wx - sgn * 0.448, s * 0.565, 0.43), M["equip_dark"],
                bevel=0.01)
            # 主電動機（全軸駆動の M 台車）
        mx = wx - sgn * 0.62
        cyl(f"{name}_TractionMotor", 0.225, 0.62, (mx, -0.13, 0.45), M["bogie"], axis="Y", bevel=0.02)
        for k in range(5):
            cyl(f"{name}_MotorRib", 0.236, 0.012, (mx, -0.38 + 0.11 * k, 0.45), M["bogie"], axis="Y")
        cyl(f"{name}_Coupling", 0.12, 0.09, (mx, 0.235, 0.45), M["equip_dark"], axis="Y", bevel=0.01)
        box(f"{name}_GearBox", (0.70, 0.13, 0.34), (wx - sgn * 0.28, 0.33, 0.43), M["bogie"], bevel=0.04)
        box(f"{name}_MotorMount", (0.30, 0.30, 0.10), (mx + sgn * 0.12, -0.13, 0.66), M["bogie"], bevel=0.015)
        tube(f"{name}_MotorCable", [(mx, -0.30, 0.66), (mx + sgn * 0.1, -0.35, 0.82), (mx + sgn * 0.2, -0.40, 0.97)],
             0.015, M["rubber"], kind="NURBS")

    # 側梁（魚腹形）
    poly = [(-1.42, 0.88), (-0.58, 0.88), (-0.40, 0.74), (0.40, 0.74), (0.58, 0.88), (1.42, 0.88),
            (1.42, 0.70), (0.62, 0.70), (0.42, 0.50), (-0.42, 0.50), (-0.62, 0.70), (-1.42, 0.70)]
    poly = [(xc + a, b) for (a, b) in reversed(poly)]
    for s in (-1, 1):
        v, f = prism_geo(poly, s * 0.88, s * 1.08, "XZ")
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in v]
        for fc in f:
            try:
                bm.faces.new([vs[k] for k in fc])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        try:
            bmesh.ops.bevel(bm, geom=list(bm.verts) + list(bm.edges), offset=0.018, offset_type="OFFSET", segments=2,
                            profile=0.5, affect="EDGES", clamp_overlap=True)
        except Exception:
            pass
        add_obj(f"{name}_SideFrame", bm_finish(bm, "sideframe", [M["bogie"]], angle=40))
        # 側梁の補強リブ・吊り
        for xx in (-0.9, -0.25, 0.25, 0.9):
            box(f"{name}_FrameRib", (0.012, 0.012, 0.16), (xc + xx, s * 1.087, 0.79 if abs(xx) > 0.5 else 0.62),
                M["bogie"])
        # 空気ばね
        add_obj(f"{name}_AirSpring", lathe_mesh("airspring", AIRSPRING_PROFILE, [M["rubber"]], seg=48),
                (xc, s * 0.98, 0.745))
        cyl(f"{name}_AirSpring_Plate", 0.31, 0.03, (xc, s * 0.98, 0.995), M["bogie"], bevel=0.008)
        # ヨーダンパ
        rod(f"{name}_YawDamper", (xc + 0.05, s * 1.19, 0.82), (xc - 0.80, s * 1.19, 0.90), 0.035, M["equip_dark"])
        rod(f"{name}_YawDamper_Cover", (xc + 0.02, s * 1.19, 0.823), (xc - 0.40, s * 1.19, 0.861), 0.045, M["bogie"])
        box(f"{name}_YawBracket", (0.10, 0.12, 0.18), (xc + 0.08, s * 1.15, 0.84), M["bogie"], bevel=0.01)
        box(f"{name}_YawBracket_Body", (0.12, 0.12, 0.14), (xc - 0.84, s * 1.19, 0.94), M["equip_dark"], bevel=0.01)
        # 自動高さ調整弁
        box(f"{name}_LevelingValve", (0.10, 0.08, 0.08), (xc + 0.55, s * 1.12, 0.92), M["equip_dark"], bevel=0.01)
        rod(f"{name}_LevelingRod", (xc + 0.55, s * 1.12, 0.88), (xc + 0.62, s * 1.12, 0.74), 0.008, M["equip_dark"])
    # 横梁
    for xx in (-0.28, 0.28):
        cyl(f"{name}_CrossBeam", 0.10, 1.80, (xc + xx, 0, 0.60), M["bogie"], axis="Y")
    # 牽引装置・左右動ダンパ
    box(f"{name}_TractionLink", (0.30, 0.42, 0.20), (xc, 0, 0.64), M["bogie"], bevel=0.03)
    cyl(f"{name}_CenterPin", 0.08, 0.30, (xc, 0, 0.84), M["equip_dark"], bevel=0.01)
    rod(f"{name}_LateralDamper", (xc + 0.15, -0.38, 0.62), (xc + 0.15, 0.30, 0.66), 0.032, M["equip_dark"])
    if front:
        box(f"{name}_ATS_Pickup", (0.22, 0.30, 0.06), (xc + 1.52, 0.0, 0.17), M["equip_dark"], bevel=0.01)
        for yy in (-0.12, 0.12):
            rod(f"{name}_ATS_Arm", (xc + 1.52, yy, 0.20), (xc + 1.40, yy, 0.72), 0.015, M["bogie"])


# ---------------------------------------------------------------------------
# 床下機器
# ---------------------------------------------------------------------------

def equip(name, x0, x1, y0, y1, z0, z1, mat_=None, fins=0, latches=2, lid_lines=2):
    mat_ = mat_ or M["equip"]
    box2(name, x0, x1, y0, y1, z0, z1, mat_, bevel=0.02)
    outer_y = y1 if abs(y1) > abs(y0) else y0
    s = 1 if outer_y > 0 else -1
    # 吊り金具
    for xx in (x0 + 0.08, x1 - 0.08):
        for yy in (y0 + 0.06, y1 - 0.06):
            box2(name + "_Hanger", xx - 0.03, xx + 0.03, yy - 0.03, yy + 0.03, z1 - 0.01, 0.965, M["equip_dark"])
    # 点検蓋の合わせ目・ラッチ
    L = x1 - x0
    for k in range(1, lid_lines + 1):
        xx = x0 + L * k / (lid_lines + 1)
        box2(name + "_LidLine", xx - 0.004, xx + 0.004, outer_y - s * 0.002, outer_y + s * 0.002, z0 + 0.03, z1 - 0.03,
             M["equip_dark"])
    for k in range(latches):
        xx = x0 + L * (k + 0.5) / latches
        box2(name + "_Latch", xx - 0.03, xx + 0.03, outer_y, outer_y + s * 0.018, (z0 + z1) / 2 - 0.02,
             (z0 + z1) / 2 + 0.02, M["chrome"], bevel=0.004)
    if fins:
        fx0, fx1 = x0 + 0.12, x0 + 0.12 + fins * 0.035
        for k in range(fins):
            xx = fx0 + k * 0.035
            box2(name + "_Fin", xx - 0.003, xx + 0.003, outer_y, outer_y + s * 0.07, z0 + 0.05, z1 - 0.05, M["alu"])


def build_underfloor():
    # VVVFインバータ（IGBT）
    equip("VVVF_Inverter", -4.70, -1.60, 0.10, 1.26, 0.42, 0.95, fins=26, latches=4, lid_lines=3)
    equip("Filter_Reactor", -1.35, -0.25, 0.35, 1.18, 0.52, 0.95, M["equip_dark"], latches=2, lid_lines=1)
    equip("HSCB", 0.05, 0.95, 0.55, 1.22, 0.60, 0.95, latches=2, lid_lines=1)
    equip("Line_Breaker", 1.20, 1.85, 0.70, 1.20, 0.66, 0.95, latches=1, lid_lines=0)
    equip("Brake_Control", 2.30, 3.70, 0.45, 1.20, 0.62, 0.95, latches=3, lid_lines=2)
    equip("Junction_Box_A", 4.00, 4.70, 0.85, 1.22, 0.72, 0.95, M["equip_dark"], latches=1, lid_lines=0)
    equip("Battery_Box", 0.10, 2.10, -1.24, -0.30, 0.56, 0.95, M["equip_dark"], latches=3, lid_lines=2)
    equip("Air_Compressor_Box", 2.50, 4.10, -1.20, -0.45, 0.50, 0.95, latches=2, lid_lines=1)
    equip("Junction_Box_B", -1.20, -0.40, -1.22, -0.75, 0.70, 0.95, latches=1, lid_lines=0)
    equip("Auxiliary_Box", -4.75, -4.15, -1.22, -0.70, 0.68, 0.95, latches=1, lid_lines=0)
    # 元空気溜め
    for yy in (-0.95, -0.55):
        cyl("Main_Reservoir", 0.17, 3.0, (-2.55, yy, 0.74), M["equip"], axis="X")
        for xe in (-4.05, -1.05):
            add_obj("Main_Reservoir_End", lathe_mesh("tankend", [(0.0, 0.0), (0.17, 0.0), (0.165, 0.04),
                                                                   (0.13, 0.08), (0.0, 0.10)], [M["equip"]], seg=32,
                                                     axis="X"),
                    (xe, yy, 0.74), (0, 0, 0 if xe > -2.5 else pi))
        for xs_ in (-3.6, -1.5):
            box2("Tank_Strap", xs_ - 0.03, xs_ + 0.03, yy - 0.19, yy + 0.19, 0.90, 0.97, M["equip_dark"])
    cyl("Compressor_Motor", 0.16, 0.50, (3.30, -0.25, 0.70), M["equip_dark"], axis="X", bevel=0.01)
    # 配管・配線ダクト
    for yy, r_, m_ in ((1.30, 0.03, M["equip_dark"]), (1.24, 0.016, M["copper"]), (-1.30, 0.03, M["equip_dark"]),
                       (-1.25, 0.012, M["equip_dark"])):
        tube("Underfloor_Duct", [(-5.1, yy, 0.93), (5.1, yy, 0.93)], r_, m_)
    for xx in (-5.0, -2.5, 0.0, 2.5, 5.0):
        for s in (-1, 1):
            box2("Duct_Bracket", xx - 0.02, xx + 0.02, s * 1.20, s * 1.34, 0.90, 0.965, M["equip_dark"])
    # 車端部
    equip("Cab_Equip", 8.50, 8.60, -1.15, -0.55, 0.70, 0.95, M["equip_dark"], latches=1, lid_lines=0)


# ---------------------------------------------------------------------------
# 屋根上機器
# ---------------------------------------------------------------------------

def build_roof():
    # 集約分散式冷房装置（AU726系イメージ）
    xa, L, Wd = 0.40, 2.75, 1.80
    zb, zt = 3.62, 4.00
    box2("AC_Base", xa - L / 2 + 0.1, xa + L / 2 - 0.1, -0.84, 0.84, 3.48, zb + 0.01, M["equip_dark"], bevel=0.01)
    bm = box_bm(L, Wd, zt - zb, bevel=0.07, seg=4)
    ac_me = bm_finish(bm, "ac", [M["ac_body"]], angle=40)
    ac = add_obj("AC_Unit", ac_me, (xa, 0, (zb + zt) / 2))
    cut2 = Geo()
    for dx in (-0.72, 0.72):
        v, f = prism_geo(circle(0.0, 0.0, 0.37, 64), zt - 0.085, zt + 0.10, "XY")
        cut2.add([(xa + dx + p[0], p[1], p[2]) for p in v], f)
    boolean_apply(ac, cut2, cutter_mat=M["grille"])
    for dx in (-0.72, 0.72):
        cx = xa + dx
        # ファン（羽根）
        for k in range(5):
            a = 2 * pi * k / 5
            box("AC_FanBlade", (0.30, 0.10, 0.012), (cx + 0.17 * cos(a), 0.17 * sin(a), zt - 0.07), M["grille"],
                bevel=0.004, rot=(0.35, 0, a))
        cyl("AC_FanHub", 0.07, 0.06, (cx, 0, zt - 0.07), M["grille"], bevel=0.01)
        # ファンガード
        for rk in (0.08, 0.14, 0.20, 0.26, 0.32):
            add_obj("AC_Guard_Ring", lathe_mesh(f"guard{rk}", [(rk + 0.004 * cos(2 * pi * i / 8),
                                                                 0.004 * sin(2 * pi * i / 8)) for i in range(8)],
                                                [M["grille"]], seg=64), (cx, 0, zt + 0.002))
        for k in range(8):
            a = pi * k / 8
            box("AC_Guard_Bar", (0.72, 0.008, 0.008), (cx, 0, zt + 0.004), M["grille"], rot=(0, 0, a))
        add_obj("AC_Fan_Rim", lathe_mesh("fanrim", [(0.37 + 0.012 * cos(2 * pi * i / 10), 0.012 * sin(2 * pi * i / 10))
                                                    for i in range(10)], [M["ac_body"]], seg=64), (cx, 0, zt))
    # 側面ルーバー
    for s in (-1, 1):
        for (u0, u1) in ((-1.25, -0.20), (0.20, 1.25)):
            box2("AC_Louver_Back", xa + u0, xa + u1, s * (Wd / 2 - 0.002), s * (Wd / 2 + 0.004), 3.68, 3.95, M["grille"])
            for k in range(10):
                z = 3.70 + k * 0.025
                box("AC_Louver_Slat", (u1 - u0, 0.022, 0.006), (xa + (u0 + u1) / 2, s * (Wd / 2 + 0.012), z),
                    M["ac_body"], rot=(s * 0.6, 0, 0))
    for xx in (-0.95, 0.0, 0.95):
        box2("AC_Lid_Seam", xa + xx - 0.004, xa + xx + 0.004, -0.80, 0.80, zt - 0.001, zt + 0.002, M["equip_dark"])
    for s in (-1, 1):
        for xx in (-1.15, 1.15):
            box2("AC_Lift_Lug", xa + xx - 0.03, xa + xx + 0.03, s * 0.86, s * 0.92, zt - 0.01, zt + 0.03, M["ac_body"])

    build_pantograph(-6.90)

    # 避雷器・高圧配線
    zr0 = roof_z(0.55)
    add_obj("Arrester_Insulator", lathe_mesh("insulator", INSULATOR_PROFILE, [M["insulator"]], seg=32),
            (-5.55, 0.55, zr0 - 0.01))
    cyl("Lightning_Arrester", 0.055, 0.22, (-5.55, 0.55, zr0 + 0.27), M["insulator"], bevel=0.01)
    tube("HV_Cable_A", [(-6.40, 0.30, 3.83), (-5.95, 0.50, 3.78), (-5.55, 0.55, zr0 + 0.17)], 0.018,
         M["equip_dark"], kind="NURBS")
    zc = roof_z(0.98) + 0.04
    tube("HV_Cable_B", [(-5.55, 0.55, zr0 + 0.05), (-5.6, 0.75, roof_z(0.75) + 0.05), (-6.2, 0.98, zc),
                        (-9.40, 0.98, zc), (-9.72, 0.98, 3.45), (-9.80, 0.98, 3.30)], 0.02, M["equip_dark"], kind="NURBS")
    for xx in (-6.8, -7.6, -8.4, -9.2):
        box2("HV_Cable_Support", xx - 0.03, xx + 0.03, 0.93, 1.03, roof_z(1.0) - 0.02, zc + 0.03, M["insulator"])
    # 歩み板
    for s in (-1, 1):
        box2("Roof_Walkway", -8.6, -5.2, s * 0.50, s * 0.78, roof_z(0.64) - 0.03, roof_z(0.64) + 0.012, M["walkway"])
    # 列車無線アンテナ・GPS
    zr = roof_z(0.0)
    box2("Radio_Antenna_Base", 8.05, 8.35, -0.12, 0.12, zr - 0.02, zr + 0.04, M["equip_dark"], bevel=0.01)
    rod("Radio_Antenna", (8.20, 0, zr + 0.04), (8.05, 0, zr + 0.42), 0.007, M["equip_dark"])
    add_obj("Radio_Antenna_Coil", lathe_mesh("coil", [(0, 0), (0.025, 0), (0.025, 0.06), (0, 0.06)], [M["rubber"]],
                                             seg=16), (8.20, 0, zr + 0.04))
    box2("GPS_Antenna", 7.35, 7.55, -0.08, 0.08, zr - 0.02, zr + 0.035, M["insulator"], bevel=0.015)
    # 屋根上の昇降用手掛け
    for s in (-1, 1):
        for xx in (-9.45, 8.85):
            box2("Roof_Step", xx - 0.12, xx + 0.12, s * (yw(3.35) - 0.03), s * (yw(3.35) + 0.01), 3.33, 3.36,
                 M["stainless"])


def build_pantograph(xp):
    zr = roof_z(0.40)
    ins = lathe_mesh("insulator", INSULATOR_PROFILE, [M["insulator"]], seg=32)
    for sx in (-0.45, 0.45):
        for sy in (-0.40, 0.40):
            add_obj("Panto_Insulator", ins, (xp + sx, sy, zr - 0.012))
    z0 = zr - 0.012 + 0.17
    for sy in (-0.40, 0.40):
        box2("Panto_Frame_Side", xp - 0.55, xp + 0.55, sy - 0.035, sy + 0.035, z0, z0 + 0.07, M["panto"], bevel=0.008)
    for sx in (-0.45, 0.0, 0.45):
        box2("Panto_Frame_Cross", xp + sx - 0.035, xp + sx + 0.035, -0.40, 0.40, z0, z0 + 0.065, M["panto"], bevel=0.008)
    P1 = Vector((xp + 0.40, 0, z0 + 0.13))
    H = Vector((xp, 0, 4.93))
    L1, L2 = 1.40, 1.05
    d = (H - P1).length
    a = (L1 * L1 - L2 * L2 + d * d) / (2 * d)
    h = sqrt(max(0.0, L1 * L1 - a * a))
    u = (H - P1) / d
    perp = Vector((-u.z, 0, u.x))
    if perp.x > 0:
        perp = -perp
    K = P1 + u * a + perp * h
    for sy in (-0.22, 0.22):
        box("Panto_Bearing", (0.12, 0.08, 0.10), (P1.x, sy, P1.z - 0.02), M["panto"], bevel=0.01)
    cyl("Panto_MainShaft", 0.03, 0.52, P1, M["panto"], axis="Y")
    # 下枠（A形フレーム）
    for sy in (-0.20, 0.20):
        rod("Panto_LowerArm", (P1.x, sy, P1.z), (K.x, sy * 0.15, K.z), 0.034, M["panto"], r2=0.026)
    rod("Panto_LowerArm_Brace", (P1.x - (P1.x - K.x) * 0.25, -0.16, P1.z + (K.z - P1.z) * 0.25),
        (P1.x - (P1.x - K.x) * 0.25, 0.16, P1.z + (K.z - P1.z) * 0.25), 0.015, M["panto"])
    # 釣合棒
    rod("Panto_PushRod", (xp + 0.18, 0, z0 + 0.10), (K.x + 0.10, 0, K.z - 0.06), 0.011, M["panto"])
    cyl("Panto_Knee", 0.042, 0.14, K, M["panto"], axis="Y", bevel=0.006)
    # 上枠
    for sy in (-0.19, 0.19):
        rod("Panto_UpperArm", (K.x, sy * 0.25, K.z), (H.x, sy, H.z), 0.022, M["panto"], r2=0.016)
    rod("Panto_UpperArm_Center", (K.x, 0, K.z), (H.x, 0, H.z), 0.012, M["panto"])
    rod("Panto_Guide", (K.x - 0.05, 0, K.z + 0.02), (H.x - 0.08, 0, H.z - 0.02), 0.008, M["panto"])
    cyl("Panto_HeadShaft", 0.02, 0.50, H, M["panto"], axis="Y")
    # 主ばね・ダンパ
    cyl("Panto_Spring_Housing", 0.055, 0.62, (xp - 0.08, 0.10, z0 + 0.12), M["panto"], axis="X", bevel=0.01)
    cyl("Panto_Damper", 0.03, 0.45, (xp - 0.05, -0.12, z0 + 0.11), M["equip_dark"], axis="X")
    box("Panto_AirCylinder", (0.20, 0.12, 0.10), (xp - 0.38, -0.12, z0 + 0.12), M["equip_dark"], bevel=0.01)
    box("Panto_Terminal", (0.10, 0.12, 0.08), (xp + 0.50, 0.30, z0 + 0.10), M["copper"], bevel=0.01)
    # 舟体（すり板2本）
    for dxs in (-0.13, 0.13):
        box("Panto_Pan_Base", (0.055, 1.10, 0.035), (xp + dxs, 0, 5.064), M["alu"], bevel=0.006)
        box("Panto_Carbon", (0.040, 1.06, 0.018), (xp + dxs, 0, 5.0905), M["carbon"], bevel=0.003)
        for s in (-1, 1):
            tube("Panto_Horn", [(xp + dxs, s * 0.53, 5.065), (xp + dxs, s * 0.72, 5.05), (xp + dxs, s * 0.86, 4.98),
                                (xp + dxs, s * 0.90, 4.90)], 0.011, M["alu"], kind="NURBS")
    for s in (-1, 1):
        rod("Panto_Pan_Support", (xp, s * 0.22, H.z), (xp - 0.13, s * 0.30, 5.042), 0.010, M["panto"])
        rod("Panto_Pan_Support", (xp, s * 0.22, H.z), (xp + 0.13, s * 0.30, 5.042), 0.010, M["panto"])
        rod("Panto_Pan_Cross", (xp - 0.13, s * 0.45, 5.045), (xp + 0.13, s * 0.45, 5.045), 0.009, M["alu"])
        box("Panto_Pan_Spring", (0.06, 0.05, 0.05), (xp, s * 0.30, 5.00), M["panto"], bevel=0.008)


# ---------------------------------------------------------------------------
# 室内
# ---------------------------------------------------------------------------

def long_seat(x0, x1, s, mat_=None, n=None):
    mat_ = mat_ or M["seat"]
    L = x1 - x0
    n = n or max(1, round(L / 0.46))
    w = L / n
    for k in range(n):
        xc = x0 + w * (k + 0.5)
        box("Seat_Cushion", (w - 0.012, 0.50, 0.10), (xc, s * 1.17, 1.51), mat_, bevel=0.03, seg=3)
        box("Seat_Back", (w - 0.012, 0.09, 0.42), (xc, s * 1.395, 1.80), mat_, bevel=0.035, seg=3,
            rot=(s * -0.13, 0, 0))
    box2("Seat_Base", x0, x1, s * 1.05, s * 1.42, 1.17, 1.46, M["stainless"], bevel=0.01)
    for xe in (x0 - 0.02, x1 + 0.02):
        g = Geo()
        v, f = prism_geo(rr_box(0.86, 1.43, 1.15, 2.35, 0.10), xe - 0.016, xe + 0.016, "YZ")
        g.add([(a, s * b, c) for (a, b, c) in v], f)
        g.obj("Seat_Partition", [M["int_wall"]], angle=40)
        cyl("Stanchion", 0.017, 3.36 - ZF, (xe, s * 0.86, (ZF + 3.36) / 2), M["stainless"], seg=20)
    if L > 2.0:
        xm = x0 + w * (n // 2)
        cyl("Stanchion", 0.017, 3.36 - ZF, (xm, s * 0.94, (ZF + 3.36) / 2), M["stainless"], seg=20)
    # 荷棚
    box2("Luggage_Rack", x0, x1, s * 1.06, s * 1.40, 2.85, 2.86, M["alu"])
    for yy in (1.08, 1.18, 1.28):
        cyl("Luggage_Rack_Rod", 0.008, L, ((x0 + x1) / 2, s * yy, 2.875), M["alu"], axis="X", seg=10)
    for xx in [x0 + 0.05, (x0 + x1) / 2, x1 - 0.05]:
        box2("Luggage_Rack_Bracket", xx - 0.01, xx + 0.01, s * 1.06, s * 1.42, 2.84, 2.95, M["alu"])
    # つり革
    rail_y = s * 0.84
    cyl("Strap_Rail", 0.016, L + 0.1, ((x0 + x1) / 2, rail_y, 2.98), M["stainless"], axis="X", seg=16)
    for xx in (x0 + 0.1, x1 - 0.1):
        rod("Strap_Rail_Hanger", (xx, rail_y, 2.98), (xx, s * 0.80, 3.36), 0.010, M["stainless"])
    ring_me = lathe_mesh("strap_ring", [(0.065 + 0.009 * cos(2 * pi * i / 8), 0.009 * sin(2 * pi * i / 8))
                                        for i in range(8)], [M["strap"]], seg=24, axis="X")
    nstr = max(2, int(L / 0.26))
    for k in range(nstr):
        xx = x0 + 0.13 + (L - 0.26) * k / max(1, nstr - 1)
        add_obj("Strap_Ring", ring_me, (xx, rail_y, 2.69))
        box("Strap_Band", (0.03, 0.004, 0.24), (xx, rail_y, 2.86), M["strap"])


def box_seat_pair(xs, s):
    """セミクロスシート（ボックス席）1区画。xs = 区画の +X 端"""
    for (xb0, xb1, xc0, xc1, face) in ((xs - 0.10, xs, xs - 0.58, xs - 0.10, -1),
                                      (xs - 1.70, xs - 1.60, xs - 1.60, xs - 1.12, 1)):
        for (ya, yb) in ((0.48, 0.93), (0.95, 1.40)):
            box2("BoxSeat_Cushion", xc0, xc1, s * ya, s * yb, 1.46, 1.57, M["seat"], bevel=0.03, seg=3)
            box2("BoxSeat_Back", xb0, xb1, s * ya, s * yb, 1.58, 2.22, M["seat"], bevel=0.04, seg=3)
            box2("BoxSeat_Headrest", xb0 - face * 0.01, xb1 - face * 0.01, s * (ya + 0.05), s * (yb - 0.05), 2.10,
                 2.26, M["int_wall"], bevel=0.03, seg=2)
        box2("BoxSeat_Frame", min(xb0, xc0), max(xb1, xc1), s * 0.50, s * 1.38, 1.15, 1.46, M["equip_dark"], bevel=0.01)
        xg = (xb0 + xb1) / 2
        tube("BoxSeat_Grab", fillet([(xg, s * 0.50, 2.20), (xg, s * 0.46, 2.28), (xg, s * 0.56, 2.30)], 0.03),
             0.012, M["stainless"])
    box2("BoxSeat_Table", xs - 0.95, xs - 0.75, s * 1.30, s * 1.43, 1.98, 2.00, M["int_wall"], bevel=0.005)


def build_interior():
    # 床・天井
    box2("Floor", XR + 0.04, X_PARTITION, -yw_in(ZF), yw_in(ZF), 1.08, ZF, M["int_floor"])
    zc = 3.36
    box2("Ceiling", XR + 0.04, X_PARTITION, -yw_in(zc) - 0.01, yw_in(zc) + 0.01, zc, zc + 0.02, M["int_wall"])
    for s in (-1, 1):
        box2("Ceiling_Light", XR + 0.3, X_PARTITION - 0.3, s * 0.55, s * 0.69, zc - 0.012, zc, M["ceiling_light"])
        box2("Ceiling_Light_Frame", XR + 0.28, X_PARTITION - 0.28, s * 0.53, s * 0.71, zc - 0.006, zc, M["int_wall"])
    box2("Ceiling_Duct", XR + 0.3, X_PARTITION - 0.3, -0.24, 0.24, zc - 0.035, zc, M["int_wall"], bevel=0.01)
    for k in range(40):
        xx = XR + 0.5 + k * 0.44
        if xx > X_PARTITION - 0.4:
            break
        for yy in (-0.13, 0.13):
            box2("Ceiling_Duct_Slot", xx - 0.16, xx + 0.16, yy - 0.018, yy + 0.018, zc - 0.0365, zc - 0.034,
                 M["duct_slot"])
    # 腰板（窓下の化粧板）
    for s in (-1, 1):
        box2("Wainscot_Heater", XR + 0.1, X_PARTITION - 0.05, s * (yw_in(1.3) - 0.01), s * (yw_in(1.3) - 0.03), 1.13, 1.20,
             M["equip_dark"])
    # 座席
    for s in (-1, 1):
        long_seat(3.24, 6.46, s)
        long_seat(-6.36, -3.14, s)
        long_seat(-9.62, -8.05, s, M["seat_red"], n=3)
        box_seat_pair(1.72, s)
        box_seat_pair(0.0, s)
    # ボックス席区画の吊り手すり・握り棒
    for s in (-1, 1):
        cyl("Stanchion", 0.017, 3.36 - ZF, (0.86, s * 0.46, (ZF + 3.36) / 2), M["stainless"], seg=20)
        cyl("Stanchion", 0.017, 3.36 - ZF, (-0.86, s * 0.46, (ZF + 3.36) / 2), M["stainless"], seg=20)
    # 扉上 LED案内表示器
    for xc in DOORS:
        for s in (-1, 1):
            box2("Door_Info_Display", xc - 0.32, xc + 0.32, s * (yw_in(3.06) - 0.06), s * (yw_in(3.06) - 0.005), 3.00,
                 3.12, M["led_back"], bevel=0.008)
            box2("Door_Info_LED", xc - 0.27, xc + 0.27, s * (yw_in(3.06) - 0.062), s * (yw_in(3.06) - 0.055), 3.03,
                 3.09, M["led_orange"])
    # ロールカーテン（一部降ろした状態）
    for (x0, x1), zlow in (((0.13, 1.58), 2.45), ((-1.48, -0.03), 2.30), ((4.93, 6.38), 2.55)):
        box2("Roller_Blind", x0, x1, -(W - 0.042), -(W - 0.048), zlow, WIN_Z[1], M["blind"])
        box2("Roller_Blind_Bar", x0, x1, -(W - 0.036), -(W - 0.054), zlow - 0.015, zlow, M["alu"])
    # 運転室仕切り
    loop = [(y, z) for (y, z) in full_loop(HALF_IN) if z >= 1.10]
    loop = [(loop[0][0], 1.10)] + loop + [(loop[-1][0], 1.10)]
    g = Geo()
    v, f = prism_geo(loop, X_PARTITION, X_PARTITION + 0.04, "YZ")
    g.add(v, f)
    part = g.obj("Cab_Partition", [M["int_wall"]])
    cut = Geo()
    for (a, b) in ((0.15, 1.05), (-0.78, -0.38)):
        v, f = prism_geo(rr_box(a, b, 1.98, 2.70, 0.04), X_PARTITION - 0.1, X_PARTITION + 0.2, "YZ")
        cut.add(v, f)
    boolean_apply(part, cut, cutter_mat=M["rubber"])
    g = Geo()
    for (a, b) in ((0.15, 1.05), (-0.78, -0.38)):
        v, f = disk_geo(rr_box(a, b, 1.98, 2.70, 0.04), nr=1)
        g.add([(X_PARTITION + 0.02, u, w) for (u, w) in v], f)
    g.obj("Cab_Partition_Glass", [M["glass"]], smooth=False)
    v, f = ring_geo(rr_box(-0.90, -0.26, 1.14, 2.95, 0.03), rr_box(-0.892, -0.268, 1.148, 2.942, 0.026))
    g = Geo(); g.add([(X_PARTITION - 0.002, u, w) for (u, w) in v], f)
    g.obj("Cab_Door_Outline", [M["rubber"]], smooth=False)


# ---------------------------------------------------------------------------
# 線路・架線・環境
# ---------------------------------------------------------------------------

RAIL_HALF = [(0.0, 0.0), (0.024, -0.001), (0.031, -0.006), (0.0325, -0.012), (0.0325, -0.044), (0.026, -0.050),
             (0.0085, -0.058), (0.0080, -0.128), (0.012, -0.136), (0.040, -0.142), (0.0635, -0.145),
             (0.0635, -0.153), (0.0, -0.153)]


TRACK2_Y = -4.2   # 隣の線路（上下線）


def build_rails(yc, L0, L1, tag):
    poly = [(y, z) for (y, z) in RAIL_HALF[:-1]] + [(-y, z) for (y, z) in reversed(RAIL_HALF[1:-1])]
    for s in (-1, 1):
        loop = [(yc + s * 0.5665 + y, z) for (y, z) in poly]
        n = len(loop)
        emi = []
        for k in range(n):
            a, b = loop[k], loop[(k + 1) % n]
            emi.append(1 if (a[1] > -0.007 and b[1] > -0.007) else 0)
        v, f, mi = extrude_loop(loop, L0, L1, emi, 0)
        g = Geo(); g.add(v, f, mi)
        g.obj("Rail" + tag, [M["rail_side"], M["rail_top"]], angle=40)
    # PC枕木（締結装置込み）を配列
    g = Geo()
    v, f = prism_geo(rr_box(-1.0, 1.0, -0.333, -0.163, 0.015, 2), -0.12, 0.12, "YZ")
    g.add(v, f, 0)
    for s in (-1, 1):
        for yy in (s * 0.5665 - 0.085, s * 0.5665 + 0.085):
            bm = box_bm(0.10, 0.05, 0.035, bevel=0.006)
            for vv in bm.verts:
                vv.co += Vector((0, yy, -0.150))
            verts = [tuple(vv.co) for vv in bm.verts]
            bm.verts.index_update()
            faces = [tuple(vv.index for vv in fc.verts) for fc in bm.faces]
            bm.free()
            g.add(verts, faces, 1)
        g.add(*prism_geo(rr_box(-0.09, 0.09, -0.163, -0.153, 0.004, 1), s * 0.5665 - 0.08, s * 0.5665 + 0.08, "XZ"), 2)
    sl = g.obj("Sleepers" + tag, [M["concrete"], M["equip_dark"], M["rubber"]], angle=40)
    sl.location = (L0, yc, 0)
    ar = sl.modifiers.new("array", "ARRAY")
    ar.use_relative_offset = False
    ar.use_constant_offset = True
    ar.constant_offset_displace = (0.62, 0, 0)
    ar.count = int((L1 - L0) / 0.62)


def build_catenary(xp, yp, yc, tag, L0, L1):
    """架線柱（H形鋼）と可動ブラケット。yp=柱位置, yc=線路中心"""
    s = 1 if yp > yc else -1
    box2("Catenary_Pole_Web", xp - 0.01, xp + 0.01, yp - 0.15, yp + 0.15, -0.56, 7.0, M["steel_pole"])
    for dx in (-0.15, 0.15):
        box2("Catenary_Pole_Flange", xp + dx - 0.012, xp + dx + 0.012, yp - 0.15, yp + 0.15, -0.56, 7.0,
             M["steel_pole"])
    box2("Catenary_Pole_Cap", xp - 0.17, xp + 0.17, yp - 0.17, yp + 0.17, 7.0, 7.02, M["steel_pole"])
    box2("Catenary_Pole_Base", xp - 0.4, xp + 0.4, yp - 0.4, yp + 0.4, -0.6, -0.40, M["concrete"])
    yi = yp - s * 0.15
    rod("Catenary_Cantilever", (xp, yi, 6.25), (xp, yc - s * 0.3, 6.25), 0.03, M["steel_pole"])
    rod("Catenary_Stay", (xp, yi, 6.85), (xp, yc + s * 0.6, 6.27), 0.02, M["steel_pole"])
    rod("Catenary_Brace", (xp, yi, 5.45), (xp, yc + s * 0.3, 6.15), 0.025, M["steel_pole"])
    rod("Catenary_Steady_Arm", (xp, yc + s * 0.3, 5.40), (xp + 0.9, yc, 5.12), 0.012, M["steel_pole"])
    add_obj("Catenary_Insulator", lathe_mesh("insulator", INSULATOR_PROFILE, [M["insulator"]], seg=32),
            (xp, yi - s * 0.05, 6.25), (0, pi / 2, -s * pi / 2))
    add_obj("Catenary_Insulator", lathe_mesh("insulator", INSULATOR_PROFILE, [M["insulator"]], seg=32),
            (xp, yi - s * 0.05, 5.45), (0, pi / 2, -s * pi / 2))


def build_wires(yc, tag, L0, L1):
    tube("Contact_Wire" + tag, [(L0, yc, 5.1065), (L1, yc, 5.1065)], 0.0065, M["wire"])
    tube("Messenger_Wire" + tag, [(L0, yc, 6.15), (L1, yc, 6.15)], 0.0075, M["wire"])
    for k in range(int(L0 / 4.5), int(L1 / 4.5) + 1):
        xx = k * 4.5
        rod("Dropper", (xx, yc, 5.11), (xx, yc, 6.15), 0.003, M["wire"], seg=6)


def build_trees(seed=7):
    import random
    rnd = random.Random(seed)
    variants = []
    for i in range(4):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0)
        for v in bm.verts:
            n = v.co.normalized()
            bump = 1.0 + 0.18 * sin(7 * n.x + i) * sin(5 * n.y + 2 * i) + 0.12 * sin(11 * n.z + 3 * i)
            v.co = n * bump
            v.co.z *= 0.85
        variants.append(bm_finish(bm, f"crown{i}", [M["foliage"]], angle=180))
    trunk = cyl_mesh(0.18, 1.0, M["bark"], seg=10, r2=0.12)
    spots = []
    for k in range(140):
        side = rnd.random()
        if side < 0.65:
            y = rnd.uniform(16, 60)
        else:
            y = rnd.uniform(-70, -24)
        x = rnd.uniform(-120, 120)
        spots.append((x, y))
    for (x, y) in spots:
        h = rnd.uniform(4.0, 9.0)
        r = h * rnd.uniform(0.32, 0.45)
        add_obj("Tree_Trunk", trunk, (x, y, -0.56 + h * 0.3), (0, 0, 0), (1, 1, h * 0.6))
        for j in range(rnd.randint(1, 3)):
            add_obj("Tree_Crown", variants[rnd.randrange(4)],
                    (x + rnd.uniform(-0.5, 0.5) * r, y + rnd.uniform(-0.5, 0.5) * r, -0.56 + h * 0.62 + j * r * 0.3),
                    (0, 0, rnd.uniform(0, 2 * pi)), (r, r, r * rnd.uniform(0.8, 1.1)))


def build_track():
    _ctx["col"], _ctx["parent"] = C_TRACK, None
    L0, L1 = -90.0, 90.0
    build_rails(0.0, L0, L1, "_Up")
    build_rails(TRACK2_Y, L0, L1, "_Down")
    # 道床（複線）
    prof = [(TRACK2_Y - 2.9, -0.56), (TRACK2_Y - 1.75, -0.215), (1.75, -0.215), (2.9, -0.56)]
    verts, faces = [], []
    nx = 90
    for i in range(nx + 1):
        x = L0 + (L1 - L0) * i / nx
        for (y, z) in prof:
            verts.append((x, y, z))
    for i in range(nx):
        for k in range(len(prof) - 1):
            a = i * 4 + k
            faces.append((a, a + 1, a + 5, a + 4))
    add_obj("Ballast", mesh_from("ballast", verts, faces, [M["ballast"]], angle=20))
    # ケーブルトラフ
    box2("Cable_Trough", L0, L1, 4.05, 4.45, -0.60, -0.38, M["concrete"], bevel=0.01)
    for k in range(int((L1 - L0) / 1.0)):
        xx = L0 + k * 1.0
        box2("Cable_Trough_Lid", xx + 0.005, xx + 0.995, 4.06, 4.44, -0.38, -0.36, M["concrete"], bevel=0.004)
    # 地面
    g = Geo()
    g.add([(-400, -400, -0.56), (400, -400, -0.56), (400, 400, -0.56), (-400, 400, -0.56)], [(0, 1, 2, 3)])
    g.obj("Ground", [M["grass"]], smooth=False)
    # 架線
    for xp in (-14.0, 36.0, -64.0):
        build_catenary(xp, 3.4, 0.0, "_Up", L0, L1)
        build_catenary(xp, TRACK2_Y - 3.4, TRACK2_Y, "_Down", L0, L1)
    build_wires(0.0, "_Up", L0, L1)
    build_wires(TRACK2_Y, "_Down", L0, L1)
    build_trees()
    _ctx["col"] = C_TRAIN


def build_environment():
    world = bpy.data.worlds.new("Sky")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.0
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.0
    cr.elements[0].color = (0.62, 0.70, 0.78, 1)
    cr.elements[1].position = 0.55
    cr.elements[1].color = (0.13, 0.30, 0.68, 1)
    e = cr.elements.new(0.08)
    e.color = (0.45, 0.58, 0.78, 1)
    nt.links.new(tc.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs[2], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs[0], out.inputs[0])

    sun = bpy.data.lights.new("Sun", "SUN")
    sun.energy = 4.2
    sun.angle = math.radians(0.8)
    sun.color = (1.0, 0.97, 0.92)
    so = bpy.data.objects.new("Sun", sun)
    C_ENV.objects.link(so)
    el, az = math.radians(38), math.radians(-48)
    sdir = Vector((cos(el) * cos(az), cos(el) * sin(az), sin(el)))
    so.rotation_euler = Vector((0, 0, 1)).rotation_difference(sdir).to_euler()


# ---------------------------------------------------------------------------
# カメラ・レンダリング
# ---------------------------------------------------------------------------

def add_camera(name, loc, target, lens=50, ortho=None):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 600
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    o = bpy.data.objects.new(name, cam)
    C_ENV.objects.link(o)
    o.location = loc
    d = Vector(target) - Vector(loc)
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


VIEWS = {
    # name: (loc, target, lens, ortho, res)
    "hero": ((18.0, -10.6, 1.70), (1.8, 0.0, 2.05), 36, None, (1920, 1080)),
    "front_ortho": ((40.0, 0.0, 2.45), (0.0, 0.0, 2.45), 50, 6.2, (1200, 1500)),
    "side": ((0.3, -40.0, 2.15), (0.3, 0.0, 2.15), 50, 21.5, (2400, 900)),
    "front": ((14.8, -2.9, 2.05), (9.6, 0.0, 1.95), 50, None, (1600, 1200)),
    "bogie": ((-4.2, -3.9, 0.62), (-6.9, 0.0, 0.62), 28, None, (1920, 1080)),
    "roof": ((-1.2, -6.8, 7.0), (-5.2, 0.0, 4.0), 32, None, (1920, 1080)),
    "interior": ((6.3, 0.15, 2.72), (-4.0, -0.25, 2.25), 16, None, (1920, 1080)),
}


def setup_render():
    r = scene.render
    r.engine = "CYCLES"
    cy = scene.cycles
    cy.device = "CPU"
    cy.samples = 32 if PREVIEW else 160
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.03 if PREVIEW else 0.015
    cy.use_denoising = True
    try:
        cy.denoiser = "OPENIMAGEDENOISE"
    except TypeError:
        pass
    cy.max_bounces = 10
    cy.transmission_bounces = 10
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 1.0
    r.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene.view_settings.exposure = 0.0
    r.image_settings.file_format = "PNG"
    r.resolution_percentage = 40 if PREVIEW else 100


def render_views():
    setup_render()
    outdir = os.path.join(HERE, "renders")
    os.makedirs(outdir, exist_ok=True)
    for name, (loc, tgt, lens, ortho, res) in VIEWS.items():
        if ONLY and name not in ONLY:
            continue
        cam = bpy.data.objects.get("Cam_" + name)
        scene.camera = cam
        scene.render.resolution_x, scene.render.resolution_y = res
        if name == "interior":
            scene.cycles.samples = 64 if PREVIEW else 320
            scene.view_settings.exposure = 0.6
        else:
            scene.cycles.samples = 32 if PREVIEW else 160
            scene.view_settings.exposure = 0.0
        scene.render.filepath = os.path.join(outdir, f"e219_{name}{'_preview' if PREVIEW else ''}.png")
        print(f"[render] {name} -> {scene.render.filepath}", flush=True)
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------
# 仕上げ（カーブ/文字のメッシュ化・保存・書き出し）
# ---------------------------------------------------------------------------

def convert_curves_to_mesh():
    dg = bpy.context.evaluated_depsgraph_get()
    targets = [o for o in bpy.data.objects if o.type in {"CURVE", "FONT"}]
    for o in targets:
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        name = o.name
        o.name = name + "__old"
        n = bpy.data.objects.new(name, me)
        for c in o.users_collection:
            c.objects.link(n)
        n.parent = o.parent
        n.matrix_world = o.matrix_world.copy()
        data = o.data
        bpy.data.objects.remove(o)
        if data.users == 0:
            bpy.data.curves.remove(data)


def main():
    root = bpy.data.objects.new("E219_Kumoha_Root", None)
    C_TRAIN.objects.link(root)
    root.empty_display_size = 2.0
    _ctx["parent"] = root
    _ctx["col"] = C_TRAIN

    print("[build] body", flush=True)
    build_body()
    print("[build] front", flush=True)
    build_front()
    print("[build] bogies", flush=True)
    build_bogie(6.90, "Bogie_F", front=True)
    build_bogie(-6.90, "Bogie_R")
    print("[build] underfloor", flush=True)
    build_underfloor()
    print("[build] roof", flush=True)
    build_roof()
    print("[build] interior", flush=True)
    build_interior()
    print("[build] track / env", flush=True)
    build_track()
    build_environment()
    for name, (loc, tgt, lens, ortho, res) in VIEWS.items():
        add_camera("Cam_" + name, loc, tgt, lens, ortho)
    scene.camera = bpy.data.objects["Cam_hero"]

    convert_curves_to_mesh()
    bpy.data.collections.remove(C_TMP)

    n_obj = len([o for o in C_TRAIN.all_objects if o.type == "MESH"])
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in C_TRAIN.all_objects:
        if o.type == "MESH":
            ev = o.evaluated_get(dg)
            tris += sum(len(p.vertices) - 2 for p in ev.data.polygons)
    print(f"[stats] train objects={n_obj} triangles~{tris:,}", flush=True)

    setup_render()
    bpy.context.preferences.filepaths.save_version = 0
    blend = os.path.join(HERE, "e219_kumoha.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True)
    print(f"[save] {blend}", flush=True)

    # glTF（車両のみ）
    for o in bpy.data.objects:
        o.select_set(False)
    for o in C_TRAIN.all_objects:
        o.select_set(True)
    glb = os.path.join(HERE, "e219_kumoha.glb")
    try:
        bpy.ops.export_scene.gltf(filepath=glb, use_selection=True, export_apply=True, export_format="GLB")
        print(f"[save] {glb}", flush=True)
    except Exception as ex:  # noqa: BLE001
        print(f"[warn] glTF export failed: {ex}", flush=True)

    if DO_RENDER:
        render_views()


main()
