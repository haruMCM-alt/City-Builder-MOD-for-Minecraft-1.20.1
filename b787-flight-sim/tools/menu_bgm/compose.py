"""Menu music: "Blue Hour Departure" — composed and synthesised in code.

  python3 tools/menu_bgm/compose.py [out_dir]

Writes
  web/assets/menu_bgm.mp3        the in-game loop (160 kbps), with 0.5 s of pre/post roll
  web/assets/menu_bgm_lite.mp3   the same loop at 48 kbps for the single-file build
  <out_dir>/menu_bgm_full.mp3    a listening version: two passes and an ending
  tools/menu_bgm/menu_bgm.mid    the score (GM tracks; opens in GarageBand / any DAW)

Needs numpy, scipy, lameenc and mido (pip install lameenc mido).

D major, 96 BPM, 24 bars (60 s): A = pad + electric-piano arpeggio, B = groove + melody,
C = the melody an octave up over the opening chords. The loop is rendered three times in a
row and the middle pass is cut out, so the reverb and the release tails of bar 24 run on
into bar 1 and the loop has no seam. The game loops [PRE, PRE + LOOP) of the file: an
encoder delay shifts both ends by the same amount, so the cut stays seamless.
"""
import os
import sys
import zlib

import lameenc
import mido
import numpy as np
from scipy import signal

SR = 44100
BPM = 96
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 24
LOOP = BARS * BAR                     # 60.0 s
PRE = 0.5                             # pre/post roll around the loop in the game file
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, "web", "assets")
rng = np.random.default_rng(787)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ score
# chord voicings (rootless, F#3..B4) and bass roots per bar
V = {
    "Dmaj9": [54, 57, 61, 64, 69], "Bm9": [54, 57, 61, 62, 66], "Gmaj9": [54, 57, 59, 62, 66],
    "A11": [55, 59, 62, 64, 69], "F#m7": [52, 57, 61, 64, 66], "Asus": [57, 62, 64, 69],
    "A": [57, 61, 64, 69], "Gmaj7": [55, 59, 62, 66, 71], "A6": [54, 57, 61, 64, 66],
    "Bm7": [54, 57, 62, 66, 69], "Em7": [55, 59, 62, 64, 67],
}
ROOTS = {"D": 38, "E": 40, "F#": 42, "G": 43, "A": 45, "B": 47}
OPEN = [("Dmaj9", "D"), ("Bm9", "B"), ("Gmaj9", "G"), ("A11", "A"),
        ("Dmaj9", "D"), ("F#m7", "F#"), ("Gmaj9", "G"), ("Asus", "A")]
MID = [("Gmaj7", "G"), ("A6", "A"), ("F#m7", "F#"), ("Bm7", "B"),
       ("Em7", "E"), ("F#m7", "F#"), ("Gmaj7", "G"), ("Asus", "A")]
CHORDS = OPEN + MID + OPEN
# melody (beat, length, note) per bar of sections B and C
MEL = {
    8: [(0, 1.5, 71), (1.5, .5, 69), (2, 1, 66), (3, 1, 69)],
    9: [(0, 2, 76), (2, 1, 73), (3, 1, 71)],
    10: [(0, 1.5, 73), (1.5, .5, 71), (2, 2, 69)],
    11: [(0, 1, 66), (1, 1, 69), (2, 1, 71), (3, 1, 74)],
    12: [(0, 1.5, 78), (1.5, .5, 76), (2, 1, 74), (3, 1, 71)],
    13: [(0, 2, 73), (2, 1, 76), (3, 1, 73)],
    14: [(0, 1, 71), (1, 1, 74), (2, 2, 78)],
    15: [(0, 4, 76)],
    16: [(0, 1.5, 78), (1.5, .5, 76), (2, 1, 74), (3, .5, 76), (3.5, .5, 78)],
    17: [(0, 2, 81), (2, 1, 78), (3, 1, 74)],
    18: [(0, 1.5, 79), (1.5, .5, 78), (2, 1, 76), (3, 1, 74)],
    19: [(0, 3, 76), (3, 1, 71)],
    20: [(0, 1.5, 74), (1.5, .5, 76), (2, 1, 78), (3, 1, 81)],
    21: [(0, 2, 85), (2, 1, 81), (3, 1, 78)],
    22: [(0, 1, 79), (1, 1, 78), (2, 1, 76), (3, 1, 74)],
    23: [(0, 1.5, 76), (1.5, .5, 74), (2, 2, 73)],
}


def voicing(b, beat):
    name, _ = CHORDS[b]
    if name == "Asus" and beat >= 2:
        name = "A"
    return V[name]


def score():
    """One pass of the loop: {track: [(time s, length s, midi note, velocity 0..1)]}."""
    T = {k: [] for k in ("pad", "ep", "bell", "bass", "lead", "kick", "snare", "hat", "ohat", "shaker", "crash", "swell")}
    hum = lambda s=0.008: float(rng.normal(0, s))
    for b in range(BARS):
        t0 = b * BAR
        sec = b // 8                                  # 0 = A, 1 = B, 2 = C
        name, root = CHORDS[b]
        # pad: one chord per bar (Asus resolves to A half way)
        pv = 0.55 if sec == 1 else 0.75 if sec == 0 else 0.85
        if name == "Asus":
            for n in V["Asus"]: T["pad"].append((t0, 2 * BEAT, n, pv))
            for n in V["A"]: T["pad"].append((t0 + 2 * BEAT, 2 * BEAT, n, pv))
        else:
            for n in V[name]: T["pad"].append((t0, BAR, n, pv))
        # electric piano
        if sec == 0:
            # rising / falling eighth-note arpeggio over the voicing and its upper octave
            for i in range(8):
                v = voicing(b, i / 2)
                tones = v + [v[1] + 12, v[2] + 12, v[3] + 12]
                idx = [0, 2, 4, 6, 7, 5, 3, 1][i]
                T["ep"].append((t0 + i * BEAT / 2 + hum(), BEAT * 0.9, tones[idx % len(tones)], 0.42 + 0.12 * (i % 2 == 0) + hum(0.04)))
        else:
            # syncopated comping
            for bt, ln, vel in ((0, 1.4, .55), (1.5, .45, .42), (2.5, 1.3, .5)):
                for n in voicing(b, bt)[1:]:
                    T["ep"].append((t0 + bt * BEAT + hum(0.006), ln * BEAT, n, vel + hum(0.03)))
        # bell sparkle: top chord tone two octaves up, sections A (from bar 3) and C
        if (sec == 0 and b >= 2) or sec == 2:
            v = voicing(b, 0)
            T["bell"].append((t0 + hum(), 1.5 * BEAT, v[-1] + 12, 0.32))
            v = voicing(b, 2.5)
            T["bell"].append((t0 + 2.5 * BEAT + hum(), 1.5 * BEAT, v[-2] + 12, 0.25))
        # bass
        r = ROOTS[root]
        if sec == 0 and b >= 4:
            T["bass"].append((t0, BAR * 0.95, r, 0.6))
        elif sec > 0:
            for bt, ln, n, vel in ((0, 1.4, r, .8), (1.5, .45, r, .55), (2.5, .9, r + 12 if b % 2 else r + 7, .6), (3.5, .45, r, .5)):
                T["bass"].append((t0 + bt * BEAT, ln * BEAT, n, vel))
        # lead
        for bt, ln, n in MEL.get(b, []):
            T["lead"].append((t0 + bt * BEAT, ln * BEAT, n, 0.7 if sec == 1 else 0.82))
        # drums
        if sec == 0 and b >= 4:
            for i in range(16):
                T["shaker"].append((t0 + i * BEAT / 4 + hum(0.004), 0.1, 70, (0.5 if i % 2 else 0.28) + hum(0.05)))
            T["snare"].append((t0 + 3 * BEAT, 0.2, 37, 0.35))       # rim on 4
        if sec > 0:
            for bt in (0, 1.5, 2.5):
                T["kick"].append((t0 + bt * BEAT, 0.3, 36, 0.9 if bt == 0 else 0.7))
            for bt in (1, 3):
                T["snare"].append((t0 + bt * BEAT + hum(0.004), 0.3, 38, 0.75))
            if b % 2:
                T["snare"].append((t0 + 3.75 * BEAT, 0.1, 38, 0.22))  # ghost
            steps = 16 if (sec == 2 and b >= 20) else 8
            for i in range(steps):
                bt = i * 4 / steps
                if steps == 8 and i % 2:
                    bt += 0.06                                       # a touch of swing
                if b % 2 and abs(bt - 3.56) < 0.1:
                    T["ohat"].append((t0 + bt * BEAT, 0.4, 46, 0.45))
                    continue
                T["hat"].append((t0 + bt * BEAT + hum(0.004), 0.05, 42, (0.55 if i % (steps // 4) == 0 else 0.35) + hum(0.05)))
        if b in (0, 8, 16):
            T["crash"].append((t0, 3.0, 49, 0.55 if b == 0 else 0.75))
        if b in (7, 15, 23):
            T["swell"].append((t0 + 2 * BEAT, 2 * BEAT, 0, 0.5 if b != 15 else 0.6))
        if b == 23:                                                  # fill back to the top
            for i in range(8, 16):
                T["snare"].append((t0 + i * BEAT / 4, 0.12, 38, 0.25 + 0.05 * (i - 8)))
    return T


def ending():
    """A closing bar for the listening version: Dmaj9 and a last crash."""
    T = {k: [] for k in ("pad", "ep", "bell", "bass", "kick", "crash")}
    for n in V["Dmaj9"]:
        T["pad"].append((0, 2 * BAR, n, 0.85))
        T["ep"].append((0, 2 * BAR, n, 0.5))
    T["ep"].append((0, 2 * BAR, 74, 0.45))
    T["bell"].append((0, 2 * BAR, 81, 0.35))
    T["bass"].append((0, 1.5 * BAR, 38, 0.8))
    T["kick"].append((0, 0.3, 36, 0.9))
    T["crash"].append((0, 4.0, 49, 0.8))
    return T


# ------------------------------------------------------------------ instruments
def polyblep_saw(f, n, ph0=0.0):
    dt = f / SR
    t = (ph0 + dt * np.arange(n)) % 1.0
    y = 2 * t - 1
    a = t < dt
    x = t[a] / dt
    y[a] -= x + x - x * x - 1
    b = t > 1 - dt
    x = (t[b] - 1) / dt
    y[b] -= x * x + x + x + 1
    return y


def env_ar(n, a, r, hold):
    """Attack a s, sustain until `hold` s, release r s (n samples)."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    rel = t > hold
    e[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4) * 4.6)
    return e


def note_pad(f, ln, vel):
    n = int((ln + 2.2) * SR)
    L = np.zeros(n); R = np.zeros(n)
    for k, c in enumerate((-11, -4, 4, 11)):
        s = polyblep_saw(f * 2 ** (c / 1200), n, rng.random())
        (L if k % 2 == 0 else R)[:] += s
        (R if k % 2 == 0 else L)[:] += s * 0.45
    e = env_ar(n, 0.9, 2.0, ln) * vel
    return np.stack([L * e, R * e]) * 0.06


def note_ep(f, ln, vel):
    n = int((ln + 0.5) * SR)
    t = np.arange(n) / SR
    I = (0.9 + 1.6 * vel) * np.exp(-t / 0.35)
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
    y += 0.18 * vel * np.sin(2 * np.pi * f * 14.0 * t) * np.exp(-t / 0.025)   # tine
    y += 0.25 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.6)          # body
    e = np.exp(-t / 1.8) * np.minimum(1, t / 0.003)
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.12)
    y *= e * vel * 0.18
    return np.stack([y, y])


def note_bell(f, ln, vel):
    n = int((ln + 1.6) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t + 1.8 * np.exp(-t / 0.25) * np.sin(2 * np.pi * 3.5 * f * t))
    y *= np.exp(-t / 0.9) * np.minimum(1, t / 0.002) * vel * 0.12
    return np.stack([y * 0.8, y * 1.0])


def note_bass(f, ln, vel):
    n = int((ln + 0.15) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.12 * np.sin(6 * np.pi * f * t)
    y = np.tanh(1.6 * y) / np.tanh(1.6)
    e = np.minimum(1, t / 0.006) * (0.75 + 0.25 * np.exp(-t / 0.12))
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.04)
    y *= e * vel * 0.32
    return np.stack([y, y])


def note_lead(f, ln, vel):
    n = int((ln + 0.35) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.0065 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, np.maximum(0, t - 0.25) / 0.4)
    ph = 2 * np.pi * np.cumsum(f * vib) / SR
    y = np.sin(ph) + 0.22 * np.sin(2 * ph) + 0.1 * np.sin(3 * ph) + 0.04 * np.sin(5 * ph)
    breath = signal.lfilter(*signal.butter(2, [min(f * 1.5, 9000) / (SR / 2), min(f * 4, 18000) / (SR / 2)], "band"), rng.normal(0, 1, n))
    y += breath * 0.06 * np.exp(-t / 0.15)
    e = np.minimum(1, t / 0.045)
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.08)
    y *= e * vel * 0.16
    return np.stack([y * 0.92, y])


def noise(n):
    return rng.normal(0, 1, n)


def bp(x, lo, hi, order=2):
    return signal.lfilter(*signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band"), x)


def hp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "high"), x)


def lp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "low"), x, axis=-1)


def hit(kind, vel):
    if kind == "kick":
        n = int(0.45 * SR); t = np.arange(n) / SR
        f = 46 + 95 * np.exp(-t / 0.035)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)
        y += 0.15 * hp(noise(n), 2000) * np.exp(-t / 0.004)
        y = np.tanh(1.4 * y) * 0.55
    elif kind == "snare":
        n = int(0.4 * SR); t = np.arange(n) / SR
        y = 0.5 * np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.06)
        y += bp(noise(n), 1400, 7000) * np.exp(-t / 0.11) * 0.75
        y *= 0.32
    elif kind == "rim":
        n = int(0.15 * SR); t = np.arange(n) / SR
        y = (np.sin(2 * np.pi * 820 * t) * 0.6 + bp(noise(n), 2500, 6000) * 0.6) * np.exp(-t / 0.018) * 0.3
    elif kind in ("hat", "ohat"):
        n = int((0.6 if kind == "ohat" else 0.12) * SR); t = np.arange(n) / SR
        y = hp(noise(n), 7500, 4) * np.exp(-t / (0.16 if kind == "ohat" else 0.022)) * 0.16
    elif kind == "shaker":
        n = int(0.12 * SR); t = np.arange(n) / SR
        y = bp(noise(n), 4500, 10000) * np.minimum(1, t / 0.012) * np.exp(-t / 0.04) * 0.11
    elif kind == "crash":
        n = int(3.5 * SR); t = np.arange(n) / SR
        y = hp(noise(n), 3500, 2) * 0.6
        for fr in (3150, 4270, 5380, 6900, 8130):
            y += 0.12 * np.sin(2 * np.pi * fr * t + rng.random() * 6.28)
        y *= np.exp(-t / 1.1) * np.minimum(1, t / 0.003) * 0.13
    y = y * vel
    return np.stack([y, y])


def swell(ln, vel):
    n = int(ln * SR); t = np.arange(n) / SR
    y = hp(noise(n), 2500) * (t / ln) ** 2.2 * 0.07 * vel
    return np.stack([y * 0.9, np.roll(y, 40)])


PAN = {"pad": 0, "ep": -0.15, "bell": 0.35, "bass": 0, "lead": 0.05, "kick": 0, "snare": 0.05, "rim": 0.1,
       "hat": 0.3, "ohat": 0.3, "shaker": -0.35, "crash": -0.2, "swell": 0}
SEND = {"pad": 0.35, "ep": 0.3, "bell": 0.55, "bass": 0.0, "lead": 0.4, "kick": 0.04, "snare": 0.25, "rim": 0.3,
        "hat": 0.1, "ohat": 0.15, "shaker": 0.2, "crash": 0.3, "swell": 0.5}


def place(buf, x, t):
    i = int(round(t * SR))
    if i < 0:
        x = x[:, -i:]; i = 0
    m = min(x.shape[1], buf.shape[1] - i)
    if m > 0:
        buf[:, i:i + m] += x[:, :m]


def pan(x, p):
    a = (p + 1) * np.pi / 4
    return np.stack([x[0] * np.cos(a) * 1.414, x[1] * np.sin(a) * 1.414])


def render(passes, dur):
    """passes: [(start s, score)]. Returns stereo float array of `dur` seconds."""
    n = int(dur * SR)
    tracks = {}
    global rng
    for start, S in passes:
        for k, evs in S.items():
            buf = tracks.setdefault(k, np.zeros((2, n)))
            for (t, ln, m, vel) in evs:
                # the same event sounds the same in every pass (phases, noise): the loop is
                # sample-exact periodic, so the seam does not click
                rng = np.random.default_rng(zlib.crc32(f"{k}:{t:.4f}:{m}".encode()))
                t += start
                if k == "pad": x = note_pad(hz(m), ln, vel)
                elif k == "ep": x = note_ep(hz(m), ln, vel)
                elif k == "bell": x = note_bell(hz(m), ln, vel)
                elif k == "bass": x = note_bass(hz(m), ln, vel)
                elif k == "lead": x = note_lead(hz(m), ln, vel)
                elif k == "snare": x = hit("rim" if m == 37 else "snare", vel)
                elif k == "swell": x = swell(ln, vel)
                else: x = hit(k, vel)
                place(buf, x, t)
    # sidechain: the kick ducks pad and piano a little
    if "kick" in tracks:
        ke = np.abs(tracks["kick"][0])
        ke = signal.lfilter([1 - np.exp(-1 / (0.09 * SR))], [1, -np.exp(-1 / (0.09 * SR))], ke)
        duck = 1 - 0.5 * np.clip(ke / (ke.max() + 1e-9), 0, 1)
        for k in ("pad", "ep"):
            if k in tracks: tracks[k] *= duck
    t = np.arange(n) / SR
    if "pad" in tracks:
        tracks["pad"] = lp(tracks["pad"], 3200, 4)
        tracks["pad"] *= 1 + 0.08 * np.sin(2 * np.pi * 6 / LOOP * t)     # (whole cycles per loop)
    if "ep" in tracks:                                        # stereo tremolo
        tr = 0.22 * np.sin(2 * np.pi * (BPM / 60 / 2) * t)
        tracks["ep"] = np.stack([tracks["ep"][0] * (1 + tr), tracks["ep"][1] * (1 - tr)])
        tracks["ep"] = lp(tracks["ep"], 6500, 2)
    if "bass" in tracks:
        tracks["bass"] = lp(tracks["bass"], 900, 2)
    if "lead" in tracks:                                      # dotted-eighth ping-pong echo
        d = int(0.75 * BEAT * SR); x = tracks["lead"]; echo = np.zeros_like(x)
        src = x.copy()
        for k in range(1, 5):
            src = lp(src, 3500, 1) * 0.42
            sh = np.zeros_like(src); sh[:, d * k:] = src[:, :n - d * k] if d * k < n else 0
            echo[(k + 1) % 2] += sh[0] + sh[1]
        tracks["lead"] = x + echo * 0.5
    dry = np.zeros((2, n)); wet = np.zeros((2, n))
    gain = {"pad": 1.0, "ep": 1.0, "bell": 2.6, "bass": 0.9, "lead": 1.2, "kick": 0.95, "snare": 1.8,
            "hat": 1.6, "ohat": 1.5, "shaker": 1.4, "crash": 1.2, "swell": 1.3}
    for k, x in tracks.items():
        x = pan(x, PAN.get(k, 0)) * gain.get(k, 1)
        dry += x
        wet += x * SEND.get(k, 0.2)
    # reverb: stereo decaying noise, darker with time, 2.6 s RT60, 22 ms pre-delay
    rng = np.random.default_rng(31)
    rt, ln = 2.6, int(3.2 * SR)
    ti = np.arange(ln) / SR
    irs = []
    for ch in range(2):
        nz = rng.normal(0, 1, ln)
        bright, dark = lp(nz, 7000, 2), lp(nz, 1800, 2)
        w = np.clip(ti / rt, 0, 1)
        ir = ((1 - w) * bright + w * dark) * np.exp(-ti * 6.9 / rt)
        ir = np.concatenate([np.zeros(int(0.022 * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    wet = hp(wet, 180, 2)
    rev = np.stack([signal.oaconvolve(wet[0], irs[0])[:n], signal.oaconvolve(wet[1], irs[1])[:n]])
    mix = dry + rev * 0.55
    mix = hp(mix, 28, 2)
    return mix + 0.4 * hp(mix, 5000, 1)                       # a little air on top


def master(x, ref):
    x = x / ref
    return np.tanh(1.25 * x) / np.tanh(1.25) * 0.93


def mp3(x, path, kbps, rate=SR):
    if rate != SR:
        x = signal.resample_poly(x, rate, SR, axis=1)
    enc = lameenc.Encoder()
    enc.set_bit_rate(kbps); enc.set_in_sample_rate(rate); enc.set_channels(2); enc.set_quality(2)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2").T.copy()
    data = enc.encode(pcm.tobytes()) + enc.flush()
    open(path, "wb").write(data)
    print("wrote", path, len(data) // 1024, "KiB")


def midi(S, path):
    tpb = 480
    mf = mido.MidiFile(ticks_per_beat=tpb)
    meta = mido.MidiTrack(); mf.tracks.append(meta)
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4))
    meta.append(mido.MetaMessage("key_signature", key="D"))
    parts = [("Warm Pad", 0, 89, ["pad"]), ("Electric Piano", 1, 4, ["ep"]), ("Bells", 2, 10, ["bell"]),
             ("Bass", 3, 38, ["bass"]), ("Lead", 4, 73, ["lead"]),
             ("Drums", 9, 0, ["kick", "snare", "hat", "ohat", "shaker", "crash"])]
    for name, ch, prog, keys in parts:
        tr = mido.MidiTrack(); mf.tracks.append(tr)
        tr.append(mido.MetaMessage("track_name", name=name))
        if ch != 9:
            tr.append(mido.Message("program_change", channel=ch, program=prog, time=0))
        ev = []
        for k in keys:
            for (t, ln, m, vel) in S.get(k, []):
                t = max(0.0, t)
                on = int(round(t / BEAT * tpb)); off = int(round((t + ln) / BEAT * tpb))
                v = int(np.clip(vel * 127, 1, 127))
                ev.append((on, 1, mido.Message("note_on", channel=ch, note=m, velocity=v)))
                ev.append((max(off, on + 1), 0, mido.Message("note_off", channel=ch, note=m, velocity=0)))
        ev.sort(key=lambda e: (e[0], e[1]))
        last = 0
        for tick, _, msg in ev:
            tr.append(msg.copy(time=tick - last)); last = tick
    mf.save(path)
    print("wrote", path)


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else HERE
    S = score()
    E = ending()
    # game loop: three passes, keep the middle one with pre/post roll
    loop = render([(0, S), (LOOP, S), (2 * LOOP, S)], 3 * LOOP + 1)
    a, b = int((LOOP - PRE) * SR), int((2 * LOOP + PRE) * SR)
    seg = loop[:, a:b]
    ref = np.percentile(np.abs(seg), 99.97) * 1.05
    seg = master(seg, ref)
    mp3(seg, os.path.join(ASSETS, "menu_bgm.mp3"), 160)
    mp3(seg, os.path.join(ASSETS, "menu_bgm_lite.mp3"), 48, 32000)
    # listening version: two passes, then the closing chord
    full = render([(0, S), (LOOP, S), (2 * LOOP, E)], 2 * LOOP + 2 * BAR + 3.5)
    full = master(full, ref)
    k = int(2 * LOOP * SR)
    tail = np.arange(full.shape[1] - k) / SR
    full[:, k:] *= np.clip(1 - tail / (2 * BAR + 3.5), 0, 1) ** 1.5
    full[:, :int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    mp3(full, os.path.join(out, "menu_bgm_full.mp3"), 192)
    midi(S, os.path.join(HERE, "menu_bgm.mid"))


if __name__ == "__main__":
    main()
