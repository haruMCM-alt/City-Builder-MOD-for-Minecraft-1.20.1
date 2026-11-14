"""
Detailed running gear, underfloor equipment, roof units, end fittings and lamp units.

Every builder takes two mesh builders: `mb` for the parts that stay in every version of the car,
and `fb` for the fine parts (springs, bolts, hinges, fins, hoses, clamps). The fine parts are
exported as a separate "<car>_fine" node so the simplified distant cars in the game can leave
them out (src/carlod.js); close up, the full car shows them.

Axes as in cars.py: X = forward, Y = left, Z = up, rail top at Z = 0.
"""

import math
from mathutils import Vector


# ---------------------------------------------------------------------------
# shape helpers
# ---------------------------------------------------------------------------
def _frame(axis):
    a = Vector(axis).normalized()
    t = Vector((1, 0, 0)) if abs(a.x) < 0.9 else Vector((0, 1, 0))
    u = a.cross(t).normalized()
    v = a.cross(u)
    return a, u, v


def lathe(mb, c, axis, prof, m, seg=24, smooth=True, cap0=False, cap1=False):
    """surface of revolution: prof = [(t along axis, radius)], from one end to the other"""
    c = Vector(c)
    a, u, v = _frame(axis)
    rows = []
    for (t, r) in prof:
        rows.append([c + a * t + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r for i in range(seg)])

    def out(p):
        q = p - c
        return q - a * q.dot(a)
    mb.grid(rows, m, out, smooth=smooth, closed=True)
    if cap0 and prof[0][1] > 1e-4:
        mb.poly(rows[0], m, -a)
    if cap1 and prof[-1][1] > 1e-4:
        mb.poly(rows[-1], m, a)


def helix(mb, c, R, wire, turns, height, m, seg_turn=14, ring=6):
    """coil spring standing on c (axis +Z)"""
    c = Vector(c)
    n = max(4, int(turns * seg_turn))
    path = [c + Vector((R * math.cos(2 * math.pi * turns * k / n), R * math.sin(2 * math.pi * turns * k / n), height * k / n)) for k in range(n + 1)]
    rows = []
    for k, p in enumerate(path):
        tng = (path[min(n, k + 1)] - path[max(0, k - 1)]).normalized()
        radial = Vector((p.x - c.x, p.y - c.y, 0)).normalized()
        b = tng.cross(radial).normalized()
        nn = b.cross(tng).normalized()
        rows.append([p + (nn * math.cos(2 * math.pi * i / ring) + b * math.sin(2 * math.pi * i / ring)) * wire for i in range(ring)])
    mb.grid(rows, m, lambda q: q - c - Vector((0, 0, q.z - c.z)), smooth=True, closed=True)


def pipe(mb, pts, r, m, seg=8):
    """tube along a polyline"""
    pts = [Vector(p) for p in pts]
    rows = []
    for k, p in enumerate(pts):
        tng = (pts[min(len(pts) - 1, k + 1)] - pts[max(0, k - 1)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tng.z) < 0.9 else Vector((1, 0, 0))
        u = tng.cross(ref).normalized()
        v = tng.cross(u)
        rows.append([p + (u * math.cos(2 * math.pi * i / seg) + v * math.sin(2 * math.pi * i / seg)) * r for i in range(seg)])
    c = sum(pts, Vector()) / len(pts)
    mb.grid(rows, m, lambda q: q - c, smooth=True, closed=True)


def arc_pts(c, axis_u, axis_v, r, a0, a1, n=8):
    c, u, v = Vector(c), Vector(axis_u), Vector(axis_v)
    return [c + (u * math.cos(math.radians(a0 + (a1 - a0) * k / n)) + v * math.sin(math.radians(a0 + (a1 - a0) * k / n))) * r for k in range(n + 1)]


def bolt(fb, M, c, axis, r=0.014, h=0.012):
    fb.cyl(c, axis, r, h, M["chrome"], seg=6)


# ---------------------------------------------------------------------------
# wheelset (one per axle type, rotates in the game)
# ---------------------------------------------------------------------------
def wheel_profile(s):
    """(y, r) of one wheel from the flange (inside) to the outer face; s = +1 / -1 side"""
    p = [(0.505, 0.30), (0.505, 0.455), (0.515, 0.462), (0.528, 0.455), (0.540, 0.432), (0.555, 0.430),
         (0.640, 0.425), (0.655, 0.423), (0.660, 0.40), (0.650, 0.37), (0.640, 0.33), (0.66, 0.24),
         (0.69, 0.17), (0.70, 0.135), (0.73, 0.130), (0.735, 0.0)]
    return [(s * y, r) for (y, r) in p]


def wheelset(mb, M, motor):
    for s in (-1, 1):
        prof = wheel_profile(s)
        lathe(mb, (0, 0, 0), (0, 1, 0), prof, M["wheel"], seg=40)
        # inner face of the web
        lathe(mb, (0, 0, 0), (0, 1, 0), [(s * 0.505, 0.30), (s * 0.52, 0.22), (s * 0.56, 0.15), (s * 0.58, 0.12), (s * 0.58, 0.0)], M["grey"], seg=32)
        for k in range(6):
            a = k * math.pi / 3
            mb.cyl((0.095 * math.cos(a), s * 0.742, 0.095 * math.sin(a)), (0, 1, 0), 0.016, 0.02, M["chrome"], seg=6)
        for k in range(4):
            a = k * math.pi / 2 + 0.4
            mb.cyl((0.26 * math.cos(a), s * 0.655, 0.26 * math.sin(a)), (0, 1, 0), 0.035, 0.012, M["black"], seg=10)
        mb.box((0.0, s * 0.665, 0.33), (0.025, 0.01, 0.10), M["white"])
        if not motor:
            # axle-mounted ventilated brake disc
            lathe(mb, (0, s * 0.28, 0), (0, 1, 0), [(-0.035, 0.12), (-0.035, 0.30), (0.035, 0.30), (0.035, 0.12)], M["brakedisc"], seg=32)
            for k in range(16):
                a = k * math.pi / 8
                mb.box((0.215 * math.cos(a), s * 0.28, 0.215 * math.sin(a)), (0.02, 0.072, 0.14), M["dkgrey"])
            lathe(mb, (0, s * 0.28, 0), (0, 1, 0), [(-0.06, 0.08), (-0.06, 0.13), (0.06, 0.13), (0.06, 0.08)], M["grey"], seg=16)
    lathe(mb, (0, 0, 0), (0, 1, 0), [(-0.74, 0.085), (-0.62, 0.095), (-0.50, 0.095), (-0.45, 0.085), (0.45, 0.085), (0.50, 0.095), (0.62, 0.095), (0.74, 0.085)], M["grey"], seg=14)
    if motor:
        # driven gear wheel on the axle
        lathe(mb, (0, 0.30, 0), (0, 1, 0), [(-0.05, 0.10), (-0.05, 0.26), (0.05, 0.26), (0.05, 0.10)], M["dkgrey"], seg=28)


# ---------------------------------------------------------------------------
# bogie (DT61 motor / TR246 trailer style bolsterless bogie)
# ---------------------------------------------------------------------------
def side_frame(mb, M, x, s):
    """welded box side frame: web + top / bottom flanges, dropped in the middle"""
    top = [(-1.48, 0.70), (-1.20, 0.72), (-0.86, 0.82), (-0.50, 0.76), (0.50, 0.76), (0.86, 0.82), (1.20, 0.72), (1.48, 0.70)]
    bot = [(-1.48, 0.55), (-1.20, 0.56), (-0.86, 0.66), (-0.50, 0.56), (0.50, 0.56), (0.86, 0.66), (1.20, 0.56), (1.48, 0.55)]
    y0, y1 = s * 0.94, s * 1.06
    outline = top + list(reversed(bot))
    from lib import prism
    prism(mb, [(u, v) for (u, v) in outline], lambda u, v, d: (x + u, d, v), s * 0.965, s * 1.035, M["bogie"])
    # flanges (wider than the web)
    for line, dz in ((top, 0.012), (bot, -0.012)):
        for (u0, v0), (u1, v1) in zip(line, line[1:]):
            mb.beam((x + u0, s * 1.0, v0 + dz), (x + u1, s * 1.0, v1 + dz), 0.13, 0.024, M["bogie"])
    # spring caps over the axle boxes and the air spring seat
    for u in (-1.05, 1.05):
        mb.box((x + u * 0.78, s * 1.0, 0.80), (0.24, 0.14, 0.04), M["bogie"])
    mb.box((x, s * 1.0, 0.775), (0.62, 0.18, 0.03), M["bogie"])
    return y0, y1


def bogie(mb, fb, M, x, motor=False):
    for s in (-1, 1):
        side_frame(mb, M, x, s)
        # lightening holes on the web
        for u in (-0.30, 0.30):
            mb.cyl((x + u, s * 1.037, 0.66), (0, 1, 0), 0.055, 0.006, M["dkgrey"], seg=14)
        for ax in (-1.05, 1.05):
            xa = x + ax
            # axle box: cylindrical bearing housing + upper body + front cover with bolts
            mb.cyl((xa, s * 1.0, 0.43), (0, 1, 0), 0.135, 0.22, M["bogie"], seg=20)
            mb.box((xa, s * 1.0, 0.56), (0.30, 0.20, 0.12), M["bogie"])
            mb.cyl((xa, s * 1.115, 0.43), (0, 1, 0), 0.105, 0.02, M["dkgrey"], seg=20)
            for k in range(6):
                a = k * math.pi / 3
                bolt(fb, M, (xa + 0.08 * math.cos(a), s * 1.13, 0.43 + 0.08 * math.sin(a)), (0, 1, 0), 0.010, 0.012)
            # axle-end earthing device on one side
            if s > 0 and ax > 0:
                mb.cyl((xa, s * 1.15, 0.43), (0, 1, 0), 0.06, 0.06, M["grey"], seg=12)
            # axle springs (coil pair) on spring seats
            for dy in (-0.05, 0.05):
                pass
            sx = x + ax * 0.78
            mb.cyl((sx, s * 1.0, 0.585), (0, 0, 1), 0.10, 0.02, M["bogie"], seg=16)
            helix(fb, (sx, s * 1.0, 0.595), 0.07, 0.016, 5.5, 0.19, M["spring"], seg_turn=16, ring=6)
            fb.cyl((sx, s * 1.0, 0.70), (0, 0, 1), 0.045, 0.18, M["spring"], seg=10)        # inner spring
            # monolink (axle beam) to the frame, with a rubber bush
            mb.beam((xa, s * 1.0, 0.45), (x + ax * 0.55, s * 1.0, 0.56), 0.09, 0.08, M["bogie"])
            mb.cyl((x + ax * 0.55, s * 1.0, 0.56), (0, 1, 0), 0.06, 0.14, M["rubber"], seg=12)
            # axle damper (vertical) beside the spring
            fb.cyl((x + ax * 0.92, s * 1.08, 0.62), (0, 0, 1), 0.03, 0.22, M["grey"], seg=8)
        # air spring (bellows) and its top plate
        lathe(mb, (x, s * 1.0, 0.79), (0, 0, 1), [(0.0, 0.0), (0.0, 0.21), (0.03, 0.25), (0.08, 0.285), (0.13, 0.28), (0.17, 0.25), (0.19, 0.22), (0.19, 0.0)], M["airs"], seg=28, cap1=True)
        mb.cyl((x, s * 1.0, 0.995), (0, 0, 1), 0.27, 0.03, M["dkgrey"], seg=28)
        # yaw damper along the frame, outside
        mb.cyl((x + 0.35, s * 1.14, 0.76), (1, 0, 0.04), 0.045, 0.62, M["grey"], seg=12)
        fb.cyl((x + 0.80, s * 1.14, 0.78), (1, 0, 0.04), 0.018, 0.30, M["chrome"], seg=8)
        mb.box((x - 0.02, s * 1.12, 0.75), (0.08, 0.06, 0.12), M["bogie"])
        mb.box((x + 0.98, s * 1.12, 0.79), (0.08, 0.06, 0.12), M["bogie"])
        # height-valve levelling rod
        fb.cyl((x - 0.42, s * 1.08, 0.86), (0, 0, 1), 0.008, 0.22, M["grey"], seg=6)
        fb.box((x - 0.42, s * 1.08, 0.98), (0.10, 0.03, 0.04), M["dkgrey"])
        # brake hoses (loops from the frame down to the brake units)
        for ax in (-1.05, 1.05):
            p0 = (x + ax * 0.45, s * 0.95, 0.72)
            p1 = (x + ax * 0.55, s * 0.88, 0.62)
            p2 = (x + ax * 0.62, s * 0.84, 0.55)
            pipe(fb, [p0, p1, p2], 0.012, M["black"], seg=6)
        if motor:
            for ax in (-1.05, 1.05):
                # tread brake unit with its shoe on the wheel
                bx = x + ax * 0.58
                mb.box((bx, s * 0.78, 0.48), (0.22, 0.16, 0.22), M["equip"])
                mb.cyl((bx + 0.02 * (1 if ax > 0 else -1), s * 0.78, 0.48), (1, 0, 0), 0.06, 0.30, M["equip"], seg=12)
                shoe = arc_pts((x + ax, s * 0.60, 0.43), (-1 if ax > 0 else 1, 0, 0), (0, 0, 1), 0.445, -25, 25, 6)
                pipe(fb, shoe, 0.03, M["brakeshoe"], seg=6)
        else:
            for ax in (-1.05, 1.05):
                # disc brake caliper on the axle disc
                cx = x + ax
                mb.box((cx + (0.34 if ax < 0 else -0.34), s * 0.28, 0.43), (0.16, 0.14, 0.22), M["equip"])
                mb.box((cx + (0.22 if ax < 0 else -0.22), s * 0.28, 0.48), (0.12, 0.10, 0.10), M["equip"])
    # transom: two tubes across + centre pivot + traction link
    for dx in (-0.28, 0.28):
        mb.cyl((x + dx, 0, 0.64), (0, 1, 0), 0.085, 1.94, M["bogie"], seg=16)
    mb.box((x, 0, 0.70), (0.66, 0.40, 0.14), M["bogie"])
    mb.box((x, 0, 0.84), (0.30, 0.36, 0.14), M["bogie"])
    mb.beam((x - 0.10, 0.30, 0.78), (x + 0.55, 0.30, 0.80), 0.08, 0.06, M["bogie"])                    # traction link
    mb.cyl((x + 0.20, -0.45, 0.70), (0, 1, 0), 0.04, 0.42, M["grey"], seg=10)                          # lateral damper
    if motor:
        for ax in (-1.05, 1.05):
            sg = 1 if ax > 0 else -1
            mx = x + ax * 0.48
            # traction motor: ribbed frame, end shields, terminal box, flexible coupling, gear case
            lathe(mb, (mx, -0.08, 0.50), (0, 1, 0), [(-0.36, 0.0), (-0.36, 0.20), (-0.33, 0.25), (0.30, 0.25), (0.33, 0.20), (0.33, 0.0)], M["equip"], seg=24)
            for k in range(10):
                fb.box((mx, -0.08 - 0.30 + k * 0.065, 0.50 + 0.255), (0.42, 0.012, 0.02), M["equip"])
                fb.box((mx + sg * 0.0, -0.08 - 0.30 + k * 0.065, 0.50 - 0.255), (0.42, 0.012, 0.02), M["equip"])
            mb.box((mx - sg * 0.12, -0.10, 0.80), (0.16, 0.20, 0.10), M["equip"])                         # terminal box
            pipe(fb, [(mx - sg * 0.12, -0.10, 0.85), (mx - sg * 0.25, -0.05, 0.98), (x, 0.0, 1.05)], 0.02, M["black"], seg=6)
            fb.cyl((mx, 0.32, 0.47), (0, 1, 0), 0.10, 0.08, M["grey"], seg=14)                           # coupling
            from lib import prism
            gear = [(-0.36, -0.12), (0.10, -0.20), (0.36, -0.12), (0.36, 0.14), (0.10, 0.22), (-0.36, 0.14)]
            prism(mb, gear, lambda u, v, d, ax=ax: (x + ax + (-u if ax > 0 else u) * 0.9, d, 0.43 + v), 0.34, 0.46, M["equip"])
            mb.cyl((x + ax, 0.40, 0.43), (0, 1, 0), 0.10, 0.14, M["equip"], seg=16)
    # ATS pickup and its bracket, ahead of the front axle
    mb.box((x - 1.55, 0.62, 0.22), (0.10, 0.22, 0.06), M["dkgrey"])
    mb.box((x - 1.50, 0.62, 0.40), (0.05, 0.06, 0.34), M["bogie"])
    for s in (-1, 1):
        for u in (-1.30, -0.62, 0.62, 1.30):
            bolt(fb, M, (x + u, s * 1.037, 0.62), (0, 1, 0))
            bolt(fb, M, (x + u, s * 1.037, 0.68), (0, 1, 0))


# ---------------------------------------------------------------------------
# underfloor equipment
# ---------------------------------------------------------------------------
def eq_box(mb, fb, M, cx, w, d, h, style="plain", side=0.0, z_top=1.04, mat=None):
    """box hung under the floor: lid lips, hinges, handles, and fins / louvres on the outer faces"""
    m = mat or M["equip"]
    zc = z_top - h / 2
    mb.box((cx, side, zc), (w, d, h), m)
    # lid frame lips on both long faces
    for s in (-1, 1):
        y = side + s * (d / 2 + 0.006)
        mb.box((cx, y, zc + h / 2 - 0.02), (w + 0.02, 0.014, 0.04), m)
        mb.box((cx, y, zc - h / 2 + 0.02), (w + 0.02, 0.014, 0.04), m)
        nlid = max(1, round(w / 0.75))
        for k in range(nlid):
            lx = cx - w / 2 + (k + 0.5) * w / nlid
            if k:
                mb.box((cx - w / 2 + k * w / nlid, y, zc), (0.012, 0.014, h - 0.04), M["dkgrey"])
            # hinges along the top, a handle + latch at the bottom
            for hx in (-0.22, 0.22):
                fb.cyl((lx + hx * (w / nlid) / 0.75 * 0.75, y + s * 0.012, zc + h / 2 - 0.05), (1, 0, 0), 0.012, 0.08, M["chrome"], seg=6)
            fb.box((lx, y + s * 0.02, zc - h / 2 + 0.08), (0.12, 0.012, 0.025), M["chrome"])
            fb.box((lx + 0.18, y + s * 0.016, zc - h / 2 + 0.07), (0.03, 0.012, 0.05), M["dkgrey"])
            if style == "fins":
                # cooling fins on the outer face of this lid
                nf = int((w / nlid - 0.12) / 0.035)
                for f in range(nf):
                    fx = lx - (w / nlid - 0.12) / 2 + f * 0.035
                    fb.box((fx, y + s * 0.04, zc - 0.02), (0.006, 0.07, h * 0.62), M["fin"])
            elif style == "louvre":
                nl = int((h - 0.14) / 0.045)
                for f in range(nl):
                    fz = zc - h / 2 + 0.09 + f * 0.045
                    fb.beam((lx - (w / nlid) * 0.36, y + s * 0.012, fz), (lx + (w / nlid) * 0.36, y + s * 0.012, fz), 0.02, 0.012, M["dkgrey"], up=(0, 0, 1))
    # hangers to the underframe
    for hx in (-w / 2 + 0.08, w / 2 - 0.08):
        for s in (-1, 1):
            mb.box((cx + hx, side + s * (d / 2 - 0.08), z_top + 0.02), (0.08, 0.10, 0.06), M["dkgrey"])


def tank(mb, fb, M, cx, y, z, length, r, m=None):
    """air reservoir along x with domed ends, straps and brackets"""
    m = m or M["silver"]
    hl = length / 2
    prof = [(-hl, 0.0), (-hl + 0.02, r * 0.45), (-hl + 0.06, r * 0.82), (-hl + 0.12, r * 0.98), (-hl + 0.18, r),
            (hl - 0.18, r), (hl - 0.12, r * 0.98), (hl - 0.06, r * 0.82), (hl - 0.02, r * 0.45), (hl, 0.0)]
    lathe(mb, (cx, y, z), (1, 0, 0), prof, m, seg=20)
    for sx in (-hl * 0.55, hl * 0.55):
        lathe(fb, (cx + sx, y, z), (1, 0, 0), [(-0.025, r + 0.006), (0.025, r + 0.006), (0.025, r + 0.016), (-0.025, r + 0.016)], M["dkgrey"], seg=20)
        mb.box((cx + sx, y, z + r + 0.05), (0.05, 0.08, 0.12), M["dkgrey"])
    fb.cyl((cx - hl - 0.03, y, z), (1, 0, 0), 0.02, 0.06, M["chrome"], seg=8)            # drain cock


def conduit_run(mb, fb, M, x0, x1, y, z, n=3, r=0.022):
    """cable conduits / air pipes along the car with clamps"""
    for k in range(n):
        pipe(mb, [(x0, y + k * 0.055, z), (x1, y + k * 0.055, z)], r, M["dkgrey"] if k % 2 else M["black"], seg=8)
    x = x0 + 0.3
    while x < x1 - 0.2:
        fb.box((x, y + (n - 1) * 0.0275, z), (0.03, (n - 1) * 0.055 + 0.08, 0.06), M["grey"])
        x += 0.6


def compressor(mb, fb, M, cx, side=0.0):
    """scroll compressor unit with its cooling fan opening"""
    eq_box(mb, fb, M, cx, 1.1, 1.0, 0.55, "plain", side)
    for s in (-1, 1):
        y = side + s * 0.52
        mb.cyl((cx - 0.15, y, 0.74), (0, 1, 0), 0.20, 0.02, M["dkgrey"], seg=24)
        lathe(fb, (cx - 0.15, y + s * 0.012, 0.74), (0, 1, 0), [(-0.01, 0.17), (-0.01, 0.20), (0.01, 0.20), (0.01, 0.17)], M["chrome"], seg=24)
        for k in range(6):
            a = k * math.pi / 3
            fb.beam((cx - 0.15, y + s * 0.012, 0.74), (cx - 0.15 + 0.17 * math.cos(a), y + s * 0.012, 0.74 + 0.17 * math.sin(a)), 0.012, 0.012, M["chrome"])


def reactor(mb, fb, M, cx, side=0.0):
    """filter reactor: ribbed drum under the floor"""
    lathe(mb, (cx, side, 0.74), (0, 1, 0), [(-0.45, 0.0), (-0.45, 0.30), (0.45, 0.30), (0.45, 0.0)], M["equip"], seg=24)
    for k in range(9):
        lathe(fb, (cx, side - 0.40 + k * 0.10, 0.74), (0, 1, 0), [(-0.008, 0.30), (-0.008, 0.33), (0.008, 0.33), (0.008, 0.30)], M["fin"], seg=24)
    mb.box((cx, side, 1.02), (0.5, 0.8, 0.06), M["dkgrey"])


UNDER_KIND = {
    # car kind -> list of (type, x centre, width, depth, height, extra)
    "mid_panto": [("box", -1.7, 2.4, 1.70, 0.62, "fins"), ("reactor", 1.45, 0, 0, 0, None), ("box", 3.25, 1.0, 1.2, 0.45, "plain"),
                  ("box", -4.15, 1.1, 1.3, 0.48, "louvre")],
    "mid": [("box", -1.6, 2.0, 1.60, 0.58, "fins"), ("box", 0.85, 1.1, 1.3, 0.52, "plain"), ("cp", 2.75, 0, 0, 0, None),
            ("box", -4.15, 1.0, 1.2, 0.45, "louvre")],
    "cab": [("box", -2.6, 1.6, 1.4, 0.50, "louvre"), ("box", -0.25, 1.1, 1.2, 0.46, "plain"), ("box", 1.65, 0.9, 1.1, 0.42, "plain")],
    "green": [("box", -2.0, 1.4, 1.3, 0.45, "louvre"), ("box", 1.8, 1.2, 1.2, 0.42, "plain")],
}


def underfloor(mb, fb, M, kind):
    for (t, cx, w, d, h, extra) in UNDER_KIND.get(kind, UNDER_KIND["cab"]):
        if t == "box":
            eq_box(mb, fb, M, cx, w, d, h, extra)
        elif t == "reactor":
            reactor(mb, fb, M, cx)
        elif t == "cp":
            compressor(mb, fb, M, cx)
    # air reservoirs along the sides
    if kind in ("mid", "cab", "green"):
        tank(mb, fb, M, 3.9 if kind != "mid" else 4.3, -0.82, 0.80, 1.5, 0.19)
        tank(mb, fb, M, 3.9 if kind != "mid" else 4.3, 0.82, 0.80, 1.2, 0.16)
    else:
        tank(mb, fb, M, 4.6, -0.85, 0.82, 1.1, 0.16)
    # cross members and the centre sill under the floor
    for k in range(-5, 6):
        xx = k * 1.15
        if abs(abs(xx) - 6.9) < 1.7:
            continue
        mb.box((xx, 0, 1.075), (0.08, 2.5, 0.07), M["dkgrey"])
    mb.box((0, 0, 1.06), (L_UNDER, 0.30, 0.08), M["dkgrey"])
    # cable / pipe runs between the bogies
    conduit_run(mb, fb, M, -5.1, 5.1, -1.10, 1.00)
    conduit_run(mb, fb, M, -5.1, 5.1, 0.98, 1.00, n=2)


L_UNDER = 19.5 - 2 * 3.0


# ---------------------------------------------------------------------------
# roof air conditioner
# ---------------------------------------------------------------------------
def roof_ac_au726(mb, fb, M, x, roof_z, length=2.7):
    """AU726-type unit: rounded cover, side ribs and grille slits, top seams, two fan 'eyes'"""
    from lib import prism
    hl = length / 2
    outline = [(-hl, 0.0), (hl, 0.0), (hl - 0.03, 0.22), (hl - 0.10, 0.33), (hl - 0.22, 0.38), (-hl + 0.22, 0.38), (-hl + 0.10, 0.33), (-hl + 0.03, 0.22)]
    prism(mb, outline, lambda u, v, d: (x + u, d, roof_z - 0.03 + v), -0.98, 0.98, M["silver"])
    # rounded long edges
    for s in (-1, 1):
        mb.cyl((x, s * 0.955, roof_z + 0.33), (1, 0, 0), 0.05, length - 0.40, M["silver"], seg=10)
    gx = x - (hl - 1.25) if length > 3.6 else x
    for s in (-1, 1):
        y = s * 0.985
        # grille slits between ribs (recessed dark), two banks
        for bank in (-0.55, 0.55):
            for k in range(8):
                fb.box((gx + bank - 0.40 + k * 0.115, y, roof_z + 0.15), (0.05, 0.016, 0.20), M["grille"])
            for k in range(7):
                fb.box((gx + bank - 0.343 + k * 0.115, y + s * 0.006, roof_z + 0.15), (0.03, 0.02, 0.24), M["silver"])
        # bottom skirt line and mounts
        mb.box((x, y, roof_z + 0.02), (length - 0.1, 0.02, 0.02), M["dkgrey"])
        for mx in (-hl + 0.25, hl - 0.25):
            mb.box((x + mx, s * 0.92, roof_z - 0.01), (0.20, 0.10, 0.04), M["dkgrey"])
    # top seams across the cover, inspection plate
    for k in range(3):
        mb.box((x - hl + (k + 1) * length / 4, 0, roof_z + 0.355), (0.02, 1.70, 0.012), M["grille"])
    mb.box((gx, 0, roof_z + 0.358), (0.5, 0.6, 0.008), M["silver"])
    # fan openings with grille bars
    for dx in (-0.55, 0.55):
        mb.cyl((gx + dx, 0, roof_z + 0.355), (0, 0, 1), 0.30, 0.02, M["grille"], seg=28)
        lathe(fb, (gx + dx, 0, roof_z + 0.36), (0, 0, 1), [(0.0, 0.29), (0.0, 0.31), (0.012, 0.31), (0.012, 0.29)], M["silver"], seg=28)
        for k in range(8):
            a = k * math.pi / 8
            fb.beam((gx + dx - 0.29 * math.cos(a), -0.29 * math.sin(a), roof_z + 0.368), (gx + dx + 0.29 * math.cos(a), 0.29 * math.sin(a), roof_z + 0.368), 0.012, 0.01, M["silver"])
        fb.cyl((gx + dx, 0, roof_z + 0.372), (0, 0, 1), 0.06, 0.012, M["silver"], seg=12)


def roof_ac_box(mb, fb, M, x, roof_z, length, width, height, fans, mat):
    """AU75-type unit (211 / 115): big ribbed box with round fan grilles"""
    from lib import prism
    hl = length / 2
    outline = [(-hl, 0.0), (hl, 0.0), (hl - 0.06, height), (-hl + 0.06, height)]
    prism(mb, outline, lambda u, v, d: (x + u, d, roof_z - 0.02 + v), -width, width, mat)
    for s in (-1, 1):
        n = int(length / 0.16)
        for k in range(n):
            fb.box((x - hl + 0.12 + k * 0.16, s * (width + 0.006), roof_z + height * 0.45), (0.035, 0.014, height * 0.62), M["grille"])
    for k in range(fans):
        fx = x - hl + (k + 0.5) * length / fans
        mb.cyl((fx, 0, roof_z + height - 0.01), (0, 0, 1), 0.30, 0.03, M["grille"], seg=24)
        for j in range(6):
            a = j * math.pi / 6
            fb.beam((fx - 0.29 * math.cos(a), -0.29 * math.sin(a), roof_z + height + 0.012), (fx + 0.29 * math.cos(a), 0.29 * math.sin(a), roof_z + height + 0.012), 0.012, 0.01, M["silver"])


# ---------------------------------------------------------------------------
# car ends: air hoses, cocks, jumpers, drawbar
# ---------------------------------------------------------------------------
def end_fittings(mb, fb, M, x, sgn):
    for y in (-0.42, 0.42):
        # brake pipe / main reservoir pipe hoses hanging in a loop, with their cocks
        p = [(x + sgn * 0.02, y, 0.98), (x + sgn * 0.10, y, 0.90), (x + sgn * 0.16, y * 0.9, 0.80), (x + sgn * 0.12, y * 0.8, 0.70)]
        pipe(fb, p, 0.022, M["black"], seg=8)
        fb.cyl((x + sgn * 0.03, y, 1.00), (1, 0, 0), 0.03, 0.08, M["chrome"], seg=8)
        fb.box((x + sgn * 0.05, y + 0.05, 1.02), (0.02, 0.10, 0.02), M["red"])
    for y in (-0.80, 0.80):
        # jumper cable between the cars
        pipe(fb, [(x + sgn * 0.01, y, 1.30), (x + sgn * 0.12, y, 1.18), (x + sgn * 0.24, y, 1.22)], 0.03, M["black"], seg=8)
        mb.box((x + sgn * 0.02, y, 1.32), (0.05, 0.12, 0.10), M["dkgrey"])
    mb.box((x + sgn * 0.02, 0, 1.02), (0.05, 2.40, 0.08), M["dkgrey"])          # end beam


# ---------------------------------------------------------------------------
# lamp units on the cab face
# ---------------------------------------------------------------------------
def lamp_unit(mb, fb, M, c, r, lens, axis=(1, 0, 0), bezel=0.016):
    """round lamp: dark bezel ring, chrome reflector cone, domed lens"""
    c = Vector(c)
    a = Vector(axis).normalized()
    lathe(mb, c, a, [(-0.04, r + bezel), (0.0, r + bezel), (0.004, r + bezel * 0.4), (0.004, r)], M["black"], seg=28)
    lathe(mb, c - a * 0.035, a, [(0.0, r * 0.25), (0.02, r * 0.6), (0.035, r * 0.95)], M["chrome"], seg=28)
    lathe(mb, c, a, [(0.0, r * 0.98), (0.004, r * 0.8), (0.006, r * 0.5), (0.007, 0.0)], lens, seg=28)


# ---------------------------------------------------------------------------
# cab space behind the windscreen (seen from outside through the glass)
# ---------------------------------------------------------------------------
def cab_space(mb, M, S, x0, xf):
    """floor, walls, ceiling, back partition with door, driver's desk with instruments, seats"""
    w = S.width(2.2) - 0.07
    zf, zc = 1.17, 3.36
    mb.box(((x0 + xf) / 2, 0, zf - 0.02), (xf - x0, 2 * w, 0.04), M["cabsp_floor"])          # floor
    mb.box(((x0 + xf) / 2, 0, zc + 0.02), (xf - x0, 2 * w, 0.04), M["int_ceiling"])         # ceiling
    for s in (-1, 1):
        mb.box(((x0 + xf) / 2, s * w, (zf + zc) / 2), (xf - x0, 0.03, zc - zf), M["cabsp_wall"])
    # back partition: wall, door to the saloon, window beside it
    # (the partition has openings: the door window and the side window look into the saloon)
    for (ya, yb, za, zb_) in ((-w, -0.70, zf, zc), (-0.70, 0.30, zf, 2.30), (-0.70, 0.30, 2.80, zc), (0.30, 0.36, zf, zc),
                              (0.36, 0.90, zf, 2.30), (0.36, 0.90, 2.80, zc), (0.90, w, zf, zc), (-0.70, -0.62, 2.30, 2.80), (0.22, 0.30, 2.30, 2.80)):
        mb.box((x0, (ya + yb) / 2, (za + zb_) / 2), (0.05, yb - ya, zb_ - za), M["cabsp_wall"])
    mb.box((x0 + 0.03, -0.20, 1.74), (0.01, 0.98, 1.14), M["cab_panel"])           # lower door leaf
    for (ya, yb) in ((-0.62, 0.22), (0.36, 0.90)):
        mb.box((x0, (ya + yb) / 2, 2.55), (0.012, yb - ya, 0.50), M["sglass"])
    # driver's desk across the front: body, sloping instrument panel, top
    dx = xf - 0.42
    mb.box((dx, 0, zf + 0.38), (0.55, 2 * w - 0.08, 0.76), M["cab_desk"])
    pts = [(dx - 0.27, -w + 0.06, zf + 0.76), (dx - 0.27, w - 0.06, zf + 0.76), (dx + 0.20, w - 0.06, zf + 0.98), (dx + 0.20, -w + 0.06, zf + 0.98)]
    mb.poly(pts, M["cab_panel"], (-0.4, 0, 1))
    mb.box((dx + 0.30, 0, zf + 0.99), (0.22, 2 * w - 0.08, 0.04), M["cab_desk"])
    # instruments on the driver's side (left, +y): two round gauges and the screens
    for k, yy in enumerate((0.95, 0.72)):
        mb.cyl((dx - 0.02, yy, zf + 0.88), (-0.42, 0, 0.9), 0.07, 0.02, M["gauge_face"], seg=16)
    for yy in (0.40, 0.05, -0.30):
        mb.poly([(dx - 0.10, yy - 0.15, zf + 0.84), (dx - 0.10, yy + 0.15, zf + 0.84), (dx + 0.06, yy + 0.15, zf + 0.91), (dx + 0.06, yy - 0.15, zf + 0.91)], M["lcd"], (-0.4, 0, 1))
    # one-handle master controller
    mb.box((dx - 0.20, 0.62, zf + 0.84), (0.12, 0.06, 0.08), M["handle"])
    mb.cyl((dx - 0.24, 0.62, zf + 0.92), (0, 1, 0), 0.02, 0.18, M["handle"], seg=8)
    # driver's seat and a folding seat on the other side
    for (yy, big) in ((0.62, True), (-0.70, False)):
        sx = dx - 0.85
        mb.cyl((sx, yy, zf + 0.25), (0, 0, 1), 0.04, 0.50, M["grey"], seg=8)
        mb.box((sx, yy, zf + 0.52), (0.45 if big else 0.36, 0.45 if big else 0.36, 0.09), M["seat_green"])
        mb.box((sx - 0.24, yy, zf + 0.85), (0.08, 0.44 if big else 0.34, 0.60 if big else 0.42), M["seat_green"])
    # sun visor, cab lamp
    mb.box((xf - 0.10, 0.45, zc - 0.25), (0.02, 0.70, 0.30), M["cab_panel"])
    mb.box((x0 + 0.8, 0, zc - 0.01), (0.40, 0.20, 0.02), M["int_light"])


# ---------------------------------------------------------------------------
# saloon seats: shaped cushions and backrests
# ---------------------------------------------------------------------------
def cushion(mb, m, x, w, y_back, s, depth, z0, t):
    """one bucket cushion: rounded front edge, slightly dished top; s = +1 / -1 side (front faces -s)"""
    from lib import prism
    d = depth
    outline = [(0.0, 0.0), (d - 0.05, 0.0), (d - 0.015, 0.012), (d, 0.04), (d - 0.004, t - 0.03), (d - 0.025, t - 0.006),
               (d - 0.07, t), (d * 0.55, t - 0.012), (0.10, t - 0.004), (0.03, t - 0.002), (0.0, t - 0.02)]
    hw = w / 2
    prism(mb, outline, lambda u, v, dd: (x + dd, y_back - s * u, z0 + v), -hw, hw, m)


def backrest(mb, m, x, w, y, s, z0, h, lean=10.0, t=0.08):
    """backrest leaning back by `lean` degrees, rounded top roll and a lumbar bulge"""
    from lib import prism
    outline = [(0.0, 0.0), (t, 0.0), (t + 0.015, h * 0.25), (t + 0.01, h * 0.55), (t, h - 0.05), (t * 0.75, h - 0.01), (t * 0.35, h), (0.0, h - 0.03)]
    a = math.radians(lean)
    ca, sa = math.cos(a), math.sin(a)

    def at(u, v, dd):
        # u: thickness toward the aisle (-s), v: up the backrest, leaning back toward the wall (+s)
        return (x + dd, y - s * u * ca + s * v * sa, z0 + v * ca)
    prism(mb, outline, at, -w / 2, w / 2, m)


def door_header(mb, M, S, x0, x1, z, s):
    """drip strip over a door"""
    y = s * (S.width(z) + 0.008)
    mb.box(((x0 + x1) / 2, y, z), (x1 - x0 + 0.10, 0.018, 0.022), M["silver"])


def grab_bar(mb, M, x, y, z0, z1, s):
    """hand rail beside a crew door: a bar on two stand-offs"""
    pipe(mb, [(x, y, z0), (x, y + s * 0.06, z0 + 0.03), (x, y + s * 0.06, z1 - 0.03), (x, y, z1)], 0.014, M["chrome"], seg=8)


def bellows(mb, M, x, sgn, top, n=9):
    """gangway bellows: folds of a rounded rectangle, alternating size, with an end frame"""
    from lib import rounded_rect
    for k in range(n):
        xx = x + sgn * (0.02 + k * 0.03)
        grow = 0.03 if k % 2 else 0.0
        out = rounded_rect(0.0, (1.10 + top) / 2, 1.30 + 2 * grow, top - 1.10 + 2 * grow, 0.10, n=3)
        inn = rounded_rect(0.0, (1.10 + top) / 2, 1.06, top - 1.10 - 0.20, 0.06, n=3)
        ring_o = [Vector((xx, y, z)) for (y, z) in out]
        ring_i = [Vector((xx, y, z)) for (y, z) in inn]
        nn = len(ring_o)
        for j in range(nn):
            j2 = (j + 1) % nn
            for dx in (-0.012, 0.012):
                pass
            mb.poly([ring_o[j] + Vector((-0.012, 0, 0)), ring_o[j2] + Vector((-0.012, 0, 0)), ring_o[j2] + Vector((0.012, 0, 0)), ring_o[j] + Vector((0.012, 0, 0))], M["rubber"], (ring_o[j] + ring_o[j2]) / 2 - Vector((xx, 0, (1.10 + top) / 2)))
    xf = x + sgn * (0.02 + n * 0.03)
    from lib import rounded_rect as rr
    fr = rr(0.0, (1.10 + top) / 2, 1.30, top - 1.10, 0.10, n=3)
    fi = rr(0.0, (1.10 + top) / 2, 1.00, top - 1.10 - 0.24, 0.05, n=3)
    for j in range(len(fr)):
        j2 = (j + 1) % len(fr)
        mb.poly([(xf, fr[j][0], fr[j][1]), (xf, fr[j2][0], fr[j2][1]), (xf, fi[j2][0] if j2 < len(fi) else fi[-1][0], fi[j2][1] if j2 < len(fi) else fi[-1][1]), (xf, fi[j][0] if j < len(fi) else fi[-1][0], fi[j][1] if j < len(fi) else fi[-1][1])], M["dkgrey"], (sgn, 0, 0))
