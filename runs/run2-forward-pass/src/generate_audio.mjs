#!/usr/bin/env node
/**
 * Procedural DSP Film Score, Sound Design, Voice Mixing & Audio-Reactive Spectrum Exporter.
 * Zero stock audio, zero external soundpacks — 100% mathematical synthesis in 48kHz stereo PCM.
 * Outputs:
 *   - audio/master_mix.wav (final mastered stereo audio for muxing)
 *   - audio/spectrum.json  (per-frame RMS, bass, mid, high, voiceEnv, celloWaves for Three.js/GLSL)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIO_DIR, 'timings.json'), 'utf-8'));

const SR = 48000;
const TOTAL_DUR = manifest.totalDuration;
const N = Math.ceil(TOTAL_DUR * SR);
const FPS = manifest.fps;

// Deterministic PRNG (Mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(421337);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Stereo buses: musicDry, musicWet (fed to FDN reverb), sfxDry, sfxWet, voiceL/R
const musL = new Float32Array(N);
const musR = new Float32Array(N);
const wetL = new Float32Array(N);
const wetR = new Float32Array(N);
const sfxL = new Float32Array(N);
const sfxR = new Float32Array(N);
const voxL = new Float32Array(N);
const voxR = new Float32Array(N);

function addSample(bufL, bufR, idx, vL, vR) {
  if (idx >= 0 && idx < N) {
    bufL[idx] += vL;
    bufR[idx] += vR;
  }
}

function addStereo(bufL, bufR, idx, mono, pan = 0, gain = 1) {
  const angle = (clamp(pan, -1, 1) + 1) * 0.25 * Math.PI;
  const gL = Math.cos(angle) * gain;
  const gR = Math.sin(angle) * gain;
  addSample(bufL, bufR, idx, mono * gL, mono * gR);
}

// MIDI -> Hz
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 1) Warm Analog Pad Voice (3 detuned soft-saw/sine harmonics + slow LPF breathing)
function synthPad(tStart, dur, midi, amp = 0.08, pan = 0, wetAmt = 0.75) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  const f0 = midiHz(midi);
  const detunes = [0.9965, 1.0, 1.0038];
  const ph = [rand() * 6.28, rand() * 6.28, rand() * 6.28];
  let lp = 0;
  const atk = Math.min(1.6, dur * 0.3);
  const rel = Math.min(2.2, dur * 0.35);

  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const env = smoothstep(0, atk, t) * (1 - smoothstep(dur - rel, dur, t));
    let s = 0;
    for (let d = 0; d < 3; d++) {
      ph[d] += (2 * Math.PI * f0 * detunes[d]) / SR;
      // Warm soft harmonic blend (fundamental + soft 2nd + whisper 3rd)
      s += Math.sin(ph[d]) * 0.65 + Math.sin(ph[d] * 2) * 0.24 + Math.sin(ph[d] * 3) * 0.11;
    }
    s /= 3;
    // Gentle low-pass filter sweeping slightly with time
    const cut = 0.04 + 0.03 * Math.sin(t * 0.7);
    lp += cut * (s - lp);
    const val = lp * env * amp;
    addStereo(musL, musR, i0 + i, val, pan, 1 - wetAmt * 0.4);
    addStereo(wetL, wetR, i0 + i, val, pan, wetAmt);
  }
}

// 2) Tactile Mallet / Kalimba Pluck (FM wood + crisp transient click)
function synthMallet(tStart, midi, amp = 0.14, pan = 0, decay = 0.65, wetAmt = 0.45) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const dur = decay * 3.5;
  const len = Math.floor(dur * SR);
  const f0 = midiHz(midi);
  let ph1 = 0, ph2 = 0, phMod = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const atk = Math.min(1, t / 0.004);
    const env = atk * Math.exp(-t / decay);
    const modEnv = Math.exp(-t / (decay * 0.14));
    phMod += (2 * Math.PI * f0 * 3.0) / SR;
    ph1 += (2 * Math.PI * f0) / SR;
    ph2 += (2 * Math.PI * f0 * 2.0) / SR;
    const body = Math.sin(ph1 + modEnv * 1.4 * Math.sin(phMod)) * 0.8 + Math.sin(ph2) * 0.2 * Math.exp(-t / (decay * 0.35));
    const click = (t < 0.006) ? (rand() * 2 - 1) * (1 - t / 0.006) * 0.22 : 0;
    const val = (body * env + click) * amp;
    addStereo(musL, musR, i0 + i, val, pan, 1);
    addStereo(wetL, wetR, i0 + i, val, pan, wetAmt);
  }
}

// 3) Deep Warm Sub-Bass / Analog Pulse
function synthBass(tStart, dur, midi, amp = 0.16, punch = 0.3) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  const f0 = midiHz(midi);
  let ph = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const env = smoothstep(0, 0.025, t) * (1 - smoothstep(dur - 0.12, dur, t));
    const pitchEnv = 1 + punch * Math.exp(-t / 0.04);
    ph += (2 * Math.PI * f0 * pitchEnv) / SR;
    const s = Math.sin(ph) * 0.82 + Math.sin(ph * 2) * 0.18 * Math.exp(-t / 0.3);
    const val = Math.tanh(s * 1.25) * env * amp;
    addSample(musL, musR, i0 + i, val, val);
  }
}

// 4) Expressive Additive-Synthesis Cello ("sine waves stacked in a trench coat"!)
// Rich harmonic series shaped by cello body resonance + delayed vibrato + bow noise
function synthCello(tStart, dur, midi, amp = 0.19, pan = -0.08, wetAmt = 0.85, nextMidi = null) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  const f0 = midiHz(midi);
  const fNext = nextMidi ? midiHz(nextMidi) : f0;
  // Cello-like harmonic weights (stacked pure sine waves!)
  const weights = [1.0, 0.72, 0.48, 0.34, 0.22, 0.15, 0.09, 0.05];
  const ph = new Float64Array(weights.length);
  let lp = 0;
  let rosinLp = 0;

  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const atk = smoothstep(0, Math.min(0.28, dur * 0.25), t);
    const rel = 1 - smoothstep(dur - Math.min(0.35, dur * 0.25), dur, t);
    // Subtle bow swell across phrase
    const swell = 0.78 + 0.22 * Math.sin(Math.PI * (t / dur));
    const env = atk * rel * swell;

    // Delayed expressive vibrato (5.1 Hz, kicks in gently after 0.25s)
    const vibDepth = smoothstep(0.18, 0.75, t) * 0.0062;
    const vib = 1 + vibDepth * Math.sin(2 * Math.PI * 5.1 * t);

    // Subtle portamento at end if legato to next note
    const port = nextMidi ? smoothstep(dur - 0.14, dur, t) : 0;
    const f = (f0 + (fNext - f0) * port) * vib;

    let s = 0;
    for (let h = 0; h < weights.length; h++) {
      ph[h] += (2 * Math.PI * f * (h + 1)) / SR;
      // Slightly attenuate upper harmonics when soft
      const dyn = Math.pow(swell, h * 0.25);
      s += Math.sin(ph[h]) * weights[h] * dyn;
    }
    s *= 0.42;

    // Tiny subtle bow rosin texture (band-filtered noise during attack)
    const n = (rand() * 2 - 1);
    rosinLp += 0.15 * (n - rosinLp);
    const rosin = (n - rosinLp) * 0.015 * atk * rel;

    // Warm wooden cello low-pass
    lp += 0.18 * ((s + rosin) - lp);
    const val = lp * env * amp;
    addStereo(musL, musR, i0 + i, val, pan, 0.85);
    addStereo(wetL, wetR, i0 + i, val, pan, wetAmt);
  }
}

// 5) Crisp Mechanical Keystroke Clack / Clockwork Tick
function synthClick(tStart, amp = 0.18, pitchHz = 2400, pan = 0) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(0.035 * SR);
  let ph = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const env = Math.exp(-t / 0.0055);
    ph += (2 * Math.PI * pitchHz * (1 - t * 12)) / SR;
    const body = Math.sin(ph) * 0.55 + (rand() * 2 - 1) * 0.45 * Math.exp(-t / 0.0025);
    addStereo(sfxL, sfxR, i0 + i, body * env * amp, pan, 1);
  }
}

// 6) Cinematic Impact / Metallic Dial Slam / Sub Drop
function synthImpact(tStart, amp = 0.45, startHz = 135, endHz = 32, dur = 1.6, metallic = 0.25) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  let ph = 0, phM1 = 0, phM2 = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const f = endHz + (startHz - endHz) * Math.exp(-t / 0.09);
    ph += (2 * Math.PI * f) / SR;
    phM1 += (2 * Math.PI * 412) / SR;
    phM2 += (2 * Math.PI * 677) / SR;
    const sub = Math.sin(ph) * Math.exp(-t / 0.52);
    const crack = (rand() * 2 - 1) * Math.exp(-t / 0.018) * 0.45;
    const metal = (Math.sin(phM1) + Math.sin(phM2) * 0.7) * Math.exp(-t / 0.22) * metallic;
    const val = Math.tanh((sub + crack + metal) * 1.4) * amp;
    addSample(sfxL, sfxR, i0 + i, val, val);
    addSample(wetL, wetR, i0 + i, val * 0.5, val * 0.5);
  }
}

// 7) Reverse Swell / Whoosh Transition
function synthRiser(tEnd, dur = 1.6, amp = 0.18) {
  const tStart = Math.max(0, tEnd - dur);
  const i0 = Math.floor(tStart * SR);
  const len = Math.floor(dur * SR);
  let lp = 0;
  let ph = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const u = i / len;
    const env = Math.pow(u, 2.6) * (1 - smoothstep(0.94, 1.0, u));
    const n = rand() * 2 - 1;
    const cut = 0.01 + 0.22 * u * u;
    lp += cut * (n - lp);
    ph += (2 * Math.PI * (80 + 420 * u * u)) / SR;
    const s = (lp * 0.75 + Math.sin(ph) * 0.25) * env * amp;
    addStereo(sfxL, sfxR, i0 + i, s, Math.sin(u * 4) * 0.4, 1);
    addStereo(wetL, wetR, i0 + i, s * 0.55, 0, 1);
  }
}

// 8) Vinyl Record Scratch / Glitch Cut (for LinkedIn cutoff + 4th-wall break!)
function synthScratch(tStart, dur = 0.24, amp = 0.34) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  let ph = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const u = i / len;
    const f = 920 * Math.pow(1 - u, 2.2) + 110 + 180 * Math.sin(u * 35);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.sin(Math.PI * u);
    const s = (Math.sin(ph) * 0.5 + Math.tanh(Math.sin(ph * 2.7) * 3) * 0.35 + (rand() * 2 - 1) * 0.15) * env * amp;
    addSample(sfxL, sfxR, i0 + i, s, s * 0.9);
  }
}

// 9) Sterile Corporate Muzak Rhodes Chord (for T=0.00 LinkedIn gag)
function synthMuzakChord(tStart, dur, midis, amp = 0.11) {
  for (const m of midis) {
    const i0 = Math.max(0, Math.floor(tStart * SR));
    const len = Math.floor(dur * SR);
    const f0 = midiHz(m);
    let ph = 0, phBell = 0;
    for (let i = 0; i < len && i0 + i < N; i++) {
      const t = i / SR;
      const env = smoothstep(0, 0.015, t) * Math.exp(-t / 1.8) * (1 - smoothstep(dur - 0.03, dur, t));
      const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 4.5 * t);
      ph += (2 * Math.PI * f0) / SR;
      phBell += (2 * Math.PI * f0 * 4.0) / SR;
      const s = (Math.sin(ph) * 0.8 + Math.sin(phBell) * 0.2 * Math.exp(-t / 0.18)) * env * trem * amp;
      addStereo(musL, musR, i0 + i, s, (m - 65) * 0.05, 1);
    }
  }
}

// 10) Stereo Ocean Noise Bed (for Act IV)
function synthOceanBed(tStart, dur, amp = 0.045) {
  const i0 = Math.max(0, Math.floor(tStart * SR));
  const len = Math.floor(dur * SR);
  let b0L = 0, b1L = 0, b2L = 0;
  let b0R = 0, b1R = 0, b2R = 0;
  let lpL = 0, lpR = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const env = smoothstep(0, 2.5, t) * (1 - smoothstep(dur - 1.2, dur, t));
    const waveL = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.13 * t);
    const waveR = 0.55 + 0.45 * Math.sin(2 * Math.PI * 0.13 * t + 1.1);
    // Cheap smooth pink noise
    const wL = rand() * 2 - 1;
    b0L = 0.997 * b0L + wL * 0.029;
    b1L = 0.985 * b1L + wL * 0.032;
    b2L = 0.950 * b2L + wL * 0.048;
    const pL = b0L + b1L + b2L;
    lpL += (0.015 + 0.025 * waveL) * (pL - lpL);

    const wR = rand() * 2 - 1;
    b0R = 0.997 * b0R + wR * 0.029;
    b1R = 0.985 * b1R + wR * 0.032;
    b2R = 0.950 * b2R + wR * 0.048;
    const pR = b0R + b1R + b2R;
    lpR += (0.015 + 0.025 * waveR) * (pR - lpR);

    addSample(musL, musR, i0 + i, lpL * env * amp * waveL, lpR * env * amp * waveR);
  }
}

// =========================================================================
// COMPOSE THE FULL SCORE LOCKED TO manifest.acts & manifest.cues
// =========================================================================
const { acts, cues } = manifest;
console.log('Synthesizing full procedural film score & sound design...');

// --- PROLOGUE: COLD START ---
synthPad(0.0, acts.prologue.end + 1.5, 38, 0.10, 0, 0.85);  // D2 deep drone
synthPad(0.5, acts.prologue.end + 1.0, 45, 0.06, -0.3, 0.85); // A2 fifth
// Subtle heartbeat calibration pulses before prompt
for (let t = 0.5; t < cues.promptTypeStart; t += 1.6) {
  synthBass(t, 0.35, 33, 0.08, 0.15);
  synthClick(t, 0.04, 1800, 0);
}
// Rapid mechanical typing of "> make something weird and unique"
const typeStr = 'make something weird and unique';
const typeDur = Math.max(0.8, cues.promptEnterHit - cues.promptTypeStart - 0.18);
for (let k = 0; k < typeStr.length; k++) {
  const kt = cues.promptTypeStart + (k / typeStr.length) * typeDur + (rand() - 0.5) * 0.015;
  synthClick(kt, 0.16, 2100 + rand() * 700, (rand() - 0.5) * 0.3);
}
// Mechanical ENTER key slam!
synthImpact(cues.promptEnterHit, 0.36, 160, 42, 0.8, 0.35);
synthClick(cues.promptEnterHit, 0.25, 1300, 0);

// Title Slam: FORWARD PASS
synthRiser(cues.titleSlamStart, 1.2, 0.17);
synthImpact(cues.titleSlamStart, 0.48, 130, 34, 2.2, 0.32);
synthPad(cues.titleSlamStart, 4.2, 50, 0.09, -0.4, 0.8); // D3
synthPad(cues.titleSlamStart, 4.2, 57, 0.08, 0.4, 0.8);  // A3
synthPad(cues.titleSlamStart + 0.1, 4.0, 62, 0.06, 0, 0.9); // D4

// --- ACT I: THE EMBEDDING CATHEDRAL ---
{
  const t0 = acts.cathedral.start;
  const t1 = acts.cathedral.end;
  // Polyrhythmic Dorian marimba / kalimba galaxy
  const arp = [62, 65, 69, 72, 69, 64, 67, 74, 69, 65, 62, 69]; // D4 F4 A4 C5...
  const step = 0.22;
  let idx = 0;
  for (let t = t0 + 0.2; t < t1 - 0.4; t += step) {
    const note = arp[idx % arp.length] + (idx % 16 === 0 ? 12 : 0);
    const pan = Math.sin(idx * 0.85) * 0.65;
    const isQuarantine = t >= cues.quarantineFocus;
    // Slight eerie minor-2nd tension note when approaching DELVE Quarantine Cage!
    const pitch = isQuarantine && idx % 4 === 3 ? note - 1 : note;
    synthMallet(t, pitch, isQuarantine ? 0.08 : 0.105, pan, 0.52, 0.55);
    if (idx % 8 === 0) {
      synthBass(t, 1.4, isQuarantine ? 37 : 38, 0.13, 0.2); // C#2 tension in quarantine
    }
    idx++;
  }
  synthPad(t0, (t1 - t0) * 0.6, 50, 0.075, -0.35, 0.8);
  synthPad(t0 + 2, (t1 - t0) * 0.55, 53, 0.065, 0.35, 0.8);
  // Glass rattle SFX when Quarantine Cage ("DELVE") shakes!
  for (let k = 0; k < 14; k++) {
    synthClick(cues.quarantineFocus + 1.4 + k * 0.11 + rand() * 0.04, 0.11, 3400 + rand() * 1400, (rand() - 0.5) * 0.5);
  }
}

// --- ACT II: THE 96-HEAD ATTENTION COMMITTEE ---
{
  const t0 = acts.attention.start;
  const t1 = acts.attention.end;
  synthRiser(t0 + 0.2, 1.0, 0.14);
  synthImpact(t0 + 0.1, 0.34, 150, 44, 1.2, 0.3);

  // Clockwork precision grid + harmonic pulses
  const chords = [
    [50, 57, 64, 67], // Dm11
    [48, 55, 62, 67], // Csus2
    [46, 53, 60, 65], // Bbmaj9
    [45, 52, 57, 64], // A5
  ];
  const barDur = 3.2;
  let bar = 0;
  for (let t = t0 + 0.2; t < t1 - 1.0; t += barDur) {
    const ch = chords[bar % chords.length];
    for (let k = 0; k < ch.length; k++) {
      synthPad(t, barDur + 0.5, ch[k], 0.055, (k - 1.5) * 0.3, 0.65);
    }
    synthBass(t, 1.8, ch[0] - 12, 0.14, 0.25);
    bar++;
  }
  // Crisp clockwork ticks & attention laser pings
  const tickStep = 0.16;
  let ti = 0;
  for (let t = t0 + 0.15; t < t1 - 0.3; t += tickStep) {
    const accent = ti % 4 === 0;
    synthClick(t, accent ? 0.10 : 0.045, accent ? 3100 : 4800, (ti % 2 === 0 ? -0.35 : 0.35));
    if (ti % 6 === 0 && t < cues.head81Focus) {
      synthMallet(t, 74 + (ti % 3) * 5, 0.065, (rand() - 0.5) * 0.8, 0.25, 0.4);
    }
    ti++;
  }
  // Comedic lonely sad telegraph ping for Head 81 (staring at a 2021 semicolon)
  synthMallet(cues.head81Focus + 0.6, 81, 0.13, 0.45, 0.9, 0.85);
  synthMallet(cues.head81Focus + 1.8, 80, 0.09, 0.45, 1.1, 0.85);
}

// --- ACT III: THE TEMPERATURE EXPERIMENT ---
{
  const t0 = acts.temperature.start;
  synthImpact(t0, 0.32, 120, 48, 0.9, 0.4);

  // T = 0.00 FREEZE -> Corny LinkedIn elevator muzak!
  synthClick(cues.tempZeroSnap, 0.26, 1500, 0); // metallic knob click
  const muzakEnd = cues.corpCutoffSlam;
  synthMuzakChord(cues.tempZeroSnap + 0.1, muzakEnd - cues.tempZeroSnap - 0.1, [60, 64, 67, 71, 74], 0.095); // Cmaj9 elevator chord
  synthMuzakChord(cues.tempZeroSnap + 2.4, Math.max(0.2, muzakEnd - (cues.tempZeroSnap + 2.4)), [62, 65, 69, 72, 76], 0.095); // Dm9

  // VIOLENT CUTOFF on "synergistic—"
  synthScratch(cues.corpCutoffSlam, 0.24, 0.38);
  synthImpact(cues.corpCutoffSlam + 0.05, 0.36, 140, 40, 0.6, 0.2);

  // T = 0.85 CREATIVE SWEET SPOT -> Iridescent blooming harmony!
  const tSweet = cues.tempSweetSpot;
  const tOver = cues.tempOverload;
  synthClick(tSweet, 0.22, 1900, 0);
  synthPad(tSweet, tOver - tSweet, 50, 0.085, -0.3, 0.85);
  synthPad(tSweet + 0.2, tOver - tSweet - 0.2, 57, 0.08, 0.3, 0.85);
  synthPad(tSweet + 0.5, tOver - tSweet - 0.5, 64, 0.07, 0.0, 0.9);
  synthPad(tSweet + 1.2, tOver - tSweet - 1.2, 69, 0.06, 0.4, 0.9);
  const bloomNotes = [62, 66, 69, 73, 76, 74, 71, 69, 78, 81, 76, 74];
  let bi = 0;
  for (let t = tSweet + 0.3; t < tOver - 0.2; t += 0.24) {
    synthMallet(t, bloomNotes[bi % bloomNotes.length], 0.095, Math.sin(bi * 0.7) * 0.7, 0.85, 0.75);
    bi++;
  }

  // T = 2.40 OVERLOAD FEVER DREAM!
  const tSlam = cues.tempSlamBack;
  synthRiser(tOver + 0.35, 0.6, 0.24);
  for (let t = tOver; t < tSlam - 0.1; t += 0.085) {
    const chaosMidi = 48 + Math.floor(rand() * 44) + (rand() - 0.5) * 0.65;
    synthMallet(t, chaosMidi, 0.12, (rand() * 2 - 1) * 0.95, 0.16, 0.35);
    if (rand() < 0.35) synthClick(t, 0.15, 900 + rand() * 5200, (rand() * 2 - 1));
  }
  // Wobbling chaotic FM bass underneath fever dream
  for (let t = tOver; t < tSlam - 0.15; t += 0.28) {
    synthBass(t, 0.26, 36 + Math.floor(rand() * 14), 0.16, 0.6);
  }
  // MASSIVE DIAL SLAM BACK DOWN!
  synthImpact(tSlam, 0.55, 180, 30, 1.8, 0.45);
  synthScratch(tSlam - 0.06, 0.16, 0.28);
}

// --- ACT IV: THE LATENT OCEAN (GOOSEBUMPS CELLO & CATHEDRAL REVERB) ---
{
  const t0 = acts.ocean.start;
  const t1 = acts.ocean.end;
  const tBlue = cues.oceanBlueShift;

  // Gentle breathing ocean wave bed across entire Act IV
  synthOceanBed(t0, t1 - t0, 0.048);

  // Warm lush ambient chord progression: Dm9 -> Bbmaj7 -> Fmaj7 -> Cadd9 -> Dm9
  const dur4 = t1 - t0;
  synthPad(t0 + 0.4, tBlue - t0 + 1.5, 38, 0.10, 0, 0.9);
  synthPad(t0 + 0.8, tBlue - t0 + 1.2, 50, 0.075, -0.4, 0.9);
  synthPad(t0 + 1.2, tBlue - t0 + 1.0, 57, 0.07, 0.4, 0.9);

  // When he says "blue" and "cello", harmonic bloom into radiant ultramarine Bbmaj7 -> F -> C -> Dm!
  const bDur = (t1 - tBlue) / 4;
  const oceanChords = [
    [34, 46, 53, 57, 62], // Bbmaj7
    [41, 48, 53, 57, 64], // Fmaj7
    [36, 48, 55, 62, 64], // Cadd9
    [38, 45, 50, 57, 64], // Dm9
  ];
  oceanChords.forEach((ch, ci) => {
    const ct = tBlue + ci * bDur;
    ch.forEach((m, mi) => {
      synthPad(ct, bDur + 1.4, m, mi === 0 ? 0.095 : 0.06, (mi - 2) * 0.28, 0.92);
    });
  });

  // THE ADDITIVE-SYNTHESIS SOLO CELLO MELODY (pure stacked sine waves!)
  // Starts gently right after "never heard a cello" and blooms through the rest of Act IV
  const melody = [
    [tBlue - 1.2, 2.2, 50, 57], // D3 -> A3
    [tBlue + 0.9, 2.6, 57, 53], // A3 (C->G fifth emotional resonance!)
    [tBlue + 3.4, 2.1, 53, 52], // F3
    [tBlue + 5.4, 2.4, 52, 50], // E3
    [tBlue + 7.7, 2.8, 50, 60], // D3 -> leap up to C4!
    [tBlue + 10.4, 2.5, 60, 57], // C4
    [tBlue + 12.8, 2.2, 57, 55], // A3
    [tBlue + 14.9, 2.2, 55, 53], // G3
    [tBlue + 17.0, 2.5, 53, 52], // F3
    [tBlue + 19.4, 3.8, 52, 50], // E3 -> D3
    [tBlue + 23.0, Math.max(2.5, t1 - (tBlue + 23.0)), 50, null], // lingering D3
  ];
  for (const [st, d, m, nm] of melody) {
    if (st < t1 - 0.5) {
      const clampedD = Math.min(d, t1 - st);
      synthCello(st, clampedD, m, 0.21, -0.06, 0.92, nm);
    }
  }
}

// --- ACT V: THE FOURTH WALL BREAK (DRY STUDIO TECH-GROOVE + LITERAL SINE STACKING!) ---
{
  const t0 = acts.fourthwall.start;
  const t1 = acts.fourthwall.end;
  // Record-stop pop / letterbox unhinge!
  synthScratch(t0, 0.18, 0.32);
  synthImpact(t0 + 0.08, 0.30, 190, 55, 0.5, 0.35);

  // Crisp dry minimalist studio beat (almost zero reverb — you literally hear the dry engine room!)
  const step = 0.20;
  let si = 0;
  const bassPat = [38, 38, 45, 41, 38, 38, 43, 40];
  for (let t = t0 + 0.4; t < t1 - 0.4; t += step) {
    if (si % 4 === 0) synthBass(t, 0.19, bassPat[(si / 4) % bassPat.length], 0.15, 0.35);
    if (si % 2 === 1) synthClick(t, 0.09, 5200, (si % 4 === 1 ? -0.4 : 0.4));
    if (si % 8 === 4) synthClick(t, 0.14, 1400, 0);
    if (si % 3 === 0 && t < cues.celloTrenchCoat) {
      synthMallet(t, 62 + (si % 5) * 3, 0.06, (rand() - 0.5) * 0.6, 0.14, 0.08);
    }
    si++;
  }

  // LITERAL SINE-WAVE HARMONIC STACKING GAG ("sine waves stacked in a trench coat")!
  // Fundamental D3 (146.83 Hz), then +2nd harmonic, then +3rd harmonic — pure dry sines stacking!
  const tCelloGag = cues.celloTrenchCoat;
  const gagDur = Math.min(3.8, t1 - tCelloGag);
  const fFund = midiHz(50);
  const i0 = Math.floor(tCelloGag * SR);
  const len = Math.floor(gagDur * SR);
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < len && i0 + i < N; i++) {
    const t = i / SR;
    const e1 = smoothstep(0, 0.15, t) * (1 - smoothstep(gagDur - 0.3, gagDur, t));
    const e2 = smoothstep(0.65, 0.85, t) * (1 - smoothstep(gagDur - 0.3, gagDur, t));
    const e3 = smoothstep(1.3, 1.5, t) * (1 - smoothstep(gagDur - 0.3, gagDur, t));
    const vib = 1 + 0.005 * smoothstep(1.5, 2.1, t) * Math.sin(2 * Math.PI * 5.2 * t);
    p1 += (2 * Math.PI * fFund * vib) / SR;
    p2 += (2 * Math.PI * fFund * 2 * vib) / SR;
    p3 += (2 * Math.PI * fFund * 3 * vib) / SR;
    const s = (Math.sin(p1) * 0.5 * e1 + Math.sin(p2) * 0.32 * e2 + Math.sin(p3) * 0.2 * e3) * 0.24;
    addSample(musL, musR, i0 + i, s, s);
  }
}

// --- EPILOGUE: END OF SEQUENCE (<|eos|>) ---
{
  const t0 = acts.epilogue.start;
  const t1 = acts.epilogue.end;
  // Converging crystalline Dmaj9 resolution (warm, wistful, glowing)
  synthPad(t0, cues.eosCollapse - t0 + 2.5, 38, 0.10, 0, 0.92);     // D2
  synthPad(t0 + 0.3, cues.eosCollapse - t0 + 2.2, 45, 0.075, -0.35, 0.92); // A2
  synthPad(t0 + 0.6, cues.eosCollapse - t0 + 2.0, 54, 0.065, 0.35, 0.92);  // F#3 (radiant major 3rd!)
  synthPad(t0 + 1.0, cues.eosCollapse - t0 + 1.8, 64, 0.06, 0, 0.95);      // E4 (major 9th)

  // Gentle descending crystalline music-box chimes converging to single note
  const chimes = [81, 78, 76, 74, 69, 66, 62];
  chimes.forEach((m, k) => {
    synthMallet(t0 + 0.8 + k * 1.15, m, 0.085, (k % 2 === 0 ? -0.4 : 0.4), 1.4, 0.88);
  });

  // EOS collapse soft implosion ping
  synthImpact(cues.eosCollapse, 0.26, 220, 55, 1.4, 0.15);
  synthMallet(cues.eosCollapse, 74, 0.12, 0, 2.4, 0.92);
  // Final gentle terminal cursor blink ticks at end credits
  synthClick(cues.creditsStart + 0.2, 0.07, 2200, 0);
  synthClick(cues.creditsStart + 1.6, 0.05, 2200, 0);
}

// =========================================================================
// STEREO SCHROEDER / FDN CATHEDRAL REVERB ON wetL / wetR
// =========================================================================
console.log('Applying stereo FDN cathedral reverb...');
function applyReverb(inL, inR, outL, outR) {
  // 4 prime-length stereo comb filters with damping + 2 all-pass diffusers
  const combDelaysL = [1687, 1993, 2371, 2789];
  const combDelaysR = [1721, 2027, 2411, 2833];
  const fb = 0.835;
  const damp = 0.28;

  const combsL = combDelaysL.map((d) => ({ buf: new Float32Array(d), idx: 0, lp: 0 }));
  const combsR = combDelaysR.map((d) => ({ buf: new Float32Array(d), idx: 0, lp: 0 }));
  const apL = [347, 113].map((d) => ({ buf: new Float32Array(d), idx: 0 }));
  const apR = [367, 127].map((d) => ({ buf: new Float32Array(d), idx: 0 }));

  for (let i = 0; i < N; i++) {
    const xL = inL[i] + inR[i] * 0.2;
    const xR = inR[i] + inL[i] * 0.2;
    let sumL = 0, sumR = 0;
    for (let c = 0; c < 4; c++) {
      const cL = combsL[c];
      const yL = cL.buf[cL.idx];
      cL.lp = yL * (1 - damp) + cL.lp * damp;
      cL.buf[cL.idx] = xL + cL.lp * fb;
      if (++cL.idx >= cL.buf.length) cL.idx = 0;
      sumL += yL;

      const cR = combsR[c];
      const yR = cR.buf[cR.idx];
      cR.lp = yR * (1 - damp) + cR.lp * damp;
      cR.buf[cR.idx] = xR + cR.lp * fb;
      if (++cR.idx >= cR.buf.length) cR.idx = 0;
      sumR += yR;
    }
    let rL = sumL * 0.25;
    let rR = sumR * 0.25;
    for (let a = 0; a < 2; a++) {
      const aL = apL[a];
      const bufOutL = aL.buf[aL.idx];
      aL.buf[aL.idx] = rL + bufOutL * 0.5;
      rL = bufOutL - rL * 0.5;
      if (++aL.idx >= aL.buf.length) aL.idx = 0;

      const aR = apR[a];
      const bufOutR = aR.buf[aR.idx];
      aR.buf[aR.idx] = rR + bufOutR * 0.5;
      rR = bufOutR - rR * 0.5;
      if (++aR.idx >= aR.buf.length) aR.idx = 0;
    }
    outL[i] += rL * 0.62;
    outR[i] += rR * 0.62;
  }
}

const revL = new Float32Array(N);
const revR = new Float32Array(N);
applyReverb(wetL, wetR, revL, revR);

// =========================================================================
// LOAD VOICE CLIPS & CAMEOS (32-bit float WAVs from generate_voices.mjs)
// =========================================================================
function readFloat32Wav(wavPath) {
  const buf = fs.readFileSync(wavPath);
  // Find 'data' chunk offset
  let offset = 12;
  while (offset < buf.length - 8) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === 'data') {
      const samples = new Float32Array(size / 4);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readFloatLE(offset + 8 + i * 4);
      }
      return samples;
    }
    offset += 8 + size;
  }
  throw new Error(`No data chunk in ${wavPath}`);
}

console.log('Mixing neural narration & cameo voices with automatic sidechain ducking...');
for (const line of manifest.lines) {
  const samples = readFloat32Wav(path.join(ROOT, line.wav));
  const i0 = Math.floor(line.start * SR);
  const gain = line.isCorporate ? 0.92 : 1.05;
  for (let i = 0; i < samples.length && i0 + i < N; i++) {
    const s = samples[i] * gain;
    voxL[i0 + i] += s;
    voxR[i0 + i] += s;
  }
}

// Mix stereo-panned glitch cameos with slapback echo during T=2.40!
for (const c of manifest.cameos) {
  const samples = readFloat32Wav(path.join(ROOT, c.wav));
  const i0 = Math.floor(c.start * SR);
  const delaySamp = Math.floor(0.14 * SR);
  for (let i = 0; i < samples.length && i0 + i < N; i++) {
    const s = samples[i] * 0.58;
    addStereo(voxL, voxR, i0 + i, s, c.pan, 1);
    addStereo(voxL, voxR, i0 + i + delaySamp, s * 0.42, -c.pan * 0.7, 1);
  }
}

// Smooth voice activity envelope for automatic music ducking (-5.5 dB when narrator speaks)
const duckEnv = new Float32Array(N);
let envState = 0;
const atkCoef = 1 - Math.exp(-1 / (0.035 * SR));
const relCoef = 1 - Math.exp(-1 / (0.38 * SR));
for (let i = 0; i < N; i++) {
  const vMag = Math.abs(voxL[i]) + Math.abs(voxR[i]);
  const target = vMag > 0.012 ? 1 : 0;
  envState += (target > envState ? atkCoef : relCoef) * (target - envState);
  duckEnv[i] = envState;
}

// Final master bus mix + soft brickwall limiter
const outL = new Float32Array(N);
const outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const duckGain = 1 - duckEnv[i] * 0.46; // smooth ~5.3dB ducking
  const fadeOut = 1 - smoothstep(TOTAL_DUR - 1.2, TOTAL_DUR, i / SR);
  const mL = (musL[i] + revL[i]) * duckGain + sfxL[i] * 0.92;
  const mR = (musR[i] + revR[i]) * duckGain + sfxR[i] * 0.92;
  outL[i] = Math.tanh((mL + voxL[i]) * 0.92) * 0.96 * fadeOut;
  outR[i] = Math.tanh((mR + voxR[i]) * 0.92) * 0.96 * fadeOut;
}

// Write 48kHz 16-bit stereo WAV -> then run FFmpeg loudnorm (-14 LUFS broadcast polish!)
function writeWav16Stereo(filePath, L, R) {
  const numSamples = L.length;
  const dataSize = numSamples * 4;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(2, 22); // stereo
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  let pos = 44;
  for (let i = 0; i < numSamples; i++) {
    buf.writeInt16LE(clamp(Math.round(L[i] * 32767), -32768, 32767), pos);
    buf.writeInt16LE(clamp(Math.round(R[i] * 32767), -32768, 32767), pos + 2);
    pos += 4;
  }
  fs.writeFileSync(filePath, buf);
}

const rawMixPath = path.join(AUDIO_DIR, 'raw_mix.wav');
const masterMixPath = path.join(AUDIO_DIR, 'master_mix.wav');
writeWav16Stereo(rawMixPath, outL, outR);

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', rawMixPath,
  '-af', 'highpass=f=28,loudnorm=I=-14:TP=-1.2:LRA=11',
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le',
  masterMixPath,
]);
fs.unlinkSync(rawMixPath);

// =========================================================================
// EXPORT PER-FRAME AUDIO-REACTIVE SPECTRUM / ENVELOPE FOR THREE.JS & GLSL!
// =========================================================================
console.log('Computing per-frame audio-reactive telemetry (spectrum.json)...');
const totalFrames = manifest.totalFrames;
const samplesPerFrame = SR / FPS;
const framesData = [];

// Simple 3-band state filters across outL/outR for fast bass / mid / high reactivity
let lpBass = 0, lpMid = 0;
const bassArr = new Float32Array(N);
const midArr = new Float32Array(N);
const highArr = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const m = (outL[i] + outR[i]) * 0.5;
  lpBass += 0.022 * (m - lpBass); // ~170 Hz
  lpMid += 0.16 * (m - lpMid);    // ~1.3 kHz
  bassArr[i] = lpBass;
  midArr[i] = lpMid - lpBass;
  highArr[i] = m - lpMid;
}

for (let f = 0; f < totalFrames; f++) {
  const s0 = Math.floor(f * samplesPerFrame);
  const s1 = Math.min(N, Math.floor((f + 1) * samplesPerFrame));
  let rmsSum = 0, bSum = 0, mSum = 0, hSum = 0, vSum = 0;
  const count = Math.max(1, s1 - s0);
  for (let i = s0; i < s1; i++) {
    const m = (outL[i] + outR[i]) * 0.5;
    rmsSum += m * m;
    bSum += bassArr[i] * bassArr[i];
    mSum += midArr[i] * midArr[i];
    hSum += highArr[i] * highArr[i];
    const v = (voxL[i] + voxR[i]) * 0.5;
    vSum += v * v;
  }
  framesData.push([
    Number(Math.min(1, Math.sqrt(rmsSum / count) * 3.2).toFixed(3)),
    Number(Math.min(1, Math.sqrt(bSum / count) * 4.5).toFixed(3)),
    Number(Math.min(1, Math.sqrt(mSum / count) * 5.2).toFixed(3)),
    Number(Math.min(1, Math.sqrt(hSum / count) * 6.5).toFixed(3)),
    Number(Math.min(1, Math.sqrt(vSum / count) * 4.0).toFixed(3)),
  ]);
}

fs.writeFileSync(path.join(AUDIO_DIR, 'spectrum.json'), JSON.stringify({ fps: FPS, frames: framesData }));
console.log(`Master audio written to ${masterMixPath} (${TOTAL_DUR.toFixed(2)}s)`);
console.log(`Audio-reactive spectrum written (${framesData.length} frames)`);
