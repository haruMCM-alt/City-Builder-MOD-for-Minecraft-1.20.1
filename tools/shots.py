#!/usr/bin/env python3
"""Writes a ShotDirector script that builds every structure on a flat world and photographs it.

Usage: python3 tools/shots.py [filter...] > run/shots.txt
       ./gradlew runShots -Pshots=shots.txt   (screenshots land in run/screenshots/)
Filters limit the run to names containing any of the given words.
"""
import math
import sys

Y = -60  # surface of the default flat world (air layer above the grass)

BASE = [("house", 12), ("farm", 16), ("warehouse", 16), ("tower", 9), ("shrine", 16), ("cafe", 12),
        ("mansion", 18), ("dojo", 14), ("konbini", 14), ("hotspring", 16), ("temple", 16), ("zakkyo", 14),
        ("sento", 16), ("shibuya109", 20), ("department", 20), ("park", 20), ("koban", 8), ("school", 22)]
HEIGHT = {"tower": 26, "zakkyo": 36, "shibuya109": 40, "department": 32, "school": 18, "mansion": 16,
          "temple": 18, "shrine": 14, "warehouse": 10, "sento": 14, "hotspring": 8, "farm": 4, "park": 6, "koban": 8}
SKY = [("modern", 20, 20, 25, 5), ("twin", 30, 16, 20, 4), ("pyramid", 20, 20, 20, 4),
       ("residential", 20, 16, 15, 4), ("hotel", 20, 20, 15, 4), ("google", 24, 24, 15, 5)]


def cam(x1, z1, x2, z2, h, yaw=-35.0, pitch=24.0):
    """Camera that fits the whole bounding box in a 50 degree view, looking down at its centre."""
    cx, cz, cy = (x1 + x2) / 2, (z1 + z2) / 2, Y + h / 2
    r = 0.5 * math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2 + h ** 2)
    d = r / math.tan(math.radians(22)) + 2
    yr, pr = math.radians(yaw), math.radians(pitch)
    lx, lz = -math.sin(yr) * math.cos(pr), math.cos(yr) * math.cos(pr)
    px, pz, py = cx - lx * d, cz - lz * d, cy + math.sin(pr) * d
    return f"cam {px:.1f} {py:.1f} {pz:.1f} {yaw:.1f} {pitch:.1f}"


def main(filters):
    want = lambda n: not filters or any(f in n for f in filters)
    out = ["cmd time set 6000", "cmd gamerule doDaylightCycle false", "cmd gamerule doWeatherCycle false",
           "cmd weather clear", "cmd gamerule doMobSpawning false", "cmd kill @e[type=!player]"]
    shots = []
    x = 0
    for name, size in BASE:
        if want(name):
            out.append(f"cmd base {name} {x} {Y} 0 {size}")
            shots.append((f"base_{name}", x, 0, x + size, size, HEIGHT.get(name, 12)))
        x += 70
    x = 0
    for name, w, d, f, fh in SKY:
        if want(name):
            out.append(f"cmd skyscraper {name} {x} {Y} 300 {w} {d} {f} {fh}")
            shots.append((f"sky_{name}", x, 300, x + w, 300 + d, f * fh + 12))
        x += 110
    out.append("waitbuild")
    out.append("cmd execute as @e[type=item,limit=20] run say dropped item here")
    for name, x1, z1, x2, z2, h in shots:
        out.append(cam(x1, z1, x2, z2, h))
        out.append(f"shot {name}")
        out.append(cam(x1, z1, x2, z2, h, yaw=145.0))
        out.append(f"shot {name}_back")
    out.append("quit")
    print("\n".join(out))


if __name__ == "__main__":
    main(sys.argv[1:])
