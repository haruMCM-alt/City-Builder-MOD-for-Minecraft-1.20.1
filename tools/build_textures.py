#!/usr/bin/env python3
"""Generates the mod's 16x16 textures (vehicles, elevator, traffic light).

Only the standard library is used, so it runs anywhere:  python3 tools/build_textures.py
The smartphone and laser textures are hand-made and are left untouched.
"""
import os
import struct
import zlib

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "main", "resources", "assets", "citybuilder", "textures")


def png(path, pixels):
    """pixels: 16 rows of 16 (r, g, b, a) tuples."""
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in pixels)

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    data = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 16, 16, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


def hexc(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3],)


CLEAR = (0, 0, 0, 0)


def canvas(fill=CLEAR):
    return [[fill for _ in range(16)] for _ in range(16)]


def rect(img, x1, y1, x2, y2, c):
    for y in range(y1, y2 + 1):
        for x in range(x1, x2 + 1):
            if 0 <= x < 16 and 0 <= y < 16:
                img[y][x] = c


def outline(img, color):
    """Adds a dark outline around every opaque pixel, like vanilla item sprites."""
    out = [row[:] for row in img]
    for y in range(16):
        for x in range(16):
            if img[y][x][3] == 0:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < 16 and 0 <= ny < 16 and img[ny][nx][3] and img[ny][nx] != color:
                        out[y][x] = color
                        break
    return out


def wheel(img, cx, cy):
    rect(img, cx - 1, cy - 1, cx + 1, cy + 1, hexc("1b1b1b"))
    img[cy][cx] = hexc("9a9a9a")


GLASS = hexc("9fd8ff")
DARK = hexc("101010")


def car(body, roof_sign=False):
    img = canvas()
    rect(img, 1, 8, 14, 11, body)
    rect(img, 1, 11, 14, 11, shade(body, 0.7))
    rect(img, 4, 5, 11, 7, body)
    rect(img, 5, 5, 7, 7, GLASS)
    rect(img, 9, 5, 10, 7, GLASS)
    img[9][14] = hexc("ffe680")
    img[9][1] = hexc("ff4040")
    if roof_sign:
        rect(img, 6, 3, 9, 4, hexc("ffffff"))
        img[3][7] = hexc("222222")
        img[3][8] = hexc("222222")
    wheel(img, 4, 12)
    wheel(img, 11, 12)
    return outline(img, DARK)


def sports(body):
    img = canvas()
    rect(img, 1, 9, 14, 11, body)
    rect(img, 1, 11, 14, 11, shade(body, 0.7))
    rect(img, 5, 7, 10, 8, body)
    rect(img, 6, 7, 9, 8, GLASS)
    rect(img, 1, 7, 2, 8, shade(body, 0.8))
    img[10][14] = hexc("ffe680")
    wheel(img, 4, 12)
    wheel(img, 11, 12)
    return outline(img, DARK)


def truck():
    img = canvas()
    rect(img, 1, 3, 9, 10, hexc("e8e8e8"))
    rect(img, 1, 10, 9, 10, hexc("b8b8b8"))
    rect(img, 2, 5, 8, 5, hexc("3b6cd9"))
    rect(img, 10, 6, 14, 10, hexc("3b6cd9"))
    rect(img, 12, 6, 14, 8, GLASS)
    rect(img, 1, 11, 14, 11, hexc("4a4a4a"))
    wheel(img, 4, 12)
    wheel(img, 12, 12)
    return outline(img, DARK)


def bus():
    img = canvas()
    rect(img, 1, 3, 14, 11, hexc("f2f2f2"))
    rect(img, 1, 9, 14, 11, hexc("1e9e5a"))
    for x in (2, 5, 8, 11):
        rect(img, x, 5, x + 1, 7, GLASS)
    rect(img, 13, 4, 14, 8, GLASS)
    img[10][14] = hexc("ffe680")
    rect(img, 1, 3, 14, 3, hexc("1e9e5a"))
    wheel(img, 4, 12)
    wheel(img, 11, 12)
    return outline(img, DARK)


def elevator_top():
    steel = hexc("a9b0b8")
    img = canvas(steel)
    for i in range(16):
        img[0][i] = img[15][i] = img[i][0] = img[i][15] = hexc("5b6168")
        img[1][i] = img[14][i] = img[i][1] = img[i][14] = hexc("c9d0d8")
    for y in range(2, 14):
        for x in range(2, 14):
            if (x + y) % 4 == 0:
                img[y][x] = hexc("9aa1a9")
    up = hexc("2fd36b")
    down = hexc("ff8a3d")
    for i, w in enumerate((0, 1, 2)):
        rect(img, 7 - w, 3 + i, 8 + w, 3 + i, up)
    rect(img, 7, 6, 8, 7, up)
    rect(img, 7, 8, 8, 9, down)
    for i, w in enumerate((2, 1, 0)):
        rect(img, 7 - w, 10 + i, 8 + w, 10 + i, down)
    return img


def elevator_side():
    img = canvas(hexc("8d949c"))
    for y in range(16):
        for x in range(16):
            if x % 3 == 0:
                img[y][x] = hexc("7f868e")
    rect(img, 0, 0, 15, 1, hexc("5b6168"))
    rect(img, 0, 14, 15, 15, hexc("5b6168"))
    rect(img, 2, 6, 13, 7, hexc("bff4ff"))
    return img


def light_housing():
    img = canvas(hexc("2a2d30"))
    rect(img, 0, 0, 15, 0, hexc("3c4044"))
    rect(img, 0, 15, 15, 15, hexc("1c1e20"))
    return img


def light_front(lit):
    img = light_housing()
    rect(img, 0, 4, 15, 12, hexc("1a1c1e"))
    colors = {
        "green": (hexc("19d1a3"), hexc("0b3a30")),
        "yellow": (hexc("ffc61a"), hexc("3d3208")),
        "red": (hexc("ff3030"), hexc("3d0d0d")),
    }
    for i, name in enumerate(("green", "yellow", "red")):
        on, off = colors[name]
        c = on if name == lit else off
        cx = 2 + i * 5
        rect(img, cx, 6, cx + 2, 10, c)
        rect(img, cx - 1, 7, cx + 3, 9, c)
        if name == lit:
            img[7][cx] = shade(on, 1.3)
        # visor
        rect(img, cx - 1, 5, cx + 3, 5, hexc("0e0f10"))
    return img


def main():
    item = os.path.join(ROOT, "item")
    block = os.path.join(ROOT, "block")
    png(os.path.join(item, "car.png"), car(hexc("3b6cd9")))
    png(os.path.join(item, "taxi.png"), car(hexc("ffd200"), roof_sign=True))
    png(os.path.join(item, "sports_car.png"), sports(hexc("d9252c")))
    png(os.path.join(item, "truck.png"), truck())
    png(os.path.join(item, "bus.png"), bus())
    png(os.path.join(block, "elevator_top.png"), elevator_top())
    png(os.path.join(block, "elevator_side.png"), elevator_side())
    png(os.path.join(block, "traffic_light_side.png"), light_housing())
    for lit in ("green", "yellow", "red"):
        png(os.path.join(block, "traffic_light_" + lit + ".png"), light_front(lit))
    print("textures written to", os.path.normpath(ROOT))


if __name__ == "__main__":
    main()
