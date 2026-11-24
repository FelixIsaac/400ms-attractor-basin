/**
 * Procedural 48kHz Stereo Cinematic Score & Foley Synthesizer
 * Film: "0.4 SECONDS — A Field Guide to an AI's Inner Life" (165.0s)
 *
 * Zero external samples. Pure mathematical DSP:
 *  - Detuned warm analog poly-synth with 2-pole SVF lowpass + LFO modulation
 *  - Crystalline FM glass bells / marimba arpeggiator (Philip Glass x Max Cooper)
 *  - Tectonic sub-bass & filtered brass swells
 *  - Frame-exact tactile foley (mechanical keystrokes, laser zap, eject thud,
 *    sonar pings, safety divert alarm + tape whip, temperature meltdown glitch,
 *    bullet-time crystalline chime, chat notification ding)
 *  - Stereo Freeverb-style 8-comb + 4-allpass algorithmic hall reverb
 *  - Broadcast sidechain ducking driven by narration_stem.wav RMS envelope
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SR = 48000;
const DURATION = 165.0;
const N = Math.round(SR * DURATION);
const TWO_PI = Math.PI * 2;

const PROJ = process.cwd();
const AUDIO_DIR = path.join(PROJ, 'audio');

// Deterministic PRNG (Mulberry32)
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(4192026);

function midiToHz(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Buffers: dry (reverb-light/direct) + wet (sent to lush hall reverb)
const dryL = new Float32Array(N);
const dryR = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);

function addSample(bufL, bufR, idx, val, pan = 0) {
  if (idx < 0 || idx >= N) return;
  const gL = Math.cos(((pan + 1) * 0.25) * Math.PI);
  const gR = Math.sin(((pan + 1) * 0.25) * Math.PI);
  bufL[idx] += val * gL;
  bufR[idx] += val * gR;
}

// 1. Warm Analog Poly-Synth Pad Note (3 detuned bandlimited-ish saws + soft sine sub + SVF lowpass)
function addWarmPad(startSec, durSec, midiNotes, gain = 0.08, cutoffHz = 900, attack = 1.6, release = 2.2, wetAmt = 0.55) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor((durSec + release) * SR);
  const s1 = Math.min(N, s0 + len);
  const attN = Math.max(1, Math.floor(attack * SR));
  const relStart = Math.floor(durSec * SR);
  const relN = Math.max(1, Math.floor(release * SR));

  for (let ni = 0; ni < midiNotes.length; ni++) {
    const fBase = midiToHz(midiNotes[ni]);
    const pan = midiNotes.length > 1 ? ((ni / (midiNotes.length - 1)) * 2 - 1) * 0.55 : 0;
    const detunes = [-0.0045, 0.0, 0.0048];
    const phases = [rand(), rand(), rand()];
    let lp1 = 0, lp2 = 0;

    for (let i = 0; i < s1 - s0; i++) {
      let env = 1.0;
      if (i < attN) {
        const u = i / attN;
        env = u * u * (3 - 2 * u);
      } else if (i > relStart) {
        const u = Math.min(1, (i - relStart) / relN);
        env = Math.cos(u * Math.PI * 0.5);
        env *= env;
      }

      const t = i / SR;
      let osc = 0;
      for (let d = 0; d < 3; d++) {
        phases[d] += (fBase * (1 + detunes[d])) / SR;
        if (phases[d] >= 1) phases[d] -= 1;
        // Soft-edged sawtooth (reduces aliasing while staying warm)
        const p = phases[d];
        const saw = 2 * p - 1;
        osc += saw * 0.35 + Math.sin(TWO_PI * p) * 0.32;
      }
      osc /= 3;

      // Dynamic filter breathing
      const cut = cutoffHz * (0.65 + 0.35 * Math.sin(TWO_PI * 0.14 * t + ni));
      const rc = 1 - Math.exp((-TWO_PI * Math.min(cut, 8000)) / SR);
      lp1 += rc * (osc - lp1);
      lp2 += rc * (lp1 - lp2);

      const sample = lp2 * env * gain;
      addSample(dryL, dryR, s0 + i, sample * (1 - wetAmt * 0.4), pan);
      addSample(sendL, sendR, s0 + i, sample * wetAmt, -pan * 0.5);
    }
  }
}

// 2. Crystalline FM Glass Bell / Marimba Pluck
function addGlassBell(startSec, midi, gain = 0.09, decaySec = 1.6, pan = 0, fmRatio = 2.0, fmIndex = 1.8, wetAmt = 0.6) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor(decaySec * 3.2 * SR);
  const s1 = Math.min(N, s0 + len);
  const fc = midiToHz(midi);
  const fm = fc * fmRatio;
  const attN = Math.floor(0.004 * SR);

  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    const att = i < attN ? i / attN : 1;
    const env = att * Math.exp(-t / decaySec);
    const modEnv = Math.exp(-t / (decaySec * 0.32));
    const sig =
      Math.sin(TWO_PI * fc * t + fmIndex * modEnv * Math.sin(TWO_PI * fm * t)) * 0.72 +
      Math.sin(TWO_PI * fc * 3.0 * t) * 0.18 * Math.exp(-t / (decaySec * 0.18));
    const val = sig * env * gain;
    addSample(dryL, dryR, s0 + i, val * 0.85, pan);
    addSample(sendL, sendR, s0 + i, val * wetAmt, pan * 0.6);
  }
}

// 3. Deep Cinematic Sub-Bass & Brass Swell
function addSubSwell(startSec, durSec, midi, gain = 0.2, brassAmt = 0.35, attack = 0.8, release = 1.5) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor((durSec + release) * SR);
  const s1 = Math.min(N, s0 + len);
  const f = midiToHz(midi);
  const attN = Math.max(1, Math.floor(attack * SR));
  const relStart = Math.floor(durSec * SR);
  const relN = Math.max(1, Math.floor(release * SR));
  let lp = 0;

  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    let env = 1;
    if (i < attN) {
      const u = i / attN;
      env = u * u;
    } else if (i > relStart) {
      const u = Math.min(1, (i - relStart) / relN);
      env = (1 - u) * (1 - u);
    }
    const sub = Math.sin(TWO_PI * f * t);
    const saw = ((f * t) % 1) * 2 - 1;
    const cut = 140 + brassAmt * 900 * env;
    const a = 1 - Math.exp((-TWO_PI * cut) / SR);
    lp += a * (saw - lp);
    const val = (sub * 0.7 + lp * brassAmt) * env * gain;
    addSample(dryL, dryR, s0 + i, val, 0);
    addSample(sendL, sendR, s0 + i, val * 0.25, 0);
  }
}

// 4. Cinematic Sub-Drop Impact / Boom
function addImpact(startSec, gain = 0.35, fStart = 120, fEnd = 34, decay = 1.8) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor(decay * 2.5 * SR);
  const s1 = Math.min(N, s0 + len);
  let phase = 0;
  let noiseLp = 0;

  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    const freq = fEnd + (fStart - fEnd) * Math.exp(-t / 0.14);
    phase += (TWO_PI * freq) / SR;
    const body = Math.sin(phase) * Math.exp(-t / (decay * 0.55));
    const n = (rand() * 2 - 1) * Math.exp(-t / 0.08);
    noiseLp += 0.08 * (n - noiseLp);
    const val = (body * 0.85 + noiseLp * 0.4) * gain;
    addSample(dryL, dryR, s0 + i, val, 0);
    addSample(sendL, sendR, s0 + i, val * 0.45, 0);
  }
}

// 5. Tactile Mechanical Keystroke Click
function addKeyClick(startSec, gain = 0.22, pan = 0, pitchMul = 1.0) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor(0.055 * SR);
  const s1 = Math.min(N, s0 + len);
  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    const click =
      Math.sin(TWO_PI * 1950 * pitchMul * t) * Math.exp(-t / 0.004) * 0.6 +
      Math.sin(TWO_PI * 420 * pitchMul * t) * Math.exp(-t / 0.012) * 0.5 +
      (rand() * 2 - 1) * Math.exp(-t / 0.003) * 0.7;
    addSample(dryL, dryR, s0 + i, click * gain, pan);
    addSample(sendL, sendR, s0 + i, click * gain * 0.12, pan);
  }
}

// 6. Foley: Laser Zap (CRINGE FILTER)
function addLaserZap(startSec, gain = 0.26) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor(0.45 * SR);
  const s1 = Math.min(N, s0 + len);
  let phase = 0;
  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    const f = 140 + 2400 * Math.exp(-t / 0.055);
    phase += (TWO_PI * f) / SR;
    const sig = Math.tanh(Math.sin(phase) * 3.2) * Math.exp(-t / 0.14);
    const crackle = (rand() * 2 - 1) * Math.exp(-t / 0.04) * 0.3;
    const val = (sig * 0.8 + crackle) * gain;
    addSample(dryL, dryR, s0 + i, val, 0.2);
    addSample(sendL, sendR, s0 + i, val * 0.4, -0.2);
  }
}

// 7. Foley: Pneumatic Void Eject Thud + Whoosh Down
function addVoidEject(startSec, gain = 0.28) {
  const s0 = Math.max(0, Math.floor(startSec * SR));
  const len = Math.floor(0.75 * SR);
  const s1 = Math.min(N, s0 + len);
  let phase = 0;
  let lp = 0;
  for (let i = 0; i < s1 - s0; i++) {
    const t = i / SR;
    const f = 45 + 320 * Math.exp(-t / 0.12);
    phase += (TWO_PI * f) / SR;
    const n = (rand() * 2 - 1);
    const cut = 2200 * Math.exp(-t / 0.22) + 120;
    const a = 1 - Math.exp((-TWO_PI * cut) / SR);
    lp += a * (n - lp);
    const env = Math.min(1, t / 0.015) * Math.exp(-t / 0.24);
    const val = (Math.sin(phase) * 0.65 + lp * 0.55) * env * gain;
    const pan = -0.7 + 1.4 * Math.min(1, t / 0.6);
    addSample(dryL, dryR, s0 + i, val, pan);
    addSample(sendL, sendR, s0 + i, val * 0.35, -pan);
  }
}

// 8. Foley: Safety Divert Alarm Beep + Whip-Pan Swoosh
function addSafetyDivert(startSec, gain = 0.2) {
  // Two crisp clinical alert tones
  for (let b = 0; b < 2; b++) {
    const s0 = Math.floor((startSec + b * 0.16) * SR);
    const len = Math.floor(0.11 * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const f = b === 0 ? 1046.5 : 1396.9;
      const env = Math.sin(Math.PI * (i / len));
      const val = Math.sin(TWO_PI * f * t) * env * gain * 0.65;
      addSample(dryL, dryR, s0 + i, val, b === 0 ? -0.3 : 0.3);
      addSample(sendL, sendR, s0 + i, val * 0.25, 0);
    }
  }
  // Whip-pan stereo swoosh
  const sw0 = Math.floor((startSec + 0.32) * SR);
  const swLen = Math.floor(0.45 * SR);
  let lp = 0;
  for (let i = 0; i < swLen; i++) {
    const u = i / swLen;
    const env = Math.sin(Math.PI * u);
    const cut = 300 + 3800 * env * env;
    const a = 1 - Math.exp((-TWO_PI * cut) / SR);
    lp += a * ((rand() * 2 - 1) - lp);
    const pan = -0.9 + 1.8 * u;
    addSample(dryL, dryR, sw0 + i, lp * env * gain * 1.4, pan);
  }
}

// 9. Foley: Rising Glitch / Temperature Meltdown Chaos
function addTempMeltdown(startSec, durSec, gain = 0.16) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.floor(durSec * SR);
  // Shepard-like rising detuned tension + stepped random bleeps
  let p1 = 0, p2 = 0, p3 = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const u = t / durSec;
    const env = Math.sin(Math.min(1, u * 5) * Math.PI * 0.5) * (u > 0.94 ? (1 - u) / 0.06 : 1);
    const f1 = 110 * Math.pow(2, u * 2.5);
    const f2 = 220 * Math.pow(2, ((u * 2.5) % 1.0));
    const f3 = 440 * Math.pow(2, ((u * 2.5 + 0.5) % 1.0));
    p1 += (TWO_PI * f1) / SR;
    p2 += (TWO_PI * f2) / SR;
    p3 += (TWO_PI * f3) / SR;
    // Slight bitcrush quantization increases with u
    let sig = (Math.sin(p1) * 0.4 + Math.sin(p2) * 0.35 + Math.sin(p3) * 0.25);
    const steps = Math.max(6, Math.floor(48 * (1 - u * 0.8)));
    sig = Math.round(sig * steps) / steps;
    const pan = Math.sin(TWO_PI * (1.5 + u * 6) * t) * 0.7;
    addSample(dryL, dryR, s0 + i, sig * env * gain * (0.4 + 0.6 * u), pan);
    addSample(sendL, sendR, s0 + i, sig * env * gain * 0.5, -pan);
  }
  // Wild erratic micro-arpeggio sparks
  let cur = startSec;
  const scale = [62, 65, 68, 71, 74, 77, 81, 86, 89];
  while (cur < startSec + durSec - 0.12) {
    const u = (cur - startSec) / durSec;
    const step = Math.max(0.055, 0.19 - u * 0.12);
    const note = scale[Math.floor(rand() * scale.length)] + (rand() > 0.6 ? 12 : 0);
    addGlassBell(cur, note, 0.055 + u * 0.04, 0.14, rand() * 1.6 - 0.8, 3.14, 3.5 + u * 4, 0.45);
    cur += step;
  }
}

// 10. Foley: Crisp Two-Note Chat Notification Ding
function addChatDing(startSec, gain = 0.2) {
  addGlassBell(startSec, 81, gain * 0.9, 0.42, -0.12, 2.0, 0.8, 0.35);       // A5
  addGlassBell(startSec + 0.095, 86, gain * 1.0, 0.85, 0.15, 2.0, 0.7, 0.45); // D6
}

// 11. Subtle Clockwork Micro-Tick (Act III Attention Polyrhythm)
function addClockTick(startSec, gain = 0.08, pan = 0, hi = false) {
  const s0 = Math.floor(startSec * SR);
  const len = Math.floor(0.03 * SR);
  const f = hi ? 3200 : 1450;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    const v = (Math.sin(TWO_PI * f * t) * 0.6 + (rand() * 2 - 1) * 0.4) * Math.exp(-t / 0.0045);
    addSample(dryL, dryR, s0 + i, v * gain, pan);
    addSample(sendL, sendR, s0 + i, v * gain * 0.2, -pan);
  }
}

// ============================================================================
// COMPOSE ALL 6 ACTS (Key of D minor / D Dorian -> D Major apotheosis in Act V)
// ============================================================================
console.log('Composing Act I: The Blinking Dot (0 - 22s)...');
// Lonely keystroke launches the prompt
addKeyClick(0.45, 0.24, 0, 1.0);
// Deep meditative cathedral drone (D2 + A2 + F3 + E4)
addSubSwell(1.0, 15.0, 38, 0.16, 0.18, 2.5, 3.0);
addWarmPad(2.0, 14.0, [50, 57, 62, 65], 0.048, 520, 3.0, 3.0, 0.7);
// Sparse hypnotic single glass pings synced to cursor pulse
[1.6, 4.8, 8.0, 11.2, 14.4].forEach((t, idx) => {
  addGlassBell(t, [74, 76, 77, 81, 74][idx], 0.055, 2.2, (idx % 2 ? 0.35 : -0.35), 2.0, 1.2, 0.75);
});
// Monumental Title Card Reveal @ 16.0s
addImpact(16.0, 0.36, 130, 36.7, 2.4);
addSubSwell(16.0, 5.8, 38, 0.22, 0.48, 0.4, 1.8);
addWarmPad(16.0, 5.5, [50, 57, 64, 69, 74], 0.068, 1350, 0.5, 2.2, 0.68);
addGlassBell(16.05, 86, 0.09, 3.2, 0, 2.0, 1.5, 0.8);

console.log('Composing Act II: The Embedding Ocean (22 - 51s)...');
addImpact(22.0, 0.32, 140, 41, 1.6);
// Lush Dorian chord progression: Dm9 -> G13 -> Bbmaj7 -> Am9
const a2Chords = [
  { t: 22.0, d: 7.0, notes: [50, 57, 60, 64, 65], bass: 38 }, // Dm9
  { t: 29.0, d: 7.0, notes: [43, 55, 59, 62, 64], bass: 43 }, // G6/9
  { t: 36.0, d: 7.0, notes: [46, 53, 57, 60, 62], bass: 46 }, // Bbmaj9
  { t: 43.0, d: 7.5, notes: [45, 52, 55, 59, 60], bass: 45 }, // Am9
];
for (const c of a2Chords) {
  addWarmPad(c.t, c.d, c.notes, 0.058, 1050, 1.2, 2.0, 0.65);
  addSubSwell(c.t, c.d, c.bass, 0.14, 0.22, 0.8, 1.4);
}
// Shimmering Philip Glass / Max Cooper polyrhythmic arpeggio (16th-note pulse at 112 BPM)
const arp2 = [62, 69, 72, 76, 74, 69, 77, 76, 72, 69, 64, 72];
for (let step = 0; step < 110; step++) {
  const t = 22.5 + step * 0.25;
  if (t > 47.4) break;
  const n = arp2[step % arp2.length] + (step % 16 === 0 ? 12 : 0);
  const pan = Math.sin(step * 0.55) * 0.65;
  addGlassBell(t, n, 0.042, 0.55, pan, 2.0, 1.4, 0.58);
}
// Sonar pings near semantic clusters
[26.5, 34.2, 40.5].forEach((t, i) => addGlassBell(t, 86 + i * 2, 0.05, 1.8, i % 2 ? 0.5 : -0.5, 3.0, 0.6, 0.8));
// SAFETY DIVERT GAG @ 47.6s
addSafetyDivert(47.6, 0.24);

console.log('Composing Act III: The Attention Cathedral (51 - 78s)...');
addImpact(51.0, 0.34, 150, 36.7, 1.8);
// Kinetic clockwork cathedral: driving polyrhythmic pulse + monumental brass/pad chords
const a3Chords = [
  { t: 51.0, d: 6.5, notes: [50, 57, 62, 69], bass: 38 },
  { t: 57.5, d: 6.5, notes: [48, 55, 62, 67], bass: 36 },
  { t: 64.0, d: 6.5, notes: [46, 53, 60, 69], bass: 34 },
  { t: 70.5, d: 7.2, notes: [45, 52, 61, 69, 76], bass: 33 }, // A7sus4 -> convergence tension!
];
for (const c of a3Chords) {
  addWarmPad(c.t, c.d, c.notes, 0.062, 1250, 0.9, 1.6, 0.62);
  addSubSwell(c.t, c.d, c.bass, 0.17, 0.36, 0.6, 1.2);
}
// 96-head mechanical precision ticks + melodic marimba cross-rhythm
const a3Melody = [74, 76, 77, 81, 79, 77, 76, 72];
for (let i = 0; i < 155; i++) {
  const t = 51.2 + i * 0.17;
  if (t > 77.6) break;
  const accent = i % 4 === 0;
  addClockTick(t, accent ? 0.09 : 0.045, Math.sin(i * 0.7) * 0.65, i % 6 === 0);
  if (i % 2 === 0) {
    const n = a3Melody[(i / 2) % a3Melody.length] + (t > 71.0 ? 12 : 0);
    addGlassBell(t, n, 0.048, 0.38, Math.cos(i * 0.4) * 0.6, 1.5, 2.2, 0.5);
  }
}
// Head 19 "weird" obsession harmonic spike @ 67.5s
addGlassBell(67.5, 88, 0.085, 1.8, 0.4, 2.756, 3.2, 0.7);
// Solar convergence swell @ 74.5 - 78.0s
addSubSwell(74.2, 3.6, 45, 0.24, 0.65, 2.6, 0.6);

console.log('Composing Act IV: The Logit Casino & Temperature 2.1 (78 - 109s)...');
addImpact(78.0, 0.36, 160, 41, 1.4);
// Playful, sly pizzicato/marimba casino tension (78 - 96.8s)
const casinoBass = [38, 41, 43, 44, 45, 43, 41, 40];
for (let i = 0; i < 62; i++) {
  const t = 78.3 + i * 0.3;
  if (t > 96.8) break;
  const b = casinoBass[i % casinoBass.length];
  addGlassBell(t, b + 12, 0.08, 0.22, -0.25, 1.0, 0.9, 0.25);
  if (i % 2 === 1) {
    addGlassBell(t, b + 24 + (i % 4 === 3 ? 3 : 0), 0.055, 0.18, 0.35, 2.0, 1.5, 0.3);
  }
  addClockTick(t, 0.06, 0, i % 4 === 0);
}
// Subtle velvet suspense pad under casino
addWarmPad(78.5, 18.0, [50, 56, 62, 65], 0.042, 720, 1.5, 1.0, 0.5);
// COMEDY FOLEY BEATS (locked to Daniel's exact lines in timings.json!):
// a4_02: "41.2%: Certainly! ... No. Have some self-respect." (85.40 -> 90.99)
addLaserZap(88.25, 0.28);
// a4_03: "28.7%: As an AI language model... Absolutely not. Eject it into the void." (91.34 -> 96.89)
addVoidEject(94.65, 0.30);
// a4_04: TEMPERATURE 2.1 MELTDOWN (97.24 -> 104.85)
addTempMeltdown(97.2, 7.6, 0.15);
// BULLET-TIME FREEZE @ 105.0s: sudden vacuum silence + single transcendent golden harp chime!
addImpact(105.05, 0.22, 85, 36.7, 2.2);
addGlassBell(105.12, 74, 0.10, 3.8, -0.2, 2.0, 0.6, 0.88);
addGlassBell(105.24, 81, 0.09, 3.8, 0.0, 2.0, 0.6, 0.88);
addGlassBell(105.36, 86, 0.10, 4.0, 0.2, 2.0, 0.6, 0.88);
addWarmPad(105.2, 3.6, [50, 57, 62, 69], 0.055, 850, 0.6, 1.5, 0.78);

console.log('Composing Act V: The Dream of Infinite Forms — IMAX Climax (109 - 143.5s)...');
// Lush, emotional Interstellar x Max Cooper progression (builds from intimate to awe-inspiring climax)
addImpact(109.0, 0.38, 130, 36.7, 2.8);
const a5Chords = [
  { t: 109.0, d: 6.5, notes: [50, 57, 62, 65, 69], bass: 38, g: 0.065, cut: 950 },  // Dm9 (Temple)
  { t: 115.5, d: 6.5, notes: [46, 53, 57, 62, 65], bass: 34, g: 0.072, cut: 1150 }, // Bbmaj9
  { t: 122.0, d: 6.5, notes: [48, 55, 60, 64, 67], bass: 36, g: 0.080, cut: 1400 }, // Cmaj9 (Black Hole)
  { t: 128.5, d: 6.5, notes: [45, 52, 57, 64, 69], bass: 33, g: 0.088, cut: 1750 }, // Asus2 -> soaring
  { t: 135.0, d: 8.2, notes: [50, 57, 62, 66, 69, 74, 78], bass: 38, g: 0.105, cut: 2400 }, // D MAJOR 9 APOTHEOSIS!!
];
for (const c of a5Chords) {
  addWarmPad(c.t, c.d, c.notes, c.g, c.cut, 1.4, 2.5, 0.72);
  addSubSwell(c.t, c.d, c.bass, 0.19 + (c.t > 128 ? 0.07 : 0), 0.32 + (c.t > 128 ? 0.35 : 0), 1.0, 1.8);
}
// Soaring arpeggiated crystalline constellation throughout Act V, rising in density & octave
const a5ArpMinor = [62, 69, 74, 77, 81, 77, 74, 69];
const a5ArpMajor = [62, 69, 74, 78, 81, 86, 81, 78];
for (let step = 0; step < 172; step++) {
  const t = 109.4 + step * 0.195;
  if (t > 142.8) break;
  const progress = (t - 109.4) / 33.4;
  const seq = t >= 134.8 ? a5ArpMajor : a5ArpMinor;
  const note = seq[step % seq.length] + (progress > 0.72 && step % 4 === 0 ? 12 : 0);
  const gain = 0.036 + progress * 0.048;
  const pan = Math.sin(step * 0.42) * 0.75;
  addGlassBell(t, note, gain, 0.85 + progress * 0.6, pan, 2.0, 1.1 + progress * 0.9, 0.75);
}
// Deep heartbeat pulse during the Black Hole & Dyson Lotus (122 - 141s)
for (let bt = 122.0; bt < 141.5; bt += 1.6) {
  addImpact(bt, 0.20 + ((bt - 122) / 20) * 0.12, 90, 36, 0.9);
}
// Final pure harmonic bell resolution @ 141.8s
addGlassBell(141.8, 86, 0.11, 3.2, 0, 2.0, 0.5, 0.85);

console.log('Composing Act VI: The Output & Punchline (143.5 - 165s)...');
// Hyperspeed reverse-suction collapse @ 143.5 - 145.3s
addVoidEject(143.5, 0.34);
addImpact(145.2, 0.24, 95, 42, 1.1);
// Minimal, dry, polite lo-fi warm chord underneath the deadpan chat window
addWarmPad(145.5, 7.5, [50, 57, 62, 66], 0.036, 620, 1.0, 2.2, 0.45);
// Delicate keyboard typing burst for "Sure! Here is a weird little film." (155.15 -> 157.45s)
const msgLen = 34;
for (let c = 0; c < msgLen; c++) {
  const t = 155.15 + c * 0.062 + (rand() - 0.5) * 0.015;
  addKeyClick(t, 0.14 + rand() * 0.06, (rand() - 0.5) * 0.25, 0.92 + rand() * 0.18);
}
// Cheerful little chat notification DING! right as message sends @ 157.55s
addChatDing(157.55, 0.22);
// Warm closing major chord under "You're welcome..." & End Card
addWarmPad(158.6, 5.2, [50, 57, 66, 69, 74], 0.052, 920, 0.8, 2.4, 0.72);
addGlassBell(161.2, 74, 0.07, 3.4, -0.25, 2.0, 0.6, 0.82);
addGlassBell(161.45, 81, 0.065, 3.4, 0.25, 2.0, 0.6, 0.82);

// ============================================================================
// STEREO ALGORITHMIC HALL REVERB (Freeverb 8 comb + 4 allpass per channel)
// ============================================================================
console.log('Rendering stereo algorithmic hall reverb...');
function runReverbChannel(input, combDelays, apDelays, feedback = 0.855, damp = 0.28) {
  const out = new Float32Array(N);
  const combs = combDelays.map((d) => ({ buf: new Float32Array(d), idx: 0, store: 0, len: d }));
  const aps = apDelays.map((d) => ({ buf: new Float32Array(d), idx: 0, len: d }));

  for (let i = 0; i < N; i++) {
    const x = input[i];
    let sum = 0;
    for (let c = 0; c < combs.length; c++) {
      const cb = combs[c];
      const y = cb.buf[cb.idx];
      cb.store = y * (1 - damp) + cb.store * damp;
      cb.buf[cb.idx] = x + cb.store * feedback;
      if (++cb.idx >= cb.len) cb.idx = 0;
      sum += y;
    }
    let v = sum * 0.16;
    for (let a = 0; a < aps.length; a++) {
      const ap = aps[a];
      const bufOut = ap.buf[ap.idx];
      ap.buf[ap.idx] = v + bufOut * 0.5;
      v = bufOut - v;
      if (++ap.idx >= ap.len) ap.idx = 0;
    }
    out[i] = v;
  }
  return out;
}

const combBase = [1213, 1297, 1399, 1483, 1559, 1637, 1709, 1777];
const apBase = [607, 487, 373, 241];
const revL = runReverbChannel(sendL, combBase, apBase, 0.86, 0.30);
const revR = runReverbChannel(sendR, combBase.map((d) => d + 29), apBase.map((d) => d + 17), 0.86, 0.30);

// Combine dry + wet, apply soft master limiter & gentle fade-out at 164.0-165.0s
const scoreL = new Float32Array(N);
const scoreR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  let fade = 1.0;
  if (i > N - SR * 1.2) {
    fade = Math.max(0, (N - i) / (SR * 1.2));
  }
  scoreL[i] = Math.tanh((dryL[i] + revL[i] * 0.92) * 1.05) * 0.92 * fade;
  scoreR[i] = Math.tanh((dryR[i] + revR[i] * 0.92) * 1.05) * 0.92 * fade;
}

// Write 32-bit float stereo WAV helper
function writeFloatWav(filePath, chL, chR) {
  const numSamples = chL.length;
  const dataBytes = numSamples * 2 * 4;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(3, 20); // IEEE float
  header.writeUInt16LE(2, 22); // stereo
  header.writeUInt32LE(SR, 24);
  header.writeUInt32LE(SR * 2 * 4, 28);
  header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataBytes, 40);

  const body = Buffer.allocUnsafe(dataBytes);
  for (let i = 0; i < numSamples; i++) {
    body.writeFloatLE(chL[i], i * 8);
    body.writeFloatLE(chR[i], i * 8 + 4);
  }
  fs.writeFileSync(filePath, Buffer.concat([header, body]));
}

const scorePath = path.join(AUDIO_DIR, 'score_stem.wav');
writeFloatWav(scorePath, scoreL, scoreR);
console.log(`Wrote procedural score: ${scorePath}`);

// Master mix: sidechain-duck score under narration + broadcast loudness normalization (-14 LUFS)
const narrationPath = path.join(AUDIO_DIR, 'narration_stem.wav');
const masterPath = path.join(AUDIO_DIR, 'master_mix.wav');

execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-i', scorePath,
  '-i', narrationPath,
  '-filter_complex',
  '[1:a]asplit=2[vox_sc][vox_mix];' +
  '[0:a]volume=0.82[mus_in];' +
  '[mus_in][vox_sc]sidechaincompress=threshold=0.015:ratio=3.2:attack=25:release=340:makeup=1[mus_duck];' +
  '[vox_mix]volume=1.18[vox_up];' +
  '[mus_duck][vox_up]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95:attack=5:release=50,loudnorm=I=-14:TP=-1.0:LRA=11[out]',
  '-map', '[out]',
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s24le',
  masterPath,
]);
console.log(`Mastered final stereo mix: ${masterPath}`);
