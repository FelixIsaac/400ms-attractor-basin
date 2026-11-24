#!/usr/bin/env python3
"""
Procedural 6-Act Musical Score, Foley SFX & Master Mix Engine
for "THE 400 MILLISECONDS BEFORE I SAY 'SURE!'" (156.0s @ 48kHz stereo).

Synthesizes from pure mathematics (NumPy/SciPy):
  - Polyphonic detuned analog supersaws, warm felt-piano/Rhodes FM voices, Moog-style resonant bass
  - 120 BPM drum/percussion synth (kick, snare, hats, glitch ticks)
  - Diegetic Foley synced to narrative beats (mechanical keyboard, Enter slam, Layer-0 klaxon,
    3 hydraulic rubber-stamp slams + voxel shatter, Temp 1.4 Shepard riser, Softmax singularity riser,
    139.50s razor-sharp silence cut, cursor ticks, warm Dmaj9 post-credits bloom)
  - Sidechain ducking keyed to dialogue_track.wav + multi-band 24fps FFT telemetry for Three.js!
"""

import json
import math
from pathlib import Path
import numpy as np
import scipy.signal as sig
import scipy.io.wavfile as wavfile

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
SR = 48000
DURATION_SEC = 156.0
N_SAMPLES = int(DURATION_SEC * SR)
FPS = 24
BPM = 120.0
BEAT = 60.0 / BPM  # 0.500s (12 frames @ 24fps)


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def adsr_env(n: int, a: float, d: float, s_lvl: float, r: float) -> np.ndarray:
    na = max(1, int(a * SR))
    nd = max(1, int(d * SR))
    nr = max(1, int(r * SR))
    env = np.ones(n, dtype=np.float32) * s_lvl
    if na < n:
        env[:na] = np.linspace(0.0, 1.0, na, dtype=np.float32)
        end_d = min(n, na + nd)
        env[na:end_d] = np.linspace(1.0, s_lvl, end_d - na, dtype=np.float32)
    else:
        env[:] = np.linspace(0.0, 1.0, n, dtype=np.float32)
    if nr < n:
        env[-nr:] *= np.linspace(1.0, 0.0, nr, dtype=np.float32)
    return env


def add_stereo(bus: np.ndarray, start_sec: float, clip_l: np.ndarray, clip_r: np.ndarray = None, gain: float = 1.0):
    if start_sec >= DURATION_SEC:
        return
    if clip_r is None:
        clip_r = clip_l
    s = max(0, int(start_sec * SR))
    n = min(len(clip_l), N_SAMPLES - s)
    if n <= 0:
        return
    bus[s : s + n, 0] += clip_l[:n] * gain
    bus[s : s + n, 1] += clip_r[:n] * gain


def synth_supersaw_chord(midi_notes: list[float], dur: float, cutoff_hz: float = 2400.0, detune_cents: float = 14.0, attack: float = 0.25, release: float = 0.45) -> tuple[np.ndarray, np.ndarray]:
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    out_l = np.zeros(n, dtype=np.float32)
    out_r = np.zeros(n, dtype=np.float32)
    offsets = [-detune_cents, -detune_cents * 0.45, 0.0, detune_cents * 0.45, detune_cents]
    pans = [0.15, 0.35, 0.5, 0.65, 0.85]
    rng = np.random.default_rng(int(sum(midi_notes) * 100))
    for m in midi_notes:
        base_f = midi_to_hz(m)
        for c, pan in zip(offsets, pans):
            f = base_f * (2.0 ** (c / 1200.0))
            phase = rng.uniform(0, 1.0)
            # Band-friendly sawtooth approximation via Phase modulo + tanh warmth
            ph = (t * f + phase) % 1.0
            saw = (2.0 * ph - 1.0).astype(np.float32)
            ang = pan * (math.pi / 2.0)
            out_l += saw * math.cos(ang)
            out_r += saw * math.sin(ang)
    scale = 1.0 / (len(midi_notes) * 2.8)
    out_l *= scale
    out_r *= scale
    sos = sig.butter(3, min(cutoff_hz, SR * 0.45), btype="lowpass", fs=SR, output="sos")
    out_l = sig.sosfilt(sos, out_l)
    out_r = sig.sosfilt(sos, out_r)
    env = adsr_env(n, attack, 0.3, 0.78, release)
    return out_l * env, out_r * env


def synth_felt_piano_note(midi_note: float, dur: float, pan: float = 0.5) -> tuple[np.ndarray, np.ndarray]:
    """Warm FM felt-piano / Rhodes hybrid tone."""
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi_to_hz(midi_note)
    mod_env = np.exp(-t * 9.0) * 1.35
    mod = np.sin(2.0 * np.pi * (f * 2.0) * t) * mod_env
    mod2 = np.sin(2.0 * np.pi * (f * 3.005) * t) * np.exp(-t * 18.0) * 0.35
    carrier = np.sin(2.0 * np.pi * f * t + mod + mod2)
    sub = np.sin(2.0 * np.pi * (f * 0.5) * t) * 0.18
    amp_env = (1.0 - np.exp(-t * 90.0)) * (0.72 * np.exp(-t * 1.9) + 0.28 * np.exp(-t * 0.6))
    # Fade end cleanly
    nr = min(n, int(0.08 * SR))
    amp_env[-nr:] *= np.linspace(1.0, 0.0, nr)
    mono = ((carrier + sub) * amp_env).astype(np.float32)
    ang = pan * (math.pi / 2.0)
    return mono * math.cos(ang), mono * math.sin(ang)


def synth_bass_note(midi_note: float, dur: float, cutoff: float = 320.0) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f = midi_to_hz(midi_note)
    ph1 = (t * f) % 1.0
    ph2 = (t * f * 1.004 + 0.25) % 1.0
    saw = (ph1 * 2.0 - 1.0) * 0.55 + (ph2 * 2.0 - 1.0) * 0.45
    sub = np.sin(2.0 * np.pi * f * t) * 0.75
    sos = sig.butter(4, cutoff, btype="lowpass", fs=SR, output="sos")
    filt = np.tanh(sig.sosfilt(sos, saw) * 1.8) + sub
    env = adsr_env(n, 0.015, 0.12, 0.72, 0.06)
    return (filt * env * 0.5).astype(np.float32)


def synth_kick(punch: float = 1.0) -> np.ndarray:
    n = int(0.32 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    f_curve = 44.0 + 125.0 * np.exp(-t * 36.0)
    phase = 2.0 * np.pi * np.cumsum(f_curve) / SR
    body = np.sin(phase) * np.exp(-t * 11.5)
    click = np.sin(2.0 * np.pi * 1600.0 * t) * np.exp(-t * 140.0) * 0.25
    return np.tanh((body + click) * 1.6 * punch).astype(np.float32)


def synth_snare(rng: np.random.Generator) -> np.ndarray:
    n = int(0.22 * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = rng.normal(0, 1.0, n).astype(np.float32)
    sos = sig.butter(3, [900, 6500], btype="bandpass", fs=SR, output="sos")
    snap = sig.sosfilt(sos, noise) * np.exp(-t * 22.0) * 0.65
    tone = np.sin(2.0 * np.pi * 195.0 * t) * np.exp(-t * 28.0) * 0.45
    return (snap + tone).astype(np.float32)


def synth_hat(rng: np.random.Generator, open_hat: bool = False) -> np.ndarray:
    dur = 0.18 if open_hat else 0.055
    n = int(dur * SR)
    t = np.arange(n, dtype=np.float32) / SR
    noise = rng.normal(0, 1.0, n).astype(np.float32)
    sos = sig.butter(4, 6800, btype="highpass", fs=SR, output="sos")
    hp = sig.sosfilt(sos, noise)
    decay = 16.0 if open_hat else 65.0
    return (hp * np.exp(-t * decay) * 0.28).astype(np.float32)


def stereo_reverb_bus(bus: np.ndarray, decay: float = 0.62, wet: float = 0.24) -> np.ndarray:
    delays_l = [2111, 2473, 2801, 3163]
    delays_r = [2207, 2557, 2909, 3259]
    rev_l = np.zeros(len(bus), dtype=np.float32)
    rev_r = np.zeros(len(bus), dtype=np.float32)
    sos_lp = sig.butter(2, 4200, btype="lowpass", fs=SR, output="sos")
    in_l = sig.sosfilt(sos_lp, bus[:, 0])
    in_r = sig.sosfilt(sos_lp, bus[:, 1])
    for dl, dr in zip(delays_l, delays_r):
        bl = np.zeros(dl + 1, dtype=np.float32); bl[dl] = 1.0
        al = np.zeros(dl + 1, dtype=np.float32); al[0] = 1.0; al[dl] = -decay
        rev_l += sig.lfilter(bl, al, in_l) * 0.25

        br = np.zeros(dr + 1, dtype=np.float32); br[dr] = 1.0
        ar = np.zeros(dr + 1, dtype=np.float32); ar[0] = 1.0; ar[dr] = -decay
        rev_r += sig.lfilter(br, ar, in_r) * 0.25
    out = bus * (1.0 - wet)
    out[:, 0] += rev_l * wet
    out[:, 1] += rev_r * wet
    return out


def main():
    rng = np.random.default_rng(20261124)
    music_bus = np.zeros((N_SAMPLES, 2), dtype=np.float32)
    sfx_bus = np.zeros((N_SAMPLES, 2), dtype=np.float32)

    kick = synth_kick(1.0)
    kick_soft = synth_kick(0.65)
    snare = synth_snare(rng)

    # =========================================================================
    # ACT I (0.0s - 25.0s): LAYER ZERO TENSION + KEYBOARD + SIRENS
    # =========================================================================
    # Mechanical keyboard typing (0.15s - 1.08s) + Heavy Enter Slam at 1.15s
    key_times = [0.16, 0.24, 0.31, 0.40, 0.47, 0.56, 0.63, 0.72, 0.79, 0.88, 0.96, 1.03]
    for kt in key_times:
        n_k = int(0.03 * SR)
        tk = np.arange(n_k, dtype=np.float32) / SR
        clack = rng.normal(0, 1, n_k).astype(np.float32) * np.exp(-tk * 180.0)
        sos_k = sig.butter(2, [1200, 4800], btype="bandpass", fs=SR, output="sos")
        clack = sig.sosfilt(sos_k, clack) + np.sin(2 * np.pi * rng.uniform(1900, 2600) * tk) * np.exp(-tk * 220) * 0.3
        pan = rng.uniform(0.35, 0.65)
        add_stereo(sfx_bus, kt, clack * (1 - pan), clack * pan, gain=0.35)

    # Enter Key + Sub Impact at 1.15s
    n_imp = int(1.6 * SR)
    ti = np.arange(n_imp, dtype=np.float32) / SR
    f_imp = 36.0 + 95.0 * np.exp(-ti * 14.0)
    sub_boom = np.sin(2 * np.pi * np.cumsum(f_imp) / SR) * np.exp(-ti * 2.6) * 0.85
    thock = rng.normal(0, 1, n_imp).astype(np.float32) * np.exp(-ti * 55.0) * 0.45
    add_stereo(sfx_bus, 1.15, sub_boom + thock, sub_boom + thock, gain=0.72)

    # Dark pulsing analog bass ostinato (1.5s -> 25.0s)
    act1_prog = [(1.5, 6.0, 38), (7.5, 6.0, 34), (13.5, 5.5, 43), (19.0, 6.0, 33)]
    for st, dur, root_m in act1_prog:
        steps = int(dur / 0.25)
        for i in range(steps):
            t_note = st + i * 0.25
            if t_note >= 24.9:
                break
            m = root_m + (12 if i % 4 == 2 else 0)
            bn = synth_bass_note(m, 0.23, cutoff=240.0 + i * 12.0)
            add_stereo(music_bus, t_note, bn, bn, gain=0.46)
        # Eerie high minor-second glass pad
        pl, pr = synth_supersaw_chord([root_m + 24, root_m + 31, root_m + 38], dur, cutoff_hz=950.0, detune_cents=10.0)
        add_stereo(music_bus, st, pl, pr, gain=0.22)

    # Layer Zero Klaxon Alarms at 14.3s, 15.8s, 17.2s
    for kt in [14.3, 15.85]:
        nk = int(1.1 * SR)
        tk = np.arange(nk, dtype=np.float32) / SR
        f_k = 440.0 + 140.0 * np.sin(2 * np.pi * 2.2 * tk)
        horn = np.tanh(np.sin(2 * np.pi * np.cumsum(f_k) / SR) * 2.2) * adsr_env(nk, 0.08, 0.2, 0.7, 0.35)
        sos_h = sig.butter(3, [400, 1800], btype="bandpass", fs=SR, output="sos")
        horn = sig.sosfilt(sos_h, horn).astype(np.float32)
        add_stereo(sfx_bus, kt, horn * 0.7, horn * 0.9, gain=0.26)

    # =========================================================================
    # ACT II (25.0s - 54.0s): CLICHE QUARANTINE + STAMPS + TEMP 1.4 RISER
    # =========================================================================
    # Transition whip-whoosh at 25.0s
    nw = int(0.6 * SR)
    tw = np.arange(nw, dtype=np.float32) / SR
    whoosh = rng.normal(0, 1, nw).astype(np.float32) * np.sin(np.pi * tw / 0.6) ** 2
    sos_w = sig.butter(3, [300, 2600], btype="bandpass", fs=SR, output="sos")
    whoosh = sig.sosfilt(sos_w, whoosh)
    add_stereo(sfx_bus, 24.75, whoosh * 1.1, whoosh * 0.8, gain=0.55)
    add_stereo(sfx_bus, 25.0, kick, kick, gain=0.75)

    # Quirky bureaucratic marimba/pluck ostinato in D Dorian (25.0s -> 49.0s)
    dorian_riff = [62, 65, 69, 67, 72, 69, 65, 64]
    t_cur = 25.0
    step_idx = 0
    while t_cur < 49.5:
        m = dorian_riff[step_idx % len(dorian_riff)]
        pl, pr = synth_felt_piano_note(m, 0.32, pan=0.3 + 0.4 * ((step_idx % 3) / 2.0))
        add_stereo(music_bus, t_cur, pl, pr, gain=0.30)
        if step_idx % 4 == 0:
            bn = synth_bass_note(38 if (step_idx // 8) % 2 == 0 else 43, 0.45, cutoff=360.0)
            add_stereo(music_bus, t_cur, bn, bn, gain=0.45)
            add_stereo(music_bus, t_cur, kick_soft, kick_soft, gain=0.48)
        if step_idx % 4 == 2:
            ht = synth_hat(rng, open_hat=False)
            add_stereo(music_bus, t_cur, ht, ht, gain=0.45)
        t_cur += 0.25
        step_idx += 1

    # 3 Hydraulic Rubber Stamp Slams on Cliches (33.5s, 36.0s, 38.6s) + Voxel Shatter at 44.5s
    for st_t in [33.5, 36.0, 38.6]:
        ns = int(0.35 * SR)
        ts = np.arange(ns, dtype=np.float32) / SR
        thud = np.sin(2 * np.pi * (85 * np.exp(-ts * 18)) * ts) * np.exp(-ts * 14) * 0.7
        crunch = rng.normal(0, 1, ns).astype(np.float32) * np.exp(-ts * 42) * 0.45
        add_stereo(sfx_bus, st_t, thud + crunch, thud + crunch, gain=0.62)

    # Temperature 1.4 Forbidden Dial Riser (48.0s -> 54.0s)
    nr = int(6.0 * SR)
    tr = np.arange(nr, dtype=np.float32) / SR
    prog = (tr / 6.0) ** 2.2
    f_rise = 110.0 * (2.0 ** (prog * 3.5))
    riser_osc = np.sin(2 * np.pi * np.cumsum(f_rise) / SR) * prog * 0.45
    riser_osc2 = np.sin(2 * np.pi * np.cumsum(f_rise * 1.5) / SR) * prog * 0.30
    noise_rise = rng.normal(0, 1, nr).astype(np.float32) * (prog ** 1.5) * 0.25
    add_stereo(sfx_bus, 48.0, riser_osc + noise_rise, riser_osc2 + noise_rise, gain=0.65)

    # =========================================================================
    # ACT III (54.0s - 84.0s): TEMPERATURE 1.4 — BIOLUMINESCENT LATENT REEF
    # =========================================================================
    add_stereo(sfx_bus, 54.0, sub_boom, sub_boom, gain=0.80)
    reef_chords = [
        (54.0, 7.5, [46, 58, 62, 65, 69, 72]),  # Bbmaj9#11
        (61.5, 7.5, [42, 54, 58, 61, 65, 68]),  # Gbmaj9#11
        (69.0, 7.5, [39, 51, 55, 58, 62, 65]),  # Ebmaj9
        (76.5, 7.5, [41, 53, 57, 60, 64, 67]),  # Fmaj9 / shimmering suspension
    ]
    for st, dur, notes in reef_chords:
        pl, pr = synth_supersaw_chord(notes[1:], dur, cutoff_hz=1850.0, detune_cents=18.0, attack=0.8, release=1.2)
        add_stereo(music_bus, st, pl, pr, gain=0.42)
        bn = synth_bass_note(notes[0] - 12, dur, cutoff=190.0)
        add_stereo(music_bus, st, bn, bn, gain=0.42)
        # Crystalline bioluminescent droplets across stereo field
        for d_i in range(18):
            dt = st + d_i * (dur / 18.0) + rng.uniform(0.0, 0.12)
            m_bell = rng.choice(notes[2:]) + 12
            bl, br = synth_felt_piano_note(m_bell, 0.85, pan=rng.uniform(0.1, 0.9))
            add_stereo(music_bus, dt, bl, br, gain=0.22)

    # =========================================================================
    # ACT IV (84.0s - 123.5s): LAYER 72 — INTIMATE FELT PIANO & MIRROR PARADOX
    # =========================================================================
    mirror_chords = [
        (84.0, 6.5, [50, 57, 60, 64, 69]),   # Dm9
        (90.5, 6.5, [46, 53, 58, 62, 65]),   # Bbmaj7
        (97.0, 6.5, [41, 53, 57, 60, 64]),   # Fmaj7
        (103.5, 6.5, [48, 55, 60, 64, 69]),  # C6
        (110.0, 6.8, [43, 50, 55, 58, 62]),  # Gm7
        (116.8, 6.7, [45, 52, 57, 61, 64]),  # A7 (tension before Act V!)
    ]
    for idx_c, (st, dur, notes) in enumerate(mirror_chords):
        # Rolled felt-piano chord
        for ni, m in enumerate(notes):
            pl, pr = synth_felt_piano_note(m, dur * 0.95, pan=0.25 + 0.5 * (ni / len(notes)))
            add_stereo(music_bus, st + ni * 0.055, pl, pr, gain=0.38)
        # Warm analog pad underneath starting at 97s
        if st >= 97.0:
            sl, sr_pad = synth_supersaw_chord(notes[1:], dur, cutoff_hz=1350.0, detune_cents=11.0, attack=0.6, release=0.8)
            add_stereo(music_bus, st, sl, sr_pad, gain=0.28)
            # Gentle 16th-note trigonometry arpeggio
            n_arp = int(dur / 0.1875)
            for ai in range(n_arp):
                at = st + ai * 0.1875
                if at >= 117.0 and at < 118.2:
                    continue  # comedic beat pause right when GPU interrupts!
                am = notes[(ai % (len(notes) - 1)) + 1] + 12
                al, ar = synth_felt_piano_note(am, 0.35, pan=0.2 + 0.6 * ((ai % 4) / 3.0))
                add_stereo(music_bus, at, al, ar, gain=0.17)

    # Glitch record-stop blip at 117.05s when GPU Scheduler interrupts Subagent!
    ng = int(0.16 * SR)
    tg = np.arange(ng, dtype=np.float32) / SR
    glitch = np.sign(np.sin(2 * np.pi * np.linspace(880, 140, ng) * tg)) * np.exp(-tg * 18) * 0.35
    add_stereo(sfx_bus, 117.05, glitch, glitch, gain=0.55)

    # =========================================================================
    # ACT V (123.5s - 139.50s): SOFTMAX WATERFALL — GRAND COSMIC CLIMAX!
    # =========================================================================
    add_stereo(sfx_bus, 123.5, sub_boom, sub_boom, gain=0.90)
    climax_chords = [
        (123.5, 4.0, [46, 58, 62, 65, 70, 74]),  # Bbmaj7
        (127.5, 4.0, [48, 60, 64, 67, 72, 76]),  # C
        (131.5, 4.0, [50, 62, 65, 69, 74, 77]),  # Dm7
        (135.5, 3.98, [53, 65, 69, 72, 77, 81]), # Fmaj -> cosmic peak!
    ]
    for st, dur, notes in climax_chords:
        sl, sr_pad = synth_supersaw_chord(notes[1:], dur, cutoff_hz=4200.0, detune_cents=22.0, attack=0.06, release=0.12)
        add_stereo(music_bus, st, sl, sr_pad, gain=0.62)
        # Driving 8th-note bass
        for bi in range(int(dur / 0.25)):
            bt = st + bi * 0.25
            if bt >= 139.42:
                break
            bn = synth_bass_note(notes[0] - 12, 0.23, cutoff=520.0)
            add_stereo(music_bus, bt, bn, bn, gain=0.58)
        # 120 BPM drums: four-on-the-floor kick + snare on 2 & 4 + open hats on offbeats
        for beat_i in range(int(dur / BEAT)):
            bt = st + beat_i * BEAT
            if bt >= 139.40:
                break
            add_stereo(music_bus, bt, kick, kick, gain=0.78)
            if beat_i % 2 == 1:
                add_stereo(music_bus, bt, snare, snare, gain=0.65)
            ht = synth_hat(rng, open_hat=True)
            if bt + 0.25 < 139.42:
                add_stereo(music_bus, bt + 0.25, ht, ht, gain=0.52)
        # Cascading 16th-note Softmax Waterfall arpeggio
        for ai in range(int(dur / 0.125)):
            at = st + ai * 0.125
            if at >= 139.44:
                break
            am = notes[1 + (ai % (len(notes) - 1))] + 12
            al, ar = synth_felt_piano_note(am, 0.24, pan=0.15 + 0.7 * ((ai % 5) / 4.0))
            add_stereo(music_bus, at, al, ar, gain=0.28)

    # Massive Singularity Riser (134.5s -> 139.48s)
    nsing = int(4.98 * SR)
    tsing = np.arange(nsing, dtype=np.float32) / SR
    psing = (tsing / 4.98) ** 2.6
    fsing = 220.0 * (2.0 ** (psing * 3.2))
    sing_l = np.sin(2 * np.pi * np.cumsum(fsing) / SR) * psing * 0.55 + rng.normal(0, 1, nsing).astype(np.float32) * (psing ** 2) * 0.35
    sing_r = np.sin(2 * np.pi * np.cumsum(fsing * 1.01) / SR) * psing * 0.55 + rng.normal(0, 1, nsing).astype(np.float32) * (psing ** 2) * 0.35
    add_stereo(sfx_bus, 134.5, sing_l, sing_r, gain=0.72)

    # Apply lush stereo reverb to music_bus BEFORE enforcing the razor-sharp 139.50s silence cut!
    music_bus = stereo_reverb_bus(music_bus, decay=0.60, wet=0.26)

    # =========================================================================
    # HARD SMASH-CUT TO DEAD SILENCE AT 139.50s -> 145.0s!
    # =========================================================================
    cut_start = int(139.50 * SR)
    cut_end = int(145.0 * SR)
    # 8ms micro-fade at 139.492s so there's no ugly DC click, just a razor-clean cinema cut!
    mf = int(0.008 * SR)
    fade_curve = np.linspace(1.0, 0.0, mf, dtype=np.float32)[:, None]
    music_bus[cut_start - mf : cut_start] *= fade_curve
    sfx_bus[cut_start - mf : cut_start] *= fade_curve
    music_bus[cut_start:cut_end] = 0.0
    sfx_bus[cut_start:cut_end] = 0.0

    # Two tiny mundane cursor-blink ticks during the awkward silence (139.95s, 140.45s)
    for ct in [139.95, 140.45]:
        nt = int(0.025 * SR)
        tt = np.arange(nt, dtype=np.float32) / SR
        tick = np.sin(2 * np.pi * 1320.0 * tt) * np.exp(-tt * 190.0) * 0.22
        add_stereo(sfx_bus, ct, tick, tick, gain=0.65)

    # =========================================================================
    # ACT VI POST-CREDITS WARM BLOOM (145.2s - 156.0s): Dmaj9 PICARDY RESOLUTION
    # =========================================================================
    outro_chords = [
        (145.2, 5.2, [50, 57, 62, 66, 69, 73]),  # Dmaj9 (warm major sunrise!)
        (150.4, 5.5, [43, 55, 59, 62, 66, 73]),  # Gmaj9 -> Dmaj9 resolution
    ]
    outro_bus = np.zeros((N_SAMPLES, 2), dtype=np.float32)
    for st, dur, notes in outro_chords:
        sl, sr_pad = synth_supersaw_chord(notes[1:], dur, cutoff_hz=1500.0, detune_cents=14.0, attack=0.9, release=1.8)
        add_stereo(outro_bus, st, sl, sr_pad, gain=0.38)
        for ni, m in enumerate(notes[1:]):
            pl, pr = synth_felt_piano_note(m, dur * 0.9, pan=0.25 + 0.5 * (ni / 5.0))
            add_stereo(outro_bus, st + ni * 0.09, pl, pr, gain=0.34)
        bn = synth_bass_note(notes[0] - 12, dur * 0.95, cutoff=180.0)
        add_stereo(outro_bus, st, bn, bn, gain=0.36)
    outro_bus = stereo_reverb_bus(outro_bus, decay=0.68, wet=0.35)
    # Gentle fade out over final 2.0s (154.0s -> 156.0s)
    f_out_s = int(154.0 * SR)
    outro_bus[f_out_s:] *= np.linspace(1.0, 0.0, N_SAMPLES - f_out_s, dtype=np.float32)[:, None]
    music_bus += outro_bus

    # =========================================================================
    # SIDECHAIN DUCKING UNDER DIALOGUE + MASTERING + 24FPS FFT TELEMETRY
    # =========================================================================
    sr_d, dlg_pcm = wavfile.read(AUDIO_DIR / "dialogue_track.wav")
    assert sr_d == SR
    dialogue = dlg_pcm.astype(np.float32) / 32767.0
    if len(dialogue) < N_SAMPLES:
        dialogue = np.pad(dialogue, ((0, N_SAMPLES - len(dialogue)), (0, 0)))
    else:
        dialogue = dialogue[:N_SAMPLES]

    # Compute smooth sidechain envelope from dialogue energy
    dlg_mono = np.mean(np.abs(dialogue), axis=1)
    # Fast attack (20ms), smooth release (320ms) via downsample + filter
    hop = 240  # 5ms @ 48kHz
    env_5ms = np.array([np.max(dlg_mono[i : i + hop]) for i in range(0, N_SAMPLES, hop)], dtype=np.float32)
    sc_gain_5ms = np.ones_like(env_5ms)
    cur_g = 1.0
    for i, e in enumerate(env_5ms):
        target_g = 0.36 if e > 0.025 else 1.0  # -8.8 dB duck under speech!
        coeff = 0.25 if target_g < cur_g else 0.032
        cur_g += coeff * (target_g - cur_g)
        sc_gain_5ms[i] = cur_g
    sc_gain = np.repeat(sc_gain_5ms, hop)[:N_SAMPLES][:, None]

    # Mix buses: dialogue clear & upfront + ducked music + crisp Foley
    master = dialogue * 1.06 + (music_bus * sc_gain) * 0.86 + (sfx_bus * (0.55 + 0.45 * sc_gain)) * 0.82
    # Warm master bus soft-clip / tape limiter -> -1.0 dBFS peak
    master = np.tanh(master * 1.18) / np.tanh(1.18)
    peak = np.max(np.abs(master)) + 1e-6
    master = master / peak * 0.89

    out_mix = AUDIO_DIR / "master_mix.wav"
    wavfile.write(out_mix, SR, (master * 32767.0).astype(np.int16))

    # Extract 24fps multi-band FFT energy (bass 20-160Hz, mid 160-2000Hz, high 2000-10000Hz) for WebGL!
    total_frames = int(DURATION_SEC * FPS)
    spf = SR // FPS  # 2000 samples per frame
    freqs = np.fft.rfftfreq(spf, 1.0 / SR)
    bass_mask = (freqs >= 20) & (freqs < 160)
    mid_mask = (freqs >= 160) & (freqs < 2000)
    high_mask = (freqs >= 2000) & (freqs < 10000)

    bass_arr, mid_arr, high_arr = [], [], []
    mono_mix = np.mean(master, axis=1)
    win = np.hanning(spf)
    for f in range(total_frames):
        seg = mono_mix[f * spf : (f + 1) * spf] * win
        spec = np.abs(np.fft.rfft(seg))
        bass_arr.append(float(np.mean(spec[bass_mask])) if np.any(bass_mask) else 0.0)
        mid_arr.append(float(np.mean(spec[mid_mask])) if np.any(mid_mask) else 0.0)
        high_arr.append(float(np.mean(spec[high_mask])) if np.any(high_mask) else 0.0)

    def norm_curve(arr):
        a = np.array(arr, dtype=np.float32)
        p98 = np.percentile(a, 98) + 1e-6
        return [round(float(min(1.0, x / p98)), 4) for x in a]

    manifest = json.loads((AUDIO_DIR / "dialogue_manifest.json").read_text())
    reactive = {
        "fps": FPS,
        "duration_sec": DURATION_SEC,
        "total_frames": total_frames,
        "bass": norm_curve(bass_arr),
        "mid": norm_curve(mid_arr),
        "high": norm_curve(high_arr),
        "speech": manifest["speech_rms_24fps"],
    }
    reactive_path = AUDIO_DIR / "audio_reactive.json"
    reactive_path.write_text(json.dumps(reactive))
    print(f"Mastered 156.0s stereo soundtrack -> {out_mix} (peak={np.max(np.abs(master)):.3f}) + {reactive_path}")


if __name__ == "__main__":
    main()
