"""
787-9 flight deck detail (Blender): overhead panel with switch modules, glareshield
(MCP + EFIS panels + master warning/caution), display bezels, standby instrument,
landing-gear lever and autobrake, forward pedestal with two CDUs, aft pedestal with
flap / speedbrake levers, fuel-control switches, radio and trim panels, tillers,
side-wall EFBs, oxygen-mask boxes, pilot seats and windshield wipers.

Everything is procedural, in the design frame (s aft, y left, z up), built on local
panel frames: P = O + u*U + v*V + h*N  (U lateral, V "up the panel", N out of the face).
Panel legends are small light bars ("printed text") on a material the simulator lights
up at night (integral panel lighting).
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

    def flip(self):
        self.N = -self.N
        return self


# --------------------------------------------------------------------------- primitives
def quad(mb, F, u0, v0, u1, v1, h, mat, uv=None):
    pts = [F.p(u0, v0, h), F.p(u1, v0, h), F.p(u1, v1, h), F.p(u0, v1, h)]
    mb.add_poly(pts, uvs=uv, mat=mat, normal=F.N)


def slab(mb, F, u0, v0, u1, v1, h0, h1, mat):
    """Box aligned with the frame (face at h1)."""
    c = [F.p(u0, v0, h0), F.p(u1, v0, h0), F.p(u1, v1, h0), F.p(u0, v1, h0),
         F.p(u0, v0, h1), F.p(u1, v0, h1), F.p(u1, v1, h1), F.p(u0, v1, h1)]
    faces = [(4, 5, 6, 7, F.N), (0, 3, 2, 1, -F.N), (0, 1, 5, 4, -F.V), (2, 3, 7, 6, F.V),
             (1, 2, 6, 5, F.U), (3, 0, 4, 7, -F.U)]
    for a, b, cc, d, n in faces:
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


def cyl_pts(mb, p0, p1, r, mat, n=10):
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    ax = nrm(p1 - p0)
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = nrm(np.cross(ax, tmp))
    v = np.cross(ax, u)
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * u + np.sin(th)[:, None] * v
    mb.add_grid(np.stack([p0 + r * ring, p1 + r * ring], 0), N=np.stack([ring, ring], 0), mat=mat)
    mb.add_poly(p1 + r * ring[:-1], mat=mat, outward=("dir", ax))


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


# --------------------------------------------------------------------------- controls
M_PANEL, M_DARK, M_KNOB, M_METAL, M_LABEL, M_AMBER, M_WHITE, M_KEY, M_SCREEN, M_RED, M_GUARD, \
    M_SEAT, M_FLEECE, M_BLUE, M_GREEN, M_EFB = range(16)


def legend(mb, F, u, v, w, h=0.0045):
    """Printed legend: a thin light bar just proud of the face."""
    quad(mb, F, u - w / 2, v - h / 2, u + w / 2, v + h / 2, 0.0006, M_LABEL)


def knob(mb, F, u, v, r=0.011, hgt=0.014, mat=M_KNOB, skirt=True):
    if skirt:
        cyl_f(mb, F, u, v, 0.0, 0.004, r * 1.45, M_DARK, n=14)
    cyl_f(mb, F, u, v, 0.004, 0.004 + hgt, r, mat, n=14, r1=r * 0.92)
    # pointer line
    quad(mb, F, u - 0.0012, v, u + 0.0012, v + r * 0.85, 0.0045 + hgt, M_LABEL)


def toggle(mb, F, u, v, up=True):
    cyl_f(mb, F, u, v, 0.0, 0.006, 0.006, M_METAL, n=10)
    tip = F.p(u, v + (0.012 if up else -0.012), 0.022)
    cyl_pts(mb, F.p(u, v, 0.006), tip, 0.0022, M_METAL, n=8)
    sbox(mb, tip, (0.0035, 0.0035, 0.0035), M_METAL, e=0.9, n=(4, 8))


def pushbutton(mb, F, u, v, w=0.024, h=0.02, lit=None):
    slab(mb, F, u - w / 2, v - h / 2, u + w / 2, v + h / 2, 0.0, 0.007, M_DARK)
    # legend halves: dark unless an annunciation is lit
    top = {"amber": M_AMBER, "white": M_WHITE, "blue": M_BLUE, "green": M_GREEN}.get(lit, M_KNOB)
    quad(mb, F, u - w / 2 + 0.002, v + 0.001, u + w / 2 - 0.002, v + h / 2 - 0.002, 0.0072, top)
    quad(mb, F, u - w / 2 + 0.002, v - h / 2 + 0.002, u + w / 2 - 0.002, v - 0.001, 0.0072, M_KNOB)
    legend(mb, F, u, v - h / 2 - 0.006, w * 0.8)


def guarded(mb, F, u, v):
    toggle(mb, F, u, v, up=False)
    slab(mb, F, u - 0.012, v - 0.018, u + 0.012, v + 0.018, 0.0, 0.026, M_GUARD)


def module(mb, F, u0, v0, u1, v1, rng):
    """One overhead module: border, title legend and a random mix of controls."""
    slab(mb, F, u0 + 0.002, v0 + 0.002, u1 - 0.002, v1 - 0.002, 0.0, 0.004, M_PANEL)
    # engraved border (light legend line)
    for (a, b, c, d) in ((u0 + 0.006, v1 - 0.009, u1 - 0.006, v1 - 0.0075),
                         (u0 + 0.006, v0 + 0.0075, u1 - 0.006, v0 + 0.009)):
        quad(mb, F, a, b, c, d, 0.0046, M_LABEL)
    legend(mb, F, (u0 + u1) / 2, v1 - 0.016, (u1 - u0) * 0.35, 0.005)
    w, h = u1 - u0, v1 - v0
    n = max(1, int(w / 0.05))
    rows = max(1, int((h - 0.03) / 0.045))
    kind = rng.choice(["pb", "pb", "toggle", "knob", "mix", "guard"])
    for r in range(rows):
        for k in range(n):
            u = u0 + (k + 0.5) * w / n
            v = v0 + 0.012 + (r + 0.5) * (h - 0.035) / rows
            kk = kind if kind != "mix" else rng.choice(["pb", "toggle", "knob"])
            if kk == "pb":
                lit = rng.choice([None] * 14 + ["white", "blue", "amber"])
                pushbutton(mb, F, u, v, lit=lit)
            elif kk == "toggle":
                toggle(mb, F, u, v, up=bool(rng.random() < 0.8))
                legend(mb, F, u, v - 0.02, 0.022)
            elif kk == "knob":
                knob(mb, F, u, v, r=0.009 + 0.004 * rng.random())
                for a in (-0.7, 0.0, 0.7):
                    legend(mb, F, u + 0.02 * math.sin(a), v + 0.02 * math.cos(a), 0.008, 0.003)
            else:
                guarded(mb, F, u, v)


# --------------------------------------------------------------------------- CDU screen
def cdu_texture(W=256, H=200):
    img = Image.new("RGB", (W, H), (4, 6, 8))
    d = ImageDraw.Draw(img)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf", 15)
    except OSError:
        f = ImageFont.load_default()
    lines = [("   ACT RTE 1 LEGS  1/3", (230, 230, 230)), ("", None),
             (" 263°      HDG 270", (0, 230, 90)), ("RJCB27    250/ 5000", (220, 90, 230)),
             (" 2.1NM     THEN", (0, 230, 90)), ("CI27     .180/ 3000", (230, 230, 230)),
             (" 4.0NM", (0, 230, 90)), ("FF27      160/ 1800", (230, 230, 230)),
             ("------------------------", (230, 230, 230)), ("<RTE 2 LEGS   RTE DATA>", (230, 230, 230))]
    for i, (t, c) in enumerate(lines):
        if c:
            d.text((6, 6 + i * 19), t, fill=c, font=f)
    img.save(os.path.join(TEX, "cdu_screen.jpg"), quality=92)


def efb_texture(W=320, H=220):
    img = Image.new("RGB", (W, H), (22, 26, 32))
    d = ImageDraw.Draw(img)
    # airport chart style: runway + taxiways on a light background
    d.rectangle((8, 8, W - 8, H - 8), fill=(236, 236, 230))
    d.rectangle((40, 100, 280, 116), fill=(40, 40, 44))
    for x in range(60, 270, 40):
        d.rectangle((x, 116, x + 6, 170), fill=(160, 160, 160))
    d.rectangle((40, 170, 280, 176), fill=(160, 160, 160))
    d.text((44, 80), "RWY 09/27  3500 x 60", fill=(20, 20, 20))
    d.text((44, 186), "RJCB  CITY BUILDER INTL", fill=(20, 20, 20))
    img.save(os.path.join(TEX, "efb_screen.jpg"), quality=92)


# --------------------------------------------------------------------------- build
def materials(tex):
    P = C.pbr_material
    h = C.hex_color
    return [
        P("Cockpit_PanelGrey", color=h("#3d4247"), roughness=0.75),
        P("Cockpit_PanelDark", color=h("#1f2226"), roughness=0.7),
        P("Cockpit_KnobBlack", color=h("#0f1012"), roughness=0.45),
        P("Cockpit_SwitchMetal", color=h("#b9bec4"), roughness=0.25, metallic=0.9),
        P("Cockpit_Label", color=h("#d8d8cf"), roughness=0.6, emission=h("#fff4dc"), emission_strength=0.0),
        P("Cockpit_AnnunAmber", color=h("#3a2a08"), roughness=0.3, emission=h("#ffb21e"), emission_strength=2.5),
        P("Cockpit_AnnunWhite", color=h("#2a2a2a"), roughness=0.3, emission=h("#f2f4ff"), emission_strength=2.0),
        P("Cockpit_Keycap", color=h("#cfd1cc"), roughness=0.5),
        P("Cockpit_CDU", color=h("#050607"), roughness=0.2, base_tex=tex("cdu_screen.jpg"),
          emissive_tex=tex("cdu_screen.jpg"), emission_strength=1.4),
        P("Cockpit_WarnRed", color=h("#3a0808"), roughness=0.3, emission=h("#ff2a1e"), emission_strength=1.5),
        P("Cockpit_Guard", color=h("#b01c24"), roughness=0.35),
        P("Cockpit_SeatLeather", color=h("#26272a"), roughness=0.6),
        P("Cockpit_Fleece", color=h("#8e8272"), roughness=1.0),
        P("Cockpit_AnnunBlue", color=h("#0a1a2a"), roughness=0.3, emission=h("#4fb4ff"), emission_strength=2.0),
        P("Cockpit_AnnunGreen", color=h("#0a2a12"), roughness=0.3, emission=h("#3cff78"), emission_strength=1.8),
        P("Cockpit_EFB", color=h("#0c0d10"), roughness=0.15, base_tex=tex("efb_screen.jpg"),
          emissive_tex=tex("efb_screen.jpg"), emission_strength=1.1),
    ]


def build_overhead(mb):
    # slanted panel from above the windshield back over the pilots' heads
    s0, z0, s1, z1 = 4.08, 1.35, 5.05, 1.70
    F = Frame((s0, 0.0, z0), (0, -1, 0), (s1 - s0, 0, z1 - z0))
    F.N = -F.N if F.N[2] > 0 else F.N          # face down towards the crew
    L = math.hypot(s1 - s0, z1 - z0)
    # body
    slab(mb, F, -0.43, -0.02, 0.43, L + 0.02, -0.06, 0.0, M_PANEL)
    # module grid: 5 columns x 7 rows with a centre strip
    cols = [(-0.42, -0.26), (-0.25, -0.085), (-0.075, 0.075), (0.085, 0.25), (0.26, 0.42)]
    vs = np.linspace(0.0, L, 8)
    for ci, (a, b) in enumerate(cols):
        for r in range(7):
            module(mb, F, a, vs[r], b, vs[r + 1], RNG)


def build_glareshield(mb):
    # MCP face (towards the pilots), s = 3.83, z 0.635..0.765, y +/-0.675
    F = Frame((3.832, 0.0, 0.70), (0, -1, 0), (-0.25, 0, 1))
    if F.N[0] < 0:
        F.N = -F.N
    # speed / heading / altitude / vertical speed windows + knobs, mode buttons between
    groups = [(-0.52, "IAS"), (-0.2, "HDG"), (0.18, "VS"), (0.46, "ALT")]
    for u, _ in groups:
        slab(mb, F, u - 0.035, 0.015, u + 0.035, 0.045, 0.0, 0.002, M_KNOB)
        quad(mb, F, u - 0.03, 0.02, u + 0.03, 0.04, 0.0026, M_AMBER)          # LCD digits
        knob(mb, F, u, -0.02, r=0.014, hgt=0.02)
        legend(mb, F, u, 0.055, 0.03)
    for u in np.r_[np.linspace(-0.44, -0.28, 3), np.linspace(-0.1, 0.08, 4), np.linspace(0.26, 0.36, 2)]:
        pushbutton(mb, F, u, 0.0, w=0.028, h=0.022, lit="green" if RNG.random() < 0.3 else None)
    # A/P engage and disengage bar
    slab(mb, F, 0.54, -0.03, 0.62, -0.012, 0.0, 0.012, M_METAL)
    pushbutton(mb, F, 0.58, 0.02, w=0.05, h=0.022, lit="green")
    # EFIS / DSP control panels on the glareshield face either side
    for side in (1, -1):
        yc = side * 0.92
        Fe = Frame((3.80, yc, 0.70), (0, -1, 0), (-0.25, 0, 1))
        if Fe.N[0] < 0:
            Fe.N = -Fe.N
        slab(mb, Fe, -0.17, -0.05, 0.17, 0.06, -0.05, 0.0, M_PANEL)
        for k in range(4):
            knob(mb, Fe, -0.13 + k * 0.085, 0.0, r=0.012, hgt=0.016)
            legend(mb, Fe, -0.13 + k * 0.085, 0.032, 0.03)
        for k in range(6):
            pushbutton(mb, Fe, -0.14 + k * 0.056, -0.038, w=0.03, h=0.016)
        # master warning / caution
        slab(mb, Fe, side * 0.2 - 0.03, -0.02, side * 0.2 + 0.03, 0.04, -0.005, 0.012, M_RED)
    # glareshield top: anti-glare surface lip
    Ft = Frame((3.45, 0.0, 0.822), (0, -1, 0), (1, 0, 0))
    if Ft.N[2] < 0:
        Ft.N = -Ft.N
    quad(mb, Ft, -1.17, -0.31, 1.17, 0.31, 0.001, M_DARK)


def build_main_panel(mb):
    # display bezels around the five displays (slanted panel, tilt 12 deg)
    tilt = math.radians(12)
    ps, pz0 = 3.55, 0.28 + DZ
    ys = [0.86, 0.47, 0.0, -0.47, -0.86]
    w, h = 0.33, 0.25
    zc = 0.66 + DZ
    for yc in ys:
        s_c = ps - (zc - pz0) * math.tan(tilt) - 0.004
        F = Frame((s_c, yc, zc), (0, -1, 0), (-math.sin(tilt), 0, math.cos(tilt)))
        if F.N[0] < 0:
            F.N = -F.N
        # bezel frame (4 slabs) + bezel buttons along the bottom
        m = 0.025
        slab(mb, F, -w / 2 - m, -h / 2 - m, w / 2 + m, -h / 2, 0.0, 0.012, M_DARK)
        slab(mb, F, -w / 2 - m, h / 2, w / 2 + m, h / 2 + m, 0.0, 0.012, M_DARK)
        slab(mb, F, -w / 2 - m, -h / 2, -w / 2, h / 2, 0.0, 0.012, M_DARK)
        slab(mb, F, w / 2, -h / 2, w / 2 + m, h / 2, 0.0, 0.012, M_DARK)
        for k in range(5):
            slab(mb, F, -0.12 + k * 0.06 - 0.012, -h / 2 - 0.02, -0.12 + k * 0.06 + 0.012, -h / 2 - 0.008,
                 0.012, 0.016, M_KEY)
        # brightness knob
        knob(mb, F, w / 2 + 0.013, -h / 2 - 0.012, r=0.007, hgt=0.01, skirt=False)
    # standby instrument (ISFD) + landing gear lever + autobrake between centre displays
    s_c = ps - (0.30 - pz0) * math.tan(tilt) - 0.006
    F = Frame((s_c, 0.0, 0.30 + DZ + 0.3), (0, -1, 0), (-math.sin(tilt), 0, math.cos(tilt)))
    if F.N[0] < 0:
        F.N = -F.N
    # gear lever (right of the centre display, 787 style)
    Fg = Frame((ps - 0.07, -0.23, 0.20), (0, -1, 0), (-math.sin(tilt), 0, math.cos(tilt)))
    if Fg.N[0] < 0:
        Fg.N = -Fg.N
    slab(mb, Fg, -0.035, -0.06, 0.035, 0.06, -0.005, 0.004, M_PANEL)
    cyl_pts(mb, Fg.p(0, 0.0, 0.004), Fg.p(0, 0.045, 0.06), 0.006, M_METAL)
    sbox(mb, Fg.p(0, 0.05, 0.068), (0.018, 0.018, 0.012), M_KEY, e=0.8, n=(6, 10))     # wheel knob
    for k, lit in enumerate(("green", "green", "green")):
        pushbutton(mb, Fg, -0.02 + k * 0.02, -0.075, w=0.015, h=0.012, lit=lit)
    # autobrake selector
    knob(mb, Fg, 0.0, -0.1, r=0.013, hgt=0.015)


def build_pedestal(mb):
    # forward pedestal face (slanted towards the crew): two CDUs
    # forward aisle stand: face rising aft from under the centre display to the throttle quadrant
    Ff = Frame((3.73, 0.0, 0.16), (0, -1, 0), (0.34, 0, 0.32))
    slab(mb, Ff, -0.27, -0.2, 0.27, 0.2, -0.28, 0.0, M_PANEL)
    for uc in (-0.13, 0.13):
        slab(mb, Ff, uc - 0.12, -0.11, uc + 0.12, 0.15, 0.0, 0.006, M_DARK)
        quad(mb, Ff, uc - 0.09, 0.04, uc + 0.09, 0.135, 0.0065, M_SCREEN, uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        # line select keys either side of the screen
        for r in range(6):
            v = 0.05 + r * 0.015
            for su in (-0.105, 0.105):
                slab(mb, Ff, uc + su - 0.007, v - 0.005, uc + su + 0.007, v + 0.005, 0.006, 0.01, M_KEY)
        # keypad 6 x 8 (alpha / numeric / function keys)
        for r in range(8):
            for k in range(6):
                u = uc - 0.085 + k * 0.034
                v = -0.1 + r * 0.017
                slab(mb, Ff, u - 0.013, v - 0.006, u + 0.013, v + 0.006, 0.006, 0.011,
                     M_KEY if r < 6 else M_DARK)
    # aft pedestal top (flat, z = 0.32 + tiny): flap and speedbrake levers, fuel control, radios
    Ft = Frame((4.25, 0.0, 0.322), (0, -1, 0), (1, 0, 0))
    if Ft.N[2] < 0:
        Ft.N = -Ft.N
    # speedbrake (left of thrust levers) and flap lever (right)
    for (uu, mat, lab) in ((-0.2, M_METAL, "SB"), (0.2, M_METAL, "FLAP")):
        slab(mb, Ft, uu - 0.012, -0.23, uu + 0.012, 0.05, 0.0, 0.002, M_DARK)              # slot
        cyl_pts(mb, Ft.p(uu, -0.1, 0.0), Ft.p(uu, -0.13, 0.11), 0.007, mat)
        sbox(mb, Ft.p(uu, -0.135, 0.125), (0.02, 0.03, 0.015) if lab == "SB" else (0.03, 0.02, 0.018),
             M_KEY if lab == "FLAP" else M_KNOB, e=0.6, n=(6, 10))
        for k in range(7):
            legend(mb, Ft, uu + (0.035 if uu > 0 else -0.035), -0.22 + k * 0.04, 0.02, 0.004)
    # fuel control switches (behind the thrust levers)
    for uu in (-0.05, 0.05):
        cyl_pts(mb, Ft.p(uu, 0.12, 0.0), Ft.p(uu, 0.12, 0.05), 0.008, M_METAL)
        sbox(mb, Ft.p(uu, 0.12, 0.058), (0.012, 0.012, 0.012), M_RED, e=0.8, n=(6, 10))
    # radio / transponder / weather radar / trim panels aft
    for k, v in enumerate(np.linspace(0.2, 0.52, 4)):
        slab(mb, Ft, -0.24, v - 0.07, 0.24, v + 0.07, 0.0, 0.004, M_PANEL)
        for j in range(4):
            knob(mb, Ft, -0.18 + j * 0.12, v, r=0.012, hgt=0.016)
        slab(mb, Ft, -0.12, v + 0.025, 0.12, v + 0.05, 0.004, 0.006, M_KNOB)
        quad(mb, Ft, -0.1, v + 0.03, 0.1, v + 0.045, 0.0062, M_AMBER if k % 2 else M_WHITE)
    # parking brake handle
    cyl_pts(mb, Ft.p(-0.22, -0.3, 0.0), Ft.p(-0.22, -0.3, 0.04), 0.006, M_METAL)
    slab(mb, Ft, -0.26, -0.315, -0.18, -0.29, 0.04, 0.05, M_RED)


def build_side_consoles(mb):
    for side in (1, -1):
        y = side * 1.05
        # side console shelf
        F = Frame((4.35, y, 0.22), (1, 0, 0), (0, -side, 0))
        if F.N[2] < 0:
            F.N = -F.N
        slab(mb, F, -0.45, -0.12, 0.35, 0.12, -0.25, 0.0, M_PANEL)
        # tiller (nose-wheel steering wheel)
        c = F.p(-0.25, 0.02, 0.07)
        th = np.linspace(0, 2 * math.pi, 25)
        rim = [c + 0.07 * (math.cos(t) * F.U + math.sin(t) * F.V) + np.array([0, 0, 0.0]) for t in th]
        for a, b in zip(rim[:-1], rim[1:]):
            cyl_pts(mb, a, b, 0.008, M_KNOB, n=6)
        cyl_pts(mb, F.p(-0.25, 0.02, 0.0), c, 0.012, M_METAL)
        sbox(mb, c + 0.06 * F.U + np.array([0, 0, 0.02]), (0.012, 0.012, 0.025), M_KNOB, e=0.8, n=(6, 8))
        # oxygen mask stowage box + cup holder
        slab(mb, F, 0.1, -0.1, 0.3, 0.02, 0.0, 0.09, M_DARK)
        slab(mb, F, 0.12, -0.08, 0.28, 0.0, 0.09, 0.092, M_AMBER if side > 0 else M_KNOB)
        cyl_f(mb, F, -0.05, 0.07, 0.0, 0.06, 0.035, M_DARK, n=14)
        # EFB (side-wall tablet display)
        Fe = Frame((4.2, side * 1.18, 0.55), (1, 0, 0), (0, 0, 1))
        if Fe.N[1] * side > 0:
            Fe.N = -Fe.N
        slab(mb, Fe, -0.13, -0.095, 0.13, 0.095, 0.0, 0.015, M_DARK)
        cyl_pts(mb, Fe.p(0, -0.05, 0.0), np.array([4.2, side * 1.1, 0.22]), 0.01, M_METAL)     # mounting arm
        quad(mb, Fe, -0.115, -0.08, 0.115, 0.08, 0.0155, M_EFB,
             uv=[(0, 0), (1, 0), (1, 1), (0, 1)] if side > 0 else [(1, 0), (0, 0), (0, 1), (1, 1)])


def build_seats(mb):
    for sy in (0.53, -0.53):
        base = np.array([4.62, sy, DZ + 0.02])
        # pedestal + rails
        mb.add_box(tuple(base + np.array([0, 0, 0.18])), (0.34, 0.32, 0.36), mat=M_METAL)
        for dy in (-0.14, 0.14):
            mb.add_box(tuple(base + np.array([0, dy, 0.01])), (0.9, 0.04, 0.02), mat=M_DARK)
        # cushion, backrest, headrest, fleece, armrests
        sbox(mb, base + np.array([-0.02, 0, 0.44]), (0.26, 0.26, 0.07), M_FLEECE, e=0.35, n=(6, 12))
        tilt = math.radians(14)
        R = np.array([[math.cos(tilt), 0, math.sin(tilt)], [0, 1, 0], [-math.sin(tilt), 0, math.cos(tilt)]])
        sbox(mb, base + np.array([0.26, 0, 0.84]), (0.07, 0.25, 0.36), M_FLEECE, e=0.35, n=(6, 12), R=R)
        sbox(mb, base + np.array([0.31, 0, 0.84]), (0.05, 0.27, 0.38), M_SEAT, e=0.3, n=(6, 12), R=R)
        sbox(mb, base + np.array([0.36, 0, 1.28]), (0.07, 0.17, 0.1), M_SEAT, e=0.4, n=(6, 12), R=R)
        for dy in (-0.29, 0.29):
            sbox(mb, base + np.array([0.02, dy, 0.62]), (0.2, 0.035, 0.03), M_SEAT, e=0.4, n=(4, 8))
            cyl_pts(mb, base + np.array([0.18, dy, 0.62]), base + np.array([0.24, dy, 0.52]), 0.012, M_METAL)


def build_wipers(mb):
    # one wiper per front pane, parked along the bottom of the glass
    for side in (1, -1):
        pivot = np.array([3.28, side * 0.16, 0.80])
        tip = np.array([3.02, side * 0.72, 0.84])
        cyl_pts(mb, pivot, tip, 0.006, M_KNOB, n=6)
        cyl_pts(mb, pivot + np.array([0.02, 0, 0.01]), tip + np.array([0.01, 0, 0.02]), 0.004, M_KNOB, n=6)
        cyl_pts(mb, pivot, pivot + np.array([0.03, 0, -0.03]), 0.012, M_METAL, n=8)


def build_cockpit_detail(root, col, tex):
    cdu_texture()
    efb_texture()
    mats = materials(tex)
    mb = C.MeshBuilder(TB)
    build_overhead(mb)
    build_glareshield(mb)
    build_main_panel(mb)
    build_pedestal(mb)
    build_side_consoles(mb)
    build_seats(mb)
    ob = mb.build("CockpitDetail", mats, col=col)
    C.set_parent(ob, root)
    return ob
