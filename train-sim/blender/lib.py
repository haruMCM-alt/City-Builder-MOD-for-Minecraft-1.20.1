"""
Shared helpers for the Blender model scripts: materials, a small mesh builder
with winding control, and bpy utilities (booleans, joining, smoothing, text).

Axes (Blender): X = forward (car front), Y = left, Z = up. Rail top is Z = 0.
"""

import bpy
import bmesh
import math
import os
import sys
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.normpath(os.path.join(HERE, "..", "assets", "models"))
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
_MATS = {}


def mat(name, color, metallic=0.0, rough=0.5, emit=None, emit_strength=0.0, alpha=1.0):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1.0)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    if emit is not None:
        b.inputs["Emission Color"].default_value = (*emit, 1.0)
        b.inputs["Emission Strength"].default_value = emit_strength
    if alpha < 1.0:
        b.inputs["Alpha"].default_value = alpha
        m.blend_method = "BLEND"
    _MATS[name] = m
    return m


def materials():
    return dict(
        stainless=mat("stainless", (0.78, 0.79, 0.80), 0.85, 0.32),
        stainless_dk=mat("stainless_dark", (0.62, 0.63, 0.64), 0.85, 0.38),
        glass=mat("glass", (0.04, 0.06, 0.08), 0.3, 0.06),
        black=mat("black", (0.015, 0.015, 0.018), 0.0, 0.45),
        dkgrey=mat("dark_grey", (0.10, 0.10, 0.11), 0.2, 0.7),
        grey=mat("grey", (0.38, 0.39, 0.40), 0.3, 0.6),
        roof=mat("roof", (0.30, 0.31, 0.32), 0.2, 0.8),
        orange=mat("shonan_orange", (0.9131, 0.2232, 0.0144), 0.0, 0.42),
        green=mat("shonan_green", (0.0, 0.305, 0.0612), 0.0, 0.42),
        paint_orange=mat("paint_orange", (0.8714, 0.2232, 0.007), 0.0, 0.35),
        paint_green=mat("paint_green", (0.0212, 0.1144, 0.0452), 0.0, 0.35),
        light_grey=mat("light_grey", (0.82, 0.83, 0.84), 0.1, 0.4),
        head=mat("headlight", (1, 1, 0.95), 0, 0.2, (1.0, 0.97, 0.85), 6.0),
        tail=mat("taillight", (0.5, 0.02, 0.02), 0, 0.3, (1.0, 0.05, 0.03), 3.0),
        # three.js swaps this one for a canvas texture ("普通 宇都宮")
        dest=mat("DEST", (0.05, 0.03, 0.0), 0, 0.5, (1.0, 0.55, 0.05), 1.5),
        bogie=mat("bogie", (0.05, 0.05, 0.055), 0.4, 0.6),
        wheel=mat("wheel", (0.35, 0.35, 0.36), 0.9, 0.4),
        panto=mat("pantograph", (0.25, 0.26, 0.28), 0.7, 0.5),
        green_mark=mat("green_mark", (0.1, 0.55, 0.25), 0, 0.4),
        # cab interior
        cab_wall=mat("cab_wall", (0.09, 0.10, 0.11), 0.0, 0.85),
        cab_desk=mat("cab_desk", (0.12, 0.13, 0.15), 0.0, 0.7),
        cab_panel=mat("cab_panel", (0.12, 0.14, 0.15), 0.1, 0.6),
        gauge_face=mat("gauge_face", (0.92, 0.92, 0.88), 0.0, 0.5),
        screen=mat("TIMS_SCREEN", (0.02, 0.05, 0.1), 0, 0.3, (0.15, 0.35, 0.7), 0.8),
        handle=mat("handle", (0.08, 0.08, 0.08), 0.2, 0.4),
        chrome=mat("chrome", (0.8, 0.8, 0.8), 1.0, 0.15),
        # environment
        concrete=mat("concrete", (0.55, 0.54, 0.52), 0.0, 0.9),
        steel=mat("steel", (0.45, 0.47, 0.48), 0.6, 0.55),
        steel_paint=mat("steel_paint", (0.52, 0.55, 0.55), 0.3, 0.6),
        canopy=mat("canopy", (0.80, 0.81, 0.80), 0.2, 0.6),
        lamp=mat("lamp", (1, 1, 1), 0, 0.3, (1.0, 0.98, 0.92), 3.0),
        sig_r=mat("SIG_R", (0.15, 0.0, 0.0), 0, 0.3, (1.0, 0.05, 0.02), 0.0),
        sig_y=mat("SIG_Y", (0.15, 0.1, 0.0), 0, 0.3, (1.0, 0.65, 0.0), 0.0),
        sig_g=mat("SIG_G", (0.0, 0.12, 0.1), 0, 0.3, (0.1, 1.0, 0.75), 0.0),
        stop_sign=mat("STOPSIGN", (1.0, 1.0, 1.0), 0, 0.5),
        wall_white=mat("wall_white", (0.86, 0.85, 0.80), 0, 0.85),
        wall_beige=mat("wall_beige", (0.80, 0.72, 0.58), 0, 0.85),
        roof_tile=mat("roof_tile", (0.20, 0.22, 0.28), 0.1, 0.7),
        roof_red=mat("roof_red", (0.45, 0.16, 0.12), 0.1, 0.7),
        wood=mat("wood", (0.35, 0.22, 0.12), 0, 0.8),
        leaf=mat("leaf", (0.13, 0.30, 0.10), 0, 0.9),
        vend_red=mat("vend_red", (0.8, 0.05, 0.05), 0.1, 0.4),
        vend_front=mat("vend_front", (0.9, 0.9, 0.95), 0, 0.3, (0.9, 0.9, 1.0), 0.6),
        blue_seat=mat("blue_seat", (0.1, 0.25, 0.6), 0, 0.6),
        # detailed car bodies
        body=mat("stainless_body", (0.58, 0.59, 0.60), 0.9, 0.30),
        door=mat("stainless_door", (0.52, 0.53, 0.54), 0.9, 0.26),
        rubber=mat("rubber", (0.012, 0.012, 0.014), 0.0, 0.6),
        gap=mat("door_gap", (0.02, 0.02, 0.022), 0.0, 0.7),
        win=mat("window_glass", (0.025, 0.035, 0.04), 0.0, 0.04),
        white=mat("white_frp", (0.86, 0.87, 0.87), 0.0, 0.35),
        roofgrey=mat("roof_grey", (0.42, 0.43, 0.44), 0.4, 0.55),
        silver=mat("silver_paint", (0.66, 0.67, 0.68), 0.6, 0.3),
        skirtw=mat("skirt_white", (0.80, 0.81, 0.82), 0.3, 0.35),
        crew=mat("crew_door_green", (0.0, 0.305, 0.0612), 0.0, 0.35),
        logo=mat("logo_white", (0.95, 0.95, 0.95), 0.0, 0.4),
        airs=mat("air_spring", (0.03, 0.03, 0.03), 0.0, 0.8),
        grille=mat("ac_grille", (0.20, 0.21, 0.22), 0.6, 0.5),
        under=mat("underfloor", (0.13, 0.13, 0.14), 0.3, 0.7),
        brown=mat("bogie_brown", (0.10, 0.08, 0.07), 0.2, 0.75),
        gfrp=mat("front_black", (0.01, 0.012, 0.015), 0.1, 0.12),
        # v3: see-through side windows and passenger saloon
        sglass=mat("side_glass", (0.10, 0.13, 0.12), 0.0, 0.03, alpha=0.38),
        int_wall=mat("int_wall", (0.80, 0.80, 0.77), 0.0, 0.6),
        int_floor=mat("int_floor", (0.30, 0.33, 0.36), 0.0, 0.8),
        int_ceiling=mat("int_ceiling", (0.88, 0.88, 0.86), 0.0, 0.55),
        int_light=mat("int_light", (1.0, 1.0, 1.0), 0, 0.3, (1.0, 0.99, 0.95), 4.0),
        lcd=mat("int_lcd", (0.02, 0.03, 0.05), 0, 0.2, (0.35, 0.55, 0.9), 1.2),
        seat_e231=mat("seat_e231", (0.04, 0.16, 0.30), 0.0, 0.9),
        seat_e233=mat("seat_e233", (0.03, 0.10, 0.32), 0.0, 0.9),
        seat_211=mat("seat_211", (0.25, 0.04, 0.06), 0.0, 0.9),
        seat_115=mat("seat_115", (0.06, 0.09, 0.22), 0.0, 0.9),
        seat_green=mat("seat_green", (0.05, 0.06, 0.12), 0.0, 0.85),
        seat_prio=mat("seat_priority", (0.45, 0.08, 0.10), 0.0, 0.9),
        headrest=mat("headrest_cover", (0.92, 0.92, 0.90), 0.0, 0.8),
        partition=mat("seat_partition", (0.84, 0.85, 0.85), 0.2, 0.35),
        pole=mat("pole", (0.75, 0.76, 0.77), 1.0, 0.22),
        pole_yellow=mat("pole_yellow", (0.85, 0.62, 0.02), 0.0, 0.4),
        strap=mat("strap", (0.90, 0.90, 0.88), 0.0, 0.5),
        sidelamp=mat("SIDELAMP", (0.25, 0.02, 0.02), 0.0, 0.3),
        weld=mat("stainless_seam", (0.40, 0.41, 0.42), 0.85, 0.45),
        brakedisc=mat("brake_disc", (0.30, 0.29, 0.28), 0.8, 0.45),
    )


# ---------------------------------------------------------------------------
# Mesh builder: accumulates geometry with per-face material + winding fix
# ---------------------------------------------------------------------------
class MB:
    def __init__(self, name):
        self.name = name
        self.verts = []
        self.faces = []  # (indices, mat_index, smooth)
        self.mats = []

    def _mi(self, m):
        if m not in self.mats:
            self.mats.append(m)
        return self.mats.index(m)

    def _v(self, p):
        self.verts.append(Vector(p))
        return len(self.verts) - 1

    def poly(self, pts, m, out=None, smooth=False):
        """Add a polygon. `out` = vector the normal should point along."""
        pts = [Vector(p) for p in pts]
        if out is not None and len(pts) >= 3:
            n = Vector((0, 0, 0))
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                n.x += (a.y - b.y) * (a.z + b.z)
                n.y += (a.z - b.z) * (a.x + b.x)
                n.z += (a.x - b.x) * (a.y + b.y)
            if n.dot(Vector(out)) < 0:
                pts.reverse()
        idx = [self._v(p) for p in pts]
        self.faces.append((idx, self._mi(m), smooth))

    def grid(self, rows, m, out_fn, smooth=True, closed=False):
        """rows: list of lists of points (shared vertices -> smooth shading)."""
        ids = [[self._v(p) for p in r] for r in rows]
        mi = self._mi(m)
        nr, nc = len(rows), len(rows[0])
        for i in range(nr - 1):
            for j in range(nc - 1 + (1 if closed else 0)):
                j2 = (j + 1) % nc
                q = [ids[i][j], ids[i][j2], ids[i + 1][j2], ids[i + 1][j]]
                P = [self.verts[k] for k in q]
                n = (P[1] - P[0]).cross(P[3] - P[0])
                c = sum(P, Vector()) / 4
                if n.dot(Vector(out_fn(c))) < 0:
                    q.reverse()
                self.faces.append((q, mi, smooth))

    def box(self, c, s, m, rot=None):
        cx, cy, cz = c
        hx, hy, hz = s[0] / 2, s[1] / 2, s[2] / 2
        R = rot if rot is not None else Matrix.Identity(3)
        C = Vector(c)

        def P(x, y, z):
            return C + R @ Vector((x, y, z))

        corners = {}
        for sx in (-1, 1):
            for sy in (-1, 1):
                for sz in (-1, 1):
                    corners[(sx, sy, sz)] = P(sx * hx, sy * hy, sz * hz)
        for axis in range(3):
            for sgn in (-1, 1):
                quad = []
                for a in (-1, 1):
                    for b in ((-1, 1) if a == -1 else (1, -1)):
                        k = [0, 0, 0]
                        k[axis] = sgn
                        o = [i for i in range(3) if i != axis]
                        k[o[0]] = a
                        k[o[1]] = b
                        quad.append(corners[tuple(k)])
                out = R @ Vector([sgn if i == axis else 0 for i in range(3)])
                self.poly(quad, m, out)

    def beam(self, p0, p1, w, h, m, up=(0, 0, 1)):
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        L = d.length
        x = d.normalized()
        u = Vector(up)
        if abs(x.dot(u)) > 0.95:
            u = Vector((0, 1, 0)) if abs(x.y) < 0.9 else Vector((1, 0, 0))
        y = u.cross(x).normalized()
        z = x.cross(y)
        R = Matrix((x, y, z)).transposed()
        self.box((p0 + p1) / 2, (L, w, h), m, R)

    def cyl(self, c, axis, r, length, m, seg=16, cap=True, smooth=True, r2=None):
        c = Vector(c)
        a = Vector(axis).normalized()
        t = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
        u = a.cross(t).normalized()
        v = a.cross(u)
        r2 = r if r2 is None else r2
        ring0 = [c - a * length / 2 + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r for i in range(seg)]
        ring1 = [c + a * length / 2 + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r2 for i in range(seg)]

        def out(p):
            q = p - c
            return q - a * q.dot(a)

        self.grid([ring0, ring1], m, out, smooth=smooth, closed=True)
        if cap:
            self.poly(ring0, m, -a)
            self.poly(ring1, m, a)

    def sphere(self, c, r, m, seg=10, rings=6, sz=1.0):
        c = Vector(c)
        rows = []
        for i in range(rings + 1):
            th = math.pi * i / rings
            rows.append([c + Vector((r * math.sin(th) * math.cos(2 * math.pi * j / seg), r * math.sin(th) * math.sin(2 * math.pi * j / seg), r * sz * math.cos(th))) for j in range(seg)])
        self.grid(rows, m, lambda p: p - c, smooth=True, closed=True)

    def build(self, collection):
        me = bpy.data.meshes.new(self.name)
        me.from_pydata([tuple(v) for v in self.verts], [], [f[0] for f in self.faces])
        for mm in self.mats:
            me.materials.append(mm)
        for poly, f in zip(me.polygons, self.faces):
            poly.material_index = f[1]
            poly.use_smooth = f[2]
        # Planar UVs for faces that get a text texture in the game (destination
        # displays, stop boards): u = viewer's right, v = up, each face 0..1.
        uv = me.uv_layers.new(name="UVMap")
        up = Vector((0, 0, 1))
        for poly in me.polygons:
            name = self.mats[poly.material_index].name
            if name not in ("DEST", "STOPSIGN"):
                for li in poly.loop_indices:
                    uv.data[li].uv = (0.0, 0.0)
                continue
            n = poly.normal
            right = (-n).cross(up)
            if right.length < 1e-6:
                right = Vector((1, 0, 0))
            right.normalize()
            vup = right.cross(-n).normalized()
            pts = [Vector(me.vertices[me.loops[li].vertex_index].co) for li in poly.loop_indices]
            us = [p.dot(right) for p in pts]
            vs = [p.dot(vup) for p in pts]
            u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
            for li, uu, vv in zip(poly.loop_indices, us, vs):
                uv.data[li].uv = ((uu - u0) / max(1e-6, u1 - u0), (vv - v0) / max(1e-6, v1 - v0))
        me.validate()
        me.update()
        ob = bpy.data.objects.new(self.name, me)
        collection.objects.link(ob)
        return ob




# ---------------------------------------------------------------------------
# bpy utilities
# ---------------------------------------------------------------------------
def apply_boolean(obj, cutter, operation="DIFFERENCE"):
    mod = obj.modifiers.new("bool", "BOOLEAN")
    mod.operation = operation
    mod.solver = "EXACT"
    mod.object = cutter
    try:
        mod.use_self = True
        mod.use_hole_tolerant = True
    except Exception:
        pass
    try:
        mod.material_mode = "TRANSFER"
    except Exception:
        pass
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def delete(obj):
    me = obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if me and me.users == 0:
        bpy.data.meshes.remove(me)


def join(objs, name):
    objs = [o for o in objs if o is not None]
    base = objs[0]
    with bpy.context.temp_override(active_object=base, object=base, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    base.name = name
    base.data.name = name
    return base


def smooth(obj, angle=32):
    me = obj.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except Exception:
        pass


def text_mesh(text, size, coll, name="text", extrude=0.002):
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = text
    cu.size = size
    cu.extrude = extrude
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    ob = bpy.data.objects.new(name, cu)
    coll.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    mo = bpy.data.objects.new(name, me)
    coll.objects.link(mo)
    return mo


def rounded_rect(cx, cz, w, h, r, n=4):
    """points (x, z) of a rounded rectangle, counter-clockwise"""
    r = min(r, w / 2 - 1e-4, h / 2 - 1e-4)
    pts = []
    for (ox, oz, a0) in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((cx + ox + r * math.cos(a), cz + oz + r * math.sin(a)))
    return pts


def prism(mb, outline, axis_fn, depth0, depth1, m, side_mat=None):
    """Extrude a 2D outline [(u, v)] between depth0 and depth1.
    axis_fn(u, v, d) -> 3D point. Caps + side walls, winding fixed by MB."""
    a = [axis_fn(u, v, depth0) for (u, v) in outline]
    b = [axis_fn(u, v, depth1) for (u, v) in outline]
    ca = sum((Vector(p) for p in a), Vector()) / len(a)
    cb = sum((Vector(p) for p in b), Vector()) / len(b)
    d = (cb - ca)
    mb.poly(a, m, -d)
    mb.poly(b, m, d)
    n = len(outline)
    area = sum(outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1] for i in range(n))
    sgn = 1 if area > 0 else -1
    dm = (depth0 + depth1) / 2
    for i in range(n):
        j = (i + 1) % n
        (u0, v0), (u1, v1) = outline[i], outline[j]
        du, dv = u1 - u0, v1 - v0
        nu, nv = sgn * dv, -sgn * du
        um, vm = (u0 + u1) / 2, (v0 + v1) / 2
        out = Vector(axis_fn(um + nu * 0.01, vm + nv * 0.01, dm)) - Vector(axis_fn(um, vm, dm))
        mb.poly([a[i], a[j], b[j], b[i]], side_mat or m, out)
