"""
Shared helpers for the procedural Blender (bpy) builders.

All geometry in this project is generated from numbers (dimensions researched
from public Boeing / airline data, see ../docs/SPECS.md), so every mesh is built
from numpy arrays and pushed into Blender with foreach_set for speed.
"""
import math
import os

import bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, "textures")
OUT_DIR = os.path.join(HERE, "output")
WEB_ASSETS = os.path.join(ROOT, "web", "assets")
for _d in (TEX_DIR, OUT_DIR, WEB_ASSETS):
    os.makedirs(_d, exist_ok=True)


# --------------------------------------------------------------------------
# Scene helpers
# --------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def collection(name, parent=None):
    col = bpy.data.collections.get(name)
    if col is None:
        col = bpy.data.collections.new(name)
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def empty(name, loc=(0, 0, 0), parent=None, col=None, rot=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.5
    ob.location = loc
    if rot is not None:
        ob.rotation_mode = "QUATERNION"
        ob.rotation_quaternion = rot
    (col or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        set_parent(ob, parent)
    return ob


def set_parent(child, parent):
    """Parent while keeping the child's world transform."""
    bpy.context.view_layer.update()
    mw = child.matrix_world.copy()
    child.parent = parent
    child.matrix_parent_inverse.identity()
    child.matrix_world = mw


# --------------------------------------------------------------------------
# Mesh construction
# --------------------------------------------------------------------------
def mesh_object(name, verts, faces, uvs=None, col=None, smooth=True,
                material=None, loop_uvs=None, sharp_all=False):
    """Create an object from numpy verts (N,3), list/array of faces.

    faces: (F,4) or (F,3) int array or list of tuples (mixed sizes allowed)
    uvs: per-vertex UV (N,2)  or  loop_uvs: per-loop UV array matching faces
    """
    me = bpy.data.meshes.new(name)
    verts = np.asarray(verts, dtype=np.float64)
    if isinstance(faces, np.ndarray):
        flist = faces.tolist()
    else:
        flist = [list(f) for f in faces]
    me.vertices.add(len(verts))
    me.vertices.foreach_set("co", verts.astype(np.float32).ravel())
    nloops = sum(len(f) for f in flist)
    me.loops.add(nloops)
    me.polygons.add(len(flist))
    loop_vi = np.fromiter((i for f in flist for i in f), dtype=np.int32, count=nloops)
    sizes = np.fromiter((len(f) for f in flist), dtype=np.int32, count=len(flist))
    starts = np.zeros(len(flist), dtype=np.int32)
    if len(flist):
        starts[1:] = np.cumsum(sizes)[:-1]
    me.loops.foreach_set("vertex_index", loop_vi)
    me.polygons.foreach_set("loop_start", starts)
    try:
        me.polygons.foreach_set("loop_total", sizes)
    except (AttributeError, TypeError, RuntimeError):
        pass  # Blender 4+ derives totals from loop_start
    if uvs is not None or loop_uvs is not None:
        uvl = me.uv_layers.new(name="UVMap")
        if loop_uvs is None:
            loop_uvs = np.asarray(uvs, dtype=np.float32)[loop_vi]
        uvl.data.foreach_set("uv", np.asarray(loop_uvs, dtype=np.float32).ravel())
    me.update(calc_edges=True)
    me.validate(clean_customdata=False)
    me.polygons.foreach_set("use_smooth", np.full(len(flist), bool(smooth and not sharp_all)))
    ob = bpy.data.objects.new(name, me)
    (col or bpy.context.scene.collection).objects.link(ob)
    if material is not None:
        me.materials.append(material)
    return ob


def grid_faces(nu, nv, wrap_u=False, wrap_v=False, offset=0, flip=False):
    """Quad faces for a (nu, nv) grid of vertices stored row-major (u major)."""
    iu = np.arange(nu if wrap_u else nu - 1)
    iv = np.arange(nv if wrap_v else nv - 1)
    U, V = np.meshgrid(iu, iv, indexing="ij")
    U = U.ravel(); V = V.ravel()
    U1 = (U + 1) % nu
    V1 = (V + 1) % nv
    a = U * nv + V
    b = U1 * nv + V
    c = U1 * nv + V1
    d = U * nv + V1
    f = np.stack([a, b, c, d], axis=1) + offset
    if flip:
        f = f[:, ::-1]
    return f


def grid_object(name, P, UV=None, col=None, material=None, flip=False,
                wrap_u=False, wrap_v=False, smooth=True):
    """Loft object from a (nu, nv, 3) point grid."""
    nu, nv, _ = P.shape
    verts = P.reshape(-1, 3)
    faces = grid_faces(nu, nv, wrap_u, wrap_v, flip=flip)
    uvs = None if UV is None else UV.reshape(-1, 2)
    return mesh_object(name, verts, faces, uvs=uvs, col=col, material=material, smooth=smooth)


class MeshBuilder:
    """Accumulates grids / polygons into one object (one draw call per material).

    Every vertex carries an explicit normal; face winding is fixed afterwards
    so that it agrees with those normals.  With transform=to_blender the
    builder accepts design coordinates (s, y, z) and converts on build().
    """

    def __init__(self, transform=None):
        self.verts, self.faces, self.uvs, self.norms = [], [], [], []
        self.mats, self.smooth = [], []
        self.n = 0
        self.transform = transform

    # -- normals ---------------------------------------------------------
    @staticmethod
    def grid_normals(P, wrap_v=False, wrap_u=False):
        if wrap_v:
            Q = P[:, :-1]
            dv = (np.roll(Q, -1, axis=1) - np.roll(Q, 1, axis=1))
            dv = np.concatenate([dv, dv[:, :1]], axis=1)
        else:
            dv = np.gradient(P, axis=1)
        if wrap_u:
            Q = P[:-1]
            du = (np.roll(Q, -1, axis=0) - np.roll(Q, 1, axis=0))
            du = np.concatenate([du, du[:1]], axis=0)
        else:
            du = np.gradient(P, axis=0) if P.shape[0] > 1 else np.zeros_like(P)
        N = np.cross(du, dv)
        ln = np.linalg.norm(N, axis=-1, keepdims=True)
        bad = ln[..., 0] < 1e-12
        N = N / np.maximum(ln, 1e-12)
        return N, bad

    def add_grid(self, P, UV=None, N=None, outward=None, wrap_v=False, wrap_u=False,
                 mat=0, smooth=True, fallback=None):
        """outward: None, 'centroid', (x,y,z) point, or ('dir', vec)."""
        P = np.asarray(P, dtype=np.float64)
        nu, nv, _ = P.shape
        if N is None:
            N, bad = self.grid_normals(P, wrap_v, wrap_u)
            if fallback is not None and bad.any():
                N[bad] = fallback
        N = np.asarray(N, dtype=np.float64)
        if outward is not None:
            if isinstance(outward, str) and outward == "centroid":
                ref = P.reshape(-1, 3).mean(0)
                d = P - ref
            elif isinstance(outward, tuple) and outward and outward[0] == "dir":
                d = np.broadcast_to(np.asarray(outward[1], dtype=np.float64), P.shape)
            else:
                d = P - np.asarray(outward, dtype=np.float64)
            if np.sum(N * d) < 0:
                N = -N
        if UV is None:
            UV = np.zeros((nu, nv, 2))
        self.verts.append(P.reshape(-1, 3))
        self.uvs.append(np.asarray(UV).reshape(-1, 2))
        self.norms.append(N.reshape(-1, 3))
        f = grid_faces(nu, nv, False, False, offset=self.n)
        self.faces.extend(f.tolist())
        self.mats.extend([mat] * len(f))
        self.smooth.extend([smooth] * len(f))
        self.n += nu * nv

    def add_poly(self, pts, uvs=None, mat=0, normal=None, outward=None):
        pts = np.asarray(pts, dtype=np.float64)
        k = len(pts)
        c = pts.mean(0)
        nrm = np.zeros(3)
        for i in range(k):
            a, b = pts[i] - c, pts[(i + 1) % k] - c
            nrm += np.cross(a, b)
        if normal is not None:
            nrm = np.asarray(normal, dtype=np.float64)
        ln = np.linalg.norm(nrm)
        nrm = nrm / ln if ln > 1e-12 else np.array([0, 0, 1.0])
        if outward is not None:
            d = (c - np.asarray(outward)) if not (isinstance(outward, tuple) and outward[0] == "dir") else np.asarray(outward[1])
            if np.dot(nrm, d) < 0:
                nrm = -nrm
        self.verts.append(pts)
        self.uvs.append(np.zeros((k, 2)) if uvs is None else np.asarray(uvs, dtype=np.float64))
        self.norms.append(np.tile(nrm, (k, 1)))
        self.faces.append(list(range(self.n, self.n + k)))
        self.mats.append(mat)
        self.smooth.append(False)
        self.n += k

    def add_mesh(self, verts, faces, uvs=None, mat=0, normals=None, smooth=True):
        verts = np.asarray(verts, dtype=np.float64)
        if normals is None:
            normals = np.zeros_like(verts)
            for f in faces:
                p = verts[list(f)]
                c = p.mean(0)
                fn = np.zeros(3)
                for i in range(len(f)):
                    fn += np.cross(p[i] - c, p[(i + 1) % len(f)] - c)
                for i in f:
                    normals[i] += fn
            normals /= np.maximum(np.linalg.norm(normals, axis=1, keepdims=True), 1e-12)
        self.verts.append(verts)
        self.uvs.append(np.zeros((len(verts), 2)) if uvs is None else np.asarray(uvs))
        self.norms.append(np.asarray(normals, dtype=np.float64))
        for f in faces:
            self.faces.append([i + self.n for i in f])
            self.mats.append(mat)
            self.smooth.append(smooth)
        self.n += len(verts)

    def add_box(self, center, size, mat=0, uv_scale=1.0, rot_z=0.0):
        cx, cy, cz = center
        sx, sy, sz = (s / 2 for s in size)
        c, s = math.cos(rot_z), math.sin(rot_z)

        def T(x, y, z):
            return (cx + x * c - y * s, cy + x * s + y * c, cz + z)
        quads = [
            ([(-sx, -sy, -sz), (-sx, sy, -sz), (sx, sy, -sz), (sx, -sy, -sz)], (0, 0, -1)),
            ([(-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)], (0, 0, 1)),
            ([(-sx, -sy, -sz), (sx, -sy, -sz), (sx, -sy, sz), (-sx, -sy, sz)], (0, -1, 0)),
            ([(sx, sy, -sz), (-sx, sy, -sz), (-sx, sy, sz), (sx, sy, sz)], (0, 1, 0)),
            ([(-sx, sy, -sz), (-sx, -sy, -sz), (-sx, -sy, sz), (-sx, sy, sz)], (-1, 0, 0)),
            ([(sx, -sy, -sz), (sx, sy, -sz), (sx, sy, sz), (sx, -sy, sz)], (1, 0, 0)),
        ]
        dims = [(2 * sx, 2 * sy), (2 * sx, 2 * sy), (2 * sx, 2 * sz), (2 * sx, 2 * sz),
                (2 * sy, 2 * sz), (2 * sy, 2 * sz)]
        for (q, nrm), (du, dv) in zip(quads, dims):
            pts = [T(*p) for p in q]
            nx, ny, nz = nrm
            nrm_r = (nx * c - ny * s, nx * s + ny * c, nz)
            uv = [(0, 0), (du * uv_scale, 0), (du * uv_scale, dv * uv_scale), (0, dv * uv_scale)]
            self.add_poly(pts, uv, mat=mat, normal=nrm_r)

    # -- build -----------------------------------------------------------
    def build(self, name, materials, col=None, matrix=None):
        """matrix: optional 4x4 (numpy) applied AFTER transform; the object is
        placed at inverse(matrix) so geometry stays where it was (pivots)."""
        if not self.verts:
            return None
        V = np.concatenate(self.verts)
        N = np.concatenate(self.norms)
        UV = np.concatenate(self.uvs)
        if self.transform is not None:
            V = self.transform(V)
            # to_blender style reflections: transform normals by finite difference
            N = self.transform(V * 0 + N) - self.transform(V * 0)
        if matrix is not None:
            M = np.asarray(matrix, dtype=np.float64)
            Mi = np.linalg.inv(M)
            V = (np.c_[V, np.ones(len(V))] @ Mi.T)[:, :3]
            N = N @ M[:3, :3]   # inverse-transpose of Mi's 3x3 for rotation+translation
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        # fix winding so face normal agrees with the mean supplied normal
        faces = list(self.faces)
        sizes = np.fromiter((len(f) for f in faces), dtype=np.int32, count=len(faces))
        for k in np.unique(sizes):
            idx = np.where(sizes == k)[0]
            F = np.array([faces[i] for i in idx], dtype=np.int64)       # (n, k)
            p = V[F]
            c = p.mean(1, keepdims=True)
            q = p - c
            fn = np.cross(q, np.roll(q, -1, axis=1)).sum(1)
            ns = N[F].sum(1)
            flip = np.einsum("ij,ij->i", fn, ns) < 0
            for i in idx[flip]:
                faces[i] = faces[i][::-1]
        loop_vi = [i for f in faces for i in f]
        ob = mesh_object(name, V, faces, loop_uvs=UV[loop_vi], col=col, smooth=True)
        me = ob.data
        for m in materials:
            me.materials.append(m)
        me.polygons.foreach_set("material_index", np.array(self.mats, dtype=np.int32))
        me.polygons.foreach_set("use_smooth", np.array(self.smooth, dtype=bool))
        me.update()
        try:
            me.normals_split_custom_set_from_vertices([tuple(n) for n in N])
        except Exception as e:  # pragma: no cover
            print("custom normals failed", name, e)
        if matrix is not None:
            from mathutils import Matrix
            ob.matrix_world = Matrix(np.asarray(matrix).tolist())
        return ob


def revolve(profile, n=64, axis="x", center=(0, 0, 0), start=0.0, end=2 * math.pi,
            v_scale=1.0):
    """Revolve a 2D profile [(axial, radius), ...] around an axis.

    Returns (P grid (len(profile), n+1, 3), UV grid).
    """
    prof = np.asarray(profile, dtype=np.float64)
    ang = np.linspace(start, end, n + 1)
    a = prof[:, 0][:, None]
    r = prof[:, 1][:, None]
    ca = np.cos(ang)[None, :]
    sa = np.sin(ang)[None, :]
    cx, cy, cz = center
    if axis == "x":
        P = np.stack([cx + a + 0 * ca, cy + r * sa, cz + r * ca], axis=-1)
    elif axis == "y":
        P = np.stack([cx + r * sa, cy + a + 0 * ca, cz + r * ca], axis=-1)
    else:
        P = np.stack([cx + r * ca, cy + r * sa, cz + a + 0 * ca], axis=-1)
    # UV: u along profile arc length, v around
    seg = np.r_[0, np.cumsum(np.hypot(np.diff(prof[:, 0]), np.diff(prof[:, 1])))]
    U = np.repeat((seg / max(seg[-1], 1e-9))[:, None], n + 1, axis=1)
    Vv = np.repeat((ang / (2 * math.pi) * v_scale)[None, :], len(prof), axis=0)
    UV = np.stack([Vv, U], axis=-1)
    return P, UV


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=np.float64) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def ellip(t, n=2.0):
    """Quarter super-ellipse: 0 at t=0, 1 at t>=1, vertical tangent at t=0."""
    t = np.clip(np.asarray(t, dtype=np.float64), 0.0, 1.0)
    return (1.0 - (1.0 - t) ** n) ** (1.0 / n)


# --------------------------------------------------------------------------
# Materials (Principled BSDF only -> clean glTF export)
# --------------------------------------------------------------------------
def load_image(path, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def pbr_material(name, color=(0.8, 0.8, 0.8, 1.0), metallic=0.0, roughness=0.5,
                 base_tex=None, orm_tex=None, normal_tex=None, emissive_tex=None,
                 emission=None, emission_strength=1.0, alpha=1.0, normal_strength=1.0,
                 double_sided=False, blend=False, transmission=0.0, ior=1.45,
                 clearcoat=0.0, alpha_from_tex=False):
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if clearcoat:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = 0.05
    if transmission:
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["IOR"].default_value = ior
    x = -700
    if base_tex:
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = load_image(base_tex, "sRGB")
        tn.location = (x, 300)
        links.new(tn.outputs["Color"], bsdf.inputs["Base Color"])
        if alpha_from_tex:
            links.new(tn.outputs["Alpha"], bsdf.inputs["Alpha"])
            try:
                mat.surface_render_method = "DITHERED"
            except AttributeError:
                mat.blend_method = "CLIP"
    if orm_tex:
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = load_image(orm_tex, "Non-Color")
        tn.location = (x, 0)
        sep = nodes.new("ShaderNodeSeparateColor")
        sep.location = (x + 300, 0)
        links.new(tn.outputs["Color"], sep.inputs["Color"])
        links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal_tex:
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = load_image(normal_tex, "Non-Color")
        tn.location = (x, -300)
        nm = nodes.new("ShaderNodeNormalMap")
        nm.location = (x + 300, -300)
        nm.inputs["Strength"].default_value = normal_strength
        links.new(tn.outputs["Color"], nm.inputs["Color"])
        links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if emissive_tex:
        tn = nodes.new("ShaderNodeTexImage")
        tn.image = load_image(emissive_tex, "sRGB")
        tn.location = (x, -600)
        links.new(tn.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    elif emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0 or blend:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            mat.surface_render_method = "BLENDED"
        except AttributeError:
            mat.blend_method = "BLEND"
    mat.use_backface_culling = not double_sided
    return mat


def hex_color(h, a=1.0):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4))

    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (lin(r), lin(g), lin(b), a)


# --------------------------------------------------------------------------
# Export
# --------------------------------------------------------------------------
def export_glb(path, selected_only=False, draco=False, instancing=False):
    kwargs = dict(
        filepath=path,
        export_format="GLB",
        use_selection=selected_only,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )
    if instancing:
        kwargs["export_gpu_instances"] = True
    if draco:
        kwargs.update(export_draco_mesh_compression_enable=True,
                      export_draco_mesh_compression_level=6,
                      export_draco_position_quantization=14,
                      export_draco_normal_quantization=10,
                      export_draco_texcoord_quantization=12)
    bpy.ops.export_scene.gltf(**kwargs)
    print("exported", path, os.path.getsize(path) // 1024, "KiB")


def save_blend(path):
    bpy.ops.wm.save_as_mainfile(filepath=path, compress=True)
    print("saved", path, os.path.getsize(path) // 1024, "KiB")
