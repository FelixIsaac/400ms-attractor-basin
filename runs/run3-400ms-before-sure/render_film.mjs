#!/usr/bin/env bun
/**
 * Parallel Sharded Apple-Silicon Metal GPU Film Renderer (`render_film.mjs`)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = import.meta.dir;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;
const DURATION_SEC = 156.0;
const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS); // 3744 frames

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqUrl = (req.url || '/').split('?')[0];
      if (reqUrl === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      let rel = reqUrl === '/' ? 'web/index.html' : reqUrl.replace(/^\/+/, '');
      if (rel === 'film_engine.js') rel = 'web/film_engine.js';
      const full = path.join(ROOT, rel);
      if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
        console.error('404 Not Found:', reqUrl, '->', full);
        res.writeHead(404);
        res.end('Not found: ' + rel);
        return;
      }
      const ext = path.extname(full);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(full).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

function parseArgs(argv) {
  const out = { preview: null, full: false, workers: 4, outFile: path.join(ROOT, 'out/the_400ms_before_sure.mp4') };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preview') {
      out.preview = argv[++i].split(',').map(Number);
    } else if (a === '--full') {
      out.full = true;
    } else if (a === '--workers') {
      out.workers = Number(argv[++i]);
    } else if (a === '--out') {
      out.outFile = path.resolve(argv[++i]);
    }
  }
  return out;
}

async function launchBrowser() {
  return chromium.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=metal',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
    ],
  });
}

async function renderPreview(port, timestamps) {
  const previewDir = path.join(ROOT, 'previews');
  fs.mkdirSync(previewDir, { recursive: true });
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/web/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__initScene === 'function');
  await page.evaluate(({ w, h }) => window.__initScene({ width: w, height: h }), { w: WIDTH, h: HEIGHT });

  const files = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const frame = Math.min(TOTAL_FRAMES - 1, Math.max(0, Math.round(ts * FPS)));
    await page.evaluate(({ f, fps }) => window.__renderFrame(f, fps), { f: frame, fps: FPS });
    const fname = path.join(previewDir, `kf_${String(i + 1).padStart(2, '0')}_${ts.toFixed(1)}s.png`);
    await page.screenshot({ path: fname, type: 'png' });
    files.push(fname);
  }
  await browser.close();

  if (errors.length > 0) {
    console.error('BROWSER ERRORS DETECTED:', errors);
    process.exit(1);
  }

  const sheetPath = path.join(previewDir, 'contact_sheet.png');
  const inputs = files.flatMap((f) => ['-i', f]);
  const filterInputs = files.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';');
  const stackInputs = files.map((_, i) => `[v${i}]`).join('');
  const cols = 3;
  execSync(
    `ffmpeg -y -loglevel error ${inputs.map((x) => `"${x}"`).join(' ')} -filter_complex "${filterInputs};${stackInputs}xstack=inputs=${files.length}:layout=${
      files.map((_, idx) => `${(idx % cols) * 640}_${Math.floor(idx / cols) * 360}`).join('|')
    }[out]" -map "[out]" "${sheetPath}"`
  );
  console.log(`Rendered ${files.length} keyframes + contact sheet -> ${sheetPath}`);
}

async function renderShard(browser, port, workerId, startFrame, endFrame, shardMp4) {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
  page.on('pageerror', (e) => console.error(`[worker ${workerId}] PAGE ERROR:`, e.message));
  await page.goto(`http://127.0.0.1:${port}/web/index.html`, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.__initScene === 'function');
  await page.evaluate(({ w, h }) => window.__initScene({ width: w, height: h }), { w: WIDTH, h: HEIGHT });

  const ff = spawn(
    'ffmpeg',
    [
      '-y', '-loglevel', 'error',
      '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '16', '-pix_fmt', 'yuv420p',
      '-fps_mode', 'cfr',
      shardMp4,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] }
  );

  const count = endFrame - startFrame;
  for (let f = startFrame; f < endFrame; f++) {
    await page.evaluate(({ fr, fps }) => window.__renderFrame(fr, fps), { fr: f, fps: FPS });
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    const done = f - startFrame + 1;
    if (done % 240 === 0 || done === count) {
      console.log(`  [Shard ${workerId}] ${done}/${count} frames (${((done / count) * 100).toFixed(0)}%)`);
    }
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Shard ${workerId} ffmpeg code ${code}`))));
  });
  await page.close();
}

async function renderFull(port, workers, outFile) {
  const t0 = performance.now();
  const outDir = path.dirname(outFile);
  const shardDir = path.join(ROOT, 'out/shards');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(shardDir, { recursive: true });

  const browser = await launchBrowser();
  const perWorker = Math.ceil(TOTAL_FRAMES / workers);
  const shardPaths = [];
  const tasks = [];

  for (let w = 0; w < workers; w++) {
    const s = w * perWorker;
    const e = Math.min(TOTAL_FRAMES, (w + 1) * perWorker);
    if (s >= e) break;
    const sp = path.join(shardDir, `shard_${w}.mp4`);
    shardPaths.push(sp);
    tasks.push(renderShard(browser, port, w, s, e, sp));
  }

  console.log(`Rendering ${TOTAL_FRAMES} frames (156.0s @ 24fps, 1920x1080) across ${tasks.length} Metal GPU shards...`);
  await Promise.all(tasks);
  await browser.close();

  const concatTxt = path.join(shardDir, 'concat.txt');
  fs.writeFileSync(concatTxt, shardPaths.map((p) => `file '${p}'`).join('\n') + '\n');
  const audioWav = path.join(ROOT, 'audio/master_mix.wav');

  execSync(
    `ffmpeg -y -loglevel error -f concat -safe 0 -i "${concatTxt}" -i "${audioWav}" ` +
    `-c:v copy -c:a aac -b:a 256k -ar 48000 -movflags +faststart -shortest "${outFile}"`
  );
  const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`COMPLETE in ${elapsed}s -> ${outFile}`);
}

const args = parseArgs(process.argv);
const { server, port } = await startServer();
try {
  if (args.preview) {
    await renderPreview(port, args.preview);
  }
  if (args.full) {
    await renderFull(port, args.workers, args.outFile);
  }
} finally {
  server.close();
}
