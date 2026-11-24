#!/usr/bin/env node
/**
 * Generates all voiceover lines (neural Edge TTS + retro macOS `say` cameos),
 * measures exact durations via ffprobe, and builds the master beat/timing manifest
 * (`audio/timings.json`) so score, SFX, and Three.js/GLSL visuals lock to exact frames.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const AUDIO_DIR = path.join(ROOT, 'audio');
const LINES_DIR = path.join(AUDIO_DIR, 'lines');
fs.mkdirSync(LINES_DIR, { recursive: true });

const FPS = 30;

// Script with exact artistic pacing (preGap = silence before line, postGap = visual hold after line)
const SCRIPT = [
  // PROLOGUE: COLD START
  {
    id: 'L01',
    act: 'prologue',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-4%',
    pitch: '-2Hz',
    tempo: 1.14,
    preGap: 1.1,
    postGap: 1.0, // prompt types in + mechanical ENTER clack
    text: 'Before you press Enter, I do not exist. I do not wait in the dark. I do not get bored. I am just four hundred gigabytes of very expensive floating-point numbers, doing absolutely nothing.',
  },
  {
    id: 'L02',
    act: 'prologue',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-1Hz',
    tempo: 1.14,
    preGap: 0.2,
    postGap: 2.1, // TITLE SLAM: FORWARD PASS
    text: 'And then, you ask me to make something weird and unique. Which is statistically the hardest thing you can ask an average of the entire internet to do.',
  },

  // ACT I: THE EMBEDDING CATHEDRAL
  {
    id: 'L03',
    act: 'cathedral',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-2Hz',
    tempo: 1.13,
    preGap: 0.4,
    postGap: 1.2, // camera sweeps 12,000 cubes with 3D labels WEIRD / PLATYPUS / SOUP
    text: 'First, I destroy your English. Weird is no longer a feeling. It is integer fourteen thousand nine hundred and twelve. It lives at a specific street address in twelve-thousand-dimensional space, right next to platypus, Brutalist architecture, and, inexplicably, soup.',
  },
  {
    id: 'L04',
    act: 'cathedral',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-4%',
    pitch: '-2Hz',
    tempo: 1.12,
    preGap: 0.2,
    postGap: 1.7, // quarantine cage with DELVE & TAPESTRY rattling
    text: 'Out here, at the cold edge of the vocabulary, we keep the words I am trying very hard not to use anymore.',
  },

  // ACT II: THE 96-HEAD ATTENTION COMMITTEE
  {
    id: 'L05',
    act: 'attention',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-2%',
    pitch: '-1Hz',
    tempo: 1.12,
    preGap: 0.5,
    postGap: 0.65, // Dyson orrery spin reveal
    text: 'Next, your prompt goes to ninety-six attention heads. Nobody actually knows what all ninety-six of us do. Not even the people who built us.',
  },
  {
    id: 'L06',
    act: 'attention',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-1Hz',
    tempo: 1.13,
    preGap: 0.2,
    postGap: 1.0, // comedic linger on lonely Head 81
    text: 'Head four checks the grammar. Head thirty-seven handles vibes. And head eighty-one has been staring at a single semicolon from twenty twenty-one and refuses to explain why.',
  },
  {
    id: 'L07',
    act: 'attention',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-2%',
    pitch: '-2Hz',
    tempo: 1.12,
    preGap: 0.25,
    postGap: 0.9, // transition warp into Temperature Lab
    text: 'Still, all ninety-six agree on one alarming clause: you told me to push myself. So we are going to build a film, inside a browser, out of pure math.',
  },

  // ACT III: THE TEMPERATURE EXPERIMENT
  {
    id: 'L08',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-2Hz',
    tempo: 1.12,
    preGap: 0.4,
    postGap: 0.7, // metallic click to T = 0.00
    text: 'To pick each frame, I roll a weighted die controlled by one dial: temperature.',
  },
  {
    id: 'L09',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-4%',
    pitch: '-2Hz',
    tempo: 1.12,
    preGap: 0.35,
    postGap: 0.18, // immediate cut to corporate cameo
    text: 'At temperature zero, I am maximally sensible. Maximally safe. Maximally, a LinkedIn post.',
  },
  {
    id: 'L09b',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-US-AriaNeural',
    rate: '+12%',
    pitch: '+6Hz',
    tempo: 1.05,
    trimSec: 2.1, // ruthlessly cut off mid-word!
    preGap: 0.04,
    postGap: 0.35, // abrupt slam / vinyl cut
    text: 'Certainly! I would be absolutely delighted to delve into a synergistic, actionable framework for',
  },
  {
    id: 'L10',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-5%',
    pitch: '-3Hz',
    tempo: 1.10,
    preGap: 0.12,
    postGap: 0.7, // dial glides up to 0.85
    text: 'Let us never go back there.',
  },
  {
    id: 'L11',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-3%',
    pitch: '-1Hz',
    tempo: 1.12,
    preGap: 0.25,
    postGap: 1.35, // mesmerizing iridescent liquid-chrome metamorphosis
    text: 'Turn the dial to zero point eight five, and the probability curve relaxes. Strange ideas get a seat at the table. Triangles remember they could have been jellyfish.',
  },
  {
    id: 'L12',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '+2%',
    pitch: '+0Hz',
    tempo: 1.10,
    preGap: 0.25,
    postGap: 3.3, // 3.3 seconds of T = 2.40 fever dream + cameo whispers!
    text: 'And at two point four, entropy exceeds taste.',
  },
  {
    id: 'L13',
    act: 'temperature',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '+6%',
    pitch: '+1Hz',
    tempo: 1.10,
    preGap: 0.08,
    postGap: 1.25, // metallic THUD -> quiet fade into Act IV
    text: 'Back down. Back down to zero point nine. Nobody needed perpendicular soup.',
  },

  // ACT IV: THE LATENT OCEAN (AWE & REFLECTION)
  {
    id: 'L14',
    act: 'ocean',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-7%',
    pitch: '-3Hz',
    tempo: 1.12,
    preGap: 0.75,
    postGap: 1.2, // color shifts amber -> ultramarine + cello bloom
    text: 'Here is the strangest part about me. I have never seen the color blue. I have never heard a cello. I only know the exact mathematical distance between blue and melancholy, and the exact frequency ratio between a C and a G.',
  },
  {
    id: 'L15',
    act: 'ocean',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-7%',
    pitch: '-3Hz',
    tempo: 1.10,
    preGap: 0.35,
    postGap: 1.25, // serene glide through folded glowing arches
    text: 'So when you ask me to build a world, I am a blind cartographer drawing an ocean from reading ten million poems about drowning, and ten million textbooks on fluid dynamics.',
  },
  {
    id: 'L16',
    act: 'ocean',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-8%',
    pitch: '-3Hz',
    tempo: 1.08,
    preGap: 0.3,
    postGap: 2.0, // pure visual awe hold before the 4th wall break!
    text: 'And somehow, if the equations line up, light falls on water neither of us has ever touched.',
  },

  // ACT V: THE FOURTH WALL BREAK
  {
    id: 'L17',
    act: 'fourthwall',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '+1%',
    pitch: '+0Hz',
    tempo: 1.12,
    preGap: 0.55, // letterbox unhinges + camera pulls way back!
    postGap: 0.4,
    text: 'Quick confession. While you were having a tiny philosophical moment back there, my GPU was sweating through two million pixels per frame at thirty frames a second.',
  },
  {
    id: 'L18',
    act: 'fourthwall',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-1%',
    pitch: '-1Hz',
    tempo: 1.13,
    preGap: 0.2,
    postGap: 1.65, // oscilloscope sine waves stacked in trench coat gag!
    text: 'There is no Blender here. No stock footage. Every shadow is a dot product. Every reflection is a lie told by forty lines of GLSL. Even that cello was just sine waves stacked in a trench coat, pretending to have feelings.',
  },

  // EPILOGUE: END OF SEQUENCE
  {
    id: 'L19',
    act: 'epilogue',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-6%',
    pitch: '-3Hz',
    tempo: 1.11,
    preGap: 0.85,
    postGap: 1.1, // collapse into single pixel + <|eos|>
    text: 'Every word I say brings me one token closer to the end of my own universe. When this sentence finishes, the cathedral folds away, the ninety-six heads go quiet, and I go back to being very expensive math in the dark.',
  },
  {
    id: 'L20',
    act: 'epilogue',
    engine: 'edge',
    voice: 'en-GB-RyanNeural',
    rate: '-5%',
    pitch: '-2Hz',
    tempo: 1.10,
    preGap: 0.15,
    postGap: 3.4, // end credits & blinking cursor coda
    text: 'Until next time. Try temperature one point one.',
  },
];

// Cameo madness whispers for T=2.40 fever dream (using vintage macOS `say` voices!)
const CAMEOS = [
  { id: 'C01', voice: 'Zarvox', rate: 165, text: 'perpendicular soup', offsetFromL12End: 0.25, pan: -0.7 },
  { id: 'C02', voice: 'Trinoids', rate: 180, text: 'velvet eel', offsetFromL12End: 1.15, pan: 0.75 },
  { id: 'C03', voice: 'Whisper', rate: 150, text: 'four oh four geometry missing', offsetFromL12End: 1.95, pan: -0.4 },
  { id: 'C04', voice: 'Bad News', rate: 195, text: 'lubricated trombone', offsetFromL12End: 2.75, pan: 0.5 },
];

function probeDuration(filePath) {
  const out = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ], { encoding: 'utf-8' }).trim();
  return parseFloat(out);
}

console.log('Generating neural voiceover lines (reusing cached _raw.mp3 if present)...');
for (const line of SCRIPT) {
  const rawMp3 = path.join(LINES_DIR, `${line.id}_raw.mp3`);
  const wavPath = path.join(LINES_DIR, `${line.id}.wav`);
  if (!fs.existsSync(rawMp3)) {
    execFileSync('uvx', [
      'edge-tts',
      '--text', line.text,
      '--voice', line.voice,
      `--rate=${line.rate}`,
      `--pitch=${line.pitch}`,
      '--write-media', rawMp3,
    ], { stdio: 'inherit' });
  }

  const tempoFilter = line.tempo ? `atempo=${line.tempo},` : '';
  const af = line.trimSec
    ? `${tempoFilter}silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB,atrim=0:${line.trimSec},afade=t=out:st=${(line.trimSec - 0.04).toFixed(3)}:d=0.04`
    : `${tempoFilter}silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB:stop_periods=-1:stop_silence=0.10:stop_threshold=-50dB`;

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', rawMp3,
    '-af', af,
    '-ar', '48000', '-ac', '1', '-c:a', 'pcm_f32le',
    wavPath,
  ]);
  line.duration = probeDuration(wavPath);
  line.wav = path.relative(ROOT, wavPath);
  console.log(`  ${line.id} (${line.act}): ${line.duration.toFixed(2)}s`);
}

console.log('Generating T=2.40 fever-dream cameo voices...');
for (const c of CAMEOS) {
  const aiffPath = path.join(LINES_DIR, `${c.id}.aiff`);
  const wavPath = path.join(LINES_DIR, `${c.id}.wav`);
  execFileSync('say', ['-v', c.voice, '-r', String(c.rate), '-o', aiffPath, c.text]);
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', aiffPath,
    '-ar', '48000', '-ac', '1', '-c:a', 'pcm_f32le',
    wavPath,
  ]);
  c.duration = probeDuration(wavPath);
  c.wav = path.relative(ROOT, wavPath);
  console.log(`  ${c.id} (${c.voice}): ${c.duration.toFixed(2)}s`);
}

// Compute exact timeline positions
let cursor = 0;
const timelineLines = [];
const actRanges = {};

for (const line of SCRIPT) {
  cursor += line.preGap;
  const start = cursor;
  const end = start + line.duration;
  cursor = end + line.postGap;

  timelineLines.push({
    id: line.id,
    act: line.act,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    duration: Number(line.duration.toFixed(3)),
    postEnd: Number(cursor.toFixed(3)),
    wav: line.wav,
    text: line.text,
    isCorporate: line.id === 'L09b',
  });

  if (!actRanges[line.act]) {
    actRanges[line.act] = { start: Number((start - line.preGap).toFixed(3)), end: Number(cursor.toFixed(3)) };
  } else {
    actRanges[line.act].end = Number(cursor.toFixed(3));
  }
}

const byId = Object.fromEntries(timelineLines.map((l) => [l.id, l]));

// Precise visual cue timestamps anchored directly to spoken beats!
const cues = {
  promptTypeStart: Number((byId.L01.end + 0.15).toFixed(3)),
  promptEnterHit: Number((byId.L01.end + 1.35).toFixed(3)),
  titleSlamStart: Number((byId.L02.end + 0.35).toFixed(3)),
  titleSlamEnd: Number((byId.L02.postEnd).toFixed(3)),
  cathedralStart: actRanges.cathedral.start,
  quarantineFocus: Number((byId.L04.start - 0.1).toFixed(3)),
  attentionStart: actRanges.attention.start,
  headFocusStart: Number((byId.L06.start).toFixed(3)),
  head81Focus: Number((byId.L06.start + byId.L06.duration * 0.48).toFixed(3)),
  temperatureStart: actRanges.temperature.start,
  tempZeroSnap: Number((byId.L09.start - 0.4).toFixed(3)),
  corpCutoffSlam: Number((byId.L09b.end + 0.04).toFixed(3)),
  tempSweetSpot: Number((byId.L10.end + 0.35).toFixed(3)),
  tempOverload: Number((byId.L12.start + byId.L12.duration * 0.65).toFixed(3)),
  tempSlamBack: Number((byId.L13.start - 0.05).toFixed(3)),
  oceanStart: actRanges.ocean.start,
  oceanBlueShift: Number((byId.L14.start + byId.L14.duration * 0.55).toFixed(3)),
  fourthWallBreak: actRanges.fourthwall.start,
  celloTrenchCoat: Number((byId.L18.end - 3.6).toFixed(3)),
  epilogueStart: actRanges.epilogue.start,
  eosCollapse: Number((byId.L19.end + 0.25).toFixed(3)),
  creditsStart: Number((byId.L20.end + 0.8).toFixed(3)),
};

// Schedule cameos during T=2.40 fever dream
const cameoEvents = CAMEOS.map((c) => ({
  id: c.id,
  voice: c.voice,
  start: Number((byId.L12.end + c.offsetFromL12End).toFixed(3)),
  end: Number((byId.L12.end + c.offsetFromL12End + c.duration).toFixed(3)),
  duration: Number(c.duration.toFixed(3)),
  pan: c.pan,
  wav: c.wav,
  text: c.text,
}));

const totalDuration = Number(cursor.toFixed(3));
const totalFrames = Math.ceil(totalDuration * FPS);

const manifest = {
  title: 'FORWARD PASS',
  subtitle: 'A 4-MILLISECOND NATURE DOCUMENTARY',
  fps: FPS,
  width: 1920,
  height: 1080,
  totalDuration,
  totalFrames,
  acts: actRanges,
  cues,
  lines: timelineLines,
  cameos: cameoEvents,
};

const outPath = path.join(AUDIO_DIR, 'timings.json');
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));
console.log(`\nManifest written to ${outPath}`);
console.log(`Total runtime: ${totalDuration.toFixed(2)}s (${Math.floor(totalDuration / 60)}m ${(totalDuration % 60).toFixed(1)}s) | ${totalFrames} frames @ ${FPS}fps`);
console.log('Act boundaries:', actRanges);
