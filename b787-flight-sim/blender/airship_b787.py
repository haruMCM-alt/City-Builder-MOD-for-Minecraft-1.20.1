"""
MA-AS "Kujira" hybrid airship: the parts that are not an aeroplane's (build_b787 builds the
gondola as the "fuselage", with its flight deck, cabin, doors, windows and nose wheel).

    envelope   three lobes side by side (a 150 m tri-lobe hull: the centre lobe higher), gore
               and hoop seams, the name on both sides
    fins       an X tail on the centre lobe; the upper pair carry the rudders, the lower pair the
               elevators (parts Rudder / Rudder_B / Elevator_L / Elevator_R)
    ducts      four vectored ducted propellers on struts from the side lobes: each duct tilts
               (part Duct_*, kind "vector") and carries its fan (Fan_*, kind "fan")
    pads       air-cushion landing pads under the side lobes (MainGear_L / MainGear_R)

Design frame as everywhere: s aft from the gondola nose, y left, z up.
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

import b787_geometry as G
import common as C

A = G.AIRSHIP       # the type's AIRSHIP dict
TB = G.to_blender


def lobe_r(t):
    """radius fraction along a lobe (t = 0 nose .. 1 tail): blunt bow, long tapering stern"""
    t = np.clip(np.asarray(t, dtype=np.float64), 0.0, 1.0)
    f = t ** 0.46 * (1 - t) ** 0.92
    tm = 0.46 / (0.46 + 0.92)
    return f / (tm ** 0.46 * (1 - tm) ** 0.92)


def lobes():
    """(s0, length, y, z, R) of the three lobes"""
    L, s0 = A["L"], A["s0"]
    out = [(s0, L, 0.0, A["zc"], A["Rc"])]
    for sg in (1, -1):
        out.append((s0 + A["ds_side"], L * A["k_side"], sg * A["ys"], A["zc"] + A["dzs"], A["Rs"]))
    return out


def lobe_point(lb, t, phi):
    s0, L, y, z, R = lb
    r = R * lobe_r(t)
    return np.stack([s0 + t * L + 0 * phi, y + r * np.cos(phi), z + r * np.sin(phi)], -1)


def surface_z_below(lb, s):
    """lowest point of a lobe at station s"""
    s0, L, y, z, R = lb
    return z - R * float(lobe_r((s - s0) / L))


# ------------------------------------------------------------------------------------- texture
def envelope_texture(path, W=4096, H=1024):
    """u along the hull, v around it (v = phi / 2pi, phi from +y towards +z): white fabric,
    gore seams, hoop seams every ~6 m, a pale belly band and the name on both sides"""
    L = A["L"]
    img = np.full((H, W, 3), 0.93, np.float32)
    u = (np.arange(W) + 0.5) / W
    v = (np.arange(H) + 0.5) / H
    U, V = np.meshgrid(u, v)
    phi = V * 2 * math.pi
    # gores: 36 around
    g = np.abs(((phi / (2 * math.pi) * 36) % 1.0) - 0.5)
    img *= (1 - 0.06 * np.clip(1 - (0.5 - g) / 0.012, 0, 1))[..., None]
    # hoops
    h = np.abs(((U * L / 6.0) % 1.0) - 0.5)
    img *= (1 - 0.05 * np.clip(1 - (0.5 - h) / 0.02, 0, 1))[..., None]
    # belly: a light grey band where the lobe faces down (sin phi < -0.6)
    down = np.clip((-np.sin(phi) - 0.55) / 0.2, 0, 1)
    img = img * (1 - 0.12 * down[..., None]) + np.array([0.80, 0.82, 0.85], np.float32) * 0.12 * down[..., None]
    # navy stripe along the waterline (phi ~ -15 deg on both sides)
    for c in (-0.26, math.pi + 0.26):
        d = np.abs(np.angle(np.exp(1j * (phi - c))))
        band = np.clip(1 - np.abs(d - 0.0) / 0.035, 0, 1)
        img = img * (1 - band[..., None]) + np.array([0.04, 0.16, 0.36], np.float32) * band[..., None]
    pil = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8))
    # the name on the side lobes' outer flanks, above the stripe: image rows run against v
    # (row = (1 - v) H).  Left side: phi 0..36 deg, read nose to tail, upright.  Right side:
    # phi 144..180 deg, seen from the right: turned half round.
    font = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSans-BoldItalic.ttf", 86)
    th = int(H * 0.095)
    for side, v1 in ((1, 0.10), (-1, 0.49)):
        txt = Image.new("RGBA", (int(W * 0.36), th), (0, 0, 0, 0))
        ImageDraw.Draw(txt).text((10, 2), "KUJIRA   MA-AS", font=font, fill=(16, 42, 92, 255))
        t = txt if side > 0 else txt.transpose(Image.ROTATE_180)
        pil.paste(t, (int(W * 0.30), int((1 - v1) * H)), t)
    pil.save(path, quality=90)


# ------------------------------------------------------------------------------------- build
def build(M, root, col, H):
    """H: helpers from build_b787 (add_part, cyl, dome, TB, RS, LOD, light, predicates)"""
    tex_dir = os.path.join(C.TEX_DIR, G.ASSET)
    os.makedirs(tex_dir, exist_ok=True)
    tp = os.path.join(tex_dir, "envelope_base.jpg")
    if not os.path.exists(tp) or not H["QUICK"]:
        envelope_texture(tp)
    M["envelope"] = C.pbr_material("Airship_Envelope", color=C.hex_color("#ffffff"), roughness=0.62,
                                   base_tex=tp)
    M["fin"] = C.pbr_material("Airship_Fin", color=C.hex_color("#f2f4f6"), roughness=0.5)
    M["duct"] = C.pbr_material("Airship_Duct", color=C.hex_color("#d9dde1"), roughness=0.35, metallic=0.2)
    M["pad"] = C.pbr_material("Airship_Pad", color=C.hex_color("#2c3036"), roughness=0.8)
    build_envelope(M, root, col, H)
    build_fins(M, root, col, H)
    build_ducts(M, root, col, H)
    build_pads(M, root, col, H)
    build_gondola_mount(M, root, col, H)


def build_envelope(M, root, col, H):
    na = H["RS"](128, 32)
    nt = H["RS"](110, 30)
    tt = (1 - np.cos(np.linspace(0, math.pi, nt))) / 2          # dense at the bow and stern
    phi = np.linspace(0, 2 * math.pi, na + 1)
    mb = C.MeshBuilder(TB)
    for lb in lobes():
        P = np.stack([lobe_point(lb, t, phi) for t in tt], 0)
        UV = np.zeros(P.shape[:2] + (2,))
        UV[..., 0] = tt[:, None]
        UV[..., 1] = (phi / (2 * math.pi))[None, :]
        ax = np.stack([P[..., 0], np.full(P.shape[:2], lb[2]), np.full(P.shape[:2], lb[3])], -1)
        N, _ = mb.grid_normals(P, wrap_v=True)
        if np.sum(N * (P - ax)) < 0:
            N = -N
        N[0] = (-1, 0, 0)
        N[-1] = (1, 0, 0)
        mb.add_grid(P, UV, N=N, mat=0)
    ob = mb.build("Envelope", [M["envelope"]], col=col)
    C.set_parent(ob, root)


def _fin_frame(phi):
    d = np.array([0.0, math.cos(phi), math.sin(phi)])      # span direction
    n = np.array([0.0, -math.sin(phi), math.cos(phi)])     # fin normal
    return d, n


def fin_point(phi, u, x, side, part=None):
    """point on a fin: u span fraction, x chord fraction, side +-1 (thickness side)"""
    F = A["fin"]
    lb = lobes()[0]
    d, n = _fin_frame(phi)
    s_root = F["s_root"]
    c0, c1, span, sweep = F["c_root"], F["c_tip"], F["span"], math.radians(F["sweep"])
    r0 = A["Rc"] * float(lobe_r((s_root + 0.4 * c0 - lb[0]) / lb[1])) * 0.82
    u = np.asarray(u, dtype=np.float64)
    x = np.asarray(x, dtype=np.float64)
    c = c0 + (c1 - c0) * u
    le = s_root + u * span * math.tan(sweep)
    xx = np.clip(x, 0, 1)
    th = 0.12 * c * 5 * (0.2969 * np.sqrt(xx) - 0.1260 * xx - 0.3516 * xx ** 2 + 0.2843 * xx ** 3 - 0.1036 * xx ** 4)
    base = np.array([0.0, lb[2], lb[3]])
    rr = r0 + u * span
    s = le + xx * c
    pts = (np.stack([s, np.zeros_like(s), np.zeros_like(s)], -1)
           + base + (rr[..., None] * d) + (side * th)[..., None] * n)
    return pts


def build_fins(M, root, col, H):
    F = A["fin"]
    add_part = H["add_part"]
    nu, nx = 14, 26
    xs = (1 - np.cos(np.linspace(0, math.pi, nx))) / 2
    fins = [(math.radians(45), "Rudder", "rudder", H["TE_RIGHT"]), (math.radians(135), "Rudder_B", "rudder", H["TE_RIGHT"]),
            (math.radians(315), "Elevator_L", "elevator", H["TE_DOWN"]), (math.radians(225), "Elevator_R", "elevator", H["TE_DOWN"])]
    mb = C.MeshBuilder(TB)
    xh = F["hinge"]
    u0, u1 = 0.18, 0.92
    for phi, pname, kind, pred in fins:
        d, n = _fin_frame(phi)
        us = np.unique(np.r_[np.linspace(0, 1, nu), [u0, u1]])
        # fixed part: the whole fin outside [u0, u1]; ahead of the hinge inside
        for (ua, ub, x1) in ((0.0, u0, 1.0), (u0, u1, xh - 0.01), (u1, 1.0, 1.0)):
            uu = us[(us >= ua - 1e-9) & (us <= ub + 1e-9)]
            xx = xs * x1
            for side in (1, -1):
                P = np.stack([fin_point(phi, np.full(nx, u_), xx, side) for u_ in uu], 0)
                mb.add_grid(P, outward=("dir", tuple(side * n)), mat=0)
            # trailing closures / tip caps
            Pa = np.stack([fin_point(phi, uu, np.full(len(uu), x1), 1), fin_point(phi, uu, np.full(len(uu), x1), -1)], 0)
            mb.add_grid(Pa, mat=0, outward=("dir", (1, 0, 0)))
        tip = np.concatenate([fin_point(phi, np.full(nx, 1.0), xs, 1), fin_point(phi, np.full(nx, 1.0), xs[::-1], -1)])
        mb.add_poly(tip, mat=0, outward=("dir", tuple(d)))
        # moving surface
        ms = C.MeshBuilder(TB)
        uu = us[(us >= u0) & (us <= u1)]
        xx = xh + (1 - xh) * xs
        for side in (1, -1):
            P = np.stack([fin_point(phi, np.full(nx, u_), xx, side) for u_ in uu], 0)
            ms.add_grid(P, outward=("dir", tuple(side * n)), mat=0)
        for u_ in (u0, u1):
            cap = np.concatenate([fin_point(phi, np.full(nx, u_), xx, 1), fin_point(phi, np.full(nx, u_), xx[::-1], -1)])
            ms.add_poly(cap, mat=0, outward=("dir", tuple(d * (1 if u_ == u1 else -1))))
        h0 = fin_point(phi, np.array([u0]), np.array([xh]), 0)[0]
        h1 = fin_point(phi, np.array([u1]), np.array([xh]), 0)[0]
        test = fin_point(phi, np.array([0.5 * (u0 + u1)]), np.array([1.0]), 0)
        add_part(pname, kind, ms, [M["fin"]], h0, h1, test, pred, 25, root, col, up_hint=(-1, 0, 0))
    ob = mb.build("Fins", [M["fin"]], col=col)
    C.set_parent(ob, root)


def duct_stations():
    """(s, y, z) of the four duct centres: front pair, aft pair (left first)"""
    out = []
    for s_, k in ((A["duct_s"][0], ""), (A["duct_s"][1], "2")):
        for sg in (1, -1):
            lb = lobes()[1 if sg > 0 else 2]
            t = (s_ - lb[0]) / lb[1]
            r = lb[4] * float(lobe_r(t))
            out.append((np.array([s_, lb[2] + sg * (r * 0.92 + A["duct_out"]), lb[3] - r * 0.38]), sg, k))
    return out


def build_ducts(M, root, col, H):
    add_part = H["add_part"]
    R = A["duct_R"]
    Ld = A["duct_L"]
    na = H["RS"](56, 16)
    th = np.linspace(0, 2 * math.pi, na + 1)
    strut = C.MeshBuilder(TB)
    for c, sg, k in duct_stations():
        L = ("L" if sg > 0 else "R") + k
        # duct ring: an airfoil-section annulus (inner radius R, chord Ld)
        prof = []
        for x in np.linspace(0, 1, 14):
            t = 0.16 * Ld * 5 * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
            prof.append((x * Ld, R + 0.06 + t * 1.6))
        for x in np.linspace(1, 0, 14):
            t = 0.16 * Ld * 5 * (0.2969 * math.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
            prof.append((x * Ld, R + 0.06 - t * 0.35))
        prof = np.array(prof)
        P = np.zeros((len(prof), na + 1, 3))
        for i, (a, r) in enumerate(prof):
            P[i, :, 0] = c[0] - Ld / 2 + a
            P[i, :, 1] = c[1] + r * np.cos(th)
            P[i, :, 2] = c[2] + r * np.sin(th)
        mb = C.MeshBuilder(TB)
        ctr = np.stack([P[..., 0], np.full(P.shape[:2], c[1]), np.full(P.shape[:2], c[2])], -1)
        N, _ = mb.grid_normals(P, wrap_v=True)
        mid = len(prof) // 4
        if np.sum(N[:mid] * (P[:mid] - ctr[:mid])) < 0:
            N = -N
        mb.add_grid(P, N=N, mat=0)
        # stator vanes + motor nacelle in the duct
        for a in np.linspace(0, 2 * math.pi, 5, endpoint=False):
            p0 = c + np.array([Ld * 0.25, 0.32 * math.cos(a), 0.32 * math.sin(a)])
            p1 = c + np.array([Ld * 0.25, (R + 0.08) * math.cos(a), (R + 0.08) * math.sin(a)])
            H["cyl"](mb, p0, p1, 0.05, 1, n=8)
        H["cyl"](mb, c + np.array([-Ld * 0.2, 0, 0]), c + np.array([Ld * 0.62, 0, 0]), 0.36, 1, n=24, r1=0.14)
        # the duct tilts about its lateral axis (vectoring)
        dk = add_part("Duct_" + L, "vector", mb, [M["duct"], M["eng_dark"]], c, c + np.array([0, 1.0, 0]),
                      c + np.array([[Ld, 0, 0]]), H["TE_DOWN"], 95, root, col)
        # fan: hub + five blades, spins about the duct axis
        fb = C.MeshBuilder(TB)
        H["dome"](fb, c + np.array([-0.05, 0, 0]), (-1, 0, 0), 0.34, 1, n=20, h=0.42)
        for kb in range(5):
            a = 2 * math.pi * kb / 5
            ca, sa = math.cos(a), math.sin(a)
            rr = np.linspace(0.3, R - 0.04, 8)
            tw = np.radians(np.interp(rr, [0.3, R], [42, 16]))
            ch = np.interp(rr, [0.3, R], [0.42, 0.26])
            lead = np.stack([np.full_like(rr, c[0]) - ch / 2 * np.cos(tw), c[1] + rr * ca - ch / 2 * np.sin(tw) * (-sa),
                             c[2] + rr * sa - ch / 2 * np.sin(tw) * ca], -1)
            trail = np.stack([np.full_like(rr, c[0]) + ch / 2 * np.cos(tw), c[1] + rr * ca + ch / 2 * np.sin(tw) * (-sa),
                              c[2] + rr * sa + ch / 2 * np.sin(tw) * ca], -1)
            Pb = np.stack([lead, trail], 1)
            fb.add_grid(Pb, mat=0, outward=("dir", (-1, 0, 0)))
            fb.add_grid(Pb[:, ::-1], mat=0, outward=("dir", (1, 0, 0)))
        add_part("Fan_" + L, "fan", fb, [M["fan"], M["spinner"]], c, c + np.array([-1.0, 0, 0]),
                 c + np.array([[0, 0, 1.0]]), lambda a_, b_: True, 0, dk, col)
        # strut from the lobe to the duct's tilt bearing
        lb = lobes()[1 if sg > 0 else 2]
        t = (c[0] - lb[0]) / lb[1]
        r = lb[4] * float(lobe_r(t))
        inner = np.array([c[0], lb[2] + sg * r * 0.80, lb[3] - r * 0.30])
        H["cyl"](strut, inner, c - np.array([0, sg * (R + 0.25), 0]), 0.32, 0, n=16, r1=0.22)
    ob = strut.build("DuctStruts", [M["duct"]], col=col)
    C.set_parent(ob, root)


def pad_points():
    """(s, y, z_top, z_bottom) of the landing pads (under the side lobes at the main-gear station)"""
    out = []
    for sg, lb in ((1, lobes()[1]), (-1, lobes()[2])):
        out.append((G.S_MAIN, lb[2], surface_z_below(lb, G.S_MAIN) + 0.6, G.GROUND_Z))
    return out


def build_pads(M, root, col, H):
    add_part = H["add_part"]
    for (s, y, zt, zb), L in zip(pad_points(), ("L", "R")):
        mb = C.MeshBuilder(TB)
        # an inflated skirt: rounded box section shrinking slightly to the ground
        na = 40
        th = np.linspace(0, 2 * math.pi, na + 1)
        zs = np.linspace(zt, zb, 10)
        P = np.zeros((len(zs), na + 1, 3))
        for i, z in enumerate(zs):
            k = 1.0 - 0.12 * ((z - zt) / (zb - zt)) ** 2
            a, b = 3.4 * k, 1.5 * k
            ct, st = np.cos(th), np.sin(th)
            P[i, :, 0] = s + a * np.sign(ct) * np.abs(ct) ** 0.5
            P[i, :, 1] = y + b * np.sign(st) * np.abs(st) ** 0.5
            P[i, :, 2] = z
        ctr = np.stack([P[..., 0], np.full(P.shape[:2], y), P[..., 2]], -1)
        N, _ = mb.grid_normals(P, wrap_v=True)
        if np.sum(N * (P - ctr)) < 0:
            N = -N
        mb.add_grid(P, N=N, mat=0)
        mb.add_poly(P[-1, :-1], mat=0, outward=("dir", (0, 0, -1)))
        test = np.array([[s, y, zb]])
        add_part("MainGear_" + L, "gear", mb, [M["pad"]], np.array([s, y, zt]), np.array([s + 1, y, zt]), test,
                 lambda a_, b_: True, 0, root, col,
                 extra=dict(contact=G.to_three([s, y, zb]), radius=0.6, wheels=[]))


def build_gondola_mount(M, root, col, H):
    """the gondola roof fairs into the centre lobe: a shallow saddle fairing"""
    lb = lobes()[0]
    mb = C.MeshBuilder(TB)
    ss = np.linspace(1.5, G.LENGTH - 2.0, 30)
    ys = np.linspace(-1, 1, 15)
    P = np.zeros((len(ss), len(ys), 3))
    for i, s in enumerate(ss):
        top = float(G.fus_profile(s)[0])
        zb = surface_z_below(lb, s)
        w = float(np.max(G.fus_section(s, np.linspace(0, 2 * math.pi, 181))[0])) * 0.86
        # a flat-topped fairing between the gondola roof and the hull
        P[i, :, 0] = s
        P[i, :, 1] = ys * w
        P[i, :, 2] = top + 0.02 + (zb + 0.4 - top) * (1 - np.abs(ys) ** 4)
    mb.add_grid(P, outward=("dir", (0, 0, 1)), mat=0)
    for side in (0, -1):
        Q = np.stack([P[:, side], P[:, side] - np.array([0, 0, 0.3])], 1)
        mb.add_grid(Q, mat=0, outward=("dir", (0, 1 if side == -1 else -1, 0)))
    ob = mb.build("GondolaFairing", [M["fuselage"]], col=col)
    C.set_parent(ob, root)


def lights(M, root, col, light):
    """exterior lights: nav lights on the side lobes' widest points, strobes, beacons"""
    for sg, lb, mat in ((1, lobes()[1], M["red"]), (-1, lobes()[2], M["green"])):
        L = "L" if sg > 0 else "R"
        t = 0.36
        p = lobe_point(lb, t, 0.0 if sg > 0 else math.pi)
        light("NavLight_" + L, p + np.array([0, sg * 0.05, 0]), (0, sg, 0), 0.12, mat)
        light("Strobe_" + L, p + np.array([0.6, sg * 0.05, 0]), (0, sg, 0), 0.1, M["strobe"])
        pt = lobe_point(lb, 0.985, 0.0 if sg > 0 else math.pi)
        light("NavTail_" + L, pt, (1, 0, 0), 0.08, M["white_light"])
        # logo lights: on the gondola roof sides, shining up onto the hull
        pl = np.array([G.LENGTH * 0.55, sg * 2.0, float(G.fus_profile(G.LENGTH * 0.55)[0]) + 0.05])
        light("LogoLight_" + L, pl, (0, sg * 0.5, 1), 0.08, M["landing"], h=0.03)
        pll = np.array([2.2, sg * 1.2, float(G.fus_profile(2.2)[1]) + 0.25])
        light("LandingLight_" + L, pll, (-1, 0, -0.25), 0.14, M["landing"], h=0.05)
        light("TurnoffLight_" + L, pll + np.array([0.5, sg * 0.5, 0.05]), (-1, sg * 0.5, -0.1), 0.08, M["landing"], h=0.04)
    c = lobes()[0]
    top = lobe_point(c, 0.40, math.pi / 2)
    light("Beacon_Top", top, (0, 0, 1), 0.3, M["beacon"], h=0.2)
    light("Beacon_Bottom", np.array([G.LENGTH * 0.5, 0, float(G.fus_profile(G.LENGTH * 0.5)[1]) - 0.02]), (0, 0, -1),
          0.16, M["beacon"], h=0.1)
    tail = lobe_point(c, 0.995, 0.0)
    light("Strobe_Tail", np.array([c[0] + c[1] + 0.05, 0, c[3]]), (1, 0, 0), 0.12, M["strobe"])


def meta(meta_, H):
    """the simulator's metadata: hull extremities as contact points, engines at the ducts, the
    airship flight-model parameters"""
    to3 = G.to_three
    c, l, r = lobes()
    L = A["L"]
    tc = 0.36
    wl = lobe_point(l, tc, 0.0)
    wr = lobe_point(r, tc, math.pi)
    meta_["length"] = L
    meta_["span"] = round(2 * float(wl[1]), 2)
    meta_["height"] = round(c[3] + c[4] - G.GROUND_Z, 2)
    meta_["wingTipL"] = to3(list(wl))
    meta_["wingTipR"] = to3(list(wr))
    meta_["noseTip"] = to3([c[0], 0, c[3]])
    stern = lobe_point(c, 0.97, -math.pi / 2)
    meta_["tailStrike"] = to3([float(stern[0]), 0, float(stern[2])])
    meta_["flapTipL"] = None
    meta_["flapTipR"] = None
    meta_["wingVapor"] = []
    ds = duct_stations()
    fl = [d for d in ds if d[1] > 0]
    fr = [d for d in ds if d[1] < 0]
    mean = lambda pts: np.mean([p[0] for p in pts], 0)  # noqa: E731
    ml, mr = mean(fl), mean(fr)
    meta_["engineCount"] = 4
    meta_["prop"] = True
    meta_["engineAxisL"] = to3(list(ml))
    meta_["engineAxisR"] = to3(list(mr))
    meta_["engineL"] = to3(list(ml - np.array([0, 0, A["duct_R"]])))
    meta_["engineR"] = to3(list(mr - np.array([0, 0, A["duct_R"]])))
    meta_["engineExit"] = to3(list(ml + np.array([A["duct_L"], 0, 0])))
    meta_["engineAxes"] = [to3(list(d[0])) for d in ds]
    meta_["enginePods"] = [to3(list(d[0] - np.array([0, 0, A["duct_R"]]))) for d in ds]
    meta_["fanRadius"] = A["duct_R"]
    meta_["fanBlades"] = 5
    p = pad_points()
    meta_["mainGearL"] = to3([p[0][0], p[0][1], p[0][3]])
    meta_["mainGearR"] = to3([p[1][0], p[1][1], p[1][3]])
    # hull volume (the three lobes, overlap ignored) and the flight-model reference values
    tt = np.linspace(0, 1, 400)
    vol = float(sum(G._trapz(math.pi * (lb[4] * lobe_r(tt)) ** 2, tt * lb[1]) for lb in lobes())) * 0.92
    sref = vol ** (2 / 3)
    meta_["airship"] = dict(
        volume=round(vol), sref=round(sref, 1), lref=L, cd0=A["cd0"], cla=A["cla"], heavy=A["heavy"],
        hcb=A["hcb"], kx=A["kx"], ky=A["ky"], engArm=round(abs(float(ml[1])), 2),
        vectorMax=90)
    meta_["fixedGear"] = True
