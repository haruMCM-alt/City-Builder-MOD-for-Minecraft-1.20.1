"""
Detailed car bodies, built from reference photos (Wikimedia Commons) of each series.

Body = a closed solid lofted from the real cross-section (wide body with
side bulge for E231/E233), cab noses lofted from the same section with a
rounded edge, windows/doors cut in with boolean recesses, livery bands as
face materials so they follow the curved sides and nose exactly.
"""

import math
import random
import bpy
from mathutils import Vector, Matrix
from lib import MB, apply_boolean, delete, join, smooth, text_mesh, rounded_rect, prism
from frontpaint import Painter, front_material
import faces

L = 19.5           # body length; couplers make it 20.0 m over couplers
H = L / 2
BOGIE = 6.9        # bogie centre offset (13.8 m bogie centres)


# ---------------------------------------------------------------------------
# series description
# ---------------------------------------------------------------------------
class Series:
    def __init__(self, **kw):
        self.__dict__.update(kw)

    def width(self, z):
        t = self.width_table
        if z <= t[0][0]:
            return t[0][1]
        for (z0, w0), (z1, w1) in zip(t, t[1:]):
            if z <= z1:
                return w0 + (w1 - w0) * (z - z0) / (z1 - z0)
        return t[-1][1]


DOORS4 = [-7.23, -2.41, 2.41, 7.23]
DOORS3 = [-6.30, 0.0, 6.30]

E231 = Series(
    key="e231",
    # half widths: wide body (2,950 mm) with side bulge, narrowing to the roof
    width_table=[(1.05, 1.36), (1.15, 1.425), (1.35, 1.465), (1.55, 1.475), (2.10, 1.475),
                 (2.50, 1.468), (2.80, 1.452), (3.03, 1.415)],
    zb=1.05, cant=3.03, top=3.62, roof_e=0.62,
    doors=DOORS4, door_w=1.30, door_z=(1.10, 2.90),
    win_z=(1.86, 2.70), win_r=0.07,
    # side livery: (z0, z1, material, skip_doors)
    # side bands continue the front bands at the same height (measured on the face)
    side_zones=[(1.47, 1.65, "green", True), (1.65, 1.79, "orange", True), (2.87, 3.00, "green", False)],
    crew_mat="crew",                 # the crew door is painted green (itreni side photos)
    nose_r=0.30, rake=(1.95, 0.10),
    front_zones=[(1.05, 1.22, "body"), (1.22, 1.45, "gfrp"), (1.45, 1.52, "body"), (1.52, 1.76, "green"),
                 (1.76, 1.86, "orange"), (1.86, 1.98, "body"), (1.98, 3.30, "gfrp"), (3.30, 9, "body")],
    corner_zones=[(1.52, 1.76, "green"), (1.76, 1.86, "orange")],
    front="e231", skirt="e231v4",
    panto="single", ac="au726", green=True,
)

E233 = Series(
    key="e233",
    width_table=E231.width_table,
    zb=1.05, cant=3.03, top=3.62, roof_e=0.62,
    doors=DOORS4, door_w=1.30, door_z=(1.10, 2.90),
    win_z=(1.88, 2.72), win_r=0.05,
    side_zones=[(1.50, 1.66, "green", True), (1.66, 1.78, "orange", True), (2.87, 3.00, "green", False)],
    crew_mat="door",
    nose_r=0.42, rake=(1.40, 0.24), front_nx=0.80,
    front_zones=[(1.05, 1.36, "silver"), (1.36, 1.62, "green"), (1.62, 1.74, "orange"), (1.74, 3.42, "gfrp"), (3.42, 9, "white")],
    corner_zones=[(1.05, 1.36, "silver"), (1.36, 1.62, "green"), (1.62, 1.74, "orange"), (1.74, 3.50, "white")],
    front="e233", skirt="e233v4",
    panto="single", ac="au726", green=True,
)

S211 = Series(
    key="211",
    # straight-sided stainless body with a small tumblehome at the bottom
    width_table=[(1.05, 1.39), (1.20, 1.465), (2.85, 1.465), (3.03, 1.43)],
    zb=1.05, cant=3.03, top=3.60, roof_e=0.55,
    doors=DOORS3, door_w=1.30, door_z=(1.10, 2.86),
    win_z=(1.86, 2.66), win_r=0.03,
    # orange over green below the windows, orange line along the top
    side_zones=[(1.48, 1.62, "green", True), (1.62, 1.80, "orange", True), (2.84, 2.96, "orange", True)],
    crew_mat="door",
    nose_r=0.12, rake=(2.0, 0.04),
    # white painted face: green + orange band carrying the light units
    front_zones=[(1.05, 1.48, "white"), (1.48, 1.60, "green"), (1.60, 1.82, "orange"), (1.82, 9, "white")],
    corner_zones=[(1.05, 1.48, "white"), (1.48, 1.60, "green"), (1.60, 1.82, "orange"), (1.82, 3.10, "white")],
    front_nx=0.6,
    front="211", skirt="s211v4",
    panto="single", ac="au75s", green=True,
)

S115 = Series(
    key="115",
    width_table=[(1.05, 1.36), (1.15, 1.45), (2.80, 1.45), (3.00, 1.41)],
    zb=1.05, cant=3.00, top=3.66, roof_e=0.70,
    doors=DOORS3, door_w=1.10, door_z=(1.12, 2.86),
    win_z=(1.84, 2.62), win_r=0.03,
    # 湘南色: green lower body, orange from the window line up, green line at the roof edge
    side_zones=[(1.05, 1.74, "paint_green", False), (1.74, 3.00, "paint_orange", False)],
    crew_mat="paint_orange",
    door_mat="paint_orange",
    nose_r=0.20, rake=(2.95, 0.10),
    front_zones=[(1.05, 1.66, "paint_green"), (1.66, 3.06, "paint_orange"), (3.06, 9, "paint_green")],
    corner_zones=[(1.05, 1.64, "paint_green"), (1.64, 3.0, "paint_orange")],
    front_nx=0.7,
    body_mat="paint_orange", roof_mat="roofgrey",
    front="115", skirt="none",
    panto="diamond", ac="au75", green=False,
)

SERIES = {"e231": E231, "e233": E233, "211": S211, "115": S115}
for _k, _S in SERIES.items():
    if _k in faces.FACES:
        _S.face = faces.FACES[_k][0]


# ---------------------------------------------------------------------------
# profile + loft
# ---------------------------------------------------------------------------
def profile(S, levels, zb=None, cant=None, top=None, inset=0.0):
    """closed loop of (y, z): bottom centre → right side up → roof → left side down.
    `inset` offsets the loop inwards (used for the rounded nose)."""
    zb = S.zb if zb is None else zb
    cant = S.cant if cant is None else cant
    top = S.top if top is None else top
    right = [(0.0, zb), (-S.width(zb), zb)]
    for z in sorted(set(levels)):
        if zb + 1e-4 < z < cant - 1e-4:
            right.append((-S.width(z), z))
    right.append((-S.width(cant), cant))
    wc = S.width(cant)
    n = 12
    for k in range(1, n):
        t = k / n * math.pi / 2
        right.append((-wc * math.cos(t) ** S.roof_e, cant + (top - cant) * math.sin(t) ** S.roof_e))
    right.append((0.0, top))
    if inset > 0:
        right = inset_half(right, inset)
    loop = right + [(-y, z) for (y, z) in reversed(right[1:-1])]
    return loop, len(right) - 1


def inset_half(pts, d):
    """offset the right half-profile inwards by d (bottom edge stays put)"""
    out = []
    n = len(pts)
    for i, (y, z) in enumerate(pts):
        if i == 0:
            out.append((y, z))
            continue
        if i == n - 1:
            out.append((y, z - d))
            continue
        if i == 1:
            out.append((y + d, z))
            continue
        y0, z0 = pts[i - 1]
        y1, z1 = pts[i + 1] if i + 1 < n else pts[i]
        ty, tz = y1 - y0, z1 - z0
        ln = math.hypot(ty, tz) or 1
        ny, nz = tz / ln, -ty / ln          # inward normal for the right half going up
        out.append((y + ny * d, z + nz * d))
    return out


def loft(mb, rows, matfn, zc):
    """rows: list of closed loops of 3D points (same count). Shared vertices."""
    n = len(rows[0])
    ids = [[mb._v(p) for p in r] for r in rows]
    for i in range(len(rows) - 1):
        for j in range(n):
            j2 = (j + 1) % n
            q = [ids[i][j], ids[i][j2], ids[i + 1][j2], ids[i + 1][j]]
            P = [mb.verts[k] for k in q]
            c = sum(P, Vector()) / 4
            nrm = (P[1] - P[0]).cross(P[3] - P[0])
            if nrm.length < 1e-9:
                nrm = (P[2] - P[1]).cross(P[3] - P[1])
            out = Vector((0, c.y, c.z - zc))
            if nrm.dot(out) < 0:
                q.reverse()
                nrm = -nrm
            mb.faces.append((q, mb._mi(matfn(c, nrm.normalized())), True))
    return ids


def side_material(S, M, car, c, nrm):
    """material of a body face from its centre/normal (livery bands, doors, roof)."""
    if nrm.z < -0.7:
        return M["under"]
    if c.z > S.cant + 0.005:
        return M[getattr(S, "roof_mat", "roofgrey")]
    for (z0, z1, m, skip) in S.side_zones:
        if z0 <= c.z <= z1:
            if skip and car.in_door(c.x, c.z):
                break
            return M[m]
    if hasattr(car, "in_crew") and car.in_crew(c.x, c.z):
        return M[S.crew_mat]
    if car.in_door(c.x, c.z):
        return M[getattr(S, "door_mat", None) or ("door" if not hasattr(S, "body_mat") else S.body_mat)]
    return M[getattr(S, "body_mat", "body")]


# ---------------------------------------------------------------------------
# car layout (doors / windows per car type)
# ---------------------------------------------------------------------------
class Layout:
    def __init__(self, S, kind):
        self.S = S
        self.kind = kind
        self.doors = []       # (x0, x1, z0, z1)
        self.windows = []     # (cx, cz, w, h, r)
        self.door_windows = []
        self.crew = []
        dz0, dz1 = S.door_z
        hw = S.door_w / 2
        for d in S.doors:
            self.doors.append((d - hw, d + hw, dz0, dz1))
            for sx in (-1, 1):
                leaf_c = d + sx * hw / 2
                self.door_windows.append((leaf_c, (S.win_z[0] + 0.06 + S.win_z[1]) / 2, hw - 0.20, S.win_z[1] - S.win_z[0] - 0.02, 0.05))
        wz0, wz1 = S.win_z
        cz, wh = (wz0 + wz1) / 2, wz1 - wz0
        edges = [-H + 0.30] + sum([[d - hw - 0.28, d + hw + 0.28] for d in sorted(S.doors)], []) + [H - 0.30]
        cab_limit = H - 2.05 if kind == "cab" else H
        for a, b in zip(edges[0::2], edges[1::2]):
            b = min(b, cab_limit)
            span = b - a
            if span < 0.5:
                continue
            if S.key == "115" or S.key == "211":
                n = max(1, round(span / (1.05 if S.key == "115" else 1.35)))
                w = span / n
                for k in range(n):
                    self.windows.append((a + w * (k + 0.5), cz, w - 0.10, wh, S.win_r))
            elif span > 2.2:
                # E231/E233: a large two-pane window centred between the doors
                ww = min(span - 0.35, 2.45)
                for sx in (-1, 1):
                    self.windows.append(((a + b) / 2 + sx * (ww / 4 + 0.02), cz, ww / 2 - 0.04, wh, S.win_r))
            else:
                self.windows.append(((a + b) / 2, cz, span - 0.25, wh, S.win_r))
        if kind == "cab" and getattr(S, "face", None) and S.face.get("cab_side"):
            cs = S.face["cab_side"]
            self.crew.append(cs["crew"])
            self.door_windows += cs["door_windows"]
            self.windows += cs["windows"]
        elif kind == "cab":
            # crew door and cab side window
            self.crew.append((H - 1.62, H - 1.02, dz0 + 0.04, dz1))
            self.door_windows.append((H - 1.32, 2.30, 0.36, 0.62, 0.04))
            self.windows.append((H - 0.62, 2.28, 0.48, 0.66, 0.05))

    def in_door(self, x, z):
        for (x0, x1, z0, z1) in self.doors + self.crew:
            if x0 - 0.002 <= x <= x1 + 0.002 and z0 - 0.002 <= z <= z1 + 0.01:
                return True
        return False

    def in_crew(self, x, z):
        for (x0, x1, z0, z1) in self.crew:
            if x0 - 0.002 <= x <= x1 + 0.002 and z0 - 0.002 <= z <= z1 + 0.01:
                return True
        return False

    def x_stations(self):
        xs = {-H, H}
        for (x0, x1, _, _) in self.doors + self.crew:
            xs.update((x0, x1))
        return xs


# ---------------------------------------------------------------------------
# body
# ---------------------------------------------------------------------------
def levels_for(S):
    lv = {S.door_z[0], S.door_z[1], S.win_z[0], S.win_z[1], 1.30, 1.45, 2.2}
    for z0, z1, *_ in S.side_zones:
        lv.update((z0, z1))
    for z0, z1, _ in S.front_zones + S.corner_zones:
        lv.update((z0, min(z1, S.cant - 0.01)))
    return sorted(z for z in lv if S.zb < z < S.cant)


def rake_at(S, z):
    z0, r = S.rake
    if z <= z0:
        return 0.0
    return r * (z - z0) / (S.top - z0)


# ---------------------------------------------------------------------------
# v4 cab nose: measured side profile + plan curve, rounded edges, painted face
# ---------------------------------------------------------------------------
def _interp(table, z):
    if z <= table[0][0]:
        return table[0][1]
    for (z0, a), (z1, b) in zip(table, table[1:]):
        if z <= z1:
            return a + (b - a) * (z - z0) / (z1 - z0)
    return table[-1][1]


def face_x(S, y, z):
    """x of the cab face surface at (y, z): side-view setback + plan-view curve"""
    F = S.face
    set_c = _interp(F["profile"], z)
    wref = F.get("plan_w", 1.45)
    plan = F.get("plan_d", 0.0) * min(1.0, abs(y) / wref) ** F.get("plan_e", 2.0)
    return H - set_c - plan


def face_point(S, y, z, eps=0.0):
    return (face_x(S, y, z) + eps, y, z)


def build_nose(mb, S, M, rows_side, ids_side, lv, top_i, mf_side):
    """Rounded-edge nose: rings that turn from the side surface onto the face,
    then a structured grid over the face. Returns nothing (adds to mb)."""
    F = S.face
    r = F["corner_r"]
    fm = M["FRONT_" + S.key]
    K = F.get("rings", 6)
    loop0, _ = profile(S, lv)
    n = len(loop0)
    rings = []
    for k in range(K + 1):
        th = k / K * math.pi / 2
        d = r * (1 - math.cos(th))
        lp, _ = profile(S, lv, inset=d) if d > 1e-6 else (loop0, None)
        rings.append([(face_x(S, y, z) - r * (1 - math.sin(th)), y, z) for (y, z) in lp])

    def mfn(c, nrm):
        if nrm.z < -0.7:
            return M["under"]
        return fm
    # side body end row -> ring 0 -> ... -> ring K
    zc = (S.zb + S.top) / 2
    loft(mb, [rows_side[-1], rings[0]], mf_side, zc)        # still on the side surface
    ids = loft(mb, rings, mfn, zc)
    ringK = ids[-1]
    # face grid: horizontal rows between the mirrored contour points
    N = F.get("cols", 24)
    face_rows = []
    for i in range(1, top_i + 1):
        a, b = ringK[i], ringK[(n - i) % n]
        if i == top_i or a == b:
            face_rows.append([a])
            break
        pa, pb = mb.verts[a], mb.verts[b]
        row = [a]
        for j in range(1, N):
            t = j / N
            y = pa.y + (pb.y - pa.y) * t
            z = pa.z + (pb.z - pa.z) * t
            if i == 1 and j == N // 2:
                row.append(ringK[0])       # bottom centre of the contour
                continue
            row.append(mb._v(face_point(S, y, z)))
        row.append(b)
        face_rows.append(row)
    mi = mb._mi(fm)

    def add(q):
        P = [mb.verts[k] for k in q]
        nrm = (P[1] - P[0]).cross(P[-1] - P[0])
        if nrm.length < 1e-12 and len(q) == 4:
            nrm = (P[2] - P[1]).cross(P[3] - P[1])
        if nrm.x < 0:
            q = list(reversed(q))
        mb.faces.append((q, mi, True))
    for ra, rb in zip(face_rows, face_rows[1:]):
        if len(rb) == 1:
            for j in range(len(ra) - 1):
                add([ra[j], ra[j + 1], rb[0]])
        else:
            for j in range(len(ra) - 1):
                add([ra[j], ra[j + 1], rb[j + 1], rb[j]])


def build_body(S, M, car, coll, cab=False):
    mb = MB(f"{S.key}_{car.kind}_body")
    lv = levels_for(S)
    if cab and getattr(S, "face", None):
        extra = S.face.get("levels", [])
        lv = sorted(set(lv) | {z for z in extra if S.zb < z < S.cant})
    loop, top_i = profile(S, lv)
    zc = (S.zb + S.top) / 2
    xs = sorted(car.x_stations() | {x for x in [-H + 0.0, H]})
    x_end = H - S.nose_r if cab else H
    if cab and getattr(S, "face", None):
        # the side surface ends where the corner rounding begins (its rearmost point)
        x_end = min(face_x(S, y, z) for (y, z) in loop) - S.face["corner_r"] - 0.01
    xs = [x for x in xs if x <= x_end - 1e-3] + [x_end]
    rows = [[(x, y, z) for (y, z) in loop] for x in xs]

    def mf(c, n):
        return side_material(S, M, car, c, n)

    if cab and getattr(S, "face", None):
        ids = loft(mb, rows, mf, zc)
        mb.faces.append((list(reversed(ids[0])), mb._mi(M[getattr(S, "body_mat", "body")]), False))
        build_nose(mb, S, M, rows, ids, lv, top_i, mf)
        body = mb.build(coll)
        weld(body, 1e-6)
        fix_normals(body)
        return body
    if cab:
        # rounded nose: insets of the section, moved forward on a quarter circle
        K = 7
        nose_rows = []
        for k in range(1, K + 1):
            th = k / K * math.pi / 2
            d = S.nose_r * (1 - math.cos(th))
            lp, _ = profile(S, lv, inset=d)
            row = []
            for (y, z) in lp:
                x = H - S.nose_r + (S.nose_r * math.sin(th)) - rake_at(S, z) * math.sin(th)
                row.append((x, y, z))
            nose_rows.append(row)

        def mf_nose(c, n):
            if n.z < -0.7:
                return M["under"]
            if n.x > getattr(S, "front_nx", 2.0):
                for z0, z1, m in S.front_zones:
                    if z0 <= c.z <= z1:
                        return M[m]
            if n.x > 0.2:
                for z0, z1, m in S.corner_zones:
                    if z0 <= c.z <= z1:
                        return M[m]
                if c.z > S.cant:
                    return M[getattr(S, "roof_mat", "roofgrey")] if n.x < 0.6 else M[getattr(S, "body_mat", "body")]
                return M[getattr(S, "body_mat", "body")]
            return mf(c, n)

        ids = loft(mb, rows + nose_rows, lambda c, n: mf_nose(c, n) if c.x > x_end - 1e-3 else mf(c, n), zc)
        front = nose_rows[-1]
        fid = ids[-1]
    else:
        ids = loft(mb, rows, mf, zc)
        fid = ids[-1]
        front = rows[-1]
    # rear end cap (gangway end)
    mb.faces.append((list(reversed(ids[0])), mb._mi(M[getattr(S, "body_mat", "body")]), False))
    if cab:
        front_cap(mb, S, M, front, fid, top_i)
    else:
        mb.faces.append((list(ids[-1]), mb._mi(M[getattr(S, "body_mat", "body")]), False))
    # fix cap windings
    body = mb.build(coll)
    fix_normals(body)
    return body


def front_cap(mb, S, M, front, fid, top_i):
    """front face as horizontal strips so each strip can take a livery colour"""
    n = len(front)
    right = list(range(1, top_i + 1))         # bottom-right → top centre
    left = [(n - i) % n for i in right]       # mirrored indices
    left[-1] = top_i
    # bottom strip: bottom centre edge
    for a, b in zip(range(len(right) - 1), range(1, len(right))):
        ra, rb, la, lb = fid[right[a]], fid[right[b]], fid[left[a]], fid[left[b]]
        z = (mb.verts[ra].z + mb.verts[rb].z) / 2
        m = M[getattr(S, "body_mat", "body")]
        for z0, z1, mm in S.front_zones:
            if z0 <= z <= z1:
                m = M[mm]
                break
        quad = [ra, rb, lb, la] if rb != lb else [ra, rb, la]
        if a == 0:
            quad = [ra, rb, lb, la, fid[0]]
        mb.faces.append((quad, mb._mi(m), False))


def fix_normals(obj):
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(obj.data)
    bm.free()


# ---------------------------------------------------------------------------
# boolean cutters
# ---------------------------------------------------------------------------
def side_cutter(S, M, rects, coll, name, mat, depth=0.035, sides=(-1, 1)):
    mb = MB(name)
    for (cx, cz, w, h, r) in rects:
        outline = rounded_rect(cx, cz, w, h, r, n=3) if r > 0.005 else [(cx - w / 2, cz - h / 2), (cx + w / 2, cz - h / 2), (cx + w / 2, cz + h / 2), (cx - w / 2, cz + h / 2)]
        wsurf = S.width(cz)
        for s in sides:
            prism(mb, outline, lambda u, v, d, s=s: (u, s * d, v), wsurf - depth, wsurf + 0.08, mat)
    ob = mb.build(coll)
    weld(ob)
    return ob


def weld(ob, dist=1e-5):
    """merge coincident vertices so boolean cutters are closed manifolds"""
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ob.data)
    bm.free()


def groove_rects(rects, g=0.012):
    """thin frame + centre split grooves around door rectangles (bars kept 1 mm apart
    so the boolean solver never sees touching faces)"""
    out = []
    e = 0.0015
    for (x0, x1, z0, z1, split) in rects:
        cz, h = (z0 + z1) / 2, z1 - z0
        out += [(x0, cz, g, h, 0), (x1, cz, g, h, 0)]
        wbar = x1 - x0 - g - 2 * e
        out += [((x0 + x1) / 2, z1, wbar, g, 0), ((x0 + x1) / 2, z0 + 0.004, wbar, g, 0)]
        if split:
            out.append(((x0 + x1) / 2, cz + 0.002, g * 0.8, h - 2 * g - 2 * e, 0))
    return out


def glass_panes(mb, S, M, rects, inset=0.014, depth=0.022, sides=(-1, 1), m=None):
    for (cx, cz, w, h, r) in rects:
        outline = rounded_rect(cx, cz, w - 2 * inset, h - 2 * inset, max(0.0, r - inset * 0.5), n=3) if r > 0.01 else [
            (cx - w / 2 + inset, cz - h / 2 + inset), (cx + w / 2 - inset, cz - h / 2 + inset), (cx + w / 2 - inset, cz + h / 2 - inset), (cx - w / 2 + inset, cz + h / 2 - inset)]
        for s in sides:
            yy = S.width(cz) - depth
            mb.poly([(u, s * yy, v) for (u, v) in outline], m or M["sglass"], (0, s, 0))


def cut_body(body, S, M, car, coll):
    # door grooves
    rects = [(x0, x1, z0, z1, True) for (x0, x1, z0, z1) in car.doors] + [(x0, x1, z0, z1, False) for (x0, x1, z0, z1) in car.crew]
    gc = side_cutter(S, M, groove_rects(rects), coll, "cut_grooves", M["gap"], depth=0.012)
    apply_boolean(body, gc)
    delete(gc)
    wc = side_cutter(S, M, car.windows + car.door_windows, coll, "cut_windows", M["rubber"], depth=WALL + 0.06)
    apply_boolean(body, wc)
    delete(wc)


# ---------------------------------------------------------------------------
# v3: hollow shell + passenger saloon (seen through the side windows)
# ---------------------------------------------------------------------------
WALL = 0.045       # body shell thickness
FLOOR = 1.17       # saloon floor height above rail


def inner_solid(S, M, coll, x0, x1, floor=FLOOR, cant=None, top=None, lv=None, name="inner", t=WALL):
    """the cavity of the car body; subtracted from the closed body solid"""
    lv = lv or levels_for(S)
    cant = S.cant if cant is None else cant
    top = S.top if top is None else top
    loop, _ = profile(S, [z for z in lv if z > floor + 0.01], zb=floor, cant=cant, top=top, inset=t)
    mb = MB(name)

    def mf(c, n):
        if n.z < -0.7:
            return M["int_floor"]
        if c.z > cant - 0.02:
            return M["int_ceiling"]
        return M["int_wall"]
    rows = [[(x, y, z) for (y, z) in loop] for x in (x0, x1)]
    ids = loft(mb, rows, mf, (floor + top) / 2)
    mb.faces.append((list(reversed(ids[0])), mb._mi(M["int_wall"]), False))
    mb.faces.append((list(ids[-1]), mb._mi(M["int_wall"]), False))
    ob = mb.build(coll)
    weld(ob)
    return ob


def hollow(body, S, M, coll, x0, x1, **kw):
    inn = inner_solid(S, M, coll, x0, x1, **kw)
    apply_boolean(body, inn)
    delete(inn)


def wi(S, z):
    """inner half width of the saloon at height z"""
    return S.width(z) - WALL


def seat_segments(S, x0, x1, gap=0.10):
    hw = S.door_w / 2
    cuts = [x0]
    for d in sorted(S.doors):
        if x0 < d < x1:
            cuts += [d - hw - gap, d + hw + gap]
    cuts.append(x1)
    return [(a, b) for a, b in zip(cuts[0::2], cuts[1::2]) if b - a > 0.5]


def long_seat(mb, M, S, a, b, s, seat):
    ws = wi(S, 1.5)
    xc, ln = (a + b) / 2, b - a
    f = FLOOR
    mb.box((xc, s * (ws - 0.30), f + 0.20), (ln - 0.12, 0.36, 0.40), M["dkgrey"])            # base
    mb.box((xc, s * (ws - 0.27), f + 0.38), (ln - 0.08, 0.50, 0.11), seat)                   # cushion
    R = Matrix.Rotation(-s * math.radians(9), 3, "X")
    mb.box((xc, s * (ws - 0.10), f + 0.70), (ln - 0.08, 0.09, 0.52), seat, R)                # backrest
    # 袖仕切り (seat end partitions) + poles
    for xe in (a + 0.03, b - 0.03):
        mb.box((xe, s * (ws - 0.31), f + 0.62), (0.03, 0.60, 1.10), M["partition"])
        mb.cyl((xe, s * (ws - 0.64), (f + 3.36) / 2), (0, 0, 1), 0.018, 3.36 - f, M["pole"], seg=8)
    if ln > 2.4:
        xm = a + ln * 3 / 7
        mb.cyl((xm, s * (ws - 0.64), (f + 3.36) / 2), (0, 0, 1), 0.018, 3.36 - f, M["pole"], seg=8)
    # luggage rack + strap rail with hanging straps
    zr = 2.66
    mb.box((xc, s * (wi(S, zr) - 0.18), zr), (ln - 0.06, 0.32, 0.018), M["pole"])
    mb.cyl((xc, s * (wi(S, zr) - 0.34), zr + 0.01), (1, 0, 0), 0.012, ln - 0.06, M["pole"], seg=6)
    ys = s * (ws - 0.68)
    mb.cyl((xc, ys, 2.86), (1, 0, 0), 0.016, ln, M["pole"], seg=6)
    n = max(1, int((ln - 0.2) / 0.34))
    for k in range(n):
        x = a + 0.1 + (ln - 0.2) * (k + 0.5) / n
        mb.box((x, ys, 2.74), (0.026, 0.010, 0.22), M["strap"])
        mb.box((x, ys, 2.59), (0.11, 0.018, 0.09), M["strap"])


def box_seats(mb, M, S, a, b, s, seat):
    """semi-cross seating (115系): facing pairs between the doors"""
    ws = wi(S, 1.5)
    f = FLOOR
    n = max(1, int((b - a) / 1.48))
    bay = (b - a) / n
    y0, y1 = 0.42, ws - 0.04
    yc, wy = s * (y0 + y1) / 2, y1 - y0
    for k in range(n):
        xc = a + bay * (k + 0.5)
        for d in (-1, 1):
            xu = xc + d * 0.42
            mb.box((xu, yc, f + 0.38), (0.46, wy, 0.12), seat)
            mb.box((xu, yc, f + 0.18), (0.40, wy - 0.05, 0.34), M["dkgrey"])
            mb.box((xu + d * 0.27, yc, f + 0.86), (0.09, wy, 0.86), seat)
            mb.box((xu + d * 0.27, yc, f + 1.30), (0.10, wy, 0.06), M["headrest"])
        mb.box((xc, s * (ws - 0.05), f + 0.72), (0.30, 0.10, 0.04), M["grey"])               # window-side table
    zr = 2.66
    mb.box(((a + b) / 2, s * (wi(S, zr) - 0.18), zr), (b - a - 0.06, 0.32, 0.018), M["pole"])


def saloon(mb, M, S, x0, x1, kind):
    seat = M.get("seat_" + S.key, M["seat_e231"])
    segs = seat_segments(S, x0, x1)
    for i, (a, b) in enumerate(segs):
        end = (i == 0 and kind != "cab_rev") or i == len(segs) - 1
        for s in (-1, 1):
            if S.key == "115" and b - a > 2.4:
                box_seats(mb, M, S, a, b, s, seat)
            else:
                prio = end and S.key in ("e231", "e233") and (b - a) < 2.4 and s == 1
                long_seat(mb, M, S, a, b, s, M["seat_prio"] if prio else seat)
    # ceiling, light strips, door LCDs
    xc, ln = (x0 + x1) / 2, x1 - x0
    mb.box((xc, 0, 3.43), (ln - 0.02, 1.90, 0.02), M["int_ceiling"])
    for s in (-1, 1):
        mb.box((xc, s * 0.62, 3.405), (ln - 0.3, 0.15, 0.03), M["int_light"])
    hw = S.door_w / 2
    for d in S.doors:
        if not (x0 < d < x1):
            continue
        for s in (-1, 1):
            if S.key in ("e231", "e233"):
                mb.box((d, s * (wi(S, 3.0) - 0.05), 3.0), (0.56, 0.06, 0.17), M["lcd"])
            # door pocket side poles (yellow on JR East commuter cars near doors? keep stainless)
            for sx in (-1, 1):
                mb.cyl((d + sx * (hw + 0.06), s * (wi(S, 2.0) - 0.07), 2.0), (0, 0, 1), 0.016, 1.3, M["pole"], seg=8)


def side_lamps(mb, M, S, x):
    for s in (-1, 1):
        y = s * (S.width(2.99) + 0.012)
        mb.box((x, y, 2.99), (0.11, 0.026, 0.075), M["sidelamp"])
        mb.box((x, y - s * 0.008, 2.99), (0.14, 0.012, 0.10), M["dkgrey"])


# ---------------------------------------------------------------------------
# details
# ---------------------------------------------------------------------------
def bogie(mb, M, x, motor=False):
    """bolsterless bogie (DT61 motor / TR246 trailer style)"""
    frame = M["bogie"]
    sf = [(-1.45, 0.52), (-0.84, 0.47), (-0.46, 0.55), (0.46, 0.55), (0.84, 0.47), (1.45, 0.52),
          (1.45, 0.66), (1.20, 0.70), (0.86, 0.80), (0.46, 0.74), (-0.46, 0.74), (-0.86, 0.80), (-1.20, 0.70), (-1.45, 0.66)]
    for s in (-1, 1):
        prism(mb, sf, lambda u, v, d: (x + u, d, v), s * 0.93, s * 1.05, frame)
        # lightening holes / ribs on the side frame web
        for u in (-0.62, 0.62):
            mb.box((x + u, s * 1.055, 0.66), (0.10, 0.012, 0.16), M["dkgrey"])
        for ax in (-1.05, 1.05):
            mb.box((x + ax, s * 0.99, 0.43), (0.30, 0.20, 0.24), frame)                           # axle box
            mb.cyl((x + ax, s * 1.10, 0.43), (0, 1, 0), 0.10, 0.03, M["dkgrey"], seg=12)          # end cover
            mb.cyl((x + ax * 0.80, s * 0.99, 0.63), (0, 0, 1), 0.085, 0.20, M["dkgrey"], seg=12)  # axle spring
            mb.cyl((x + ax * 0.80, s * 0.99, 0.63), (0, 0, 1), 0.095, 0.05, frame, seg=12)
            mb.beam((x + ax, s * 0.99, 0.40), (x + ax * 0.62, s * 0.99, 0.50), 0.07, 0.08, frame)  # monolink
        mb.cyl((x, s * 0.99, 0.89), (0, 0, 1), 0.26, 0.17, M["airs"], seg=20)                   # air spring
        mb.cyl((x, s * 0.99, 0.99), (0, 0, 1), 0.27, 0.03, M["dkgrey"], seg=20)
        # yaw damper
        mb.beam((x - 0.35, s * 1.12, 0.74), (x + 0.75, s * 1.14, 0.78), 0.07, 0.07, M["grey"])
        for ax in (-1.05, 1.05):
            # tread brake unit
            mb.box((x + ax * 0.62, s * 0.80, 0.50), (0.24, 0.16, 0.20), M["dkgrey"])
    mb.box((x, 0, 0.64), (0.50, 1.86, 0.20), frame)                                             # transom
    mb.beam((x - 0.2, -0.5, 0.55), (x + 0.2, 0.5, 0.55), 0.06, 0.06, M["grey"])                 # lateral damper
    mb.box((x, 0, 0.83), (0.30, 0.50, 0.12), frame)                                             # centre pivot
    for ax in (-1.05, 1.05):
        for s in (-1, 1):
            mb.cyl((x + ax, s * 0.60, 0.43), (0, 1, 0), 0.43, 0.13, M["wheel"], seg=24)          # tread
            mb.cyl((x + ax, s * 0.525, 0.43), (0, 1, 0), 0.455, 0.022, M["wheel"], seg=24)       # flange
            mb.cyl((x + ax, s * 0.62, 0.43), (0, 1, 0), 0.36, 0.10, M["grey"], seg=20)           # dished web
            mb.cyl((x + ax, s * 0.62, 0.43), (0, 1, 0), 0.13, 0.15, M["dkgrey"], seg=12)         # hub
            if not motor:
                mb.cyl((x + ax, s * 0.28, 0.43), (0, 1, 0), 0.30, 0.07, M["brakedisc"], seg=20)  # axle disc
        mb.cyl((x + ax, 0, 0.43), (0, 1, 0), 0.08, 1.12, M["grey"], seg=10)
        if motor:
            mb.cyl((x + ax * 0.50, -0.10, 0.49), (0, 1, 0), 0.25, 0.66, M["under"], seg=16)      # traction motor
            mb.box((x + ax * 0.78, 0.36, 0.43), (0.62, 0.12, 0.46), M["under"])                  # gear case
    mb.box((x - 1.50, 0.62, 0.58), (0.08, 0.22, 0.26), M["dkgrey"])                             # ATS pickup
    mb.box((x + 1.50, -0.30, 0.20), (0.08, 0.40, 0.06), M["dkgrey"])
    return mb


def underfloor(mb, M, kind, seed):
    rnd = random.Random(seed)
    if kind in ("mid_panto", "mid"):
        boxes = [(-1.8, 2.6, 1.9, 0.62), (1.6, 1.8, 1.6, 0.55), (3.6, 1.0, 1.2, 0.45), (-4.2, 1.2, 1.4, 0.5)] if kind == "mid_panto" else [(-2.5, 1.6, 1.5, 0.5), (1.0, 2.2, 1.7, 0.55), (3.8, 0.9, 1.0, 0.4)]
    else:
        boxes = [(-2.0, 1.4, 1.3, 0.45), (0.8, 1.8, 1.5, 0.5), (3.5, 1.0, 1.1, 0.4)]
    for (cx, w, d, h) in boxes:
        side = rnd.choice((-1, 1)) * 0.0
        mb.box((cx, side, 1.02 - h / 2), (w, d, h), M["under"])
        mb.box((cx, side, 1.02 - h - 0.02), (w - 0.1, d - 0.1, 0.04), M["dkgrey"])
    # air tanks
    for s in (-1, 1):
        mb.cyl((-0.5 + s * 2.6, s * 0.95, 0.80), (1, 0, 0), 0.18, 1.6, M["silver"], seg=14)
    mb.box((0, 0, 1.0), (L - 2 * 3.0, 0.4, 0.06), M["dkgrey"])


def coupler(mb, M, x, sgn, front=False):
    mb.box((x + sgn * 0.30, 0, 0.86), (0.60, 0.20, 0.16), M["dkgrey"])
    mb.box((x + sgn * 0.62, 0, 0.86), (0.10, 0.36, 0.30), M["dkgrey"])
    mb.box((x + sgn * 0.70, -0.09, 0.86), (0.10, 0.10, 0.10), M["grey"])
    if front:
        mb.box((x + sgn * 0.48, 0, 0.66), (0.24, 0.34, 0.12), M["dkgrey"])        # electrical coupler
        for y in (-0.22, 0.22):
            mb.cyl((x + sgn * 0.45, y, 0.72), (0, 0, 1), 0.025, 0.28, M["rubber"], seg=6)


def gangway(mb, M, x, sgn, top=3.00):
    w = 0.62
    for k in range(5):
        xx = x + sgn * (0.03 + k * 0.05)
        mb.box((xx, 0, (1.10 + top) / 2), (0.045, 2 * w + (0.04 if k % 2 else 0), top - 1.10 + (0.04 if k % 2 else 0)), M["rubber"])
    # gangway door on the end wall
    mb.poly([(x + sgn * 0.003, -0.42, 1.15), (x + sgn * 0.003, 0.42, 1.15), (x + sgn * 0.003, 0.42, 2.92), (x + sgn * 0.003, -0.42, 2.92)], M["door"], (sgn, 0, 0))


def panto_ps33(mb, M, x, roof_z):
    base = roof_z + 0.06
    for dx in (-0.55, 0.55):
        for dy in (-0.45, 0.45):
            mb.cyl((x + dx, dy, base + 0.10), (0, 0, 1), 0.07, 0.20, M["white"], seg=10)   # insulators
    mb.box((x, 0, base + 0.22), (1.30, 1.00, 0.06), M["panto"])
    knee = (x + 0.62, 0, 4.42)
    mb.beam((x - 0.45, -0.18, base + 0.26), knee, 0.08, 0.10, M["panto"])
    mb.beam((x - 0.45, 0.18, base + 0.26), knee, 0.08, 0.10, M["panto"])
    mb.beam((x - 0.30, 0.0, base + 0.28), (x + 0.45, 0.0, 4.30), 0.03, 0.03, M["panto"])
    head = (x - 0.10, 0, 5.06)
    mb.beam(knee, head, 0.06, 0.06, M["panto"])
    mb.beam((x + 0.55, 0.0, 4.40), (x - 0.05, 0, 5.02), 0.025, 0.025, M["panto"])
    for dx in (-0.12, 0.12):
        mb.box((x - 0.10 + dx, 0, 5.11), (0.06, 1.25, 0.05), M["chrome"])
        for s in (-1, 1):
            mb.beam((x - 0.10 + dx, s * 0.62, 5.11), (x - 0.10 + dx, s * 0.92, 4.98), 0.03, 0.03, M["panto"])
    mb.box((x - 0.10, 0, 5.07), (0.30, 0.10, 0.05), M["panto"])
    # roof walkway + conduit
    mb.box((x - 1.6, 0.0, roof_z + 0.03), (2.0, 0.6, 0.03), M["grey"])
    mb.cyl((x - 3.5, 0.55, roof_z + 0.05), (1, 0, 0), 0.04, 6.0, M["grey"], seg=6)


def panto_pg16(mb, M, x, roof_z):
    base = roof_z + 0.06
    for dx in (-0.65, 0.65):
        for dy in (-0.55, 0.55):
            mb.cyl((x + dx, dy, base + 0.10), (0, 0, 1), 0.07, 0.20, M["white"], seg=10)
    top, mid = 5.06, (base + 0.25 + 5.06) / 2
    for s in (-1, 1):
        y = s * 0.55
        for a, b in (((x - 0.75, y, base + 0.25), (x, y * 0.7, mid)), ((x + 0.75, y, base + 0.25), (x, y * 0.7, mid)),
                     ((x, y * 0.7, mid), (x - 0.5, y * 0.8, top)), ((x, y * 0.7, mid), (x + 0.5, y * 0.8, top))):
            mb.beam(a, b, 0.045, 0.045, M["panto"])
    for dx in (-0.5, 0.5):
        mb.box((x + dx, 0, top + 0.03), (0.08, 1.30, 0.05), M["chrome"])
        for s in (-1, 1):
            mb.beam((x + dx, s * 0.65, top + 0.03), (x + dx, s * 0.95, top - 0.12), 0.03, 0.03, M["panto"])
    mb.box((x, 0, base + 0.20), (1.7, 1.2, 0.06), M["panto"])


def roof_ac(mb, M, S, x, roof_z):
    if S.ac == "au726":
        # AU726: low stainless unit with ribbed grilles and two fan openings
        outline = [(-1.35, 0.0), (1.35, 0.0), (1.30, 0.30), (1.10, 0.38), (-1.10, 0.38), (-1.30, 0.30)]
        prism(mb, outline, lambda u, v, d: (x + u, d, roof_z - 0.03 + v), -0.98, 0.98, M["silver"])
        for s in (-1, 1):
            for k in range(14):
                mb.box((x - 0.95 + k * 0.146, s * 0.99, roof_z + 0.16), (0.05, 0.02, 0.22), M["grille"])
        for dx in (-0.55, 0.55):
            mb.cyl((x + dx, 0, roof_z + 0.36), (0, 0, 1), 0.32, 0.03, M["grille"], seg=20)
            mb.cyl((x + dx, 0, roof_z + 0.37), (0, 0, 1), 0.06, 0.02, M["silver"], seg=10)
    elif S.ac == "au75s":
        outline = [(-1.6, 0.0), (1.6, 0.0), (1.55, 0.36), (-1.55, 0.36)]
        prism(mb, outline, lambda u, v, d: (x + u, d, roof_z - 0.02 + v), -0.95, 0.95, M["light_grey"])
        for dx in (-0.8, 0.8):
            mb.cyl((x + dx, 0, roof_z + 0.35), (0, 0, 1), 0.30, 0.03, M["grille"], seg=18)
    else:  # AU75 big unit on 115
        outline = [(-2.0, 0.0), (2.0, 0.0), (1.9, 0.42), (-1.9, 0.42)]
        prism(mb, outline, lambda u, v, d: (x + u, d, roof_z - 0.02 + v), -1.05, 1.05, M["light_grey"])
        for k in range(4):
            mb.cyl((x - 1.35 + k * 0.9, 0, roof_z + 0.41), (0, 0, 1), 0.30, 0.03, M["grille"], seg=18)
    # rain gutters along the cant rail
    for s in (-1, 1):
        mb.box((0, s * (S.width(S.cant) - 0.005), S.cant + 0.012), (L - 0.3, 0.025, 0.02), M["silver"])


def front_point(S, y, z, eps=0.0):
    return (H - rake_at(S, z) + eps, y, z)


def front_rect(mb, S, m, y0, y1, z0, z1, eps=0.006, r=0.0):
    if r > 0:
        pts = rounded_rect((y0 + y1) / 2, (z0 + z1) / 2, y1 - y0, z1 - z0, r, n=3)
    else:
        pts = [(y0, z0), (y1, z0), (y1, z1), (y0, z1)]
    mb.poly([front_point(S, y, z, eps) for (y, z) in pts], m, (1, 0, 0.05))


def front_details(mb, S, M, coll, extra):
    st = S.front
    if st == "e231":
        front_rect(mb, S, M["win"], -1.12, 1.12, 2.02, 3.27, r=0.10)
        front_rect(mb, S, M["dest"], -0.52, 0.48, 3.04, 3.22, eps=0.009)
        front_rect(mb, S, M["dest"], -1.02, -0.70, 2.12, 2.20, eps=0.009)
        for s in (-1, 1):
            y0, y1 = (0.70, 1.12) if s > 0 else (-1.12, -0.70)
            front_rect(mb, S, M["dkgrey"], y0, y1, 1.25, 1.42, eps=0.008)
            front_rect(mb, S, M["head"], min(y0, y1) + 0.03, max(y0, y1) - 0.14, 1.28, 1.39, eps=0.011)
        for s in (-1, 1):
            front_rect(mb, S, M["tail"], s * 1.02 - 0.05, s * 1.02 + 0.05, 1.28, 1.39, eps=0.012)
        add_logo(extra, S, coll, "JR", 0.86, 1.64, 0.16)
        wipers(mb, S, M, [(-0.62, 2.06, -0.08, 2.30), (0.05, 2.06, 0.58, 2.30)])
    elif st == "e233":
        front_rect(mb, S, M["win"], -0.98, 0.98, 2.10, 3.36, r=0.12)
        front_rect(mb, S, M["dest"], -0.62, 0.50, 3.13, 3.31, eps=0.009)
        for s in (-1, 1):
            front_rect(mb, S, M["tail"], s * 0.78 - 0.07, s * 0.78 + 0.07, 3.13, 3.31, eps=0.010)
            front_rect(mb, S, M["head"], s * 0.92 - 0.06, s * 0.92 + 0.06, 3.13, 3.31, eps=0.010)
        add_logo(extra, S, coll, "JR", 0.90, 1.86, 0.14)
        add_logo(extra, S, coll, "EAST JAPAN RAILWAY COMPANY", 0.28, 1.86, 0.045)
        wipers(mb, S, M, [(-0.70, 2.16, -0.10, 2.42), (0.05, 2.16, 0.62, 2.42)])
    elif st == "211":
        # two large black window panels, stainless centre gangway door
        for s_ in (-1, 1):
            y0, y1 = (0.40, 1.22) if s_ > 0 else (-1.22, -0.40)
            front_rect(mb, S, M["gfrp"], y0, y1, 1.92, 3.14, r=0.07)
            front_rect(mb, S, M["win"], y0 + 0.03, y1 - 0.03, 2.05, 3.08, eps=0.009, r=0.05)
        front_rect(mb, S, M["door"], -0.34, 0.34, 1.12, 3.02, eps=0.008)
        front_rect(mb, S, M["rubber"], -0.25, 0.25, 2.28, 2.90, eps=0.010, r=0.04)
        front_rect(mb, S, M["win"], -0.23, 0.23, 2.30, 2.88, eps=0.012, r=0.03)
        front_rect(mb, S, M["gfrp"], -0.30, 0.30, 3.05, 3.24, eps=0.009, r=0.02)
        front_rect(mb, S, M["dest"], -0.26, 0.26, 3.08, 3.21, eps=0.012)
        for s_ in (-1, 1):
            yc = s_ * 0.80
            front_rect(mb, S, M["light_grey"], yc - 0.24, yc + 0.24, 1.62, 1.80, eps=0.010, r=0.03)
            front_rect(mb, S, M["head"], yc + s_ * 0.06 - 0.07, yc + s_ * 0.06 + 0.07, 1.65, 1.77, eps=0.013, r=0.05)
            front_rect(mb, S, M["tail"], yc - s_ * 0.12 - 0.05, yc - s_ * 0.12 + 0.05, 1.66, 1.76, eps=0.013, r=0.04)
            front_rect(mb, S, M["light_grey"], yc - 0.22, yc + 0.22, 1.30, 1.34, eps=0.010)
        add_logo(extra, S, coll, "JR", 0.80, 2.88, 0.20)
        wipers(mb, S, M, [(0.48, 2.10, 1.0, 2.34), (-1.0, 2.10, -0.48, 2.34)])
    elif st == "115":
        # three windows in orange frames, orange centre door, round lamps
        front_rect(mb, S, M["rubber"], 0.40, 1.20, 2.08, 2.88, r=0.05)
        front_rect(mb, S, M["win"], 0.43, 1.17, 2.11, 2.85, eps=0.009, r=0.04)
        front_rect(mb, S, M["rubber"], -1.20, -0.40, 2.08, 2.88, r=0.05)
        front_rect(mb, S, M["win"], -1.17, -0.43, 2.11, 2.85, eps=0.009, r=0.04)
        front_rect(mb, S, M["black"], -0.36, 0.36, 1.18, 3.00, eps=0.006)
        front_rect(mb, S, M["paint_orange"], -0.34, 0.34, 1.20, 2.98, eps=0.008)
        front_rect(mb, S, M["rubber"], -0.26, 0.26, 2.18, 2.86, eps=0.010, r=0.04)
        front_rect(mb, S, M["win"], -0.24, 0.24, 2.20, 2.84, eps=0.012, r=0.03)
        front_rect(mb, S, M["light_grey"], -0.30, 0.30, 3.12, 3.30, eps=0.008)
        front_rect(mb, S, M["dest"], -0.27, 0.27, 3.14, 3.28, eps=0.011)
        for s_ in (-1, 1):
            hp = Vector(front_point(S, s_ * 0.80, 1.88, 0.03))
            mb.cyl(hp, (1, 0, 0), 0.10, 0.05, M["chrome"], seg=16)
            mb.cyl(hp + Vector((0.026, 0, 0)), (1, 0, 0), 0.075, 0.01, M["head"], seg=16)
            tp = Vector(front_point(S, s_ * 0.86, 1.42, 0.02))
            mb.cyl(tp, (1, 0, 0), 0.06, 0.04, M["chrome"], seg=12)
            mb.cyl(tp + Vector((0.021, 0, 0)), (1, 0, 0), 0.045, 0.01, M["tail"], seg=12)
            mp = Vector(front_point(S, s_ * 0.56, 1.88, 0.02))
            mb.cyl(mp, (1, 0, 0), 0.06, 0.04, M["paint_orange"], seg=12)
        mb.box(front_point(S, 0.0, 1.55, 0.05), (0.08, 0.30, 0.04), M["black"])  # step
        wipers(mb, S, M, [(0.55, 2.16, 0.98, 2.44), (-0.98, 2.16, -0.55, 2.44)])


def wipers(mb, S, M, segs):
    for (y0, z0, y1, z1) in segs:
        mb.beam(front_point(S, y0, z0, 0.03), front_point(S, y1, z1, 0.03), 0.018, 0.015, M["black"])


def add_logo(extra, S, coll, text, y, z, size):
    ob = text_mesh(text, size, coll, name="logo", extrude=0.0015)
    ob.data.materials.clear()
    ob.data.materials.append(bpy.data.materials["logo_white"])
    # text lies in XY (facing +Z); stand it up facing +X (front), raked like the face
    x = H - rake_at(S, z) + 0.012
    ob.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X")
    extra.append(ob)


def skirt(mb, S, M):
    x0 = H - 0.05
    if S.skirt == "s211v4":
        # 211: wide light-grey plate, shallow V bottom, side wings
        outline = [(-1.22, 0.60), (1.22, 0.60), (1.22, 0.30), (0.45, 0.23), (0.0, 0.20), (-0.45, 0.23), (-1.22, 0.30)]
        xs = H + 0.02

        def ax(u, v, d):
            return (xs + d + (0.60 - v) * 0.06, u, v)
        prism(mb, outline, ax, -0.05, 0.0, M["light_grey"])
        for s in (-1, 1):
            mb.poly([ax(s * 1.22, 0.60, -0.05), (xs - 0.6, s * 1.15, 0.60), (xs - 0.6, s * 1.10, 0.35), ax(s * 1.22, 0.30, -0.05)], M["light_grey"], (0, s, 0))
            mb.beam((xs - 0.6, s * 0.95, 0.92), (xs - 0.05, s * 1.05, 0.58), 0.06, 0.08, M["dkgrey"])
            mb.box((xs - 0.25, s * 0.62, 0.78), (0.18, 0.16, 0.22), M["dkgrey"])
        return
    if S.skirt == "e233v4":
        # E233-3000: big white plate with a deep U notch from the top, slots on the right wing
        outline = [(-1.30, 0.63), (-0.70, 0.63), (-0.33, 0.30), (0.33, 0.30), (0.70, 0.63), (1.30, 0.63),
                   (1.26, 0.22), (1.05, 0.10), (-1.05, 0.10), (-1.26, 0.22)]
        xs = H + 0.02

        def ax(u, v, d):
            return (xs + d + (0.63 - v) * 0.08, u, v)
        prism(mb, outline, ax, -0.06, 0.0, M["skirtw"])
        for k in range(3):
            mb.box(ax(0.92, 0.49 - k * 0.05, 0.004), (0.01, 0.30, 0.022), M["black"])
        for s in (-1, 1):
            mb.poly([ax(s * 1.30, 0.63, -0.06), (xs - 0.75, s * 1.22, 0.63), (xs - 0.75, s * 1.10, 0.30), ax(s * 1.26, 0.22, -0.06)], M["skirtw"], (0, s, 0))
            mb.beam((xs - 0.6, s * 0.95, 0.92), (xs - 0.05, s * 1.05, 0.60), 0.06, 0.08, M["dkgrey"])
            mb.box((xs - 0.25, s * 0.62, 0.78), (0.18, 0.16, 0.22), M["dkgrey"])
        mb.box((xs - 0.35, 0, 0.66), (0.3, 2.3, 0.06), M["dkgrey"])
        return
    if S.skirt == "e231v4":
        # E231-1000: low white plate, chamfered outer corners, shallow V notch at the bottom,
        # wrapping back at the sides; equipment and coupler visible above it
        outline = [(-1.30, 0.63), (1.30, 0.63), (1.27, 0.42), (1.06, 0.13), (0.36, 0.13), (0.20, 0.25),
                   (-0.20, 0.25), (-0.36, 0.13), (-1.06, 0.13), (-1.27, 0.42)]
        xs = H + 0.02

        def ax(u, v, d):
            return (xs + d + (0.63 - v) * 0.10, u, v)
        prism(mb, outline, ax, -0.05, 0.0, M["skirtw"])
        for s in (-1, 1):
            # side wings bending back towards the bogie
            mb.poly([ax(s * 1.30, 0.63, -0.05), (xs - 0.75, s * 1.22, 0.63), (xs - 0.75, s * 1.10, 0.30), ax(s * 1.27, 0.42, -0.05)], M["skirtw"], (0, s, 0))
            mb.beam((xs - 0.6, s * 0.95, 0.92), (xs - 0.05, s * 1.05, 0.60), 0.06, 0.08, M["dkgrey"])   # stays
            mb.box((xs - 0.25, s * 0.62, 0.78), (0.18, 0.16, 0.22), M["dkgrey"])                        # air hose cocks
            mb.cyl((xs - 0.12, s * 0.45, 0.70), (0, 0, 1), 0.025, 0.25, M["rubber"], seg=6)
        mb.box((xs - 0.35, 0, 0.66), (0.3, 2.3, 0.06), M["dkgrey"])                                     # cross beam
        return
    if S.skirt == "none":
        mb.box((x0 - 0.10, 0, 0.98), (0.20, 2.5, 0.12), M["dkgrey"])
        outline = [(-1.0, 0.90), (-0.9, 0.42), (0.9, 0.42), (1.0, 0.90), (0.30, 0.90), (0.30, 0.70), (-0.30, 0.70), (-0.30, 0.90)]
        prism(mb, outline, lambda u, v, d: (x0 - 0.15 + d, u, v), -0.04, 0.0, M["dkgrey"])
        return
    if S.skirt == "small211":
        mb.box((x0 + 0.02, 0, 1.00), (0.10, 2.4, 0.10), M["light_grey"])
        outline = [(-1.10, 0.98), (-1.0, 0.55), (1.0, 0.55), (1.10, 0.98), (0.40, 0.98), (0.40, 0.75), (-0.40, 0.75), (-0.40, 0.98)]
        m = M["light_grey"]
    elif S.skirt == "small":
        outline = [(-1.15, 1.00), (-1.0, 0.45), (1.0, 0.45), (1.15, 1.00), (0.42, 1.00), (0.42, 0.70), (-0.42, 0.70), (-0.42, 1.00)]
        m = M["dkgrey"]
    elif S.skirt == "e233":
        outline = [(-1.30, 1.02), (-1.12, 0.32), (1.12, 0.32), (1.30, 1.02), (0.52, 1.02), (0.44, 0.66), (-0.44, 0.66), (-0.52, 1.02)]
        m = M["silver"]
    else:  # e231: wide white-silver U-shaped obstacle deflector
        outline = [(-1.28, 1.02), (-1.06, 0.33), (1.06, 0.33), (1.28, 1.02), (0.56, 1.02), (0.48, 0.60), (-0.48, 0.60), (-0.56, 1.02)]
        m = M["skirtw"]

    def ax(u, v, d):
        lean = (1.02 - v) * 0.30
        return (x0 + lean + d, u, v)
    prism(mb, outline, ax, -0.05, 0.0, m)
    for s in (-1, 1):
        mb.beam((x0 - 0.5, s * 0.85, 1.0), (x0 + 0.1, s * 0.95, 0.55), 0.06, 0.08, M["dkgrey"])
    if S.skirt == "e233":
        for k in range(3):
            front_rect_skirt_slot(mb, x0, 0.70 + k * 0.0, M)


def front_rect_skirt_slot(mb, x0, y, M):
    for k in range(3):
        z = 0.42 + k * 0.05
        mb.box((x0 + (1.02 - z) * 0.30 + 0.004, 0.75, z), (0.01, 0.30, 0.02), M["black"])


def side_dest(mb, S, M, x, z):
    for s in (-1, 1):
        y = s * (S.width(z) + 0.004)
        mb.poly([(x - 0.42, y, z - 0.08), (x + 0.42, y, z - 0.08), (x + 0.42, y, z + 0.08), (x - 0.42, y, z + 0.08)], M["dest"], (0, s, 0))


# ---------------------------------------------------------------------------
# cars
# ---------------------------------------------------------------------------
def make_car(S, M, kind, coll):
    if kind == "green":
        return make_green(S, M, coll)
    car = Layout(S, kind)
    cab = kind == "cab"
    if cab and getattr(S, "face", None) and ("FRONT_" + S.key) not in M:
        P = Painter()
        faces.FACES[S.key][1](P, S)
        M["FRONT_" + S.key] = front_material(S.key, P)
    body = build_body(S, M, car, coll, cab=cab)
    xi0, xi1 = -H + 0.08, (H - 2.30 if cab else H - 0.08)
    hollow(body, S, M, coll, xi0, xi1)
    cut_body(body, S, M, car, coll)
    smooth(body, 30)
    det = MB(f"{S.key}_{kind}_details")
    glass_panes(det, S, M, [w for w in car.windows if w[0] < xi1] + [w for w in car.door_windows if w[0] < xi1])
    if cab:  # cab side windows stay dark (no saloon behind them)
        glass_panes(det, S, M, [w for w in car.windows if w[0] >= xi1] + [w for w in car.door_windows if w[0] >= xi1], m=M["win"])
    inner = MB(f"{S.key}_{kind}_saloon")
    saloon(inner, M, S, xi0, xi1, kind)
    side_lamps(det, M, S, -H + 0.55)
    side_dest(det, S, M, S.doors[1] + 1.25, S.win_z[1] + 0.13)
    for b in (-BOGIE, BOGIE):
        bogie(det, M, b, motor=(kind == "mid_panto" or (kind == "mid" and S.key in ("115", "211"))))
    underfloor(det, M, kind, hash((S.key, kind)) & 0xffff)
    roof_ac(det, M, S, -0.5 if kind != "mid_panto" else -3.6, S.top - 0.02)
    if kind == "mid_panto":
        (panto_ps33 if S.panto == "single" else panto_pg16)(det, M, 5.4, S.top - 0.03)
    gangway(det, M, -H, -1, top=S.door_z[1] + 0.05)
    coupler(det, M, -H, -1)
    extra = []
    if cab and getattr(S, "face", None):
        def fr(mb, m, y0, y1, z0, z1, eps=0.006, r=0.0):
            pts = rounded_rect((y0 + y1) / 2, (z0 + z1) / 2, y1 - y0, z1 - z0, r, n=3) if r > 0 else [(y0, z0), (y1, z0), (y1, z1), (y0, z1)]
            mb.poly([face_point(S, y, z, eps) for (y, z) in pts], m, (1, 0, 0))

        def logo(text, y, z, size):
            ob = text_mesh(text, size, coll, name="logo", extrude=0.0015)
            ob.data.materials.clear()
            ob.data.materials.append(bpy.data.materials["logo_white"])
            x = face_x(S, y, z) + 0.004
            ob.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(math.radians(90), 4, "Z") @ Matrix.Rotation(math.radians(90), 4, "X")
            extra.append(ob)
        wipers = faces.FACES[S.key][2](det, S, M, lambda y, z, e=0.0: face_point(S, y, z, e), fr, extra, logo)
        for (y0, z0, y1, z1) in wipers:
            det.beam(face_point(S, y0, z0, 0.025), face_point(S, y1, z1, 0.025), 0.016, 0.014, M["black"])
            det.cyl(face_point(S, y0, z0, 0.02), (1, 0, 0), 0.025, 0.03, M["black"], seg=10)
        skirt(det, S, M)
        coupler(det, M, H - 0.05, 1, front=True)
    elif cab:
        front_details(det, S, M, coll, extra)
        skirt(det, S, M)
        coupler(det, M, H - 0.05, 1, front=True)
        if S.key in ("e231", "e233"):
            det.cyl((H - 2.4, 0.0, S.top + 0.08), (0, 0, 1), 0.05, 0.16, M["black"], seg=8)  # antenna
    else:
        gangway(det, M, H, 1, top=S.door_z[1] + 0.05)
        coupler(det, M, H, 1)
    d = det.build(coll)
    smooth(d, 40)
    sal = inner.build(coll)
    smooth(sal, 35)
    obj = join([body, d, sal] + extra, f"{S.key}_{kind}")
    return obj


def make_green(S, M, coll):
    """Double-deck green car (サロE231/E230 style): flat-floor ends, low-slung double-deck centre."""
    mats = M
    lvA = sorted({1.45, 1.70, 1.78, 1.85, 2.72, 3.05, 3.24, 1.10, 2.90})
    car_end = Layout(S, "green_end")
    car_end.doors, car_end.windows, car_end.door_windows, car_end.crew = [], [], [], []
    # sections along x
    A0, A1 = -H, -4.85
    B0, B1 = 7.55, H
    D0, D1 = A1 - 0.05, B0 + 0.05
    doors = [(-5.75, -4.95, 1.10, 2.92), (7.65, 8.45, 1.10, 2.92)]
    car_end.doors = doors

    green_side = [(1.45, 1.70, "green", True), (1.70, 1.78, "orange", True), (3.05, 3.24, "green", False)]
    SA = Series(**{**S.__dict__, "side_zones": green_side, "door_z": (1.10, 2.92)})

    def section(x0, x1, zb, cant, top, levels, zones, name, taper=None):
        T = Series(**{**S.__dict__, "side_zones": zones})
        mb = MB(name)
        loop, _ = profile(T, levels, zb=zb, cant=cant, top=top)
        zc = (zb + top) / 2
        xs = sorted({x0, x1} | {d for (a, b, _, _) in doors for d in (a, b) if x0 < d < x1})
        rows = []
        for x in xs:
            rows.append([(x, y, z) for (y, z) in loop])
        if taper:
            rows = taper(rows)
        ids = loft(mb, rows, lambda c, n: side_material(T, mats, car_end, c, n), zc)
        mb.faces.append((list(reversed(ids[0])), mb._mi(mats["body"]), False))
        mb.faces.append((list(ids[-1]), mb._mi(mats["body"]), False))
        ob = mb.build(coll)
        fix_normals(ob)
        return ob

    endA = section(A0, A1, 1.05, 3.03, 3.62, lvA, green_side, "green_endA")
    endB = section(B0, B1, 1.05, 3.03, 3.62, lvA, green_side, "green_endB")
    # double-deck centre: lofted with rounded drop at both ends (bottom and roof)
    lvD = sorted({1.22, 1.29, 1.95, 2.05, 2.44, 2.53, 2.60, 3.32})
    # thick green band with orange on top between the decks (itreni side photos)
    zones_D = [(2.05, 2.44, "green", False), (2.44, 2.53, "orange", False)]
    TD = Series(**{**S.__dict__, "side_zones": zones_D})
    mbD = MB("green_dd")
    rows = []
    n_end = 6
    xs = [D0 + (0.55 * (1 - math.cos(math.pi / 2 * k / n_end))) for k in range(n_end + 1)]
    xs += [D1 - (0.55 * (1 - math.cos(math.pi / 2 * k / n_end))) for k in range(n_end, -1, -1)]
    for x in xs:
        e = min(x - D0, D1 - x)
        f = min(1.0, e / 0.55)
        f = math.sin(f * math.pi / 2)
        zb = 1.05 - (1.05 - 0.70) * f
        top = 3.62 + (4.07 - 3.62) * f
        cant = 3.38 + (3.56 - 3.38) * f
        lp, _ = profile(TD, lvD, zb=zb, cant=cant, top=top)
        rows.append([(x, y, z) for (y, z) in lp])
    TD.cant = 99.0
    class NoDoors:
        def in_door(self, x, z):
            return False
    nd = NoDoors()
    ids = loft(mbD, rows, lambda c, n: mats["roofgrey"] if n.z > 0.45 else side_material(TD, mats, nd, c, n), (0.7 + 4.07) / 2)
    mbD.faces.append((list(reversed(ids[0])), mbD._mi(mats["body"]), False))
    mbD.faces.append((list(ids[-1]), mbD._mi(mats["body"]), False))
    dd = mbD.build(coll)
    fix_normals(dd)
    # windows
    winA = [(-8.95, 2.28, 0.95, 0.82, 0.10), (-7.85, 2.28, 0.95, 0.82, 0.10), (-6.75, 2.28, 0.95, 0.82, 0.10)]
    dwin = [(-5.35, 2.42, 0.42, 0.78, 0.05), (8.05, 2.42, 0.42, 0.78, 0.05)]
    up = [(-3.17 + k * 2.26, 2.94, 2.00, 0.72, 0.16) for k in range(5)]
    low = [(-3.17 + k * 2.26, 1.62, 1.95, 0.64, 0.08) for k in range(5)]
    hollow(endA, SA, M, coll, A0 + 0.08, A1 - 0.06, lv=lvA)
    hollow(endB, SA, M, coll, B0 + 0.06, B1 - 0.08, lv=lvA)
    DI0, DI1 = D0 + 0.62, D1 - 0.62
    hollow(dd, TD, M, coll, DI0, DI1, floor=0.84, cant=3.56, top=4.07, lv=lvD)
    for ob, rects, grooves in ((endA, winA + dwin[:1], [doors[0]]), (endB, dwin[1:], [doors[1]])):
        g = side_cutter(SA, M, groove_rects([(a, b, c, d, False) for (a, b, c, d) in grooves]), coll, "gcut", M["gap"], depth=0.012)
        apply_boolean(ob, g)
        delete(g)
        wc = side_cutter(SA, M, rects, coll, "wcut", M["rubber"], depth=WALL + 0.06)
        apply_boolean(ob, wc)
        delete(wc)
    wc = side_cutter(TD, M, up + low, coll, "wcutD", M["rubber"], depth=WALL + 0.06)
    apply_boolean(dd, wc)
    delete(wc)
    for ob in (endA, endB, dd):
        smooth(ob, 30)
    det = MB("green_details")
    glass_panes(det, SA, M, winA + dwin)
    glass_panes(det, TD, M, up + low)
    for s in (-1, 1):  # green-car clover emblems by the doors
        for x in (-4.62, 7.30):
            y = s * (S.width(2.6) + 0.004)
            det.poly([(x - 0.13, y, 2.48), (x + 0.13, y, 2.48), (x + 0.13, y, 2.74), (x - 0.13, y, 2.74)], M["green_mark"], (0, s, 0))
    side_dest(det, SA, M, -8.2, 2.86)
    for b in (-BOGIE, BOGIE):
        bogie(det, M, b)
    side_lamps(det, M, SA, -H + 0.55)
    # green car interior: reclining seats on both decks and in the flat end section
    gi = MB("green_saloon")

    def recl_row(x, floor, s):
        ws = wi(S, floor + 0.6)
        y0, y1 = 0.36, ws - 0.05
        yc, wy = s * (y0 + y1) / 2, y1 - y0
        gi.box((x, yc, floor + 0.42), (0.50, wy, 0.12), M["seat_green"])
        gi.box((x, yc, floor + 0.20), (0.36, wy - 0.10, 0.36), M["dkgrey"])
        Rb = Matrix.Rotation(math.radians(-14), 3, "Y")
        gi.box((x - 0.27, yc, floor + 0.88), (0.10, wy, 0.82), M["seat_green"], Rb)
        gi.box((x - 0.36, yc, floor + 1.20), (0.11, wy - 0.04, 0.16), M["headrest"], Rb)
        for yy in (y0 + 0.02, y1 - 0.02, (y0 + y1) / 2):
            gi.box((x - 0.02, s * yy, floor + 0.56), (0.42, 0.05, 0.05), M["dkgrey"])        # arm rests

    for fl, xs_ in ((0.84, [DI0 + 0.75 + k * 0.97 for k in range(int((DI1 - DI0 - 0.8) / 0.97))]),
                    (2.44, [DI0 + 0.65 + k * 0.97 for k in range(int((DI1 - DI0 - 0.7) / 0.97))]),
                    (FLOOR, [-9.0, -8.03, -7.06])):
        for x in xs_:
            for s_ in (-1, 1):
                recl_row(x, fl, s_)
    # deck slab between the levels, ceilings and light strips
    gi.box(((DI0 + DI1) / 2, 0, 2.40), (DI1 - DI0 - 0.02, 2 * wi(S, 2.4) - 0.02, 0.08), M["int_floor"])
    gi.box(((DI0 + DI1) / 2, 0, 3.94), (DI1 - DI0 - 0.02, 1.80, 0.02), M["int_ceiling"])
    for s_ in (-1, 1):
        gi.box(((DI0 + DI1) / 2, s_ * 0.60, 2.345), (DI1 - DI0 - 0.4, 0.14, 0.02), M["int_light"])
        gi.box(((DI0 + DI1) / 2, s_ * 0.60, 3.92), (DI1 - DI0 - 0.4, 0.14, 0.02), M["int_light"])
        gi.box(((A0 + A1) / 2, s_ * 0.62, 3.405), (A1 - A0 - 0.4, 0.15, 0.03), M["int_light"])
    gi.box(((A0 + A1) / 2, 0, 3.43), (A1 - A0 - 0.2, 1.90, 0.02), M["int_ceiling"])
    gsal = gi.build(coll)
    smooth(gsal, 35)
    det.box((-H + 1.6, 0, 3.62 + 0.15), (2.4, 1.8, 0.32), M["silver"])
    det.box((H - 1.2, 0, 3.62 + 0.15), (1.6, 1.8, 0.32), M["silver"])
    for s in (-1, 1):
        det.cyl((1.2, s * 0.95, 0.62), (1, 0, 0), 0.16, 2.2, M["silver"], seg=12)
    gangway(det, M, -H, -1, top=2.95)
    gangway(det, M, H, 1, top=2.95)
    coupler(det, M, -H, -1)
    coupler(det, M, H, 1)
    d = det.build(coll)
    smooth(d, 40)
    return join([endA, endB, dd, d, gsal], f"{S.key}_green")
