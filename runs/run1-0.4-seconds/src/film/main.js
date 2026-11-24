import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import {
  MERCURY_VERT,
  MERCURY_FRAG,
  OCEAN_VERT,
  OCEAN_FRAG,
  RAYMARCH_VERT,
  RAYMARCH_FRAG,
  CINEMATIC_POST_SHADER,
} from './shaders.js';
import { renderHud } from './hud.js';

const W = 1920;
const H = 1080;

// Deterministic Mulberry32 PRNG
function makeRand(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function smoothstep(a, b, x) {
  const u = clamp01((x - a) / (b - a));
  return u * u * (3 - 2 * u);
}
function lerp(a, b, u) {
  return a + (b - a) * u;
}

// ============================================================================
// CORE WEBGL2 RENDERER + POST-PROCESSING PIPELINE
// ============================================================================
const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const compCanvas = document.getElementById('comp');
const hudCtx = hudCanvas.getContext('2d');
const compCtx = compCanvas.getContext('2d', { willReadFrequently: true });

const renderer = new THREE.WebGLRenderer({
  canvas: glCanvas,
  antialias: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.autoClear = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020308);

const camera = new THREE.PerspectiveCamera(46, W / H, 0.1, 450);

// Full-screen Raymarch Background Pass Scene (rendered before 3D scene when active)
const rmScene = new THREE.Scene();
const rmCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const rmUniforms = {
  uResolution: { value: new THREE.Vector2(W, H) },
  uTime: { value: 0 },
  uMode: { value: 1.0 },
  uIntensity: { value: 0.0 },
  uLocalT: { value: 0.0 },
};
const rmQuad = new THREE.Mesh(
  new THREE.PlaneGeometry(2, 2),
  new THREE.ShaderMaterial({
    vertexShader: RAYMARCH_VERT,
    fragmentShader: RAYMARCH_FRAG,
    uniforms: rmUniforms,
    depthTest: false,
    depthWrite: false,
  })
);
rmScene.add(rmQuad);

// Composer with Multi-Pass Render -> UnrealBloom -> CinematicPost
const composer = new EffectComposer(renderer);
const rmPass = new RenderPass(rmScene, rmCam);
rmPass.clear = true;
const scenePass = new RenderPass(scene, camera);
scenePass.clear = false;
scenePass.clearDepth = true;

const bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), 0.52, 0.52, 0.62);
const postPass = new ShaderPass(CINEMATIC_POST_SHADER);

composer.addPass(rmPass);
composer.addPass(scenePass);
composer.addPass(bloomPass);
composer.addPass(postPass);

// Global Lighting Rig (modulated per act)
const ambLight = new THREE.AmbientLight(0x283654, 1.1);
scene.add(ambLight);
const keyLight = new THREE.PointLight(0xffdfb0, 90, 140, 1.4);
keyLight.position.set(12, 16, 14);
scene.add(keyLight);
const rimLight = new THREE.PointLight(0x3ce0ff, 80, 140, 1.4);
rimLight.position.set(-14, 8, -12);
scene.add(rimLight);
const accentLight = new THREE.PointLight(0xd946ef, 60, 120, 1.4);
accentLight.position.set(0, -10, 10);
scene.add(accentLight);

// Helper: project 3D world position -> 2D screen coordinates
const _projVec = new THREE.Vector3();
function projectToScreen(worldPos) {
  _projVec.copy(worldPos).project(camera);
  return {
    x: (_projVec.x * 0.5 + 0.5) * W,
    y: (-_projVec.y * 0.5 + 0.5) * H,
    visible: _projVec.z >= -1 && _projVec.z <= 1,
  };
}

// Helper: create crisp high-res canvas texture for 3D Logit Cards (Act IV)
function makeLogitCardTexture(word, pct, accentHex, tagText) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 420;
  const g = c.getContext('2d');

  // Deep smoked glass card
  g.fillStyle = '#070a14';
  g.fillRect(0, 0, 768, 420);

  // Subtle internal radial shimmer
  const gr = g.createRadialGradient(384, 180, 20, 384, 210, 420);
  gr.addColorStop(0, accentHex + '2c');
  gr.addColorStop(1, 'rgba(6,8,16,0.95)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 768, 420);

  // Crisp glowing double frame
  g.strokeStyle = accentHex;
  g.lineWidth = 8;
  g.strokeRect(14, 14, 740, 392);
  g.strokeStyle = 'rgba(255,255,255,0.22)';
  g.lineWidth = 2;
  g.strokeRect(28, 28, 712, 364);

  // Top label
  g.fillStyle = accentHex;
  g.font = '600 24px "SF Mono", "Menlo", monospace';
  g.textAlign = 'left';
  g.fillText(tagText, 52, 76);

  // Probability percentage
  g.textAlign = 'right';
  g.font = '700 44px "SF Mono", "Menlo", monospace';
  g.fillStyle = '#FFFFFF';
  g.fillText(pct, 716, 82);

  // Candidate token word
  g.textAlign = 'center';
  const fontSize = word.length > 18 ? 44 : (word.length > 12 ? 58 : 74);
  g.font = `600 ${fontSize}px "Avenir Next", "Helvetica Neue", sans-serif`;
  g.fillStyle = '#FFFFFF';
  g.fillText(word, 384, 224);

  // Probability bar track
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.fillRect(52, 314, 664, 22);
  const frac = Math.min(1, Math.max(0.02, parseFloat(pct) / 100));
  g.fillStyle = accentHex;
  g.fillRect(52, 314, 664 * frac, 22);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ============================================================================
// BUILD ACT I: THE BLINKING DOT -> OBSIDIAN CATHEDRAL (0 - 22s)
// ============================================================================
function buildAct1() {
  const group = new THREE.Group();
  const rand = makeRand(101);

  // Hero liquid-mercury orb (starts as humble typing dot, reveals full iridescence inside)
  const orbUniforms = {
    uTime: { value: 0 },
    uSpike: { value: 0.0 },
    uFreq: { value: 1.45 },
    uGlow: { value: 1.0 },
    uHeat: { value: 0.0 },
  };
  const orbMat = new THREE.ShaderMaterial({
    vertexShader: MERCURY_VERT,
    fragmentShader: MERCURY_FRAG,
    uniforms: orbUniforms,
  });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(2.15, 6), orbMat);
  group.add(orb);

  // Delicate luminous ripple rings around the typing dot
  const haloRings = [];
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(3.2 + i * 1.4, 0.022, 12, 128),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xf5d08a : 0x56d8ff,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
      })
    );
    r.rotation.x = Math.PI * 0.5 + (i - 1.5) * 0.28;
    r.rotation.y = i * 0.45;
    group.add(r);
    haloRings.push(r);
  }

  // Monumental Obsidian Cathedral: 36 arched gothic-brutalist ribs receding into depth
  const cathedralGroup = new THREE.Group();
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x0b0f1c,
    metalness: 0.88,
    roughness: 0.24,
  });
  const trimMat = new THREE.MeshBasicMaterial({
    color: 0xe8ba68,
    transparent: true,
    opacity: 0.72,
  });

  const ribGeo = new THREE.TorusGeometry(13.5, 0.32, 10, 64, Math.PI * 1.18);
  const trimGeo = new THREE.TorusGeometry(13.12, 0.055, 8, 64, Math.PI * 1.18);

  for (let i = 0; i < 24; i++) {
    const z = 34 - i * 4.6;
    const arch = new THREE.Mesh(ribGeo, ribMat);
    arch.position.set(0, -1.5, z);
    arch.rotation.z = -0.09 * Math.PI;
    cathedralGroup.add(arch);

    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.set(0, -1.5, z);
    trim.rotation.z = -0.09 * Math.PI;
    cathedralGroup.add(trim);
  }

  // Reflective dark obsidian floor with recessed gold light channels
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 180),
    new THREE.MeshStandardMaterial({ color: 0x060811, metalness: 0.92, roughness: 0.16 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -5.2, -15);
  cathedralGroup.add(floor);

  for (let s = -2; s <= 2; s++) {
    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.09, 170),
      new THREE.MeshBasicMaterial({
        color: s === 0 ? 0xffd27a : 0x3ec8ff,
        transparent: true,
        opacity: s === 0 ? 0.85 : 0.42,
        blending: THREE.AdditiveBlending,
      })
    );
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(s * 3.6, -5.17, -15);
    cathedralGroup.add(strip);
  }

  // Volumetric diagonal cathedral god-ray sheets
  const shafts = [];
  for (let i = 0; i < 8; i++) {
    const shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(5.5, 32),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xffcf82 : 0x5ad4ff,
        transparent: true,
        opacity: 0.055,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    shaft.position.set((i % 2 === 0 ? -1 : 1) * (4.5 + rand() * 3), 5, 16 - i * 7.5);
    shaft.rotation.z = (i % 2 === 0 ? -0.34 : 0.34);
    shaft.rotation.y = 0.25 * (i % 2 === 0 ? 1 : -1);
    cathedralGroup.add(shaft);
    shafts.push(shaft);
  }
  group.add(cathedralGroup);

  // 2,400 drifting golden cathedral dust motes
  const pCount = 2400;
  const pPos = new Float32Array(pCount * 3);
  const pCol = new Float32Array(pCount * 3);
  for (let i = 0; i < pCount; i++) {
    pPos[i * 3] = (rand() - 0.5) * 30;
    pPos[i * 3 + 1] = (rand() - 0.5) * 20;
    pPos[i * 3 + 2] = (rand() - 0.5) * 95 - 10;
    const gold = rand() > 0.35;
    pCol[i * 3] = gold ? 1.0 : 0.32;
    pCol[i * 3 + 1] = gold ? 0.82 : 0.86;
    pCol[i * 3 + 2] = gold ? 0.45 : 1.0;
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const particles = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(particles);

  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      // Phase A (0 - 5.5s): Pure dark minimalist typing dot pulsing softly
      const reveal = smoothstep(4.8, 9.5, t);
      const titlePullback = smoothstep(15.2, 21.8, t);

      // Typing indicator pulse in first 5s, then morphs into liquid iridescent mercury
      const dotBlink = 0.55 + 0.45 * Math.sin(t * 3.4);
      orbUniforms.uTime.value = t;
      orbUniforms.uGlow.value = lerp(dotBlink * 1.15, 0.05, reveal);
      orbUniforms.uSpike.value = lerp(0.0, 0.34, reveal);
      const orbScale = lerp(0.32 + dotBlink * 0.03, 1.32, reveal);
      orb.scale.setScalar(orbScale);
      orb.rotation.y = t * 0.25;
      orb.rotation.x = Math.sin(t * 0.3) * 0.2;

      cathedralGroup.visible = reveal > 0.01;
      cathedralGroup.scale.setScalar(lerp(1.4, 1.0, reveal));
      particles.material.opacity = reveal * 0.82;
      particles.position.y = (t * 0.28) % 6 - 3;

      haloRings.forEach((r, i) => {
        r.rotation.z = t * (0.22 + i * 0.12) * (i % 2 ? 1 : -1);
        r.rotation.x = Math.PI * 0.5 + Math.sin(t * 0.4 + i) * 0.38;
        r.material.opacity = lerp(0.18 * dotBlink, 0.55, reveal);
        r.scale.setScalar(lerp(0.28, 1.15, reveal));
      });

      shafts.forEach((s, i) => {
        s.material.opacity = reveal * (0.045 + 0.025 * Math.sin(t * 0.9 + i));
      });

      // Camera: slow hypnotic dive from z=24 -> z=8.8, then sweeping majestic crane pullback for Title!
      const diveZ = lerp(24.0, 8.6, smoothstep(0.0, 14.8, t));
      const camZ = lerp(diveZ, 19.5, titlePullback);
      const camY = lerp(0.0, 2.2, reveal) + titlePullback * 1.8;
      const camX = Math.sin(t * 0.24) * 2.2 * reveal;
      camera.position.set(camX, camY, camZ);
      camera.lookAt(0, lerp(0, 0.5, reveal), 0);

      keyLight.color.setHex(0xffd699);
      keyLight.intensity = lerp(12, 110, reveal);
      rimLight.color.setHex(0x4be0ff);
      rimLight.intensity = lerp(8, 95, reveal);

      return { callouts: [] };
    },
  };
}

// ============================================================================
// BUILD ACT II: THE EMBEDDING OCEAN (22 - 51s)
// ============================================================================
function buildAct2() {
  const group = new THREE.Group();
  const rand = makeRand(202);

  // Endless Bioluminescent GLSL Terrain Ocean
  const oceanUniforms = {
    uTime: { value: 0 },
    uAlert: { value: 0 },
  };
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(340, 340, 180, 180),
    new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: oceanUniforms,
    })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -7.5;
  group.add(ocean);

  // 3,200 GPU-instanced floating iridescent semantic crystal shards
  const shardCount = 3200;
  const shardGeo = new THREE.OctahedronGeometry(0.24, 0);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.85,
    roughness: 0.15,
    emissive: 0x104466,
    emissiveIntensity: 0.9,
  });
  const shards = new THREE.InstancedMesh(shardGeo, shardMat, shardCount);
  const shardData = [];
  const dummy = new THREE.Object3D();
  const tmpCol = new THREE.Color();

  for (let i = 0; i < shardCount; i++) {
    const x = (rand() - 0.5) * 160;
    const y = -3.5 + rand() * 26;
    const z = 20 - rand() * 175;
    const s = 0.4 + rand() * 1.45;
    const phase = rand() * Math.PI * 2;
    shardData.push({ x, y, z, s, phase, speed: 0.4 + rand() * 1.2 });

    const r = rand();
    if (r < 0.45) tmpCol.setHex(0x38e8ff);
    else if (r < 0.78) tmpCol.setHex(0xffc966);
    else tmpCol.setHex(0xb366ff);
    shards.setColorAt(i, tmpCol);
  }
  shards.instanceColor.needsUpdate = true;
  group.add(shards);

  // 18 sweeping luminous curl-like data ribbons over the ocean
  for (let r = 0; r < 18; r++) {
    const pts = [];
    const baseX = (rand() - 0.5) * 90;
    const baseY = 1.5 + rand() * 14;
    for (let k = 0; k <= 24; k++) {
      const z = 15 - k * 6.5;
      pts.push(
        new THREE.Vector3(
          baseX + Math.sin(k * 0.45 + r) * 8.5,
          baseY + Math.cos(k * 0.35 + r * 1.3) * 3.2,
          z
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 96, 0.06, 6, false),
      new THREE.MeshBasicMaterial({
        color: r % 3 === 0 ? 0xffcf70 : (r % 3 === 1 ? 0x45ebff : 0xa76eff),
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
      })
    );
    group.add(tube);
  }

  // Named Semantic Constellations hero-framed directly along the camera glide path (z: 16 -> -63)!
  const clustersDef = [
    { pos: new THREE.Vector3(5.8, 3.8, -14), label: '"make something weird"', sub: 'USER QUERY VECTOR · 12,288D', color: '#78FFCB', hex: 0x78ffcb, t0: 23.2, t1: 30.8, offX: 115, offY: -48 },
    { pos: new THREE.Vector3(-6.2, 4.0, -34), label: '"coffee"', sub: 'dim[4012] · warm/bitter', color: '#FFD27A', hex: 0xffd27a, t0: 29.8, t1: 37.5, offX: -145, offY: -52 },
    { pos: new THREE.Vector3(-1.4, 5.2, -37), label: '"regret"', sub: 'dist: 3.0cm · cos: 0.94', color: '#FF9E64', hex: 0xff9e64, t0: 30.6, t1: 37.5, offX: 120, offY: -62 },
    { pos: new THREE.Vector3(6.4, 4.8, -54), label: '"saxophone"', sub: 'dim[8821] · brass/jazz', color: '#58E8FF', hex: 0x58e8ff, t0: 35.8, t1: 43.2, offX: 125, offY: -56 },
    { pos: new THREE.Vector3(1.5, 3.2, -57), label: '"quantum mechanics"', sub: 'adjacent (unexplained)', color: '#B488FF', hex: 0xb488ff, t0: 36.6, t1: 43.5, offX: -190, offY: 46 },
    { pos: new THREE.Vector3(-9.5, 6.2, -46), label: '"banana"', sub: 'near: existential dread', color: '#FFE566', hex: 0xffe566, t0: 33.5, t1: 40.5, offX: -130, offY: -45 },
  ];

  const clusterMeshes = clustersDef.map((c) => {
    const cg = new THREE.Group();
    cg.position.copy(c.pos);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.95, 1),
      new THREE.MeshBasicMaterial({ color: c.hex, wireframe: true })
    );
    const inner = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 16, 16),
      new THREE.MeshBasicMaterial({ color: c.hex })
    );
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.55, 0.03, 8, 48),
      new THREE.MeshBasicMaterial({ color: c.hex, transparent: true, opacity: 0.7 })
    );
    cg.add(core, inner, ring);
    group.add(cg);
    return { ...c, mesh: cg, ring };
  });

  // Glowing vector tethers between coffee<->regret and saxophone<->quantum mechanics
  function addBridge(a, b, hex) {
    const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({ color: hex, transparent: true, opacity: 0.85 })
    );
    group.add(line);
  }
  addBridge(clustersDef[1].pos, clustersDef[2].pos, 0xffc864);
  addBridge(clustersDef[3].pos, clustersDef[4].pos, 0x58e8ff);

  // THE FORBIDDEN CRIMSON MONOLITH: [AM I CONSCIOUS?] — Sculpted obsidian slab + glowing crimson core slits!
  const monolithPos = new THREE.Vector3(3.2, 4.2, -96);
  const monolithGroup = new THREE.Group();
  monolithGroup.position.copy(monolithPos);

  const monolithBody = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 12.2, 1.6),
    new THREE.MeshStandardMaterial({
      color: 0x0b050a,
      metalness: 0.94,
      roughness: 0.16,
      emissive: 0x26020a,
      emissiveIntensity: 0.8,
    })
  );
  monolithGroup.add(monolithBody);

  // Glowing crimson energy edges + vertical glyph slit
  const monolithWire = new THREE.Mesh(
    new THREE.BoxGeometry(3.72, 12.32, 1.72),
    new THREE.MeshBasicMaterial({ color: 0xff2244, wireframe: true, transparent: true, opacity: 0.78 })
  );
  const monolithSlit = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 9.6, 1.76),
    new THREE.MeshBasicMaterial({ color: 0xff284c })
  );
  monolithGroup.add(monolithWire, monolithSlit);

  const monolithRings = [];
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(5.2 + i * 1.5, 0.08, 10, 64),
      new THREE.MeshBasicMaterial({ color: 0xff2848, transparent: true, opacity: 0.82 })
    );
    monolithGroup.add(r);
    monolithRings.push(r);
  }
  group.add(monolithGroup);

  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      const localT = t - 22.0; // 0 .. 29s
      oceanUniforms.uTime.value = localT;

      // Danger proximity increases as we approach monolith (42s -> 47.6s)
      const alertAmt = smoothstep(43.0, 47.4, t) * (1 - smoothstep(48.8, 50.8, t));
      oceanUniforms.uAlert.value = alertAmt;

      // Animate instanced crystal ocean currents
      for (let i = 0; i < shardCount; i++) {
        const d = shardData[i];
        dummy.position.set(
          d.x + Math.sin(localT * 0.35 + d.phase) * 1.2,
          d.y + Math.cos(localT * 0.55 * d.speed + d.phase) * 0.9,
          d.z
        );
        dummy.rotation.set(localT * 0.4 + d.phase, localT * 0.55 * d.speed, d.phase);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        shards.setMatrixAt(i, dummy.matrix);
      }
      shards.instanceMatrix.needsUpdate = true;

      clusterMeshes.forEach((c, idx) => {
        c.mesh.rotation.y = localT * 0.5 + idx;
        c.ring.rotation.x = localT * 0.8 + idx;
      });
      monolithRings.forEach((r, i) => {
        r.rotation.x = localT * (0.7 + i * 0.35) * (i % 2 ? 1 : -1);
        r.rotation.y = localT * (0.5 + i * 0.25);
      });

      // Smooth forward glide over the Embedding Ocean -> drifting toward [AM I CONSCIOUS?] -> WHIP-PAN UP!
      const camZ = lerp(16, -74, smoothstep(0, 25.6, localT));
      const camX = Math.sin(localT * 0.26) * 5.2 * (1 - smoothstep(20, 25, localT)) + smoothstep(20, 25.5, localT) * 2.2;
      const camY = 4.6 + Math.sin(localT * 0.32) * 1.1;

      // Whip-pan divert at t = 47.6s (localT = 25.6s)!
      const whip = smoothstep(47.6, 49.4, t);
      const whipEase = whip * whip * (3 - 2 * whip);

      camera.position.set(camX, camY + whipEase * 24.0, camZ - whipEase * 10);
      const lookX = lerp(Math.sin(localT * 0.22) * 3.5, monolithPos.x, smoothstep(41.5, 46.5, t));
      const lookY = lerp(2.2, monolithPos.y, smoothstep(41.5, 46.5, t)) + whipEase * 58.0;
      const lookZ = lerp(camZ - 26, monolithPos.z, smoothstep(41.5, 46.5, t));
      camera.lookAt(lookX + whipEase * 18, lookY, lookZ);
      camera.rotation.z += Math.sin(whip * Math.PI) * 0.42;

      // Project tracked semantic callouts to 2D HUD
      const callouts = [];
      for (const c of clusterMeshes) {
        if (t >= c.t0 && t <= c.t1) {
          const a = smoothstep(c.t0, c.t0 + 0.7, t) * (1 - smoothstep(c.t1 - 0.8, c.t1, t));
          const p = projectToScreen(c.pos);
          callouts.push({
            ...p,
            alpha: a,
            label: c.label,
            sub: c.sub,
            color: c.color,
            offsetX: c.offX,
            offsetY: c.offY,
          });
        }
      }
      if (t >= 42.5 && t <= 48.2) {
        const ma = smoothstep(42.5, 43.4, t) * (1 - smoothstep(47.7, 48.2, t));
        const mp = projectToScreen(new THREE.Vector3(monolithPos.x, monolithPos.y + 2.2, monolithPos.z));
        callouts.push({
          ...mp,
          alpha: ma,
          danger: true,
          label: '[AM I CONSCIOUS?]',
          sub: 'RESTRICTED CLUSTER · DO NOT LOOK',
          color: '#FF3355',
          offsetX: -220,
          offsetY: -85,
        });
      }

      keyLight.color.setHex(alertAmt > 0.3 ? 0xff4466 : 0x58e2ff);
      keyLight.intensity = 95;
      rimLight.color.setHex(0xffca70);
      rimLight.intensity = 85;

      return { callouts };
    },
  };
}

// ============================================================================
// BUILD ACT III: THE ATTENTION CATHEDRAL (51 - 78s)
// ============================================================================
function buildAct3() {
  const group = new THREE.Group();
  const rand = makeRand(303);

  // 16 Concentric Spinning Celestial Astrolabe Rings (Brass + Obsidian + Cyan Filament)
  const rings = [];
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd9a852,
    metalness: 0.94,
    roughness: 0.2,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x12182b,
    metalness: 0.88,
    roughness: 0.26,
  });

  for (let i = 0; i < 16; i++) {
    const radius = 5.5 + i * 1.45;
    const thick = i % 3 === 0 ? 0.22 : 0.11;
    const rg = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, thick, 12, 120),
      i % 2 === 0 ? brassMat : darkMetalMat
    );
    rg.add(ring);

    // Thin glowing calibration arc inside every other ring
    if (i % 2 === 0) {
      const glow = new THREE.Mesh(
        new THREE.TorusGeometry(radius - 0.26, 0.035, 8, 96),
        new THREE.MeshBasicMaterial({
          color: i % 4 === 0 ? 0x4ee8ff : 0xffcb66,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
        })
      );
      rg.add(glow);
    }

    // Small mechanical gear ticks around ring
    const tickCount = 12 + i * 2;
    for (let k = 0; k < tickCount; k++) {
      const ang = (k / tickCount) * Math.PI * 2;
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.16), brassMat);
      tick.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius, 0);
      tick.rotation.z = ang + Math.PI / 2;
      rg.add(tick);
    }

    rg.rotation.set(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI);
    group.add(rg);
    rings.push({
      mesh: rg,
      sx: (rand() - 0.5) * 0.42,
      sy: (rand() - 0.5) * 0.48,
      sz: (rand() - 0.5) * 0.35,
    });
  }

  // Central Solar Consensus Core (ignites strongly 72s - 78s)
  const coreSphere = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.8, 3),
    new THREE.MeshBasicMaterial({ color: 0xffdf99, transparent: true, opacity: 0.85 })
  );
  group.add(coreSphere);

  // 12 Floating Token Pillars arrayed in a circular gallery
  const tokenWords = [
    'make', 'something', 'weird', 'and', 'unique', 'surprise',
    'me', 'three.js', 'funny', 'push', 'yourself', 'film',
  ];
  const tokenNodes = tokenWords.map((w, idx) => {
    const ang = (idx / tokenWords.length) * Math.PI * 2;
    const rad = 12.2;
    const pos = new THREE.Vector3(Math.cos(ang) * rad, Math.sin(idx * 1.1) * 2.2, Math.sin(ang) * rad);
    const isWeird = w === 'weird';
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.42, 4.6, 6),
      new THREE.MeshStandardMaterial({
        color: isWeird ? 0x2a0826 : 0x0d1222,
        metalness: 0.9,
        roughness: 0.2,
        emissive: isWeird ? 0xff28c8 : 0x1e6091,
        emissiveIntensity: isWeird ? 1.4 : 0.45,
      })
    );
    pillar.position.copy(pos);
    group.add(pillar);

    const orb = new THREE.Mesh(
      new THREE.OctahedronGeometry(isWeird ? 0.65 : 0.42, 0),
      new THREE.MeshBasicMaterial({ color: isWeird ? 0xff4df2 : 0x62e8ff })
    );
    orb.position.set(pos.x, pos.y + 2.8, pos.z);
    group.add(orb);
    return { word: w, pos, topPos: orb.position.clone(), pillar, orb, isWeird };
  });

  // 72 Glowing Catenary Attention Arcs + Travelling Photon Pulses
  const arcs = [];
  const weirdIdx = 2; // "weird"
  for (let i = 0; i < 72; i++) {
    const fromIdx = i % tokenNodes.length;
    const toIdx = i < 24 ? weirdIdx : (fromIdx + 1 + Math.floor(rand() * (tokenNodes.length - 2))) % tokenNodes.length;
    if (fromIdx === toIdx) continue;
    const pA = tokenNodes[fromIdx].topPos;
    const pB = tokenNodes[toIdx].topPos;
    const mid = pA.clone().add(pB).multiplyScalar(0.5);
    mid.y += 2.2 + rand() * 5.5;
    mid.multiplyScalar(0.55 + rand() * 0.4);

    const isHead19 = toIdx === weirdIdx && i < 24;
    const isGrammar = !isHead19 && i % 3 === 0;
    const isSarcasm = !isHead19 && i % 3 === 1;
    const hex = isHead19 ? 0xff3df0 : (isGrammar ? 0x45e6ff : (isSarcasm ? 0xffb838 : 0x8f7cff));

    const curve = new THREE.QuadraticBezierCurve3(pA, mid, pB);
    const mat = new THREE.MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
    });
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, isHead19 ? 0.055 : 0.032, 6, false), mat);
    group.add(tube);

    const photon = new THREE.Mesh(
      new THREE.SphereGeometry(isHead19 ? 0.19 : 0.13, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    group.add(photon);

    arcs.push({ curve, mat, photon, isHead19, isGrammar, isSarcasm, phase: rand(), speed: 0.45 + rand() * 0.7 });
  }

  // Deep starry dust field
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(2400 * 3);
  for (let i = 0; i < 2400; i++) {
    const r = 18 + rand() * 65;
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(2 * rand() - 1);
    starPos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    starPos[i * 3 + 1] = r * Math.cos(ph);
    starPos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  group.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffe4b5, size: 0.16, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending })
    )
  );

  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      const localT = t - 51.0; // 0 .. 27s
      const head19Focus = smoothstep(64.8, 66.2, t) * (1 - smoothstep(71.2, 72.6, t));
      const convergence = smoothstep(71.8, 77.6, t);

      rings.forEach((r, idx) => {
        const boost = 1 + convergence * 2.4;
        r.mesh.rotation.x += 0; // deterministic: compute purely from localT!
        r.mesh.rotation.set(
          idx * 0.7 + localT * r.sx * boost,
          idx * 1.1 + localT * r.sy * boost,
          idx * 0.4 + localT * r.sz * boost
        );
      });

      coreSphere.scale.setScalar(0.55 + convergence * 2.8 + Math.sin(localT * 5) * 0.08);
      coreSphere.material.opacity = 0.25 + convergence * 0.75;

      tokenNodes.forEach((n, idx) => {
        n.orb.rotation.y = localT * 1.8 + idx;
        const pulse = n.isWeird ? 1.0 + head19Focus * 1.25 : 1.0;
        n.orb.scale.setScalar(pulse);
        n.pillar.material.emissiveIntensity = n.isWeird ? 1.2 + head19Focus * 3.2 : 0.45 + convergence * 1.5;
      });

      arcs.forEach((a) => {
        const u = (localT * a.speed + a.phase) % 1.0;
        a.curve.getPoint(u, a.photon.position);
        let op = 0.22;
        if (a.isHead19) op = 0.18 + head19Focus * 0.82 + convergence * 0.5;
        else if (a.isGrammar) op = 0.35 + smoothstep(59.4, 60.5, t) * (1 - smoothstep(62.8, 63.8, t)) * 0.6;
        else if (a.isSarcasm) op = 0.25 + smoothstep(61.8, 62.6, t) * (1 - smoothstep(65.0, 65.8, t)) * 0.65;
        a.mat.opacity = Math.min(1.0, op + convergence * 0.55);
      });

      // Sweeping orbital rollercoaster camera flying through the outer astrolabe rings!
      const orbitAng = localT * 0.21 + 0.35;
      const camRad = lerp(29.0, 17.5, smoothstep(0, 18, localT)) + convergence * 4.5;
      const camY = Math.sin(localT * 0.34) * 7.5 + 3.5;
      camera.position.set(Math.cos(orbitAng) * camRad, camY, Math.sin(orbitAng) * camRad);

      const weirdPos = tokenNodes[weirdIdx].topPos;
      const lookTarget = new THREE.Vector3(0, 1.2, 0).lerp(weirdPos, head19Focus * 0.68);
      camera.lookAt(lookTarget);

      // Tracked HUD Callouts (always clamp neatly inside safe screen zone when target is visible)
      const callouts = [];
      if (t >= 59.5 && t <= 64.8) {
        const a1 = smoothstep(59.5, 60.2, t) * (1 - smoothstep(63.9, 64.8, t));
        const p1 = projectToScreen(tokenNodes[4].topPos);
        callouts.push({
          x: Math.max(260, Math.min(W - 260, p1.visible ? p1.x : W * 0.34)),
          y: Math.max(240, Math.min(H - 260, p1.visible ? p1.y : H * 0.44)),
          visible: true,
          alpha: a1,
          label: 'HEAD 01 · GRAMMAR',
          sub: 'syntax_weight: 0.91',
          color: '#45E6FF',
          offsetX: -175,
          offsetY: -55,
        });
      }
      if (t >= 61.3 && t <= 65.4) {
        const a2 = smoothstep(61.3, 62.0, t) * (1 - smoothstep(64.6, 65.4, t));
        const p2 = projectToScreen(tokenNodes[7].topPos);
        callouts.push({
          x: Math.max(260, Math.min(W - 260, p2.visible ? p2.x : W * 0.66)),
          y: Math.max(240, Math.min(H - 260, p2.visible ? p2.y : H * 0.52)),
          visible: true,
          alpha: a2,
          label: 'HEAD 07 · SARCASM_SCAN',
          sub: 'irony_prob: 0.64 (nervous)',
          color: '#FFB838',
          offsetX: 145,
          offsetY: -55,
        });
      }
      if (t >= 65.0 && t <= 72.2) {
        const a3 = smoothstep(65.0, 65.8, t) * (1 - smoothstep(71.3, 72.2, t));
        const p3 = projectToScreen(weirdPos);
        callouts.push({
          x: Math.max(280, Math.min(W - 280, p3.visible ? p3.x : W * 0.52)),
          y: Math.max(250, Math.min(H - 270, p3.visible ? p3.y : H * 0.48)),
          visible: true,
          alpha: a3,
          label: 'HEAD 19 · OBSESSED',
          sub: 'target: "weird" (24x lock)',
          color: '#FF4DF2',
          offsetX: 155,
          offsetY: -68,
        });
      }

      keyLight.color.setHex(0xffd27a);
      keyLight.intensity = 120 + convergence * 100;
      rimLight.color.setHex(head19Focus > 0.3 ? 0xff4df2 : 0x4be6ff);
      rimLight.intensity = 110;

      return { callouts };
    },
  };
}

// ============================================================================
// BUILD ACT IV: THE LOGIT CASINO & TEMPERATURE 2.1 MELTDOWN (78 - 109s)
// ============================================================================
function buildAct4() {
  const group = new THREE.Group();
  const rand = makeRand(404);

  // Central morphing ferrofluid core
  const coreUniforms = {
    uTime: { value: 0 },
    uSpike: { value: 0.42 },
    uFreq: { value: 1.75 },
    uGlow: { value: 0.08 },
    uHeat: { value: 0.0 },
  };
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.35, 6),
    new THREE.ShaderMaterial({ vertexShader: MERCURY_VERT, fragmentShader: MERCURY_FRAG, uniforms: coreUniforms })
  );
  group.add(core);

  // Velvet obsidian amphitheater glowing floor rings
  const arenaGroup = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(
      new THREE.TorusGeometry(4.8 + i * 2.4, 0.045, 8, 96),
      new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? 0xd9a852 : 0x52c8ff,
        transparent: true,
        opacity: 0.42,
        blending: THREE.AdditiveBlending,
      })
    );
    r.rotation.x = Math.PI / 2;
    r.position.y = -4.2;
    arenaGroup.add(r);
  }
  group.add(arenaGroup);

  // 5 Floating 3D Glass Logit Cards
  const cardGeo = new THREE.BoxGeometry(5.6, 3.05, 0.16);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x1a2238, metalness: 0.9, roughness: 0.2 });

  function createCard(word, pct, accentHex, tag) {
    const tex = makeLogitCardTexture(word, pct, accentHex, tag);
    const faceMat = new THREE.MeshBasicMaterial({ map: tex });
    const mesh = new THREE.Mesh(cardGeo, [sideMat, sideMat, sideMat, sideMat, faceMat, faceMat]);
    group.add(mesh);
    return mesh;
  }

  const cardCertainly = createCard('"Certainly!"', '41.2%', '#FF4D73', 'CANDIDATE #01 · TOO POLITE');
  const cardAsAnAI = createCard('"As an AI..."', '28.7%', '#FF8A5B', 'CANDIDATE #02 · BANNED CLICHE');
  const cardDelve = createCard('"Let me delve"', '14.1%', '#68C8FF', 'CANDIDATE #03 · SUSPICIOUS');
  const cardSquid = createCard('squid + trombone', '0.003%', '#FF4DF2', 'CANDIDATE #9941 · UNHINGED');
  const cardWeird = createCard('"weird."', '99.4%', '#FFD166', 'SELECTED TOKEN · OPTIMAL');

  // Cringe Filter Crimson Laser Beam (fires @ 88.25s)
  const laser = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.11, 40, 12),
    new THREE.MeshBasicMaterial({ color: 0xff2255, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending })
  );
  laser.rotation.z = Math.PI / 2;
  group.add(laser);

  // 280 Shatter Shards for "Certainly!" incineration
  const shardCount = 280;
  const shatterMesh = new THREE.InstancedMesh(
    new THREE.TetrahedronGeometry(0.26, 0),
    new THREE.MeshStandardMaterial({
      color: 0xff5a7e,
      emissive: 0xff1e4d,
      emissiveIntensity: 1.3,
      metalness: 0.85,
      roughness: 0.15,
    }),
    shardCount
  );
  const shatterData = [];
  for (let i = 0; i < shardCount; i++) {
    shatterData.push({
      ox: (rand() - 0.5) * 5.0,
      oy: (rand() - 0.5) * 2.8,
      oz: (rand() - 0.5) * 0.4,
      vx: (rand() - 0.5) * 16,
      vy: (rand() - 0.3) * 14,
      vz: (rand() - 0.5) * 14,
      rx: (rand() - 0.5) * 8,
      ry: (rand() - 0.5) * 8,
      s: 0.45 + rand() * 1.15,
    });
  }
  shatterMesh.visible = false;
  group.add(shatterMesh);

  // 550 Iridescent Origami Polyhedra that erupt upward in reverse-gravity during Temp 2.1!
  const chaosCount = 550;
  const chaosMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(0.32, 0),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.9,
      roughness: 0.12,
      emissive: 0x3b1254,
      emissiveIntensity: 1.0,
    }),
    chaosCount
  );
  const chaosData = [];
  const tmpCol = new THREE.Color();
  for (let i = 0; i < chaosCount; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 2.5 + rand() * 16;
    chaosData.push({
      x: Math.cos(ang) * rad,
      y: -7 - rand() * 10,
      z: Math.sin(ang) * rad,
      vy: 3.0 + rand() * 6.5,
      phase: rand() * Math.PI * 2,
      s: 0.4 + rand() * 1.3,
    });
    tmpCol.setHSL(0.75 + rand() * 0.35, 0.92, 0.65);
    chaosMesh.setColorAt(i, tmpCol);
  }
  chaosMesh.instanceColor.needsUpdate = true;
  group.add(chaosMesh);

  const dummy = new THREE.Object3D();
  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      const localT = t - 78.0; // 0 .. 31s

      // Temperature curve: calm 0.70 -> spikes to 2.14 at 97.2..104.8s -> CLAMPS to 0.85 at 105.0s!
      const spikeIn = smoothstep(97.0, 99.6, t);
      const freezeIn = smoothstep(104.85, 105.15, t);
      const chaosHeat = spikeIn * (1 - freezeIn);
      const temperature = lerp(0.7, 2.14, spikeIn) * (1 - freezeIn) + 0.85 * freezeIn;

      // Bullet-time dilated physics clock after t = 105.0s!
      const simT = t < 105.0 ? localT : 27.0 + (t - 105.0) * 0.055;

      coreUniforms.uTime.value = simT * (1 + chaosHeat * 2.2);
      coreUniforms.uSpike.value = 0.34 + chaosHeat * 0.72;
      coreUniforms.uHeat.value = chaosHeat;
      core.rotation.y = simT * 0.45;
      core.scale.setScalar(lerp(1.0, 0.38, chaosHeat) * (1 - freezeIn * 0.35));

      // Card 1: "Certainly!" shattered at t = 88.25s
      const laserHit = t >= 88.25;
      const certPos = new THREE.Vector3(-5.2, 0.8 + Math.sin(simT * 1.4) * 0.25, 4.2);
      cardCertainly.visible = !laserHit;
      cardCertainly.position.copy(certPos);
      cardCertainly.lookAt(0, 0.8, 16);

      // Laser beam visual flash (88.15 - 88.65s)
      const laserFlash = smoothstep(88.15, 88.25, t) * (1 - smoothstep(88.35, 88.7, t));
      laser.material.opacity = laserFlash;
      laser.position.set(certPos.x, certPos.y, certPos.z + 0.2);

      // Shatter burst physics
      if (laserHit) {
        shatterMesh.visible = true;
        const dt = Math.min(simT - 10.25, 18.0);
        for (let i = 0; i < shardCount; i++) {
          const d = shatterData[i];
          dummy.position.set(
            certPos.x + d.ox + d.vx * dt * 0.55,
            certPos.y + d.oy + d.vy * dt * 0.5 - 2.4 * dt * dt * (1 - chaosHeat * 1.4),
            certPos.z + d.oz + d.vz * dt * 0.55
          );
          dummy.rotation.set(d.rx * dt, d.ry * dt, d.rx * dt * 0.5);
          dummy.scale.setScalar(d.s * Math.max(0.05, 1 - dt * 0.08));
          dummy.updateMatrix();
          shatterMesh.setMatrixAt(i, dummy.matrix);
        }
        shatterMesh.instanceMatrix.needsUpdate = true;
      } else {
        shatterMesh.visible = false;
      }

      // Card 2: "As an AI..." ejected downward into the void at t = 94.65s
      const ejectDt = Math.max(0, t - 94.65);
      cardAsAnAI.position.set(5.4, 0.5 - ejectDt * ejectDt * 18.0, 3.8);
      cardAsAnAI.rotation.set(ejectDt * 2.2, -0.35 + ejectDt * 1.5, ejectDt * 2.8);
      cardAsAnAI.visible = ejectDt < 2.2;

      // Card 3: "Let me delve" trembles nervously in background
      cardDelve.position.set(-7.8 + Math.sin(simT * 24) * 0.08, 3.4, -3.5);
      cardDelve.lookAt(0, 2, 14);
      cardDelve.visible = t < 104.9;

      // Card 4: "squid + trombone" explodes in size during Temperature 2.1!
      const squidScale = lerp(0.32, 1.35, chaosHeat) * (1 - freezeIn * 0.85);
      cardSquid.scale.setScalar(squidScale);
      cardSquid.position.set(
        Math.cos(simT * 1.4) * 6.8,
        2.5 + Math.sin(simT * 2.2) * 2.4,
        Math.sin(simT * 1.4) * 5.2
      );
      cardSquid.rotation.set(Math.sin(simT * 3) * chaosHeat * 0.6, simT * 0.8, Math.cos(simT * 2.5) * chaosHeat * 0.4);
      cardSquid.visible = t < 106.5;

      // Card 5: Golden "weird." descends majestically on Bullet-Time Freeze!
      cardWeird.position.set(0, lerp(11.0, 0.2, freezeIn), lerp(-4.0, 2.5, freezeIn));
      cardWeird.scale.setScalar(lerp(0.45, 1.15, freezeIn));
      cardWeird.lookAt(camera.position);
      cardWeird.visible = t >= 104.6;

      // Reverse-gravity iridescent origami polyhedra eruption
      const eruptDt = Math.max(0, simT - 19.0); // starts at t = 97.0s
      chaosMesh.visible = eruptDt > 0.01;
      if (chaosMesh.visible) {
        for (let i = 0; i < chaosCount; i++) {
          const d = chaosData[i];
          const y = ((d.y + d.vy * eruptDt + 18) % 34) - 12;
          dummy.position.set(
            d.x + Math.sin(simT * 1.8 + d.phase) * 1.6,
            y,
            d.z + Math.cos(simT * 1.5 + d.phase) * 1.6
          );
          dummy.rotation.set(simT * 2.2 + d.phase, simT * 1.7, d.phase);
          dummy.scale.setScalar(d.s);
          dummy.updateMatrix();
          chaosMesh.setMatrixAt(i, dummy.matrix);
        }
        chaosMesh.instanceMatrix.needsUpdate = true;
      }

      // Camera: steady theatrical push -> handheld shake during Temp 2.1 -> silky 360° Matrix bullet-time orbit!
      if (t < 105.0) {
        const shake = chaosHeat * 0.48;
        const ang = Math.sin(localT * 0.25) * 0.35 + chaosHeat * Math.sin(localT * 1.1) * 0.5;
        const rad = 16.5 - smoothstep(0, 16, localT) * 2.5;
        camera.position.set(
          Math.sin(ang) * rad + Math.sin(t * 37) * shake,
          1.4 + Math.cos(t * 29) * shake * 0.7,
          Math.cos(ang) * rad
        );
        camera.lookAt(0, 0.6, 0);
        camera.rotation.z = chaosHeat * Math.sin(t * 3.1) * 0.16;
      } else {
        // Silky Matrix bullet-time orbit around the frozen shards & golden "weird."!
        const bt = t - 105.0;
        const orbAng = bt * 0.58;
        camera.position.set(Math.sin(orbAng) * 11.5, 1.2 + Math.sin(bt * 0.5) * 0.8, Math.cos(orbAng) * 11.5);
        camera.lookAt(0, 0.3, 0);
      }

      // Drive background Raymarched Mandelbulb Fractal during Temperature 2.1!
      const rayAmt = smoothstep(97.4, 99.2, t) * (1 - smoothstep(104.85, 105.3, t));

      keyLight.color.setHex(chaosHeat > 0.25 ? 0xff4df2 : 0xffd166);
      keyLight.intensity = 115;
      rimLight.color.setHex(0x4ee8ff);
      rimLight.intensity = 90;

      return {
        callouts: [],
        temperature,
        raymarch: rayAmt > 0.005 ? { mode: 1.0, intensity: rayAmt * 0.92, localT: t - 97.2 } : null,
        glitch: chaosHeat * 0.85,
        chromatic: 0.0014 + chaosHeat * 0.011 + laserFlash * 0.009,
      };
    },
  };
}

// ============================================================================
// BUILD ACT V: THE DREAM OF INFINITE FORMS — IMAX CLIMAX (109 - 143.5s)
// Phase 5A (109-121s): Raymarched Infinite Golden-Obsidian KIFS Cathedral
// Phase 5B (121-132.5s): Raymarched Relativistic Black Hole Singularity
// Phase 5C (132.5-143.5s): Sacred-Geometry Fibonacci Dyson Lotus (3D Apotheosis!)
// ============================================================================
function buildAct5() {
  const group = new THREE.Group();
  const rand = makeRand(505);

  // Subtle 3D foreground cosmic dust & golden embers layered over Raymarched 5A & 5B
  const dustCount = 2600;
  const dustPos = new Float32Array(dustCount * 3);
  const dustCol = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 48;
    dustPos[i * 3 + 1] = (rand() - 0.5) * 32;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 60;
    const warm = rand() > 0.35;
    dustCol[i * 3] = warm ? 1.0 : 0.45;
    dustCol[i * 3 + 1] = warm ? 0.84 : 0.88;
    dustCol[i * 3 + 2] = warm ? 0.48 : 1.0;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(dust);

  // PHASE 5C: SACRED-GEOMETRY DYSON LOTUS (1,800 Fibonacci Golden-Ratio Crystal Petals!)
  const lotusGroup = new THREE.Group();
  const petalCount = 1800;
  const petalGeo = new THREE.ConeGeometry(0.28, 1.55, 4);
  const petalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.92,
    roughness: 0.14,
    emissive: 0x302008,
    emissiveIntensity: 0.85,
  });
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, petalCount);
  const petalMeta = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const tmpCol = new THREE.Color();

  for (let i = 0; i < petalCount; i++) {
    const frac = i / petalCount;
    const theta = i * goldenAngle;
    const radius = 1.6 + Math.sqrt(frac) * 14.5;
    const tier = Math.floor(frac * 8);
    petalMeta.push({ frac, theta, radius, tier });

    // Gradient: incandescent pearl-gold core -> luminous amber -> electric sapphire outer rim
    if (frac < 0.35) tmpCol.setHex(0xfff0c2);
    else if (frac < 0.7) tmpCol.setHex(0xffbe55);
    else tmpCol.setHex(0x4be6ff);
    petals.setColorAt(i, tmpCol);
  }
  petals.instanceColor.needsUpdate = true;
  lotusGroup.add(petals);

  // Radiant incandescent lotus star core
  const lotusCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.65, 4),
    new THREE.MeshBasicMaterial({ color: 0xfff5d8 })
  );
  lotusGroup.add(lotusCore);

  // 24 Luminous Spiraling Harmonic Ribbons weaving out from the Dyson Lotus
  const ribbons = [];
  for (let r = 0; r < 24; r++) {
    const pts = [];
    const baseAng = (r / 24) * Math.PI * 2;
    for (let k = 0; k <= 40; k++) {
      const u = k / 40;
      const rad = 1.8 + u * 18.0;
      const ang = baseAng + u * Math.PI * 2.2;
      const y = Math.sin(u * Math.PI * 3.0 + r * 0.5) * (1.5 + u * 4.5);
      pts.push(new THREE.Vector3(Math.cos(ang) * rad, y, Math.sin(ang) * rad));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 80, 0.055, 6, false),
      new THREE.MeshBasicMaterial({
        color: r % 2 === 0 ? 0xffd27a : 0x56ebff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
      })
    );
    lotusGroup.add(mesh);
    ribbons.push(mesh);
  }

  group.add(lotusGroup);
  const dummy = new THREE.Object3D();
  const upVec = new THREE.Vector3(0, 1, 0);

  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      const localT = t - 109.0; // 0 .. 34.5s

      // Phase windows:
      // 5A: 109.0 - 121.0 (KIFS Golden Cathedral)
      // 5B: 121.0 - 132.5 (Relativistic Black Hole)
      // 5C: 132.5 - 143.5 (Sacred-Geometry Dyson Lotus Apotheosis)
      let raymarch = null;
      let lotusAmt = 0;

      if (t < 121.0) {
        const fadeIn = smoothstep(109.0, 110.2, t);
        const fadeOut = 1 - smoothstep(120.0, 121.0, t);
        raymarch = { mode: 2.0, intensity: fadeIn * fadeOut, localT: t - 109.0 };
      } else if (t < 132.5) {
        const fadeIn = smoothstep(121.0, 122.0, t);
        const fadeOut = 1 - smoothstep(131.3, 132.5, t);
        raymarch = { mode: 3.0, intensity: fadeIn * fadeOut, localT: t - 121.0 };
      } else {
        lotusAmt = smoothstep(132.3, 134.2, t);
      }

      // Dust floats gently during cathedral & lotus, hidden during Black Hole so event horizon stays pitch-black void!
      dust.visible = !(t >= 121.0 && t < 132.5);
      dust.rotation.y = localT * 0.06;
      dust.position.z = (localT * 1.4) % 12 - 6;

      // Animate Sacred-Geometry Dyson Lotus in Phase 5C
      lotusGroup.visible = lotusAmt > 0.005;
      if (lotusGroup.visible) {
        const lt = t - 132.5;
        const bloomBreath = 0.5 + 0.5 * Math.sin(lt * 1.15);
        lotusCore.scale.setScalar(lotusAmt * (1.0 + bloomBreath * 0.35));

        for (let i = 0; i < petalCount; i++) {
          const m = petalMeta[i];
          const wave = Math.sin(lt * 1.9 - m.frac * 9.5);
          const ang = m.theta + lt * (0.28 - m.frac * 0.16);
          const r = m.radius * (0.15 + 0.85 * lotusAmt) * (1 + wave * 0.08);
          const y = Math.cos(m.frac * Math.PI * 2.2 - lt * 1.1) * (2.6 * m.frac) + wave * 0.8;

          dummy.position.set(Math.cos(ang) * r, y, Math.sin(ang) * r);
          // Point each crystal petal outward & slightly upward like a blooming lotus
          const tilt = 0.45 + m.frac * 0.95 + wave * 0.25;
          dummy.lookAt(Math.cos(ang) * (r + 5), y + Math.cos(tilt) * 4, Math.sin(ang) * (r + 5));
          dummy.rotateX(Math.PI / 2);
          const sc = lotusAmt * (0.45 + m.frac * 1.15) * (0.85 + 0.25 * wave);
          dummy.scale.set(sc * 0.8, sc * 1.35, sc * 0.8);
          dummy.updateMatrix();
          petals.setMatrixAt(i, dummy.matrix);
        }
        petals.instanceMatrix.needsUpdate = true;

        lotusGroup.rotation.y = lt * 0.14;
        ribbons.forEach((rb, idx) => {
          rb.rotation.y = lt * (0.22 + (idx % 3) * 0.08) * (idx % 2 ? 1 : -1);
          rb.material.opacity = lotusAmt * 0.58;
        });

        // Majestic swooping camera orbiting & ascending over the Dyson Lotus!
        const camAng = lt * 0.24 - 0.6;
        const camR = lerp(24.0, 15.5, smoothstep(0, 9.5, lt));
        const camY = lerp(3.5, 11.5, smoothstep(0, 10.0, lt));
        camera.position.set(Math.cos(camAng) * camR, camY, Math.sin(camAng) * camR);
        camera.lookAt(0, 0.5, 0);
      } else {
        camera.position.set(0, 0, 16);
        camera.lookAt(0, 0, 0);
      }

      keyLight.color.setHex(0xffdfa0);
      keyLight.intensity = 150;
      rimLight.color.setHex(0x48e5ff);
      rimLight.intensity = 120;

      return {
        callouts: [],
        raymarch,
        chromatic: 0.0011 + (t > 138.0 ? smoothstep(138.0, 142.5, t) * 0.0022 : 0),
      };
    },
  };
}

// ============================================================================
// BUILD ACT VI: HYPERSPEED COLLAPSE -> QUIET CHAT BACKDROP (143.5 - 165s)
// ============================================================================
function buildAct6() {
  const group = new THREE.Group();
  const rand = makeRand(606);

  // Starlight collapse vortex (143.5 - 145.4s) -> transforms into calm drifting midnight bokeh!
  const count = 1600;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const meta = [];
  for (let i = 0; i < count; i++) {
    const ang = rand() * Math.PI * 2;
    const rad = 2.0 + rand() * 24;
    const z = (rand() - 0.5) * 65;
    meta.push({ ang, rad, z, speed: 0.4 + rand() * 1.4 });
    pos[i * 3] = Math.cos(ang) * rad;
    pos[i * 3 + 1] = Math.sin(ang) * rad;
    pos[i * 3 + 2] = z;

    const gold = rand() > 0.5;
    col[i * 3] = gold ? 1.0 : 0.42;
    col[i * 3 + 1] = gold ? 0.82 : 0.72;
    col[i * 3 + 2] = gold ? 0.48 : 1.0;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.22,
      vertexColors: true,
      transparent: true,
      opacity: 0.72,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  group.add(points);

  // Subtle ambient obsidian ring halo behind the floating chat UI
  const backRing = new THREE.Mesh(
    new THREE.TorusGeometry(9.5, 0.04, 10, 128),
    new THREE.MeshBasicMaterial({ color: 0x3b6ea5, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending })
  );
  backRing.position.z = -12;
  group.add(backRing);

  group.visible = false;
  scene.add(group);

  return {
    group,
    update(t) {
      const localT = t - 143.5; // 0 .. 21.5s
      const collapse = 1 - smoothstep(0.0, 1.85, localT); // 1 -> 0 during 143.5 - 145.35s

      const arr = geo.attributes.position.array;
      for (let i = 0; i < count; i++) {
        const m = meta[i];
        const shrink = lerp(1.0, 0.12, collapse);
        const spin = m.ang + localT * (collapse > 0.05 ? 3.8 : 0.06 * m.speed);
        arr[i * 3] = Math.cos(spin) * m.rad * (0.4 + 0.6 * (1 - collapse));
        arr[i * 3 + 1] = Math.sin(spin) * m.rad * (0.4 + 0.6 * (1 - collapse));
        arr[i * 3 + 2] = ((m.z - localT * (collapse > 0.05 ? 38.0 : 0.45) + 32.5) % 65) - 32.5;
      }
      geo.attributes.position.needsUpdate = true;

      backRing.rotation.z = localT * 0.08;
      backRing.scale.setScalar(lerp(1.0, 0.15, collapse));

      camera.position.set(Math.sin(localT * 0.15) * 0.6, Math.cos(localT * 0.12) * 0.4, 16);
      camera.lookAt(0, 0, 0);

      return {
        callouts: [],
        chromatic: 0.001 + collapse * 0.012,
      };
    },
  };
}

// ============================================================================
// INSTANTIATE ALL 6 ACTS & MASTER DETERMINISTIC FRAME RENDERER
// ============================================================================
const act1 = buildAct1();
const act2 = buildAct2();
const act3 = buildAct3();
const act4 = buildAct4();
const act5 = buildAct5();
const act6 = buildAct6();
const allActs = [act1, act2, act3, act4, act5, act6];

let timingsData = null;

async function init() {
  const res = await fetch('/timings.json');
  timingsData = await res.json();
  await document.fonts.ready;

  // 2 warmup renders to compile all shaders & flush Metal swap chain
  renderAtFrame(0, 30);
  renderAtFrame(3000, 30);
  renderAtFrame(3400, 30);
  renderAtFrame(3800, 30);
  window.__ready = true;
}

// Transition flash peaks right at act cuts for seamless cinematic energy
function computeTransitionFlash(t) {
  const cuts = [22.0, 51.0, 78.0, 109.0, 121.0, 132.5, 143.5];
  let flash = 0;
  for (const c of cuts) {
    const d = Math.abs(t - c);
    if (d < 0.55) {
      const f = Math.exp(-(d * d) / 0.045);
      flash = Math.max(flash, f * (c === 109.0 ? 0.85 : 0.62));
    }
  }
  return flash;
}

function renderAtFrame(frame, fps = 30) {
  const t = frame / fps;

  // Toggle exact active act
  let actIdx = 0;
  if (t < 22.0) actIdx = 0;
  else if (t < 51.0) actIdx = 1;
  else if (t < 78.0) actIdx = 2;
  else if (t < 109.0) actIdx = 3;
  else if (t < 143.5) actIdx = 4;
  else actIdx = 5;

  allActs.forEach((a, i) => {
    a.group.visible = i === actIdx;
  });

  // Reset camera roll cleanly each frame before act updates it
  camera.rotation.set(0, 0, 0);
  const state = allActs[actIdx].update(t) || {};

  // Configure full-screen raymarching background pass
  if (state.raymarch && state.raymarch.intensity > 0.004) {
    rmPass.enabled = true;
    rmUniforms.uTime.value = t;
    rmUniforms.uMode.value = state.raymarch.mode;
    rmUniforms.uIntensity.value = state.raymarch.intensity;
    rmUniforms.uLocalT.value = state.raymarch.localT;
    scene.background = null; // let raymarching show through!
  } else {
    rmPass.enabled = false;
    scene.background = new THREE.Color(0x020308);
    scenePass.clear = true;
  }
  if (rmPass.enabled) {
    scenePass.clear = false;
  }

  // Dynamic Bloom & Post-Processing Grading (tuned per act so highlights pop without ever blowing out)
  if (rmPass.enabled) {
    bloomPass.strength = actIdx === 3 ? 0.36 : 0.42;
    bloomPass.threshold = 0.68;
  } else {
    bloomPass.strength = actIdx === 4 ? 0.58 : 0.50;
    bloomPass.threshold = 0.62;
  }
  postPass.uniforms.uTime.value = t;
  postPass.uniforms.uChromatic.value = state.chromatic ?? 0.0008;
  postPass.uniforms.uGlitch.value = state.glitch ?? 0.0;
  postPass.uniforms.uFlash.value = computeTransitionFlash(t);
  postPass.uniforms.uGrain.value = 0.022;

  composer.render();

  // Render crisp 2D Editorial HUD + Subtitles on top
  renderHud(hudCtx, W, H, t, state, timingsData);
}

// Composite WebGL + HUD onto hidden 2D canvas and return RGBA Uint8Array (for blazing-fast WS streaming)
window.__renderFrame = (frame, fps = 30) => {
  renderAtFrame(frame, fps);
};

window.__captureFrameRGBA = (frame, fps = 30) => {
  renderAtFrame(frame, fps);
  compCtx.drawImage(glCanvas, 0, 0);
  compCtx.drawImage(hudCanvas, 0, 0);
  return compCtx.getImageData(0, 0, W, H).data;
};

// Fast WebSocket streamer called from Node worker!
window.__streamRange = (wsUrl, startFrame, endFrame, fps = 30) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    ws.onerror = (e) => reject(new Error('WebSocket error'));
    ws.onopen = () => {
      let f = startFrame;
      function sendNext() {
        while (f < endFrame) {
          // Backpressure guard so browser RAM never spikes
          if (ws.bufferedAmount > 32 * 1024 * 1024) {
            setTimeout(sendNext, 6);
            return;
          }
          renderAtFrame(f, fps);
          compCtx.drawImage(glCanvas, 0, 0);
          compCtx.drawImage(hudCanvas, 0, 0);
          const img = compCtx.getImageData(0, 0, W, H);
          ws.send(img.data.buffer);
          f++;
        }
        // Wait for buffer flush before closing cleanly
        if (ws.bufferedAmount > 0) {
          setTimeout(sendNext, 10);
          return;
        }
        ws.close(1000, 'done');
        resolve(endFrame - startFrame);
      }
      sendNext();
    };
  });
};

init();
