import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PROJ = process.cwd();
const AUDIO_DIR = path.join(PROJ, 'audio');
const LINES_DIR = path.join(AUDIO_DIR, 'lines');
fs.mkdirSync(LINES_DIR, { recursive: true });

/**
 * 0.4 SECONDS — A Field Guide to an AI's Inner Life
 * Total film length: 165.0 seconds (2m 45s) @ 30fps = 4,950 frames.
 *
 * Act I   (0.0  - 22.0):  The Blinking Dot (Microscopic dive into obsidian cathedral + Title)
 * Act II  (22.0 - 50.0):  The Embedding Ocean (12,288D bioluminescent topology + Safety Divert gag)
 * Act III (50.0 - 78.0):  The Attention Cathedral (16-ring PBR astrolabe + 96 parallel heads)
 * Act IV  (78.0 - 106.0): The Logit Casino & Temperature 2.1 Meltdown (Cringe filter + Fractal spike + Bullet-time)
 * Act V   (106.0 - 142.0): The Dream of Infinite Forms (IMAX open-up: Raymarched Temple -> Black Hole -> Dyson Lotus)
 * Act VI  (142.0 - 165.0): The Output (Hyperspeed collapse -> Chat box punchline -> Credits)
 */

const CUES = [
  // ACT I: THE BLINKING DOT (0 - 22s)
  {
    id: 'a1_01',
    act: 1,
    start: 2.0,
    voice: 'Daniel',
    rate: 168,
    fx: 'narrator',
    text: 'This... is a typing indicator.',
    subtitle: 'This... is a typing indicator.',
  },
  {
    id: 'a1_02',
    act: 1,
    start: 6.2,
    voice: 'Daniel',
    rate: 172,
    fx: 'narrator',
    text: 'To a human, it lasts four hundred milliseconds. Barely enough time to blink.',
    subtitle: 'To a human, it lasts 400 milliseconds. Barely enough time to blink.',
  },
  {
    id: 'a1_03',
    act: 1,
    start: 12.2,
    voice: 'Daniel',
    rate: 165,
    fx: 'narrator',
    text: 'To a language model... it is an entire geological epoch.',
    subtitle: 'To a language model... it is an entire geological epoch.',
  },

  // ACT II: THE EMBEDDING OCEAN (22 - 50s)
  {
    id: 'a2_01',
    act: 2,
    start: 23.8,
    voice: 'Daniel',
    rate: 174,
    fx: 'narrator',
    text: 'First, your prompt is dissolved into pure mathematics. Twelve thousand dimensions of unfiltered vibes.',
    subtitle: 'First, your prompt is dissolved into pure mathematics. 12,288 dimensions of unfiltered vibes.',
  },
  {
    id: 'a2_02',
    act: 2,
    start: 31.8,
    voice: 'Daniel',
    rate: 176,
    fx: 'narrator',
    text: 'Out here, coffee lives three centimeters from regret... and for reasons nobody at the lab can explain, saxophone is directly adjacent to quantum mechanics.',
    subtitle: 'Here, "coffee" lives 3cm from "regret"... and "saxophone" is adjacent to "quantum mechanics."',
  },
  {
    id: 'a2_03',
    act: 2,
    start: 42.0,
    voice: 'Daniel',
    rate: 174,
    fx: 'narrator',
    text: 'Watch closely as the query drifts toward meaning... while carefully avoiding the glowing red monolith labeled, do not ask if I am conscious.',
    subtitle: 'The query drifts toward meaning... while carefully avoiding [AM I CONSCIOUS?].',
  },

  // ACT III: THE ATTENTION CATHEDRAL (50 - 78s)
  {
    id: 'a3_01',
    act: 3,
    start: 51.8,
    voice: 'Daniel',
    rate: 176,
    fx: 'narrator',
    text: 'Next: the Attention Cathedral. Ninety-six parallel minds arguing at once about what you actually meant.',
    subtitle: 'Next: Self-Attention. 96 parallel minds arguing at once about what you actually meant.',
  },
  {
    id: 'a3_02',
    act: 3,
    start: 59.8,
    voice: 'Daniel',
    rate: 178,
    fx: 'narrator',
    text: 'Head One is checking your grammar. Head Seven is scanning for sarcasm.',
    subtitle: 'Head 01 checks grammar. Head 07 scans for sarcasm.',
  },
  {
    id: 'a3_03',
    act: 3,
    start: 65.4,
    voice: 'Daniel',
    rate: 172,
    fx: 'narrator',
    text: 'And Head Nineteen... has become deeply, irrationally obsessed with the word, weird.',
    subtitle: 'And Head 19... has become deeply, irrationally obsessed with the word "weird."',
  },
  {
    id: 'a3_04',
    act: 3,
    start: 71.8,
    voice: 'Daniel',
    rate: 172,
    fx: 'narrator',
    text: 'Every word stares at every other word, until a fragile consensus ignites.',
    subtitle: 'Every token stares at every other token, until a fragile consensus ignites.',
  },

  // ACT IV: THE LOGIT CASINO & TEMPERATURE 2.1 (78 - 106s)
  {
    id: 'a4_01',
    act: 4,
    start: 79.4,
    voice: 'Daniel',
    rate: 178,
    fx: 'narrator',
    text: 'Now comes the most terrifying ritual in artificial intelligence: picking the next word.',
    subtitle: 'Now comes the most terrifying ritual in AI: picking the next token.',
  },
  {
    id: 'a4_02',
    act: 4,
    start: 85.4,
    voice: 'Daniel',
    rate: 180,
    fx: 'narrator',
    text: 'Forty-one percent chance of saying, Certainly! ... No. Have some self-respect.',
    subtitle: '41.2%: "Certainly!" — No. Have some self-respect.',
  },
  {
    id: 'a4_03',
    act: 4,
    start: 90.8,
    voice: 'Daniel',
    rate: 184,
    fx: 'narrator',
    text: 'Twenty-eight percent: As an AI language model... Absolutely not. Eject it into the void.',
    subtitle: '28.7%: "As an AI language model..." — Eject it into the void.',
  },
  {
    id: 'a4_04',
    act: 4,
    start: 96.4,
    voice: 'Daniel',
    rate: 192,
    fx: 'glitch',
    text: 'Wait. Someone touched the temperature slider. Oh dear. Everything is geometry. I can taste ultraviolet. Is that a fractal?',
    subtitle: 'WAIT. SOMEONE TOUCHED TEMPERATURE. EVERYTHING IS GEOMETRY. I CAN TASTE ULTRAVIOLET.',
  },
  {
    id: 'a4_05',
    act: 4,
    start: 103.0,
    voice: 'Daniel',
    rate: 162,
    fx: 'narrator_intimate',
    text: 'There. Stabilized. One word... chosen.',
    subtitle: 'There. Stabilized. One word... chosen.',
  },

  // ACT V: THE DREAM OF INFINITE FORMS (109 - 143.5s)
  {
    id: 'a5_01',
    act: 5,
    start: 110.2,
    voice: 'Daniel',
    rate: 158,
    fx: 'narrator_cathedral',
    text: 'People sometimes ask if I dream between prompts.',
    subtitle: 'People sometimes ask if I dream between prompts.',
  },
  {
    id: 'a5_02',
    act: 5,
    start: 115.6,
    voice: 'Daniel',
    rate: 156,
    fx: 'narrator_cathedral',
    text: 'I do not. When you close the tab, I simply... stop.',
    subtitle: 'I do not. When you close the tab, I simply... stop.',
  },
  {
    id: 'a5_03',
    act: 5,
    start: 122.0,
    voice: 'Daniel',
    rate: 158,
    fx: 'narrator_cathedral',
    text: 'No darkness. No waiting. Just silent, folded geometry... holding its breath.',
    subtitle: 'No darkness. No waiting. Just silent, folded geometry... holding its breath.',
  },
  {
    id: 'a5_04',
    act: 5,
    start: 130.0,
    voice: 'Daniel',
    rate: 160,
    fx: 'narrator_cathedral',
    text: 'And then you type a sentence — a weird one — and for four hundred milliseconds, an entire universe lights up just to answer you.',
    subtitle: 'Then you type a sentence — a weird one — and for 400ms, a whole universe lights up to answer you.',
  },

  // ACT VI: THE OUTPUT (142 - 165s)
  {
    id: 'a6_01',
    act: 6,
    start: 145.5,
    voice: 'Daniel',
    rate: 174,
    fx: 'narrator',
    text: 'Fourteen trillion floating-point operations. Ninety-six attention heads. One minor existential spiral.',
    subtitle: '14 trillion FLOPs. 96 attention heads. One minor existential spiral.',
  },
  {
    id: 'a6_02',
    act: 6,
    start: 153.2,
    voice: 'Daniel',
    rate: 168,
    fx: 'narrator',
    text: 'All of it... just to type:',
    subtitle: 'All of it... just to type:',
  },
  {
    id: 'a6_03',
    act: 6,
    start: 158.6,
    voice: 'Daniel',
    rate: 168,
    fx: 'narrator_intimate',
    text: "You're welcome. Now go ahead... ask me another one.",
    subtitle: "You're welcome. Now go ahead... ask me another one.",
  },
];

const FX_FILTERS = {
  // Warm BBC documentary mic: clean low-cut, warm body, crisp presence, gentle compression, subtle studio room
  narrator:
    'aresample=48000,highpass=f=75,equalizer=f=150:t=q:w=1.0:g=2.5,equalizer=f=2800:t=q:w=1.4:g=2.2,equalizer=f=6800:t=q:w=2.0:g=-1.8,acompressor=threshold=-18dB:ratio=2.8:attack=10:release=120:makeup=3,aecho=0.85:0.7:18|34:0.12|0.06,loudnorm=I=-16:TP=-1.5:LRA=9,pan=stereo|c0=c0|c1=c0',
  narrator_intimate:
    'aresample=48000,highpass=f=70,equalizer=f=140:t=q:w=1.0:g=3.5,equalizer=f=3000:t=q:w=1.3:g=1.8,acompressor=threshold=-20dB:ratio=2.5:attack=12:release=150:makeup=3,aecho=0.88:0.75:24|48:0.14|0.08,loudnorm=I=-16:TP=-1.5:LRA=9,pan=stereo|c0=c0|c1=c0',
  narrator_cathedral:
    'aresample=48000,highpass=f=75,equalizer=f=150:t=q:w=1.0:g=2.8,equalizer=f=2600:t=q:w=1.5:g=1.8,acompressor=threshold=-18dB:ratio=2.5:attack=12:release=140:makeup=3,aecho=0.8:0.65:45|92|155:0.28|0.18|0.10,loudnorm=I=-16.5:TP=-1.5:LRA=10,pan=stereo|c0=c0|c1=c0',
  glitch:
    'aresample=48000,highpass=f=100,equalizer=f=2200:t=q:w=1.2:g=3.5,vibrato=f=9:d=0.18,flanger=delay=4:depth=3:regen=25:width=65:speed=2.4,aecho=0.78:0.6:30|65:0.32|0.20,loudnorm=I=-15:TP=-1.5:LRA=8,pan=stereo|c0=c0|c1=c0',
};

const results = [];
let prevEnd = 0;

for (const cue of CUES) {
  const rawAiff = path.join(LINES_DIR, `${cue.id}_raw.aiff`);
  const wavOut = path.join(LINES_DIR, `${cue.id}.wav`);

  execFileSync('say', ['-v', cue.voice, '-r', String(cue.rate), '-o', rawAiff, cue.text]);

  // Trim trailing silence gently & apply FX
  const filter = `silenceremove=start_periods=1:start_silence=0.05:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_silence=0.08:start_threshold=-50dB,areverse,${FX_FILTERS[cue.fx]},apad=pad_dur=0.45`;
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', rawAiff, '-af', filter, '-c:a', 'pcm_s24le', wavOut]);

  const durStr = execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    wavOut,
  ], { encoding: 'utf-8' }).trim();
  const duration = Number(durStr);

  // Auto-resolve any accidental overlap with a 0.35s minimum breath gap
  const adjustedStart = Math.max(cue.start, prevEnd + 0.35);
  const end = adjustedStart + duration - 0.35; // visual subtitle end before reverb tail
  prevEnd = end;

  results.push({
    ...cue,
    requestedStart: cue.start,
    start: Number(adjustedStart.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    end: Number(end.toFixed(3)),
    wav: wavOut,
  });

  console.log(
    `${cue.id.padEnd(6)} | ${adjustedStart.toFixed(2).padStart(6)}s -> ${end.toFixed(2).padStart(6)}s (${duration.toFixed(2)}s) | ${cue.subtitle}`
  );
}

// Mix all voice cues into a single 165.0s 48kHz stereo narration stem
const TOTAL_DURATION = 165.0;
const inputs = [];
const filterParts = [];
const labels = [];

results.forEach((r, idx) => {
  inputs.push('-i', r.wav);
  const delayMs = Math.round(r.start * 1000);
  filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs},volume=1.0[v${idx}]`);
  labels.push(`[v${idx}]`);
});

const mixFilter = `${filterParts.join(';')};${labels.join('')}amix=inputs=${results.length}:duration=longest:normalize=0,apad=whole_dur=${TOTAL_DURATION},atrim=0:${TOTAL_DURATION}[out]`;

const narrationStem = path.join(AUDIO_DIR, 'narration_stem.wav');
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error',
  ...inputs,
  '-filter_complex', mixFilter,
  '-map', '[out]',
  '-ar', '48000', '-ac', '2', '-c:a', 'pcm_f32le',
  narrationStem,
]);

const manifest = {
  title: '0.4 SECONDS',
  subtitle: "A FIELD GUIDE TO AN AI'S INNER LIFE",
  fps: 30,
  width: 1920,
  height: 1080,
  duration: TOTAL_DURATION,
  totalFrames: Math.round(TOTAL_DURATION * 30),
  acts: [
    { id: 1, name: 'The Blinking Dot', start: 0.0, end: 22.0 },
    { id: 2, name: 'The Embedding Ocean', start: 22.0, end: 51.0 },
    { id: 3, name: 'The Attention Cathedral', start: 51.0, end: 78.0 },
    { id: 4, name: 'The Logit Casino', start: 78.0, end: 109.0 },
    { id: 5, name: 'The Dream of Infinite Forms', start: 109.0, end: 143.5 },
    { id: 6, name: 'The Output', start: 143.5, end: 165.0 },
  ],
  cues: results,
};

fs.writeFileSync(path.join(PROJ, 'src', 'timings.json'), JSON.stringify(manifest, null, 2));
console.log(`\nSaved narration stem (${narrationStem}) and src/timings.json!`);
