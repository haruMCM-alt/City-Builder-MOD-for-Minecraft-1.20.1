"""
Procedural Boeing 787-9 for Blender (run with Blender's Python or `pip install bpy`).

    python3 build_b787.py            # full build (textures + .blend + .glb)
    python3 build_b787.py --quick    # skip texture generation (reuse existing)

Output:
    output/b787-9.blend
    ../web/assets/b787-9.glb
    ../web/assets/b787-9.json   (physical / animation metadata for the simulator)

Every animated part is its own object whose local +X axis is the hinge axis,
oriented so that a POSITIVE rotation is the "natural" deflection named in the
JSON (flaps/ailerons/elevator: trailing edge down, spoilers: up, rudder:
trailing edge right, slats: extend, gear: retract, doors: open).
"""
import json
import time
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import b787_geometry as G  # noqa: E402
import common as C  # noqa: E402

QUICK = "--quick" in sys.argv
LOD = "--lod" in sys.argv
RES = 0.28 if LOD else 1.0


def RS(n, lo=4):
    """Scale a mesh resolution by the global LOD factor."""
    return max(lo, int(round(n * RES)))
TB = G.to_blender
PARTS = []          # animation metadata


# ---------------------------------------------------------------------------
# Materials
# ---------------------------------------------------------------------------
def tex(name):
    p = os.path.join(C.TEX_DIR, name)
    return p if os.path.exists(p) else None


def make_materials():
    M = {}
    M["fuselage"] = C.pbr_material(
        "B787_Fuselage", color=C.hex_color("#f3f5f7"), roughness=0.32,
        base_tex=tex("fuselage_base.jpg"), orm_tex=tex("fuselage_orm.jpg"),
        normal_tex=tex("fuselage_normal.png"), emissive_tex=tex("fuselage_emissive.jpg"),
        emission_strength=1.0, normal_strength=1.0, clearcoat=0.6)
    M["tail"] = C.pbr_material("B787_Tail", color=C.hex_color("#0b2a5c"), roughness=0.3,
                               base_tex=tex("tail_base.jpg"), clearcoat=0.6)
    M["wing"] = C.pbr_material("B787_WingPaint", color=C.hex_color("#c9ced4"), roughness=0.42,
                               metallic=0.05, base_tex=tex("wing_base.jpg"),
                               normal_tex=tex("wing_normal.png"), normal_strength=0.8)
    M["wing_dark"] = C.pbr_material("B787_WingDark", color=C.hex_color("#8f969e"), roughness=0.5,
                                    metallic=0.1)
    M["le"] = C.pbr_material("B787_LeadingEdge", color=C.hex_color("#d4d8dc"), roughness=0.25,
                             metallic=0.55)
    M["belly"] = C.pbr_material("B787_Navy", color=C.hex_color("#0b2a5c"), roughness=0.3, clearcoat=0.5)
    M["nacelle"] = C.pbr_material("B787_Nacelle", color=C.hex_color("#0b2a5c"), roughness=0.28,
                                  base_tex=tex("nacelle_base.jpg"), clearcoat=0.6)
    M["lip"] = C.pbr_material("B787_InletLip", color=C.hex_color("#cfd4d8"), roughness=0.32,
                              metallic=1.0)
    M["inlet"] = C.pbr_material("B787_InletLiner", color=C.hex_color("#6b7075"), roughness=0.6,
                                metallic=0.2)
    M["fan"] = C.pbr_material("B787_FanBlade", color=C.hex_color("#2b2f35"), roughness=0.35,
                              metallic=0.45)
    M["spinner"] = C.pbr_material("B787_Spinner", color=C.hex_color("#1c1f23"), roughness=0.25,
                                  metallic=0.3, base_tex=tex("spinner_base.jpg"))
    M["eng_dark"] = C.pbr_material("B787_EngineDark", color=C.hex_color("#121416"), roughness=0.7)
    M["core"] = C.pbr_material("B787_CoreCowl", color=C.hex_color("#a4a9ae"), roughness=0.35,
                               metallic=0.8)
    M["exhaust"] = C.pbr_material("B787_Exhaust", color=C.hex_color("#5a4f47"), roughness=0.45,
                                  metallic=0.9)
    M["gear"] = C.pbr_material("B787_GearPaint", color=C.hex_color("#d8dbdd"), roughness=0.4,
                               metallic=0.2)
    M["chrome"] = C.pbr_material("B787_Chrome", color=C.hex_color("#eef0f2"), roughness=0.08,
                                 metallic=1.0)
    M["tire"] = C.pbr_material("B787_Tire", color=C.hex_color("#151515"), roughness=0.88,
                               base_tex=tex("tire_base.jpg"))
    M["hub"] = C.pbr_material("B787_WheelHub", color=C.hex_color("#b9bec3"), roughness=0.3,
                              metallic=0.9)
    M["bay"] = C.pbr_material("B787_GearBay", color=C.hex_color("#7d858c"), roughness=0.6)
    M["black"] = C.pbr_material("B787_Black", color=C.hex_color("#0d0e10"), roughness=0.5)
    M["antenna"] = C.pbr_material("B787_Antenna", color=C.hex_color("#e9ecef"), roughness=0.35)
    M["red"] = C.pbr_material("B787_LightRed", color=(1, 0.02, 0.02, 1), roughness=0.2,
                              emission=(1, 0.02, 0.01, 1), emission_strength=4.0)
    M["green"] = C.pbr_material("B787_LightGreen", color=(0.02, 1, 0.1, 1), roughness=0.2,
                                emission=(0.02, 1, 0.12, 1), emission_strength=4.0)
    M["white_light"] = C.pbr_material("B787_LightWhite", color=(1, 1, 1, 1), roughness=0.2,
                                      emission=(1, 1, 0.95, 1), emission_strength=4.0)
    M["strobe"] = C.pbr_material("B787_Strobe", color=(1, 1, 1, 1), roughness=0.2,
                                 emission=(1, 1, 1, 1), emission_strength=0.0)
    M["beacon"] = C.pbr_material("B787_Beacon", color=(0.9, 0.05, 0.02, 1), roughness=0.2,
                                 emission=(1, 0.03, 0.01, 1), emission_strength=0.0)
    M["landing"] = C.pbr_material("B787_LandingLight", color=(0.95, 0.95, 1.0, 1), roughness=0.05,
                                  metallic=0.5, emission=(1, 0.97, 0.9, 1), emission_strength=0.0)
    return M


# ---------------------------------------------------------------------------
# Generic lifting-surface lofts
# ---------------------------------------------------------------------------
def analytic_normals(fun, SP, X, UP, side, e=1e-4):
    """Normals of a surface given as fun(span, x, upper) -> (...,3)."""
    dPs = (fun(SP + e, X, UP) - fun(SP - e, X, UP)) / (2 * e)
    Xp = np.clip(X + e, 0, 1)
    Xm = np.clip(X - e, 0, 1)
    dPx = (fun(SP, Xp, UP) - fun(SP, Xm, UP)) / np.maximum(Xp - Xm, 1e-9)[..., None]
    N = np.cross(dPs, dPx)
    N /= np.maximum(np.linalg.norm(N, axis=-1, keepdims=True), 1e-12)
    return N


def orient(N, ref_dir, mask=None):
    """Flip the whole normal field so that it mostly agrees with ref_dir."""
    d = np.sum(N * np.asarray(ref_dir), axis=-1)
    if mask is not None:
        d = d[mask]
    return N if d.sum() >= 0 else -N


def lifting_loop(mb, fun, spans, x0, x1, front, mat, up_dir, cap0=True, cap1=True,
                 nch=None, cap_dir=(0, 1, 0), uv_span=1.0, mat_le=None, le_split=None,
                 mat_te=None):
    """Loft a lifting surface portion x0..x1 over the list of span stations.

    fun(span, x, upper) -> design point. up_dir: 'upper' normal reference.
    front: 'le' (x0 == 0, closed leading edge), 'round' (bullnose), 'cut'.
    Returns loop grid (for pivots / tests).
    """
    spans = np.asarray(spans, dtype=np.float64)
    ns = len(spans)
    nch = RS(34, 8) if nch is None else RS(nch, 6)
    xs = G.cos_space(x0, x1, nch) if front == "le" else np.linspace(x0, x1, nch) ** 1.0
    if front != "le":
        # still cluster points near the front for curvature
        t = np.linspace(0, 1, nch)
        xs = x0 + (x1 - x0) * (1 - np.cos(t * math.pi / 2))
    SPg = spans[:, None]
    up_dir = np.asarray(up_dir, dtype=np.float64)

    def surf(xarr, upper):
        X = np.broadcast_to(xarr[None, :], (ns, len(xarr)))
        S = np.broadcast_to(SPg, X.shape)
        U = np.full(X.shape, upper)
        P = fun(S, X, U)
        N = analytic_normals(fun, S, X, U, None)
        N = orient(N, up_dir if upper else -up_dir)
        return P, N

    Pu, Nu = surf(xs, True)
    Pl, Nl = surf(xs, False)
    if front == "le":
        # shared LE vertex: average normal of upper & lower (points forward)
        nle = Nu[:, 0] + Nl[:, 0]
        nle /= np.maximum(np.linalg.norm(nle, axis=-1, keepdims=True), 1e-12)
        Pl_r = Pl[:, ::-1]
        Nl_r = Nl[:, ::-1].copy()
        Nl_r[:, -1] = nle
        P = np.concatenate([Pl_r, Pu[:, 1:]], axis=1)
        N = np.concatenate([Nl_r, Nu[:, 1:]], axis=1)
        vparam = np.r_[-xs[::-1], xs[1:]]
    elif front == "round":
        k = 9
        c = 0.5 * (Pu[:, 0] + Pl[:, 0])
        r = Pu[:, 0] - c
        rl = np.linalg.norm(r, axis=-1, keepdims=True)
        # forward = -chord direction
        fwd = Pu[:, 0] - Pu[:, 1]
        fwd -= np.sum(fwd * r / np.maximum(rl ** 2, 1e-12), axis=-1, keepdims=True) * r
        fwd /= np.maximum(np.linalg.norm(fwd, axis=-1, keepdims=True), 1e-12)
        ang = np.linspace(math.pi, 0, k + 2)[1:-1]   # lower -> upper
        # angle a from lower (pi) to upper (0), bulging forward
        arc = np.stack([c + r * math.cos(a) + fwd * rl * math.sin(a) * 1.0 for a in ang], axis=1)
        Narc = np.stack([r / np.maximum(rl, 1e-9) * math.cos(a) + fwd * math.sin(a) for a in ang], axis=1)
        P = np.concatenate([Pl[:, ::-1], arc, Pu], axis=1)
        N = np.concatenate([Nl[:, ::-1], Narc, Nu], axis=1)
        vparam = np.r_[-xs[::-1], np.zeros(k), xs]
    else:
        P = np.concatenate([Pl[:, ::-1], Pu], axis=1)
        N = np.concatenate([Nl[:, ::-1], Nu], axis=1)
        vparam = np.r_[-xs[::-1], xs]
        # front cut strip
        strip = np.stack([Pu[:, 0], Pl[:, 0]], axis=1)
        fwd = Pu[:, 0] - Pu[:, 1]
        mb.add_grid(strip, outward=("dir", fwd.mean(0)), mat=mat, smooth=False)
        P_split = None
    # UVs: u span, v around
    UV = np.zeros(P.shape[:2] + (2,))
    UV[..., 0] = (spans[:, None] / uv_span)
    UV[..., 1] = 0.5 + 0.5 * vparam[None, :]
    if le_split is not None and mat_le is not None and front == "le":
        # split the loop into LE-material band and rest
        xa = le_split
        mask_le = np.abs(vparam) <= xa
        idx = np.where(mask_le)[0]
        i0, i1 = idx[0], idx[-1]
        mb.add_grid(P[:, :i0 + 1], UV[:, :i0 + 1], N=N[:, :i0 + 1], mat=mat)
        mb.add_grid(P[:, i0:i1 + 1], UV[:, i0:i1 + 1], N=N[:, i0:i1 + 1], mat=mat_le)
        mb.add_grid(P[:, i1:], UV[:, i1:], N=N[:, i1:], mat=mat)
    else:
        mb.add_grid(P, UV, N=N, mat=mat)
    # aft strip (TE or cut) : lower(x1) -> upper(x1)
    strip = np.stack([Pl[:, -1], Pu[:, -1]], axis=1)
    aft = Pu[:, -1] - Pu[:, -2]
    mb.add_grid(strip, outward=("dir", aft.mean(0)), mat=mat_te if mat_te is not None else mat,
                smooth=False)
    cap_dir = np.asarray(cap_dir, dtype=np.float64)
    if cap0:
        mb.add_poly(P[0], mat=mat, outward=("dir", -cap_dir))
    if cap1:
        mb.add_poly(P[-1], mat=mat, outward=("dir", cap_dir))
    return P


def span_stations(y0, y1, base):
    st = [y for y in base if y0 < y < y1]
    return np.array([y0] + st + [y1])


# ---------------------------------------------------------------------------
# Pivot helpers
# ---------------------------------------------------------------------------
def rodrigues(v, k, a):
    k = k / np.linalg.norm(k)
    return v * math.cos(a) + np.cross(k, v) * math.sin(a) + np.outer(v @ k, k) * (1 - math.cos(a))


def pivot_matrix(p0, axis, up_hint=(0, 0, 1)):
    """4x4 matrix (Blender frame) whose X axis = axis, origin p0."""
    x = np.asarray(axis, dtype=np.float64)
    x /= np.linalg.norm(x)
    up = np.asarray(up_hint, dtype=np.float64)
    if abs(np.dot(up, x)) > 0.95:
        up = np.array([1.0, 0, 0]) if abs(x[0]) < 0.9 else np.array([0, 1.0, 0])
    z = up - np.dot(up, x) * x
    z /= np.linalg.norm(z)
    y = np.cross(z, x)
    M = np.eye(4)
    M[:3, 0], M[:3, 1], M[:3, 2], M[:3, 3] = x, y, z, p0
    return M


def choose_axis(test_pts_design, h0_design, h1_design, predicate):
    """Return Blender-frame (p0, axis) for a hinge so that +angle satisfies predicate.

    predicate(old_pts_blender, new_pts_blender) -> bool
    """
    p0 = TB(np.asarray(h0_design))
    p1 = TB(np.asarray(h1_design))
    axis = p1 - p0
    axis /= np.linalg.norm(axis)
    pts = TB(np.asarray(test_pts_design).reshape(-1, 3))
    rot = rodrigues(pts - p0, axis, math.radians(10)) + p0
    if not predicate(pts, rot):
        axis = -axis
    return p0, axis


def add_part(name, kind, mb, mats, h0, h1, test_pts, predicate, max_deg, parent,
             col, up_hint=(0, 0, 1), extra=None):
    p0, axis = choose_axis(test_pts, h0, h1, predicate)
    M = pivot_matrix(p0, axis, up_hint)
    ob = mb.build(name, mats, col=col, matrix=M)
    C.set_parent(ob, parent)
    info = dict(name=name, kind=kind, max=max_deg)
    if extra:
        info.update(extra)
    PARTS.append(info)
    return ob


TE_DOWN = lambda a, b: b[:, 2].mean() < a[:, 2].mean()          # noqa: E731
TE_UP = lambda a, b: b[:, 2].mean() > a[:, 2].mean()            # noqa: E731
TE_RIGHT = lambda a, b: b[:, 1].mean() < a[:, 1].mean()         # noqa: E731 (Blender -Y = right)
MOVE_FWD = lambda a, b: b[:, 0].mean() > a[:, 0].mean()         # noqa: E731 (Blender +X = fwd)


# ---------------------------------------------------------------------------
# Fuselage
# ---------------------------------------------------------------------------
def build_fuselage(M, root, col):
    st = G.fus_stations()
    if LOD:
        st = np.unique(np.r_[st[::3], st[-1]])
    nv = RS(192, 32)
    phi = np.linspace(0.0, 2 * math.pi, nv + 1)
    P = np.zeros((len(st) + 1, nv + 1, 3))
    UV = np.zeros((len(st) + 1, nv + 1, 2))
    tip = np.array([0.0, 0.0, float(G.fus_profile(0.0)[3])])
    P[0] = tip
    UV[0, :, 0] = 0.0
    UV[0, :, 1] = np.linspace(0, 1, nv + 1)
    for i, s in enumerate(st, start=1):
        y, z = G.fus_section(s, phi)
        P[i, :, 0] = s
        P[i, :, 1] = y
        P[i, :, 2] = z
        seg = np.hypot(np.diff(y), np.diff(z))
        arc = np.r_[0, np.cumsum(seg)]
        UV[i, :, 0] = s / G.LENGTH
        UV[i, :, 1] = arc / arc[-1]
    mb = C.MeshBuilder(TB)
    N, bad = mb.grid_normals(P, wrap_v=True)
    N[0] = (-1.0, 0.0, 0.0)
    # outward check
    ctr = np.stack([P[:, :, 0], 0 * P[:, :, 1], P[:, :, 2].mean(axis=1, keepdims=True).repeat(nv + 1, 1)], -1)
    if np.sum(N[1:] * (P[1:] - ctr[1:])) < 0:
        N = -N
        N[0] = (-1.0, 0.0, 0.0)
    mb.add_grid(P, UV, N=N, mat=0)
    # APU exhaust at the tail cone
    last = P[-1]
    c = np.array([G.LENGTH, 0.0, last[:, 2].mean()])
    ring_in = c + (last - c) * 0.72
    rim = np.stack([last, ring_in], axis=0)
    mb.add_grid(rim, outward=("dir", (1, 0, 0)), mat=1, smooth=False)
    deep = ring_in.copy()
    deep[:, 0] -= 0.45
    tube = np.stack([ring_in, deep], axis=0)
    mb.add_grid(tube, outward=c + np.array([-0.2, 0, 0]), mat=1)
    ob = mb.build("Fuselage", [M["fuselage"], M["exhaust"]], col=col)
    C.set_parent(ob, root)
    return ob


# ---------------------------------------------------------------------------
# Main wing + moving surfaces
# ---------------------------------------------------------------------------
WING_BASE = None


def wing_fun(side):
    def f(S, X, U):
        return G.wing_point(S, X, U, side)
    return f


def build_wing(M, root, col, side):
    L = "L" if side > 0 else "R"
    f = wing_fun(side)
    up = (0, 0, 1)
    brk = [G.FLAP_IN["y0"], G.FLAP_IN["y1"], G.FLAPERON["y0"], G.FLAPERON["y1"],
           G.FLAP_OUT["y0"], G.FLAP_OUT["y1"], G.AILERON["y0"], G.AILERON["y1"],
           G.SLAT["y0"], G.SLAT["y1"], G.Y_KINK, G.Y_RAKE] + list(G.SLAT_SPLITS)
    base = np.unique(np.r_[np.linspace(1.2, G.Y_TIP, RS(110)), np.linspace(G.Y_KINK - 1.6, G.Y_KINK + 1.6, RS(12)),
                           np.linspace(G.Y_RAKE, G.Y_TIP, RS(12)), brk])
    sd = (0, side, 0)
    mb = C.MeshBuilder(TB)
    gap = 0.004
    segs = [
        (1.2, G.FLAP_IN["y0"], 0.0, 1.0, "le"),
        (G.FLAP_IN["y0"], G.FLAP_IN["y1"], 0.0, G.FLAP_IN["x0"], "le"),
        (G.FLAP_IN["y1"], G.FLAPERON["y0"], 0.0, 1.0, "le"),
        (G.FLAPERON["y0"], G.SLAT["y0"], 0.0, G.FLAPERON["x0"], "le"),
        (G.SLAT["y0"], G.FLAPERON["y1"], G.SLAT["x1"] + gap, G.FLAPERON["x0"], "round"),
        (G.FLAPERON["y1"], G.FLAP_OUT["y0"], G.SLAT["x1"] + gap, 1.0, "round"),
        (G.FLAP_OUT["y0"], G.FLAP_OUT["y1"], G.SLAT["x1"] + gap, G.FLAP_OUT["x0"], "round"),
        (G.FLAP_OUT["y1"], G.AILERON["y0"], G.SLAT["x1"] + gap, 1.0, "round"),
        (G.AILERON["y0"], G.AILERON["y1"], G.SLAT["x1"] + gap, G.AILERON["x0"], "round"),
        (G.AILERON["y1"], G.Y_TIP, 0.0, 1.0, "le"),
    ]
    for (y0, y1, x0, x1, front) in segs:
        spans = span_stations(y0, y1, base)
        lifting_loop(mb, f, spans, x0, x1, front, 0, up, cap_dir=sd, uv_span=G.Y_TIP,
                     mat_le=2, le_split=0.06 if front == "le" else None)
    wing = mb.build("Wing_" + L, [M["wing"], M["wing_dark"], M["le"]], col=col)
    C.set_parent(wing, root)

    # --- flap track fairings (fixed forward halves) --------------------------
    ftf_y = [6.3, 13.9, 17.4, 20.6] if True else []
    fair = C.MeshBuilder(TB)
    moving_fairings = {}
    for yf in ftf_y:
        le = float(G.wing_le(yf))
        c = float(G.wing_chord(yf))
        s0 = le + 0.45 * c
        s1 = float(G.wing_te(yf)) + 0.30 * c
        length = s1 - s0
        n_s, n_a = 26, 20
        t = np.linspace(0, 1, n_s)
        ss = s0 + t * length
        # depth below the wing lower surface
        depth = 0.62 * c * 0.14 * np.sin(np.clip(t, 0, 1) ** 0.6 * math.pi) ** 0.9 + 0.02
        width = 0.34 * np.sin(np.clip(t, 0, 1) ** 0.5 * math.pi) ** 0.8 + 0.01
        xs = np.clip((ss - le) / c, 0, 1)
        zl = G.wing_point(np.full_like(xs, yf), xs, np.zeros_like(xs, bool), side)[:, 2]
        # beyond TE continue straight
        ang = np.linspace(0, math.pi, n_a)
        P = np.zeros((n_s, n_a, 3))
        for i in range(n_s):
            P[i, :, 0] = ss[i]
            P[i, :, 1] = side * yf + width[i] * np.cos(ang)
            P[i, :, 2] = zl[i] + 0.05 - (depth[i] + 0.05) * np.sin(ang)
        split = int(n_s * 0.42)
        fair.add_grid(P[:split + 1], outward=(side * 0 + P[:split + 1, :, 0].mean(), side * yf, zl.mean() + 0.3), mat=0)
        moving_fairings[yf] = P[split:]
    ob = fair.build("FlapFairings_" + L, [M["wing"]], col=col)
    C.set_parent(ob, root)

    # --- moving surfaces -------------------------------------------------------
    def surf_part(name, kind, spec, x0, x1, hinge_x, drop, predicate, max_deg, front="round",
                  fairings=(), spoiler=False):
        y0, y1 = spec[0] + 0.02, spec[1] - 0.02
        spans = span_stations(y0, y1, base)
        mb2 = C.MeshBuilder(TB)
        if spoiler:
            # thin plate riding 12 mm proud of the upper surface
            xs = np.linspace(x0, x1, 10)
            S, X = np.meshgrid(spans, xs, indexing="ij")
            U = np.ones_like(S, bool)
            Pt = f(S, X, U)
            Nn = orient(analytic_normals(f, S, X, U, None), up)
            top = Pt + Nn * 0.014
            bot = Pt - Nn * 0.006
            UVs = np.stack([S / G.Y_TIP, X], -1)
            mb2.add_grid(top, UVs, N=Nn, mat=0)
            mb2.add_grid(bot[:, ::-1], UVs, N=-Nn[:, ::-1], mat=0)
            for edge in (0, -1):
                strip = np.stack([top[:, edge], bot[:, edge]], 1)
                mb2.add_grid(strip, outward=("dir", (1, 0, 0) if edge == -1 else (-1, 0, 0)), mat=0, smooth=False)
            for edge in (0, -1):
                strip = np.stack([top[edge], bot[edge]], 1)
                mb2.add_grid(strip, outward=("dir", (0, side * (1 if edge == -1 else -1), 0)), mat=0, smooth=False)
            h0 = f(np.array(y0), np.array(x0), np.array(True)) + 0.0
            h1 = f(np.array(y1), np.array(x0), np.array(True))
            test = f(spans, np.full_like(spans, x1), np.ones_like(spans, bool))
            mats = [M["wing"]]
        else:
            lifting_loop(mb2, f, spans, x0, x1, front, 0, up, cap_dir=sd, uv_span=G.Y_TIP,
                         mat_le=2, le_split=0.03 if front == "le" else None)
            # hinge line
            def hp(yy):
                pu = f(np.array(yy), np.array(hinge_x), np.array(True))
                pl = f(np.array(yy), np.array(hinge_x), np.array(False))
                p = 0.5 * (pu + pl)
                p[2] -= drop
                return p
            h0, h1 = hp(y0), hp(y1)
            test = f(spans, np.ones_like(spans), np.ones_like(spans, bool))
            if kind == "slat":
                test = f(spans, np.zeros_like(spans), np.ones_like(spans, bool))
            mats = [M["wing"], M["wing_dark"], M["le"]]
            for yf in fairings:
                if yf in moving_fairings:
                    Pm = moving_fairings[yf]
                    mb2.add_grid(Pm, outward=(Pm[:, :, 0].mean(), side * yf, Pm[:, :, 2].mean() + 0.3), mat=0)
        ob = add_part(name, kind, mb2, mats, h0, h1, test, predicate, max_deg, root, col)
        return ob

    surf_part("FlapInbd_" + L, "flap", (G.FLAP_IN["y0"], G.FLAP_IN["y1"]), G.FLAP_IN["x0"] - 0.035, 1.0,
              G.FLAP_IN["x0"] + 0.02, 0.42, TE_DOWN, 36, fairings=(6.3,))
    surf_part("Flaperon_" + L, "flaperon", (G.FLAPERON["y0"], G.FLAPERON["y1"]), G.FLAPERON["x0"] - 0.03, 1.0,
              G.FLAPERON["x0"] + 0.015, 0.0, TE_DOWN, 30)
    surf_part("FlapOutbd_" + L, "flap", (G.FLAP_OUT["y0"], G.FLAP_OUT["y1"]), G.FLAP_OUT["x0"] - 0.035, 1.0,
              G.FLAP_OUT["x0"] + 0.02, 0.36, TE_DOWN, 36, fairings=(13.9, 17.4, 20.6))
    surf_part("Aileron_" + L, "aileron", (G.AILERON["y0"], G.AILERON["y1"]), G.AILERON["x0"] - 0.03, 1.0,
              G.AILERON["x0"] + 0.015, 0.0, TE_DOWN, 25)
    for i, (a, b) in enumerate(G.SPOILERS, start=1):
        surf_part("Spoiler%d_%s" % (i, L), "spoiler", (a, b), G.SPOILER_X[0], G.SPOILER_X[1], 0, 0,
                  TE_UP, 60, spoiler=True)
    for i in range(len(G.SLAT_SPLITS) - 1):
        a, b = G.SLAT_SPLITS[i], G.SLAT_SPLITS[i + 1]
        y0, y1 = a + 0.02, b - 0.02
        spans = span_stations(y0, y1, base)
        mb2 = C.MeshBuilder(TB)
        lifting_loop(mb2, f, spans, 0.0, G.SLAT["x1"], "le", 0, up, cap_dir=sd, uv_span=G.Y_TIP,
                     mat_le=1, le_split=0.05)

        def slat_hinge(yy):
            # Virtual track centre chosen so that a 20 deg nose-down rotation moves the
            # leading edge 3.5 % chord forward and 7 % chord down; the slat trailing edge
            # slides down along the fixed leading-edge nose, leaving only a small slot.
            c = float(G.wing_chord(yy))
            p = f(np.array(yy), np.array(0.0), np.array(True)).copy()
            th = math.radians(20)
            R = np.array([[math.cos(th), -math.sin(th)], [math.sin(th), math.cos(th)]])  # (s aft, z up)
            dL = np.array([-0.035 * c, -0.07 * c])
            off = np.linalg.solve(R - np.eye(2), dL)          # p - centre
            p[0] -= off[0]
            p[2] -= off[1]
            return p
        test = f(spans, np.zeros_like(spans), np.ones_like(spans, bool))
        pred = MOVE_FWD
        add_part("Slat%d_%s" % (i + 1, L), "slat", mb2, [M["wing"], M["le"]], slat_hinge(y0), slat_hinge(y1),
                 test, pred, 22, root, col)
    return wing


# ---------------------------------------------------------------------------
# Engines
# ---------------------------------------------------------------------------
def profile_normals(prof):
    prof = np.asarray(prof, dtype=np.float64)
    d = np.gradient(prof, axis=0)
    n = np.stack([-d[:, 1], d[:, 0]], -1)   # (-dr, da): outward for +a traversal
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-12)
    return n


def revolve_grid(prof, center, n=96, theta=None, a_override=None, r_override=None):
    """Revolve (a, r) around +s axis at design centre. Returns P, N(analytic), UV."""
    prof = np.asarray(prof, dtype=np.float64)
    th = np.linspace(0, 2 * math.pi, n + 1) if theta is None else theta
    A = np.repeat(prof[:, 0:1], len(th), 1) if a_override is None else a_override
    R = np.repeat(prof[:, 1:2], len(th), 1) if r_override is None else r_override
    cs, cy, cz = center
    P = np.stack([cs + A, cy + R * np.sin(th)[None, :], cz + R * np.cos(th)[None, :]], -1)
    pn = profile_normals(prof)
    N = np.stack([np.repeat(pn[:, 0:1], len(th), 1),
                  pn[:, 1:2] * np.sin(th)[None, :],
                  pn[:, 1:2] * np.cos(th)[None, :]], -1)
    seg = np.r_[0, np.cumsum(np.hypot(np.diff(prof[:, 0]), np.diff(prof[:, 1])))]
    UV = np.stack([np.repeat((th / (2 * math.pi))[None, :], len(prof), 0),
                   np.repeat((seg / max(seg[-1], 1e-9))[:, None], len(th), 1)], -1)
    return P, N, UV


def build_engine(M, root, col, side):
    L = "L" if side > 0 else "R"
    cen = np.array([G.ENG_S_HL, side * G.ENG_Y, G.ENG_Z])
    mb = C.MeshBuilder(TB)
    n = RS(128, 24)
    th = np.linspace(0, 2 * math.pi, n + 1)
    # ---- inlet (inner) + lip + outer cowl -----------------------------------
    inner = [(a, r) for (a, r) in reversed(G.NAC_INNER)]
    outer = list(G.NAC_OUTER[1:])
    prof = np.array(inner + outer)
    # profile goes: fan face (inside) -> highlight -> outer aft; normals outward
    P, N, UV = revolve_grid(prof, cen, n)
    # orientation: at the outer max point normal must point away from axis
    i_out = len(inner) + 3
    if N[i_out, 0, 2] < 0:
        N = -N
    ni = len(inner)
    lip_in = ni - 3      # inner lip rows
    lip_out = ni + 4     # outer lip rows
    mb.add_grid(P[:lip_in + 1], UV[:lip_in + 1], N=N[:lip_in + 1], mat=2)            # inlet liner
    mb.add_grid(P[lip_in:lip_out + 1], UV[lip_in:lip_out + 1], N=N[lip_in:lip_out + 1], mat=1)  # lip
    mb.add_grid(P[lip_out:], UV[lip_out:], N=N[lip_out:], mat=0)                      # cowl
    # ---- chevron nozzle -------------------------------------------------------
    a_start, r_start = G.NAC_OUTER[-1]
    t = (th * G.CHEVRONS / (2 * math.pi)) % 1.0
    tri = np.abs(2 * t - 1)                  # 1 at valleys, 0 at tips
    a_exit = a_start + 0.38 - 0.30 * tri
    k = 10
    ss = np.linspace(0, 1, k)[:, None]
    A = a_start + (a_exit[None, :] - a_start) * ss
    slope = (G.NAC_OUTER[-1][1] - G.NAC_OUTER[-2][1]) / (G.NAC_OUTER[-1][0] - G.NAC_OUTER[-2][0])
    R = r_start + slope * (A - a_start) - 0.035 * (1 - tri)[None, :] * ss ** 2
    Pc = np.stack([cen[0] + A, cen[1] + R * np.sin(th), cen[2] + R * np.cos(th)], -1)
    UVc = np.stack([np.repeat(th[None] / (2 * math.pi), k, 0), 1 + 0.1 * ss.repeat(n + 1, 1)], -1)
    mb.add_grid(Pc, UVc, outward=("dir", (0, 0, 0)) if False else None, mat=3,
                N=None)
    # fix orientation of the chevron band (outward from axis)
    last = mb.norms[-1].reshape(k, n + 1, 3)
    radial = np.stack([0 * R, np.sin(th)[None].repeat(k, 0), np.cos(th)[None].repeat(k, 0)], -1)
    if np.sum(last * radial) < 0:
        mb.norms[-1] = -mb.norms[-1]
    # inner wall of the fan duct (from chevron edge back to the fan)
    Ri = R[-1] - 0.035
    back = np.array([2.2, 1.43])
    kk = 8
    wA = np.linspace(0, 1, kk)[:, None]
    Aw = a_exit[None, :] + (back[0] - a_exit[None, :]) * wA
    Rw = Ri[None, :] + (back[1] - Ri[None, :]) * wA ** 0.7
    Pw = np.stack([cen[0] + Aw, cen[1] + Rw * np.sin(th), cen[2] + Rw * np.cos(th)], -1)
    radial_w = np.stack([0 * Rw, -np.sin(th)[None].repeat(kk, 0), -np.cos(th)[None].repeat(kk, 0)], -1)
    Nw, _ = mb.grid_normals(Pw, wrap_v=True)
    if np.sum(Nw * radial_w) < 0:
        Nw = -Nw
    mb.add_grid(Pw, N=Nw, mat=2)
    # edge strip joining outer chevron edge and inner wall
    strip = np.stack([Pc[-1], Pw[0]], 0)
    mb.add_grid(strip, outward=("dir", (1, 0, 0)), mat=3, smooth=False)
    # ---- fan frame (dark disc behind fan) ------------------------------------
    disc = np.array([(1.95, 1.435), (1.95, 0.50)])
    Pd, Nd, UVd = revolve_grid(disc, cen, 64)
    Nd[:] = (-1.0, 0, 0)
    mb.add_grid(Pd, UVd, N=Nd, mat=4)
    # OGVs (outlet guide vanes) - thin radial plates
    for j in range(0 if LOD else 36):
        a = 2 * math.pi * j / 36
        r0, r1 = 0.62, 1.42
        pts = []
        for (aa, rr) in ((1.62, r0), (1.62, r1), (1.92, r1), (1.92, r0)):
            ang = a + 0.25 * (aa - 1.62)
            pts.append((cen[0] + aa, cen[1] + rr * math.sin(ang), cen[2] + rr * math.cos(ang)))
        mb.add_poly(pts, mat=4)
        mb.add_poly(pts[::-1], mat=4)
    # ---- core cowl, nozzle, plug ----------------------------------------------
    core = np.array([(3.6, 0.98), (4.3, 1.02), (5.0, 0.98), (5.8, 0.86), (6.62, 0.67)])
    Pk, Nk, UVk = revolve_grid(core, cen, 96)
    if Nk[2, 0, 2] < 0:
        Nk = -Nk
    mb.add_grid(Pk, UVk, N=Nk, mat=5)
    lipc = np.array([(6.62, 0.67), (6.64, 0.64), (6.30, 0.60)])
    Pl, Nl, UVl = revolve_grid(lipc, cen, 96)
    Nl, _ = mb.grid_normals(Pl, wrap_v=True)
    mb.add_grid(Pl, UVl, N=None, outward=cen + np.array([7.5, 0, 0]), mat=6)
    plug = np.array([(6.10, 0.52), (6.6, 0.50), (7.0, 0.43), (7.4, 0.27), (7.72, 0.02)])
    Pp, Np_, UVp = revolve_grid(plug, cen, 96)
    if Np_[1, 0, 2] < 0:
        Np_ = -Np_
    mb.add_grid(Pp, UVp, N=Np_, mat=6)
    # nacelle strake (vortex control device) inboard side
    ang = math.radians(-50 * side * -1)
    ang = -math.pi / 2 * side * -1
    base_a = [0.55, 1.75]
    strake_ang = math.radians(38.0) * (-side) + 0  # inboard, upper
    sa = strake_ang
    rbase = 1.74
    pts = [(cen[0] + 0.9, cen[1] + rbase * math.sin(sa), cen[2] + rbase * math.cos(sa)),
           (cen[0] + 1.9, cen[1] + rbase * math.sin(sa), cen[2] + rbase * math.cos(sa)),
           (cen[0] + 1.75, cen[1] + (rbase + 0.26) * math.sin(sa), cen[2] + (rbase + 0.26) * math.cos(sa)),
           (cen[0] + 1.25, cen[1] + (rbase + 0.26) * math.sin(sa), cen[2] + (rbase + 0.26) * math.cos(sa))]
    mb.add_poly(pts, mat=0)
    mb.add_poly(pts[::-1], mat=0)
    ob = mb.build("Nacelle_" + L, [M["nacelle"], M["lip"], M["inlet"], M["core"], M["eng_dark"],
                                   M["core"], M["exhaust"]], col=col)
    C.set_parent(ob, root)

    # ---- fan (spinner + blades) : separate object rotating about local X -----
    fb = C.MeshBuilder(TB)
    spin = np.array([(0.62, 0.0), (0.66, 0.12), (0.75, 0.22), (0.90, 0.33), (1.08, 0.42),
                     (1.30, 0.48), (1.70, 0.50)])
    Ps, Ns, UVs = revolve_grid(spin, cen, RS(64, 12))
    Ns[0] = (-1, 0, 0)
    if Ns[3, 0, 2] < 0:
        Ns = -Ns
        Ns[0] = (-1, 0, 0)
    fb.add_grid(Ps, UVs, N=Ns, mat=1)
    nb = 18
    nr, nc = RS(12, 3), RS(11, 4)
    rr = np.linspace(0.46, 1.395, nr)
    for b in range(nb):
        th0 = 2 * math.pi * b / nb
        beta = np.radians(28 + 34 * ((rr - 0.46) / 0.935) ** 0.9)
        chord = 0.42 + 0.18 * ((rr - 0.46) / 0.935)
        ac = G.FAN_A + 0.02 + 0.12 * ((rr - 0.46) / 0.935) ** 2
        xs = G.cos_space(0, 1, nc)
        th_ = 0.035 * np.sin(math.pi * xs) ** 0.8 * (1.2 - 0.6 * (rr[:, None] - 0.46))
        camber = 0.04 * np.sin(math.pi * xs)
        surfs = []
        for sgn in (1, -1):
            A = ac[:, None] + (xs[None] - 0.5) * chord[:, None] * np.cos(beta)[:, None] \
                - (camber[None] * chord[:, None] + sgn * th_ * 0.5) * np.sin(beta)[:, None]
            T = (xs[None] - 0.5) * chord[:, None] * np.sin(beta)[:, None] \
                + (camber[None] * chord[:, None] + sgn * th_ * 0.5) * np.cos(beta)[:, None]
            ang = th0 + T / rr[:, None] * side
            Pb = np.stack([cen[0] + A, cen[1] + rr[:, None] * np.sin(ang), cen[2] + rr[:, None] * np.cos(ang)], -1)
            surfs.append(Pb)
        loop = np.concatenate([surfs[0], surfs[1][:, ::-1][:, 1:]], 1)
        axis_pt = np.stack([loop[..., 0], np.full(loop.shape[:2], cen[1]), np.full(loop.shape[:2], cen[2])], -1)
        Nb, _ = fb.grid_normals(loop)
        fb.add_grid(loop, N=Nb, outward=None, mat=0)
        # decide orientation using blade mid-surface offset
        mid = 0.5 * (surfs[0] + surfs[1])
        d = np.concatenate([surfs[0] - mid, (surfs[1] - mid)[:, ::-1][:, 1:]], 1)
        if np.sum(fb.norms[-1].reshape(loop.shape) * d) < 0:
            fb.norms[-1] = -fb.norms[-1]
        fb.add_poly(loop[-1], mat=0, outward=("dir", (0, 0, 0)) if False else None)
    Mf = pivot_matrix(TB(np.array([cen[0] + G.FAN_A, cen[1], cen[2]])), (1, 0, 0))
    fan = fb.build("Fan_" + L, [M["fan"], M["spinner"]], col=col, matrix=Mf)
    C.set_parent(fan, root)
    PARTS.append(dict(name="Fan_" + L, kind="fan", max=0))

    # ---- pylon ------------------------------------------------------------------
    build_pylon(M, root, col, side, cen)


def build_pylon(M, root, col, side, cen):
    L = "L" if side > 0 else "R"
    y = G.ENG_Y
    le = float(G.wing_le(y))
    te = float(G.wing_te(y))
    c = te - le
    s0 = cen[0] + 1.45
    s1 = te + 0.9
    ns = RS(60, 14)
    ss = np.linspace(s0, s1, ns)
    xs = np.clip((ss - le) / c, 0, 1)
    zlow = G.wing_point(np.full(ns, y), xs, np.zeros(ns, bool), 1)[:, 2]
    nac_top = cen[2] + 1.70
    top = np.where(ss < le + 0.4, nac_top + 0.30 + 0.12 * np.clip((ss - s0) / (le - s0), 0, 1), zlow + 0.2)
    top = np.convolve(np.pad(top, 3, mode="edge"), np.ones(7) / 7, mode="valid")
    t_exit = cen[0] + G.NOZZLE_A
    bottom = np.interp(ss, [s0, t_exit - 0.1, t_exit + 0.4, cen[0] + 6.5, te - 0.5, s1],
                       [nac_top - 0.05, nac_top - 0.05, cen[2] + 1.02, cen[2] + 0.92,
                        zlow[-1] - 0.25, zlow[-1] + 0.12])
    halfw = 0.27 * np.sin(np.clip((ss - s0) / (s1 - s0), 0, 1) ** 0.35 * math.pi) ** 0.55 + 0.01
    na = RS(40, 10)
    ang = np.linspace(0, 2 * math.pi, na + 1)
    P = np.zeros((ns, na + 1, 3))
    for i in range(ns):
        zc = 0.5 * (top[i] + bottom[i])
        hz = 0.5 * (top[i] - bottom[i])
        ca, sa = np.cos(ang), np.sin(ang)
        ex = 2 / 4.0
        P[i, :, 0] = ss[i]
        P[i, :, 1] = side * y + halfw[i] * np.sign(sa) * np.abs(sa) ** ex
        P[i, :, 2] = zc - hz * np.sign(ca) * np.abs(ca) ** ex
    mb = C.MeshBuilder(TB)
    N, _ = mb.grid_normals(P, wrap_v=True)
    ctr = np.stack([P[..., 0], np.full(P.shape[:2], side * y), P[..., 2].mean(1, keepdims=True).repeat(na + 1, 1)], -1)
    if np.sum(N * (P - ctr)) < 0:
        N = -N
    mb.add_grid(P, N=N, mat=0)
    mb.add_poly(P[0, :-1], mat=0, outward=("dir", (-1, 0, 0)))
    mb.add_poly(P[-1, :-1], mat=0, outward=("dir", (1, 0, 0)))
    ob = mb.build("Pylon_" + L, [M["wing"]], col=col)
    C.set_parent(ob, root)


# ---------------------------------------------------------------------------
# Empennage
# ---------------------------------------------------------------------------
def build_htail(M, root, col):
    pivot_d = np.array([G.HT_PIVOT_S, 0.0, G.HT_Z0])
    Mp = pivot_matrix(TB(pivot_d), (0, -1, 0))
    stab = C.empty("HStab", loc=(0, 0, 0), col=col)
    from mathutils import Matrix
    stab.matrix_world = Matrix(Mp.tolist())
    C.set_parent(stab, root)
    PARTS.append(dict(name="HStab", kind="stab", max=4.0))
    for side in (1, -1):
        L = "L" if side > 0 else "R"

        def f(S, X, U, side=side):
            return G.ht_point(S, X, U, side)
        base = np.unique(np.r_[np.linspace(0.4, G.HT_SEMI, RS(40)), G.ELEV["y0"], G.ELEV["y1"]])
        mb = C.MeshBuilder(TB)
        sd = (0, side, 0)
        segs = [(0.4, G.ELEV["y0"], 0, 1.0), (G.ELEV["y0"], G.ELEV["y1"], 0, G.ELEV["x0"]),
                (G.ELEV["y1"], G.HT_SEMI, 0, 1.0)]
        for (a, b, x0, x1) in segs:
            lifting_loop(mb, f, span_stations(a, b, base), x0, x1, "le", 0, (0, 0, 1), cap_dir=sd,
                         uv_span=G.HT_SEMI, mat_le=1, le_split=0.05)
        ob = mb.build("HTail_" + L, [M["wing"], M["le"]], col=col)
        C.set_parent(ob, stab)
        # elevator
        mb2 = C.MeshBuilder(TB)
        y0, y1 = G.ELEV["y0"] + 0.02, G.ELEV["y1"] - 0.02
        spans = span_stations(y0, y1, base)
        lifting_loop(mb2, f, spans, G.ELEV["x0"] - 0.03, 1.0, "round", 0, (0, 0, 1), cap_dir=sd,
                     uv_span=G.HT_SEMI)

        def hp(yy):
            pu = f(np.array(yy), np.array(G.ELEV["x0"] + 0.01), np.array(True))
            pl = f(np.array(yy), np.array(G.ELEV["x0"] + 0.01), np.array(False))
            return 0.5 * (pu + pl)
        test = f(spans, np.ones_like(spans), np.ones_like(spans, bool))
        add_part("Elevator_" + L, "elevator", mb2, [M["wing"]], hp(y0), hp(y1), test, TE_DOWN, 30, stab, col)


def build_vtail(M, root, col):
    def f(S, X, U):
        side = np.where(U, 1.0, -1.0)
        return G.vt_point(S, X, side)
    base = np.unique(np.r_[np.linspace(G.VT_Z0, G.VT_ZTIP, RS(44)), np.linspace(G.VT_Z0, G.VT_Z0 + 1.8, RS(10)),
                           G.RUDDER["z0"], G.RUDDER["z1"]])
    mb = C.MeshBuilder(TB)
    segs = [(G.VT_Z0, G.RUDDER["z0"], 0, 1.0), (G.RUDDER["z0"], G.RUDDER["z1"], 0, G.RUDDER["x0"]),
            (G.RUDDER["z1"], G.VT_ZTIP, 0, 1.0)]
    for (a, b, x0, x1) in segs:
        lifting_loop(mb, f, span_stations(a, b, base), x0, x1, "le", 0, (0, 1, 0), cap_dir=(0, 0, 1),
                     uv_span=1.0, nch=40)
    # tail texture UVs: planar side projection (s, z)
    ob = mb.build("VTail", [M["tail"]], col=col)
    planar_uv(ob, s0=46.0, s1=G.LENGTH, z0=G.VT_Z0, z1=G.VT_ZTIP)
    C.set_parent(ob, root)
    mb2 = C.MeshBuilder(TB)
    z0, z1 = G.RUDDER["z0"] + 0.02, G.RUDDER["z1"] - 0.02
    spans = span_stations(z0, z1, base)
    lifting_loop(mb2, f, spans, G.RUDDER["x0"] - 0.03, 1.0, "round", 0, (0, 1, 0), cap_dir=(0, 0, 1),
                 uv_span=1.0, nch=24)

    def hp(zz):
        return G.vt_point(np.array(zz), np.array(G.RUDDER["x0"] + 0.01), np.array(1.0)) * np.array([1, 0, 1])
    test = f(spans, np.ones_like(spans), np.ones_like(spans, bool))
    rud = add_part("Rudder", "rudder", mb2, [M["tail"]], hp(z0), hp(z1), test, TE_RIGHT, 27, root, col,
                   up_hint=(-1, 0, 0))
    planar_uv(rud, s0=46.0, s1=G.LENGTH, z0=G.VT_Z0, z1=G.VT_ZTIP)


def planar_uv(ob, s0, s1, z0, z1):
    """Side-view planar UVs from world position (design s,z)."""
    me = ob.data
    mw = np.array(ob.matrix_world)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    w = (np.c_[co, np.ones(len(co))] @ mw.T)[:, :3]
    s = G.S_CG - w[:, 0]
    z = w[:, 2]
    uv = np.stack([(s - s0) / (s1 - s0), (z - z0) / (z1 - z0)], -1)
    li = np.zeros(len(me.loops), dtype=np.int32)
    me.loops.foreach_get("vertex_index", li)
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    me.uv_layers[0].data.foreach_set("uv", uv[li].astype(np.float32).ravel())


# ---------------------------------------------------------------------------
# Landing gear
# ---------------------------------------------------------------------------
def cyl(mb, p0, p1, r, mat, n=20, caps=True, r1=None):
    n = RS(n, 6)
    p0 = np.asarray(p0, dtype=np.float64)
    p1 = np.asarray(p1, dtype=np.float64)
    r1 = r if r1 is None else r1
    ax = p1 - p0
    L = np.linalg.norm(ax)
    ax /= L
    tmp = np.array([0, 0, 1.0]) if abs(ax[2]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(ax, u)
    th = np.linspace(0, 2 * math.pi, n + 1)
    ring = np.cos(th)[:, None] * u + np.sin(th)[:, None] * v
    P = np.stack([p0 + r * ring, p1 + r1 * ring], 0)
    N = np.stack([ring, ring], 0)
    mb.add_grid(P, N=N, mat=mat)
    if caps:
        mb.add_poly(p0 + r * ring[:-1], mat=mat, outward=("dir", -ax))
        mb.add_poly(p1 + r1 * ring[:-1], mat=mat, outward=("dir", ax))


def wheel(mb, center, axis_y, D, W, mat_tire, mat_hub, n=48, outboard=1):
    n = RS(n, 12)
    """Tyre + hub around lateral axis at design centre."""
    R = D / 2
    rim = R * 0.56
    prof = []
    # tyre cross-section (a = lateral offset, r = radius)
    for t in np.linspace(-1, 1, 15):
        a = t * W / 2 * 0.98
        r = rim + (R - rim) * (1 - abs(t) ** 6) ** 0.35 if abs(t) < 1 else rim
        prof.append((a, r))
    prof = [(-W / 2 * 0.9, rim)] + prof + [(W / 2 * 0.9, rim)]
    prof = np.array(prof)
    th = np.linspace(0, 2 * math.pi, n + 1)
    cs, cy, cz = center
    P = np.stack([cs + prof[:, 1:2] * np.cos(th)[None], cy + prof[:, 0:1] + 0 * th[None],
                  cz + prof[:, 1:2] * np.sin(th)[None]], -1)
    N, _ = mb.grid_normals(P, wrap_v=True)
    radial = np.stack([np.cos(th)[None].repeat(len(prof), 0), 0 * P[..., 1], np.sin(th)[None].repeat(len(prof), 0)], -1)
    if np.sum(N * radial) < 0:
        N = -N
    UV = np.stack([np.repeat(th[None] / (2 * math.pi), len(prof), 0), np.linspace(0, 1, len(prof))[:, None].repeat(n + 1, 1)], -1)
    mb.add_grid(P, UV, N=N, mat=mat_tire)
    # hub faces (both sides): dished disc
    for sgn in (-1, 1):
        hp = np.array([(sgn * W / 2 * 0.9, rim), (sgn * W / 2 * 0.8, rim * 0.93), (sgn * W / 2 * 0.55, rim * 0.6),
                       (sgn * W / 2 * 0.62, rim * 0.28), (sgn * W / 2 * 0.72, 0.001)])
        Ph = np.stack([cs + hp[:, 1:2] * np.cos(th)[None], cy + hp[:, 0:1] + 0 * th[None],
                       cz + hp[:, 1:2] * np.sin(th)[None]], -1)
        Nh, _ = mb.grid_normals(Ph, wrap_v=True)
        if np.sum(Nh[..., 1]) * sgn < 0:
            Nh = -Nh
        mb.add_grid(Ph, N=Nh, mat=mat_hub)
        # bolt ring
        for j in range(0 if LOD else 10):
            a = 2 * math.pi * j / 10
            c0 = np.array([cs + rim * 0.45 * math.cos(a), cy + sgn * W / 2 * 0.60, cz + rim * 0.45 * math.sin(a)])
            cyl(mb, c0, c0 + np.array([0, sgn * 0.04, 0]), 0.022, mat_hub, n=8)


def build_gear(M, root, col):
    g = G.GROUND_Z
    # ---------------- nose gear ------------------------------------------------
    sN = G.S_NOSE
    rN = G.NOSE_TIRE_D / 2
    axle_z = g + rN
    hinge = np.array([sN - 0.25, 0.0, -2.30])
    mb = C.MeshBuilder(TB)
    cyl(mb, (sN, 0, -2.25), (sN, 0, -3.65), 0.135, 0)                  # outer cylinder
    cyl(mb, (sN, 0, -3.60), (sN, 0, axle_z + 0.12), 0.10, 1)           # chrome piston
    cyl(mb, (sN, 0, -3.35), (sN, 0, -3.55), 0.19, 0)                   # steering collar
    cyl(mb, (sN, -G.NOSE_WHEEL_DY - 0.05, axle_z), (sN, G.NOSE_WHEEL_DY + 0.05, axle_z), 0.07, 0)  # axle
    mb.add_box((sN + 0.05, 0, axle_z + 0.16), (0.36, 0.30, 0.22), mat=0)   # axle housing
    # torque links
    mb.add_box((sN + 0.2, 0, -3.95), (0.34, 0.07, 0.07), mat=0)
    mb.add_box((sN + 0.2, 0, -4.2), (0.30, 0.07, 0.07), mat=0)
    # drag brace (forward)
    cyl(mb, (sN, 0, -3.25), (sN - 1.55, 0, -2.45), 0.065, 0)
    cyl(mb, (sN, 0.12, -3.25), (sN - 1.55, 0.25, -2.45), 0.045, 0)
    cyl(mb, (sN, -0.12, -3.25), (sN - 1.55, -0.25, -2.45), 0.045, 0)
    # taxi / turnoff lights on the strut
    mb.add_box((sN - 0.17, 0, -3.10), (0.10, 0.34, 0.14), mat=0)
    for dy in (-0.1, 0.1):
        cyl(mb, (sN - 0.20, dy, -3.10), (sN - 0.235, dy, -3.10), 0.055, 3, n=16)
    test = np.array([[sN, 0, axle_z]])
    nose = add_part("NoseGear", "gear", mb, [M["gear"], M["chrome"], M["tire"], M["landing"], M["hub"]],
                    hinge, hinge + np.array([0, 1.0, 0]), test, MOVE_FWD, 98, root, col,
                    extra=dict(contact=G.to_three([sN, 0, g]), radius=rN))
    # wheels are separate children so they can roll (+angle = rolling forwards)
    mbw = C.MeshBuilder(TB)
    for dy in (-1, 1):
        wheel(mbw, (sN, dy * G.NOSE_WHEEL_DY, axle_z), 0, G.NOSE_TIRE_D, G.NOSE_TIRE_W, 0, 1, n=40)
    ax = np.array([sN, 0, axle_z])
    add_part("NoseWheels", "wheel", mbw, [M["tire"], M["hub"]], ax, ax + np.array([0, 1.0, 0]),
             np.array([[sN, 0, axle_z + rN]]), MOVE_FWD, 360, nose, col, extra=dict(radius=rN, gear=0))

    # nose gear doors
    for side in (1, -1):
        L = "L" if side > 0 else "R"
        mbd = C.MeshBuilder(TB)
        s_a, s_b = sN - 2.75, sN + 0.30
        ss = np.linspace(s_a, s_b, 14)
        ys = np.linspace(0.015, 0.60, 8) * side
        P = np.zeros((len(ss), len(ys), 3))
        for i, s in enumerate(ss):
            phi, arc, Cc = G.section_arc(s, 720)
            yy, zz = G.fus_section(s, phi)
            lower = np.cos(phi) > 0
            order = np.argsort(yy[lower])
            zb = np.interp(ys, yy[lower][order], zz[lower][order])
            P[i, :, 0] = s
            P[i, :, 1] = ys
            P[i, :, 2] = zb - 0.012
        mbd.add_grid(P, outward=("dir", (0, 0, -1)), mat=0)
        Pin = P.copy()
        Pin[..., 2] += 0.05
        mbd.add_grid(Pin, outward=("dir", (0, 0, 1)), mat=1)
        h0 = P[0, -1]
        h1 = P[-1, -1]
        test = P[:, 0]
        add_part("NoseDoor_" + L, "door", mbd, [M["fuselage"], M["bay"]], h0, h1, test, TE_DOWN, 88, root, col)

    # ---------------- main gear --------------------------------------------------
    sM = G.S_MAIN
    rM = G.MAIN_TIRE_D / 2
    axle_z = g + rM
    for side in (1, -1):
        L = "L" if side > 0 else "R"
        yM = side * G.Y_MAIN
        top = np.array([sM - 0.25, yM, -2.05])
        pivot_bog = np.array([sM - 0.05, yM, axle_z + 0.05])
        mb = C.MeshBuilder(TB)
        cyl(mb, top, (sM - 0.12, yM, -3.55), 0.215, 0, n=24)
        cyl(mb, (sM - 0.12, yM, -3.50), pivot_bog + np.array([0, 0, 0.18]), 0.165, 1, n=24)
        cyl(mb, (sM - 0.10, yM, -3.40), (sM - 0.10, yM, -3.62), 0.26, 0, n=24)  # gland nut
        # bogie beam
        mb.add_box((sM, yM, axle_z + 0.02), (2 * G.MAIN_AXLE_DS + 0.35, 0.26, 0.30), mat=0)
        cyl(mb, (sM - 0.05, yM - 0.25, axle_z + 0.05), (sM - 0.05, yM + 0.25, axle_z + 0.05), 0.12, 0)
        for ds in (-G.MAIN_AXLE_DS, G.MAIN_AXLE_DS):
            cyl(mb, (sM + ds, yM - G.MAIN_WHEEL_DY - 0.1, axle_z), (sM + ds, yM + G.MAIN_WHEEL_DY + 0.1, axle_z),
                0.09, 0)
            for dy in (-1, 1):
                # brake housing
                cyl(mb, (sM + ds, yM + dy * (G.MAIN_WHEEL_DY - 0.22), axle_z),
                    (sM + ds, yM + dy * (G.MAIN_WHEEL_DY - 0.30), axle_z), 0.36, 0, n=24)
        # torque links & brake rods
        mb.add_box((sM + 0.18, yM, -3.95), (0.40, 0.10, 0.09), mat=0)
        mb.add_box((sM + 0.18, yM, -4.25), (0.36, 0.10, 0.09), mat=0)
        for ds in (-1, 1):
            cyl(mb, (sM - 0.1, yM + 0.2, axle_z + 0.35), (sM + ds * 0.7, yM + 0.2, axle_z + 0.1), 0.03, 0, n=8)
        # side brace (to wing / fuselage) and drag brace
        cyl(mb, (sM - 0.12, yM, -3.05), (sM - 0.2, side * 2.55, -2.25), 0.08, 0)
        cyl(mb, (sM - 0.12, yM, -3.05), (sM - 1.6, yM - side * 0.2, -2.1), 0.085, 0)
        # hydraulic lines
        cyl(mb, (sM - 0.34, yM + side * 0.18, -2.1), (sM - 0.32, yM + side * 0.18, -3.4), 0.018, 1, n=6)
        # strut door (flat fairing on the outboard side of the leg)
        door = []
        ys_ = yM + side * 0.33
        for (s, z) in ((sM - 0.95, -2.05), (sM + 0.55, -2.05), (sM + 0.45, -3.45), (sM - 0.75, -3.55)):
            door.append((s, ys_, z))
        door = np.array(door)
        mb.add_poly(door, mat=5, outward=("dir", (0, side, 0)))
        di = door.copy()
        di[:, 1] -= side * 0.03
        mb.add_poly(di, mat=6, outward=("dir", (0, -side, 0)))
        test = np.array([[sM, yM, axle_z]])
        inboard = (lambda a, b, side=side: np.abs(b[:, 1]).mean() < np.abs(a[:, 1]).mean())
        leg = add_part("MainGear_" + L, "gear", mb, [M["gear"], M["chrome"], M["tire"], M["hub"], M["hub"],
                                               M["fuselage"], M["bay"]],
                 top, top + np.array([1.0, 0, 0]), test, inboard, 88, root, col,
                 extra=dict(contact=G.to_three([sM, yM, g]), radius=rM,
                            wheels=[G.to_three([sM + ds, yM + dy * G.MAIN_WHEEL_DY, g])
                                    for ds in (-G.MAIN_AXLE_DS, G.MAIN_AXLE_DS) for dy in (-1, 1)]))
        for k, ds in enumerate((-G.MAIN_AXLE_DS, G.MAIN_AXLE_DS)):
            mbw = C.MeshBuilder(TB)
            for dy in (-1, 1):
                wheel(mbw, (sM + ds, yM + dy * G.MAIN_WHEEL_DY, axle_z), 0, G.MAIN_TIRE_D, G.MAIN_TIRE_W, 0, 1, n=48)
            ax = np.array([sM + ds, yM, axle_z])
            add_part("MainWheels_%s%d" % (L, k), "wheel", mbw, [M["tire"], M["hub"]], ax, ax + np.array([0, 1.0, 0]),
                     np.array([[sM + ds, yM, axle_z + rM]]), MOVE_FWD, 360, leg, col,
                     extra=dict(radius=rM, gear=1 if side > 0 else 2))
        # belly wheel-well door (hinged near the keel, opens downward)
        mbd = C.MeshBuilder(TB)
        ss = np.linspace(sM - 1.55, sM + 1.75, 16)
        ys = np.linspace(0.25, 2.55, 12) * side
        P = np.zeros((len(ss), len(ys), 3))
        for i, s in enumerate(ss):
            phi, arc, Cc = G.section_arc(s, 1440)
            yy, zz = G.fus_section(s, phi)
            lower = np.cos(phi) > 0.05
            order = np.argsort(yy[lower])
            P[i, :, 0] = s
            P[i, :, 1] = ys
            P[i, :, 2] = np.interp(ys, yy[lower][order], zz[lower][order]) - 0.012
        mbd.add_grid(P, outward=("dir", (0, 0, -1)), mat=0)
        Pin = P.copy()
        Pin[..., 2] += 0.05
        mbd.add_grid(Pin, outward=("dir", (0, 0, 1)), mat=1)
        test = P[:, -1]
        add_part("MainDoor_" + L, "door", mbd, [M["fuselage"], M["bay"]], P[0, 0], P[-1, 0], test, TE_DOWN, 85,
                 root, col)


# ---------------------------------------------------------------------------
# Lights, antennas, probes
# ---------------------------------------------------------------------------
def dome(mb, center, normal, r, mat, n=16, h=None):
    center = np.asarray(center, dtype=np.float64)
    nrm = np.asarray(normal, dtype=np.float64)
    nrm /= np.linalg.norm(nrm)
    h = r * 0.6 if h is None else h
    tmp = np.array([1.0, 0, 0]) if abs(nrm[0]) < 0.9 else np.array([0, 1.0, 0])
    u = np.cross(nrm, tmp)
    u /= np.linalg.norm(u)
    v = np.cross(nrm, u)
    rings = 6
    th = np.linspace(0, 2 * math.pi, n + 1)
    P = []
    for k in range(rings + 1):
        a = (math.pi / 2) * k / rings
        rr = r * math.cos(a)
        hh = h * math.sin(a)
        P.append(center + nrm * hh + rr * (np.cos(th)[:, None] * u + np.sin(th)[:, None] * v))
    P = np.array(P)
    mb.add_grid(P, outward=center - nrm * r, mat=mat)


def blade_antenna(mb, s, y, z, up, h=0.28, c=0.30, mat=0):
    sgn = 1 if up else -1
    pts = [(s - c / 2, y, z), (s + c / 2, y, z), (s + c / 2 + 0.06, y, z + sgn * h), (s - c / 2 + 0.16, y, z + sgn * h)]
    pts = np.array(pts)
    for dy in (0.012, -0.012):
        q = pts.copy()
        q[:, 1] += dy
        mb.add_poly(q, mat=mat, outward=("dir", (0, np.sign(dy), 0)))


def fus_point(s, side_angle_deg):
    """Point on the skin at station s; angle from TOP towards left (+) in degrees."""
    phi = math.pi + math.radians(side_angle_deg)
    y, z = G.fus_section(s, np.array([phi]))
    return np.array([s, float(y[0]), float(z[0])])


def build_details(M, root, col):
    mb = C.MeshBuilder(TB)
    # blade antennas top / bottom
    for s in (11.5, 19.0, 38.5, 44.0):
        p = fus_point(s, 0)
        blade_antenna(mb, s, 0.0, p[2] - 0.02, True, mat=0)
    for s in (9.8, 14.5, 41.0):
        p = fus_point(s, 180)
        blade_antenna(mb, s, 0.0, p[2] + 0.02, False, h=0.24, mat=0)
    # SATCOM radome on the crown
    p = fus_point(27.5, 0)
    dome(mb, p - np.array([0, 0, 0.05]), (0, 0, 1), 1.05, 0, n=28, h=0.28)
    # pitot probes + AOA vanes (both sides)
    for side in (1, -1):
        for (s, ang) in ((2.35, 72), (2.55, 95), (2.35, 112)):
            p = fus_point(s, side * ang)
            nrm = np.array([0, p[1], p[2] - float(G.fus_profile(s)[3])])
            nrm /= np.linalg.norm(nrm)
            base = p - nrm * 0.02
            tip = p + nrm * 0.16
            cyl(mb, base, tip, 0.025, 1, n=8)
            cyl(mb, tip, tip + np.array([-0.24, 0, 0]), 0.012, 1, n=8)
        p = fus_point(3.4, side * 102)
        nrm = np.array([0, p[1], p[2]])
        nrm /= np.linalg.norm(nrm)
        vane = np.array([p - np.array([0.06, 0, 0]), p + np.array([0.08, 0, 0]),
                         p + np.array([0.05, 0, 0]) + nrm * 0.14, p - np.array([0.02, 0, 0]) + nrm * 0.14])
        mb.add_poly(vane, mat=1)
        mb.add_poly(vane[::-1], mat=1)
    # static wicks on ailerons, elevators, rudder, wing tips
    for side in (1, -1):
        for yy in (23.0, 24.8, 26.5, 28.5, 29.6):
            te = G.wing_point(np.array(yy), np.array(1.0), np.array(True), side)
            cyl(mb, te, te + np.array([0.42, 0, -0.01]), 0.008, 1, n=5, caps=False)
        for yy in (6.0, 8.0, 9.4):
            te = G.ht_point(np.array(yy), np.array(1.0), np.array(True), side)
            cyl(mb, te, te + np.array([0.36, 0, 0]), 0.008, 1, n=5, caps=False)
    ob = mb.build("Details", [M["antenna"], M["chrome"]], col=col)
    C.set_parent(ob, root)

    # ---- lights: each its own object so the simulator can drive them ---------
    def light(name, center, normal, r, mat, h=None):
        lb = C.MeshBuilder(TB)
        dome(lb, center, normal, r, 0, n=14, h=h)
        ob = lb.build(name, [mat], col=col)
        C.set_parent(ob, root)
        return ob
    for side, mat in ((1, M["red"]), (-1, M["green"])):
        L = "L" if side > 0 else "R"
        tip_le = G.wing_point(np.array(G.Y_TIP - 0.05), np.array(0.25), np.array(True), side)
        light("NavLight_" + L, tip_le + np.array([0, 0, -0.02]), (-0.3, side, 0.1), 0.07, mat)
        tip_te = G.wing_point(np.array(G.Y_TIP - 0.1), np.array(0.95), np.array(True), side)
        light("Strobe_" + L, tip_te + np.array([0.05, side * 0.04, -0.01]), (1, side * 0.4, 0), 0.06, M["strobe"])
        light("NavTail_" + L, tip_te + np.array([0.02, 0, 0.03]), (1, 0, 0.2), 0.04, M["white_light"])
        # landing lights in the wing root leading edge
        lp = G.wing_point(np.array(4.6), np.array(0.02), np.array(False), side)
        light("LandingLight_" + L, lp + np.array([-0.02, 0, 0]), (-1, 0, -0.05), 0.16, M["landing"], h=0.05)
        # runway turn-off light
        lp2 = G.wing_point(np.array(3.7), np.array(0.03), np.array(False), side)
        light("TurnoffLight_" + L, lp2, (-1, side * 0.5, -0.1), 0.09, M["landing"], h=0.04)
    light("Beacon_Top", fus_point(29.5, 0) + np.array([0, 0, -0.03]), (0, 0, 1), 0.14, M["beacon"], h=0.10)
    light("Beacon_Bottom", fus_point(37.0, 180) + np.array([0, 0, 0.03]), (0, 0, -1), 0.14, M["beacon"], h=0.10)
    light("Strobe_Tail", np.array([G.LENGTH - 0.02, 0, G.fus_profile(G.LENGTH)[0] - 0.05]), (1, 0, 0), 0.05,
          M["strobe"])
    # logo lights on the stabiliser (pointing at the fin)
    for side in (1, -1):
        L = "L" if side > 0 else "R"
        p = G.ht_point(np.array(3.8), np.array(0.35), np.array(True), side)
        light("LogoLight_" + L, p, (0, 0, 1), 0.07, M["landing"], h=0.03)


# ---------------------------------------------------------------------------
# Cockpit interior (visible from the pilot's eye point)
# ---------------------------------------------------------------------------
def build_cockpit(M, root, col):
    Mi = {
        "shell": C.pbr_material("Cockpit_Shell", color=C.hex_color("#3a3f45"), roughness=0.8,
                                base_tex=tex("cockpit_shell.png"), alpha_from_tex=True,
                                double_sided=False),
        "panel": C.pbr_material("Cockpit_Panel", color=C.hex_color("#2a2e33"), roughness=0.7),
        "grey": C.pbr_material("Cockpit_Grey", color=C.hex_color("#5b636b"), roughness=0.65),
        "seat": C.pbr_material("Cockpit_Seat", color=C.hex_color("#23262b"), roughness=0.9),
        "black": C.pbr_material("Cockpit_Black", color=C.hex_color("#0a0b0c"), roughness=0.4),
        "floor": C.pbr_material("Cockpit_Floor", color=C.hex_color("#2c3036"), roughness=0.95),
        "metal": C.pbr_material("Cockpit_Metal", color=C.hex_color("#9aa1a8"), roughness=0.3, metallic=0.9),
        "knob": C.pbr_material("Cockpit_Knob", color=C.hex_color("#e7e9eb"), roughness=0.4),
    }
    # --- inner shell (inward facing copy of the nose skin) ------------------
    st = np.linspace(1.3, 6.9, 60)
    nv = 128
    phi = np.linspace(0, 2 * math.pi, nv + 1)
    P = np.zeros((len(st), nv + 1, 3))
    UV = np.zeros((len(st), nv + 1, 2))
    for i, s in enumerate(st):
        y, z = G.fus_section(s, phi)
        zc = float(G.fus_profile(s)[3])
        seg = np.hypot(np.diff(y), np.diff(z))
        arc = np.r_[0, np.cumsum(seg)]
        k = 0.97
        P[i, :, 0] = s
        P[i, :, 1] = y * k
        P[i, :, 2] = zc + (z - zc) * k
        UV[i, :, 0] = s / 7.0
        UV[i, :, 1] = arc / arc[-1]
    mb = C.MeshBuilder(TB)
    N, _ = mb.grid_normals(P, wrap_v=True)
    ctr = np.stack([P[..., 0], 0 * P[..., 1], P[..., 2].mean(1, keepdims=True).repeat(nv + 1, 1)], -1)
    if np.sum(N * (P - ctr)) > 0:
        N = -N          # inward facing
    mb.add_grid(P, UV, N=N, mat=0)
    ob = mb.build("CockpitShell", [Mi["shell"]], col=col)
    C.set_parent(ob, root)

    # --- solid interior furniture (design coords) -----------------------------
    fb = C.MeshBuilder(TB)
    DZ = -0.30          # furniture height offset (floor raised above main deck)
    fl = DZ + 0.02      # floor height (design z)
    # floor
    fb.add_poly([(2.9, 1.25, fl), (6.9, 1.35, fl), (6.9, -1.35, fl), (2.9, -1.25, fl)], mat=5,
                outward=("dir", (0, 0, 1)))
    # rear bulkhead with door
    phb = np.linspace(math.pi * 0.5, math.pi * 1.5, 40)
    yb, zb = G.fus_section(6.85, phb)
    zcb = float(G.fus_profile(6.85)[3])
    bulk = [(6.85, 0.95 * yy, max(fl, zcb + 0.95 * (zz - zcb))) for yy, zz in zip(yb, zb)]
    fb.add_poly(bulk, mat=2, outward=("dir", (-1, 0, 0)))
    fb.add_box((6.82, 0.0, fl + 1.0), (0.04, 0.8, 1.95), mat=1)
    # main instrument panel (slanted, facing aft/up)
    tilt = math.radians(12)
    ps, pz0, pz1 = 3.55, 0.28 + DZ, 0.98 + DZ
    fb.add_poly([(ps, 1.12, pz0), (ps + (pz1 - pz0) * math.tan(tilt) * -1, 1.12, pz1),
                 (ps + (pz1 - pz0) * math.tan(tilt) * -1, -1.12, pz1), (ps, -1.12, pz0)], mat=1,
                outward=("dir", (1, 0, 0.2)))
    fb.add_box((3.25, 0, 0.62 + DZ), (0.6, 2.24, 0.72), mat=1)
    # glareshield + MCP
    fb.add_box((3.45, 0, 1.05 + DZ), (0.62, 2.35, 0.14), mat=1)
    fb.add_box((3.78, 0, 1.00 + DZ), (0.10, 1.35, 0.13), mat=2)
    for j in range(14):
        fb.add_box((3.835, -0.6 + j * 0.092, 1.0 + DZ), (0.03, 0.035, 0.035), mat=7)
    # centre pedestal
    fb.add_box((4.25, 0, 0.42 + DZ), (1.15, 0.52, 0.40), mat=1)
    # rudder pedals
    for sy in (0.53, -0.53):
        for dy in (-0.14, 0.14):
            fb.add_box((3.95, sy + dy, 0.18 + DZ), (0.06, 0.10, 0.22), mat=6)
    # seats, overhead panel, pedestal faces, side consoles: cockpit_b787.py
    ob = fb.build("CockpitInterior", [Mi["shell"], Mi["panel"], Mi["grey"], Mi["seat"], Mi["black"],
                                      Mi["floor"], Mi["metal"], Mi["knob"]], col=col)
    C.set_parent(ob, root)

    # --- displays (each its own material so the sim can put live canvases) ----
    names = ["PFD_L", "ND_L", "EICAS", "ND_R", "PFD_R"]
    ys = [0.86, 0.47, 0.0, -0.47, -0.86]
    w, h = 0.33, 0.25
    for nm, yc in zip(names, ys):
        mat = C.pbr_material("Display_" + nm, color=(0.0, 0.0, 0.0, 1), roughness=0.15,
                             emission=(0.02, 0.02, 0.03, 1), emission_strength=1.0)
        db = C.MeshBuilder(TB)
        zc = 0.66 + DZ
        dx = -0.012
        s_top = ps + dx - (zc + h / 2 - pz0) * math.tan(tilt)
        s_bot = ps + dx - (zc - h / 2 - pz0) * math.tan(tilt)
        pts = np.array([(s_bot, yc + w / 2, zc - h / 2), (s_bot, yc - w / 2, zc - h / 2),
                        (s_top, yc - w / 2, zc + h / 2), (s_top, yc + w / 2, zc + h / 2)])
        # viewed from aft, left of screen is +y (left side of aircraft)
        db.add_poly(pts, uvs=[(0, 0), (1, 0), (1, 1), (0, 1)], mat=0, outward=("dir", (1, 0, 0.2)))
        ob = db.build("Display_" + nm, [mat], col=col)
        C.set_parent(ob, root)
    # HUD combiner glass above the captain
    hud = C.pbr_material("HUD_Glass", color=(0.6, 0.9, 0.7, 1), roughness=0.05, alpha=0.12, blend=True)
    hb = C.MeshBuilder(TB)
    e = np.array(G.EYE)
    hs = e[0] - 0.42
    hb.add_poly([(hs, e[1] + 0.16, e[2] - 0.13), (hs, e[1] - 0.16, e[2] - 0.13),
                 (hs - 0.03, e[1] - 0.16, e[2] + 0.13), (hs - 0.03, e[1] + 0.16, e[2] + 0.13)], mat=0,
                outward=("dir", (1, 0, 0)))
    ob = hb.build("HUD_Combiner", [hud], col=col)
    C.set_parent(ob, root)
    import cockpit_b787
    cockpit_b787.build_cockpit_detail(root, col, tex)
    # throttle levers (pivot about lateral axis, positive = forward)
    for side in (1, -1):
        L = "L" if side > 0 else "R"
        tb = C.MeshBuilder(TB)
        base = np.array([4.0, side * 0.07, 0.62 + DZ])
        cyl(tb, base, base + np.array([-0.05, 0, 0.20]), 0.012, 0, n=8)
        tb.add_box(tuple(base + np.array([-0.055, 0, 0.215])), (0.05, 0.09, 0.035), mat=1)
        test = np.array([base + np.array([-0.05, 0, 0.2])])
        add_part("Throttle_" + L, "throttle", tb, [Mi["metal"], Mi["black"]], base, base + np.array([0, 1, 0]),
                 test, MOVE_FWD, 30, root, col)
    # control columns (yokes)
    for sy in (0.53, -0.53):
        L = "L" if sy > 0 else "R"
        yb = C.MeshBuilder(TB)
        cyl(yb, (3.72, sy, 0.05 + DZ), (3.9, sy, 0.62 + DZ), 0.03, 0, n=10)
        yb.add_box((3.92, sy, 0.66 + DZ), (0.06, 0.34, 0.05), mat=1)
        for dy in (-0.17, 0.17):
            yb.add_box((3.92, sy + dy, 0.74 + DZ), (0.06, 0.05, 0.17), mat=1)
        test = np.array([[3.92, sy, 0.66 + DZ]])
        add_part("Yoke_" + L, "yoke", yb, [Mi["metal"], Mi["black"]], (3.72, sy, 0.05 + DZ), (3.72, sy + 1, 0.05 + DZ),
                 test, MOVE_FWD, 12, root, col)


# ---------------------------------------------------------------------------
# Ambient-occlusion bake (Cycles): fuselage and wings, used as aoMap in the sim
# ---------------------------------------------------------------------------
AO_TARGETS = {"Fuselage": ("ao_fuselage.png", 2048, 512, "B787_Fuselage"),
              "Wing_L": ("ao_wing.png", 1024, 1024, "B787_WingPaint")}


def bake_ao():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 96
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.light_settings.distance = 4.0
    for name, (fn, W, H, matname) in AO_TARGETS.items():
        ob = bpy.data.objects.get(name)
        if ob is None:
            continue
        img = bpy.data.images.new("AO_" + name, W, H, alpha=False, float_buffer=False)
        dummy = bpy.data.images.new("AO_dummy_" + name, 64, 64)
        added = []
        for slot in ob.material_slots:
            m = slot.material
            node = m.node_tree.nodes.new("ShaderNodeTexImage")
            node.image = img if m.name == matname else dummy
            m.node_tree.nodes.active = node
            added.append((m, node))
        for o in bpy.context.view_layer.objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        t0 = time.time()
        bpy.ops.object.bake(type="AO", margin=6, use_clear=True)
        print("baked AO", name, "%.0fs" % (time.time() - t0))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1, :, 0]
        # keep the darkest crevices readable, lift the open areas to 1
        px = np.clip((px - 0.08) / 0.84, 0, 1) ** 0.8
        px = 0.3 + 0.7 * px          # covered coves (under flaps / slats) stay dark grey, not black
        from PIL import Image as _I
        _I.fromarray((px * 255 + 0.5).astype(np.uint8), "L").save(os.path.join(C.WEB_ASSETS, fn), optimize=True)
        for m, node in added:
            m.node_tree.nodes.remove(node)
        bpy.data.images.remove(img)
        bpy.data.images.remove(dummy)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    if not QUICK:
        import textures_b787
        textures_b787.generate_all()
    C.reset_scene()
    col = C.collection("B787-9")
    root = C.empty("B787-9", col=col)
    M = make_materials()
    build_fuselage(M, root, col)
    for side in (1, -1):
        build_wing(M, root, col, side)
        build_engine(M, root, col, side)
    build_htail(M, root, col)
    build_vtail(M, root, col)
    build_gear(M, root, col)
    if LOD:
        # parked-aircraft level of detail: no cockpit / antennas / lights
        C.export_glb(os.path.join(C.WEB_ASSETS, "b787-9-lod.glb"), draco=True)
        tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
        print("LOD polygons:", tris)
        return
    build_details(M, root, col)
    build_cockpit(M, root, col)
    if "--bake" in sys.argv:
        bake_ao()

    # --- metadata for the simulator ------------------------------------------
    area, mac, y_mac, le_mac = G.wing_area_mac()
    meta = dict(
        name="Boeing 787-9",
        frame="three.js aircraft frame: +x forward, +y up, +z right; origin = reference CG",
        length=G.LENGTH, span=G.SPAN, height=G.HEIGHT,
        wingArea=round(area, 2), mac=round(mac, 3), macLE=G.to_three([le_mac, 0, 0])[0],
        groundY=G.GROUND_Z,
        eye=G.to_three(G.EYE),
        noseGear=G.to_three([G.S_NOSE, 0, G.GROUND_Z]),
        mainGearL=G.to_three([G.S_MAIN, G.Y_MAIN, G.GROUND_Z]),
        mainGearR=G.to_three([G.S_MAIN, -G.Y_MAIN, G.GROUND_Z]),
        tailStrike=G.to_three([56.5, 0, float(G.fus_profile(56.5)[1])]),
        wingTipL=G.to_three(list(G.wing_point(np.array(G.Y_TIP), np.array(0.5), np.array(False), 1))),
        wingTipR=G.to_three(list(G.wing_point(np.array(G.Y_TIP), np.array(0.5), np.array(False), -1))),
        engineL=G.to_three([G.ENG_S_HL + 3.0, G.ENG_Y, G.ENG_Z - 1.76]),
        engineR=G.to_three([G.ENG_S_HL + 3.0, -G.ENG_Y, G.ENG_Z - 1.76]),
        engineAxisL=G.to_three([G.ENG_S_HL + 5.0, G.ENG_Y, G.ENG_Z]),
        engineAxisR=G.to_three([G.ENG_S_HL + 5.0, -G.ENG_Y, G.ENG_Z]),
        noseTip=G.to_three([0, 0, -0.55]),
        # condensation sources: outboard flap tip (trailing edge) and upper-surface points
        flapTipL=G.to_three(list(G.wing_point(np.array(G.FLAP_OUT["y1"]), np.array(1.0), np.array(True), 1))),
        flapTipR=G.to_three(list(G.wing_point(np.array(G.FLAP_OUT["y1"]), np.array(1.0), np.array(True), -1))),
        wingVapor=[G.to_three(list(G.wing_point(np.array(y), np.array(x), np.array(True), 1)))
                   for y in np.linspace(4.5, 21.0, 12) for x in (0.12, 0.25, 0.4, 0.55)],
        parts=PARTS,
    )
    C.export_glb(os.path.join(C.WEB_ASSETS, "b787-9.glb"), draco=True)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == "MESH")
    print("objects:", len(bpy.data.objects), "polygons:", tris)

    # --- passenger cabin: separate file, loaded when the camera goes inside -------
    import cabin_b787
    ccol = C.collection("B787-9_Cabin")
    cabin_root, cabin = cabin_b787.build_cabin(ccol, tex)
    meta["cabin"] = cabin
    for ob in bpy.data.objects:
        ob.select_set(False)
    cabin_objs = [cabin_root] + list(cabin_root.children_recursive)
    for ob in cabin_objs:
        ob.select_set(True)
    C.export_glb(os.path.join(C.WEB_ASSETS, "b787-9-cabin.glb"), selected_only=True, draco=True)
    print("cabin polygons:", sum(len(o.data.polygons) for o in cabin_objs if o.type == "MESH"))
    with open(os.path.join(C.WEB_ASSETS, "b787-9.json"), "w") as fh:
        json.dump(meta, fh, indent=1)
    C.save_blend(os.path.join(C.OUT_DIR, "b787-9.blend"))


if __name__ == "__main__":
    main()
