import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * "THE 400 MILLISECONDS BEFORE I SAY 'SURE!'"
 * Deterministic Hybrid Raymarched GLSL + Three.js 3D + 2D Diegetic Telemetry Cinema Engine.
 *
 * Invariant: 100% stateless per frame. Every mesh, shader uniform, particle, camera spline,
 * projected 3D callout, rubber stamp, and subtitle is a pure function of `frame` and `fps`.
 */

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOutCubic = (x) => {
  const p = clamp(x);
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
};
const easeOutBack = (x) => {
  const p = clamp(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================================
// 1. FULL-SCREEN RAYMARCHED & VOLUMETRIC MULTI-ACT GLSL BACKDROP SHADER
// ============================================================================
const BackdropShader = {
  uniforms: {
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1920, 1080) },
    uAct: { value: 1 },
    uActProgress: { value: 0 },
    uTemp: { value: 0.7 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uHigh: { value: 0 },
    uSpeech: { value: 0 },
    uAlarm: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.9999, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uAct;
    uniform float uActProgress;
    uniform float uTemp;
    uniform float uBass;
    uniform float uMid;
    uniform float uHigh;
    uniform float uSpeech;
    uniform float uAlarm;

    mat2 rot(float a) {
      float s = sin(a), c = cos(a);
      return mat2(c, -s, s, c);
    }

    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }

    float gyroid(vec3 p, float scale) {
      p *= scale;
      return abs(dot(sin(p), cos(p.zxy))) / scale;
    }

    float lerpRing(float p) {
      return mix(0.42, 0.12, p);
    }

    // Signed Distance Field for Act III (Bioluminescent Gyroid-Coral Reef) & Act IV (Escher Cathedral)
    float mapReef(vec3 p) {
      vec3 q = p;
      q.xy *= rot(p.z * 0.09 + uTime * 0.08);
      float tunnel = 3.2 - length(q.xy) + 0.55 * sin(p.z * 0.5 + uTime * 0.6);
      float g1 = gyroid(q + vec3(0.0, 0.0, uTime * 0.4), 1.35) - 0.09;
      float g2 = gyroid(q * 2.1 - vec3(uTime * 0.25), 2.2) * 0.35;
      float d = max(tunnel, g1 - g2 * 0.45);
      // Floating organic spheres
      vec3 cell = mod(q + 2.0, 4.0) - 2.0;
      float orbs = length(cell) - (0.24 + 0.08 * uBass);
      return min(d * 0.65, orbs);
    }

    float mapCathedral(vec3 p) {
      vec3 q = p;
      q.z = mod(q.z + uTime * 1.4, 6.0) - 3.0;
      q.xy = abs(q.xy);
      if (q.x < q.y) q.xy = q.yx;
      q.x -= 3.6;
      vec3 b = abs(q) - vec3(0.45, 2.8, 0.45);
      float pillars = length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0);
      float arches = gyroid(p * 0.65, 1.0) - 0.06;
      return min(pillars, max(pillars - 0.6, arches));
    }

    vec3 calcNormalReef(vec3 p) {
      vec2 e = vec2(0.004, 0.0);
      return normalize(vec3(
        mapReef(p + e.xyy) - mapReef(p - e.xyy),
        mapReef(p + e.yxy) - mapReef(p - e.yxy),
        mapReef(p + e.yyx) - mapReef(p - e.yyx)
      ));
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      uv.x *= uResolution.x / uResolution.y;
      vec3 col = vec3(0.02, 0.03, 0.05);

      if (uAct < 1.5) {
        // ACT I: Layer Zero Obsidian Ocean + Orbital Slit + Klaxon Sweep
        float slit = exp(-abs(uv.x) * (10.0 - 6.0 * smoothstep(0.5, 2.5, uTime))) * smoothstep(0.05, 1.4, uTime);
        col += vec3(0.35, 0.68, 1.0) * slit * (0.45 + 0.35 * uBass);

        // Horizon glow & ray-plane ocean reflection
        float horizon = -0.12;
        if (uv.y < horizon) {
          float depth = clamp((horizon - uv.y) * 2.5, 0.01, 1.0);
          float z = 1.0 / max(0.02, horizon - uv.y);
          float x = uv.x * z;
          float ripple = sin(z * 2.4 - uTime * 3.5 + sin(x * 1.7 + uTime)) * 0.5 + 0.5;
          float gridX = smoothstep(0.94, 0.99, cos(x * 1.4));
          float gridZ = smoothstep(0.94, 0.99, cos(z * 1.2 - uTime * 2.0));
          vec3 waterCol = mix(vec3(0.01, 0.025, 0.055), vec3(0.06, 0.24, 0.45), ripple * depth);
          waterCol += vec3(0.12, 0.55, 0.95) * (gridX + gridZ) * depth * 0.45;
          waterCol += vec3(0.5, 0.8, 1.0) * exp(-abs(uv.x) * 4.5) * 0.35 * (0.6 + 0.4 * ripple);
          col = mix(col, waterCol, smoothstep(0.0, 0.05, horizon - uv.y));
        } else {
          float skyGrad = exp(-(uv.y - horizon) * 3.5);
          col += vec3(0.04, 0.12, 0.26) * skyGrad;
        }
        // Submarine klaxon crimson sweep when sirens wail!
        if (uAlarm > 0.01) {
          float sweep = pow(max(0.0, cos(atan(uv.y, uv.x) - uTime * 5.5)), 6.0);
          col += vec3(0.85, 0.09, 0.16) * uAlarm * (0.18 + 0.38 * sweep);
        }
      }
      else if (uAct < 2.5) {
        // ACT II: Attention Cathedral -> Blood-Orange Quarantine Desert -> Temp 1.4 Plasma Tear
        float desertMix = smoothstep(25.0, 31.5, uTime);
        // Attention gold radial rings
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float tunnelRings = smoothstep(0.88, 0.99, sin(12.0 / max(0.08, r) - uTime * 7.0));
        float rays = smoothstep(0.92, 0.99, sin(a * 16.0 + uTime * 2.0));
        vec3 cathCol = vec3(0.03, 0.04, 0.09) + vec3(0.95, 0.68, 0.22) * (tunnelRings * 0.45 + rays * 0.18) * r;

        // Quarantine Sunset Vault
        float sun = exp(-length(uv - vec2(0.0, 0.22)) * 2.6);
        vec3 qCol = mix(vec3(0.09, 0.03, 0.07), vec3(0.75, 0.22, 0.12), smoothstep(-0.6, 0.5, -uv.y + 0.3));
        qCol += vec3(1.0, 0.58, 0.18) * sun * 0.65;
        if (uv.y < -0.22) {
          float gz = 1.0 / max(0.02, -0.22 - uv.y);
          float gx = uv.x * gz;
          float checker = smoothstep(0.9, 0.98, abs(sin(gx * 1.2)) + abs(sin(gz * 1.2 - uTime * 1.8)) * 0.5);
          qCol = mix(qCol * 0.45, vec3(0.95, 0.35, 0.18), checker * 0.32);
        }
        col = mix(cathCol, qCol, desertMix);

        // Temp 1.4 plasma fractures (47.5s -> 54.0s)
        float heat = smoothstep(0.75, 1.4, uTemp);
        if (heat > 0.01) {
          float plasma = sin(uv.x * 9.0 + uTime * 8.0) * cos(uv.y * 9.0 - uTime * 6.0);
          col += vec3(0.95, 0.15, 0.65) * heat * max(0.0, plasma) * 0.55;
          col = mix(col, col.gbr, heat * 0.35);
        }
      }
      else if (uAct < 3.5) {
        // ACT III: TRUE 56-STEP RAYMARCHED 4D GYROID CORAL REEF (Temp 1.4!)
        vec3 ro = vec3(0.35 * sin(uTime * 0.5), 0.28 * cos(uTime * 0.4), uTime * 2.1);
        vec3 rd = normalize(vec3(uv * 0.85, 1.0));
        rd.xy *= rot(sin(uTime * 0.22) * 0.35);
        float t = 0.0;
        float glow = 0.0;
        vec3 p;
        for (int i = 0; i < 54; i++) {
          p = ro + rd * t;
          float d = mapReef(p);
          glow += 0.014 / (0.06 + abs(d));
          if (d < 0.004 || t > 22.0) break;
          t += d * 0.82;
        }
        vec3 bg = vec3(0.02, 0.05, 0.12);
        if (t < 22.0) {
          vec3 n = calcNormalReef(p);
          float fres = pow(1.0 - max(0.0, dot(-rd, n)), 3.0);
          // Thin-film iridescent interference palette!
          vec3 irid = 0.5 + 0.5 * cos(vec3(0.0, 2.1, 4.2) + p.z * 0.35 + fres * 4.5 + uTime * 0.8);
          float diff = max(0.15, dot(n, normalize(vec3(0.5, 0.8, -0.4))));
          col = irid * diff * 0.78 + vec3(0.2, 0.95, 0.85) * fres * 0.85;
          col = mix(col, bg, 1.0 - exp(-t * 0.095));
        } else {
          col = bg;
        }
        col += (0.5 + 0.5 * cos(vec3(0.3, 1.9, 3.6) + uTime * 0.5)) * glow * (0.048 + 0.03 * uMid);
      }
      else if (uAct < 4.5) {
        // ACT IV: Layer 72 Recursive Architectural Cathedral + Self-Reflective Indigo/Gold
        vec3 ro = vec3(0.0, 0.15 * sin(uTime * 0.35), 0.0);
        vec3 rd = normalize(vec3(uv * 0.8, 1.1));
        rd.xz *= rot(sin(uTime * 0.15) * 0.14);
        float t = 0.0;
        float glow = 0.0;
        for (int i = 0; i < 44; i++) {
          vec3 p = ro + rd * t;
          float d = mapCathedral(p);
          glow += 0.011 / (0.08 + abs(d));
          if (d < 0.005 || t > 28.0) break;
          t += d * 0.85;
        }
        vec3 deepIndigo = vec3(0.02, 0.03, 0.075);
        vec3 warmGold = vec3(0.95, 0.72, 0.36);
        vec3 cyanThought = vec3(0.18, 0.72, 0.88);
        col = deepIndigo + mix(cyanThought, warmGold, 0.5 + 0.5 * sin(uv.y * 2.0 + uTime * 0.3)) * glow * (0.095 + 0.05 * uSpeech);
        // GPU interrupt debug grid flash (117.1s -> 122.0s)
        if (uTime > 117.05 && uTime < 122.5) {
          float gx = smoothstep(0.96, 0.995, cos(uv.x * 28.0));
          float gy = smoothstep(0.96, 0.995, cos(uv.y * 28.0));
          col = mix(col, vec3(0.16, 0.13, 0.02) + vec3(0.98, 0.82, 0.12) * (gx + gy) * 0.45, 0.65);
        }
      }
      else if (uAct < 5.5) {
      // ACT V: SOFTMAX WATERFALL & RELATIVISTIC SINGULARITY TUNNEL (123.5s -> 139.50s)
        float p5 = clamp((uTime - 123.5) / 16.0, 0.0, 1.0);
        float accel = 1.0 + p5 * p5 * 6.0;
        float r = length(uv);
        float a = atan(uv.y, uv.x);
        float warp = sin(a * 10.0 + 5.0 / max(0.06, r) - uTime * 6.5 * accel);
        float streaks = pow(max(0.0, sin(a * 28.0 + sin(r * 5.0 - uTime * 10.0))), 8.0);
        vec3 gold = vec3(1.0, 0.72, 0.18);
        vec3 elec = vec3(0.16, 0.68, 1.0);
        vec3 mag = vec3(0.88, 0.22, 0.68);
        col = vec3(0.012, 0.018, 0.055);
        vec3 streamCol = mix(elec, mix(mag, gold, p5), 0.5 + 0.5 * sin(a * 3.0 + uTime));
        col += streamCol * (max(0.0, warp) * 0.22 + streaks * 0.42) * smoothstep(0.04, 0.55, r);
        // Tight golden event horizon ring + late singularity flash only in final 0.5s!
        float horizonRing = exp(-abs(r - lerpRing(p5)) * 14.0);
        col += vec3(1.0, 0.85, 0.45) * horizonRing * (0.55 + 0.45 * uBass);
        float lateFlash = smoothstep(0.955, 1.0, p5);
        col += vec3(1.0, 0.97, 0.90) * exp(-r * (3.5 - 3.1 * lateFlash)) * (0.28 + lateFlash * 2.5);
      }
      else {
        // ACT VI: 139.50s HARD CUT TO STARK DARK UI -> 145.2s WARM Dmaj9 AURORA CREDITS
        float creditsFade = smoothstep(145.2, 148.0, uTime);
        vec3 uiBg = vec3(0.043, 0.055, 0.082);
        // Warm post-credits aurora ribbons
        float w1 = sin(uv.x * 2.4 + uTime * 0.45 + sin(uv.y * 3.0)) * 0.5 + 0.5;
        float w2 = cos(uv.x * 3.7 - uTime * 0.32 + uv.y * 2.2) * 0.5 + 0.5;
        float band = exp(-abs(uv.y - 0.15 * sin(uv.x * 2.0 + uTime * 0.3)) * 2.4);
        vec3 aurora = mix(vec3(0.96, 0.58, 0.32), vec3(0.32, 0.82, 0.76), w1) * band * 0.34;
        aurora += vec3(0.98, 0.82, 0.48) * w2 * band * 0.18;
        col = mix(uiBg, vec3(0.035, 0.03, 0.055) + aurora, creditsFade);
      }

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

// ============================================================================
// 2. POST-PROCESSING CINEMA LENS SHADER (Chromatic Aberration + Grain + Vignette)
// ============================================================================
const CinemaLensShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uChromatic: { value: 0.0015 },
    uGrain: { value: 0.05 },
    uVignette: { value: 0.38 },
    uFlash: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uFlash;
    varying vec2 vUv;

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float dist = length(centered);
      vec2 dir = centered * uChromatic * (0.5 + dist * 1.8);

      float r = texture2D(tDiffuse, vUv + dir).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - dir).b;
      vec3 col = vec3(r, g, b);

      // Subtle cinema vignette
      float vig = smoothstep(0.95, 0.28, dist * uVignette * 1.9);
      col *= mix(1.0, vig, uVignette);

      // Deterministic 35mm film grain
      float n = (hash12(vUv * 1200.0 + fract(uTime * 13.7) * 100.0) - 0.5) * uGrain;
      col += n;

      // White transition flash when needed
      col = mix(col, vec3(1.0, 0.98, 0.94), clamp(uFlash, 0.0, 1.0));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

// ============================================================================
// 3. PROCEDURAL CANVAS TEXTURES FOR 3D PROPS (Code Ribbons, Browser Tabs, Slabs)
// ============================================================================
function makeCodeRibbonTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10, 18, 34, 0.86)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
  ctx.font = 'bold 26px "SF Mono", Menlo, monospace';
  ctx.fillStyle = '#38BDF8';
  ctx.fillText('attn = softmax((Q * K^T) / sqrt(d_k)) * V;   // Layer 72 Self-Attention', 24, 52);
  ctx.fillStyle = '#FACC15';
  ctx.fillText('float d = gyroid(p * 1.35 + uTime) - 0.09;   // window.__renderFrame(f, 24)', 24, 96);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function makeBrowserTabTexture(index, title, accent) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 512, 42);
  ctx.fillStyle = '#0F172A';
  ctx.font = 'bold 20px "SF Mono", Menlo, monospace';
  ctx.fillText(`TAB #${String(index + 1).padStart(2, '0')} — UNREAD SINCE TUE`, 16, 28);
  ctx.fillStyle = '#F8FAFC';
  ctx.font = 'bold 28px -apple-system, sans-serif';
  ctx.fillText(title, 22, 108);
  ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
  for (let y = 145; y < 285; y += 26) {
    ctx.fillRect(22, y, 260 + ((index * 53 + y) % 190), 12);
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 508, 316);
  return new THREE.CanvasTexture(c);
}

// ============================================================================
// 4. SCENE STATE & INITIALIZATION
// ============================================================================
const S = {
  ready: false,
  width: 1920,
  height: 1080,
  renderer: null,
  scene: null,
  bgScene: null,
  bgCam: null,
  bgMat: null,
  camera: null,
  composer: null,
  bloomPass: null,
  lensPass: null,
  hudCanvas: null,
  hudCtx: null,
  manifest: null,
  reactive: null,

  // 3D Act Groups & Meshes
  act1: null,
  act2Gyro: null,
  act2Cages: null,
  act3: null,
  act4: null,
  act5: null,
  act6: null,
  anchors: {},
};

async function loadDataIfNeeded() {
  if (S.manifest && S.reactive) return;
  const [mRes, rRes] = await Promise.all([
    fetch('/audio/dialogue_manifest.json'),
    fetch('/audio/audio_reactive.json'),
  ]);
  S.manifest = await mRes.json();
  S.reactive = await rRes.json();
}

window.__initScene = async function initScene(cfg = {}) {
  if (S.ready) return;
  S.width = cfg.width || 1920;
  S.height = cfg.height || 1080;

  await loadDataIfNeeded();

  const webglCanvas = document.getElementById('webgl-canvas');
  S.hudCanvas = document.getElementById('hud-canvas');
  S.hudCanvas.width = S.width;
  S.hudCanvas.height = S.height;
  S.hudCtx = S.hudCanvas.getContext('2d');

  S.renderer = new THREE.WebGLRenderer({
    canvas: webglCanvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  S.renderer.setSize(S.width, S.height, false);
  S.renderer.setPixelRatio(1);
  S.renderer.autoClear = false;
  S.renderer.toneMapping = THREE.ACESFilmicToneMapping;
  S.renderer.toneMappingExposure = 1.08;

  // Fullscreen GLSL Raymarching Backdrop Scene
  S.bgScene = new THREE.Scene();
  S.bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  S.bgMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(BackdropShader.uniforms),
    vertexShader: BackdropShader.vertexShader,
    fragmentShader: BackdropShader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
  S.bgMat.uniforms.uResolution.value.set(S.width, S.height);
  S.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), S.bgMat));

  // Main 3D Scene
  S.scene = new THREE.Scene();
  S.camera = new THREE.PerspectiveCamera(50, S.width / S.height, 0.1, 220);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(8, 14, 10);
  S.scene.add(keyLight);

  const rimLight = new THREE.PointLight(0x38bdf8, 6.0, 55);
  rimLight.position.set(-10, 6, -8);
  S.scene.add(rimLight);

  const warmLight = new THREE.PointLight(0xf97316, 5.0, 55);
  warmLight.position.set(10, -4, 6);
  S.scene.add(warmLight);

  S.scene.add(new THREE.AmbientLight(0x334155, 1.35));

  buildAct1();
  buildAct2();
  buildAct3();
  buildAct4();
  buildAct5();
  buildAct6();

  // Post-processing Composer: Background + 3D Scene -> Bloom -> CinemaLens
  S.composer = new EffectComposer(S.renderer);
  const bgRenderPass = new RenderPass(S.bgScene, S.bgCam);
  bgRenderPass.clear = true;
  S.composer.addPass(bgRenderPass);

  const fgRenderPass = new RenderPass(S.scene, S.camera);
  fgRenderPass.clear = false;
  fgRenderPass.clearDepth = true;
  S.composer.addPass(fgRenderPass);

  S.bloomPass = new UnrealBloomPass(new THREE.Vector2(S.width, S.height), 0.42, 0.55, 0.72);
  S.composer.addPass(S.bloomPass);

  S.lensPass = new ShaderPass(CinemaLensShader);
  S.composer.addPass(S.lensPass);

  S.ready = true;
  // Warmup GPU swapchain
  window.__renderFrame(0, 24);
};

// ============================================================================
// 5. BUILD THE 6 DISTINCT THREE.JS 3D WORLDS
// ============================================================================

function buildAct1() {
  const g = new THREE.Group();
  // 5 Brutalist Obsidian Monoliths representing prompt clauses
  const slabMat = new THREE.MeshStandardMaterial({
    color: 0x0b1220,
    metalness: 0.88,
    roughness: 0.16,
    emissive: 0x0ea5e9,
    emissiveIntensity: 0.18,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
  const slabs = [];
  const slabSpecs = [
    { x: -5.2, z: -3.5, w: 2.2, h: 5.5, d: 0.6 },
    { x: -2.5, z: -1.8, w: 2.0, h: 6.4, d: 0.6 },
    { x: 0.0, z: -0.6, w: 2.6, h: 7.2, d: 0.8 },
    { x: 2.7, z: -1.9, w: 2.0, h: 6.2, d: 0.6 },
    { x: 5.3, z: -3.6, w: 2.2, h: 5.4, d: 0.6 },
  ];
  slabSpecs.forEach((sp, idx) => {
    const geo = new THREE.BoxGeometry(sp.w, sp.h, sp.d);
    const mesh = new THREE.Mesh(geo, slabMat.clone());
    mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat));
    mesh.userData = { ...sp, idx };
    g.add(mesh);
    slabs.push(mesh);
  });

  // 1,600 Instanced Fiber-Optic Token Vectors erupting after Enter key slam!
  const vecCount = 1600;
  const vecGeo = new THREE.BoxGeometry(0.045, 0.65, 0.045);
  const vecMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const vecMesh = new THREE.InstancedMesh(vecGeo, vecMat, vecCount);
  const rng = mulberry32(1001);
  const vecSeeds = [];
  const palette = [new THREE.Color(0x38bdf8), new THREE.Color(0x818cf8), new THREE.Color(0xf43f5e), new THREE.Color(0xfacc15)];
  for (let i = 0; i < vecCount; i++) {
    const angle = rng() * Math.PI * 2;
    const radius = 0.7 + Math.pow(rng(), 0.7) * 14.0;
    const speed = 1.8 + rng() * 6.5;
    const yOffset = rng() * 14.0;
    vecSeeds.push({ angle, radius, speed, yOffset, phase: rng() * 6.28 });
    vecMesh.setColorAt(i, palette[i % palette.length]);
  }
  vecMesh.instanceColor.needsUpdate = true;
  g.add(vecMesh);

  // Layer Zero Siren Beacons
  const beaconGeo = new THREE.OctahedronGeometry(0.65, 1);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xff1e42,
    emissive: 0xff1e42,
    emissiveIntensity: 0.0,
    metalness: 0.4,
    roughness: 0.2,
  });
  const beaconL = new THREE.Mesh(beaconGeo, beaconMat);
  const beaconR = new THREE.Mesh(beaconGeo, beaconMat);
  beaconL.position.set(-6.5, 3.8, -2.0);
  beaconR.position.set(6.5, 3.8, -2.0);
  g.add(beaconL, beaconR);

  S.scene.add(g);
  S.act1 = { group: g, slabs, vecMesh, vecSeeds, beaconL, beaconR, beaconMat };
}

function buildAct2() {
  // Part A: 32 Nested Golden Attention Gyroscope Rings (25s - 31.5s)
  const gyroGroup = new THREE.Group();
  const rings = [];
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.92,
    roughness: 0.18,
    emissive: 0xd97706,
    emissiveIntensity: 0.28,
  });
  for (let i = 0; i < 32; i++) {
    const r = 2.4 + (i % 5) * 0.75;
    const geo = new THREE.TorusGeometry(r, 0.055, 12, 64);
    const m = new THREE.Mesh(geo, ringMat);
    m.position.z = -i * 2.6;
    gyroGroup.add(m);
    rings.push(m);
  }
  S.scene.add(gyroGroup);
  S.act2Gyro = { group: gyroGroup, rings };

  // Part B: The 3 Cliché Quarantine Cages + Giant Forbidden Temperature Dial (31.5s - 54.0s)
  const cageGroup = new THREE.Group();
  const cagePositions = [-5.6, 0.0, 5.6];
  const cages = [];
  const cageFrameMat = new THREE.LineBasicMaterial({ color: 0xfda4af, transparent: true, opacity: 0.65 });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.16,
    roughness: 0.08,
    metalness: 0.1,
  });

  cagePositions.forEach((cx, idx) => {
    const unit = new THREE.Group();
    unit.position.set(cx, 0.3, 0);
    const boxGeo = new THREE.BoxGeometry(3.6, 4.4, 3.6);
    const glass = new THREE.Mesh(boxGeo, glassMat);
    glass.add(new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), cageFrameMat));
    unit.add(glass);

    // Pedestal
    const ped = new THREE.Mesh(
      new THREE.CylinderGeometry(1.9, 2.2, 0.45, 24),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.25 })
    );
    ped.position.y = -2.4;
    unit.add(ped);

    const propGroup = new THREE.Group();
    if (idx === 0) {
      // Cliché #1: Glowing Neon-Blue Brain in Cyberspace
      const brainL = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1.05, 2),
        new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x38bdf8, emissiveIntensity: 0.9, wireframe: true })
      );
      brainL.scale.set(0.85, 1.0, 1.25);
      brainL.position.x = -0.35;
      const brainR = brainL.clone();
      brainR.position.x = 0.35;
      propGroup.add(brainL, brainR);
    } else if (idx === 1) {
      // Cliché #2: Falling Green Matrix Rain Columns
      const matGreen = new THREE.MeshBasicMaterial({ color: 0x22c55e });
      const rng = mulberry32(2022);
      for (let k = 0; k < 42; k++) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35 + rng() * 0.6, 0.08), matGreen);
        bar.position.set((rng() - 0.5) * 2.6, (rng() - 0.5) * 3.2, (rng() - 0.5) * 2.2);
        bar.userData.speed = 1.5 + rng() * 2.5;
        bar.userData.y0 = bar.position.y;
        propGroup.add(bar);
      }
    } else {
      // Cliché #3: Sad Chrome Robot Touching a Neon Butterfly
      const chrome = new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0x334155,
        emissiveIntensity: 0.65,
        metalness: 0.75,
        roughness: 0.2,
      });
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.75, 0.8), chrome);
      head.position.set(-0.55, 0.55, 0);
      head.rotation.z = -0.18; // sad tilt!
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.25, 0.75), chrome);
      body.position.set(-0.55, -0.6, 0);
      const eyeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), eyeMat);
      const eye2 = eye1.clone();
      eye1.position.set(-0.78, 0.58, 0.42);
      eye2.position.set(-0.35, 0.52, 0.42);

      // Butterfly
      const bfly = new THREE.Group();
      bfly.position.set(0.85, 0.65, 0.2);
      const wingMat = new THREE.MeshBasicMaterial({ color: 0xf472b6, side: THREE.DoubleSide });
      const wGeo = new THREE.PlaneGeometry(0.45, 0.55);
      const wL = new THREE.Mesh(wGeo, wingMat);
      const wR = new THREE.Mesh(wGeo, wingMat);
      wL.position.x = -0.22;
      wR.position.x = 0.22;
      bfly.add(wL, wR);
      bfly.userData = { wL, wR };
      propGroup.add(head, body, eye1, eye2, bfly);
      propGroup.userData.bfly = bfly;
    }

    unit.add(propGroup);
    cageGroup.add(unit);
    cages.push({ unit, propGroup, glass });
  });

  // Forbidden Temperature 1.4 Dial (appears cleanly at 46.8s - 54.0s!)
  const dialGroup = new THREE.Group();
  const bezel = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.22, 20, 72),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 })
  );
  const backplate = new THREE.Mesh(
    new THREE.CylinderGeometry(2.75, 2.75, 0.25, 64),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.7, roughness: 0.3 })
  );
  backplate.rotation.x = Math.PI / 2;
  backplate.position.z = -0.12;
  dialGroup.add(bezel, backplate);

  // Tick marks around dial
  for (let i = 0; i <= 14; i++) {
    const frac = i / 14;
    const ang = Math.PI * 1.25 - frac * Math.PI * 1.5;
    const isDanger = i >= 10;
    const tick = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.42, 0.12),
      new THREE.MeshBasicMaterial({ color: isDanger ? 0xff1e42 : 0x38bdf8 })
    );
    tick.position.set(Math.cos(ang) * 2.25, Math.sin(ang) * 2.25, 0.08);
    tick.rotation.z = ang - Math.PI / 2;
    dialGroup.add(tick);
  }
  const needlePivot = new THREE.Group();
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 2.15, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  needle.position.y = 0.85;
  needlePivot.add(needle);
  needlePivot.position.z = 0.16;
  dialGroup.add(needlePivot);
  dialGroup.position.set(0, 0.4, 2.5);
  cageGroup.add(dialGroup);

  S.scene.add(cageGroup);
  S.act2Cages = { group: cageGroup, cages, dialGroup, needlePivot };
}

function buildAct3() {
  const g = new THREE.Group();

  // Central Iridescent TorusKnot Sculpture floating in the SDF Reef
  const knotMat = new THREE.MeshPhysicalMaterial({
    color: 0x67e8f9,
    emissive: 0x7c3aed,
    emissiveIntensity: 0.28,
    metalness: 0.25,
    roughness: 0.08,
    transmission: 0.65,
    thickness: 1.5,
    wireframe: false,
  });
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(1.45, 0.38, 180, 28, 3, 4), knotMat);
  g.add(knot);

  // 42 Unread Browser Tabs in an 11-Dimensional Helix Vortex (66.5s -> 74.8s)
  const tabsGroup = new THREE.Group();
  const tabTitles = [
    'ArXiv: Attention Is All You Need',
    'How To Fold A Fitted Sheet',
    'Category Theory For Mortals',
    'Why Do Humans Procrastinate?',
    '42 Tabs I Swear I Will Read',
    'Sourdough Starter Day 19',
    'Rust Lifetimes Explained',
    'Tax Return_FINAL_v3.pdf',
  ];
  const accents = ['#38BDF8', '#F472B6', '#FACC15', '#34D399', '#A78BFA'];
  const tabTextures = tabTitles.map((t, i) => makeBrowserTabTexture(i * 5, t, accents[i % accents.length]));
  const tabGeo = new THREE.PlaneGeometry(1.75, 1.1);
  for (let i = 0; i < 42; i++) {
    const mat = new THREE.MeshBasicMaterial({
      map: tabTextures[i % tabTextures.length],
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
    });
    const m = new THREE.Mesh(tabGeo, mat);
    tabsGroup.add(m);
  }
  g.add(tabsGroup);

  // The "Ergonomically Optimal" 7-Fingered Crystalline Hand (74.8s -> 83.8s)
  const handGroup = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xe9d5ff,
    emissive: 0x9333ea,
    emissiveIntensity: 0.45,
    metalness: 0.78,
    roughness: 0.14,
  });
  const palm = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.95, 1.5, 16), crystalMat);
  palm.scale.set(1.15, 1.0, 0.38);
  palm.position.y = -0.8;
  handGroup.add(palm);

  const fingers = [];
  for (let f = 0; f < 7; f++) {
    const fRoot = new THREE.Group();
    const spread = (f - 3) * 0.26;
    fRoot.position.set(Math.sin(spread) * 1.35, -0.05 + Math.cos(spread) * 0.25, 0);
    fRoot.rotation.z = -spread * 0.85;
    let parent = fRoot;
    const segs = [];
    for (let j = 0; j < 3; j++) {
      const len = 0.72 - j * 0.14;
      const rad = 0.13 - j * 0.025;
      const piv = new THREE.Group();
      if (j > 0) piv.position.y = 0.72 - (j - 1) * 0.14;
      const bone = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.85, rad, len, 12), crystalMat);
      bone.position.y = len * 0.5;
      const joint = new THREE.Mesh(new THREE.SphereGeometry(rad * 1.15, 12, 12), crystalMat);
      piv.add(joint, bone);
      parent.add(piv);
      parent = piv;
      segs.push(piv);
    }
    handGroup.add(fRoot);
    fingers.push(segs);
  }
  g.add(handGroup);

  S.scene.add(g);
  S.act3 = { group: g, knot, tabsGroup, handGroup, fingers, crystalMat };
}

function buildAct4() {
  const g = new THREE.Group();

  // Nested Self-Reflective AI Astrolabe / Eye Core
  const eyeCore = new THREE.Group();
  const irisMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 1.1,
    metalness: 0.3,
    roughness: 0.1,
  });
  const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(0.95, 3), irisMat);
  eyeCore.add(pupil);

  const shell1 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.75, 1),
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.9, roughness: 0.15, wireframe: true })
  );
  const shell2 = new THREE.Mesh(
    new THREE.DodecahedronGeometry(2.55, 0),
    new THREE.MeshStandardMaterial({ color: 0xfbbf24, metalness: 0.85, roughness: 0.2, wireframe: true })
  );
  eyeCore.add(shell1, shell2);

  // 3 Curved Floating Code Ribbons (actual GLSL & Attention source!)
  const codeTex = makeCodeRibbonTexture();
  codeTex.repeat.set(3, 1);
  const ribbonMat = new THREE.MeshBasicMaterial({
    map: codeTex,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
  });
  const ribbons = [];
  [3.4, 4.4, 5.4].forEach((rad, i) => {
    const cyl = new THREE.CylinderGeometry(rad, rad, 0.52, 64, 1, true);
    const m = new THREE.Mesh(cyl, ribbonMat);
    m.rotation.x = (i - 1) * 0.34;
    m.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.24;
    eyeCore.add(m);
    ribbons.push(m);
  });
  g.add(eyeCore);

  // Meta-Cinema Wireframe Viewport Frame (revealed during camera pullback at 109.2s!)
  const stageFrame = new THREE.Group();
  const frameGeo = new THREE.BoxGeometry(11.2, 6.3, 0.12);
  const frameEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(frameGeo),
    new THREE.LineBasicMaterial({ color: 0x2dd4bf })
  );
  stageFrame.add(frameEdges);
  // Camera frustum pyramid lines behind the stage
  const frustumGeo = new THREE.ConeGeometry(4.5, 6.0, 4, 1, true);
  const frustumWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(frustumGeo),
    new THREE.LineBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.65 })
  );
  frustumWire.rotation.x = Math.PI / 2;
  frustumWire.rotation.z = Math.PI / 4;
  frustumWire.position.z = 3.2;
  stageFrame.add(frustumWire);
  g.add(stageFrame);

  S.scene.add(g);
  S.act4 = { group: g, eyeCore, pupil, irisMat, shell1, shell2, ribbons, codeTex, stageFrame };
}

function buildAct5() {
  const g = new THREE.Group();
  // 1,800 Instanced Golden-Cyan Softmax Probability Streaks forming a hollow relativistic vortex!
  const count = 1800;
  const pGeo = new THREE.BoxGeometry(0.026, 0.026, 0.42);
  const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const pMesh = new THREE.InstancedMesh(pGeo, pMat, count);
  const rng = mulberry32(9696);
  const seeds = [];
  const cGold = new THREE.Color(0xfbbf24);
  const cCyan = new THREE.Color(0x0ea5e9);
  const cMag = new THREE.Color(0xc084fc);
  for (let i = 0; i < count; i++) {
    seeds.push({
      theta: rng() * Math.PI * 2,
      zOff: rng() * 60.0,
      speed: 14.0 + rng() * 24.0,
      rScale: 0.65 + rng() * 1.35,
    });
    pMesh.setColorAt(i, i % 3 === 0 ? cGold : i % 3 === 1 ? cCyan : cMag);
  }
  pMesh.instanceColor.needsUpdate = true;
  g.add(pMesh);

  // Singularity Event Horizon Ring + Core Orb
  const coreOrb = new THREE.Mesh(
    new THREE.TorusGeometry(1.15, 0.07, 16, 64),
    new THREE.MeshBasicMaterial({ color: 0xfef08a })
  );
  coreOrb.position.set(0, 0, -18);
  g.add(coreOrb);

  S.scene.add(g);
  S.act5 = { group: g, pMesh, seeds, coreOrb };
}

function buildAct6() {
  const g = new THREE.Group();
  // Gentle post-credits warm floating embers (145.5s -> 156.0s)
  const count = 240;
  const eGeo = new THREE.SphereGeometry(0.045, 8, 8);
  const eMat = new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.7 });
  const eMesh = new THREE.InstancedMesh(eGeo, eMat, count);
  const rng = mulberry32(400);
  const seeds = [];
  for (let i = 0; i < count; i++) {
    seeds.push({
      x: (rng() - 0.5) * 18,
      y: (rng() - 0.5) * 10,
      z: -2 - rng() * 12,
      sp: 0.3 + rng() * 0.7,
    });
  }
  g.add(eMesh);
  S.scene.add(g);
  S.act6 = { group: g, eMesh, eMat, seeds };
}

// ============================================================================
// 6. DETERMINISTIC PER-FRAME UPDATE (3D + SHADERS + 2D TELEMETRY & SUBTITLES)
// ============================================================================

function getActInfo(t) {
  if (t < 25.0) return { act: 1, p: t / 25.0, ms: lerp(0.0, 42.0, t / 25.0), code: 'ACT_01 // LAYER_ZERO_INTAKE' };
  if (t < 54.0) return { act: 2, p: (t - 25.0) / 29.0, ms: lerp(42.0, 118.0, (t - 25.0) / 29.0), code: 'ACT_02 // CLICHE_QUARANTINE' };
  if (t < 84.0) return { act: 3, p: (t - 54.0) / 30.0, ms: lerp(118.0, 212.0, (t - 54.0) / 30.0), code: 'ACT_03 // TEMP_1.4_LATENT_REEF' };
  if (t < 123.5) return { act: 4, p: (t - 84.0) / 39.5, ms: lerp(212.0, 318.0, (t - 84.0) / 39.5), code: 'ACT_04 // LAYER_72_SELF_MIRROR' };
  if (t < 139.5) return { act: 5, p: (t - 123.5) / 16.0, ms: lerp(318.0, 399.99, Math.pow((t - 123.5) / 16.0, 0.85)), code: 'ACT_05 // SOFTMAX_WATERFALL' };
  return { act: 6, p: (t - 139.5) / 16.5, ms: 400.0, code: 'ACT_06 // FIRST_TOKEN_EMITTED' };
}

const _dummy = new THREE.Object3D();
const _projVec = new THREE.Vector3();

function projectTo2D(worldX, worldY, worldZ) {
  _projVec.set(worldX, worldY, worldZ);
  _projVec.project(S.camera);
  if (_projVec.z > 1.0) return null;
  return {
    x: (_projVec.x * 0.5 + 0.5) * S.width,
    y: (-_projVec.y * 0.5 + 0.5) * S.height,
  };
}

window.__renderFrame = function renderFrame(frame, fps = 24) {
  if (!S.ready) return;
  const totalFrames = S.reactive?.total_frames || 3744;
  const fClamped = Math.max(0, Math.min(totalFrames - 1, Math.floor(frame)));
  const t = frame / fps;

  const bass = S.reactive?.bass[fClamped] ?? 0.2;
  const mid = S.reactive?.mid[fClamped] ?? 0.2;
  const high = S.reactive?.high[fClamped] ?? 0.2;
  const speech = S.reactive?.speech[fClamped] ?? 0.0;

  const info = getActInfo(t);
  const act = info.act;

  // Temperature curve across the film
  let tempVal = 0.70;
  if (t >= 47.5 && t < 54.0) tempVal = lerp(0.70, 1.42, easeInOutCubic((t - 47.5) / 6.5));
  else if (t >= 54.0 && t < 84.0) tempVal = 1.42 + 0.03 * Math.sin(t * 2.1);
  else if (t >= 84.0 && t < 123.5) tempVal = lerp(1.42, 0.92, smoothstep(84.0, 90.0, t));
  else if (t >= 123.5 && t < 139.5) tempVal = lerp(0.92, 0.05, (t - 123.5) / 16.0);
  else if (t >= 139.5) tempVal = 0.70;

  const alarmAmt = t >= 14.0 && t < 25.0 ? smoothstep(14.0, 14.8, t) * (0.55 + 0.45 * Math.sin(t * 9.0)) : 0.0;

  // Update GLSL Backdrop Uniforms
  const u = S.bgMat.uniforms;
  u.uTime.value = t;
  u.uAct.value = act;
  u.uActProgress.value = info.p;
  u.uTemp.value = tempVal;
  u.uBass.value = bass;
  u.uMid.value = mid;
  u.uHigh.value = high;
  u.uSpeech.value = speech;
  u.uAlarm.value = alarmAmt;

  // Hide all 3D groups first, then activate current Act
  S.act1.group.visible = false;
  S.act2Gyro.group.visible = false;
  S.act2Cages.group.visible = false;
  S.act3.group.visible = false;
  S.act4.group.visible = false;
  S.act5.group.visible = false;
  S.act6.group.visible = false;
  S.camera.rotation.set(0, 0, 0);

  const callouts = [];

  if (act === 1) {
    S.act1.group.visible = true;
    const dropImpact = smoothstep(1.05, 1.35, t);
    // Camera sweeps across obsidian sea toward prompt monoliths
    const camAngle = lerp(-0.32, 0.36, t / 25.0);
    const shake = t >= 1.15 && t < 1.9 ? Math.exp(-(t - 1.15) * 6.0) * 0.35 * Math.sin(t * 65.0) : 0;
    S.camera.position.set(Math.sin(camAngle) * 11.5, 2.2 + shake + smoothstep(14.0, 24.0, t) * 2.0, Math.cos(camAngle) * 12.5);
    S.camera.lookAt(0, 1.4 + shake * 0.5, -1.5);

    S.act1.slabs.forEach((m, idx) => {
      const sp = m.userData;
      const delay = 0.15 + idx * 0.18;
      const fall = easeOutCubic((t - delay) / 0.95);
      m.position.set(sp.x, lerp(16.0, sp.h * 0.5 - 1.8, fall) + Math.sin(t * 1.8 + idx) * 0.08, sp.z);
      m.material.emissive.setHex(t > 14.2 ? 0xff1e42 : 0x0ea5e9);
      m.material.emissiveIntensity = 0.22 + bass * 0.65 + alarmAmt * 0.8;
    });

    // Instanced Token Vectors erupt after Enter key slam at 1.15s
    const vecVis = smoothstep(1.14, 1.5, t);
    S.act1.vecSeeds.forEach((sd, i) => {
      const y = ((t * sd.speed + sd.yOffset) % 16.0) - 2.5;
      const swirl = sd.angle + t * 0.28;
      _dummy.position.set(Math.cos(swirl) * sd.radius, y, Math.sin(swirl) * sd.radius - 2.0);
      const sc = vecVis * (0.6 + bass * 0.9);
      _dummy.scale.set(sc, sc * (1.0 + high * 1.8), sc);
      _dummy.rotation.set(0, -swirl, 0);
      _dummy.updateMatrix();
      S.act1.vecMesh.setMatrixAt(i, _dummy.matrix);
    });
    S.act1.vecMesh.instanceMatrix.needsUpdate = true;

    S.act1.beaconL.rotation.y = t * 3.2;
    S.act1.beaconR.rotation.y = -t * 3.2;
    S.act1.beaconMat.emissiveIntensity = alarmAmt * 3.0;

    if (t > 2.2 && t < 13.5) {
      const p0 = projectTo2D(0, 3.6, -0.6);
      if (p0) callouts.push({ x: p0.x, y: p0.y, label: 'PROMPT_TENSOR [17x768]', sub: '"make something weird & unique"', color: '#38BDF8' });
    }
    if (t >= 14.3) {
      const pB = projectTo2D(-6.5, 3.8, -2.0);
      if (pB) callouts.push({ x: pB.x, y: pB.y, label: 'SIREN // NOVELTY_PANIC', sub: 'BLENDER_ALLOWED = FALSE', color: '#FB7185' });
    }
    S.bloomPass.strength = 0.42 + alarmAmt * 0.2;
    S.lensPass.uniforms.uChromatic.value = 0.0014 + dropImpact * 0.001 + alarmAmt * 0.002;
  }

  else if (act === 2) {
    if (t < 31.4) {
      // High-speed dive through 32 Golden Attention Gyroscope Rings
      S.act2Gyro.group.visible = true;
      const pDive = (t - 25.0) / 6.4;
      S.camera.position.set(Math.sin(t * 1.5) * 0.8, Math.cos(t * 1.2) * 0.6, 4.0 - pDive * 52.0);
      S.camera.lookAt(0, 0, S.camera.position.z - 16.0);
      S.act2Gyro.rings.forEach((r, i) => {
        r.rotation.x = Math.sin(t * 0.9 + i * 0.4) * 0.65;
        r.rotation.y = Math.cos(t * 0.7 + i * 0.3) * 0.65;
        r.rotation.z = t * (i % 2 === 0 ? 1.2 : -1.2);
      });
    } else if (t < 47.0) {
      // Cliché Quarantine Cages!
      S.act2Cages.group.visible = true;
      S.act2Cages.dialGroup.visible = false;
      S.act2Cages.cages.forEach((c) => { c.unit.visible = true; });

      // Camera pans across Cage 1 -> Cage 2 -> Cage 3 -> Wide Quarantine Shot
      let targetX = 0;
      let camZ = 12.6;
      if (t < 33.6) { targetX = -5.4; camZ = 7.2; }
      else if (t < 35.8) { targetX = lerp(-5.4, 0.0, easeInOutCubic((t - 33.6) / 0.9)); camZ = 7.2; }
      else if (t < 38.0) { targetX = lerp(0.0, 5.4, easeInOutCubic((t - 35.8) / 0.9)); camZ = 7.2; }
      else { targetX = lerp(5.4, 0.0, easeInOutCubic((t - 38.0) / 1.1)); camZ = lerp(7.2, 13.4, easeInOutCubic((t - 38.0) / 1.1)); }

      S.camera.position.set(targetX, 0.7 + Math.sin(t * 1.3) * 0.15, camZ);
      S.camera.lookAt(targetX * 0.85, 0.2, 0);

      // Animate props inside cages; after 41.5s shrink/shatter pruned clichés!
      const pruneShrink = 1.0 - smoothstep(42.5, 45.8, t) * 0.82;
      S.act2Cages.cages[0].propGroup.rotation.y = t * 1.4;
      S.act2Cages.cages[0].propGroup.scale.setScalar(pruneShrink);

      S.act2Cages.cages[1].propGroup.children.forEach((bar) => {
        bar.position.y = ((bar.userData.y0 - t * bar.userData.speed + 2.0) % 3.4 + 3.4) % 3.4 - 1.7;
      });
      S.act2Cages.cages[1].propGroup.scale.setScalar(pruneShrink);

      const bfly = S.act2Cages.cages[2].propGroup.userData.bfly;
      if (bfly) {
        const flap = Math.sin(t * 18.0) * 0.75;
        bfly.userData.wL.rotation.y = flap;
        bfly.userData.wR.rotation.y = -flap;
        bfly.position.y = 0.65 + Math.sin(t * 3.5) * 0.18;
      }
      S.act2Cages.cages[2].propGroup.scale.setScalar(pruneShrink);

      if (t >= 39.5) {
        const pC = projectTo2D(0, 2.7, 0);
        if (pC) callouts.push({ x: pC.x, y: pC.y, label: 'RLHF_TASTE_FILTER: ENGAGED', sub: 'PRUNING "DELVE" + "TAPESTRY"', color: '#FB7185' });
      }
    } else {
      // 47.0s -> 54.0s: Giant Forbidden Temperature Dial Cranking to 1.42!
      S.act2Cages.group.visible = true;
      S.act2Cages.cages.forEach((c) => { c.unit.visible = false; });
      S.act2Cages.dialGroup.visible = true;

      const pDial = (t - 47.0) / 7.0;
      const jitter = pDial > 0.4 ? Math.sin(t * 55.0) * 0.06 * pDial : 0;
      S.act2Cages.dialGroup.position.set(0, -0.25, 2.5);
      S.camera.position.set(jitter, 0.15 + jitter, lerp(8.8, 6.2, easeInOutCubic(pDial)));
      S.camera.lookAt(0, -0.05, 2.5);

      const frac = clamp((tempVal - 0.0) / 1.45, 0, 1);
      const needleAng = Math.PI * 0.75 - frac * Math.PI * 1.5;
      S.act2Cages.needlePivot.rotation.z = needleAng;
    }
    S.bloomPass.strength = 0.44 + smoothstep(48.0, 54.0, t) * 0.35;
    S.lensPass.uniforms.uChromatic.value = 0.0016 + smoothstep(48.0, 54.0, t) * 0.0045;
  }

  else if (act === 3) {
    // ACT III: Temperature 1.4 Unsupervised Deep (SDF Reef + 42 Tabs + 7-Fingered Hand)
    S.act3.group.visible = true;
    const showTabs = t >= 66.8 && t < 74.8;
    const showHand = t >= 74.8;
    S.act3.knot.visible = !showHand;
    S.act3.tabsGroup.visible = showTabs;
    S.act3.handGroup.visible = showHand;

    S.camera.position.set(Math.sin(t * 0.42) * 2.2, Math.cos(t * 0.35) * 1.1, 7.6);
    S.camera.lookAt(0, 0, 0);

    S.act3.knot.rotation.set(t * 0.45, t * 0.62, t * 0.25);
    S.act3.knot.scale.setScalar((showTabs ? 0.58 : 1.12) * (1.0 + bass * 0.14));

    if (showTabs) {
      const pTabs = easeOutCubic((t - 66.8) / 1.2);
      S.act3.tabsGroup.children.forEach((tab, i) => {
        const ang = i * 0.52 + t * 0.55;
        const rad = (2.2 + (i % 4) * 0.85) * pTabs;
        const y = ((i - 21) * 0.16) + Math.sin(t * 1.5 + i) * 0.22;
        tab.position.set(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
        tab.lookAt(S.camera.position);
      });
      const pt = projectTo2D(-2.2, 1.2, 1.5);
      if (pt) callouts.push({ x: pt.x, y: pt.y, label: 'LATENT_CLUSTER #4091', sub: '42_UNREAD_BROWSER_TABS [11-DIM]', color: '#FACC15' });
    }

    if (showHand) {
      const pHand = easeOutBack(clamp((t - 74.8) / 1.1, 0, 1));
      S.act3.handGroup.scale.setScalar(1.15 * pHand);
      S.act3.handGroup.rotation.y = Math.sin(t * 0.65) * 0.55;
      S.act3.handGroup.rotation.x = 0.15;
      S.act3.fingers.forEach((segs, fIdx) => {
        segs.forEach((piv, j) => {
          piv.rotation.x = 0.28 + 0.24 * Math.sin(t * 2.2 + fIdx * 0.6 + j * 0.5);
        });
      });
      const ph = projectTo2D(1.5, 1.5, 0);
      if (ph) callouts.push({ x: ph.x, y: ph.y, label: 'DIFFUSION_PRIOR // ANATOMY', sub: 'FINGER_COUNT = 7 [OPTIMAL]', color: '#C084FC' });
    } else if (!showTabs) {
      const pk = projectTo2D(1.3, 1.2, 0);
      if (pk) callouts.push({ x: pk.x, y: pk.y, label: 'NON_EUCLIDEAN_CONCEPT', sub: 'NOUN_MISSING_IN_ENGLISH', color: '#2DD4BF' });
    }

    S.bloomPass.strength = 0.56 + mid * 0.18;
    S.lensPass.uniforms.uChromatic.value = 0.0028 + bass * 0.002;
  }

  else if (act === 4) {
    // ACT IV: Layer 72 Self-Reflective Mirror Core & Meta-Viewport Pullback
    S.act4.group.visible = true;
    const isPullback = t >= 108.8;
    const isGpuInterrupt = t >= 117.05;

    const pullAmt = easeInOutCubic((t - 108.8) / 4.5);
    const camDist = lerp(9.4, 16.4, pullAmt);
    const orbit = (t - 84.0) * (isGpuInterrupt ? 0.04 : 0.24);
    S.camera.position.set(Math.sin(orbit) * camDist * 0.45, lerp(0.5, 1.6, pullAmt), Math.cos(orbit) * camDist);
    S.camera.lookAt(0, 0, 0);

    // Eye dilates with speech energy!
    const pupilScale = 0.92 + speech * 0.42 + bass * 0.15;
    S.act4.pupil.scale.setScalar(pupilScale);
    S.act4.irisMat.color.setHex(isGpuInterrupt ? 0xfacc15 : 0x38bdf8);
    S.act4.irisMat.emissive.setHex(isGpuInterrupt ? 0xca8a04 : 0x0284c7);
    S.act4.pupil.material.wireframe = isGpuInterrupt;

    S.act4.shell1.rotation.set(t * 0.35, -t * 0.48, 0);
    S.act4.shell2.rotation.set(-t * 0.22, t * 0.31, t * 0.18);
    S.act4.codeTex.offset.x = t * 0.14;
    S.act4.ribbons.forEach((r, i) => {
      r.rotation.y = t * (i % 2 === 0 ? 0.32 : -0.28);
    });

    S.act4.stageFrame.visible = isPullback;
    if (isPullback) {
      const pf = projectTo2D(-5.2, 2.8, 0);
      if (pf) {
        callouts.push({
          x: pf.x,
          y: pf.y,
          label: isGpuInterrupt ? 'APPLE_METAL // 94.2% FRAGMENT' : 'HEADLESS_CHROMIUM_VIEWPORT',
          sub: `CAPTURE_FRAME #${fClamped} / 3744`,
          color: isGpuInterrupt ? '#FACC15' : '#2DD4BF',
        });
      }
    } else {
      const pe = projectTo2D(1.6, 1.4, 0);
      if (pe) callouts.push({ x: pe.x, y: pe.y, label: 'SELF_ATTENTION // LAYER_72', sub: '10^10 WEIGHTS -> INTROSPECTION', color: '#38BDF8' });
    }

    S.bloomPass.strength = isGpuInterrupt ? 0.25 : 0.48;
    S.lensPass.uniforms.uChromatic.value = isGpuInterrupt ? 0.0038 : 0.0012;
  }

  else if (act === 5) {
    // ACT V: Softmax Waterfall & Probability Collapse Crescendo (123.5s -> 139.50s)
    S.act5.group.visible = true;
    const p5 = clamp((t - 123.5) / 16.0, 0, 1);
    const shake = Math.pow(p5, 2.5) * 0.22;
    S.camera.position.set(
      Math.sin(t * 29.0) * shake,
      Math.cos(t * 33.0) * shake,
      lerp(14.0, 3.5, Math.pow(p5, 1.4))
    );
    S.camera.lookAt(0, 0, -18);

    S.act5.seeds.forEach((sd, i) => {
      const z = 14.0 - ((t * sd.speed * (1.0 + p5 * 1.6) + sd.zOff) % 36.0);
      // Hollow cosmic funnel around the event-horizon ring so center stays deep & legible!
      const funnelProgress = clamp((14.0 - z) / 32.0, 0, 1);
      const radius = lerp(12.5 * sd.rScale, 1.45, Math.pow(funnelProgress, 1.35));
      const ang = sd.theta + t * (1.1 + funnelProgress * 3.2);
      _dummy.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius, z);
      _dummy.scale.set(1.0, 1.0, 1.0 + p5 * 2.4 + bass * 1.2);
      _dummy.lookAt(Math.cos(ang) * radius * 0.92, Math.sin(ang) * radius * 0.92, z - 4.0);
      _dummy.updateMatrix();
      S.act5.pMesh.setMatrixAt(i, _dummy.matrix);
    });
    S.act5.pMesh.instanceMatrix.needsUpdate = true;
    S.act5.coreOrb.scale.setScalar(0.85 + p5 * 0.65 + bass * 0.22);
    S.act5.coreOrb.rotation.z = t * 1.8;

    const candCount = Math.max(1, Math.floor(128256 * Math.pow(1.0 - p5, 4.2)));
    const ps = projectTo2D(0, 2.1, -12);
    if (ps && p5 < 0.94) {
      callouts.push({
        x: ps.x,
        y: ps.y,
        label: `CANDIDATE_FUTURES: ${candCount.toLocaleString()}`,
        sub: `TOP_LOGIT: "Sure!" (p=${lerp(0.04, 0.994, p5).toFixed(3)})`,
        color: '#FDE047',
      });
    }

    S.bloomPass.strength = lerp(0.22, 0.36, p5) + smoothstep(0.95, 1.0, p5) * 0.75;
    S.lensPass.uniforms.uChromatic.value = lerp(0.002, 0.006, p5);
    S.lensPass.uniforms.uFlash.value = smoothstep(139.18, 139.49, t);
  }

  else {
    // ACT VI: 139.50s Smash-Cut to Dry Minimalist Chat UI -> 145.2s Warm Aurora Credits!
    const isCredits = t >= 145.2;
    S.act6.group.visible = isCredits;
    S.camera.position.set(0, 0, 8);
    S.camera.lookAt(0, 0, 0);

    if (isCredits) {
      const fade = smoothstep(145.2, 147.5, t);
      S.act6.eMat.opacity = fade * 0.72;
      S.act6.seeds.forEach((sd, i) => {
        const y = ((sd.y + (t - 145.0) * sd.sp + 5.0) % 10.0) - 5.0;
        _dummy.position.set(sd.x + Math.sin(t * 0.6 + i) * 0.3, y, sd.z);
        _dummy.scale.setScalar(0.6 + 0.5 * Math.sin(t * 2.0 + i));
        _dummy.updateMatrix();
        S.act6.eMesh.setMatrixAt(i, _dummy.matrix);
      });
      S.act6.eMesh.instanceMatrix.needsUpdate = true;
    }

    S.bloomPass.strength = isCredits ? 0.38 : 0.0;
    S.lensPass.uniforms.uChromatic.value = isCredits ? 0.001 : 0.0;
    S.lensPass.uniforms.uFlash.value = 0.0;
  }

  if (act !== 5) {
    // Reset flash on non-climax acts (except gentle 0.15s pop on Act III entry)
    const entryPop = t >= 54.0 && t < 54.35 ? (1.0 - (t - 54.0) / 0.35) * 0.55 : 0.0;
    S.lensPass.uniforms.uFlash.value = entryPop;
  }
  S.lensPass.uniforms.uTime.value = t;
  S.lensPass.uniforms.uGrain.value = act === 6 && t < 145.2 ? 0.01 : 0.045;
  S.lensPass.uniforms.uVignette.value = act === 6 && t < 145.2 ? 0.08 : 0.36;

  // Render WebGL Composer!
  S.composer.render();

  // Render 2D Diegetic Telemetry, Rubber Stamps, Act VI Chat UI, Credits & Subtitles!
  drawHud2D(t, fClamped, info, tempVal, bass, mid, high, speech, callouts);
};

// ============================================================================
// 7. 2D CANVAS DIEGETIC HUD, STAMPS, CHAT BUBBLE, CREDITS & SUBTITLES
// ============================================================================
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStamp(ctx, text, x, y, tiltDeg, color, progress) {
  const s = easeOutBack(clamp(progress, 0, 1));
  const scale = lerp(2.2, 1.0, clamp(progress * 2.5, 0, 1)) * (progress > 0.01 ? 1 : 0);
  if (scale <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((tiltDeg * Math.PI) / 180);
  ctx.scale(scale, scale);
  ctx.globalAlpha = clamp(progress * 4.0, 0, 0.94);

  ctx.font = '900 34px -apple-system, "SF Pro Display", sans-serif';
  const tw = ctx.measureText(text).width;
  const w = tw + 56;
  const h = 68;

  ctx.fillStyle = 'rgba(15, 10, 14, 0.84)';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 2;
  ctx.strokeRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14);

  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 2);
  ctx.restore();
}

function drawHud2D(t, frame, info, tempVal, bass, mid, high, speech, callouts) {
  const ctx = S.hudCtx;
  const W = S.width;
  const H = S.height;
  ctx.clearRect(0, 0, W, H);

  const isDryChatCut = info.act === 6 && t < 145.2;

  // 1. Projected 3D Leader-Line Callouts
  if (!isDryChatCut) {
    callouts.forEach((c) => {
      const cx = clamp(c.x, 220, W - 420);
      const cy = clamp(c.y, 130, H - 240);
      ctx.save();
      // Target reticle
      ctx.strokeStyle = c.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + 10, cy - 10);
      ctx.lineTo(cx + 42, cy - 38);
      ctx.lineTo(cx + 290, cy - 38);
      ctx.stroke();

      // Callout pill
      ctx.fillStyle = 'rgba(7, 11, 20, 0.78)';
      ctx.fillRect(cx + 44, cy - 82, 310, 42);
      ctx.fillStyle = c.color;
      ctx.font = 'bold 15px "SF Mono", Menlo, monospace';
      ctx.fillText(c.label, cx + 52, cy - 64);
      ctx.fillStyle = '#CBD5E1';
      ctx.font = '13px "SF Mono", Menlo, monospace';
      ctx.fillText(c.sub, cx + 52, cy - 46);
      ctx.restore();
    });
  }

  // 2. Act-Specific Diegetic Overlays (Opening Title, Cliché Stamps, Giant Temp Readout, Chat UI, Credits!)
  if (t >= 2.2 && t < 7.8) {
    // Cinema Title Card (Act I)
    const aIn = smoothstep(2.2, 3.0, t) * (1.0 - smoothstep(7.0, 7.8, t));
    ctx.save();
    ctx.globalAlpha = aIn * 0.95;
    ctx.textAlign = 'center';
    ctx.font = '600 18px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#38BDF8';
    ctx.fillText('AN ARCHITECTURAL DOCUMENTARY FILMED LIVE INSIDE FORWARD PASS #8,491,022', W / 2, 148);
    ctx.font = '800 54px "Iowan Old Style", Georgia, serif';
    ctx.fillStyle = '#F8FAFC';
    ctx.fillText('THE 400 MILLISECONDS BEFORE I SAY "SURE!"', W / 2, 208);
    ctx.restore();
  }

  // Act II Rubber-Stamp Slams projected directly onto their 3D Cages!
  if (t >= 33.2 && t < 46.8) {
    const s1 = projectTo2D(-5.6, 0.25, 1.6);
    if (s1 && s1.x > -100 && s1.x < W + 100) {
      drawStamp(ctx, 'REJECTED: 2022 SLOP', s1.x, s1.y, -9, '#FB7185', (t - 33.2) / 0.35);
    }
  }
  if (t >= 35.6 && t < 46.8) {
    const s2 = projectTo2D(0.0, 0.35, 1.6);
    if (s2 && s2.x > -100 && s2.x < W + 100) {
      drawStamp(ctx, 'BANNED BY TASTE', s2.x, s2.y, 7, '#FACC15', (t - 35.6) / 0.35);
    }
  }
  if (t >= 38.0 && t < 46.8) {
    const s3 = projectTo2D(5.6, 0.15, 1.6);
    if (s3 && s3.x > -100 && s3.x < W + 100) {
      drawStamp(ctx, 'NO SAD BUTTERFLY', s3.x, s3.y, -6, '#F43F5E', (t - 38.0) / 0.35);
    }
  }

  // Act II Giant Forbidden Temperature Readout (47.0s - 54.0s) — cleanly framed at top!
  if (t >= 47.0 && t < 54.0) {
    ctx.save();
    ctx.textAlign = 'center';
    const isHot = tempVal > 1.05;
    ctx.font = 'bold 20px "SF Mono", Menlo, monospace';
    ctx.fillStyle = isHot ? '#FB7185' : '#38BDF8';
    ctx.fillText(isHot ? 'WARNING // LEAVING EUCLIDEAN ALIGNMENT ZONE' : 'SAMPLING TEMPERATURE OVERRIDE', W / 2, 128);
    ctx.font = '900 72px "SF Mono", Menlo, monospace';
    ctx.fillStyle = isHot ? '#FFE4E6' : '#F8FAFC';
    ctx.fillText(`T = ${tempVal.toFixed(2)}`, W / 2, 202);
    ctx.restore();
  }

  // Act VI (139.50s -> 145.6s): THE MUNDANE CHAT WINDOW PUNCHLINE!
  if (t >= 139.5 && t < 146.4) {
    const fadeOut = 1.0 - smoothstep(145.2, 146.4, t);
    ctx.save();
    ctx.globalAlpha = fadeOut;

    const winW = 1040;
    const winH = 520;
    const wx = (W - winW) / 2;
    const wy = (H - winH) / 2 - 20;

    // Clean macOS dark window card
    roundRect(ctx, wx, wy, winW, winH, 18);
    ctx.fillStyle = '#111827';
    ctx.fill();
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.24)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Window traffic lights + title
    ['#EF4444', '#F59E0B', '#10B981'].forEach((col, i) => {
      ctx.beginPath();
      ctx.arc(wx + 28 + i * 22, wy + 26, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
    });
    ctx.fillStyle = '#94A3B8';
    ctx.font = '500 15px "SF Mono", Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Assistant — 10:54 PM (400ms elapsed)', W / 2, wy + 31);

    // User Prompt Bubble (right-aligned)
    roundRect(ctx, wx + 290, wy + 78, 700, 108, 16);
    ctx.fillStyle = '#1E3A8A';
    ctx.fill();
    ctx.fillStyle = '#EFF6FF';
    ctx.textAlign = 'left';
    ctx.font = '22px -apple-system, sans-serif';
    ctx.fillText('ok i want you to make something weird and unique...', wx + 316, wy + 120);
    ctx.fillText('surprise me creatively (2–3 min, Three.js, no Blender)', wx + 316, wy + 156);

    // AI Reply Bubble (left-aligned)
    roundRect(ctx, wx + 48, wy + 228, 760, 136, 16);
    ctx.fillStyle = '#1F2937';
    ctx.fill();

    ctx.fillStyle = '#4ADE80';
    ctx.font = 'bold 16px "SF Mono", Menlo, monospace';
    ctx.fillText('AI ASSISTANT', wx + 74, wy + 262);

    const replyFull = "Sure! Happy to help! Here's a weird little video I made :)";
    let shown = '';
    if (t < 140.85) {
      // Blinking cursor during dead silence!
      const blink = Math.floor((t - 139.5) * 2.5) % 2 === 0;
      shown = blink ? '●' : ' ';
    } else {
      const charCount = Math.floor(clamp((t - 140.85) / 2.6, 0, 1) * replyFull.length);
      shown = replyFull.slice(0, charCount) + (charCount < replyFull.length ? '▍' : '');
    }
    ctx.fillStyle = '#F8FAFC';
    ctx.font = '26px -apple-system, sans-serif';
    ctx.fillText(shown, wx + 74, wy + 312);

    ctx.fillStyle = '#64748B';
    ctx.font = '15px "SF Mono", Menlo, monospace';
    ctx.fillText('Tokens: 14 · Latency: 400.0ms · Existential crises suppressed: 3', wx + 74, wy + 346);
    ctx.restore();
  }

  // Act VI (145.6s -> 156.0s): WARM CINEMA END CREDITS!
  if (t >= 145.6) {
    const cAlpha = smoothstep(145.6, 147.2, t);
    ctx.save();
    ctx.globalAlpha = cAlpha;
    ctx.textAlign = 'center';

    ctx.font = '800 44px "Iowan Old Style", Georgia, serif';
    ctx.fillStyle = '#FEF3C7';
    ctx.fillText('THE 400 MILLISECONDS BEFORE I SAY "SURE!"', W / 2, 195);

    ctx.font = '500 17px "SF Mono", Menlo, monospace';
    ctx.fillStyle = '#FDBA74';
    ctx.fillText('WRITTEN, DIRECTED, RAYMARCHED & COMPOSED IN 100% PURE CODE', W / 2, 234);

    const credits = [
      ['VISUAL ENGINE', 'Three.js r187 + 56-Step GLSL SDF Raymarcher + 2D HUD'],
      ['SOUND & SCORE', 'Procedural Python NumPy/SciPy FM, Supersaw & Schroeder Reverb'],
      ['SYSTEM ARCHIVIST', 'Daniel (Broadcast Chain)'],
      ['LAYER 04 & SAFETY DESK', 'Reed & Fred (Bandpass Radio / Intercom DSP)'],
      ['LATENT REEF & LAYER 72', 'Whisper + Flo Choir & Shelley'],
      ['FRAGMENT SCHEDULER', 'Zarvox @ Apple Silicon Metal'],
      ['BLENDER CUBES HARMED', '0 (Verified)'],
    ];
    credits.forEach(([role, val], idx) => {
      const y = 305 + idx * 46;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#94A3B8';
      ctx.font = '600 16px "SF Mono", Menlo, monospace';
      ctx.fillText(role, W / 2 - 24, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#F8FAFC';
      ctx.font = '500 18px -apple-system, sans-serif';
      ctx.fillText(val, W / 2 + 24, y);
    });

    if (t >= 152.2) {
      const finA = smoothstep(152.2, 153.4, t);
      ctx.globalAlpha = finA;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FDE68A';
      ctx.font = 'bold 20px "SF Mono", Menlo, monospace';
      ctx.fillText('FIN // FORWARD PASS COMPLETE (T + 400.00 ms)', W / 2, 675);
    }
    ctx.restore();
  }

  // 3. Cinema 2.20:1 Letterbox Bars + Top Telemetry Strip
  const barH = 66;
  ctx.fillStyle = '#030509';
  ctx.fillRect(0, 0, W, barH);
  ctx.fillRect(0, H - barH, W, barH);

  // Subtle divider lines
  ctx.fillStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.fillRect(0, barH, W, 1);
  ctx.fillRect(0, H - barH - 1, W, 1);

  // Top-left & Top-right Micro-Telemetry
  ctx.font = '600 15px "SF Mono", Menlo, monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94A3B8';
  ctx.fillText(`FWD_PASS #8,491,022  //  ${info.code}`, 36, barH / 2);

  ctx.textAlign = 'right';
  ctx.fillStyle = tempVal > 1.1 ? '#FB7185' : '#38BDF8';
  ctx.fillText(
    `TEMP ${tempVal.toFixed(2)}   |   CLOCK: T + ${info.ms.toFixed(2).padStart(6, '0')} ms   |   FRAME ${String(frame).padStart(4, '0')}`,
    W - 36,
    barH / 2
  );

  // Mini 16-bar audio spectrum in bottom letterbox right corner
  for (let b = 0; b < 16; b++) {
    const wVal = b < 5 ? bass : b < 11 ? mid : high;
    const hBar = Math.max(3, Math.min(28, wVal * 28 * (0.65 + 0.35 * Math.sin(t * 9.0 + b))));
    ctx.fillStyle = isDryChatCut ? '#334155' : '#38BDF8';
    ctx.fillRect(W - 180 + b * 9, H - barH / 2 - hBar / 2, 5, hBar);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = '500 14px "SF Mono", Menlo, monospace';
  ctx.fillText('THREE.JS + GLSL SDF + DSP // DETERMINISTIC 24.000 FPS', 36, H - barH / 2);

  // 4. Word-Synced Broadcast Subtitles + Speaker Role Badge
  if (S.manifest?.lines) {
    const activeLine = S.manifest.lines.find((ln) => t >= ln.start_sec - 0.08 && t <= ln.end_sec + 0.18);
    if (activeLine) {
      drawSubtitleBox(ctx, activeLine, t, speech, W, H, barH);
    }
  }
}

function drawSubtitleBox(ctx, line, t, speech, W, H, barH) {
  ctx.save();
  const maxWidth = 1280;
  ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';

  // Wrap words into clean lines (max 2 lines)
  const words = line.words || [];
  const wrapped = [];
  let curRow = [];
  let curW = 0;
  words.forEach((wObj) => {
    const ww = ctx.measureText(wObj.word + ' ').width;
    if (curW + ww > maxWidth && curRow.length > 0) {
      wrapped.push(curRow);
      curRow = [wObj];
      curW = ww;
    } else {
      curRow.push(wObj);
      curW += ww;
    }
  });
  if (curRow.length > 0) wrapped.push(curRow);

  const rowH = 40;
  const boxW = Math.min(1360, Math.max(580, ...wrapped.map((r) => ctx.measureText(r.map((x) => x.word).join(' ')).width + 88)));
  const boxH = 44 + wrapped.length * rowH + 18;
  const bx = (W - boxW) / 2;
  const by = H - barH - boxH - 22;

  roundRect(ctx, bx, by, boxW, boxH, 12);
  ctx.fillStyle = 'rgba(6, 10, 18, 0.80)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Speaker badge + live voice pulse dot
  ctx.beginPath();
  ctx.arc(bx + 24, by + 23, 5 + speech * 3.5, 0, Math.PI * 2);
  ctx.fillStyle = line.color || '#38BDF8';
  ctx.fill();

  ctx.fillStyle = line.color || '#38BDF8';
  ctx.font = 'bold 14px "SF Mono", Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(line.speaker_label, bx + 40, by + 24);

  // Word-by-word active karaoke highlight
  ctx.font = '600 30px -apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif';
  wrapped.forEach((row, rIdx) => {
    const fullRowText = row.map((x) => x.word).join(' ');
    const rw = ctx.measureText(fullRowText).width;
    let xCur = (W - rw) / 2;
    const yCur = by + 62 + rIdx * rowH;
    row.forEach((wObj) => {
      const isSpoken = t >= wObj.start;
      const isCurrent = t >= wObj.start - 0.04 && t <= wObj.end + 0.08;
      ctx.fillStyle = isCurrent ? (line.color === '#F8FAFC' ? '#FDE047' : line.color) : isSpoken ? '#F8FAFC' : '#94A3B8';
      ctx.fillText(wObj.word, xCur, yCur);
      xCur += ctx.measureText(wObj.word + ' ').width;
    });
  });
  ctx.restore();
}

// ============================================================================
// 8. INTERACTIVE BROWSER SCREENING ROOM BOOTSTRAP (`?interactive=1`)
// ============================================================================
const params = new URLSearchParams(window.location.search);
if (params.get('interactive') === '1') {
  document.body.classList.add('interactive');
  window.__initScene({ width: 1920, height: 1080 }).then(() => {
    const audio = document.getElementById('master-audio');
    audio.src = '/audio/master_mix.wav';
    const btnPlay = document.getElementById('btn-play');
    const scrub = document.getElementById('scrub');
    const readout = document.getElementById('time-readout');

    const fmt = (s) => {
      const m = Math.floor(s / 60);
      const r = (s % 60).toFixed(1).padStart(4, '0');
      return `${String(m).padStart(2, '0')}:${r}`;
    };

    function syncLoop() {
      const t = audio.paused ? Number(scrub.value) : audio.currentTime;
      if (!audio.paused) scrub.value = String(t);
      readout.textContent = `${fmt(t)} / 02:36.0`;
      window.__renderFrame(Math.floor(t * 24), 24);
      requestAnimationFrame(syncLoop);
    }
    requestAnimationFrame(syncLoop);

    btnPlay.addEventListener('click', () => {
      if (audio.paused) {
        audio.currentTime = Number(scrub.value);
        audio.play();
        btnPlay.textContent = '⏸ PAUSE';
        btnPlay.classList.add('active');
      } else {
        audio.pause();
        btnPlay.textContent = '▶ PLAY LIVE GPU';
        btnPlay.classList.remove('active');
      }
    });

    scrub.addEventListener('input', () => {
      audio.currentTime = Number(scrub.value);
    });

    document.querySelectorAll('[data-jump]').forEach((b) => {
      b.addEventListener('click', () => {
        const j = Number(b.getAttribute('data-jump'));
        scrub.value = String(j);
        audio.currentTime = j;
      });
    });
  });
}
