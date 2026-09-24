"""
787-9 flight deck detail (Blender).

Every panel is a TexPanel: a flat face with generated artwork (panel grey, engraved section
borders, white labels, knob scales, LCD windows) and a matching emission map of the
back-lit legends (integral panel lighting, driven at night by the simulator).  The 3-D
controls are placed on exactly the same (u, v) as their artwork: knobs, toggle and guarded
switches, fire handles and pushbutton caps whose top faces are UV-mapped onto the art so
the legends ("FAULT / OFF", "PRESS", "ON BAT") appear on the buttons themselves.

Panels: overhead (ELEC, HYD, FUEL, ANTI-ICE, AIR, PRESS, FIRE, LIGHTS, WIPERS ...), the MCP
(its face is a live canvas in the simulator: speed / heading / V/S / altitude windows and
the mode lights come from the autoflight), EFIS/DSP panels with master WARNING / CAUTION,
main instrument panel (display bezels, standby instrument, clocks, landing gear, autobrake),
forward pedestal (two CDUs with lettered keys), aft pedestal (flap / speedbrake gates, fuel
control switches, radio, transponder, weather radar, trims, audio panels), side consoles
(tillers, oxygen masks, EFBs, headsets), crew seats, sidewall air outlets, dome / storm
lights, circuit-breaker panels and the flight-deck door on the rear bulkhead.

Design frame: s aft, y left, z up.  Local panel frames: P = O + u*U + v*V + h*N, with U the
viewer's right and V the viewer's up, so the artwork reads correctly.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import b787_geometry as G
import common as C

TB = G.to_blender
HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "textures")
DZ = -0.30                      # flight-deck floor offset used by build_cockpit
RNG = np.random.default_rng(787)
FONT_B = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
FONT_R = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
FONT_M = "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf"
_FC = {}


def font(path, px):
    k = (path, int(px))
    if k not in _FC:
        _FC[k] = ImageFont.truetype(path, max(6, int(px)))
    return _FC[k]


# display layout (shared with build_b787.build_cockpit)
DISP_ZC = 0.61 + DZ
MCP_S, MCP_Z0, MCP_Z1, MCP_HW = 3.68, 0.66, 0.79, 0.675


def nrm(v):
    v = np.asarray(v, dtype=np.float64)
    return v / np.linalg.norm(v)


class Frame:
    """Local panel frame."""
    def __init__(self, O, U, V):
        self.O = np.asarray(O, dtype=np.float64)
        self.U = nrm(U)
        V = np.asarray(V, dtype=np.float64)
        V = V - self.U * np.dot(V, self.U)
        self.V = nrm(V)
        self.N = nrm(np.cross(self.U, self.V))

    def p(self, u, v, h=0.0):
        return self.O + u * self.U + v * self.V + h * self.N

    def face(self, towards):
        """Make N point towards a design-space direction."""
        if np.dot(self.N, towards) < 0:
            self.N = -self.N
        return self


# --------------------------------------------------------------------------- primitives
def quad(mb, F, u0, v0, u1, v1, h, mat, uv=None):
    pts = [F.p(u0, v0, h), F.p(u1, v0, h), F.p(u1, v1, h), F.p(u0, v1, h)]
    mb.add_poly(pts, uvs=uv, mat=mat, normal=F.N)


def slab(mb, F, u0, v0, u1, v1, h0, h1, mat, top_uv=None, top_mat=None):
    """Box aligned with the frame (face at h1).  top_uv: UVs of the face (textured cap)."""
    c = [F.p(u0, v0, h0), F.p(u1, v0, h0), F.p(u1, v1, h0), F.p(u0, v1, h0),
         F.p(u0, v0, h1), F.p(u1, v0, h1), F.p(u1, v1, h1), F.p(u0, v1, h1)]
    faces = [(4, 5, 6, 7, F.N), (0, 3, 2, 1, -F.N), (0, 1, 5, 4, -F.V), (2, 3, 7, 6, F.V),
             (1, 2, 6, 5, F.U), (3, 0, 4, 7, -F.U)]
    for i, (a, b, cc, d, n) in enumerate(faces):
        if i == 0 and top_uv is not None:
            mb.add_poly([c[a], c[b], c[cc], c[d]], uvs=top_uv, mat=top_mat if top_mat is not None else mat, normal=n)
        else:
            mb.add_poly([c[a], c[b], c[cc], c[d]], mat=mat, normal=n)


def cyl_f(mb, F, u, v, h0, h1, r, mat, n=12, cap=True, r1=None):
    """Cylinder along the frame normal."""
    r1 = r if r1 is None else r1
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * F.U + np.sin(th)[:, None] * F.V
    b0 = F.p(u, v, h0)
    b1 = F.p(u, v, h1)
    P = np.stack([b0 + r * ring, b1 + r1 * ring], 0)
    mb.add_grid(P, N=np.stack([ring, ring], 0), mat=mat)
    if cap:
        mb.add_poly(b1 + r1 * ring[:-1], mat=mat, normal=F.N)


def cyl_pts(mb, p0, p1, r, mat, n=10, caps=True):
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    ax = nrm(p1 - p0)
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = nrm(np.cross(ax, tmp))
    v = np.cross(ax, u)
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * u + np.sin(th)[:, None] * v
    mb.add_grid(np.stack([p0 + r * ring, p1 + r * ring], 0), N=np.stack([ring, ring], 0), mat=mat)
    if caps:
        mb.add_poly(p1 + r * ring[:-1], mat=mat, outward=("dir", ax))
        mb.add_poly((p0 + r * ring[:-1])[::-1], mat=mat, outward=("dir", -ax))


def tube(mb, pts, r, mat, n=8):
    """Swept circular tube through a polyline."""
    pts = np.asarray(pts, dtype=np.float64)
    rings, norms = [], []
    th = np.linspace(0, 2 * math.pi, n + 1)
    prev = None
    for i, p in enumerate(pts):
        t = pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]
        t = nrm(t)
        ref = prev if prev is not None else (np.array([0, 0, 1.0]) if abs(t[2]) < 0.9 else np.array([1.0, 0, 0]))
        u = nrm(np.cross(t, ref))
        v = np.cross(t, u)
        prev = v
        ring = np.cos(th)[:, None] * u + np.sin(th)[:, None] * v
        rings.append(p + r * ring)
        norms.append(ring)
    mb.add_grid(np.stack(rings), N=np.stack(norms), mat=mat)


def sbox(mb, c, half, mat, e=0.3, n=(6, 12), R=None):
    """Rounded box (superellipsoid) with optional rotation matrix (columns = local axes)."""
    nu, nv = n
    u = np.linspace(-math.pi / 2, math.pi / 2, nu + 1)
    v = np.linspace(-math.pi, math.pi, nv + 1)
    U, V = np.meshgrid(u, v, indexing="ij")
    sp = lambda w, e_: np.sign(w) * np.abs(w) ** e_  # noqa: E731
    a, b, cz = half
    P = np.stack([a * sp(np.cos(U), e) * sp(np.cos(V), e), b * sp(np.cos(U), e) * sp(np.sin(V), e),
                  cz * sp(np.sin(U), e)], -1)
    if R is not None:
        P = P @ np.asarray(R).T
    P = P + np.asarray(c, dtype=np.float64)
    mb.add_grid(P, mat=mat, wrap_v=True, outward=tuple(np.asarray(c, dtype=np.float64)), fallback=(0, 0, 1))


def rot_s(deg):
    """Rotation about the lateral (y) axis: tilts a local +z towards +s."""
    a = math.radians(deg)
    return np.array([[math.cos(a), 0, math.sin(a)], [0, 1, 0], [-math.sin(a), 0, math.cos(a)]])


# --------------------------------------------------------------------------- materials
class Mats:
    """Material registry: index lookup by key, panel materials appended on demand."""
    def __init__(self, tex):
        P = C.pbr_material
        h = C.hex_color
        self.tex = tex
        self.list, self.idx = [], {}
        base = [
            ("panel", P("Cockpit_PanelGrey", color=h("#474c52"), roughness=0.75)),
            ("dark", P("Cockpit_PanelDark", color=h("#1c1f23"), roughness=0.7)),
            ("knob", P("Cockpit_KnobBlack", color=h("#0e0f11"), roughness=0.42)),
            ("metal", P("Cockpit_SwitchMetal", color=h("#c3c8cd"), roughness=0.22, metallic=0.9)),
            ("label", P("Cockpit_Label", color=h("#d8d8cf"), roughness=0.6, emission=h("#fff4dc"), emission_strength=0.0)),
            ("amber", P("Cockpit_AnnunAmber", color=h("#3a2a08"), roughness=0.3, emission=h("#ffb21e"), emission_strength=2.5)),
            ("white", P("Cockpit_AnnunWhite", color=h("#2a2a2a"), roughness=0.3, emission=h("#f2f4ff"), emission_strength=2.0)),
            ("key", P("Cockpit_Keycap", color=h("#2b2e33"), roughness=0.55)),
            ("screen", P("Cockpit_CDU", color=h("#050607"), roughness=0.2, base_tex=tex("cdu_screen.jpg"),
                         emissive_tex=tex("cdu_screen.jpg"), emission_strength=1.4)),
            ("red", P("Cockpit_WarnRed", color=h("#3a0808"), roughness=0.3, emission=h("#ff2a1e"), emission_strength=1.5)),
            ("guard", P("Cockpit_Guard", color=h("#b01c24"), roughness=0.35)),
            ("seat", P("Cockpit_SeatLeather", color=h("#2a2b2e"), roughness=0.55)),
            ("fleece", P("Cockpit_Fleece", color=h("#9a8d7b"), roughness=1.0)),
            ("blue", P("Cockpit_AnnunBlue", color=h("#0a1a2a"), roughness=0.3, emission=h("#4fb4ff"), emission_strength=2.0)),
            ("green", P("Cockpit_AnnunGreen", color=h("#0a2a12"), roughness=0.3, emission=h("#3cff78"), emission_strength=1.8)),
            ("efb", P("Cockpit_EFB", color=h("#0c0d10"), roughness=0.15, base_tex=tex("efb_screen.jpg"),
                      emissive_tex=tex("efb_screen.jpg"), emission_strength=1.1)),
            ("lining", P("Cockpit_Lining", color=h("#a9aeb2"), roughness=0.85)),
            ("carpet", P("Cockpit_Carpet", color=h("#2a2d33"), roughness=1.0)),
            ("rubber", P("Cockpit_Rubber", color=h("#121314"), roughness=0.9)),
            ("firered", P("Cockpit_FireHandle", color=h("#8f1418"), roughness=0.35)),
            ("yellow", P("Cockpit_Yellow", color=h("#e0b020"), roughness=0.45)),
            ("chrome", P("Cockpit_Chrome", color=h("#e4e8ec"), roughness=0.08, metallic=1.0)),
            ("dome", P("Cockpit_DomeLight", color=h("#d8d8d0"), roughness=0.3, emission=h("#fff2d8"), emission_strength=0.0)),
            ("visor", P("Cockpit_Visor", color=h("#16301f"), roughness=0.05, alpha=0.55, blend=True, double_sided=True)),
            ("mcp", P("Display_MCP", color=h("#3c4046"), roughness=0.6)),
            ("isfd", P("Cockpit_ISFD", color=h("#050607"), roughness=0.15, base_tex=tex("isfd.jpg"),
                       emissive_tex=tex("isfd.jpg"), emission_strength=1.2)),
            ("clock", P("Cockpit_Clock", color=h("#050607"), roughness=0.15, base_tex=tex("clock.jpg"),
                        emissive_tex=tex("clock.jpg"), emission_strength=0.9)),
        ]
        for k, m in base:
            self.add(k, m)

    def add(self, key, m):
        self.idx[key] = len(self.list)
        self.list.append(m)
        return self.idx[key]

    def __getitem__(self, k):
        return self.idx[k]


M = None   # set in build_cockpit_detail


# --------------------------------------------------------------------------- textured panels
PANEL_BG = (74, 79, 85)
LABEL = (236, 236, 228)
LEGEND_EM = (255, 244, 220)
DIM = (120, 120, 116)


class TexPanel:
    """Flat panel with generated artwork.  (u, v) in metres on the frame."""
    def __init__(self, name, F, u0, v0, u1, v1, ppm=2200, bg=PANEL_BG, h0=0.0):
        self.name, self.F, self.h0 = name, F, h0
        self.u0, self.v0, self.u1, self.v1 = u0, v0, u1, v1
        self.ppm = ppm
        self.W = max(16, int(round((u1 - u0) * ppm)))
        self.H = max(16, int(round((v1 - v0) * ppm)))
        self.img = Image.new("RGB", (self.W, self.H), bg)
        self.em = Image.new("RGB", (self.W, self.H), (0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.de = ImageDraw.Draw(self.em)
        self.geo = []                       # deferred 3-D controls
        # subtle surface: fine noise + edge wear
        a = np.asarray(self.img).astype(np.float32)
        a += RNG.normal(0, 2.2, a.shape[:2])[..., None]
        self.img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        self.d = ImageDraw.Draw(self.img)

    # coordinates
    def px(self, u, v):
        return ((u - self.u0) * self.ppm, (self.v1 - v) * self.ppm)

    def uv(self, u, v):
        return ((u - self.u0) / (self.u1 - self.u0), (v - self.v0) / (self.v1 - self.v0))

    def uvq(self, u0, v0, u1, v1):
        return [self.uv(u0, v0), self.uv(u1, v0), self.uv(u1, v1), self.uv(u0, v1)]

    def m(self, x):
        return x * self.ppm

    # drawing
    def text(self, u, v, s, size=0.0055, color=LABEL, anchor="mm", lit=True, bold=True):
        f = font(FONT_B if bold else FONT_R, self.m(size))
        xy = self.px(u, v)
        self.d.text(xy, s, fill=color, font=f, anchor=anchor)
        if lit:
            self.de.text(xy, s, fill=LEGEND_EM, font=f, anchor=anchor)

    def line(self, u0, v0, u1, v1, w=0.0008, color=LABEL, lit=True):
        a, b = self.px(u0, v0), self.px(u1, v1)
        self.d.line([a, b], fill=color, width=max(1, int(self.m(w))))
        if lit:
            self.de.line([a, b], fill=(150, 140, 120), width=max(1, int(self.m(w))))

    def rect(self, u0, v0, u1, v1, fill=None, outline=None, w=0.0008, em=None):
        a, b = self.px(u0, v1), self.px(u1, v0)
        self.d.rectangle([a, b], fill=fill, outline=outline, width=max(1, int(self.m(w))))
        if em is not None:
            self.de.rectangle([a, b], fill=em)

    def section(self, u0, v0, u1, v1, title):
        """Engraved white border with the title set into the top line."""
        m = 0.004
        a0, b0, a1, b1 = u0 + m, v0 + m, u1 - m, v1 - m
        f = font(FONT_B, self.m(0.0058))
        tw = self.d.textlength(title, font=f) / self.ppm + 0.006
        cx = (a0 + a1) / 2
        self.line(a0, b1, cx - tw / 2, b1)
        self.line(cx + tw / 2, b1, a1, b1)
        self.line(a0, b0, a1, b0)
        self.line(a0, b0, a0, b1 - 0.006)
        self.line(a1, b0, a1, b1 - 0.006)
        self.text(cx, b1, title, 0.0058)

    def lcd(self, u, v, w, h, s, color=(255, 196, 60), size=None):
        self.rect(u - w / 2, v - h / 2, u + w / 2, v + h / 2, fill=(8, 9, 10), em=(0, 0, 0))
        f = font(FONT_M, self.m(size or h * 0.72))
        xy = self.px(u, v)
        self.d.text(xy, s, fill=color, font=f, anchor="mm")
        self.de.text(xy, s, fill=color, font=f, anchor="mm")

    # controls (art + deferred geometry) ------------------------------------------------
    def pushbutton(self, u, v, name, legend="OFF", w=0.021, h=0.017, name_pos="above", lit=None):
        top, _, bot = legend.partition("|")
        if not bot:
            top, bot = "", top
        # cap art: black face, two legend halves (unlit: dark grey letters)
        self.rect(u - w / 2, v - h / 2, u + w / 2, v + h / 2, fill=(14, 15, 17), em=(0, 0, 0))
        self.line(u - w / 2 + 0.002, v, u + w / 2 - 0.002, v, 0.0004, (40, 42, 46), lit=False)
        colors = {"amber": (255, 176, 40), "white": (240, 240, 255), "blue": (80, 180, 255), "green": (70, 255, 120)}
        tc = colors.get(lit, (84, 78, 64)) if top else None
        bc = colors.get(lit, (96, 96, 100))
        if top:
            f = font(FONT_B, self.m(0.0042))
            self.d.text(self.px(u, v + h / 4), top, fill=tc, font=f, anchor="mm")
            if lit:
                self.de.text(self.px(u, v + h / 4), top, fill=tc, font=f, anchor="mm")
        f = font(FONT_B, self.m(0.0042))
        self.d.text(self.px(u, v - h / 4), bot, fill=bc, font=f, anchor="mm")
        if lit:
            self.de.text(self.px(u, v - h / 4), bot, fill=bc, font=f, anchor="mm")
        if name:
            nv = v + h / 2 + 0.0055 if name_pos == "above" else v - h / 2 - 0.0055
            self.text(u, nv, name, 0.0047)
        self.geo.append(("pb", u, v, w, h))

    def knob(self, u, v, name, positions, r=0.0085, a0=-60, a1=60, big=False):
        n = len(positions)
        R = r + 0.0045
        for i, s in enumerate(positions):
            a = math.radians(a0 + (a1 - a0) * (i / max(n - 1, 1)))
            du, dv = math.sin(a), math.cos(a)
            self.line(u + du * (r + 0.001), v + dv * (r + 0.001), u + du * (R - 0.0005), v + dv * (R - 0.0005), 0.0007)
            self.text(u + du * (R + 0.0048), v + dv * (R + 0.004), s, 0.0038)
        if name:
            self.text(u, v - r - 0.0072, name, 0.0045)
        self.geo.append(("knob", u, v, r, big))

    def toggle(self, u, v, name, up="ON", down="OFF", guard=False, is_up=True):
        self.text(u, v + 0.0145, up, 0.0038)
        self.text(u, v - 0.0145, down, 0.0038)
        if name:
            self.text(u, v + 0.022, name, 0.0045)
        if guard:
            self.rect(u - 0.0085, v - 0.0125, u + 0.0085, v + 0.0125, outline=(200, 40, 40), w=0.0009)
        self.geo.append(("toggle", u, v, is_up, guard))

    def fire(self, u, v, name):
        self.rect(u - 0.018, v - 0.012, u + 0.018, v + 0.012, fill=(30, 10, 10), em=(0, 0, 0))
        self.text(u, v - 0.019, name, 0.0048)
        self.geo.append(("fire", u, v))

    # emit geometry --------------------------------------------------------------------
    def build(self, mb):
        F = self.F
        img_b = os.path.join(TEX, f"ck_{self.name}.jpg")
        img_e = os.path.join(TEX, f"ck_{self.name}_em.jpg")
        self.img.save(img_b, quality=90)
        self.em.save(img_e, quality=88)
        mat = C.pbr_material(f"CkPanel_{self.name}", color=(1, 1, 1, 1), roughness=0.72, base_tex=img_b,
                             emissive_tex=img_e, emission_strength=1.0)
        mi = M.add(f"panel_{self.name}", mat)
        quad(mb, F, self.u0, self.v0, self.u1, self.v1, self.h0, mi, uv=self.uvq(self.u0, self.v0, self.u1, self.v1))
        for g in self.geo:
            k = g[0]
            if k == "pb":
                _, u, v, w, h = g
                slab(mb, F, u - w / 2 - 0.0012, v - h / 2 - 0.0012, u + w / 2 + 0.0012, v + h / 2 + 0.0012, 0.0, 0.0025,
                     M["dark"])
                slab(mb, F, u - w / 2, v - h / 2, u + w / 2, v + h / 2, 0.0025, 0.0085, M["knob"],
                     top_uv=self.uvq(u - w / 2, v - h / 2, u + w / 2, v + h / 2), top_mat=mi)
            elif k == "knob":
                _, u, v, r, big = g
                cyl_f(mb, F, u, v, 0.0, 0.003, r * 1.35, M["dark"], n=16)
                cyl_f(mb, F, u, v, 0.003, 0.003 + (0.02 if big else 0.014), r, M["knob"], n=16, r1=r * 0.9)
                # pointer bar across the knob top
                ht = 0.0032 + (0.02 if big else 0.014)
                slab(mb, F, u - 0.0011, v - r * 0.2, u + 0.0011, v + r * 0.85, ht - 0.0008, ht + 0.0012, M["label"])
            elif k == "toggle":
                _, u, v, is_up, guard = g
                cyl_f(mb, F, u, v, 0.0, 0.0035, 0.0055, M["metal"], n=12)
                tip = F.p(u, v + (0.0085 if is_up else -0.0085), 0.019)
                cyl_pts(mb, F.p(u, v, 0.0035), tip, 0.0018, M["metal"], n=8)
                sbox(mb, tip, (0.0028, 0.0028, 0.0028), M["metal"], e=0.9, n=(4, 8))
                if guard:
                    # hinged red guard (open frame)
                    for du in (-0.0078, 0.0078):
                        slab(mb, F, u + du - 0.0009, v - 0.0125, u + du + 0.0009, v + 0.0125, 0.0, 0.024, M["guard"])
                    slab(mb, F, u - 0.0087, v - 0.0125, u + 0.0087, v + 0.0125, 0.0225, 0.0245, M["guard"])
            elif k == "fire":
                _, u, v = g
                slab(mb, F, u - 0.018, v - 0.012, u + 0.018, v + 0.012, 0.0, 0.004, M["dark"])
                cyl_pts(mb, F.p(u, v, 0.004), F.p(u, v, 0.02), 0.0035, M["metal"], n=8)
                slab(mb, F, u - 0.03, v - 0.009, u + 0.03, v + 0.009, 0.02, 0.034, M["firered"])
                slab(mb, F, u - 0.012, v - 0.005, u + 0.012, v + 0.005, 0.034, 0.0355, M["red"])
        return mi


# --------------------------------------------------------------------------- small textures
def cdu_texture(W=512, H=400):
    img = Image.new("RGB", (W, H), (4, 6, 8))
    d = ImageDraw.Draw(img)
    f = font(FONT_M, 30)
    lines = [("   ACT RTE 1 LEGS  1/3", (230, 230, 230)), ("", None),
             (" 263°      HDG 270", (0, 230, 90)), ("RJCB27    250/ 5000", (220, 90, 230)),
             (" 2.1NM     THEN", (0, 230, 90)), ("CI27     .180/ 3000", (230, 230, 230)),
             (" 4.0NM", (0, 230, 90)), ("FF27      160/ 1800", (230, 230, 230)),
             ("------------------------", (230, 230, 230)), ("<RTE 2 LEGS   RTE DATA>", (230, 230, 230))]
    for i, (t, c) in enumerate(lines):
        if c:
            d.text((12, 12 + i * 38), t, fill=c, font=f)
    img.save(os.path.join(TEX, "cdu_screen.jpg"), quality=92)


def efb_texture(W=640, H=440):
    img = Image.new("RGB", (W, H), (22, 26, 32))
    d = ImageDraw.Draw(img)
    d.rectangle((16, 16, W - 16, H - 16), fill=(236, 236, 230))
    d.rectangle((80, 200, 560, 232), fill=(40, 40, 44))
    for x in range(120, 540, 80):
        d.rectangle((x, 232, x + 12, 340), fill=(160, 160, 160))
    d.rectangle((80, 340, 560, 352), fill=(160, 160, 160))
    f = font(FONT_B, 22)
    d.text((88, 160), "RJCB  RWY 09/27  3500 x 60 m", fill=(20, 20, 20), font=f)
    d.text((88, 372), "CITY BUILDER INTL · AIRPORT DIAGRAM", fill=(20, 20, 20), font=font(FONT_R, 20))
    d.text((88, 40), "10-9  ELEV 0 FT", fill=(40, 40, 40), font=font(FONT_R, 20))
    img.save(os.path.join(TEX, "efb_screen.jpg"), quality=92)


def isfd_texture(S=256):
    img = Image.new("RGB", (S, S), (6, 7, 9))
    d = ImageDraw.Draw(img)
    d.rectangle((40, 30, 216, 128), fill=(40, 110, 200))
    d.rectangle((40, 128, 216, 226), fill=(120, 80, 40))
    d.line((40, 128, 216, 128), fill=(255, 255, 255), width=3)
    for k, y in enumerate((98, 158)):
        d.line((104, y, 152, y), fill=(255, 255, 255), width=2)
    d.polygon([(90, 128), (118, 128), (118, 136)], fill=(255, 220, 0))
    d.polygon([(166, 128), (138, 128), (138, 136)], fill=(255, 220, 0))
    d.rectangle((6, 60, 36, 190), fill=(30, 30, 34))
    d.rectangle((220, 60, 250, 190), fill=(30, 30, 34))
    f = font(FONT_M, 16)
    d.text((8, 118), "250", fill=(255, 255, 255), font=f)
    d.text((220, 118), "50", fill=(255, 255, 255), font=f)
    d.text((104, 232), "270", fill=(255, 255, 255), font=f)
    img.save(os.path.join(TEX, "isfd.jpg"), quality=90)


def clock_texture(S=192):
    img = Image.new("RGB", (S, S), (8, 9, 10))
    d = ImageDraw.Draw(img)
    d.ellipse((6, 6, S - 6, S - 6), outline=(200, 200, 200), width=3)
    for k in range(60):
        a = k / 60 * 2 * math.pi
        r0 = S / 2 - (20 if k % 5 == 0 else 12)
        d.line((S / 2 + math.sin(a) * r0, S / 2 - math.cos(a) * r0, S / 2 + math.sin(a) * (S / 2 - 8),
                S / 2 - math.cos(a) * (S / 2 - 8)), fill=(220, 220, 220), width=2 if k % 5 == 0 else 1)
    f = font(FONT_M, 26)
    d.text((S / 2, S / 2 - 18), "14:37", fill=(255, 255, 255), font=f, anchor="mm")
    d.text((S / 2, S / 2 + 18), "UTC  ET 00:42", fill=(160, 220, 160), font=font(FONT_M, 14), anchor="mm")
    img.save(os.path.join(TEX, "clock.jpg"), quality=90)


def cb_texture(W=520, H=820):
    """Circuit-breaker panel (rear bulkhead): rows of black CBs with white collars."""
    img = Image.new("RGB", (W, H), (150, 154, 158))
    d = ImageDraw.Draw(img)
    f = font(FONT_B, 11)
    y = 24
    rng = np.random.default_rng(5)
    rowname = ["FLT CONT", "HYD", "FUEL", "ELEC", "ENGINE", "AIR", "ICE/RAIN", "NAV", "COMM", "LIGHTS", "APU", "FIRE"]
    for r in range(12):
        d.text((10, y - 16), rowname[r], fill=(20, 20, 20), font=f)
        for k in range(14):
            x = 22 + k * 35
            d.ellipse((x - 11, y - 11, x + 11, y + 11), fill=(235, 235, 235))
            pulled = rng.random() < 0.03
            d.ellipse((x - 8, y - 8, x + 8, y + 8), fill=(14, 14, 14) if not pulled else (40, 40, 40))
            d.text((x, y + 17), f"{rng.integers(1, 35)}", fill=(40, 40, 40), font=font(FONT_R, 9), anchor="mm")
        y += 66
    img.save(os.path.join(TEX, "ck_cb.jpg"), quality=88)


# --------------------------------------------------------------------------- overhead panel
OVH = {
    (0, 0): ("IRS", [("pb", "ADIRU", "ON BAT|OFF"), ("pb", "SAARU", "ON BAT|OFF")]),
    (1, 0): ("FLIGHT CONTROLS", [("guard", "PRI FLT COMP", ("AUTO", "DISC")), ("guard", "ALTN PITCH TRIM", ("ARM", "NORM")),
                                ("pb", "TAC", "OFF")]),
    (2, 0): ("EMERGENCY", [("guard", "EMER LIGHTS", ("ON", "ARMED")), ("pb", "SERV INTPH", "ON"), ("pb", "STORM", "ON")]),
    (3, 0): ("WINDOW HEAT", [("pb", "L SIDE", "INOP|OFF"), ("pb", "L FWD", "INOP|OFF"), ("pb", "R FWD", "INOP|OFF"),
                            ("pb", "R SIDE", "INOP|OFF")]),
    (4, 0): ("RECORDER", [("pb", "VOICE REC", "ERASE"), ("pb", "CAMERA LTS", "ON"), ("knob", "CKPT", ["OFF", "DIM", "BRT"])]),
    (0, 1): ("ELECTRICAL", [("pb", "BATTERY", "OFF"), ("pb", "APU GEN", "OFF"), ("pb", "FWD EXT", "AVAIL|ON"),
                           ("pb", "AFT EXT", "AVAIL|ON")]),
    (1, 1): ("GEN CTRL", [("pb", "L1", "FAULT|OFF"), ("pb", "L2", "FAULT|OFF"), ("pb", "R1", "FAULT|OFF"),
                         ("pb", "R2", "FAULT|OFF")]),
    (2, 1): ("BUS TIE / BACKUP", [("pb", "L TIE", "ISLN|AUTO"), ("pb", "R TIE", "ISLN|AUTO"), ("pb", "L BKUP", "FAULT|OFF"),
                                 ("pb", "R BKUP", "FAULT|OFF")]),
    (3, 1): ("HYDRAULIC PRIMARY", [("pb", "L ENG", "FAULT|OFF"), ("pb", "C1 ELEC", "FAULT|OFF"),
                                  ("pb", "C2 ELEC", "FAULT|OFF"), ("pb", "R ENG", "FAULT|OFF")]),
    (4, 1): ("HYD DEMAND", [("knob", "L", ["OFF", "AUTO", "ON"]), ("knob", "C1", ["OFF", "AUTO", "ON"]),
                           ("knob", "C2", ["OFF", "AUTO", "ON"]), ("knob", "R", ["OFF", "AUTO", "ON"])]),
    (0, 2): ("APU", [("knob", "APU", ["OFF", "ON", "START"]), ("pb", "RAT", "UNLKD|DEPLOY")]),
    (1, 2): ("ENGINE START", [("knob", "L", ["START", "NORM"]), ("pb", "AUTOSTART", "OFF"), ("knob", "R", ["START", "NORM"])]),
    (2, 2): ("FUEL JETTISON", [("knob", "ARM", ["OFF", "ARM"]), ("pb", "L NOZ", "VALVE"), ("pb", "R NOZ", "VALVE"),
                              ("knob", "TO REMAIN", ["DECR", "INCR"])]),
    (3, 2): ("FUEL PUMPS", [("pb", "L FWD", "PRESS"), ("pb", "L AFT", "PRESS"), ("pb", "CTR L", "PRESS"),
                           ("pb", "CTR R", "PRESS"), ("pb", "R AFT", "PRESS"), ("pb", "R FWD", "PRESS")]),
    (4, 2): ("CROSSFEED", [("pb", "FWD", "VALVE"), ("pb", "AFT", "VALVE")]),
    (0, 3): ("ANTI-ICE", [("knob", "WING", ["OFF", "AUTO", "ON"]), ("knob", "ENG L", ["OFF", "AUTO", "ON"]),
                         ("knob", "ENG R", ["OFF", "AUTO", "ON"])]),
    (1, 3): ("PASSENGER SIGNS", [("knob", "NO SMOKING", ["OFF", "AUTO", "ON"]), ("knob", "SEATBELTS", ["OFF", "AUTO", "ON"])]),
    (2, 3): ("FIRE PROTECTION", [("fire", "L ENG"), ("fire", "APU"), ("fire", "R ENG")]),
    (3, 3): ("AIR CONDITIONING", [("pb", "L PACK", "FAULT|OFF"), ("pb", "R PACK", "FAULT|OFF"), ("pb", "TRIM AIR", "OFF"),
                                 ("pb", "RECIRC", "OFF")]),
    (4, 3): ("TEMPERATURE", [("knob", "FLT DECK", ["C", "AUTO", "W"]), ("knob", "CABIN", ["C", "AUTO", "W"])]),
    (0, 4): ("EQUIP COOLING", [("pb", "OVRD", "ON"), ("pb", "CARGO AIR", "OFF")]),
    (1, 4): ("PRESSURIZATION", [("knob", "LDG ALT", ["DECR", "AUTO", "INCR"]), ("pb", "FWD OUTFLOW", "MAN"),
                               ("pb", "AFT OUTFLOW", "MAN")]),
    (2, 4): ("CARGO FIRE", [("pb", "FWD", "ARMED"), ("pb", "AFT", "ARMED"), ("pb", "DISCH", "DISCH")]),
    (3, 4): ("CABIN ALTITUDE", [("toggle", "MAN", ("CLIMB", "DESC")), ("pb", "AUTO", "FAULT|MAN")]),
    (4, 4): ("INDICATOR LTS", [("toggle", "IND LTS", ("TEST", "BRT")), ("knob", "PANEL", ["OFF", "", "BRT"])]),
    (0, 5): ("OXYGEN", [("guard", "PASS O2", ("ON", "NORM")), ("pb", "CREW O2", "OFF")]),
    (1, 5): ("CALLS", [("pb", "GND", "CALL"), ("pb", "CABIN", "CALL"), ("pb", "MECH", "CALL")]),
    (2, 5): ("FLOOD / DOME", [("knob", "DOME", ["OFF", "", "BRT"]), ("knob", "FLOOD", ["OFF", "", "BRT"])]),
    (3, 5): ("EXTERIOR LIGHTS", [("toggle", "NAV", ("ON", "OFF")), ("toggle", "LOGO", ("ON", "OFF")),
                                ("toggle", "WING", ("ON", "OFF")), ("toggle", "STROBE", ("ON", "OFF")),
                                ("toggle", "BEACON", ("ON", "OFF"))]),
    (4, 5): ("WIPERS", [("knob", "L", ["OFF", "INT", "LOW", "HIGH"]), ("knob", "R", ["OFF", "INT", "LOW", "HIGH"])]),
    (0, 6): ("LANDING", [("toggle", "L", ("ON", "OFF")), ("toggle", "NOSE", ("ON", "OFF")), ("toggle", "R", ("ON", "OFF"))]),
    (1, 6): ("RWY TURNOFF / TAXI", [("toggle", "L", ("ON", "OFF")), ("toggle", "R", ("ON", "OFF")),
                                   ("toggle", "TAXI", ("ON", "OFF"))]),
    (2, 6): ("ENGINE EEC", [("pb", "L EEC", "ALTN"), ("pb", "R EEC", "ALTN")]),
    (3, 6): ("EMERGENCY LOC", [("guard", "ELT", ("ON", "ARM")), ("pb", "CARGO DOORS", "OPEN")]),
    (4, 6): ("SERVICE", [("pb", "FUEL", "OFF"), ("pb", "WATER", "OFF"), ("pb", "GALLEY", "OFF")]),
}


def layout_section(P, u0, v0, u1, v1, title, items):
    P.section(u0, v0, u1, v1, title)
    n = len(items)
    rows = 1 if n <= 4 else 2
    per = math.ceil(n / rows)
    hgt = v1 - v0
    for i, it in enumerate(items):
        r, k = divmod(i, per)
        cnt = min(per, n - r * per)
        u = u0 + (k + 0.5) * (u1 - u0) / cnt
        if rows == 1:
            v = v0 + hgt * 0.42
        else:
            v = v0 + hgt * (0.64 - r * 0.36)
        kind = it[0]
        if kind == "pb":
            P.pushbutton(u, v - 0.004, it[1], it[2])
        elif kind == "knob":
            P.knob(u, v + 0.004, it[1], it[2])
        elif kind in ("toggle", "guard"):
            up, dn = it[2]
            P.toggle(u, v - 0.004, it[1], up, dn, guard=kind == "guard", is_up=kind != "guard" and up == "ON")
        elif kind == "fire":
            P.fire(u, v, it[1])


def build_overhead(mb):
    s0, z0, s1, z1 = 4.08, 1.35, 5.05, 1.70
    F = Frame((s0, 0.0, z0), (0, -1, 0), (s1 - s0, 0, z1 - z0)).face((0.3, 0, -1))
    L = math.hypot(s1 - s0, z1 - z0)
    # housing behind the face
    slab(mb, F, -0.44, -0.02, 0.44, L + 0.02, -0.07, -0.001, M["dark"])
    P = TexPanel("overhead", F, -0.43, 0.0, 0.43, L, ppm=2200)
    cols = [(-0.43, -0.258), (-0.258, -0.086), (-0.086, 0.086), (0.086, 0.258), (0.258, 0.43)]
    vs = np.linspace(0.0, L, 8)
    for (ci, r), (title, items) in OVH.items():
        a, b = cols[ci]
        layout_section(P, a, vs[r], b, vs[r + 1], title, items)
    P.build(mb)


# --------------------------------------------------------------------------- glareshield
def mcp_layout():
    """MCP controls (u across the face, v up): shared with the simulator's live MCP canvas."""
    L = []
    add = lambda **k: L.append(k)  # noqa: E731
    add(kind="toggle", id="FD_L", u=-0.635, v=0.05, label="F/D")
    add(kind="toggle", id="AT_ARM_L", u=-0.595, v=0.05, label="L")
    add(kind="toggle", id="AT_ARM_R", u=-0.570, v=0.05, label="R")
    add(kind="pb", id="CLB_CON", u=-0.52, v=0.042, label="CLB/CON")
    add(kind="pb", id="AT", u=-0.475, v=0.042, label="A/T")
    add(kind="win", id="IAS", u=-0.405, v=0.092, w=0.064, h=0.022, label="IAS/MACH")
    add(kind="knob", id="SPD", u=-0.405, v=0.038)
    add(kind="pb", id="LNAV", u=-0.33, v=0.042, label="LNAV")
    add(kind="pb", id="VNAV", u=-0.285, v=0.042, label="VNAV")
    add(kind="pb", id="FLCH", u=-0.24, v=0.042, label="FLCH")
    add(kind="pb", id="AP_L", u=-0.18, v=0.042, label="A/P")
    add(kind="win", id="HDG", u=-0.105, v=0.092, w=0.05, h=0.022, label="HDG")
    add(kind="knob", id="HDG", u=-0.105, v=0.038, big=True)
    add(kind="pb", id="HDG_HOLD", u=-0.045, v=0.042, label="HOLD")
    add(kind="win", id="VS", u=0.035, v=0.092, w=0.058, h=0.022, label="V/S")
    add(kind="wheel", id="VS", u=0.035, v=0.036)
    add(kind="pb", id="VS", u=0.09, v=0.042, label="V/S")
    add(kind="win", id="ALT", u=0.17, v=0.092, w=0.064, h=0.022, label="ALTITUDE")
    add(kind="knob", id="ALT", u=0.17, v=0.038, big=True)
    add(kind="pb", id="ALT_HOLD", u=0.235, v=0.042, label="HOLD")
    add(kind="pb", id="LOC", u=0.30, v=0.042, label="LOC")
    add(kind="pb", id="APP", u=0.345, v=0.042, label="APP")
    add(kind="pb", id="AP_R", u=0.405, v=0.042, label="A/P")
    add(kind="bar", id="AP_DISC", u=0.47, v=0.03, w=0.05, h=0.012, label="DISENGAGE")
    add(kind="toggle", id="FD_R", u=0.635, v=0.05, label="F/D")
    return L


def build_glareshield(mb, meta):
    # MCP face (live canvas in the simulator)
    F = Frame((MCP_S, 0.0, MCP_Z0), (0, -1, 0), (0, 0, 1)).face((1, 0, 0))
    H = MCP_Z1 - MCP_Z0
    uvq = lambda u0, v0, u1, v1: [((u0 + MCP_HW) / (2 * MCP_HW), v0 / H), ((u1 + MCP_HW) / (2 * MCP_HW), v0 / H),  # noqa: E731
                                  ((u1 + MCP_HW) / (2 * MCP_HW), v1 / H), ((u0 + MCP_HW) / (2 * MCP_HW), v1 / H)]
    quad(mb, F, -MCP_HW, 0.0, MCP_HW, H, 0.002, M["mcp"], uv=uvq(-MCP_HW, 0.0, MCP_HW, H))
    lay = mcp_layout()
    for c in lay:
        u, v = c["u"], c["v"]
        if c["kind"] == "pb":
            w, h = 0.03, 0.017
            slab(mb, F, u - w / 2 - 0.0015, v - h / 2 - 0.0015, u + w / 2 + 0.0015, v + h / 2 + 0.0015, 0.001, 0.004, M["dark"])
            slab(mb, F, u - w / 2, v - h / 2, u + w / 2, v + h / 2, 0.004, 0.011, M["knob"],
                 top_uv=uvq(u - w / 2, v - h / 2, u + w / 2, v + h / 2), top_mat=M["mcp"])
        elif c["kind"] == "knob":
            r = 0.016 if c.get("big") else 0.013
            cyl_f(mb, F, u, v, 0.001, 0.006, r * 1.3, M["dark"], n=18)
            cyl_f(mb, F, u, v, 0.006, 0.03, r, M["knob"], n=18, r1=r * 0.93)
            if c.get("big"):      # push-button centre (HDG SEL / ALT) and outer bank ring
                cyl_f(mb, F, u, v, 0.03, 0.033, r * 0.55, M["key"], n=14)
            slab(mb, F, u - 0.0012, v, u + 0.0012, v + r * 0.85, 0.0302, 0.0318, M["label"])
        elif c["kind"] == "wheel":
            # V/S thumbwheel: a drum with its axis across the panel
            cyl_pts(mb, F.p(u - 0.012, v, 0.012), F.p(u + 0.012, v, 0.012), 0.012, M["knob"], n=16)
        elif c["kind"] == "toggle":
            cyl_f(mb, F, u, v, 0.001, 0.005, 0.006, M["metal"], n=12)
            tip = F.p(u, v + 0.009, 0.022)
            cyl_pts(mb, F.p(u, v, 0.005), tip, 0.002, M["metal"], n=8)
            sbox(mb, tip, (0.003, 0.003, 0.003), M["metal"], e=0.9, n=(4, 8))
        elif c["kind"] == "bar":
            w, h = c["w"], c["h"]
            slab(mb, F, u - w / 2, v - h / 2, u + w / 2, v + h / 2, 0.001, 0.014, M["chrome"])
    meta["mcp"] = dict(halfWidth=MCP_HW, height=H, controls=lay)
    # EFIS / DSP panels on the glareshield face either side + master WARNING / CAUTION
    for side in (1, -1):
        yc = side * 0.905
        Fe = Frame((3.635, yc, 0.77), (0, -1, 0), (0, 0, 1)).face((1, 0, 0))
        slab(mb, Fe, -0.19, -0.062, 0.19, 0.062, -0.03, -0.0008, M["dark"])
        P = TexPanel("efis_" + ("l" if side > 0 else "r"), Fe, -0.185, -0.055, 0.185, 0.055, ppm=2400)
        P.section(-0.185, -0.055, 0.185, 0.055, "EFIS CONTROL")
        P.knob(-0.13, 0.012, "MINS", ["RADIO", "BARO"], r=0.009)
        P.knob(-0.07, 0.012, "BARO", ["IN", "HPA"], r=0.009)
        P.knob(0.0, 0.012, "ND MODE", ["APP", "VOR", "MAP", "PLN"], r=0.009, a0=-70, a1=70)
        P.knob(0.07, 0.012, "RANGE", ["CTR", "TFC"], r=0.009)
        for k, s in enumerate(["WXR", "STA", "WPT", "ARPT", "DATA", "POS", "TERR"]):
            P.pushbutton(-0.14 + k * 0.034, -0.032, "", s, w=0.024, h=0.012)
        # master warning / caution (outboard)
        ow = 0.155 if side > 0 else -0.155
        P.rect(ow - 0.02, -0.03, ow + 0.02, 0.0, fill=(60, 10, 10), em=(0, 0, 0))
        P.rect(ow - 0.02, 0.004, ow + 0.02, 0.034, fill=(70, 50, 8), em=(0, 0, 0))
        P.text(ow, -0.015, "WARNING", 0.0048, color=(255, 90, 80))
        P.text(ow, 0.019, "CAUTION", 0.0048, color=(255, 190, 60))
        P.geo.append(("pb", ow, -0.015, 0.04, 0.03))
        P.geo.append(("pb", ow, 0.019, 0.04, 0.03))
        P.build(mb)
    # glareshield top: anti-glare surface
    Ft = Frame((3.38, 0.0, 0.842), (0, -1, 0), (1, 0, 0)).face((0, 0, 1))
    quad(mb, Ft, -1.17, -0.24, 1.17, 0.24, 0.001, M["dark"])
    # glareshield leading edge padding (rolled lip)
    cyl_pts(mb, (3.62, 1.17, 0.838), (3.62, -1.17, 0.838), 0.012, M["rubber"], n=10)


# --------------------------------------------------------------------------- main panel
def build_main_panel(mb):
    tilt = math.radians(12)
    ps, pz0, pz1 = 3.55, 0.28 + DZ, 0.98 + DZ
    Fp = Frame((ps, 0.0, pz0), (0, -1, 0), (-math.sin(tilt), 0, math.cos(tilt))).face((1, 0, 0.2))
    Lp = (pz1 - pz0) / math.cos(tilt)
    P = TexPanel("mainpanel", Fp, -1.12, 0.0, 1.12, Lp, ppm=1100, h0=0.0015)
    ys = [0.86, 0.47, 0.0, -0.47, -0.86]
    names = ["PFD", "ND", "EICAS", "ND", "PFD"]
    w, h = 0.33, 0.25
    vc = (DISP_ZC - pz0) / math.cos(tilt)
    for yc, nm in zip(ys, names):
        u = -yc
        m = 0.024
        P.rect(u - w / 2 - m, vc - h / 2 - m - 0.03, u + w / 2 + m, vc + h / 2 + m, fill=(30, 32, 36))
        P.rect(u - w / 2, vc - h / 2, u + w / 2, vc + h / 2, fill=(5, 5, 6))
        for k, s in enumerate(["BRT", "", "", "", ""]):
            pass
        P.text(u - w / 2 - 0.004, vc + h / 2 + 0.012, nm, 0.009, anchor="lm")
        for k in range(5):
            P.rect(u - 0.12 + k * 0.06 - 0.012, vc - h / 2 - 0.022, u - 0.12 + k * 0.06 + 0.012, vc - h / 2 - 0.009,
                   fill=(52, 55, 60))
        P.text(u + w / 2 + 0.013, vc - h / 2 - 0.028, "BRT", 0.0045)
    # bezels (3-D frames) around the display glass
    for yc in ys:
        u = -yc
        mm = 0.024
        for (a, b, c_, d) in ((u - w / 2 - mm, vc - h / 2 - mm, u + w / 2 + mm, vc - h / 2),
                              (u - w / 2 - mm, vc + h / 2, u + w / 2 + mm, vc + h / 2 + mm),
                              (u - w / 2 - mm, vc - h / 2, u - w / 2, vc + h / 2),
                              (u + w / 2, vc - h / 2, u + w / 2 + mm, vc + h / 2)):
            slab(mb, Fp, a, b, c_, d, 0.0, 0.012, M["dark"])
        for k in range(5):
            uu = u - 0.12 + k * 0.06
            slab(mb, Fp, uu - 0.012, vc - h / 2 - 0.022, uu + 0.012, vc - h / 2 - 0.009, 0.0, 0.006, M["key"])
        P.geo.append(("knob", u + w / 2 + 0.013, vc - h / 2 - 0.016, 0.006, False))
    # standby instrument (ISFD) left of the EICAS, clocks outboard
    iu, iv = -0.255, vc - 0.06
    slab(mb, Fp, iu - 0.052, iv - 0.052, iu + 0.052, iv + 0.052, 0.0, 0.012, M["dark"])
    quad(mb, Fp, iu - 0.042, iv - 0.042, iu + 0.042, iv + 0.042, 0.0125, M["isfd"],
         uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
    P.text(iu, iv + 0.064, "STANDBY", 0.006)
    for cu in (-1.06, 1.06):
        slab(mb, Fp, cu - 0.04, vc + 0.02, cu + 0.04, vc + 0.1, 0.0, 0.01, M["dark"])
        quad(mb, Fp, cu - 0.033, vc + 0.027, cu + 0.033, vc + 0.093, 0.0105, M["clock"],
             uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        P.text(cu, vc + 0.112, "CLOCK", 0.0055)
        P.pushbutton(cu - 0.022, vc - 0.005, "CHR", "", w=0.016, h=0.012, name_pos="below")
        P.pushbutton(cu + 0.022, vc - 0.005, "ET", "", w=0.016, h=0.012, name_pos="below")
    # landing gear panel (right of the centre display) and autobrake
    gu, gv = 0.255, vc - 0.03
    P.section(gu - 0.06, gv - 0.13, gu + 0.06, gv + 0.1, "LANDING GEAR")
    P.text(gu - 0.035, gv + 0.06, "UP", 0.006)
    P.text(gu - 0.035, gv - 0.02, "OFF", 0.006)
    P.text(gu - 0.035, gv - 0.075, "DN", 0.006)
    slab(mb, Fp, gu - 0.012, gv - 0.085, gu + 0.012, gv + 0.07, 0.0, 0.004, M["knob"])       # gate slot
    cyl_pts(mb, Fp.p(gu, gv - 0.075, 0.004), Fp.p(gu, gv - 0.075, 0.07), 0.006, M["chrome"])
    cyl_pts(mb, Fp.p(gu - 0.022, gv - 0.075, 0.075), Fp.p(gu + 0.022, gv - 0.075, 0.075), 0.017, M["white"], n=16)
    P.knob(gu, gv - 0.118, "AUTOBRAKE", ["RTO", "OFF", "DISARM", "1", "2", "3", "4", "MAX"], r=0.011, a0=-120, a1=120)
    # alternate gear / flaps, heading / display source selectors (left of the centre display)
    P.section(-0.33, gv - 0.13, -0.18, gv - 0.02, "DSP SOURCE")
    P.knob(-0.29, gv - 0.08, "INBD", ["EICAS", "ND", "PFD"], r=0.009)
    P.knob(-0.22, gv - 0.08, "AIR DATA", ["L", "AUTO", "R"], r=0.009)
    P.build(mb)


# --------------------------------------------------------------------------- pedestal
CDU_KEYS = [["INIT REF", "RTE", "DEP ARR", "ALTN", "VNAV", ""],
            ["FIX", "LEGS", "HOLD", "FMC COMM", "PROG", "EXEC"],
            ["MENU", "NAV RAD", "PREV", "NEXT", "", ""],
            ["A", "B", "C", "D", "E", "F"], ["G", "H", "I", "J", "K", "L"], ["M", "N", "O", "P", "Q", "R"],
            ["S", "T", "U", "V", "W", "X"], ["Y", "Z", "SP", "DEL", "/", "CLR"]]
CDU_NUM = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], [".", "0", "+/-"]]


def build_pedestal(mb):
    # forward aisle stand: keypad panel sloping up towards the main panel (faces the crew)
    s0, z0, s1, z1 = 4.10, 0.335, 3.68, 0.405          # aft-low edge -> forward-high edge
    Ff = Frame(((s0 + s1) / 2, 0.0, (z0 + z1) / 2), (0, -1, 0), (s1 - s0, 0, z1 - z0)).face((0.3, 0, 1))
    Lf = math.hypot(s1 - s0, z1 - z0) / 2
    slab(mb, Ff, -0.26, -Lf, 0.26, Lf, -0.09, -0.001, M["panel"])
    P = TexPanel("cdu", Ff, -0.26, -Lf, 0.26, Lf, ppm=2600)
    for uc in (-0.128, 0.128):
        P.rect(uc - 0.122, -Lf + 0.006, uc + 0.122, Lf - 0.006, fill=(52, 56, 61))
        P.rect(uc - 0.09, 0.09, uc + 0.09, 0.19, fill=(4, 5, 6))
        for r in range(6):
            v = 0.1 + r * 0.0158
            for su in (-0.104, 0.104):
                P.pushbutton(uc + su, v, "", "—", w=0.013, h=0.009)
        for r, row in enumerate(CDU_KEYS):
            for k, s in enumerate(row):
                if not s:
                    continue
                if r < 3:
                    u, v, w_ = uc - 0.1 + k * 0.04, 0.068 - r * 0.02, 0.034
                else:
                    u, v, w_ = uc - 0.012 + k * 0.021, 0.008 - (r - 3) * 0.021, 0.017
                P.rect(u - w_ / 2, v - 0.0075, u + w_ / 2, v + 0.0075, fill=(34, 36, 40), em=(0, 0, 0))
                f = font(FONT_B, P.m(0.0042 if r < 3 else 0.0062))
                P.d.text(P.px(u, v), s, fill=(235, 235, 235), font=f, anchor="mm")
                P.de.text(P.px(u, v), s, fill=LEGEND_EM, font=f, anchor="mm")
                P.geo.append(("key", u, v, w_, 0.015))
        for r, row in enumerate(CDU_NUM):
            for k, s in enumerate(row):
                u = uc - 0.1 + k * 0.021
                v = 0.008 - r * 0.021
                P.rect(u - 0.0085, v - 0.0075, u + 0.0085, v + 0.0075, fill=(34, 36, 40), em=(0, 0, 0))
                f = font(FONT_B, P.m(0.0065))
                P.d.text(P.px(u, v), s, fill=(235, 235, 235), font=f, anchor="mm")
                P.de.text(P.px(u, v), s, fill=LEGEND_EM, font=f, anchor="mm")
                P.geo.append(("key", u, v, 0.017, 0.015))
        P.text(uc - 0.075, -0.19, "BRT", 0.0045)
        P.geo.append(("knob", uc - 0.1, -0.19, 0.006, False))
        for k, s in enumerate(["DSPY", "FAIL", "MSG", "OFST"]):
            P.text(uc + 0.1, -0.1 - k * 0.013, s, 0.0035, color=(90, 90, 90))
    P.text(0.0, -0.19, "CDU", 0.006)
    keys = [g for g in P.geo if g[0] == "key"]
    P.geo = [g for g in P.geo if g[0] != "key"]
    mi = P.build(mb)
    for _, u, v, w_, h_ in keys:
        slab(mb, Ff, u - w_ / 2, v - h_ / 2, u + w_ / 2, v + h_ / 2, 0.0, 0.006, M["key"],
             top_uv=P.uvq(u - w_ / 2, v - h_ / 2, u + w_ / 2, v + h_ / 2), top_mat=mi)
    for uc in (-0.128, 0.128):
        quad(mb, Ff, uc - 0.088, 0.092, uc + 0.088, 0.188, 0.0008, M["screen"], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])

    # control stand + aft aisle stand on the pedestal top (s 4.10 .. 4.82); "up" on the art is forward
    Ft = Frame((4.25, 0.0, 0.322), (0, -1, 0), (-1, 0, 0)).face((0, 0, 1))
    P = TexPanel("aftped", Ft, -0.255, -0.57, 0.255, 0.15, ppm=1900)
    P.section(-0.25, -0.195, 0.25, 0.145, "")
    for uu, lab, marks in ((-0.2, "SPEEDBRAKE", ["UP", "", "FLT DETENT", "", "ARMED", "DOWN"]),
                           (0.2, "FLAPS", ["30", "25", "20", "15", "5", "1", "UP"])):
        P.rect(uu - 0.008, -0.1, uu + 0.008, 0.11, fill=(10, 10, 12))
        P.text(uu, 0.13, lab, 0.0055)
        for k, s in enumerate(marks):
            vv = -0.095 + k * (0.2 / max(len(marks) - 1, 1))
            sgn = 1 if uu > 0 else -1
            P.line(uu + sgn * 0.012, vv, uu + sgn * 0.02, vv, 0.0008)
            if s:
                P.text(uu + sgn * 0.042, vv, s, 0.0045)
    for uu in (-0.06, 0.06):
        P.rect(uu - 0.007, -0.1, uu + 0.007, 0.11, fill=(10, 10, 12))
    P.text(0.0, 0.1, "FWD", 0.0042)
    P.text(0.0, -0.075, "IDLE", 0.0042)
    P.text(0.0, -0.095, "REV", 0.0042, color=(255, 180, 60))
    P.section(-0.1, -0.19, 0.1, -0.12, "FUEL CONTROL")
    P.text(-0.075, -0.14, "RUN", 0.0042)
    P.text(-0.075, -0.17, "CUTOFF", 0.0042)
    P.section(-0.25, -0.19, -0.105, -0.12, "PARK BRAKE")
    P.section(0.105, -0.19, 0.25, -0.12, "STAB CUTOUT")
    P.toggle(0.15, -0.16, "", "CUTOUT", "NORM", guard=True, is_up=False)
    P.toggle(0.205, -0.16, "", "CUTOUT", "NORM", guard=True, is_up=False)
    y = -0.2
    for title, win, knobs, colr in (("VHF  L  C  R  HF  AM", "118.100  121.900", 2, (255, 196, 60)),
                                    ("TRANSPONDER  TA/RA", "2000   ABV  NORM", 2, (255, 196, 60)),
                                    ("AUDIO CONTROL", "VHF L VHF C INT CAB PA", 0, (120, 230, 140))):
        P.section(-0.25, y - 0.105, 0.25, y, title)
        P.lcd(-0.075, y - 0.035, 0.24, 0.022, win, color=colr, size=0.012)
        for j in range(knobs):
            P.knob(0.11 + j * 0.07, y - 0.04, "", [], r=0.011)
        for j in range(6):
            P.pushbutton(-0.2 + j * 0.05, y - 0.08, "", ["XFR", "TEST", "STBY", "MIC", "RCV", "OFF"][j], w=0.022, h=0.013)
        y -= 0.11
    P.section(-0.25, -0.568, 0.25, y + 0.002, "TRIM")
    P.knob(-0.1, (y - 0.568) / 2 + 0.002, "RUDDER", ["L", "", "R"], r=0.014, big=True)
    P.knob(0.1, (y - 0.568) / 2 + 0.002, "AILERON", ["L", "", "R"], r=0.011)
    P.build(mb)
    # levers (3-D): speedbrake (left) and flaps (right)
    for (uu, lab, vv) in ((-0.2, "SB", -0.09), (0.2, "FLAP", 0.1)):
        base = Ft.p(uu, vv - 0.03, 0.0)
        tip = Ft.p(uu, vv, 0.12)
        cyl_pts(mb, base, tip, 0.007, M["metal"])
        if lab == "FLAP":
            sbox(mb, tip + np.array([0, 0, 0.012]), (0.02, 0.032, 0.016), M["key"], e=0.5, n=(6, 12))
        else:
            sbox(mb, tip + np.array([0, 0, 0.012]), (0.028, 0.018, 0.014), M["knob"], e=0.5, n=(6, 12))
    # fuel control switches (lift-to-move levers with red ends)
    for uu in (-0.03, 0.03):
        cyl_pts(mb, Ft.p(uu, -0.14, 0.0), Ft.p(uu, -0.14, 0.05), 0.007, M["metal"])
        sbox(mb, Ft.p(uu, -0.14, 0.058), (0.018, 0.012, 0.011), M["guard"], e=0.7, n=(6, 10))
    # parking brake lever
    cyl_pts(mb, Ft.p(-0.18, -0.165, 0.0), Ft.p(-0.18, -0.15, 0.04), 0.006, M["metal"])
    slab(mb, Ft, -0.22, -0.16, -0.14, -0.14, 0.04, 0.052, M["guard"])


# --------------------------------------------------------------------------- side consoles / walls
def headset(mb, c, side):
    """Headset hanging on a hook: headband arc and two ear cups."""
    c = np.asarray(c, dtype=np.float64)
    pts = [c + np.array([0.0, 0.0, 0.0]) + 0.08 * np.array([0, math.sin(a) * 0.9, math.cos(a)])
           for a in np.linspace(-1.3, 1.3, 12)]
    tube(mb, pts, 0.008, M["knob"], n=8)
    for s_ in (-1, 1):
        cc = c + np.array([0, s_ * 0.075, -0.04])
        sbox(mb, cc, (0.035, 0.018, 0.042), M["knob"], e=0.5, n=(6, 10))
    cyl_pts(mb, c + np.array([0, -0.075, -0.07]), c + np.array([0.06, -0.06, -0.12]), 0.004, M["knob"], n=6)


def build_side_consoles(mb):
    for side in (1, -1):
        y = side * 1.05
        # console top: u across (towards -y), v along the aircraft (forward = up on the art)
        F = Frame((4.35, y, 0.22), (0, -1, 0), (-1, 0, 0)).face((0, 0, 1))
        slab(mb, F, -0.12, -0.35, 0.12, 0.45, -0.25, -0.001, M["panel"])
        P = TexPanel("side_" + ("l" if side > 0 else "r"), F, -0.12, -0.35, 0.12, 0.45, ppm=1400)
        P.section(-0.115, 0.08, 0.115, 0.44, "NOSE WHEEL STEERING")
        P.section(-0.115, -0.34, 0.115, -0.05, "OXYGEN")
        P.text(0.0, -0.075, "PUSH TO TEST AND RESET", 0.0042)
        P.pushbutton(0.0, 0.0, "MIC", "MIC|BOOM", w=0.02, h=0.016)
        P.build(mb)
        # tiller (nose-wheel steering wheel) on its hub
        c = F.p(0.0, 0.25, 0.05)
        th = np.linspace(0, 2 * math.pi, 29)
        rim = [c + 0.07 * (math.cos(a) * F.U + math.sin(a) * F.V) for a in th]
        tube(mb, rim, 0.009, M["knob"], n=8)
        for a in (0.3, 2.4, 4.5):
            cyl_pts(mb, c, c + 0.07 * (math.cos(a) * F.U + math.sin(a) * F.V), 0.006, M["knob"], n=6)
        cyl_pts(mb, F.p(0.0, 0.25, 0.0), c, 0.018, M["metal"])
        sbox(mb, c + 0.062 * F.V + np.array([0, 0, 0.03]), (0.011, 0.011, 0.028), M["knob"], e=0.8, n=(6, 8))
        # oxygen mask stowage box (split doors, OXY ON flag), cup holder, flashlight
        slab(mb, F, -0.1, -0.3, 0.02, -0.1, 0.0, 0.09, M["dark"])
        slab(mb, F, -0.1, -0.3, 0.02, -0.2, 0.09, 0.093, M["key"])
        slab(mb, F, -0.1, -0.2, 0.02, -0.1, 0.09, 0.093, M["key"])
        slab(mb, F, 0.025, -0.27, 0.045, -0.13, 0.0, 0.03, M["white"])
        cyl_f(mb, F, 0.07, -0.02, 0.0, 0.07, 0.036, M["dark"], n=16)
        cyl_f(mb, F, 0.07, -0.02, 0.07, 0.072, 0.03, M["knob"], n=16)
        cyl_pts(mb, F.p(0.1, -0.33, 0.06), F.p(0.1, -0.33, 0.24), 0.018, M["knob"], n=12)
        # EFB tablet on its arm (faces inboard)
        Fe = Frame((4.2, side * 1.18, 0.55), (1, 0, 0) if side < 0 else (-1, 0, 0), (0, 0, 1)).face((0, -side, 0))
        slab(mb, Fe, -0.13, -0.095, 0.13, 0.095, 0.0, 0.015, M["dark"])
        cyl_pts(mb, Fe.p(0, -0.05, 0.0), np.array([4.2, side * 1.1, 0.22]), 0.01, M["metal"])
        quad(mb, Fe, -0.115, -0.08, 0.115, 0.08, 0.0155, M["efb"], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        # sidewall: air outlets (gaspers), headset on its hook
        for sx in (4.05, 4.55):
            p = np.array([sx, side * 1.2, 0.95])
            cyl_pts(mb, p, p + np.array([0, -side * 0.03, 0]), 0.03, M["key"], n=14)
            cyl_pts(mb, p + np.array([0, -side * 0.03, 0]), p + np.array([0, -side * 0.045, 0]), 0.013, M["chrome"], n=12)
        headset(mb, (4.75, side * 1.15, 0.72), side)
        # rudder pedals (with toe brakes)
        for dy in (-0.14, 0.14):
            pc = np.array([3.9, side * 0.53 + dy, 0.02 + DZ + 0.2])
            sbox(mb, pc, (0.025, 0.06, 0.12), M["knob"], e=0.4, n=(6, 10), R=rot_s(-25))
            cyl_pts(mb, pc + np.array([0.02, 0, -0.1]), pc + np.array([0.15, 0, -0.18]), 0.012, M["metal"])


def build_seats(mb):
    for sy in (0.53, -0.53):
        base = np.array([4.62, sy, DZ + 0.02])
        # pedestal, tracks, adjust levers
        mb.add_box(tuple(base + np.array([0, 0, 0.18])), (0.34, 0.3, 0.36), mat=M["metal"])
        for dy in (-0.14, 0.14):
            mb.add_box(tuple(base + np.array([0, dy, 0.012])), (0.95, 0.045, 0.024), mat=M["dark"])
        cyl_pts(mb, base + np.array([-0.15, 0.17, 0.3]), base + np.array([-0.25, 0.19, 0.28]), 0.008, M["knob"])
        # seat pan (leather) + sheepskin cover, backrest with lumbar and wings, headrest
        sbox(mb, base + np.array([-0.02, 0, 0.44]), (0.27, 0.27, 0.075), M["seat"], e=0.35, n=(6, 14))
        sbox(mb, base + np.array([-0.02, 0, 0.5]), (0.25, 0.24, 0.03), M["fleece"], e=0.3, n=(4, 12))
        R = rot_s(14)
        sbox(mb, base + np.array([0.31, 0, 0.86]), (0.06, 0.27, 0.4), M["seat"], e=0.3, n=(6, 14), R=R)
        sbox(mb, base + np.array([0.255, 0, 0.84]), (0.035, 0.24, 0.36), M["fleece"], e=0.3, n=(4, 12), R=R)
        for dy in (-0.25, 0.25):
            sbox(mb, base + np.array([0.28, dy, 0.8]), (0.07, 0.04, 0.3), M["seat"], e=0.4, n=(4, 10), R=R)
        sbox(mb, base + np.array([0.39, 0, 1.33]), (0.07, 0.17, 0.11), M["seat"], e=0.4, n=(6, 12), R=R)
        # armrests (inboard one folded up), shoulder harness
        for dy, up in ((-0.3, False), (0.3, True)):
            if (sy > 0) == (dy > 0):
                up = False
            if up:
                sbox(mb, base + np.array([0.2, dy, 0.85]), (0.035, 0.03, 0.2), M["seat"], e=0.4, n=(4, 8))
            else:
                sbox(mb, base + np.array([0.02, dy, 0.64]), (0.21, 0.035, 0.03), M["seat"], e=0.4, n=(4, 8))
                cyl_pts(mb, base + np.array([0.18, dy, 0.64]), base + np.array([0.24, dy, 0.52]), 0.012, M["metal"])
        for dy in (-0.09, 0.09):
            tube(mb, [base + np.array([0.35, dy, 1.18]), base + np.array([0.24, dy * 1.2, 1.05]),
                      base + np.array([0.02, dy * 1.4, 0.6])], 0.004, M["dark"], n=6)
            slab(mb, Frame(base + np.array([0.0, dy * 1.4, 0.6]), (0, -1, 0), (0, 0, 1)).face((-1, 0, 0)),
                 -0.02, -0.03, 0.02, 0.03, 0.0, 0.008, M["chrome"])


def build_rear(mb):
    """Rear bulkhead: circuit-breaker panels, flight-deck door details, observer seat, dome lights."""
    cbm = C.pbr_material("CkPanel_cb", color=(1, 1, 1, 1), roughness=0.7, base_tex=os.path.join(TEX, "ck_cb.jpg"))
    mi = M.add("panel_cb", cbm)
    for side in (1, -1):
        F = Frame((6.8, side * 0.72, 0.25), (0, side, 0), (0, 0, 1)).face((-1, 0, 0))
        if side < 0:
            F = Frame((6.8, side * 0.72, 0.25), (0, 1, 0), (0, 0, 1)).face((-1, 0, 0))
        slab(mb, F, -0.28, -0.4, 0.28, 0.45, 0.0, 0.03, M["panel"], top_uv=[(0, 0), (1, 0), (1, 1), (0, 1)], top_mat=mi)
    # door: kick panel, handle, viewer, placard
    Fd = Frame((6.795, 0.0, 0.2), (0, -1, 0), (0, 0, 1)).face((-1, 0, 0))
    slab(mb, Fd, -0.38, -0.47, 0.38, -0.3, 0.0, 0.006, M["knob"])
    cyl_pts(mb, Fd.p(-0.3, 0.45, 0.02), Fd.p(-0.3, 0.45, 0.05), 0.012, M["chrome"])
    cyl_pts(mb, Fd.p(-0.3, 0.45, 0.05), Fd.p(-0.18, 0.45, 0.05), 0.011, M["chrome"])
    cyl_f(mb, Fd, 0.0, 0.85, 0.0, 0.015, 0.012, M["chrome"], n=12)
    slab(mb, Fd, -0.1, 0.62, 0.1, 0.72, 0.0, 0.003, M["yellow"])
    slab(mb, Fd, 0.24, 0.35, 0.3, 0.5, 0.0, 0.02, M["dark"])          # keypad / lock panel
    slab(mb, Fd, 0.25, 0.47, 0.29, 0.49, 0.02, 0.022, M["green"])
    # folded observer seat on the left rear wall
    sbox(mb, (6.6, 0.95, 0.6), (0.05, 0.22, 0.28), M["seat"], e=0.35, n=(4, 10))
    sbox(mb, (6.55, 0.95, 0.3), (0.04, 0.2, 0.18), M["seat"], e=0.35, n=(4, 10))
    # ceiling: dome lights, storm light, reading lights
    for s_, y_ in ((5.35, 0.0), (6.1, 0.0), (5.2, 0.55), (5.2, -0.55)):
        z = 1.72 if y_ == 0 else 1.62
        cyl_pts(mb, (s_, y_, z + 0.03), (s_, y_, z), 0.07 if y_ == 0 else 0.035, M["key"], n=16)
        cyl_pts(mb, (s_, y_, z + 0.001), (s_, y_, z - 0.004), 0.058 if y_ == 0 else 0.026, M["dome"], n=16)


def build_cockpit_detail(root, col, tex, meta=None):
    global M
    cdu_texture()
    efb_texture()
    isfd_texture()
    clock_texture()
    cb_texture()
    M = Mats(tex)
    mb = C.MeshBuilder(TB)
    meta = meta if meta is not None else {}
    build_overhead(mb)
    build_glareshield(mb, meta)
    build_main_panel(mb)
    build_pedestal(mb)
    build_side_consoles(mb)
    build_seats(mb)
    build_rear(mb)
    ob = mb.build("CockpitDetail", M.list, col=col)
    C.set_parent(ob, root)
    return ob
