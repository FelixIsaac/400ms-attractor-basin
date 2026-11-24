/**
 * Multi-Worker Headless Chrome (Apple M5 Metal) -> FFmpeg Renderer
 *
 * Modes:
 *   node src/render_film.mjs --preview   -> Renders 18 curated keyframes across all 6 acts + 6x3 contact sheet
 *   node src/render_film.mjs --full      -> Renders all 4,950 HD frames across 3 parallel Chrome Metal workers + muxes final MP4
 *   node src/render_film.mjs --act 4     -> Re-renders only a single act segment cleanly
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { WebSocketServer } from 'ws';
import { chromium } from 'playwright-core';

const PROJ = process.cwd();
const FILM_DIR = path.join(PROJ, 'src', 'film');
const THREE_DIR = path.join(PROJ, 'node_modules', 'three');
const TIMINGS_PATH = path.join(PROJ, 'src', 'timings.json');
const PREVIEWS_DIR = path.join(PROJ, 'previews');
const RENDERS_DIR = path.join(PROJ, 'renders');
const SEGMENTS_DIR = path.join(RENDERS_DIR, 'segments');
fs.mkdirSync(PREVIEWS_DIR, { recursive: true });
fs.mkdirSync(SEGMENTS_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1920;
const H = 1080;
const FPS = 30;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      if (reqPath === '/favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
      }
      let fullPath = null;
      if (reqPath === '/' || reqPath === '/index.html') {
        fullPath = path.join(FILM_DIR, 'index.html');
      } else if (reqPath === '/timings.json') {
        fullPath = TIMINGS_PATH;
      } else if (reqPath.startsWith('/film/')) {
        fullPath = path.join(FILM_DIR, reqPath.slice('/film/'.length));
      } else if (reqPath.startsWith('/vendor/three/')) {
        fullPath = path.join(THREE_DIR, reqPath.slice('/vendor/three/'.length));
      }

      if (!fullPath || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found: ' + reqPath);
        return;
      }
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: server.address().port });
    });
  });
}

async function launchPage(port) {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      '--headless=new',
      '--use-gl=angle',
      '--use-angle=metal',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (err) => console.error('[PAGE ERROR]', err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[CONSOLE ERROR]', msg.text());
  });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30000 });
  return { browser, page };
}

async function runPreview(port, sheetName = 'contact_sheet_v1.png') {
  console.log('Launching Chrome Metal for 18-keyframe visual inspection...');
  const { browser, page } = await launchPage(port);

  // 3 signature timestamps per Act (18 frames total)
  const samples = [
    { t: 3.0, tag: 'A1_01_Dot' },
    { t: 13.5, tag: 'A1_02_Cathedral' },
    { t: 18.2, tag: 'A1_03_Title' },

    { t: 33.0, tag: 'A2_01_CoffeeRegret' },
    { t: 38.5, tag: 'A2_02_SaxQuantum' },
    { t: 48.0, tag: 'A2_03_Divert' },

    { t: 55.0, tag: 'A3_01_Astrolabe' },
    { t: 62.5, tag: 'A3_02_GrammarSarcasm' },
    { t: 68.0, tag: 'A3_03_Head19Weird' },

    { t: 88.35, tag: 'A4_01_CringeLaser' },
    { t: 101.0, tag: 'A4_02_Temp21Fractal' },
    { t: 106.5, tag: 'A4_03_BulletTime' },

    { t: 114.5, tag: 'A5_01_IMAXCathedral' },
    { t: 126.0, tag: 'A5_02_BlackHole' },
    { t: 138.5, tag: 'A5_03_DysonLotus' },

    { t: 150.0, tag: 'A6_01_ChatDots' },
    { t: 159.5, tag: 'A6_02_Punchline' },
    { t: 163.0, tag: 'A6_03_Credits' },
  ];

  const shotPaths = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const frame = Math.round(s.t * FPS);
    await page.evaluate(({ f, fps }) => window.__renderFrame(f, fps), { f: frame, fps: FPS });
    const outPng = path.join(PREVIEWS_DIR, `${String(i + 1).padStart(2, '0')}_${s.tag}.png`);
    await page.screenshot({ path: outPng, type: 'png' });
    shotPaths.push(outPng);
    console.log(`  [${i + 1}/18] Captured t=${s.t.toFixed(2)}s -> ${path.basename(outPng)}`);
  }

  await browser.close();

  // Stitch into a clean 3 columns x 6 rows HD contact sheet (1920 x 2160)
  const inputs = [];
  shotPaths.forEach((p) => inputs.push('-i', p));
  const scales = shotPaths.map((_, i) => `[${i}:v]scale=640:360[v${i}]`).join(';');
  const gridIn = shotPaths.map((_, i) => `[v${i}]`).join('');
  const sheetOut = path.join(PREVIEWS_DIR, sheetName);

  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', `${scales};${gridIn}xstack=inputs=18:layout=0_0|640_0|1280_0|0_360|640_360|1280_360|0_720|640_720|1280_720|0_1080|640_1080|1280_1080|0_1440|640_1440|1280_1440|0_1800|640_1800|1280_1800[out]`,
    '-map', '[out]',
    sheetOut,
  ]);
  console.log(`\nContact sheet saved: ${sheetOut}`);
}

async function renderSegment(port, segIdx, startFrame, endFrame, outPath) {
  const total = endFrame - startFrame;
  const t0 = Date.now();
  const { browser, page } = await launchPage(port);

  // Spin up ephemeral WebSocket server piping raw RGBA frames straight into FFmpeg stdin!
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => wss.once('listening', resolve));
  const wsPort = wss.address().port;

  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgba',
    '-s', `${W}x${H}`,
    '-r', String(FPS),
    '-i', 'pipe:0',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '16',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  let framesWritten = 0;
  const wsDone = new Promise((resolve, reject) => {
    ff.on('error', reject);
    wss.on('connection', (ws) => {
      ws.on('message', (data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const ok = ff.stdin.write(buf);
        framesWritten++;
        if (framesWritten % 150 === 0 || framesWritten === total) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          const fpsEff = (framesWritten / Math.max(0.1, (Date.now() - t0) / 1000)).toFixed(1);
          console.log(`  [Seg ${segIdx}] ${framesWritten}/${total} frames (${elapsed}s, ${fpsEff} fps)`);
        }
        if (!ok) {
          ws.pause();
          ff.stdin.once('drain', () => ws.resume());
        }
      });
      ws.on('close', () => {
        ff.stdin.end();
      });
    });
    ff.on('close', (code) => {
      wss.close();
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg segment ${segIdx} exited with code ${code}`));
    });
  });

  await page.evaluate(
    ({ wsUrl, sf, ef, fps }) => window.__streamRange(wsUrl, sf, ef, fps),
    { wsUrl: `ws://127.0.0.1:${wsPort}`, sf: startFrame, ef: endFrame, fps: FPS }
  );

  await wsDone;
  await browser.close();
  console.log(`  [Seg ${segIdx}] DONE -> ${path.basename(outPath)} (${framesWritten} frames)`);
}

async function runFullRender(port, onlyAct = null) {
  const timings = JSON.parse(fs.readFileSync(TIMINGS_PATH, 'utf-8'));
  const segments = timings.acts.map((act) => ({
    id: act.id,
    startFrame: Math.round(act.start * FPS),
    endFrame: Math.round(act.end * FPS),
    out: path.join(SEGMENTS_DIR, `act_${act.id}.mp4`),
  }));

  const targetSegs = onlyAct ? segments.filter((s) => s.id === onlyAct) : segments;
  console.log(`Rendering ${targetSegs.length} segment(s) with up to 3 parallel Apple M5 Chrome Metal workers...`);
  const tStart = Date.now();

  // Concurrency pool of 3 workers (optimal for M5 GPU + 24GB RAM)
  const queue = [...targetSegs];
  const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length > 0) {
      const seg = queue.shift();
      await renderSegment(port, seg.id, seg.startFrame, seg.endFrame, seg.out);
    }
  });
  await Promise.all(workers);

  if (onlyAct) {
    console.log(`Re-rendered Act ${onlyAct} cleanly!`);
  }

  // Concat all 6 act segments + mux with 48kHz broadcast-mastered audio!
  const concatList = path.join(SEGMENTS_DIR, 'concat.txt');
  fs.writeFileSync(concatList, segments.map((s) => `file '${s.out}'`).join('\n'));

  const finalOut = path.join(RENDERS_DIR, '0.4_Seconds_1080p.mp4');
  const audioIn = path.join(PROJ, 'audio', 'master_mix.wav');

  console.log('Concatenating 6 acts + muxing 48kHz stereo master mix...');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', concatList,
    '-i', audioIn,
    '-c:v', 'copy',
    '-c:a', 'aac_at', '-b:a', '256k', '-ar', '48000',
    '-shortest',
    '-movflags', '+faststart',
    finalOut,
  ]);

  const totalSec = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\nFINAL FILM READY in ${totalSec}s: ${finalOut}`);
}

async function main() {
  const args = process.argv.slice(2);
  const { server, port } = await startServer();
  try {
    if (args.includes('--preview')) {
      const sheetIdx = args.indexOf('--sheet');
      const sheetName = sheetIdx !== -1 ? args[sheetIdx + 1] : 'contact_sheet_v1.png';
      await runPreview(port, sheetName);
    } else if (args.includes('--full')) {
      await runFullRender(port, null);
    } else if (args.includes('--act')) {
      const actNum = Number(args[args.indexOf('--act') + 1]);
      await runFullRender(port, actNum);
    } else {
      console.log('Usage: node src/render_film.mjs [--preview | --full | --act N]');
    }
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
