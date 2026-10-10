"""
Seated passengers and standing cabin crew sculpted from Blender metaballs.

Every body region is its own metaball family (skin, shirt, trousers, shoes ...), converted to a
mesh, decimated and joined into one object per posable part, so that the soft blends give organic
shapes (shoulders flowing into the neck, a jaw, cheekbones, knuckles) while the clothing keeps
clean edges at collars, cuffs and hems. Hair is a separate shell over the skull with flowing
strand clumps and grooves.

Frame: design (s aft, y left, z up), seat origin at the floor under the cushion centre, the
passenger faces -s. Objects are built in the Blender frame of build_b787 (X = S_CG - s).
The part split and the pivots match cabin_b787.PAX_PIVOTS / CREW_PIVOTS (the simulator poses the
head and the arms per instance).
"""
import math

import bpy
import numpy as np
from mathutils import Matrix, Vector

import b787_geometry as G
import common as C

K = 0.574            # surface radius / element radius for an isolated ball (stiffness 2, threshold 0.6)


def _rng(seed):
    return np.random.default_rng(seed)


def B(p):
    """design point -> Blender"""
    return Vector((G.S_CG - p[0], p[1], p[2]))


# --------------------------------------------------------------------------- metaball families
class Family:
    def __init__(self, name, res=0.005):
        self.mb = bpy.data.metaballs.new("MB" + name)
        self.mb.resolution = res
        self.mb.render_resolution = res
        self.mb.threshold = 0.6
        self.ob = bpy.data.objects.new("MB" + name, self.mb)
        bpy.context.scene.collection.objects.link(self.ob)

    def ball(self, p, R, k=2.0, neg=False):
        e = self.mb.elements.new(type="BALL")
        e.co = B(p)
        e.radius = R / K
        e.stiffness = k
        e.use_negative = neg
        return self

    def ellipsoid(self, p, R, axes=(1, 1, 1), k=2.0, neg=False, tilt=0.0):
        """axes: relative half sizes along (s, y, z); tilt about y (+ = top leans aft)"""
        e = self.mb.elements.new(type="ELLIPSOID")
        e.co = B(p)
        m = max(axes)
        e.radius = R * m / K
        e.size_x, e.size_y, e.size_z = axes[0] / m, axes[1] / m, axes[2] / m
        e.stiffness = k
        e.use_negative = neg
        if tilt:
            # design s -> Blender -X: a lean aft is a rotation about Blender +Y by +tilt
            e.rotation = Matrix.Rotation(tilt, 4, "Y").to_quaternion()
        return self

    def limb(self, p0, p1, r0, r1, n=None, k=2.0):
        """tapered limb as a chain of balls"""
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        L = np.linalg.norm(p1 - p0)
        n = n or max(3, int(L / (0.5 * min(r0, r1))) + 1)
        for t in np.linspace(0, 1, n):
            self.ball(p0 + (p1 - p0) * t, r0 + (r1 - r0) * t, k=k)
        return self

    def mesh(self, name, faces, mat):
        """convert to a mesh (one material), decimated to about `faces` faces"""
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(self.ob.evaluated_get(dg))
        bpy.data.objects.remove(self.ob)
        bpy.data.metaballs.remove(self.mb)
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if len(me.polygons) > faces:
            mod = ob.modifiers.new("dec", "DECIMATE")
            mod.ratio = faces / len(me.polygons)
            mod.use_collapse_triangulate = True
            _apply(ob, mod)
        me = ob.data
        me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = True
        return ob


def _apply(ob, mod):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.remove(mod)
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)


def grid_object(name, P, mat, outward=None):
    """object from a (nu, nv, 3) design-frame grid (smooth shaded); outward: a point the
    normals face away from"""
    mb = C.MeshBuilder(G.to_blender)
    mb.add_grid(P, mat=0, outward=outward)
    ob = mb.build(name, [mat])
    return ob


def sphere_object(name, c, r, mat, n=(10, 14)):
    mb = C.MeshBuilder(G.to_blender)
    lat = np.linspace(-math.pi / 2, math.pi / 2, n[0] + 1)[:, None]
    lon = np.linspace(0, 2 * math.pi, n[1] + 1)[None, :]
    P = np.stack([c[0] + r[0] * np.cos(lat) * np.cos(lon), c[1] + r[1] * np.cos(lat) * np.sin(lon),
                  c[2] + r[2] * np.sin(lat) * np.ones_like(lon)], -1)
    mb.add_grid(P, mat=0, wrap_v=True, outward=tuple(c))
    return mb.build(name, [mat])


def join(name, obs, parent, col):
    obs = [o for o in obs if o is not None]
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in obs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = obs[0]
    bpy.ops.object.join()
    ob = obs[0]
    ob.name = name
    ob.data.name = name
    # merge materials with the same name (each piece brought its own slot)
    me = ob.data
    names, remap = [], []
    for m in me.materials:
        if m.name not in names:
            names.append(m.name)
        remap.append(names.index(m.name))
    if len(names) < len(me.materials):
        idx = np.zeros(len(me.polygons), np.int32)
        me.polygons.foreach_get("material_index", idx)
        idx = np.asarray(remap, np.int32)[idx]
        mats = [bpy.data.materials[n] for n in names]
        me.materials.clear()
        for m in mats:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", idx)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    col.objects.link(ob)
    C.set_parent(ob, parent)
    return ob


# --------------------------------------------------------------------------- noise
def _noise2(u, v, seed, k=8):
    """tileable-in-u value noise on a (u in [0,1) periodic, v) grid"""
    rng = _rng(seed)
    g = rng.random((k, k + 3))
    x, y = (u % 1.0) * k, np.clip(v, 0, 0.999) * (k + 2)
    i, j = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - i, y - j
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b = g[i % k, j], g[(i + 1) % k, j]
    c_, d = g[i % k, j + 1], g[(i + 1) % k, j + 1]
    return a + (b - a) * fx + (c_ - a) * fy + (a - b - c_ + d) * fx * fy


# --------------------------------------------------------------------------- head
def skull(c, r, lat, lon):
    """skull ellipsoid point (lon 0 = front = -s)"""
    return np.stack([c[0] - r[0] * np.cos(lat) * np.cos(lon), c[1] + r[1] * np.cos(lat) * np.sin(lon),
                     c[2] + r[2] * np.sin(lat)], -1)


def head_skin(c, female, res=0.004):
    """neck, skull, face (brow, cheekbones, nose, lips, jaw, chin), ears"""
    f = Family("Skin", res)
    s0, z0 = c[0], c[2]
    w = 0.94 if female else 1.0
    f.ellipsoid((s0 + 0.008, 0, z0 + 0.012), 0.098, (0.98, 0.76 * w, 1.0))                 # cranium
    f.ellipsoid((s0 - 0.03, 0, z0 - 0.035), 0.066, (0.95, 0.9 * w, 0.8))                  # midface
    f.ellipsoid((s0 - 0.052, 0, z0 - 0.074), 0.04, (1.0, 1.08 * w * (0.88 if female else 1.0), 0.66))   # jaw
    f.ball((s0 - 0.084, 0, z0 - 0.093), 0.019)                                           # chin
    for sy in (-1, 1):
        f.ball((s0 - 0.07, sy * 0.043, z0 - 0.02), 0.022)                                 # cheekbones
        f.ellipsoid((s0 - 0.015, sy * 0.05, z0 - 0.066), 0.026, (1.0, 0.65, 0.9))         # jaw angle
        f.ball((s0 - 0.093, sy * 0.032, z0 + 0.012), 0.016, neg=True, k=3.0)              # eye socket
        f.ellipsoid((s0 - 0.091, sy * 0.032, z0 + 0.019), 0.013, (0.55, 1.0, 0.5))        # upper lid
        f.ellipsoid((s0 - 0.09, sy * 0.032, z0 + 0.002), 0.011, (0.5, 1.0, 0.4))          # lower lid
        f.ellipsoid((s0 + 0.003, sy * 0.074, z0 - 0.008), 0.03, (0.75, 0.35, 1.0), k=3.0)  # ear
    for sy in (-1, 1):
        f.ellipsoid((s0 - 0.09, sy * 0.03, z0 + 0.031), 0.012, (0.6, 1.4, 0.45))           # brow ridge
    f.ball((s0 - 0.097, 0, z0 + 0.028), 0.012)                                           # glabella
    f.ellipsoid((s0 - 0.104, 0, z0 - 0.008), 0.011, (0.9, 0.8, 1.9), tilt=math.radians(-16))   # nose bridge
    f.ball((s0 - 0.112, 0, z0 - 0.028), 0.0105)                                          # nose tip
    for sy in (-1, 1):
        f.ball((s0 - 0.104, sy * 0.011, z0 - 0.032), 0.008)                              # nostrils
    f.ellipsoid((s0 - 0.097, 0, z0 - 0.05), 0.0095, (0.8, 2.0, 0.5))                      # upper lip
    f.ellipsoid((s0 - 0.094, 0, z0 - 0.061), 0.009, (0.8, 1.7, 0.6))                      # lower lip
    return f


def neck(female, res=0.004):
    """its own family: a clean jawline instead of a jaw melting into the neck"""
    f = Family("Neck", res)
    f.limb((0.196, 0, 1.06), (0.208, 0, 1.2), 0.046 if female else 0.052, 0.043, k=2.0)
    f.ellipsoid((0.215, 0, 1.08), 0.055, (0.75, 1.2, 0.45))          # base of the neck (behind, into the trapezius)
    return f


def hair_cap(c, seed, style, female):
    """hair shell over the cranium: hairline (forehead, temples, nape), crown volume, strand
    clumps and fine grooves following the flow from the crown"""
    r = (0.098 * 0.98 * K / K + 0.0, 0.098 * 0.76, 0.098)
    lon = np.linspace(0, 2 * math.pi, 49)
    rows = 18
    # hairline latitude per longitude: front (forehead) / temple / behind the ear / nape
    cl = np.cos(lon)
    front = np.radians({"short": 26, "long": 22, "bun": 24}.get(style, 26))
    hl = np.interp(cl, [-1, -0.3, 0.2, 0.7, 1], [-48, -30, -6, 8, 1]) * math.pi / 180
    hl = np.where(cl > 0.7, front - (1 - cl) * 0.6, hl)
    t = np.linspace(0, 1, rows)[:, None]
    LAT = hl[None] + (math.pi / 2 - hl[None]) * t ** 0.85
    LON = np.tile(lon, (rows, 1))
    cc = (c[0] + 0.008, 0, c[2] + 0.012)
    P = skull(cc, (0.098 * 0.98, 0.098 * 0.76 * (0.94 if female else 1.0), 0.098), LAT, LON)
    n = P - np.asarray(cc)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    u = LON / (2 * math.pi)
    v = (LAT - LAT.min()) / (LAT.max() - LAT.min() + 1e-9)
    clump = _noise2(u * 3, v, seed, 10)
    fine = 0.5 + 0.5 * np.sin(LON * 70 + 6 * _noise2(u, v, seed + 1, 6))
    thick = 0.008 + (0.014 if style != "short" else 0.009) * np.sin(np.clip(LAT, 0, None)) ** 0.6
    thick = thick * (0.7 + 0.6 * clump) + 0.0025 * fine
    edge = np.clip(t / 0.18, 0, 1) ** 0.5                       # thin at the hairline
    P = P + n * (thick * edge + 0.0015)[..., None]
    # a side parting
    part = np.exp(-((LON - 0.5) / 0.06) ** 2) * np.clip(np.sin(LAT) - 0.35, 0, 1)
    P = P - n * (0.006 * part)[..., None]
    return P


def hair_long(c, seed, female):
    """long hair: a shell over the back of the head from the crown, following the skull, then
    falling over the nape to the shoulders, with strand clumps and grooves"""
    cc = (c[0] + 0.008, 0, c[2] + 0.012)
    r = (0.098 * 0.98, 0.098 * 0.76 * (0.94 if female else 1.0), 0.098)
    lon = np.linspace(math.pi * 0.36, math.pi * 1.64, 35)        # from behind the ears round the back
    u = (lon - lon[0]) / (lon[-1] - lon[0])
    lats = np.radians(np.linspace(62, -8, 9))                   # on the skull
    rows = [skull(cc, r, np.full_like(lon, la), lon) for la in lats]
    base = rows[-1]
    for k, z in enumerate(np.linspace(base[:, 2].mean() - 0.04, 1.0, 7)):   # the fall
        t = (k + 1) / 7
        q = base.copy()
        d = q - np.array([cc[0], 0, q[0, 2]])
        d[:, 2] = 0
        q[:, :2] = np.array([cc[0], 0]) + d[:, :2] * (1.0 + 0.32 * t ** 0.9)
        q[:, 2] = z
        rows.append(q)
    P = np.asarray(rows)
    n = P - np.asarray(cc)
    n[..., 2] *= 0.3
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    v = np.linspace(0, 1, len(P))[:, None]
    clump = _noise2(u[None] * 3 + 0 * v, v, seed, 10)
    grooves = 0.5 + 0.5 * np.sin(lon[None] * 60 + 5 * clump)
    thick = 0.012 + 0.006 * clump + 0.0025 * grooves
    P = P + n * thick[..., None]
    P[-1, :, 2] += 0.035 * (_noise2(u, np.full_like(u, 0.5), seed + 3, 12) - 0.5)     # uneven ends
    return P


def build_head(M, col, parent, name, c):
    """Proto_PaxHead: skin, eyes, brows, short hair cap; the variants (long hair, bun, glasses)
    are separate materials switched per passenger in the simulator."""
    obs = [head_skin(c, False).mesh(name + "_skin", 2400, M["skin"]), neck(False).mesh(name + "_neck", 500, M["skin"])]
    for sy in (-1, 1):
        e = (c[0] - 0.08, sy * 0.032, c[2] + 0.011)
        obs.append(sphere_object(name + "_eye", e, (0.0108, 0.0108, 0.0108), M["eyewhite"], (8, 12)))
        obs.append(sphere_object(name + "_iris", (e[0] - 0.0083, e[1], e[2]), (0.0035, 0.0064, 0.0064), M["eye"], (6, 10)))
        # eyebrow: a thin arc over the eye
        bm = C.MeshBuilder(G.to_blender)
        from cabin_b787 import capsule
        pts = [(c[0] - 0.1, sy * 0.014, c[2] + 0.031), (c[0] - 0.099, sy * 0.03, c[2] + 0.037),
               (c[0] - 0.092, sy * 0.048, c[2] + 0.032)]
        capsule(bm, pts[0], pts[1], 0.0034, 0.0032, 0, n=6, m=2)
        capsule(bm, pts[1], pts[2], 0.0032, 0.0022, 0, n=6, m=2)
        obs.append(bm.build(name + "_brow", [M["brow"]]))
    obs.append(grid_object(name + "_hair", hair_cap(c, 11, "short", False), M["hair"], outward=(c[0], 0, c[2])))
    obs.append(grid_object(name + "_hairlong", hair_long(c, 12, True), M["hairlong"], outward=(c[0] - 0.02, 0, c[2] - 0.05)))
    bun = Family("Bun", 0.004)
    bun.ellipsoid((c[0] + 0.098, 0, c[2] + 0.06), 0.04, (1.0, 1.1, 0.95))
    bun.ellipsoid((c[0] + 0.082, 0, c[2] + 0.04), 0.022, (1.0, 1.3, 0.8))
    obs.append(bun.mesh(name + "_bun", 500, M["hairbun"]))
    # glasses: two rounded-rectangle rims, bridge and temples
    gl = C.MeshBuilder(G.to_blender)
    from cabin_b787 import rr_outline, cyl
    for sy in (-1, 1):
        ring = rr_outline(0.05, 0.034, 0.012, edge=(2, 3), arc=4)
        for (a, b2) in zip(ring[:-1], ring[1:]):
            p0 = (c[0] - 0.108, sy * 0.033 + a[0], c[2] + 0.012 + a[1])
            p1 = (c[0] - 0.108, sy * 0.033 + b2[0], c[2] + 0.012 + b2[1])
            cyl(gl, p0, p1, 0.0018, 0, n=5)
        cyl(gl, (c[0] - 0.105, sy * 0.058, c[2] + 0.018), (c[0] + 0.0, sy * 0.077, c[2] + 0.012), 0.0016, 0, n=5)
    cyl(gl, (c[0] - 0.11, -0.008, c[2] + 0.02), (c[0] - 0.11, 0.008, c[2] + 0.02), 0.0016, 0, n=5)
    obs.append(gl.build(name + "_glasses", [M["glasses"]]))
    return join(name, obs, parent, col)


# --------------------------------------------------------------------------- body
def build_body(M, col, parent, name, female):
    """torso (shirt), pelvis + legs (trousers), shoes; seated, leaning back 12 degrees"""
    lean = math.radians(12)
    ax = np.array([math.sin(lean), 0, math.cos(lean)])
    hip = np.array([0.075, 0.0, 0.50])
    at = lambda t, ds=0.0: hip + ax * t + np.array([math.cos(lean), 0, -math.sin(lean)]) * ds   # noqa: E731
    sh_w = 0.165 if female else 0.19
    hip_w = 0.17 if female else 0.155
    shirt = Family("Shirt", 0.006)
    shirt.ellipsoid(at(0.19), 0.115, (0.78, hip_w / 0.115 * 0.82, 1.0), tilt=lean)              # waist
    shirt.ellipsoid(at(0.34, -0.012), 0.125, (0.82, (0.152 if female else 0.165) / 0.125, 1.0), tilt=lean)  # chest
    shirt.ellipsoid(at(0.46), 0.085, (0.95, sh_w / 0.085 * 0.93, 0.72), tilt=lean)               # upper chest
    for sy in (-1, 1):
        shirt.ball(at(0.495) + np.array([0, sy * (sh_w - 0.04), 0]), 0.052)                        # shoulder
        shirt.ellipsoid(at(0.53, 0.012) + np.array([0, sy * 0.068, 0]), 0.042, (0.9, 1.45, 0.62), tilt=lean)  # trapezius
        if female:
            shirt.ball(at(0.33, -0.075) + np.array([0, sy * 0.066, -0.01]), 0.052)               # bust
    shirt.limb(at(0.53, 0.014), at(0.556, 0.016), 0.058, 0.054)                                  # collar
    pants = Family("Pants", 0.006)
    pants.ellipsoid(at(0.04), 0.12, (1.05, hip_w / 0.12, 0.8), tilt=lean)                         # pelvis
    for sy in (-1, 1):
        pants.ball((0.11, sy * 0.085, 0.53), 0.095)                                              # seat
        pants.limb((0.04, sy * 0.1, 0.535), (-0.39, sy * 0.105, 0.545), 0.09 if not female else 0.088, 0.062)  # thigh
        pants.ball((-0.405, sy * 0.105, 0.535), 0.06)                                            # knee
        pants.limb((-0.41, sy * 0.105, 0.52), (-0.46, sy * 0.11, 0.13), 0.056, 0.04)             # shin
        pants.ball((-0.405, sy * 0.105, 0.37), 0.056)                                            # calf
    shoes = Family("Shoes", 0.005)
    for sy in (-1, 1):
        shoes.ellipsoid((-0.52, sy * 0.11, 0.055), 0.065, (2.0, 0.78, 0.62))
        shoes.ellipsoid((-0.47, sy * 0.11, 0.075), 0.045, (1.0, 1.0, 0.9))
        shoes.ellipsoid((-0.525, sy * 0.11, 0.014), 0.05, (2.6, 1.05, 0.25))                     # sole
    obs = [shirt.mesh(name + "_shirt", 1500, M["shirt"]), pants.mesh(name + "_pants", 1500, M["pants"]),
           shoes.mesh(name + "_shoes", 500, M["shoes"])]
    return join(name, obs, parent, col)


def build_arm_parts(M, col, parent, sy, L, piv):
    sh = np.array(piv["shoulder" + L])
    el = np.array(piv["elbow" + L])
    up = Family("UArm" + L, 0.005)
    up.ball(sh + np.array([0.0, -sy * 0.008, -0.02]), 0.05)                                  # deltoid
    up.limb(sh + np.array([0, 0, -0.035]), el, 0.045, 0.038)
    u = join("Proto_PaxUArm" + L, [up.mesh("ua" + L, 700, M["shirt"])], parent, col)
    wr = np.array([-0.135, sy * 0.19, 0.68])
    fa = Family("FArm" + L, 0.005)
    fa.limb(el, wr + np.array([0.025, 0, 0]), 0.039, 0.031)
    hand = Family("Hand" + L, 0.0035)
    hand.limb(wr + np.array([0.02, 0, 0.0]), wr + np.array([-0.012, 0, -0.004]), 0.024, 0.026)   # wrist
    hand.ellipsoid((-0.172, sy * 0.188, 0.672), 0.04, (1.15, 0.85, 0.36))                       # palm
    for k in range(4):                                                                       # fingers
        y = sy * (0.188 + (k - 1.5) * 0.0152)
        Lf = (0.072, 0.08, 0.077, 0.063)[k]
        hand.limb((-0.2, y, 0.672), (-0.2 - Lf * 0.6, y, 0.668), 0.0095, 0.0085, n=4)
        hand.limb((-0.2 - Lf * 0.6, y, 0.668), (-0.2 - Lf, y, 0.65), 0.0085, 0.0075, n=3)
    hand.limb((-0.16, sy * (0.188 - 0.032), 0.668), (-0.205, sy * (0.188 - 0.05), 0.66), 0.011, 0.0085, n=5)   # thumb
    f = join("Proto_PaxFArm" + L, [fa.mesh("fa" + L, 600, M["shirt"]), hand.mesh("hd" + L, 900, M["skin"])], parent, col)
    return u, f


def build_pax(M, col, parent, piv):
    """Proto_Pax (male body), Proto_PaxF (female body, switched per passenger), Proto_PaxHead,
    upper arms and forearms + hands"""
    build_body(M, col, parent, "Proto_Pax", False)
    build_body(M, col, parent, "Proto_PaxF", True)
    build_head(M, col, parent, "Proto_PaxHead", (0.212, 0.0, 1.245))
    for sy, L in ((1, "L"), (-1, "R")):
        build_arm_parts(M, col, parent, sy, L, piv)


# --------------------------------------------------------------------------- crew
def build_crew(M, col, parent):
    """Standing flight attendant (origin between the feet, facing -s): body + head, arms, legs"""
    c = (0.0, 0.0, 1.635)
    jacket = Family("CJacket", 0.006)
    jacket.ellipsoid((0.0, 0, 1.06), 0.11, (0.78, 1.3, 1.0))
    jacket.ellipsoid((-0.008, 0, 1.2), 0.12, (0.8, 1.3, 1.0))
    jacket.ellipsoid((0.0, 0, 1.34), 0.09, (0.95, 1.85, 0.75))
    for sy in (-1, 1):
        jacket.ball((0.0, sy * 0.165, 1.39), 0.058)
        jacket.ball((-0.07, sy * 0.065, 1.21), 0.05)
    jacket.limb((0.0, 0, 1.40), (0.0, 0, 1.47), 0.056, 0.048)
    skirt = Family("CSkirt", 0.006)          # knee-length pencil skirt
    for z, R, ax in ((0.95, 0.118, (0.95, 1.3, 0.7)), (0.84, 0.124, (0.93, 1.3, 0.75)), (0.72, 0.122, (0.9, 1.24, 0.75)),
                     (0.6, 0.118, (0.88, 1.18, 0.75)), (0.52, 0.112, (0.86, 1.14, 0.55))):
        skirt.ellipsoid((0.0, 0, z), R, ax)
    sc = Family("CScarf", 0.004)
    sc.ellipsoid((-0.075, 0, 1.40), 0.03, (0.8, 1.6, 1.0))
    sc.ellipsoid((-0.09, 0.02, 1.35), 0.02, (0.6, 0.8, 1.3))
    head = head_skin(c, True)
    nk = Family("CNeck", 0.004)
    nk.limb((0.0, 0, 1.44), (-0.005, 0, 1.58), 0.045, 0.042)
    obs = [jacket.mesh("cj", 1500, M["uniform"]), skirt.mesh("cs", 700, M["crewpants"]), sc.mesh("csc", 200, M["crewaccent"]),
           head.mesh("ch", 2200, M["crewskin"]), nk.mesh("cn", 400, M["crewskin"])]
    obs.append(grid_object("chair", hair_cap(c, 21, "bun", True), M["crewhair"], outward=c))
    bun = Family("CBun", 0.004)
    bun.ellipsoid((c[0] + 0.098, 0, c[2] + 0.055), 0.04, (1.0, 1.1, 0.95))
    obs.append(bun.mesh("cbun", 400, M["crewhair"]))
    for sy in (-1, 1):
        e = (c[0] - 0.08, sy * 0.032, c[2] + 0.011)
        obs.append(sphere_object("ceye", e, (0.0108, 0.0108, 0.0108), M["eyewhite"], (8, 12)))
        obs.append(sphere_object("ciris", (e[0] - 0.0083, e[1], e[2]), (0.0035, 0.0064, 0.0064), M["eye"], (6, 10)))
    mb = C.MeshBuilder(G.to_blender)
    mb.add_box((-0.1, 0.07, 1.30), (0.01, 0.05, 0.015), mat=0)                                   # name badge
    obs.append(mb.build("cbadge", [M["crewaccent"]]))
    join("Proto_Crew", obs, parent, col)
    for sy, L in ((1, "L"), (-1, "R")):
        a = Family("CArm" + L, 0.005)
        sh = np.array([0.0, sy * 0.2, 1.42])
        a.ball(sh + np.array([0, -sy * 0.01, -0.01]), 0.055)
        a.limb(sh + np.array([0, sy * 0.01, -0.03]), (0.0, sy * 0.222, 1.12), 0.046, 0.04)
        a.limb((0.0, sy * 0.222, 1.12), (-0.01, sy * 0.225, 0.86), 0.04, 0.031)
        h = Family("CHand" + L, 0.0035)
        h.ellipsoid((-0.012, sy * 0.222, 0.80), 0.04, (0.45, 0.32, 1.0))
        h.limb((-0.012, sy * 0.222, 0.77), (-0.02, sy * 0.222, 0.71), 0.012, 0.009)
        join("Proto_CrewArm" + L, [a.mesh("ca" + L, 700, M["uniform"]), h.mesh("ch" + L, 400, M["crewskin"])], parent, col)
        lg = Family("CLeg" + L, 0.005)
        lg.limb((0.0, sy * 0.085, 0.86), (0.0, sy * 0.09, 0.47), 0.068, 0.05)
        lg.limb((0.0, sy * 0.09, 0.47), (0.0, sy * 0.09, 0.09), 0.047, 0.033)
        lg.ball((0.012, sy * 0.09, 0.32), 0.048)
        sh2 = Family("CShoe" + L, 0.004)
        sh2.ellipsoid((-0.04, sy * 0.09, 0.045), 0.055, (2.0, 0.75, 0.75))
        sh2.ellipsoid((0.035, sy * 0.09, 0.06), 0.03, (0.8, 0.8, 1.6))
        join("Proto_CrewLeg" + L, [lg.mesh("cl" + L, 600, M["crewskin"]), sh2.mesh("cf" + L, 300, M["shoes"])], parent, col)
