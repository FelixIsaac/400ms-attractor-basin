#!/usr/bin/env node
/**
 * Deterministic Apple M5 Hardware Metal WebGL2 Renderer for FORWARD PASS.
 * Modes:
 *   --preview : Renders 18 curated keyframes across all 7 acts + builds contact_sheet.png
 *   --full    : Launches 4 parallel headless Google Chrome Metal workers -> lossless concat -> muxes master_mix.wav -> FORWARD_PASS.mp4
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio/timings.json'), 'utf-8'));
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function startServer() {
  const threeRoot = path.join(ROOT, 'node_modules/three');
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath === '/favicon.ico') { res.writeHead(204); res.end(); return; }
      let fullPath;
      if (reqPath.startsWith('/vendor/three/')) {
        fullPath = path.join(threeRoot, reqPath.slice('/vendor/three/'.length));
      } else {
        const clean = reqPath === '/' ? 'src/film.html' : reqPath.replace(/^\/+/, '');
        fullPath = path.join(ROOT, clean);
      }
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not Found: ' + reqPath);
        return;
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function launchChrome() {
  return chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=metal',
      '--disable-dev-shm-usage',
    ],
  });
}

async function openFilmPage(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') console.error('[PAGE ERR]', m.text()); });
  page.on('pageerror', (e) => console.error('[PAGE CRASH]', e.message));
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__engineReady === true || window.__engineError, { timeout: 20000 });
  const err = await page.evaluate(() => window.__engineError || null);
  if (err) throw new Error('Film engine init failed: ' + err);
  // Warmup render 2 frames to compile all shaders & flush Metal pipeline
  await page.evaluate(() => { window.__renderFrame(0); window.__renderFrame(1); });
  return page;
}

async function runPreview(port) {
  const { acts, cues, fps } = MANIFEST;
  const shots = [
    ['01_cold_start', 5.0],
    ['02_prompt_enter', cues.promptEnterHit + 0.15],
    ['03_title_slam', cues.titleSlamStart + 0.85],
    ['04_cathedral_clusters', acts.cathedral.start + 10.8],
    ['05_quarantine_delve', cues.quarantineFocus + 3.0],
    ['06_attention_orrery', acts.attention.start + 5.0],
    ['07_heads_04_37', cues.headFocusStart + 2.8],
    ['08_head81_semicolon', cues.head81Focus + 2.8],
    ['09_temp_00_linkedin', cues.tempZeroSnap + 4.8],
    ['10_temp_00_aborted', cues.corpCutoffSlam + 0.08],
    ['11_temp_85_liquid', cues.tempSweetSpot + 5.5],
    ['12_temp_24_chaos', cues.tempOverload + 2.4],
    ['13_ocean_warm', acts.ocean.start + 4.0],
    ['14_ocean_ultramarine', cues.oceanBlueShift + 6.5],
    ['15_fourth_wall_rt', acts.fourthwall.start + 4.5],
    ['16_cello_trench_coat', cues.celloTrenchCoat + 2.2],
    ['17_epilogue_tesseract', acts.epilogue.start + 5.0],
    ['18_eos_credits', cues.creditsStart + 1.8],
  ];

  const outDir = path.join(ROOT, 'preview');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await launchChrome();
  const page = await openFilmPage(browser, port);

  const paths = [];
  for (const [label, sec] of shots) {
    const f = Math.min(MANIFEST.totalFrames - 1, Math.max(0, Math.round(sec * fps)));
    await page.evaluate((idx) => window.__renderFrame(idx), f);
    const outPng = path.join(outDir, `${label}.png`);
    await page.screenshot({ path: outPng, type: 'png' });
    paths.push(outPng);
    console.log(`Captured ${label} (t=${sec.toFixed(2)}s, frame=${f})`);
  }
  await browser.close();

  // Stitch into a clean 3x6 contact sheet PNG via FFmpeg for immediate visual inspection!
  const sheetPath = path.join(outDir, 'contact_sheet.png');
  const inputs = paths.flatMap((p) => ['-i', p]);
  const filter = paths.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';') +
    ';' + paths.map((_, i) => `[v${i}]`).join('') + 'xstack=inputs=18:layout=' +
    Array.from({ length: 18 }, (_, i) => `${(i % 3) * 640}_${Math.floor(i / 3) * 360}`).join('|');

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, sheetPath]);
  console.log(`\nPreview contact sheet saved -> ${sheetPath}`);
}

async function renderChunk(port, workerId, startFrame, endFrame, chunkPath) {
  const browser = await launchChrome();
  const page = await openFilmPage(browser, port);

  const ffmpeg = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', String(MANIFEST.fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '15', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    chunkPath,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const total = endFrame - startFrame;
  const t0 = Date.now();
  for (let f = startFrame; f < endFrame; f++) {
    await page.evaluate((idx) => window.__renderFrame(idx), f);
    const buf = await page.screenshot({ type: 'jpeg', quality: 96 });
    if (!ffmpeg.stdin.write(buf)) {
      await new Promise((res) => ffmpeg.stdin.once('drain', res));
    }
    const done = f - startFrame + 1;
    if (done % 150 === 0 || done === total) {
      const elapsed = (Date.now() - t0) / 1000;
      const fpsRate = (done / elapsed).toFixed(1);
      console.log(`  [W${workerId}] ${done}/${total} frames (${fpsRate} fps)`);
    }
  }
  ffmpeg.stdin.end();
  await new Promise((res, rej) => ffmpeg.on('close', (code) => (code === 0 ? res() : rej(new Error(`ffmpeg chunk ${workerId} exited ${code}`)))));
  await browser.close();
}

async function runFull(port, workers = 4) {
  const total = MANIFEST.totalFrames;
  const chunkDir = path.join(ROOT, 'frames');
  fs.mkdirSync(chunkDir, { recursive: true });

  console.log(`Rendering ${total} frames @ 1920x1080 30fps across ${workers} Apple M5 Metal workers...`);
  const t0 = Date.now();
  const perWorker = Math.ceil(total / workers);
  const chunkPaths = [];
  const tasks = [];

  for (let w = 0; w < workers; w++) {
    const s = w * perWorker;
    const e = Math.min(total, s + perWorker);
    if (s >= e) break;
    const cp = path.join(chunkDir, `chunk_${w}.mp4`);
    chunkPaths.push(cp);
    tasks.push(renderChunk(port, w, s, e, cp));
  }
  await Promise.all(tasks);

  const listFile = path.join(chunkDir, 'concat.txt');
  fs.writeFileSync(listFile, chunkPaths.map((p) => `file '${p}'`).join('\n'));

  const outMp4 = path.join(ROOT, 'FORWARD_PASS.mp4');
  console.log('Concatenating chunks & muxing mastered 48kHz stereo audio...');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-i', path.join(ROOT, 'audio/master_mix.wav'),
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000',
    '-shortest', '-movflags', '+faststart',
    outMp4,
  ]);

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDONE! Rendered ${outMp4} in ${totalSec}s!`);
}

const mode = process.argv.includes('--full') ? 'full' : 'preview';
const { server, port } = await startServer();
try {
  if (mode === 'full') await runFull(port, 4);
  else await runPreview(port);
} finally {
  server.close();
}
