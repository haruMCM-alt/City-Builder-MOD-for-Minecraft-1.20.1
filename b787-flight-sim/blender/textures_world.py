"""
Seamless tiling textures for the airport + city (numpy + Pillow).

All tiles are generated with periodic (FFT) noise so they repeat without seams.
Facade tiles come with matching night emissive maps (random lit windows).
"""
import os

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, "textures")
os.makedirs(TEX, exist_ok=True)
RNG = np.random.default_rng(20260923)


def srgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255.0


def pnoise(n, scale, rng=RNG):
    """Periodic gaussian-filtered noise, zero mean unit std."""
    w = rng.standard_normal((n, n))
    fx = np.fft.fftfreq(n)[:, None]
    fy = np.fft.fftfreq(n)[None, :]
    f = np.sqrt(fx * fx + fy * fy)
    filt = np.exp(-(f * scale) ** 2)
    out = np.real(np.fft.ifft2(np.fft.fft2(w) * filt))
    return (out - out.mean()) / (out.std() + 1e-9)


def save(arr, name, quality=90):
    img = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")
    path = os.path.join(TEX, name)
    if name.endswith(".png"):
        img.save(path, optimize=True)
    else:
        img.save(path, quality=quality)


def lerp(a, b, t):
    return a * (1 - t[..., None]) + b * t[..., None]


# ---------------------------------------------------------------------------
def asphalt(name="asphalt.jpg", base="#3b3d40", n=1024, light=0.0):
    c = srgb(base)
    grain = pnoise(n, 1.2) * 0.035 + pnoise(n, 6) * 0.03 + pnoise(n, 60) * 0.05
    speck = (RNG.random((n, n)) > 0.985) * 0.12
    patches = np.clip(pnoise(n, 140), -1.5, 1.5) * 0.04
    v = grain + speck + patches + light
    col = np.clip(c[None, None, :] * (1 + v[..., None] * 1.6), 0, 1)
    save(col, name)


def concrete(name="concrete.jpg", n=1024, joints=5):
    c = srgb("#a9a9a4")
    v = pnoise(n, 2) * 0.03 + pnoise(n, 30) * 0.04 + pnoise(n, 180) * 0.05
    col = c[None, None, :] * (1 + v[..., None])
    # expansion joints (tile = 25 m -> every 5 m)
    step = n // joints
    j = np.zeros((n, n), np.float32)
    for k in range(joints):
        j[:, k * step:k * step + 2] = 1
        j[k * step:k * step + 2, :] = 1
    col = lerp(col, srgb("#5f605c"), j * 0.8)
    # tyre marks / stains
    st = np.clip(pnoise(n, 90), 0, 3) * 0.08
    col = col * (1 - st[..., None])
    save(col, name)


def facade(name, n, floors, bays, wall, glass, frame_w, win_h, win_w, spandrel=None,
           balcony=False, mullion=None, glass_var=0.08, lit_p=0.35, warm=True, sills=True):
    """Generic facade tile: floors x bays windows. Returns base + emissive + orm."""
    H = W = n
    fy = H // floors
    bx = W // bays
    y = np.arange(H)[:, None] % fy / fy        # 0 top of floor .. 1
    x = np.arange(W)[None, :] % bx / bx
    fi = np.minimum(np.arange(H)[:, None] // fy, floors - 1)
    bi = np.minimum(np.arange(W)[None, :] // bx, bays - 1)
    col = np.empty((H, W, 3), np.float32)
    col[:] = srgb(wall)
    tex = pnoise(n, 3) * 0.03 + pnoise(n, 50) * 0.04
    col *= (1 + tex[..., None])
    win_y0 = (1 - win_h) * 0.55
    win = (y > win_y0) & (y < win_y0 + win_h) & (np.abs(x - 0.5) < win_w / 2)
    win = np.broadcast_to(win, (H, W))
    # per-window glass tone variation
    tone = RNG.random((floors, bays)) * glass_var
    g = srgb(glass)
    gy = (y - win_y0) / win_h
    grad = np.broadcast_to(0.85 + 0.3 * gy, (H, W))
    gcol = g[None, None, :] * (grad[..., None] + tone[fi, bi][..., None] * 3)
    col = np.where(win[..., None], gcol, col)
    rough = np.where(win, 0.08, 0.75).astype(np.float32)
    metal = np.where(win, 0.35, 0.0).astype(np.float32)
    if mullion is not None:
        m = (np.abs(x - 0.5) < 0.012) & win
        col = np.where(m[..., None], srgb(mullion), col)
    if spandrel is not None:
        sp = (y > win_y0 + win_h) | (y < win_y0)
        sp = np.broadcast_to(sp, (H, W))
        col = np.where(sp[..., None], srgb(spandrel) * (1 + tex[..., None]), col)
        rough = np.where(sp, 0.35, rough)
    if frame_w:
        fr = win & ((np.abs(y - win_y0) < frame_w) | (np.abs(y - win_y0 - win_h) < frame_w)
                    | (np.abs(np.abs(x - 0.5) - win_w / 2) < frame_w))
        col = np.where(fr[..., None], col * 0.55, col)
    if sills:
        sill = (np.abs(y - (win_y0 + win_h)) < 0.03) & (np.abs(x - 0.5) < win_w / 2 + 0.04)
        col = np.where(np.broadcast_to(sill, (H, W))[..., None], col * 1.25, col)
    if balcony:
        b = (y > 0.80) & (y < 0.86)
        col = np.where(np.broadcast_to(b, (H, W))[..., None], srgb("#e9e6e0"), col)
        bs = (y > 0.86) & (y < 0.92)
        col = np.where(np.broadcast_to(bs, (H, W))[..., None], col * 0.6, col)
    # emissive: random lit windows, warm or cool
    lit = RNG.random((floors, bays)) < lit_p
    ltone = RNG.random((floors, bays))
    em = np.zeros((H, W, 3), np.float32)
    wc = np.where(ltone[fi, bi][..., None] > 0.3, srgb("#ffd49a") if warm else srgb("#d8ecff"), srgb("#f4f7ff"))
    inten = (0.55 + 0.45 * RNG.random((floors, bays)))[fi, bi]
    em = np.where((win & lit[fi, bi])[..., None], wc * inten[..., None], 0)
    save(col, name + ".jpg")
    save(em, name + "_em.jpg", 85)
    orm = np.stack([np.ones_like(rough), rough, metal], -1)
    save(orm, name + "_orm.jpg", 88)


def road(name="road.jpg", n=1024):
    """Road tile: u along the road (20 m), v across (24 m wide incl. sidewalks)."""
    base = pnoise(n, 1.5) * 0.03 + pnoise(n, 40) * 0.04
    col = np.empty((n, n, 3), np.float32)
    col[:] = srgb("#3a3c3f")
    col *= (1 + base[..., None])
    v = (np.arange(n)[:, None] + 0.5) / n * 24.0       # metres across
    u = (np.arange(n)[None, :] + 0.5) / n * 20.0       # metres along
    walk = (v < 3.0) | (v > 21.0)
    col = np.where(np.broadcast_to(walk, (n, n))[..., None], srgb("#9a9993") * (1 + base[..., None]), col)
    curb = (np.abs(v - 3.0) < 0.12) | (np.abs(v - 21.0) < 0.12)
    col = np.where(np.broadcast_to(curb, (n, n))[..., None], srgb("#c9c7c0"), col)
    # sidewalk paving joints
    pj = walk & ((u % 1.5 < 0.04) | (v % 1.5 < 0.04))
    col = np.where(pj[..., None], col * 0.8, col)
    white = srgb("#e8e8e2")
    edge = (np.abs(v - 3.45) < 0.08) | (np.abs(v - 20.55) < 0.08)
    centre = (np.abs(v - 11.88) < 0.08) | (np.abs(v - 12.12) < 0.08)
    dash = ((np.abs(v - 7.5) < 0.07) | (np.abs(v - 16.5) < 0.07)) & (u % 10 < 5)
    m = np.broadcast_to(edge | dash, (n, n))
    col = np.where(m[..., None], white, col)
    col = np.where(np.broadcast_to(centre, (n, n))[..., None], srgb("#e8c547"), col)
    save(col, name)


def roof(name="roof.jpg", n=512):
    col = np.empty((n, n, 3), np.float32)
    col[:] = srgb("#6f716f")
    v = pnoise(n, 1.2) * 0.05 + pnoise(n, 20) * 0.06 + pnoise(n, 120) * 0.06
    col *= (1 + v[..., None])
    save(col, name)


def corrugated(name="metal_panel.jpg", n=512, color="#b9bec4"):
    x = np.arange(n)[None, :]
    rib = 0.5 + 0.5 * np.cos(x / n * 2 * np.pi * 32)
    col = np.empty((n, n, 3), np.float32)
    col[:] = srgb(color)
    col *= (0.82 + 0.18 * rib)[..., None]
    v = pnoise(n, 60) * 0.04
    col *= (1 + v[..., None])
    # horizontal panel seams
    y = np.arange(n)[:, None]
    seam = (y % (n // 2) < 2)
    col = np.where(np.broadcast_to(seam, (n, n))[..., None], col * 0.7, col)
    save(col, name)


def container_tex(name="containers.jpg", n=512):
    """8 colour bands (v) of corrugated container sides; u along the container."""
    colors = ["#b5322b", "#1f5fa8", "#2f8f4e", "#e2a52b", "#6d6f73", "#c75a1a", "#e7e7e7", "#24345a"]
    col = np.zeros((n, n, 3), np.float32)
    x = np.arange(n)[None, :]
    rib = 0.8 + 0.2 * (np.sin(x / n * 2 * np.pi * 40) > 0)
    for i, c in enumerate(colors):
        col[i * n // 8:(i + 1) * n // 8] = srgb(c)
    col *= rib[..., None]
    col *= (1 + pnoise(n, 30) * 0.05)[..., None]
    save(col, name)


def terminal_glass(n=1024):
    facade("facade_terminal", n, floors=2, bays=8, wall="#dfe3e6", glass="#6f8fa6", frame_w=0.004,
           win_h=0.94, win_w=0.97, mullion="#cfd6dc", glass_var=0.04, lit_p=0.95, warm=False, sills=False)


def generate_all():
    asphalt("asphalt.jpg", "#36383b")
    asphalt("asphalt_light.jpg", "#55575a", light=0.02)
    asphalt("asphalt_taxi.jpg", "#404246")
    concrete()
    road()
    roof()
    corrugated("metal_panel.jpg")
    corrugated("hangar_door.jpg", color="#d6dbe0")
    container_tex()
    terminal_glass()
    facade("facade_glass", 1024, floors=4, bays=4, wall="#4f6475", glass="#35556e", frame_w=0.004,
           win_h=0.78, win_w=0.96, spandrel="#2c3d4c", mullion="#9fb2c2", lit_p=0.45, warm=False, sills=False)
    facade("facade_glass2", 1024, floors=4, bays=8, wall="#6c7a73", glass="#4c6a66", frame_w=0.004,
           win_h=0.86, win_w=0.97, spandrel="#58665f", mullion="#b3c1bb", lit_p=0.5, warm=False, sills=False)
    facade("facade_office", 1024, floors=4, bays=4, wall="#b8b3a8", glass="#2d3a45", frame_w=0.01,
           win_h=0.55, win_w=0.62, lit_p=0.4, warm=True)
    facade("facade_resid", 1024, floors=4, bays=4, wall="#ddd6c8", glass="#3a4550", frame_w=0.012,
           win_h=0.5, win_w=0.45, balcony=True, lit_p=0.55, warm=True)
    facade("facade_brick", 1024, floors=4, bays=4, wall="#8a5a45", glass="#2a3035", frame_w=0.014,
           win_h=0.48, win_w=0.4, lit_p=0.5, warm=True)
    facade("facade_concrete", 1024, floors=4, bays=4, wall="#9c9c98", glass="#303840", frame_w=0.01,
           win_h=0.35, win_w=0.7, lit_p=0.3, warm=True)
    print("world textures done")


if __name__ == "__main__":
    generate_all()
