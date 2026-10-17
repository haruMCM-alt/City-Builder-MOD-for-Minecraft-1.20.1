"""
Blender model builder for the train simulator.

Run headless:
    blender -b -P train-sim/blender/build_models.py

Builds every vehicle, the cab interior and the trackside props with bpy/bmesh,
saves an editable .blend file and exports one .glb per vehicle series into
train-sim/assets/models/.

Axes (Blender): X = forward (car front), Y = left, Z = up. Rail top is Z = 0.
The glTF exporter converts to Y-up, so in three.js: X forward, Y up, -Z left.
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
        orange=mat("shonan_orange", (0.95, 0.38, 0.03), 0.0, 0.45),
        green=mat("shonan_green", (0.02, 0.34, 0.13), 0.0, 0.45),
        paint_orange=mat("paint_orange", (0.92, 0.36, 0.04), 0.0, 0.35),
        paint_green=mat("paint_green", (0.06, 0.26, 0.11), 0.0, 0.35),
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
# Car body
# ---------------------------------------------------------------------------
class Spec:
    """Dimensions / styling for one series."""

    def __init__(self, **kw):
        self.__dict__.update(kw)


def body_profile(W, z_side_top, z_roof, double=False):
    """Returns (bottom tumblehome pts, side top, roof rows) as (y,z) lists, left half mirrored later."""
    # full closed profile, going from bottom-right around the top to bottom-left
    z_bot = 0.98
    z_th = 1.15
    roof = []
    n = 10
    for i in range(n + 1):
        t = i / n * (math.pi / 2)
        e = 2 / 3.2
        y = W * (math.cos(t) ** e)
        z = z_side_top + (z_roof - z_side_top) * (math.sin(t) ** e)
        roof.append((y, z))
    return z_bot, z_th, roof


def make_body(mb, M, L, W, z_side_top, z_roof, front_rake=0.0, rear_rake=0.0, front_mat=None, rear_mat=None):
    """Extruded car body. Front at +X. rake = setback (m) of the top of a cab end."""
    z_bot, z_th, roof = body_profile(W, z_side_top, z_roof)
    W_bot = W - 0.10

    def xf(z):
        if front_rake <= 0:
            return L / 2
        k = max(0.0, (z - 1.45) / (z_roof - 1.45))
        return L / 2 - front_rake * k

    def xr(z):
        if rear_rake <= 0:
            return -L / 2
        k = max(0.0, (z - 1.45) / (z_roof - 1.45))
        return -L / 2 + rear_rake * k

    # profile: right side (y negative) bottom -> top -> roof -> left side down
    prof = [(-W_bot, z_bot), (-W, z_th), (-W, z_side_top)]
    prof += [(-y, z) for (y, z) in roof[1:]]  # right half of roof up to top
    prof += [(y, z) for (y, z) in reversed(roof[:-1])]
    prof += [(W, z_th), (W_bot, z_bot)]
    # (roof list goes from side to top; we mirrored manually)
    zc = (z_bot + z_roof) / 2

    def out(p):
        return Vector((0, p.y, p.z - zc))

    # sides: flat panels
    for sgn in (-1, 1):
        mb.poly([(xr(z_th), sgn * W, z_th), (xf(z_th), sgn * W, z_th), (xf(z_side_top), sgn * W, z_side_top), (xr(z_side_top), sgn * W, z_side_top)], M["stainless"] if M.get("side") is None else M["side"], (0, sgn, 0))
        mb.poly([(xr(z_bot), sgn * W_bot, z_bot), (xf(z_bot), sgn * W_bot, z_bot), (xf(z_th), sgn * W, z_th), (xr(z_th), sgn * W, z_th)], M["stainless"] if M.get("side") is None else M["side"], (0, sgn, -0.3))
    # roof
    roof_full = [(-y, z) for (y, z) in roof] + [(y, z) for (y, z) in reversed(roof[:-1])]
    rows = [[(xr(z), y, z) for (y, z) in roof_full], [(xf(z), y, z) for (y, z) in roof_full]]
    mb.grid(rows, M["roof"], out, smooth=True)
    # floor
    mb.poly([(xr(z_bot), -W_bot, z_bot), (xf(z_bot), -W_bot, z_bot), (xf(z_bot), W_bot, z_bot), (xr(z_bot), W_bot, z_bot)], M["dkgrey"], (0, 0, -1))
    # ends
    endpoly = [(-W_bot, z_bot), (-W, z_th), (-W, z_side_top)] + [(-y, z) for (y, z) in roof[1:]] + [(y, z) for (y, z) in reversed(roof[:-1])] + [(W, z_side_top), (W, z_th), (W_bot, z_bot)]
    mb.poly([(xf(z), y, z) for (y, z) in endpoly], front_mat or M["stainless"], (1, 0, 0))
    mb.poly([(xr(z), y, z) for (y, z) in endpoly], rear_mat or M["stainless"], (-1, 0, 0))
    return xf, xr


def side_rect(mb, x0, x1, z0, z1, W, m, off=0.006, sides=(-1, 1)):
    for s in sides:
        y = s * (W + off)
        mb.poly([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], m, (0, s, 0))


def front_rect(mb, xf, y0, y1, z0, z1, m, off=0.008, front=True):
    """Rectangle on the (possibly raked) end face. Approximates the rake with the two z values."""
    s = 1 if front else -1
    pts = [(xf(z0) + s * off, y0, z0), (xf(z0) + s * off, y1, z0), (xf(z1) + s * off, y1, z1), (xf(z1) + s * off, y0, z1)]
    mb.poly(pts, m, (s, 0, 0.0))


def bogie(mb, M, x, panto_side=False):
    # frame
    mb.box((x, 0, 0.62), (2.9, 1.9, 0.22), M["bogie"])
    mb.box((x, 0.98, 0.55), (2.6, 0.12, 0.30), M["bogie"])
    mb.box((x, -0.98, 0.55), (2.6, 0.12, 0.30), M["bogie"])
    mb.box((x, 0, 0.82), (0.9, 2.3, 0.18), M["bogie"])  # bolster
    for ax in (-1.05, 1.05):
        for s in (-1, 1):
            mb.cyl((x + ax, s * 0.565, 0.43), (0, 1, 0), 0.43, 0.13, M["wheel"], seg=18)
            mb.cyl((x + ax, s * 0.86, 0.43), (0, 1, 0), 0.13, 0.22, M["bogie"], seg=10)
        mb.cyl((x + ax, 0, 0.43), (0, 1, 0), 0.08, 1.2, M["grey"], seg=8)
        # springs
        for s in (-1, 1):
            mb.cyl((x + ax, s * 0.98, 0.78), (0, 0, 1), 0.09, 0.22, M["dkgrey"], seg=8)


def coupler(mb, M, x, sgn):
    mb.box((x + sgn * 0.25, 0, 0.88), (0.5, 0.22, 0.18), M["dkgrey"])
    mb.box((x + sgn * 0.52, 0, 0.88), (0.12, 0.34, 0.26), M["dkgrey"])


def underfloor(mb, M, L, seed):
    import random
    rnd = random.Random(seed)
    x = -L / 2 + 4.4
    while x < L / 2 - 4.4:
        w = rnd.uniform(0.8, 2.2)
        if x + w > L / 2 - 4.4:
            break
        d = rnd.uniform(0.9, 2.3)
        h = rnd.uniform(0.35, 0.6)
        side = rnd.choice((-1, 1))
        mb.box((x + w / 2, side * (1.25 - d / 2), 0.98 - h / 2), (w, d, h), M[rnd.choice(["dkgrey", "bogie", "grey"])])
        x += w + rnd.uniform(0.1, 0.6)


def panto_single_arm(mb, M, x, roof_z):
    base = roof_z + 0.08
    mb.box((x, 0, base), (1.5, 1.2, 0.08), M["panto"])
    for s in (-1, 1):
        mb.cyl((x - 0.6, s * 0.55, base + 0.1), (0, 0, 1), 0.06, 0.18, M["grey"], seg=8)
        mb.cyl((x + 0.6, s * 0.55, base + 0.1), (0, 0, 1), 0.06, 0.18, M["grey"], seg=8)
    knee = (x + 0.55, 0, 4.55)
    mb.beam((x - 0.55, 0, base + 0.12), knee, 0.09, 0.09, M["panto"])
    mb.beam((x - 0.45, 0.25, base + 0.1), (x + 0.5, 0.15, 4.45), 0.04, 0.04, M["panto"])
    head = (x - 0.05, 0, 5.08)
    mb.beam(knee, head, 0.07, 0.07, M["panto"])
    mb.box((x - 0.05, 0, 5.12), (0.12, 1.6, 0.05), M["chrome"])
    for s in (-1, 1):
        mb.beam((x - 0.05, s * 0.8, 5.12), (x - 0.05, s * 1.05, 5.0), 0.04, 0.04, M["panto"])
    mb.beam((x - 0.05, -0.4, 5.08), (x - 0.05, 0.4, 5.08), 0.05, 0.05, M["panto"])


def panto_diamond(mb, M, x, roof_z):
    base = roof_z + 0.08
    mb.box((x, 0, base), (1.6, 1.4, 0.08), M["panto"])
    top = 5.08
    mid = (base + top) / 2
    for s in (-1, 1):
        y = s * 0.55
        mb.beam((x - 0.75, y, base + 0.05), (x, y * 0.6, mid), 0.05, 0.05, M["panto"])
        mb.beam((x + 0.75, y, base + 0.05), (x, y * 0.6, mid), 0.05, 0.05, M["panto"])
        mb.beam((x, y * 0.6, mid), (x - 0.45, y * 0.8, top), 0.05, 0.05, M["panto"])
        mb.beam((x, y * 0.6, mid), (x + 0.45, y * 0.8, top), 0.05, 0.05, M["panto"])
    for dx in (-0.45, 0.45):
        mb.box((x + dx, 0, top + 0.03), (0.1, 1.7, 0.05), M["chrome"])


def roof_ac(mb, M, x, roof_z, big=False):
    if big:
        mb.box((x, 0, roof_z + 0.18), (3.6, 2.2, 0.42), M["light_grey"])
        for k in range(4):
            mb.cyl((x - 1.2 + k * 0.8, 0, roof_z + 0.4), (0, 0, 1), 0.28, 0.05, M["dkgrey"], seg=12)
    else:
        mb.box((x, 0, roof_z + 0.16), (2.6, 2.0, 0.38), M["light_grey"])
        mb.box((x, 0, roof_z + 0.36), (2.2, 1.6, 0.04), M["grey"])


def cab_front(mb, M, S, xf, W, z_side_top, z_roof):
    """Cab end decoration on the front (+X) face."""
    st = S.front_style
    if st == "e231":
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.12, 1.62, M["stainless_dk"])
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.62, 3.30, M["black"], off=0.012)
        front_rect(mb, xf, 0.12, 1.30, 2.02, 3.08, M["glass"], off=0.018)
        front_rect(mb, xf, -0.30, 0.02, 1.95, 3.05, M["glass"], off=0.018)
        front_rect(mb, xf, -1.30, -0.42, 2.02, 3.08, M["glass"], off=0.018)
        front_rect(mb, xf, -1.25, -0.42, 3.12, 3.28, M["dest"], off=0.02)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.45, 1.53, M["orange"], off=0.016)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.37, 1.45, M["green"], off=0.016)
        for s in (-1, 1):
            front_rect(mb, xf, s * 1.05 - 0.22, s * 1.05 + 0.22, 1.18, 1.33, M["head"], off=0.02)
            front_rect(mb, xf, s * 1.33 - 0.07, s * 1.33 + 0.07, 1.18, 1.33, M["tail"], off=0.02)
    elif st == "e233":
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.12, 1.80, M["light_grey"])
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.80, 3.36, M["black"], off=0.012)
        front_rect(mb, xf, -1.32, 1.32, 2.0, 3.12, M["glass"], off=0.018)
        front_rect(mb, xf, -0.04, 0.04, 2.0, 3.12, M["black"], off=0.02)
        front_rect(mb, xf, -0.9, 0.5, 3.16, 3.32, M["dest"], off=0.02)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.62, 1.74, M["orange"], off=0.016)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.50, 1.62, M["green"], off=0.016)
        for s in (-1, 1):
            front_rect(mb, xf, s * 1.0 - 0.28, s * 1.0 + 0.28, 1.86, 1.98, M["head"], off=0.02)
            front_rect(mb, xf, s * 1.0 - 0.28, s * 1.0 + 0.28, 1.25, 1.40, M["tail"], off=0.02)
    elif st == "211":
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.70, 3.10, M["black"], off=0.012)
        front_rect(mb, xf, 0.30, 1.32, 2.0, 2.95, M["glass"], off=0.018)
        front_rect(mb, xf, -0.32, 0.22, 1.85, 2.95, M["glass"], off=0.018)
        front_rect(mb, xf, -1.32, -0.40, 2.0, 2.95, M["glass"], off=0.018)
        front_rect(mb, xf, -0.30, 0.20, 2.98, 3.08, M["dest"], off=0.02)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.50, 1.62, M["orange"], off=0.016)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.38, 1.50, M["green"], off=0.016)
        for s in (-1, 1):
            front_rect(mb, xf, s * 1.05 - 0.2, s * 1.05 + 0.2, 1.20, 1.33, M["head"], off=0.02)
            front_rect(mb, xf, s * 1.35 - 0.06, s * 1.35 + 0.06, 1.20, 1.33, M["tail"], off=0.02)
    elif st == "115":
        # 湘南色: orange upper, green lower
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.12, 1.72, M["paint_green"], off=0.004)
        front_rect(mb, xf, -W + 0.06, W - 0.06, 1.72, z_side_top + 0.25, M["paint_orange"], off=0.004)
        front_rect(mb, xf, 0.38, 1.25, 2.02, 2.80, M["glass"], off=0.012)
        front_rect(mb, xf, -0.30, 0.30, 1.75, 2.82, M["glass"], off=0.012)
        front_rect(mb, xf, -1.25, -0.38, 2.02, 2.80, M["glass"], off=0.012)
        front_rect(mb, xf, -0.32, 0.32, 2.88, 3.08, M["dest"], off=0.012)
        front_rect(mb, xf, -0.32, 0.32, 3.18, 3.42, M["head"], off=0.012)
        for s in (-1, 1):
            front_rect(mb, xf, s * 1.05 - 0.13, s * 1.05 + 0.13, 1.32, 1.48, M["tail"], off=0.012)
            front_rect(mb, xf, s * 1.05 - 0.13, s * 1.05 + 0.13, 1.52, 1.66, M["head"], off=0.012)
    # skirt / coupler
    x0 = xf(1.0)
    mb.poly([(x0 + 0.02, -1.3, 1.0), (x0 + 0.02, 1.3, 1.0), (x0 + 0.22, 1.05, 0.38), (x0 + 0.22, -1.05, 0.38)], M["black"] if st != "115" else M["dkgrey"], (1, 0, -0.3))
    coupler(mb, M, x0, 1)


def rear_cab_marker(mb, M, S, xr, W):
    """Rear-end (gangway) decoration for intermediate ends."""
    s = -1
    pts = lambda y0, y1, z0, z1: [(xr(z0) - 0.01, y0, z0), (xr(z0) - 0.01, y1, z0), (xr(z1) - 0.01, y1, z1), (xr(z1) - 0.01, y0, z1)]
    mb.poly(pts(-0.45, 0.45, 1.15, 3.0), M["dkgrey"], (-1, 0, 0))


def gangway(mb, M, x, sgn, top=3.0):
    mb.box((x + sgn * 0.12, 0, (1.15 + top) / 2), (0.24, 1.1, top - 1.15), M["black"])


def car_sides(mb, M, S, L, W, kind):
    """Windows, doors and livery on the sides of a single-deck car."""
    zt = S.z_side_top
    doors = S.doors
    dw = S.door_w
    win_z0, win_z1 = S.win_z
    is_cab = kind in ("cab",)
    # livery band
    if S.livery == "stripe":
        segs = []
        edges = [-L / 2 + 0.05] + sum([[d - dw / 2 - 0.05, d + dw / 2 + 0.05] for d in doors], []) + [L / 2 - 0.05]
        if is_cab:
            edges[-1] = L / 2 - 2.4
        for i in range(0, len(edges), 2):
            if edges[i + 1] > edges[i]:
                side_rect(mb, edges[i], edges[i + 1], win_z0 - 0.26, win_z0 - 0.14, W, M["orange"])
                side_rect(mb, edges[i], edges[i + 1], win_z0 - 0.38, win_z0 - 0.26, W, M["green"])
                if S.upper_stripe:
                    side_rect(mb, edges[i], edges[i + 1], win_z1 + 0.10, win_z1 + 0.16, W, M["orange"])
                    side_rect(mb, edges[i], edges[i + 1], win_z1 + 0.16, win_z1 + 0.22, W, M["green"])
    elif S.livery == "shonan":
        x1 = L / 2 - (0.0 if not is_cab else 0.0)
        side_rect(mb, -L / 2, x1, 1.15, win_z0 - 0.08, W, M["paint_green"], off=0.003)
        side_rect(mb, -L / 2, x1, win_z0 - 0.08, zt, W, M["paint_orange"], off=0.003)
    # doors
    for d in doors:
        side_rect(mb, d - dw / 2, d + dw / 2, 1.13, 2.95, W, M["stainless_dk"] if S.livery != "shonan" else M["paint_orange"], off=0.010)
        side_rect(mb, d - dw / 2 + 0.06, d - 0.03, 1.95, 2.75, W, M["glass"], off=0.014)
        side_rect(mb, d + 0.03, d + dw / 2 - 0.06, 1.95, 2.75, W, M["glass"], off=0.014)
        side_rect(mb, d - 0.012, d + 0.012, 1.13, 2.95, W, M["black"], off=0.014)
        if S.livery == "shonan":
            side_rect(mb, d - dw / 2, d + dw / 2, 1.13, win_z0 - 0.08, W, M["paint_green"], off=0.012)
    # windows between doors
    pts = sorted(doors)
    bounds = [-L / 2 + 0.35] + pts + [L / 2 - (2.6 if is_cab else 0.35)]
    for i in range(len(bounds) - 1):
        a = bounds[i] + (dw / 2 + 0.25 if i > 0 else 0)
        b = bounds[i + 1] - (dw / 2 + 0.25 if i + 1 < len(bounds) - 1 else 0)
        if b - a < 0.4:
            continue
        n = max(1, round((b - a) / S.win_pitch))
        wlen = (b - a) / n
        for k in range(n):
            side_rect(mb, a + k * wlen + 0.06, a + (k + 1) * wlen - 0.06, win_z0, win_z1, W, M["glass"], off=0.012)
    # destination display (side) near the second door
    if len(doors) >= 2:
        x = (doors[0] + doors[1]) / 2 + 0.9
        side_rect(mb, x - 0.45, x + 0.45, win_z1 + 0.06, win_z1 + 0.24, W, M["dest"], off=0.014)
    if is_cab:
        # cab side window + crew door
        side_rect(mb, L / 2 - 2.35, L / 2 - 1.75, 1.13, 2.9, W, M["stainless_dk"] if S.livery != "shonan" else M["paint_orange"], off=0.01)
        side_rect(mb, L / 2 - 2.28, L / 2 - 1.82, 2.0, 2.7, W, M["glass"], off=0.014)
        side_rect(mb, L / 2 - 1.6, L / 2 - 0.55, 2.0, 2.8, W, M["glass"], off=0.012)


def make_car(S, M, kind, coll):
    """kind: 'cab' (cab at +X), 'mid', 'mid_panto', 'green'"""
    name = f"{S.key}_{kind}"
    mb = MB(name)
    L = S.length
    W = S.half_w
    if kind == "green":
        return make_green(S, M, coll)
    front_rake = S.front_rake if kind == "cab" else 0.0
    body_mat = M["paint_orange"] if S.livery == "shonan" else None
    if body_mat:
        M = dict(M)
        M["side"] = body_mat
    xf, xr = make_body(mb, M, L, W, S.z_side_top, S.z_roof, front_rake=front_rake,
                       front_mat=(M["paint_orange"] if S.livery == "shonan" else M["stainless"]) if kind == "cab" else M["stainless_dk"],
                       rear_mat=M["stainless_dk"] if S.livery != "shonan" else M["paint_green"])
    car_sides(mb, M, S, L, W, kind)
    if kind == "cab":
        cab_front(mb, M, S, xf, W, S.z_side_top, S.z_roof)
    else:
        gangway(mb, M, L / 2, 1)
        coupler(mb, M, L / 2, 1)
    gangway(mb, M, -L / 2, -1)
    coupler(mb, M, -L / 2, -1)
    rear_cab_marker(mb, M, S, xr, W)
    for bx in (-S.bogie_c, S.bogie_c):
        bogie(mb, M, bx)
    underfloor(mb, M, L, hash(name) & 0xffff)
    roof_ac(mb, M, 0.0 if kind != "mid_panto" else -3.5, S.z_roof - 0.05, big=S.big_ac)
    if kind == "mid_panto":
        if S.panto == "single":
            panto_single_arm(mb, M, 5.2, S.z_roof - 0.05)
        else:
            panto_diamond(mb, M, 5.2, S.z_roof - 0.05)
    if S.livery == "shonan":
        # roof vents
        for k in range(-3, 4):
            if kind == "mid_panto" and k >= 2:
                continue
            mb.box((k * 2.6 + 1.3, 0, S.z_roof + 0.08), (0.8, 0.7, 0.22), M["grey"])
    return mb.build(coll)


def make_green(S, M, coll):
    """Double-deck green car (サロ)."""
    mb = MB(f"{S.key}_green")
    L, W = S.length, S.half_w
    zt, zr = 3.45, 4.05
    shonan = S.livery == "shonan"
    xf, xr = make_body(mb, M, L, W, zt, zr, front_mat=M["stainless_dk"], rear_mat=M["stainless_dk"])
    dw = 1.0
    doors = (-L / 2 + 1.4, L / 2 - 1.4)
    for d in doors:
        side_rect(mb, d - dw / 2, d + dw / 2, 1.13, 2.95, W, M["stainless_dk"], off=0.010)
        side_rect(mb, d - dw / 2 + 0.08, d + dw / 2 - 0.08, 1.95, 2.75, W, M["glass"], off=0.014)
    # stairs/deck windows
    a, b = -L / 2 + 2.6, L / 2 - 2.6
    n = 8
    wl = (b - a) / n
    for k in range(n):
        x0, x1 = a + k * wl + 0.08, a + (k + 1) * wl - 0.08
        side_rect(mb, x0, x1, 2.40, 3.25, W, M["glass"], off=0.012)  # upper deck
        side_rect(mb, x0, x1, 1.05, 1.70, W, M["glass"], off=0.012)  # lower deck
    for x0, x1 in ((-L / 2 + 0.2, -L / 2 + 0.75), (L / 2 - 0.75, L / 2 - 0.2)):
        side_rect(mb, x0, x1, 1.95, 2.75, W, M["glass"], off=0.012)
    # livery: band between decks
    side_rect(mb, a, b, 1.90, 2.04, W, M["orange"])
    side_rect(mb, a, b, 1.78, 1.90, W, M["green"])
    side_rect(mb, a, b, 2.05, 2.30, W, M["stainless_dk"], off=0.008)
    # green-car emblem
    for d in doors:
        side_rect(mb, d + (0.65 if d < 0 else -0.95), d + (0.95 if d < 0 else -0.65), 2.45, 2.75, W, M["green_mark"], off=0.014)
    side_rect(mb, -0.45, 0.45, 3.30, 3.42, W, M["dest"], off=0.014)
    gangway(mb, M, L / 2, 1, top=2.95)
    gangway(mb, M, -L / 2, -1, top=2.95)
    coupler(mb, M, L / 2, 1)
    coupler(mb, M, -L / 2, -1)
    for bx in (-S.bogie_c, S.bogie_c):
        bogie(mb, M, bx)
    # lower deck dips between bogies: dark skirt
    mb.box((0, 0, 0.75), (L - 8.0, 2 * W - 0.2, 0.5), M["dkgrey"])
    mb.box((3.5, 0, zr + 0.06), (2.0, 1.6, 0.2), M["light_grey"])
    mb.box((-3.5, 0, zr + 0.06), (2.0, 1.6, 0.2), M["light_grey"])
    return mb.build(coll)


SERIES = {
    "e231": Spec(key="e231", length=19.9, half_w=1.475, z_side_top=2.85, z_roof=3.62, front_rake=0.35,
                 doors=(-7.35, -2.45, 2.45, 7.35), door_w=1.3, win_z=(1.75, 2.62), win_pitch=2.7,
                 livery="stripe", upper_stripe=False, front_style="e231", panto="single", big_ac=False,
                 bogie_c=6.9, green=True),
    "e233": Spec(key="e233", length=19.9, half_w=1.475, z_side_top=2.85, z_roof=3.62, front_rake=0.55,
                 doors=(-7.35, -2.45, 2.45, 7.35), door_w=1.3, win_z=(1.78, 2.62), win_pitch=1.35,
                 livery="stripe", upper_stripe=True, front_style="e233", panto="single", big_ac=False,
                 bogie_c=6.9, green=True),
    "211": Spec(key="211", length=19.9, half_w=1.40, z_side_top=2.85, z_roof=3.60, front_rake=0.08,
                doors=(-6.4, 0.0, 6.4), door_w=1.3, win_z=(1.80, 2.62), win_pitch=1.4,
                livery="stripe", upper_stripe=False, front_style="211", panto="single", big_ac=False,
                bogie_c=6.9, green=True),
    "115": Spec(key="115", length=19.9, half_w=1.40, z_side_top=2.80, z_roof=3.65, front_rake=0.18,
                doors=(-6.6, 0.0, 6.6), door_w=1.1, win_z=(1.75, 2.60), win_pitch=1.05,
                livery="shonan", upper_stripe=False, front_style="115", panto="diamond", big_ac=True,
                bogie_c=6.9, green=False),
}


# ---------------------------------------------------------------------------
# Cab interior (shared by all series, coloured per series in three.js)
# ---------------------------------------------------------------------------
def make_cab_interior(M, coll):
    mb = MB("cab_interior")
    L = 19.9
    xF = L / 2 - 0.22  # inner face of the front wall at window height
    W = 1.40
    zf = 1.25  # cab floor
    zc = 3.25  # ceiling
    # floor / ceiling / side walls / back wall (normals face inward)
    mb.poly([(xF - 2.6, -W, zf), (xF, -W, zf), (xF, W, zf), (xF - 2.6, W, zf)], M["cab_desk"], (0, 0, 1))
    mb.poly([(xF - 2.6, -W, zc), (xF, -W, zc), (xF, W, zc), (xF - 2.6, W, zc)], M["cab_wall"], (0, 0, -1))
    for s in (-1, 1):
        y = s * W
        # side wall with a window opening (x: xF-1.6..xF-0.4, z: 2.0..2.8)
        x0, x1 = xF - 1.6, xF - 0.35
        mb.poly([(xF - 2.6, y, zf), (xF, y, zf), (xF, y, 2.0), (xF - 2.6, y, 2.0)], M["cab_wall"], (0, -s, 0))
        mb.poly([(xF - 2.6, y, 2.8), (xF, y, 2.8), (xF, y, zc), (xF - 2.6, y, zc)], M["cab_wall"], (0, -s, 0))
        mb.poly([(xF - 2.6, y, 2.0), (x0, y, 2.0), (x0, y, 2.8), (xF - 2.6, y, 2.8)], M["cab_wall"], (0, -s, 0))
        mb.poly([(x1, y, 2.0), (xF, y, 2.0), (xF, y, 2.8), (x1, y, 2.8)], M["cab_wall"], (0, -s, 0))
    mb.poly([(xF - 2.6, -W, zf), (xF - 2.6, W, zf), (xF - 2.6, W, zc), (xF - 2.6, -W, zc)], M["cab_wall"], (1, 0, 0))
    # front wall around the windscreen opening (sill z=1.85, header z=3.08)
    fx = xF + 0.02
    sill, head = 1.85, 3.08
    mb.poly([(fx, -W, head), (fx, W, head), (fx, W, zc), (fx, -W, zc)], M["cab_wall"], (-1, 0, 0))
    mb.poly([(fx, -W, zf), (fx, W, zf), (fx, W, sill), (fx, -W, sill)], M["cab_panel"], (-1, 0, 0))
    for (y0, y1) in ((-W, -1.30), (-0.40, -0.30), (0.02, 0.10), (1.30, W)):
        mb.poly([(fx, y0, sill), (fx, y1, sill), (fx, y1, head), (fx, y0, head)], M["black"], (-1, 0, 0))
    # wiper arm resting on the driver's window
    mb.beam((fx + 0.01, 0.25, sill + 0.03), (fx + 0.01, 1.15, sill + 0.10), 0.015, 0.012, M["black"])
    # sun visor
    mb.box((xF - 0.10, 0.72, 3.03), (0.20, 0.95, 0.02), M["dkgrey"])
    # desk: low sloped console spanning the width
    mb.poly([(xF - 0.95, -W, 1.70), (xF - 0.95, W, 1.70), (xF - 0.02, W, 1.83), (xF - 0.02, -W, 1.83)], M["cab_desk"], (0, 0, 1))
    mb.poly([(xF - 0.95, -W, 1.70), (xF - 0.95, W, 1.70), (xF - 0.95, W, 1.30), (xF - 0.95, -W, 1.30)], M["cab_panel"], (-1, 0, 0))
    # low instrument cluster in front of the driver (left side, +Y)
    mb.poly([(xF - 0.62, 0.20, 1.86), (xF - 0.62, 1.20, 1.86), (xF - 0.30, 1.20, 1.86), (xF - 0.30, 0.20, 1.86)], M["cab_desk"], (0, 0, 1))
    mb.poly([(xF - 0.62, 0.20, 1.86), (xF - 0.62, 1.20, 1.86), (xF - 0.70, 1.20, 1.72), (xF - 0.70, 0.20, 1.72)], M["cab_panel"], (-1, 0, 0.5))
    for (y, r) in ((0.88, 0.07), (0.62, 0.06), (0.40, 0.05)):
        c = Vector((xF - 0.67, y, 1.80))
        mb.cyl(c, (-1, 0, 0.55), r, 0.02, M["dkgrey"], seg=20)
        mb.cyl(c + Vector((-0.004, 0, 0.002)), (-1, 0, 0.55), r * 0.82, 0.02, M["gauge_face"], seg=20)
    # TIMS monitors
    for yc in (-0.05, -0.55):
        mb.poly([(xF - 0.60, yc - 0.20, 1.74), (xF - 0.60, yc + 0.20, 1.74), (xF - 0.48, yc + 0.20, 1.92), (xF - 0.48, yc - 0.20, 1.92)], M["screen"], (-1, 0, 0.6))
    # buttons row
    for k in range(8):
        mb.cyl((xF - 0.82, -1.25 + k * 0.1, 1.73), (0, 0, 1), 0.02, 0.03, M[["head", "tail", "green_mark", "chrome"][k % 4]], seg=8)
    # one-handle master controller base (left of driver)
    mb.box((xF - 0.80, 1.18, 1.55), (0.45, 0.22, 0.32), M["cab_panel"])
    # driver seat
    mb.box((xF - 1.40, 0.72, 1.70), (0.5, 0.5, 0.1), M["blue_seat"])
    mb.box((xF - 1.67, 0.72, 2.05), (0.08, 0.5, 0.6), M["blue_seat"])
    mb.cyl((xF - 1.40, 0.72, 1.47), (0, 0, 1), 0.05, 0.45, M["chrome"], seg=8)
    cab = mb.build(coll)

    # master controller handle as its own object (animated by the sim).
    # Pivot at the slot; the T-handle points up and rotates around Y.
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
    for key, S in SERIES.items():
        coll = bpy.data.collections.new(f"series_{key}")
        scene.collection.children.link(coll)
        kinds = ["cab", "mid", "mid_panto"] + (["green"] if S.green else [])
        objs = []
        for i, k in enumerate(kinds):
            o = make_car(S, M, k, coll)
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
