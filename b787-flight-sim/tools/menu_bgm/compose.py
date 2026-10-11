"""Menu music: "Runway Sunshine" — composed and synthesised in code.

  python3 tools/menu_bgm/compose.py [out_dir]

Writes
  web/assets/menu_bgm.mp3        the in-game loop (160 kbps), with 0.5 s of pre/post roll
  web/assets/menu_bgm_lite.mp3   the same loop at 48 kbps for the single-file build
  <out_dir>/menu_bgm_full.mp3    a listening version: two passes and an ending
  tools/menu_bgm/menu_bgm.mid    the score (GM tracks; opens in GarageBand / any DAW)

Needs numpy, scipy, lameenc and mido (pip install lameenc mido).

Bright city-pop / fusion in E major, 128 BPM, 32 bars (60 s):
  intro (8)   brass stabs and the chorus hook, groove from the first bar
  verse (8)   16-beat groove, electric-piano comping, slap bass, the lead enters
  chorus (8)  "royal road" progression IV-V-iii-vi, strings, brass, the hook up high
  chorus 2 (8) the hook with a harmony a third below and a bell arpeggio, turnaround
The loop is rendered three times in a row and the middle pass is cut out, so the reverb and
the release tails of bar 32 run on into bar 1 and the loop has no seam. The game loops
[PRE, PRE + LOOP) of the file: an encoder delay shifts both ends by the same amount, so the
cut stays seamless.
"""
import os
import sys
import zlib

import lameenc
import mido
import numpy as np
from scipy import signal

SR = 44100
BPM = 128
BEAT = 60 / BPM
BAR = 4 * BEAT
BARS = 32
LOOP = BARS * BAR                     # 60.0 s
PRE = 0.5                             # pre/post roll around the loop in the game file
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
ASSETS = os.path.join(ROOT, "web", "assets")
rng = np.random.default_rng(128)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ------------------------------------------------------------------ score
# chord voicings (around E4) and the progression: per bar [(beat, chord, bass note)]
V = {
    "Amaj9": [61, 64, 68, 71], "B": [63, 66, 71, 73], "G#m7": [63, 66, 68, 71], "C#m7": [64, 68, 71, 73],
    "E": [64, 66, 68, 71], "Esus": [64, 66, 69, 71], "F#m7": [61, 64, 66, 69],
    "B7sus": [64, 66, 69, 71], "B7": [63, 66, 69, 71],
}
A_, B_, Gs, Cs, E_, Ds, Fs = 45, 47, 44, 49, 40, 39, 42
CHORUS = [[(0, "Amaj9", A_)], [(0, "B", B_)], [(0, "G#m7", Gs)], [(0, "C#m7", Cs)],
          [(0, "F#m7", Fs)], [(0, "G#m7", Gs)], [(0, "Amaj9", A_)], [(0, "B", B_)]]
PROG = (
    # intro
    [[(0, "Amaj9", A_)], [(0, "B", B_)], [(0, "Esus", E_), (2, "E", E_)], [(0, "E", E_)],
     [(0, "Amaj9", A_)], [(0, "B", B_)], [(0, "G#m7", Gs)], [(0, "C#m7", Cs)]]
    # verse
    + [[(0, "E", E_)], [(0, "B", Ds)], [(0, "C#m7", Cs)], [(0, "G#m7", Gs)],
       [(0, "Amaj9", A_)], [(0, "E", Gs)], [(0, "F#m7", Fs)], [(0, "B7sus", B_), (2, "B7", B_)]]
    + CHORUS
    + CHORUS[:7] + [[(0, "B7sus", B_), (2, "B7", B_)]]
)
INTRO, VERSE, CHO, CHO2 = range(0, 8), range(8, 16), range(16, 24), range(24, 32)
# lead melody (beat, length, note) per bar; the intro plays the chorus hook
MEL = {
    8: [(0, .5, 71), (.5, .5, 73), (1, 1, 76), (2.5, .5, 75), (3, 1, 73)],
    9: [(0, 1.5, 71), (1.5, .5, 68), (2, .5, 66), (2.5, 1.5, 68)],
    10: [(0, .5, 68), (.5, .5, 71), (1, 1, 73), (2.5, .5, 76), (3, 1, 75)],
    11: [(0, 2, 71), (2.5, .5, 68), (3, 1, 66)],
    12: [(0, .5, 64), (.5, .5, 66), (1, 1, 68), (2, .5, 69), (2.5, 1.5, 71)],
    13: [(0, 1, 76), (1, .5, 75), (1.5, 1, 73), (2.5, 1.5, 71)],
    14: [(0, .5, 69), (.5, .5, 71), (1, 1, 73), (2, 1, 76), (3, 1, 78)],
    15: [(0, 3, 78), (3, .5, 75), (3.5, .5, 78)],
    16: [(0, 1, 80), (1, .5, 78), (1.5, 1, 76), (2.5, .5, 78), (3, 1, 80)],
    17: [(0, 1.5, 78), (1.5, .5, 75), (2, .5, 73), (2.5, 1.5, 75)],
    18: [(0, 1, 75), (1, .5, 76), (1.5, 1, 78), (2.5, .5, 80), (3, 1, 83)],
    19: [(0, 2.5, 80), (2.5, .5, 78), (3, 1, 76)],
    20: [(0, .5, 73), (.5, .5, 76), (1, 1, 78), (2, .5, 81), (2.5, 1.5, 80)],
    21: [(0, 1, 78), (1, .5, 76), (1.5, 1, 75), (2.5, 1.5, 71)],
    22: [(0, .5, 73), (.5, .5, 76), (1, 1, 80), (2, 1, 81), (3, 1, 83)],
    23: [(0, 2.5, 83), (2.5, .5, 80), (3, 1, 78)],
}
for b in range(24, 31):
    MEL[b] = MEL[b - 8]
MEL[31] = [(0, 1, 83), (1.5, .5, 80), (2, .5, 78), (2.5, 1.5, 75)]
for b in range(4, 8):
    MEL[b] = MEL[b + 12]
SCALE = {4, 6, 8, 9, 11, 1, 3}        # E major


def third_below(m):
    return [x for x in range(m - 1, m - 6, -1) if x % 12 in SCALE][1]


def chord_at(b, beat):
    cur = PROG[b][0]
    for c in PROG[b]:
        if c[0] <= beat:
            cur = c
    return V[cur[1]], cur[2]


def score():
    """One pass of the loop: {track: [(time s, length s, midi note, velocity 0..1)]}."""
    keys = ("pad", "ep", "bell", "bass", "lead", "lead2", "brass", "kick", "snare", "clap", "hat", "ohat",
            "shaker", "tom", "crash", "swell")
    T = {k: [] for k in keys}
    hum = lambda s=0.006: float(rng.normal(0, s))
    for b in range(BARS):
        t0 = b * BAR
        at = lambda beat: t0 + beat * BEAT
        big = b in CHO or b in CHO2
        # strings: the chorus sections and the second half of the intro
        if big or b >= 4 and b in INTRO:
            for beat, name, _ in PROG[b]:
                ln = (PROG[b][1][0] if len(PROG[b]) > 1 and beat == 0 else 4) - beat
                for n in V[name]:
                    T["pad"].append((at(beat), ln * BEAT, n, 0.6 if big else 0.45))
                T["pad"].append((at(beat), ln * BEAT, V[name][-1] + 12, 0.35 if big else 0.25))
        # electric piano: 16th comping in the verse, off-beat chops elsewhere
        pat = ((0, .25, .55), (.75, .25, .42), (1.5, .4, .5), (2.25, .25, .42), (3, .3, .5), (3.5, .25, .4)) if b in VERSE \
            else ((.5, .3, .4), (1.5, .3, .36), (2.5, .3, .4), (3.5, .3, .36))
        for beat, ln, vel in pat:
            for n in chord_at(b, beat)[0]:
                T["ep"].append((at(beat) + hum(0.004), ln * BEAT, n, vel + hum(0.03)))
        # brass stabs (intro and choruses), a build-up at the end of the verse
        if b in INTRO or big:
            hits = ((0, .35, .8), (1.5, .3, .65), (2.5, .5, .75)) if b % 4 != 3 else ((0, .35, .8), (1.5, .3, .65), (2.5, .25, .7), (3, .25, .7), (3.5, .45, .85))
        elif b == 15:
            hits = ((2, .25, .6), (2.5, .25, .65), (3, .25, .7), (3.5, .45, .8))
        else:
            hits = ()
        for beat, ln, vel in hits:
            v = chord_at(b, beat)[0]
            for n in v + [v[-1] + 12]:
                T["brass"].append((at(beat), ln * BEAT, n, vel))
        # bells: a 16th arpeggio in the first intro bars and in chorus 2
        if b < 4 or b in CHO2:
            for i in range(16):
                v = chord_at(b, i / 4)[0]
                tones = [n + 12 for n in v] + [v[0] + 24]
                idx = (0, 2, 1, 3, 2, 4, 3, 1)[i % 8]
                T["bell"].append((at(i / 4) + hum(0.003), 0.5 * BEAT, tones[idx], 0.3 if i % 4 == 0 else 0.2))
        # slap bass
        if b < 4:
            pat = ((0, .4, 0, .85), (1.5, .4, 0, .7), (2.5, .4, 0, .75), (3.5, .3, 12, .65))
        else:
            pat = ((0, .45, 0, .9), (.75, .2, 12, .62), (1.5, .4, 0, .75), (2, .2, 0, .45), (2.5, .2, 12, .68),
                   (2.75, .45, 0, .8), (3.5, .4, 7, .62))
        for beat, ln, iv, vel in pat:
            r = chord_at(b, beat)[1]
            T["bass"].append((at(beat), ln * BEAT, r + iv, vel))
        # lead and the chorus-2 harmony
        for beat, ln, n in MEL.get(b, []):
            vel = 0.62 if b in INTRO else 0.72 if b in VERSE else 0.85
            T["lead"].append((at(beat), ln * BEAT, n, vel))
            if b in CHO2:
                T["lead2"].append((at(beat), ln * BEAT, third_below(n), 0.5))
        # drums
        for beat in ((0, 1.75, 2.5) + ((3.75,) if big and b % 2 else ())):
            T["kick"].append((at(beat), 0.3, 36, 0.95 if beat == 0 else 0.75))
        if b >= 2:
            for beat in (1, 3):
                T["snare"].append((at(beat) + hum(0.003), 0.3, 38, 0.8))
                if big:
                    T["clap"].append((at(beat) + 0.004, 0.3, 39, 0.6))
            if b >= 4 and b % 2 == 0:
                T["snare"].append((at(2.75), 0.1, 38, 0.18))         # ghost
        else:
            T["clap"].append((at(3), 0.3, 39, 0.55))
        steps = 8 if b in VERSE or b < 2 else 16
        for i in range(steps):
            beat = i * 4 / steps
            if big and abs(beat - 3.5) < 1e-6:
                T["ohat"].append((at(beat), 0.4, 46, 0.5))
                continue
            acc = (i % (steps // 4) == 0)
            T["hat"].append((at(beat) + hum(0.003), 0.05, 42, (0.55 if acc else 0.36 if i % 2 == 0 else 0.26) + hum(0.04)))
        if b in VERSE:
            for i in range(16):
                T["shaker"].append((at(i / 4) + hum(0.003), 0.1, 70, (0.5 if i % 2 else 0.3) + hum(0.04)))
        if b in (0, 16, 24):
            T["crash"].append((t0, 3.0, 49, 0.75))
        if b == 8:
            T["crash"].append((t0, 3.0, 49, 0.5))
        if b in (15, 23):
            T["swell"].append((at(2), 2 * BEAT, 0, 0.6))
        if b in (7, 15, 23, 31):                                      # tom fill into the next section
            for beat, m in ((3, 50), (3.25, 50), (3.5, 47), (3.75, 45)):
                T["tom"].append((at(beat), 0.3, m, 0.7))
    return T


def ending():
    """A closing hit for the listening version: E major with brass, strings and a crash."""
    T = {k: [] for k in ("pad", "ep", "bell", "bass", "brass", "kick", "crash", "lead")}
    for n in V["E"]:
        T["pad"].append((0, 2 * BAR, n, 0.7))
        T["ep"].append((0, 2 * BAR, n, 0.5))
        T["brass"].append((0, 0.9 * BAR, n, 0.85))
    T["brass"].append((0, 0.9 * BAR, 83, 0.8))
    T["lead"].append((0, 1.6 * BAR, 76, 0.85))
    T["bell"].append((0, 2 * BAR, 88, 0.35))
    T["bass"].append((0, 1.5 * BAR, 40, 0.9))
    T["kick"].append((0, 0.3, 36, 0.95))
    T["crash"].append((0, 4.0, 49, 0.85))
    return T


# ------------------------------------------------------------------ instruments
def blep_saw(ph, dt):
    """Band-limited saw from a running phase (cycles) and the phase step per sample."""
    t = ph % 1.0
    y = 2 * t - 1
    a = t < dt
    x = t[a] / dt[a]
    y[a] -= x + x - x * x - 1
    b = t > 1 - dt
    x = (t[b] - 1) / dt[b]
    y[b] -= x * x + x + x + 1
    return y


def osc_phase(f, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(f, float), (n,))
    dt = f / SR
    return ph0 + np.cumsum(dt) - dt[0], dt


def env_ar(n, a, r, hold):
    """Attack a s, sustain until `hold` s, release r s (n samples)."""
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4))
    rel = t > hold
    e[rel] *= np.exp(-(t[rel] - hold) / max(r, 1e-4) * 4.6)
    return e


def note_pad(f, ln, vel):
    n = int((ln + 1.0) * SR)
    L = np.zeros(n); R = np.zeros(n)
    for k, c in enumerate((-12, -5, 5, 12)):
        ph, dt = osc_phase(f * 2 ** (c / 1200), n, rng.random())
        s = blep_saw(ph, dt)
        (L if k % 2 == 0 else R)[:] += s
        (R if k % 2 == 0 else L)[:] += s * 0.4
    e = env_ar(n, 0.12, 0.6, ln) * vel
    return np.stack([L * e, R * e]) * 0.05


def note_ep(f, ln, vel):
    n = int((ln + 0.4) * SR)
    t = np.arange(n) / SR
    I = (1.1 + 1.8 * vel) * np.exp(-t / 0.25)
    y = np.sin(2 * np.pi * f * t + I * np.sin(2 * np.pi * f * t))
    y += 0.22 * vel * np.sin(2 * np.pi * f * 14.0 * t) * np.exp(-t / 0.02)    # tine
    y += 0.2 * np.sin(2 * np.pi * f * 0.5 * t) * np.exp(-t / 0.5)            # body
    e = np.exp(-t / 1.2) * np.minimum(1, t / 0.002)
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.06)
    y *= e * vel * 0.16
    return np.stack([y, y])


def note_bell(f, ln, vel):
    n = int((ln + 1.0) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t + 1.6 * np.exp(-t / 0.2) * np.sin(2 * np.pi * 3.5 * f * t))
    y *= np.exp(-t / 0.5) * np.minimum(1, t / 0.002) * vel * 0.12
    return np.stack([y * 0.8, y * 1.0])


def note_bass(f, ln, vel):
    """Slap bass: a round body plus a bright, fast-decaying pluck."""
    n = int((ln + 0.12) * SR)
    t = np.arange(n) / SR
    y = np.sin(2 * np.pi * f * t) + 0.4 * np.sin(4 * np.pi * f * t) + 0.15 * np.sin(6 * np.pi * f * t)
    ph, dt = osc_phase(f, n)
    pl = blep_saw(ph, dt)
    y += pl * 0.9 * np.exp(-t / 0.035) + lp(pl, 1200, 1) * 0.35 * np.exp(-t / 0.2)
    y = np.tanh(1.5 * y) / np.tanh(1.5)
    e = np.minimum(1, t / 0.003) * (0.7 + 0.3 * np.exp(-t / 0.1))
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.03)
    y *= e * vel * 0.28
    return np.stack([y, y])


def note_lead(f, ln, vel):
    """Bright synth lead: saw + square, a small scoop into the note, delayed vibrato."""
    n = int((ln + 0.3) * SR)
    t = np.arange(n) / SR
    vib = 0.007 * np.sin(2 * np.pi * 5.6 * t) * np.minimum(1, np.maximum(0, t - 0.18) / 0.3)
    scoop = -0.5 / 12 * np.exp(-t / 0.025)
    fi = f * 2 ** scoop * (1 + vib)
    out = []
    for c in (-6, 6):                                    # two slightly detuned voices: L / R
        ph, dt = osc_phase(fi * 2 ** (c / 1200), n, rng.random())
        saw = blep_saw(ph, dt)
        sq = blep_saw(ph, dt) - blep_saw(ph + 0.5, dt)
        y = 0.55 * saw + 0.45 * sq
        dark = lp(y, 2200, 2)
        y = dark + (y - dark) * (0.45 + 0.55 * np.exp(-t / 0.15))
        out.append(y)
    e = np.minimum(1, t / 0.008)
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.07)
    e *= vel * 0.085
    return np.stack([out[0] * e, out[1] * e])


def note_brass(f, ln, vel):
    """Synth brass stab: three detuned saws, the filter opens on the attack and closes."""
    n = int((ln + 0.25) * SR)
    t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    for k, c in enumerate((-9, 0, 9)):
        ph, dt = osc_phase(f * 2 ** (c / 1200), n, rng.random())
        s = blep_saw(ph, dt)
        L += s * (1.0 if k != 2 else 0.5); R += s * (1.0 if k != 0 else 0.5)
    fe = 0.3 + 0.7 * np.exp(-t / 0.09)
    out = []
    for x in (L, R):
        dark = lp(x, 900, 2)
        out.append(dark + (x - dark) * fe)
    e = np.minimum(1, t / 0.012)
    rel = t > ln
    e[rel] *= np.exp(-(t[rel] - ln) / 0.06)
    e *= vel * 0.045
    return np.stack([out[0] * e, out[1] * e])


def noise(n):
    return rng.normal(0, 1, n)


def bp(x, lo, hi, order=2):
    return signal.lfilter(*signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], "band"), x)


def hp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "high"), x)


def lp(x, fc, order=2):
    return signal.lfilter(*signal.butter(order, fc / (SR / 2), "low"), x, axis=-1)


def hit(kind, vel, m=0):
    if kind == "kick":
        n = int(0.4 * SR); t = np.arange(n) / SR
        f = 50 + 110 * np.exp(-t / 0.03)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)
        y += 0.25 * hp(noise(n), 2500) * np.exp(-t / 0.003)
        y = np.tanh(1.6 * y) * 0.55
    elif kind == "snare":
        n = int(0.35 * SR); t = np.arange(n) / SR
        y = 0.5 * np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.05)
        y += bp(noise(n), 1500, 9000) * np.exp(-t / 0.1) * 0.85
        y *= 0.32
    elif kind == "clap":
        n = int(0.35 * SR); t = np.arange(n) / SR
        env = np.zeros(n)
        for k, d in enumerate((0, 0.009, 0.018)):
            i = int(d * SR); env[i:] += np.exp(-(t[i:] - d) / (0.006 if k < 2 else 0.09))
        y = bp(noise(n), 900, 5000) * env * 0.22
    elif kind in ("hat", "ohat"):
        n = int((0.5 if kind == "ohat" else 0.1) * SR); t = np.arange(n) / SR
        y = hp(noise(n), 8000, 4) * np.exp(-t / (0.13 if kind == "ohat" else 0.018)) * 0.18
    elif kind == "shaker":
        n = int(0.1 * SR); t = np.arange(n) / SR
        y = bp(noise(n), 5000, 11000) * np.minimum(1, t / 0.008) * np.exp(-t / 0.03) * 0.11
    elif kind == "tom":
        n = int(0.45 * SR); t = np.arange(n) / SR
        f0 = {45: 105, 47: 135, 50: 175}.get(m, 140)
        f = f0 * (1 + 0.6 * np.exp(-t / 0.03))
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22) * 0.5
        y += 0.1 * bp(noise(n), 800, 4000) * np.exp(-t / 0.02)
    elif kind == "crash":
        n = int(3.0 * SR); t = np.arange(n) / SR
        y = hp(noise(n), 3500, 2) * 0.6
        for fr in (3150, 4270, 5380, 6900, 8130):
            y += 0.12 * np.sin(2 * np.pi * fr * t + rng.random() * 6.28)
        y *= np.exp(-t / 0.9) * np.minimum(1, t / 0.003) * 0.13
    y = y * vel
    return np.stack([y, y])


def swell(ln, vel):
    n = int(ln * SR); t = np.arange(n) / SR
    y = hp(noise(n), 2500) * (t / ln) ** 2.2 * 0.07 * vel
    return np.stack([y * 0.9, np.roll(y, 40)])


PAN = {"pad": 0, "ep": -0.25, "bell": 0.4, "bass": 0, "lead": 0.05, "lead2": -0.3, "brass": 0.15, "kick": 0,
       "snare": 0.05, "clap": -0.05, "hat": 0.3, "ohat": 0.3, "shaker": -0.35, "tom": -0.1, "crash": -0.2, "swell": 0}
SEND = {"pad": 0.3, "ep": 0.2, "bell": 0.45, "bass": 0.0, "lead": 0.3, "lead2": 0.35, "brass": 0.25, "kick": 0.03,
        "snare": 0.22, "clap": 0.3, "hat": 0.08, "ohat": 0.12, "shaker": 0.15, "tom": 0.2, "crash": 0.25, "swell": 0.45}
GAIN = {"pad": 1.0, "ep": 1.0, "bell": 1.8, "bass": 1.0, "lead": 1.7, "lead2": 1.1, "brass": 1.4, "kick": 0.8,
        "snare": 1.6, "clap": 1.3, "hat": 1.5, "ohat": 1.3, "shaker": 1.3, "tom": 0.45, "crash": 1.1, "swell": 1.2}
SYNTH = {"pad": note_pad, "ep": note_ep, "bell": note_bell, "bass": note_bass, "lead": note_lead,
         "lead2": note_lead, "brass": note_brass}


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


def echo(x, n, d, fb=0.38, k=4):
    """Dotted-eighth ping-pong echo."""
    out = np.zeros_like(x); src = x.copy()
    for i in range(1, k + 1):
        src = lp(src, 4000, 1) * fb
        sh = np.zeros_like(src)
        if d * i < n:
            sh[:, d * i:] = src[:, :n - d * i]
        out[(i + 1) % 2] += sh[0] + sh[1]
    return x + out * 0.5


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
                if k in SYNTH: x = SYNTH[k](hz(m), ln, vel)
                elif k == "swell": x = swell(ln, vel)
                else: x = hit(k, vel, m)
                place(buf, x, t)
    # sidechain: the kick ducks strings, piano and brass a little
    if "kick" in tracks:
        ke = np.abs(tracks["kick"][0])
        ke = signal.lfilter([1 - np.exp(-1 / (0.07 * SR))], [1, -np.exp(-1 / (0.07 * SR))], ke)
        duck = 1 - 0.45 * np.clip(ke / (ke.max() + 1e-9), 0, 1)
        for k in ("pad", "ep", "brass"):
            if k in tracks: tracks[k] *= duck
    t = np.arange(n) / SR
    if "pad" in tracks:
        tracks["pad"] = lp(tracks["pad"], 5200, 4)
        tracks["pad"] *= 1 + 0.06 * np.sin(2 * np.pi * 8 / LOOP * t)     # (whole cycles per loop)
    if "ep" in tracks:                                        # stereo tremolo, a beat per cycle pair
        tr = 0.2 * np.sin(2 * np.pi * (BPM / 60 / 2) * t)
        tracks["ep"] = np.stack([tracks["ep"][0] * (1 + tr), tracks["ep"][1] * (1 - tr)])
        tracks["ep"] = lp(tracks["ep"], 8000, 2)
    if "bass" in tracks:
        tracks["bass"] = lp(tracks["bass"], 2600, 2)
    d = int(0.75 * BEAT * SR)
    for k in ("lead", "lead2"):
        if k in tracks:
            tracks[k] = echo(tracks[k], n, d)
    dry = np.zeros((2, n)); wet = np.zeros((2, n))
    for k, x in tracks.items():
        x = pan(x, PAN.get(k, 0)) * GAIN.get(k, 1)
        dry += x
        wet += x * SEND.get(k, 0.2)
    # reverb: stereo decaying noise, darker with time, 1.9 s RT60, 18 ms pre-delay
    rng = np.random.default_rng(31)
    rt, ln = 1.9, int(2.4 * SR)
    ti = np.arange(ln) / SR
    irs = []
    for ch in range(2):
        nz = rng.normal(0, 1, ln)
        bright, dark = lp(nz, 8000, 2), lp(nz, 2200, 2)
        w = np.clip(ti / rt, 0, 1)
        ir = ((1 - w) * bright + w * dark) * np.exp(-ti * 6.9 / rt)
        ir = np.concatenate([np.zeros(int(0.018 * SR)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    wet = hp(wet, 200, 2)
    rev = np.stack([signal.oaconvolve(wet[0], irs[0])[:n], signal.oaconvolve(wet[1], irs[1])[:n]])
    mix = dry + rev * 0.5
    mix = hp(mix, 30, 2)
    return mix + 0.45 * hp(mix, 5000, 1)                      # air on top


def master(x, ref):
    x = x / ref
    return np.tanh(1.3 * x) / np.tanh(1.3) * 0.93


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
    meta.append(mido.MetaMessage("track_name", name="Runway Sunshine"))
    meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(BPM)))
    meta.append(mido.MetaMessage("time_signature", numerator=4, denominator=4))
    meta.append(mido.MetaMessage("key_signature", key="E"))
    parts = [("Strings", 0, 50, ["pad"]), ("Electric Piano", 1, 4, ["ep"]), ("Bells", 2, 9, ["bell"]),
             ("Slap Bass", 3, 36, ["bass"]), ("Lead", 4, 81, ["lead"]), ("Harmony", 5, 81, ["lead2"]),
             ("Synth Brass", 6, 62, ["brass"]),
             ("Drums", 9, 0, ["kick", "snare", "clap", "hat", "ohat", "shaker", "tom", "crash"])]
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
    tail = 2 * BAR + 2.5
    full = render([(0, S), (LOOP, S), (2 * LOOP, E)], 2 * LOOP + tail)
    full = master(full, ref)
    k = int(2 * LOOP * SR)
    tt = np.arange(full.shape[1] - k) / SR
    full[:, k:] *= np.clip(1 - tt / tail, 0, 1) ** 1.5
    full[:, :int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
    mp3(full, os.path.join(out, "menu_bgm_full.mp3"), 192)
    midi(S, os.path.join(HERE, "menu_bgm.mid"))


if __name__ == "__main__":
    main()
