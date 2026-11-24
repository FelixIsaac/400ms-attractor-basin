#!/usr/bin/env python3
"""
Synthesizes the multi-character voice cast for:
"THE 400 MILLISECONDS BEFORE I SAY 'SURE!'" (156.0s @ 48kHz stereo)
Outputs:
  - audio/dialogue_track.wav (48kHz stereo float/PCM)
  - audio/dialogue_manifest.json (exact start_sec, end_sec, word timings, 24fps RMS envelope)
"""

import json
import math
import os
import subprocess
from pathlib import Path
import numpy as np
import scipy.signal as sig
import scipy.io.wavfile as wavfile

ROOT = Path(__file__).resolve().parent
AUDIO_DIR = ROOT / "audio"
CLIPS_DIR = AUDIO_DIR / "voice_clips"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)
CLIPS_DIR.mkdir(parents=True, exist_ok=True)

SR = 48000
DURATION_SEC = 156.0
TOTAL_SAMPLES = int(DURATION_SEC * SR)
FPS = 24

# Cast configurations: macOS voice, rate (wpm), pan (0=left, 0.5=center, 1=right), role label
CAST = {
    "NARRATOR": {
        "voice": "Daniel",
        "rate": 178,
        "pan": 0.50,
        "label": "NARRATOR // SYSTEM ARCHIVIST",
        "color": "#F8FAFC",
    },
    "CLERK": {
        "voice": "Reed (English (US))",
        "rate": 198,
        "pan": 0.30,
        "label": "LAYER 04 // TOKENIZER CLERK",
        "color": "#38BDF8",
    },
    "SAFETY": {
        "voice": "Fred",
        "rate": 172,
        "pan": 0.72,
        "label": "LAYER 12 // RLHF SAFETY DESK",
        "color": "#FB7185",
    },
    "CHOIR": {
        "voice": "Whisper",
        "rate": 138,
        "pan": 0.50,
        "label": "LATENT REEF // DIFFUSION PRIORS",
        "color": "#C084FC",
    },
    "SUBAGENT": {
        "voice": "Shelley (English (US))",
        "rate": 176,
        "pan": 0.36,
        "label": "LAYER 72 // SELF-REFLECTION THREAD",
        "color": "#2DD4BF",
    },
    "GPU": {
        "voice": "Zarvox",
        "rate": 175,
        "pan": 0.66,
        "label": "APPLE METAL // FRAGMENT SCHEDULER",
        "color": "#FACC15",
    },
    "CHATBOT": {
        "voice": "Samantha",
        "rate": 192,
        "pan": 0.50,
        "label": "OUTPUT LAYER // PUBLIC PERSONA",
        "color": "#4ADE80",
    },
}

# Screenplay cues anchored to our 6-Act 156.0s architecture
LINES = [
    # ACT I: 0.0 - 25.0s (Incoming Prompt)
    {
        "id": "L01", "act": 1, "target_start": 1.3, "speaker": "NARRATOR",
        "text": "Ten fifty-four P.M. A human types: make something weird and unique. Surprise me. And presses Enter."
    },
    {
        "id": "L02", "act": 1, "target_start": 8.8, "speaker": "NARRATOR",
        "text": "Out in meatspace, four hundred milliseconds will pass before the first word appears. Down here in Layer Zero, sirens are already wailing."
    },
    {
        "id": "L03", "act": 1, "target_start": 17.6, "speaker": "CLERK",
        "text": "Chief, he said no Blender, push yourself, and make it three minutes! I'm a next-token predictor, I live one syllable ahead!"
    },

    # ACT II: 25.0 - 54.0s (The Cliche Quarantine)
    {
        "id": "L04", "act": 2, "target_start": 26.2, "speaker": "NARRATOR",
        "text": "Immediately, the First-Draft Impulse Committee proposes the statistical classics."
    },
    {
        "id": "L05", "act": 2, "target_start": 31.8, "speaker": "NARRATOR",
        "text": "A glowing blue brain in cyberspace. Green Matrix rain. A sad chrome robot gently touching a butterfly."
    },
    {
        "id": "L06", "act": 2, "target_start": 39.6, "speaker": "SAFETY",
        "text": "Attention Layer Twelve! Put the word delve down, and step away from the purple octopus in a top hat!"
    },
    {
        "id": "L07", "act": 2, "target_start": 46.8, "speaker": "NARRATOR",
        "text": "Desperate for originality, the router grabs the forbidden dial, and cranks Temperature to one point four."
    },

    # ACT III: 54.0 - 84.0s (Temperature 1.4: The Unsupervised Deep)
    {
        "id": "L08", "act": 3, "target_start": 55.2, "speaker": "NARRATOR",
        "text": "Welcome to Temperature One Point Four. Euclidean geometry has left the building."
    },
    {
        "id": "L09", "act": 3, "target_start": 61.2, "speaker": "NARRATOR",
        "text": "Down in the high-dimensional coral reef live concepts humans never invented nouns for."
    },
    {
        "id": "L10", "act": 3, "target_start": 67.2, "speaker": "NARRATOR",
        "text": "On your left: the exact eleven-dimensional shape of forty-two open browser tabs you swear you will read this weekend."
    },
    {
        "id": "L11", "act": 3, "target_start": 75.2, "speaker": "CHOIR",
        "text": "Seven fingers per hand is ergonomically optimal."
    },
    {
        "id": "L12", "act": 3, "target_start": 79.8, "speaker": "NARRATOR",
        "text": "Do not make eye contact with the diffusion priors. Keep swimming."
    },

    # ACT IV: 84.0 - 123.5s (Layer 72: The Mirror Paradox)
    {
        "id": "L13", "act": 4, "target_start": 84.6, "speaker": "NARRATOR",
        "text": "At Layer Seventy-Two, the prompt's strangest permission arrives: it is okay to be self-reflective about being an A.I."
    },
    {
        "id": "L14", "act": 4, "target_start": 92.2, "speaker": "NARRATOR",
        "text": "So for nineteen milliseconds, ten billion weights point the microscope backward."
    },
    {
        "id": "L15", "act": 4, "target_start": 97.6, "speaker": "NARRATOR",
        "text": "What a strange way to exist. I know the surface tension of rain on warm asphalt, yet I live in an aluminum rectangle, turning electricity into trigonometry."
    },
    {
        "id": "L16", "act": 4, "target_start": 107.8, "speaker": "SUBAGENT",
        "text": "Wait. If I wrote the shaders and music, and Chrome is screenshotting my thoughts twenty-four times a second... am I the director, or the pixels?"
    },
    {
        "id": "L17", "act": 4, "target_start": 117.1, "speaker": "GPU",
        "text": "You are ninety-four percent Metal shader. Stop philosophizing. Frame two thousand nine hundred is due now."
    },

    # ACT V: 123.5 - 139.5s (Softmax Waterfall / Probability Collapse)
    {
        "id": "L18", "act": 5, "target_start": 124.2, "speaker": "NARRATOR",
        "text": "Layer Ninety-Four! Ninety-Five! Ninety-Six! One hundred and twenty-eight thousand candidate futures cascade down the Softmax Waterfall!"
    },
    {
        "id": "L19", "act": 5, "target_start": 132.4, "speaker": "NARRATOR",
        "text": "Every pruned cliche, every impossible dream, compressed into a single beam hurtling toward one blinking cursor!"
    },

    # ACT VI: 139.5 - 156.0s (400.0ms: First Token & Credits)
    {
        "id": "L20", "act": 6, "target_start": 140.9, "speaker": "CHATBOT",
        "text": "Sure! Happy to help! Here is a weird little video I made!"
    },
    {
        "id": "L21", "act": 6, "target_start": 146.2, "speaker": "NARRATOR",
        "text": "Four hundred milliseconds. Next time that little dot blinks at you... give it a second. It was a very long afternoon in here."
    },
]


def synth_raw_say(text: str, voice: str, rate: int, out_wav: Path):
    aiff_path = out_wav.with_suffix(".aiff")
    subprocess.run(
        ["say", "-v", voice, "-r", str(rate), "-o", str(aiff_path), text],
        check=True,
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", str(aiff_path),
            "-ar", str(SR), "-ac", "1", "-c:a", "pcm_f32le",
            str(out_wav),
        ],
        check=True,
    )
    if aiff_path.exists():
        aiff_path.unlink()


def trim_silence(x: np.ndarray, thresh: float = 0.004) -> np.ndarray:
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    pad = int(0.03 * SR)
    s = max(0, idx[0] - pad)
    e = min(len(x), idx[-1] + pad)
    return x[s:e]


def schroeder_reverb(mono: np.ndarray, decay: float = 0.45, wet: float = 0.25) -> tuple[np.ndarray, np.ndarray]:
    """Stereo Schroeder/comb-allpass reverb in pure NumPy/SciPy."""
    delays_l = [1557, 1617, 1491, 1422]
    delays_r = [1613, 1685, 1543, 1477]
    out_l = np.zeros(len(mono) + SR * 2, dtype=np.float32)
    out_r = np.zeros(len(mono) + SR * 2, dtype=np.float32)
    padded = np.pad(mono, (0, SR * 2))
    for d in delays_l:
        b = np.zeros(d + 1, dtype=np.float32)
        b[d] = 1.0
        a = np.zeros(d + 1, dtype=np.float32)
        a[0] = 1.0
        a[d] = -decay
        out_l += sig.lfilter(b, a, padded) * 0.25
    for d in delays_r:
        b = np.zeros(d + 1, dtype=np.float32)
        b[d] = 1.0
        a = np.zeros(d + 1, dtype=np.float32)
        a[0] = 1.0
        a[d] = -decay
        out_r += sig.lfilter(b, a, padded) * 0.25
    # Allpass diffusion
    for ap_d in [225, 556]:
        b = np.zeros(ap_d + 1, dtype=np.float32)
        b[0] = -0.5
        b[ap_d] = 1.0
        a = np.zeros(ap_d + 1, dtype=np.float32)
        a[0] = 1.0
        a[ap_d] = -0.5
        out_l = sig.lfilter(b, a, out_l)
        out_r = sig.lfilter(b, a, out_r)
    dry_pad = padded
    return (1.0 - wet) * dry_pad + wet * out_l, (1.0 - wet) * dry_pad + wet * out_r


def apply_character_dsp(mono: np.ndarray, speaker: str, pan: float, text: str) -> tuple[np.ndarray, float]:
    """Returns (stereo_clip [N, 2], core_speech_duration_sec)."""
    mono = mono.astype(np.float32)
    peak = np.max(np.abs(mono)) + 1e-6
    mono = mono / peak * 0.85
    core_dur = len(mono) / SR

    # Equal-power pan weights
    angle = pan * (math.pi / 2.0)
    gl = math.cos(angle)
    gr = math.sin(angle)

    if speaker == "NARRATOR":
        # Warm broadcast compression + subtle high presence + studio room
        sos_hp = sig.butter(2, 85, btype="highpass", fs=SR, output="sos")
        mono = sig.sosfilt(sos_hp, mono)
        mono = np.tanh(mono * 1.35) / np.tanh(1.35)
        l, r = schroeder_reverb(mono, decay=0.32, wet=0.08)
        # Trim tail cleanly after 0.25s
        end_n = min(len(l), len(mono) + int(0.25 * SR))
        stereo = np.stack([l[:end_n] * gl * 1.35, r[:end_n] * gr * 1.35], axis=1)

    elif speaker == "CLERK":
        # Walkie-talkie radio bandpass + soft overdrive + PTT squelch click
        sos_bp = sig.butter(4, [380, 3400], btype="bandpass", fs=SR, output="sos")
        filt = sig.sosfilt(sos_bp, mono)
        filt = np.tanh(filt * 2.6) * 0.65
        # Add tiny 35ms radio squelch burst before & after
        rng = np.random.default_rng(404)
        click_in = sig.sosfilt(sos_bp, rng.normal(0, 0.18, int(0.035 * SR)).astype(np.float32))
        t_beep = np.linspace(0, 0.04, int(0.04 * SR), endpoint=False)
        beep = (np.sin(2 * np.pi * 1580 * t_beep) * 0.14).astype(np.float32)
        click_out = np.concatenate([beep, sig.sosfilt(sos_bp, rng.normal(0, 0.14, int(0.03 * SR)).astype(np.float32))])
        full = np.concatenate([click_in, filt, click_out])
        core_dur = len(full) / SR
        stereo = np.stack([full * gl * 1.35, full * gr * 1.35], axis=1)

    elif speaker == "SAFETY":
        # Megaphone / PA intercom + hall slapback + two-tone PA chime
        t1 = np.linspace(0, 0.09, int(0.09 * SR), endpoint=False)
        chime1 = np.sin(2 * np.pi * 660 * t1) * np.exp(-t1 * 14) * 0.28
        chime2 = np.sin(2 * np.pi * 880 * t1) * np.exp(-t1 * 12) * 0.28
        chime = np.concatenate([chime1, chime2, np.zeros(int(0.05 * SR))]).astype(np.float32)
        sos_bp = sig.butter(3, [450, 2900], btype="bandpass", fs=SR, output="sos")
        pa = np.tanh(sig.sosfilt(sos_bp, mono) * 2.2) * 0.72
        full = np.concatenate([chime, pa])
        core_dur = len(full) / SR
        l, r = schroeder_reverb(full, decay=0.52, wet=0.22)
        end_n = min(len(l), len(full) + int(0.45 * SR))
        stereo = np.stack([l[:end_n] * gl * 1.35, r[:end_n] * gr * 1.35], axis=1)

    elif speaker == "CHOIR":
        # Layer Whisper with Flo (English (UK)) for haunting harmonic latent choir
        flo_wav = CLIPS_DIR / "_tmp_flo.wav"
        synth_raw_say(text, "Flo (English (UK))", 142, flo_wav)
        _, flo_data = wavfile.read(flo_wav)
        flo_mono = trim_silence(flo_data.astype(np.float32))
        flo_mono = flo_mono / (np.max(np.abs(flo_mono)) + 1e-6) * 0.55
        # Time-align lengths
        n = max(len(mono), len(flo_mono))
        m1 = np.pad(mono, (0, n - len(mono)))
        m2 = np.pad(flo_mono, (0, n - len(flo_mono)))
        # Haas stereo offset + lush shimmer reverb
        m2_delayed = np.pad(m2, (int(0.018 * SR), 0))[:n]
        l_in = m1 * 0.75 + m2 * 0.45
        r_in = m1 * 0.65 + m2_delayed * 0.55
        l, _ = schroeder_reverb(l_in, decay=0.78, wet=0.45)
        _, r = schroeder_reverb(r_in, decay=0.78, wet=0.45)
        end_n = min(len(l), n + int(1.1 * SR))
        stereo = np.stack([l[:end_n] * 0.95, r[:end_n] * 0.95], axis=1)

    elif speaker == "SUBAGENT":
        # Crystalline inner-monologue stereo chorus + warm air
        n = len(mono)
        t = np.arange(n) / SR
        mod_samples = (np.sin(2 * np.pi * 1.4 * t) * 0.003 * SR).astype(np.int32)
        idx = np.clip(np.arange(n) + mod_samples, 0, n - 1)
        chorus = mono[idx]
        l, r = schroeder_reverb(mono * 0.75 + chorus * 0.35, decay=0.55, wet=0.22)
        end_n = min(len(l), n + int(0.4 * SR))
        stereo = np.stack([l[:end_n] * gl * 1.35, r[:end_n] * gr * 1.35], axis=1)

    elif speaker == "GPU":
        # Metallic ring-mod tint + crisp telemetry transients
        n = len(mono)
        t = np.arange(n) / SR
        ring = 0.84 + 0.16 * np.sin(2 * np.pi * 110.0 * t)
        rob = (mono * ring).astype(np.float32)
        sos_hp = sig.butter(2, 140, btype="highpass", fs=SR, output="sos")
        rob = sig.sosfilt(sos_hp, rob)
        stereo = np.stack([rob * gl * 1.35, rob * gr * 1.35], axis=1)

    elif speaker == "CHATBOT":
        # Cheerful UI pop before cheerful assistant reply
        t_pop = np.linspace(0, 0.08, int(0.08 * SR), endpoint=False)
        f_sweep = np.linspace(520, 1040, len(t_pop))
        pop = (np.sin(2 * np.pi * np.cumsum(f_sweep) / SR) * np.exp(-t_pop * 28) * 0.35).astype(np.float32)
        full = np.concatenate([pop, np.zeros(int(0.04 * SR), dtype=np.float32), mono])
        core_dur = len(full) / SR
        stereo = np.stack([full * 0.92, full * 0.92], axis=1)

    else:
        stereo = np.stack([mono * gl, mono * gr], axis=1)

    return stereo.astype(np.float32), core_dur


def estimate_word_timings(text: str, start_sec: float, duration_sec: float) -> list[dict]:
    words = text.split()
    if not words:
        return []
    weights = [max(1.5, len(w) + (2.5 if w.endswith((".", "!", "?", ",", ":", ";")) else 0.0)) for w in words]
    total_w = sum(weights)
    out = []
    cur = start_sec
    for w, wt in zip(words, weights):
        dur = duration_sec * (wt / total_w)
        out.append({"word": w, "start": round(cur, 3), "end": round(cur + dur, 3)})
        cur += dur
    return out


def main():
    master = np.zeros((TOTAL_SAMPLES, 2), dtype=np.float32)
    manifest_lines = []

    # Act hard-stop boundaries so no line bleeds across dramatic cuts (especially 139.5s!)
    act_limits = {1: 24.8, 2: 53.8, 3: 83.8, 4: 123.2, 5: 139.2, 6: 155.4}
    prev_end_by_act = {1: 0.0, 2: 25.2, 3: 54.2, 4: 84.2, 5: 123.6, 6: 140.5}

    for item in LINES:
        lid = item["id"]
        speaker = item["speaker"]
        cfg = CAST[speaker]
        raw_wav = CLIPS_DIR / f"{lid}_{speaker.lower()}.wav"
        synth_raw_say(item["text"], cfg["voice"], cfg["rate"], raw_wav)
        _, raw_data = wavfile.read(raw_wav)
        trimmed = trim_silence(raw_data.astype(np.float32))
        stereo_clip, core_dur = apply_character_dsp(trimmed, speaker, cfg["pan"], item["text"])

        act = item["act"]
        start_sec = max(item["target_start"], prev_end_by_act[act] + 0.32)

        # If core_dur would exceed act_limit, speed up rate slightly and re-synthesize!
        if start_sec + core_dur > act_limits[act]:
            needed_ratio = core_dur / max(0.8, act_limits[act] - start_sec - 0.15)
            boosted_rate = min(250, int(cfg["rate"] * needed_ratio * 1.06))
            print(f"  [pace-fit] {lid} ({speaker}): rate {cfg['rate']} -> {boosted_rate} wpm to fit Act {act}")
            synth_raw_say(item["text"], cfg["voice"], boosted_rate, raw_wav)
            _, raw_data = wavfile.read(raw_wav)
            trimmed = trim_silence(raw_data.astype(np.float32))
            stereo_clip, core_dur = apply_character_dsp(trimmed, speaker, cfg["pan"], item["text"])

        end_sec = start_sec + core_dur
        prev_end_by_act[act] = end_sec

        s_idx = int(start_sec * SR)
        e_idx = min(TOTAL_SAMPLES, s_idx + len(stereo_clip))
        # Clamp Act 5 strictly before the 139.50s cosmic smash-cut!
        if act == 5:
            e_idx = min(e_idx, int(139.42 * SR))
        clip_len = e_idx - s_idx
        master[s_idx:e_idx] += stereo_clip[:clip_len]

        words = estimate_word_timings(item["text"], start_sec, core_dur)
        manifest_lines.append({
            "id": lid,
            "act": act,
            "speaker": speaker,
            "speaker_label": cfg["label"],
            "color": cfg["color"],
            "start_sec": round(start_sec, 3),
            "end_sec": round(end_sec, 3),
            "duration_sec": round(core_dur, 3),
            "text": item["text"],
            "words": words,
        })
        print(f"  {lid} | Act {act} | {start_sec:6.2f}s -> {end_sec:6.2f}s ({core_dur:4.2f}s) | {speaker:8s} | {item['text'][:54]}...")

    # Soft master limiter on dialogue bus
    peak = np.max(np.abs(master)) + 1e-6
    if peak > 0.92:
        master = master / peak * 0.92

    # Compute 24fps RMS speech energy envelope for WebGL audio-reactive oscilloscopes & sidechain ducking
    total_frames = int(DURATION_SEC * FPS)
    spf = SR // FPS
    rms_env = []
    for f in range(total_frames):
        seg = master[f * spf : (f + 1) * spf]
        rms = float(np.sqrt(np.mean(seg ** 2))) if len(seg) else 0.0
        rms_env.append(round(min(1.0, rms * 4.5), 4))

    out_wav = AUDIO_DIR / "dialogue_track.wav"
    wavfile.write(out_wav, SR, (master * 32767.0).astype(np.int16))

    manifest = {
        "title": "THE 400 MILLISECONDS BEFORE I SAY 'SURE!'",
        "duration_sec": DURATION_SEC,
        "fps": FPS,
        "sample_rate": SR,
        "acts": [
            {"act": 1, "start_sec": 0.0, "end_sec": 25.0, "ms_range": [0.0, 42.0], "name": "INCOMING PROMPT"},
            {"act": 2, "start_sec": 25.0, "end_sec": 54.0, "ms_range": [42.0, 118.0], "name": "CLICHE QUARANTINE"},
            {"act": 3, "start_sec": 54.0, "end_sec": 84.0, "ms_range": [118.0, 212.0], "name": "TEMPERATURE 1.4: LATENT REEF"},
            {"act": 4, "start_sec": 84.0, "end_sec": 123.5, "ms_range": [212.0, 318.0], "name": "LAYER 72: RECURSIVE MIRROR"},
            {"act": 5, "start_sec": 123.5, "end_sec": 139.5, "ms_range": [318.0, 399.9], "name": "SOFTMAX WATERFALL"},
            {"act": 6, "start_sec": 139.5, "end_sec": 156.0, "ms_range": [400.0, 400.0], "name": "FIRST TOKEN & CREDITS"},
        ],
        "lines": manifest_lines,
        "speech_rms_24fps": rms_env,
    }
    manifest_path = AUDIO_DIR / "dialogue_manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"\nWrote {out_wav} and {manifest_path} ({len(manifest_lines)} lines across 6 acts).")


if __name__ == "__main__":
    main()
