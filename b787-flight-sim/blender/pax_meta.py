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
    """neck, skull, face, ears. Proportions after adult anthropometry (head length ~0.20 m,
    breadth ~0.15, menton-vertex ~0.23, face breadth ~0.14, jaw breadth ~0.11, interpupillary
    0.063): a full, soft face from few large forms; the eyes sit behind lids instead of in
    hollow sockets (the old staring-skull look)"""
    f = Family("Skin", res)
    s0, z0 = c[0], c[2]
    ze = z0 + 0.011                                   # eye line
    w = 0.94 if female else 1.0
    f.ellipsoid((s0 + 0.012, 0, z0 + 0.014), 0.1, (0.97, 0.76 * w, 1.0))                     # cranium
    f.ellipsoid((s0 - 0.026, 0, ze - 0.032), 0.068, (0.8, 0.95 * w, 1.0))                    # face mass
    f.ellipsoid((s0 - 0.03, 0, ze - 0.076), 0.054, (1.0, 1.08 * w * (0.9 if female else 1.0), 0.56))   # jaw
    f.ball((s0 - 0.072, 0, ze - 0.097), 0.0165)                                            # chin
    for sy in (-1, 1):
        f.ellipsoid((s0 - 0.056, sy * 0.039, ze - 0.022), 0.026, (0.75, 0.85, 1.0))          # cheeks
        f.ellipsoid((s0 - 0.084, sy * 0.032, ze + 0.0118), 0.0125, (0.62, 1.0, 0.46))        # upper lid
        f.ellipsoid((s0 - 0.082, sy * 0.032, ze - 0.0112), 0.011, (0.6, 1.0, 0.4))           # lower lid
        f.ellipsoid((s0 + 0.006, sy * 0.073, ze - 0.022), 0.027, (0.68, 0.28, 1.0), k=3.0)   # ear
        f.ellipsoid((s0 - 0.084, sy * 0.026, ze + 0.025), 0.0105, (0.55, 1.5, 0.42))         # brow
    f.ellipsoid((s0 - 0.09, 0, ze - 0.014), 0.0085, (0.8, 0.7, 1.9), tilt=math.radians(-18))  # nose bridge
    f.ball((s0 - 0.1, 0, ze - 0.036), 0.0095)                                              # nose tip
    for sy in (-1, 1):
        f.ball((s0 - 0.091, sy * 0.012, ze - 0.038), 0.0075)                                # nostril wings
    f.ellipsoid((s0 - 0.085, 0, ze - 0.058), 0.0092, (0.6, 2.3, 0.48))                      # upper lip
    f.ellipsoid((s0 - 0.083, 0, ze - 0.068), 0.0088, (0.6, 2.0, 0.52))                      # lower lip
    return f


def brows(c, mat, name):
    """eyebrows: thin arcs lying on the brow ridge"""
    from cabin_b787 import capsule
    bm = C.MeshBuilder(G.to_blender)
    for sy in (-1, 1):
        pts = [(c[0] - 0.0912, sy * 0.012, c[2] + 0.0375), (c[0] - 0.0905, sy * 0.029, c[2] + 0.0405),
               (c[0] - 0.0845, sy * 0.046, c[2] + 0.0355)]
        capsule(bm, pts[0], pts[1], 0.0034, 0.0032, 0, n=6, m=2)
        capsule(bm, pts[1], pts[2], 0.0032, 0.0022, 0, n=6, m=2)
    return bm.build(name, [mat])


def mouth_line(mb, c, mat):
    """the dark parting between the lips, a shallow smile curve"""
    from cabin_b787 import capsule
    s0, ze = c[0], c[2] + 0.011
    pts = [(s0 - 0.083, 0.021, ze - 0.0615), (s0 - 0.0915, 0.0, ze - 0.0635), (s0 - 0.083, -0.021, ze - 0.0615)]
    capsule(mb, pts[0], pts[1], 0.0011, 0.0013, mat, n=6, m=2)
    capsule(mb, pts[1], pts[2], 0.0013, 0.0011, mat, n=6, m=2)


def neck(female, res=0.004):
    """its own family: a clean jawline instead of a jaw melting into the neck"""
    f = Family("Neck", res)
    f.limb((0.205, 0, 1.08), (0.218, 0, 1.18), 0.044 if female else 0.05, 0.043, k=2.0)
    f.ellipsoid((0.225, 0, 1.1), 0.055, (0.75, 1.2, 0.45))           # base of the neck (behind, into the trapezius)
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
    hl = np.interp(cl, [-1, -0.45, 0.0, 0.3, 0.7, 1], [-50, -40, -26, -16, 6, 1]) * math.pi / 180
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
    thick = 0.009 + (0.016 if style != "short" else 0.013) * np.sin(np.clip(LAT, 0, None)) ** 0.6
    thick = thick * (0.85 + 0.3 * clump) + 0.0012 * fine
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
        e = (c[0] - 0.0795, sy * 0.032, c[2] + 0.011)
        obs.append(sphere_object(name + "_eye", e, (0.0115, 0.0115, 0.0115), M["eyewhite"], (8, 12)))
        obs.append(sphere_object(name + "_iris", (e[0] - 0.0093, e[1], e[2]), (0.0035, 0.0062, 0.0062), M["eye"], (6, 10)))
    obs.append(brows(c, M["brow"], name + "_brow"))
    ml = C.MeshBuilder(G.to_blender)
    mouth_line(ml, c, 0)
    obs.append(ml.build(name + "_mouth", [M["eye"]]))
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
    shirt.ellipsoid(at(0.36, -0.012), 0.125, (0.82, (0.152 if female else 0.165) / 0.125, 1.0), tilt=lean)  # chest
    shirt.ellipsoid(at(0.5), 0.088, (0.95, sh_w / 0.088 * 0.93, 0.72), tilt=lean)               # upper chest
    for sy in (-1, 1):
        shirt.ball(at(0.555) + np.array([0, sy * (sh_w - 0.04), 0]), 0.052)                        # shoulder
        shirt.ellipsoid(at(0.58, 0.012) + np.array([0, sy * 0.07, 0]), 0.042, (0.9, 1.5, 0.62), tilt=lean)  # trapezius
        if female:
            shirt.ball(at(0.33, -0.075) + np.array([0, sy * 0.066, -0.01]), 0.052)               # bust
    shirt.limb(at(0.57, 0.014), at(0.6, 0.016), 0.056, 0.052)                                  # collar
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
    """Standing flight attendant (origin between the feet, facing -s): body + head, arms, legs.
    Standing adult female proportions: stature ~1.65 m with low heels, eye 1.55, acromion 1.33
    (biacromial 0.36, bideltoid 0.45), waist 1.04, knee 0.50; jacket, knee-length pencil skirt
    (overlapping the jacket hem, no gap), tights, court shoes."""
    c = (0.0, 0.0, 1.539)                            # head centre (eye line 1.55)
    jacket = Family("CJacket", 0.006)
    jacket.ellipsoid((0.005, 0, 0.97), 0.13, (0.72, 1.32, 0.75))                     # hips (under the skirt top)
    jacket.ellipsoid((0.0, 0, 1.06), 0.105, (0.86, 1.22, 1.0))                       # waist
    jacket.ellipsoid((-0.004, 0, 1.2), 0.118, (0.92, 1.36, 1.0))                     # ribcage
    jacket.ellipsoid((0.008, 0, 1.3), 0.09, (1.0, 1.9, 0.72))                        # upper chest / shoulder line
    for sy in (-1, 1):
        jacket.ball((0.0, sy * 0.165, 1.3), 0.05)                                   # shoulder
        jacket.ball((-0.072, sy * 0.06, 1.2), 0.05)                                 # bust
        jacket.ellipsoid((0.018, sy * 0.06, 1.35), 0.035, (0.9, 1.5, 0.6))          # trapezius
    jacket.limb((0.012, 0, 1.33), (0.015, 0, 1.38), 0.05, 0.046)                     # collar
    skirt = Family("CSkirt", 0.006)          # knee-length pencil skirt
    for z, R, ax in ((0.99, 0.125, (0.85, 1.38, 0.6)), (0.9, 0.132, (0.84, 1.36, 0.75)), (0.78, 0.13, (0.82, 1.3, 0.75)),
                     (0.66, 0.126, (0.82, 1.26, 0.75)), (0.55, 0.12, (0.82, 1.24, 0.6))):
        skirt.ellipsoid((0.005, 0, z), R, ax)
    sc = Family("CScarf", 0.004)
    sc.ellipsoid((-0.062, 0, 1.335), 0.026, (0.8, 1.6, 1.0))
    sc.ellipsoid((-0.08, 0.018, 1.29), 0.018, (0.6, 0.8, 1.3))
    head = head_skin(c, True)
    nk = Family("CNeck", 0.004)
    nk.limb((0.012, 0, 1.33), (0.008, 0, 1.47), 0.041, 0.038)
    obs = [jacket.mesh("cj", 1600, M["uniform"]), skirt.mesh("cs", 800, M["crewpants"]), sc.mesh("csc", 200, M["crewaccent"]),
           head.mesh("ch", 2400, M["crewskin"]), nk.mesh("cn", 400, M["crewskin"])]
    obs.append(grid_object("chair", hair_cap(c, 21, "bun", True), M["crewhair"], outward=c))
    bun = Family("CBun", 0.004)
    bun.ellipsoid((c[0] + 0.1, 0, c[2] + 0.045), 0.038, (1.0, 1.1, 0.95))
    obs.append(bun.mesh("cbun", 400, M["crewhair"]))
    for sy in (-1, 1):
        e = (c[0] - 0.0795, sy * 0.032, c[2] + 0.011)
        obs.append(sphere_object("ceye", e, (0.0115, 0.0115, 0.0115), M["eyewhite"], (8, 12)))
        obs.append(sphere_object("ciris", (e[0] - 0.0093, e[1], e[2]), (0.0035, 0.0062, 0.0062), M["eye"], (6, 10)))
    mb = C.MeshBuilder(G.to_blender)
    mouth_line(mb, c, 0)
    obs.append(mb.build("cmouth", [M["eye"]]))
    obs.append(brows(c, M["crewhair"], "cbrow"))
    mb = C.MeshBuilder(G.to_blender)
    mb.add_box((-0.098, 0.075, 1.25), (0.01, 0.05, 0.014), mat=0)                                 # name badge
    obs.append(mb.build("cbadge", [M["crewaccent"]]))
    join("Proto_Crew", obs, parent, col)
    for sy, L in ((1, "L"), (-1, "R")):
        a = Family("CArm" + L, 0.005)
        sh = np.array([0.0, sy * 0.195, 1.31])
        a.ball(sh + np.array([0, -sy * 0.008, -0.005]), 0.052)                       # deltoid
        a.limb(sh + np.array([0, sy * 0.008, -0.03]), (0.008, sy * 0.21, 1.03), 0.044, 0.037)
        a.limb((0.008, sy * 0.21, 1.03), (-0.004, sy * 0.215, 0.8), 0.036, 0.028)
        h = Family("CHand" + L, 0.0035)
        h.limb((-0.004, sy * 0.215, 0.81), (-0.006, sy * 0.215, 0.77), 0.024, 0.026)   # wrist
        h.ellipsoid((-0.008, sy * 0.213, 0.73), 0.042, (0.42, 0.3, 1.0))             # palm
        h.limb((-0.008, sy * 0.213, 0.7), (-0.016, sy * 0.211, 0.64), 0.013, 0.009)  # fingers
        h.limb((-0.03, sy * 0.205, 0.75), (-0.04, sy * 0.2, 0.7), 0.01, 0.008)        # thumb
        join("Proto_CrewArm" + L, [a.mesh("ca" + L, 700, M["uniform"]), h.mesh("ch" + L, 450, M["crewskin"])], parent, col)
        lg = Family("CLeg" + L, 0.005)
        lg.limb((0.005, sy * 0.072, 0.86), (0.0, sy * 0.078, 0.5), 0.058, 0.045)     # thigh (under the skirt)
        lg.ball((0.004, sy * 0.082, 0.49), 0.047)                                   # knee
        lg.limb((0.0, sy * 0.082, 0.48), (0.008, sy * 0.084, 0.1), 0.044, 0.03)     # shin
        lg.ellipsoid((0.022, sy * 0.082, 0.33), 0.05, (0.85, 0.9, 1.5))              # calf
        sh2 = Family("CShoe" + L, 0.004)
        sh2.ellipsoid((-0.05, sy * 0.084, 0.04), 0.055, (2.0, 0.7, 0.62))
        sh2.ellipsoid((0.03, sy * 0.084, 0.055), 0.03, (0.9, 0.8, 1.4))
        sh2.limb((0.045, sy * 0.084, 0.04), (0.05, sy * 0.084, 0.0), 0.009, 0.007)   # low heel
        join("Proto_CrewLeg" + L, [lg.mesh("cl" + L, 650, M["crewskin"]), sh2.mesh("cf" + L, 300, M["shoes"])], parent, col)


# --------------------------------------------------------------------------- flight crew
# seated pilot: upright (6 degrees), feet forward on the rudder pedals, hands on the controls;
# white short-sleeved shirt with black epaulettes (captain 4 gold bars, first officer 3), black
# tie, wings, dark trousers, a headset with the boom microphone. Parts: Proto_Pilot (captain
# body), Proto_PilotFO, Proto_PilotHead, Proto_PilotArmL / R (pivot at the shoulder).
PILOT_PIVOTS = dict(neck=(0.13, 0.0, 1.13), shoulderL=(0.118, 0.15, 1.05), shoulderR=(0.118, -0.15, 1.05))


def build_pilot(M, col, parent):
    from cabin_b787 import cyl
    lean = math.radians(6)
    ax = np.array([math.sin(lean), 0, math.cos(lean)])
    fwd = np.array([math.cos(lean), 0, -math.sin(lean)])
    hip = np.array([0.06, 0.0, 0.50])
    at = lambda t, ds=0.0: hip + ax * t + fwd * ds   # noqa: E731

    def body(name, bars):
        shirt = Family("PShirt", 0.006)
        shirt.ellipsoid(at(0.19), 0.115, (0.8, 0.155 / 0.115 * 0.84, 1.0), tilt=lean)
        shirt.ellipsoid(at(0.36, -0.012), 0.125, (0.84, 0.168 / 0.125, 1.0), tilt=lean)
        shirt.ellipsoid(at(0.5), 0.088, (0.95, 0.19 / 0.088 * 0.93, 0.72), tilt=lean)
        for sy in (-1, 1):
            shirt.ball(at(0.555) + np.array([0, sy * 0.15, 0]), 0.052)
            shirt.ellipsoid(at(0.58, 0.012) + np.array([0, sy * 0.07, 0]), 0.042, (0.9, 1.5, 0.62), tilt=lean)
        shirt.limb(at(0.57, 0.014), at(0.6, 0.016), 0.056, 0.052)
        pants = Family("PPants", 0.006)
        pants.ellipsoid(at(0.04), 0.12, (1.05, 0.155 / 0.12, 0.8), tilt=lean)
        for sy in (-1, 1):
            pants.ball((0.1, sy * 0.085, 0.53), 0.095)
            pants.limb((0.03, sy * 0.1, 0.535), (-0.40, sy * 0.11, 0.55), 0.09, 0.062)        # thigh
            pants.ball((-0.415, sy * 0.11, 0.54), 0.06)                                       # knee
            pants.limb((-0.42, sy * 0.115, 0.53), (-0.6, sy * 0.12, 0.17), 0.056, 0.04)       # shin, to the pedals
            pants.ball((-0.48, sy * 0.115, 0.4), 0.055)                                       # calf
        shoes = Family("PShoes", 0.005)
        for sy in (-1, 1):
            shoes.ellipsoid((-0.68, sy * 0.12, 0.1), 0.065, (2.0, 0.78, 0.62))
            shoes.ellipsoid((-0.62, sy * 0.12, 0.12), 0.045, (1.0, 1.0, 0.9))
        tie = Family("PTie", 0.004)
        for t, wdt in ((0.585, 0.022), (0.55, 0.02), (0.48, 0.026), (0.40, 0.03), (0.33, 0.032), (0.28, 0.026)):
            ds = -(0.07 + 0.075 * (0.585 - t) / 0.3 if t > 0.5 else 0.122)
            tie.ellipsoid(at(t, ds if t > 0.5 else -0.118), wdt, (0.35, 1.0, 1.4), tilt=lean)
        obs = [shirt.mesh(name + "_shirt", 1500, M["pilotshirt"]), pants.mesh(name + "_pants", 1300, M["pilotpants"]),
               shoes.mesh(name + "_shoes", 400, M["shoes"]), tie.mesh(name + "_tie", 200, M["pilottie"])]
        # epaulettes with the gold bars, the wings over the left pocket
        ep = C.MeshBuilder(G.to_blender)
        gold = C.MeshBuilder(G.to_blender)
        for sy in (-1, 1):
            c0 = at(0.585) + np.array([0.0, sy * 0.115, 0.012])
            ep.add_box(tuple(c0), (0.028, 0.06, 0.006), mat=0)
            for k in range(bars):
                gold.add_box((c0[0], c0[1] + sy * (0.034 - k * 0.016), c0[2] + 0.004), (0.029, 0.0045, 0.004), mat=0)
        wc = at(0.44, -0.122) + np.array([0, 0.07, 0])
        gold.add_box(tuple(wc), (0.004, 0.03, 0.006), mat=0)
        gold.add_box(tuple(wc + np.array([0, 0, -0.008])), (0.004, 0.012, 0.004), mat=0)
        obs.append(ep.build(name + "_ep", [M["epaulette"]]))
        obs.append(gold.build(name + "_gold", [M["gold"]]))
        return join(name, obs, parent, col)

    body("Proto_Pilot", 4)
    body("Proto_PilotFO", 3)
    # head: face, short hair, the headset
    c = (0.13, 0.0, 1.255)
    nk = Family("PNeck", 0.004)
    nk.limb((0.125, 0, 1.09), (0.135, 0, 1.19), 0.05, 0.043)
    nk.ellipsoid((0.145, 0, 1.11), 0.055, (0.75, 1.2, 0.45))
    obs = [head_skin(c, False).mesh("ph_skin", 2000, M["skin"]), nk.mesh("ph_neck", 400, M["skin"])]
    for sy in (-1, 1):
        e = (c[0] - 0.0795, sy * 0.032, c[2] + 0.011)
        obs.append(sphere_object("ph_eye", e, (0.0115, 0.0115, 0.0115), M["eyewhite"], (8, 12)))
        obs.append(sphere_object("ph_iris", (e[0] - 0.0093, e[1], e[2]), (0.0035, 0.0062, 0.0062), M["eye"], (6, 10)))
    obs.append(brows(c, M["brow"], "ph_brow"))
    ml = C.MeshBuilder(G.to_blender)
    mouth_line(ml, c, 0)
    obs.append(ml.build("ph_mouth", [M["eye"]]))
    obs.append(grid_object("ph_hair", hair_cap(c, 31, "short", False), M["hair"], outward=(c[0], 0, c[2])))
    hs = C.MeshBuilder(G.to_blender)
    band = [(c[0] + 0.012, 0.097 * math.cos(a), c[2] + 0.003 + 0.118 * math.sin(a)) for a in np.linspace(0.12, math.pi - 0.12, 12)]
    for p0, p1 in zip(band[:-1], band[1:]):
        cyl(hs, p0, p1, 0.007, 0, n=8)
    mic = [(c[0] + 0.0, 0.1, c[2] - 0.03), (c[0] - 0.05, 0.085, c[2] - 0.06), (c[0] - 0.095, 0.05, c[2] - 0.07), (c[0] - 0.11, 0.022, c[2] - 0.063)]
    for p0, p1 in zip(mic[:-1], mic[1:]):
        cyl(hs, p0, p1, 0.0028, 0, n=6)
    obs.append(hs.build("ph_band", [M["headset"]]))
    cups = Family("PCups", 0.004)
    for sy in (-1, 1):
        cups.ellipsoid((c[0] + 0.008, sy * 0.093, c[2] - 0.012), 0.042, (1.0, 0.5, 1.15))
    obs.append(cups.mesh("ph_cups", 500, M["headset"]))
    pads = Family("PPads", 0.003)
    pads.ball((c[0] - 0.112, 0.02, c[2] - 0.064), 0.011)
    obs.append(pads.mesh("ph_micpad", 120, M["headsetpad"]))
    join("Proto_PilotHead", obs, parent, col)
    # arms: short sleeves, forearms and hands forward on the yoke / side stick
    for sy, L in ((1, "L"), (-1, "R")):
        sh = np.array(PILOT_PIVOTS["shoulder" + L])
        el = np.array([-0.07, sy * 0.21, 0.84])
        wr = np.array([-0.33, sy * 0.19, 0.87])
        sl = Family("PSleeve" + L, 0.005)
        sl.ball(sh + np.array([0.0, -sy * 0.008, -0.02]), 0.052)
        sl.limb(sh + np.array([0, 0, -0.035]), sh + (el - sh) * 0.55, 0.047, 0.044)
        arm = Family("PArm" + L, 0.005)
        arm.limb(sh + (el - sh) * 0.5, el, 0.038, 0.037)
        arm.limb(el, wr, 0.037, 0.03)
        hand = Family("PHand" + L, 0.0035)
        hand.limb(wr, wr + np.array([-0.03, 0, -0.004]), 0.025, 0.027)
        hand.ellipsoid(tuple(wr + np.array([-0.06, 0, -0.008])), 0.042, (1.0, 0.7, 0.62))      # fist round the grip
        hand.limb(tuple(wr + np.array([-0.04, -sy * 0.03, 0.0])), tuple(wr + np.array([-0.075, -sy * 0.028, 0.01])), 0.011, 0.009, n=4)   # thumb
        join("Proto_PilotArm" + L, [sl.mesh("psl" + L, 500, M["pilotshirt"]), arm.mesh("pa" + L, 600, M["skin"]),
                                    hand.mesh("phd" + L, 500, M["skin"])], parent, col)
