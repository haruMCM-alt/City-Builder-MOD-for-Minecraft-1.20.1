"""
Ground layout for "all runways in use" (Blender frame of each airport: x along the main runway,
y towards the terminal, metres).

For every airport this module defines
  * runways    the runways the extra traffic uses, with their connectors to the taxiways
  * lines      the taxiway network as polylines (junctions are shared vertices), no taxiway
               crosses a runway: the links between runways go round the runway ends
  * stands     the extra contact stands (nose-in, jet bridge) and the taxilane point in front
  * aprons     apron pavement rectangles
  * terminal   the big terminal buildings the stands belong to (built by the airport builders)

build_world.py / build_airport2.py draw it (pavement, markings, lights, terminals) and export
it into world.json / airportN.json as "ops"; web/js/ops.js flies the traffic on it.
The home airport's main runway (C, 34R/16L) and the remote airports' main-runway shuttles keep
their own traffic (traffic.js); the extra traffic uses the other runways and joins the main
runway at the remote airports for departures.
"""
import math

import geo as G

CG_FROM_NOSE = 31.85        # 787-9 nose -> CG on the stand (the simulator shifts per type)
NOSE_GAP = 8.0              # terminal face -> nose


def _rw(apid, er):
    ang = math.radians(90.0 + G.AP[apid]["north"] - er["hdg"])
    return dict(names=list(er["names"]), c=[er["cx"], er["cy"]], ang=ang, len=er["len"], wid=er["wid"])


def _P(r, s, t=0.0):
    ca, sa = math.cos(r["ang"]), math.sin(r["ang"])
    return [round(r["c"][0] + s * ca - t * sa, 1), round(r["c"][1] + s * sa + t * ca, 1)]


def _stand_row(prefix, first, xs, face_y, face, lane_y, group):
    """nose-in stands along a terminal face at y = face_y; face = +1: nose towards +y"""
    out = []
    nose = face_y - face * NOSE_GAP
    for k, x in enumerate(xs):
        out.append(dict(id=f"{prefix}{first + k}", x=round(x, 1), y=round(nose - face * CG_FROM_NOSE, 1), nose=round(nose, 1),
                        face=face, lane=[round(x, 1), lane_y], group=group))
    return out


def _lane(y, x0, x1, stands, extra=()):
    xs = sorted(set([x0, x1] + [s["x"] for s in stands] + list(extra)))
    return [[x, y] for x in xs]


def _way(pts, oneway=True):
    """a taxiway polyline; oneway: traffic flows in the order of the points"""
    return dict(pts=[[round(p[0], 1), round(p[1], 1)] for p in pts], oneway=oneway)


def layout(apid):
    """Taxiways are one-way where the traffic streams would meet head-on (arrivals and
    departures each have their own route), like the flow rules of a real airport."""
    L = dict(runways=[], lines=[], stands=[], aprons=[], terminals=[])
    if apid == 1:
        # ---- Haneda: runway A (34L/16R) and D (05/23) arrivals, B (04/22) departures; the new
        # terminal (T2-style, 26 stands) faces runway A; C (34R/16L) keeps traffic.js
        #   A arrivals -> A's parallel taxiway (always eastbound) -> into the apron at x 0 / 1500
        #   D arrivals -> D's taxiway to its north end -> round the west end of C -> north on the
        #                 inbound link (x -1500) -> A's taxiway eastbound -> apron
        #   departures -> apron taxilane westbound -> outbound link (x -1580) -> B's taxiway
        A, B, D = [_rw(1, er) for er in G.EXTRA_RWYS[1]]
        A.update(id="A", use="arr"); B.update(id="B", use="dep"); D.update(id="D", use="arr")
        ay = A["c"][1] - 170.0
        A["conns"] = []
        xs_a = {-1500.0, 0.0, 1500.0}
        for s in (-1480.0, -800.0, -150.0, 500.0, 1000.0, 1480.0):
            p = _P(A, s)
            A["conns"].append(dict(s=s, rwy=p, twy=[p[0], ay]))
            xs_a.add(p[0])
        L["lines"].append(_way([[x, ay] for x in sorted(xs_a)]))                 # eastbound
        face_y, lane_y = 1250.0, 1430.0
        xs = [-1050.0 + 84.0 * k for k in range(26)]
        st = _stand_row("", 51, xs, face_y, -1, lane_y, "T2")
        L["stands"] += st
        lane = _lane(lane_y, -1580.0, 1500.0, st, (0.0,))
        L["lines"].append(_way(lane[::-1]))                                        # westbound
        L["lines"].append(_way([[0.0, ay], [0.0, lane_y]]))
        L["lines"].append(_way([[1500.0, ay], [1500.0, lane_y]]))
        L["aprons"].append([-1200.0, 1200.0, face_y, 1470.0])
        L["terminals"].append(dict(kind="hnd_t2", x0=-1150.0, x1=1150.0, y0=1120.0, y1=face_y, face=-1))
        # runway B: parallel taxiway on its east side (departures only)
        B["conns"] = [dict(s=s, rwy=_P(B, s), twy=_P(B, s, 180.0)) for s in (-1230.0, -600.0, 0.0, 600.0, 1230.0)]
        b_tw = [_P(B, s, 180.0) for s in (-1250.0, -1230.0, -600.0, 0.0, 600.0, 1230.0, 1250.0)]
        L["lines"].append(_way(b_tw, oneway=False))
        J1 = b_tw[-1]
        L["lines"].append(_way([[-1580.0, lane_y], [-1580.0, 500.0], J1]))       # outbound link
        # runway D on its island: taxiway towards its north end, then the inbound link
        D["conns"] = [dict(s=s, rwy=_P(D, s), twy=_P(D, s, 180.0)) for s in (-1230.0, -600.0, 0.0, 600.0, 1230.0)]
        d_tw = [_P(D, s, 180.0) for s in (1250.0, 1230.0, 600.0, 0.0, -600.0, -1230.0, -1250.0)]
        L["lines"].append(_way(d_tw))
        L["lines"].append(_way([d_tw[-1], [-1900.0, -800.0], [-1900.0, 250.0], [-1500.0, 250.0], [-1500.0, ay]]))
        L["runways"] = [A, B, D]
        return L
    # ---- remote airports: the second runway (arrivals, departures), the main runway (departures,
    # shared with the shuttles), the extended main pier and at Kansai a second terminal.  All
    # landings are towards +sx (the shuttles' runway direction, traffic.js rwSide):
    #   R2 arrivals -> R2's taxiway downstream -> downstream end-around link north -> main taxiway
    #   upstream -> into the apron at the downstream end -> taxilane upstream -> out at the
    #   upstream end -> main taxiway -> the main runway's take-off end, or the upstream end-around
    #   link south -> R2's take-off end
    ap = G.AP[apid]
    sx = 1.0 if ap["x"] >= 0 else -1.0
    M = dict(id="M", names=[ap["rwy"]["k09"], ap["rwy"]["k27"]], c=[0.0, 0.0], ang=0.0, len=float(ap["rwy"]["len"]),
             wid=float(ap["rwy"]["wid"]), use="dep", main=True)
    h = M["len"] / 2
    M["conns"] = [dict(s=s, rwy=[s, 0.0], twy=[s, 170.0]) for s in (-(h - 20), 0.0, h - 20)]
    R2 = _rw(apid, G.EXTRA_RWYS[apid][0])
    R2.update(id="R2", use="both")
    y2 = R2["c"][1]
    ty = y2 + 170.0
    h2 = R2["len"] / 2
    out_x = {2: 2150.0, 3: 1800.0, 4: 1750.0}[apid]      # end-around links, clear of both runway ends
    R2["conns"] = []
    for s in (-(h2 - 20), -h2 / 2, 0.0, h2 / 2, h2 - 20):
        p = _P(R2, s)
        R2["conns"].append(dict(s=s, rwy=p, twy=[p[0], ty]))
    pier_x = {2: 880.0, 3: 1210.0, 4: 1210.0}[apid]
    up = lambda xs: sorted(xs, key=lambda x: x * sx)          # in the landing direction
    xs2 = {c["twy"][0] for c in R2["conns"]} | {-out_x, out_x}
    t2 = None
    if apid == 2:
        t2 = dict(face_y=-1850.0, lane_y=-2020.0, links=(-1150.0, 0.0, 1150.0))
        xs2 |= set(t2["links"]) | {-sx * 2040.0}
    L["lines"].append(_way([[x, ty] for x in up(xs2)]))                                  # R2 taxiway, downstream
    xs1 = {c["twy"][0] for c in M["conns"]} | {-out_x, out_x, -420.0, 420.0, -pier_x, pier_x}
    L["lines"].append(_way([[x, 170.0] for x in up(xs1)[::-1]]))                         # main taxiway, upstream
    L["lines"].append(_way([[sx * out_x, ty], [sx * out_x, 170.0]]))                     # downstream end-around, north
    L["lines"].append(_way([[-sx * out_x, 170.0], [-sx * out_x, ty]]))                   # upstream end-around, south
    gl = {2: "B", 3: "C", 4: "D"}[apid]
    xs = ([-pier_x + 40.0 + 100.0 * k for k in range(int((pier_x - 500.0) // 100.0))])
    xs = xs + [-x for x in reversed(xs)]
    st = _stand_row(gl, 11, xs, 410.0, +1, 240.0, "pier")
    L["stands"] += st
    lane = _lane(240.0, -pier_x, pier_x, st, (-420.0, 420.0))
    L["lines"].append(_way(lane if sx < 0 else lane[::-1]))                              # taxilane, upstream
    for x in (pier_x, 420.0):
        L["lines"].append(_way([[sx * x, 170.0], [sx * x, 240.0]]))                     # into the apron
        L["lines"].append(_way([[-sx * x, 240.0], [-sx * x, 170.0]]))                   # out of it
    L["aprons"] += [[-pier_x - 30.0, -450.0, 190.0, 410.0], [450.0, pier_x + 30.0, 190.0, 410.0]]
    L["terminals"].append(dict(kind="pier_ext", x0=-pier_x, x1=pier_x, y0=410.0, y1=446.0, face=+1))
    if t2:
        # Kansai terminal 2 on island 2: in from R2's taxiway at the downstream end, taxilane
        # upstream, out at the middle / upstream end
        xs2t = [-1035.0 + 90.0 * k for k in range(24)]
        st2 = _stand_row("E", 1, xs2t, t2["face_y"], +1, t2["lane_y"], "T2")
        L["stands"] += st2
        lane2 = _lane(t2["lane_y"], -1150.0, 1150.0, st2, (0.0,))
        L["lines"].append(_way(lane2 if sx < 0 else lane2[::-1]))
        L["lines"].append(_way([[sx * 1150.0, ty], [sx * 1150.0, t2["lane_y"]]]))
        L["lines"].append(_way([[0.0, t2["lane_y"]], [0.0, ty]]))
        # departures for runway B leave the taxilane upstream and join its taxiway just before
        # the take-off end
        L["lines"].append(_way([[-sx * 1150.0, t2["lane_y"]], [-sx * 2040.0, t2["lane_y"]], [-sx * 2040.0, ty]]))
        L["aprons"].append([-1180.0, 1180.0, ty + 30.0, t2["face_y"]])
        L["terminals"].append(dict(kind="kix_t2", x0=-1120.0, x1=1120.0, y0=t2["face_y"], y1=t2["face_y"] + 95.0, face=+1))
    L["runways"] = [M, R2]
    return L


# ---------------------------------------------------------------------------------------------
def _seg_rect_hit(p, q, r, margin):
    """does segment p-q cross the runway r (rectangle incl. blast pads + margin)?"""
    ca, sa = math.cos(r["ang"]), math.sin(r["ang"])
    def loc(pt):
        dx, dy = pt[0] - r["c"][0], pt[1] - r["c"][1]
        return dx * ca + dy * sa, -dx * sa + dy * ca
    (s0, t0), (s1, t1) = loc(p), loc(q)
    hl, hw = r["len"] / 2 + 120 + margin, r["wid"] / 2 + margin
    for k in range(101):
        f = k / 100
        s, t = s0 + (s1 - s0) * f, t0 + (t1 - t0) * f
        if abs(s) < hl and abs(t) < hw:
            return True
    return False


def check(apid):
    """runways never cross each other; no taxiway line crosses a runway (connectors excepted)"""
    L = layout(apid)
    rws = list(L["runways"])
    if apid == 1:
        a = G.AP[1]
        rws.append(dict(c=[0.0, 0.0], ang=0.0, len=float(a["rwy"]["len"]), wid=60.0, id="C"))
    bad = []
    for i, r in enumerate(rws):
        for r2 in rws[i + 1:]:
            p, q = _P(r2, -r2["len"] / 2), _P(r2, r2["len"] / 2)
            if _seg_rect_hit(p, q, r, 0.0):
                bad.append(("runway", r["id"], r2["id"]))
    for line in L["lines"]:
        pts = line["pts"]
        for p, q in zip(pts[:-1], pts[1:]):
            for r in rws:
                if _seg_rect_hit(p, q, r, 10.0):
                    bad.append(("taxiway", r["id"], p, q))
    return bad


if __name__ == "__main__":
    for i in (1, 2, 3, 4):
        L = layout(i)
        print(i, "runways", [r["id"] for r in L["runways"]], "stands", len(L["stands"]), "lines", len(L["lines"]), "problems", check(i))
