"""
Front-face livery painter.

The cab front is one curved surface with a front-projected UV map
(u = across, v = up). Its look - windscreen mask, FRP surround, bands,
light panels, seams, logos backgrounds - is painted into a texture from a
vector description in millimetres (front view: y = viewer's right, z = height
above rail), using signed distance fields so every edge is anti-aliased.

Three images are produced per series:
  <key>_front_col  base colour (sRGB)
  <key>_front_mr   glTF metallic-roughness (G = roughness, B = metalness)
They are wired into a Principled BSDF the way the glTF exporter expects.
"""

import math
import numpy as np
import bpy

# texture frame in metres (front view)
U0, U1 = -1.60, 1.60
V0, V1 = 0.20, 4.20
RES_U, RES_V = 1600, 2000     # 2 mm per pixel


def uv_of(y, z):
    return ((y - U0) / (U1 - U0), (z - V0) / (V1 - V0))


def srgb(hexstr):
    h = hexstr.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


class Painter:
    def __init__(self, base="#c8cacc", rough=0.35, metal=0.85):
        ys = (np.arange(RES_U, dtype=np.float32) + 0.5) / RES_U * (U1 - U0) + U0
        zs = (np.arange(RES_V, dtype=np.float32) + 0.5) / RES_V * (V1 - V0) + V0
        self.Y, self.Z = np.meshgrid(ys, zs)          # row 0 = bottom (Blender image order)
        self.px = (U1 - U0) / RES_U
        self.col = np.empty((RES_V, RES_U, 3), np.float32)
        self.col[:] = srgb(base)
        self.rough = np.full((RES_V, RES_U), rough, np.float32)
        self.metal = np.full((RES_V, RES_U), metal, np.float32)

    # ---- signed distance fields (metres) ---------------------------------
    def sd_rrect(self, y0, y1, z0, z1, r=0.0):
        cy, cz = (y0 + y1) / 2, (z0 + z1) / 2
        hy, hz = abs(y1 - y0) / 2, abs(z1 - z0) / 2
        r = min(r, hy, hz)
        qy = np.abs(self.Y - cy) - (hy - r)
        qz = np.abs(self.Z - cz) - (hz - r)
        out = np.sqrt(np.maximum(qy, 0) ** 2 + np.maximum(qz, 0) ** 2)
        return out + np.minimum(np.maximum(qy, qz), 0) - r

    def sd_poly(self, pts):
        """exact SDF of a simple polygon [(y, z), ...] (Inigo Quilez)"""
        P = np.asarray(pts, np.float32)
        n = len(P)
        Y, Z = self.Y, self.Z
        d = (Y - P[0, 0]) ** 2 + (Z - P[0, 1]) ** 2
        s = np.ones_like(Y)
        j = n - 1
        for i in range(n):
            ey, ez = P[j, 0] - P[i, 0], P[j, 1] - P[i, 1]
            wy, wz = Y - P[i, 0], Z - P[i, 1]
            t = np.clip((wy * ey + wz * ez) / max(1e-12, ey * ey + ez * ez), 0, 1)
            by, bz = wy - ey * t, wz - ez * t
            d = np.minimum(d, by * by + bz * bz)
            c1 = Z >= P[i, 1]
            c2 = Z < P[j, 1]
            c3 = ey * wz > ez * wy
            flip = (c1 & c2 & c3) | (~c1 & ~c2 & ~c3)
            s = np.where(flip, -s, s)
            j = i
        return s * np.sqrt(d)

    def sd_band(self, z0, z1):
        return np.maximum(z0 - self.Z, self.Z - z1)

    def sd_circle(self, cy, cz, r):
        return np.sqrt((self.Y - cy) ** 2 + (self.Z - cz) ** 2) - r

    def sd_seg(self, a, b, w):
        ay, az = a
        by, bz = b
        ey, ez = by - ay, bz - az
        t = np.clip(((self.Y - ay) * ey + (self.Z - az) * ez) / max(1e-12, ey * ey + ez * ez), 0, 1)
        return np.sqrt((self.Y - ay - ey * t) ** 2 + (self.Z - az - ez * t) ** 2) - w / 2

    # ---- compositing -------------------------------------------------------
    def cover(self, sd, feather=1.0):
        return np.clip(0.5 - sd / (self.px * feather), 0, 1)

    def fill(self, sd, color, rough=None, metal=None, alpha=1.0, feather=1.0):
        a = self.cover(sd, feather) * alpha
        c = srgb(color) if isinstance(color, str) else np.asarray(color, np.float32)
        self.col = self.col * (1 - a[..., None]) + c * a[..., None]
        if rough is not None:
            self.rough = self.rough * (1 - a) + rough * a
        if metal is not None:
            self.metal = self.metal * (1 - a) + metal * a
        return a

    def outline(self, sd, width, color, rough=None, metal=None, alpha=1.0):
        """stroke along the zero contour of an SDF (panel seams, rubber gaskets)"""
        return self.fill(np.abs(sd) - width / 2, color, rough, metal, alpha)

    def shade(self, sd, inner_width, amount):
        """darken just inside a shape's edge (a cheap recess / ambient occlusion)"""
        inside = np.clip(-sd / inner_width, 0, 1)
        k = (1 - inside) * (sd < 0)
        self.col *= (1 - amount * k)[..., None]

    def grime(self, z_top=1.25, amount=0.25):
        g = np.clip((z_top - self.Z) / 0.5, 0, 1) * amount
        rnd = np.random.default_rng(3).random(self.Z.shape[1]).astype(np.float32)
        streak = np.convolve(rnd, np.ones(9) / 9, mode="same")[None, :]
        g = g * (0.7 + 0.6 * streak)
        self.col *= (1 - g)[..., None]
        self.rough = np.clip(self.rough + g * 0.4, 0, 1)

    # ---- output ---------------------------------------------------------------
    def images(self, key):
        col = np.clip(self.col, 0, 1)
        rgba = np.concatenate([col, np.ones((RES_V, RES_U, 1), np.float32)], axis=2)
        mr = np.stack([np.ones_like(self.rough), np.clip(self.rough, 0.02, 1), np.clip(self.metal, 0, 1), np.ones_like(self.rough)], axis=2)
        out = []
        for name, arr, cs in ((f"{key}_front_col", rgba, "sRGB"), (f"{key}_front_mr", mr, "Non-Color")):
            if name in bpy.data.images:
                bpy.data.images.remove(bpy.data.images[name])
            im = bpy.data.images.new(name, RES_U, RES_V, alpha=False)
            im.colorspace_settings.name = cs
            im.pixels.foreach_set(arr.astype(np.float32).ravel())
            im.file_format = "PNG"
            im.pack()
            out.append(im)
        return out


def front_material(key, painter):
    """Principled material using the painted maps (glTF exporter friendly)."""
    col_im, mr_im = painter.images(key)
    m = bpy.data.materials.new(f"FRONT_{key}")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexImage")
    tc.image = col_im
    nt.links.new(tc.outputs["Color"], b.inputs["Base Color"])
    tm = nt.nodes.new("ShaderNodeTexImage")
    tm.image = mr_im
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    nt.links.new(tm.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], b.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], b.inputs["Metallic"])
    return m
