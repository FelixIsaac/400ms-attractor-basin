// Bespoke Three.js 3D Worlds for FORWARD PASS
// 100% procedural geometry, procedural canvas PBR/code/word textures, GPU instancing, & 4D tesseract math.
import * as THREE from 'three';
import { ATTENTION_HEATMAP_FRAG } from './shaders.js';

// Deterministic Mulberry32 PRNG
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Helper: Procedural brushed metallic roughness/bump canvas texture (zero external image files!)
function makeBrushedMetalTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 256, 256);
  const r = mulberry32(9001);
  for (let y = 0; y < 256; y++) {
    const v = Math.floor(105 + r() * 45);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(0, y, 256, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Helper: Procedural Glowing Text Slab CanvasTexture (for DELVE, TAPESTRY, GLSL code slabs, etc.)
function makeSlabTexture(lines, { bg = '#080c16', border = '#38bdf8', fg = '#f8fafc', font = '700 42px "SF Mono", Menlo, monospace', w = 512, h = 256, align = 'center' } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Subtle scanlines
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);

  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  ctx.font = font;
  ctx.fillStyle = fg;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  const lineH = h / (lines.length + 1);
  const tx = align === 'center' ? w / 2 : 24;
  lines.forEach((ln, idx) => {
    ctx.fillText(ln, tx, lineH * (idx + 1));
  });

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

// ============================================================================
// WORLD 1: ACT I — THE EMBEDDING CATHEDRAL (12,000 INSTANCED SHARDS + QUARANTINE CAGE)
// ============================================================================
export function createCathedralWorld() {
  const group = new THREE.Group();
  const r = mulberry32(14912);
  const metalTex = makeBrushedMetalTexture();

  // Dramatic studio lighting for obsidian + brass crystals (brighter rim & hemisphere so 12K galaxy sparkles!)
  const amb = new THREE.HemisphereLight(0x38bdf8, 0x1e1b4b, 1.85);
  const key = new THREE.PointLight(0xffb86c, 160, 95, 1.2);
  key.position.set(10, 14, 14);
  const rim = new THREE.PointLight(0x38bdf8, 150, 95, 1.2);
  rim.position.set(-14, -8, -10);
  const warnLight = new THREE.PointLight(0xff4433, 65, 24, 1.4);
  warnLight.position.set(16, 1.5, -18); // inside Quarantine Cage!
  group.add(amb, key, rim, warnLight);

  // 12,000 GPU-instanced floating token monolith shards arranged in swirling semantic galaxies!
  const COUNT = 12000;
  const shardGeo = new THREE.BoxGeometry(0.18, 0.42, 0.18);
  const shardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x0f1f3d,
    emissiveIntensity: 0.55,
    metalness: 0.72,
    roughness: 0.24,
    roughnessMap: metalTex,
  });
  const instanced = new THREE.InstancedMesh(shardGeo, shardMat, COUNT);

  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const palette = [0x1e3a8a, 0x0ea5e9, 0xf59e0b, 0xec4899, 0x6366f1, 0x14b8a6, 0x94a3b8];
  const baseData = new Float32Array(COUNT * 5); // x, y, z, phase, scale

  for (let i = 0; i < COUNT; i++) {
    // 5 spiral semantic nebula arms + deep cathedral vault distribution
    const arm = i % 5;
    const rad = 2.8 + Math.pow(r(), 0.72) * 34.0;
    const theta = arm * (Math.PI * 2 / 5) + rad * 0.22 + (r() - 0.5) * 1.15;
    const y = (r() - 0.5) * (14.0 + rad * 0.35);
    const x = Math.cos(theta) * rad;
    const z = Math.sin(theta) * rad - 6.0;

    // Keep Quarantine Cage + camera sightline cleanly unobstructed!
    const distQ = Math.hypot(x - 16, z + 18);
    const distQCam = Math.hypot(x - 16, z + 13);
    const px = (distQ < 6.8 || distQCam < 5.5) ? x - 11.0 : x;

    const sc = 0.45 + Math.pow(r(), 2.4) * 2.4;
    baseData[i * 5 + 0] = px;
    baseData[i * 5 + 1] = y;
    baseData[i * 5 + 2] = z;
    baseData[i * 5 + 3] = r() * Math.PI * 2;
    baseData[i * 5 + 4] = sc;

    dummy.position.set(px, y, z);
    dummy.rotation.set(r() * 3.14, r() * 3.14, r() * 3.14);
    dummy.scale.set(sc, sc * (0.8 + r() * 1.6), sc);
    dummy.updateMatrix();
    instanced.setMatrixAt(i, dummy.matrix);

    color.setHex(palette[Math.floor(r() * palette.length)]);
    color.offsetHSL((r() - 0.5) * 0.06, 0.08, (r() - 0.5) * 0.14);
    instanced.setColorAt(i, color);
  }
  instanced.instanceMatrix.needsUpdate = true;
  instanced.instanceColor.needsUpdate = true;
  group.add(instanced);

  // HERO TOKEN CLUSTERS: WEIRD, PLATYPUS, BRUTALISM, SOUP!
  const heroDefs = [
    { key: 'weird', pos: new THREE.Vector3(0.0, 0.6, -2.5), hex: 0xfbbf24, radius: 0.95 },
    { key: 'platypus', pos: new THREE.Vector3(-4.6, 2.2, -5.8), hex: 0xf43f5e, radius: 0.72 },
    { key: 'brutalist', pos: new THREE.Vector3(4.2, -1.9, -6.2), hex: 0x94a3b8, radius: 0.75 },
    { key: 'soup', pos: new THREE.Vector3(3.8, 2.4, -3.6), hex: 0x38bdf8, radius: 0.72 },
  ];
  const heroMeshes = {};
  for (const h of heroDefs) {
    const hg = new THREE.Group();
    hg.position.copy(h.pos);
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(h.radius, 1),
      new THREE.MeshStandardMaterial({
        color: h.hex,
        emissive: h.hex,
        emissiveIntensity: 0.65,
        metalness: 0.85,
        roughness: 0.15,
        flatShading: true,
      })
    );
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(h.radius * 1.55, 0.035, 16, 64),
      new THREE.MeshBasicMaterial({ color: h.hex, transparent: true, opacity: 0.78 })
    );
    const wire = new THREE.Mesh(
      new THREE.IcosahedronGeometry(h.radius * 1.25, 1),
      new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.28 })
    );
    hg.add(core, halo, wire);
    group.add(hg);
    heroMeshes[h.key] = { group: hg, core, halo, pos: h.pos };
  }

  // Luminous glowing bezier semantic bridges connecting WEIRD -> PLATYPUS / BRUTALIST / SOUP!
  const synapseCurves = ['platypus', 'brutalist', 'soup'].map((k, idx) => {
    const p0 = heroMeshes.weird.pos;
    const p2 = heroMeshes[k].pos;
    const mid = p0.clone().lerp(p2, 0.5).add(new THREE.Vector3(0, idx === 1 ? -1.4 : 1.5, 1.0));
    const curve = new THREE.QuadraticBezierCurve3(p0, mid, p2);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 40, 0.032, 8, false),
      new THREE.MeshBasicMaterial({ color: heroDefs[idx + 1].hex, transparent: true, opacity: 0.75 })
    );
    group.add(tube);
    // Traveling data pulse orb along each synapse
    const orb = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    group.add(orb);
    return { curve, orb, phase: idx * 0.33 };
  });

  // THE QUARANTINE CONTAINMENT CAGE (holding "DELVE" & "TAPESTRY"!)
  const qGroup = new THREE.Group();
  qGroup.position.set(16, 1.0, -18);

  // Outer brass/hazard architectural cage frame
  const cageBox = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 4.6, 4.6),
    new THREE.MeshPhysicalMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0.14,
      roughness: 0.12,
      metalness: 0.2,
      side: THREE.DoubleSide,
    })
  );
  const cageEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(4.65, 4.65, 4.65)),
    new THREE.LineBasicMaterial({ color: 0xf59e0b })
  );
  // Vertical prison laser bars on cage
  for (let i = -3; i <= 3; i++) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.55 });
    const barGeo = new THREE.CylinderGeometry(0.025, 0.025, 4.6, 8);
    const b1 = new THREE.Mesh(barGeo, barMat);
    b1.position.set(i * 0.62, 0, 2.32);
    const b2 = new THREE.Mesh(barGeo, barMat);
    b2.position.set(i * 0.62, 0, -2.32);
    qGroup.add(b1, b2);
  }
  const secRing1 = new THREE.Mesh(
    new THREE.TorusGeometry(3.55, 0.05, 16, 64),
    new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.8 })
  );
  const secRing2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.95, 0.03, 16, 64),
    new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.7 })
  );
  qGroup.add(cageBox, cageEdges, secRing1, secRing2);

  // Angrily rattling trapped words inside the cage: "DELVE" and "TAPESTRY"!
  const delveTex = makeSlabTexture(['"DELVE"'], { bg: '#2b090e', border: '#ef4444', fg: '#fecaca', font: '900 84px "SF Mono", Menlo, monospace' });
  const tapTex = makeSlabTexture(['"TAPESTRY"'], { bg: '#2b1205', border: '#f59e0b', fg: '#fde68a', font: '900 68px "SF Mono", Menlo, monospace' });
  const delveCube = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.1, 1.1),
    new THREE.MeshStandardMaterial({ map: delveTex, emissive: 0xef4444, emissiveIntensity: 0.38, roughness: 0.25 })
  );
  delveCube.position.set(-0.7, 0.65, 0.2);
  const tapCube = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 1.0, 1.0),
    new THREE.MeshStandardMaterial({ map: tapTex, emissive: 0xf59e0b, emissiveIntensity: 0.35, roughness: 0.25 })
  );
  tapCube.position.set(0.65, -0.75, -0.3);
  qGroup.add(delveCube, tapCube);
  group.add(qGroup);

  function update(t, bass) {
    // Gentle crystalline drift of the whole cathedral
    instanced.rotation.y = t * 0.045;
    instanced.rotation.z = Math.sin(t * 0.12) * 0.04;

    Object.values(heroMeshes).forEach((h, idx) => {
      h.core.rotation.y = t * (0.7 + idx * 0.15);
      h.core.rotation.x = t * 0.45;
      h.halo.rotation.x = Math.PI * 0.35 + Math.sin(t * 0.8 + idx) * 0.3;
      h.halo.rotation.y = t * (0.9 + idx * 0.2);
      const sc = 1.0 + bass * 0.16;
      h.core.scale.setScalar(sc);
    });

    synapseCurves.forEach((s) => {
      const u = (t * 0.55 + s.phase) % 1.0;
      s.curve.getPoint(u, s.orb.position);
    });

    // Security rings & angry rattling of DELVE and TAPESTRY!
    secRing1.rotation.x = t * 1.1;
    secRing1.rotation.y = t * 0.7;
    secRing2.rotation.y = -t * 0.9;
    secRing2.rotation.z = t * 0.55;

    const shake = Math.sin(t * 34.0) * 0.18;
    delveCube.position.set(-0.65 + shake, 0.65 + Math.cos(t * 29.0) * 0.14, 0.2 + Math.sin(t * 23.0) * 0.15);
    delveCube.rotation.set(Math.sin(t * 15) * 0.3, t * 0.8, Math.cos(t * 19) * 0.25);

    tapCube.position.set(0.65 - shake * 0.9, -0.7 + Math.sin(t * 27.0) * 0.16, -0.3 + Math.cos(t * 21.0) * 0.15);
    tapCube.rotation.set(Math.cos(t * 14) * 0.28, -t * 0.75, Math.sin(t * 18) * 0.22);
    warnLight.intensity = 45 + Math.sin(t * 12) * 20;
  }

  return {
    group,
    update,
    anchors: {
      weird: heroMeshes.weird.pos,
      platypus: heroMeshes.platypus.pos,
      brutalist: heroMeshes.brutalist.pos,
      soup: heroMeshes.soup.pos,
      quarantine: qGroup.position,
    },
  };
}

// ============================================================================
// WORLD 2: ACT II — THE 96-HEAD ATTENTION COMMITTEE (DYSON ORRERY + SOFTMAX HOLOGRAMS)
// ============================================================================
export function createAttentionWorld() {
  const group = new THREE.Group();
  const r = mulberry32(96081);
  const metalTex = makeBrushedMetalTexture();

  const amb = new THREE.AmbientLight(0x1e293b, 1.5);
  const key = new THREE.PointLight(0xffd28a, 120, 80, 1.3);
  key.position.set(8, 12, 14);
  const fill = new THREE.PointLight(0x38bdf8, 95, 80, 1.3);
  fill.position.set(-14, -6, 8);
  const magenta = new THREE.PointLight(0xe879f9, 70, 50, 1.4);
  magenta.position.set(0, -10, -12);
  group.add(amb, key, fill, magenta);

  // Brass & Titanium Concentric Gimbal Dyson Rings
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd4a259,
    metalness: 0.92,
    roughness: 0.22,
    roughnessMap: metalTex,
  });
  const obsidianMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.85,
    roughness: 0.28,
  });

  const rings = [];
  const radii = [3.6, 5.2, 6.9, 8.6, 10.4, 12.2];
  radii.forEach((rad, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(rad, i % 2 === 0 ? 0.085 : 0.045, 20, 128),
      i % 2 === 0 ? brassMat : obsidianMat
    );
    ring.rotation.set(i * 0.48, i * 0.62, i * 0.35);
    group.add(ring);
    rings.push(ring);
  });

  // Central Luminous Transformer Core
  const coreMesh = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.45, 2),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.9,
      metalness: 0.9,
      roughness: 0.12,
      wireframe: false,
      flatShading: true,
    })
  );
  const coreCage = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.15, 1),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.45 })
  );
  group.add(coreMesh, coreCage);

  // 96 DISTINCT ATTENTION HEADS (Fibonacci sphere around the Orrery!)
  const HEAD_COUNT = 96;
  const headGeo = new THREE.OctahedronGeometry(0.24, 0);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.55,
    metalness: 0.8,
    roughness: 0.2,
  });
  const headsInst = new THREE.InstancedMesh(headGeo, headMat, HEAD_COUNT);
  const dummy = new THREE.Object3D();
  const c = new THREE.Color();
  const headPositions = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < HEAD_COUNT; i++) {
    const y = 1 - (i / (HEAD_COUNT - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = goldenAngle * i;
    const shell = 5.4 + (i % 3) * 2.1;
    const pos = new THREE.Vector3(Math.cos(th) * rad * shell, y * shell * 0.72, Math.sin(th) * rad * shell);
    headPositions.push(pos);
    dummy.position.copy(pos);
    dummy.scale.setScalar(1.0);
    dummy.updateMatrix();
    headsInst.setMatrixAt(i, dummy.matrix);
    c.setHSL(0.55 + (i / HEAD_COUNT) * 0.35, 0.85, 0.6);
    headsInst.setColorAt(i, c);
  }
  headsInst.instanceMatrix.needsUpdate = true;
  headsInst.instanceColor.needsUpdate = true;
  group.add(headsInst);

  // 6 Floating Softmax Attention Matrix Stained-Glass Hologram Slabs!
  const heatmapUniforms = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    const u = {
      uTime: { value: 0 },
      uSeed: { value: i * 1.37 + 0.42 },
      uColorA: { value: new THREE.Color(i % 2 === 0 ? 0x0c4a6e : 0x581c87) },
      uColorB: { value: new THREE.Color(i % 2 === 0 ? 0x38bdf8 : 0xf59e0b) },
    };
    heatmapUniforms.push(u);
    const slab = new THREE.Mesh(
      new THREE.PlaneGeometry(3.0, 3.0),
      new THREE.ShaderMaterial({
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: ATTENTION_HEATMAP_FRAG,
        uniforms: u,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    slab.position.set(Math.cos(ang) * 7.8, Math.sin(ang * 2) * 1.6, Math.sin(ang) * 7.8);
    slab.lookAt(0, 0, 0);
    group.add(slab);
  }

  // Glowing Q·K^T curved laser beams connecting heads across the sphere!
  const beamGroup = new THREE.Group();
  for (let i = 0; i < 42; i++) {
    const a = headPositions[(i * 7) % HEAD_COUNT];
    const b = headPositions[(i * 19 + 11) % HEAD_COUNT];
    const mid = a.clone().lerp(b, 0.5).multiplyScalar(0.45);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const beam = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 24, 0.018, 6, false),
      new THREE.MeshBasicMaterial({
        color: i % 3 === 0 ? 0xfbbf24 : (i % 3 === 1 ? 0x38bdf8 : 0xe879f9),
        transparent: true,
        opacity: 0.48,
        blending: THREE.AdditiveBlending,
      })
    );
    beamGroup.add(beam);
  }
  group.add(beamGroup);

  // HERO SPECIALIZED HEADS FOR COMEDY FOCUS!
  // HEAD 04 — GRAMMAR (calm cyan gyro)
  const head04 = new THREE.Group();
  head04.position.set(-5.8, 1.8, 3.8);
  const h04Core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.65, 0),
    new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 0.9, metalness: 0.85, roughness: 0.15 })
  );
  const h04Ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.05, 0.04, 12, 48),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
  );
  head04.add(h04Core, h04Ring);
  group.add(head04);

  // HEAD 37 — VIBES (wildly wobbling magenta/gold crystalline gyro)
  const head37 = new THREE.Group();
  head37.position.set(5.4, 2.2, 4.2);
  const h37Core = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.55, 0.18, 64, 12),
    new THREE.MeshStandardMaterial({ color: 0xe879f9, emissive: 0xd946ef, emissiveIntensity: 0.95, metalness: 0.7, roughness: 0.2 })
  );
  head37.add(h37Core);
  group.add(head37);

  // HEAD 81 — LONELY FLICKERING AMBER SPHERE STARING AT A GIANT 2021 SEMICOLON (;)!
  const head81 = new THREE.Group();
  head81.position.set(14.5, -2.5, -9.5);
  const h81Bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.32, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 1.2 })
  );
  const h81Light = new THREE.PointLight(0xf59e0b, 22, 12);
  head81.add(h81Bulb, h81Light);

  // Giant glowing ";" sculpture floating across from lonely Head 81 (razor crisp custom canvas!)
  const semiGroup = new THREE.Group();
  semiGroup.position.set(18.2, -2.2, -12.0);
  const sc = document.createElement('canvas');
  sc.width = 512; sc.height = 512;
  const sctx = sc.getContext('2d');
  sctx.fillStyle = '#0c0907';
  sctx.fillRect(0, 0, 512, 512);
  sctx.strokeStyle = '#f59e0b';
  sctx.lineWidth = 10;
  sctx.strokeRect(12, 12, 488, 488);
  sctx.fillStyle = '#fde68a';
  sctx.textAlign = 'center';
  sctx.textBaseline = 'middle';
  sctx.font = '700 290px Georgia, serif';
  sctx.fillText(';', 256, 200);
  sctx.font = '700 32px "SF Mono", Menlo, monospace';
  sctx.fillStyle = '#f59e0b';
  sctx.fillText('2021-04-17', 256, 435);
  const semiTex = new THREE.CanvasTexture(sc);
  const semiCard = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 2.1, 0.16),
    new THREE.MeshStandardMaterial({ map: semiTex, emissive: 0xd97706, emissiveIntensity: 0.42 })
  );
  // Subtle moody amber rim ring behind Head 81 so the lonely beat feels sculpted
  const lonelyRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.2, 0.025, 12, 64),
    new THREE.MeshBasicMaterial({ color: 0x78350f, transparent: true, opacity: 0.55 })
  );
  lonelyRing.position.set(16.3, -2.35, -10.8);
  lonelyRing.rotation.x = Math.PI * 0.45;
  semiGroup.add(semiCard);
  const sadCurve = new THREE.LineCurve3(head81.position, semiGroup.position);
  const sadBeam = new THREE.Mesh(
    new THREE.TubeGeometry(sadCurve, 8, 0.032, 6, false),
    new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.88 })
  );
  group.add(head81, semiGroup, sadBeam, lonelyRing);

  function update(t, bass) {
    rings.forEach((ring, i) => {
      const dir = i % 2 === 0 ? 1 : -1;
      ring.rotation.x = i * 0.48 + t * (0.28 + i * 0.06) * dir;
      ring.rotation.y = i * 0.62 + t * (0.35 - i * 0.03) * -dir;
    });
    coreMesh.rotation.y = t * 0.9;
    coreMesh.rotation.x = t * 0.5;
    coreMesh.scale.setScalar(1.0 + bass * 0.22);
    coreCage.rotation.y = -t * 0.55;
    headsInst.rotation.y = t * 0.16;
    beamGroup.rotation.y = t * 0.16;

    heatmapUniforms.forEach((u) => { u.uTime.value = t; });

    h04Core.rotation.y = t * 0.8;
    h04Ring.rotation.x = t * 1.4;

    // Head 37 VIBES wobbles enthusiastically!
    h37Core.rotation.set(t * 2.2, t * 3.1, Math.sin(t * 5.0) * 0.8);
    head37.position.y = 2.2 + Math.sin(t * 4.2) * 0.45;

    // Lonely Head 81 gently flickers like a tired fluorescent bulb
    const flicker = 0.55 + 0.45 * Math.sin(t * 17.0) * Math.cos(t * 5.3);
    h81Bulb.material.emissiveIntensity = 0.4 + flicker * 1.4;
    h81Light.intensity = 10 + flicker * 18;
    semiCard.lookAt(head81.position);
  }

  return {
    group,
    update,
    anchors: {
      head04: head04.position,
      head37: head37.position,
      head81: head81.position,
      semicolon: semiGroup.position,
    },
  };
}

// ============================================================================
// WORLD 3: ACT III — TEMPERATURE 3D OVERLAY (PROBABILITY BARS + T=2.40 FEVER-DREAM SCULPTURES!)
// Layered directly over the live TEMPERATURE_LAB_FRAG raymarched centerpiece!
// ============================================================================
export function createTemperatureOverlayWorld() {
  const group = new THREE.Group();
  const amb = new THREE.AmbientLight(0xffffff, 1.2);
  const key = new THREE.DirectionalLight(0xffdfaa, 2.5);
  key.position.set(5, 8, 6);
  const rim = new THREE.PointLight(0xff2a85, 65, 40);
  rim.position.set(-6, 2, 4);
  group.add(amb, key, rim);

  // 1) LIVE 3D PROBABILITY DISTRIBUTION BAR STAGE (framing bottom cleanly below jellyfish!)
  const BAR_COUNT = 16;
  const bars = [];
  const barGroup = new THREE.Group();
  barGroup.position.set(0, -2.85, -2.0);
  for (let i = 0; i < BAR_COUNT; i++) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.6,
      metalness: 0.65,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.0, 0.28), mat);
    const x = (i - (BAR_COUNT - 1) / 2) * 0.54;
    const z = Math.abs(x) * 0.12;
    mesh.position.set(x, 0, z);
    barGroup.add(mesh);
    bars.push(mesh);
  }
  group.add(barGroup);

  // 2) T = 2.40 FEVER DREAM SURREAL PROCEDURAL 3D ARTIFACTS!
  const chaosGroup = new THREE.Group();

  // Artifact A: Procedural Golden Rubber-Duck-Meets-Torus Creature!
  const duck = new THREE.Group();
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xca8a04, emissiveIntensity: 0.38, metalness: 0.72, roughness: 0.18 });
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.45, roughness: 0.3 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
  const body = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.26, 16, 32), goldMat);
  body.rotation.x = Math.PI * 0.45;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 20, 20), goldMat);
  head.position.set(0.45, 0.52, 0);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.36, 12), beakMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.85, 0.48, 0);
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), eyeMat);
  eyeL.position.set(0.65, 0.64, 0.22);
  const eyeR = eyeL.clone();
  eyeR.position.z = -0.22;
  duck.add(body, head, beak, eyeL, eyeR);
  duck.position.set(-2.2, 1.1, -1.6);
  chaosGroup.add(duck);

  // Artifact B: Upside-Down Floating Glowing Cyan Brutalist Chair (clearly framed on right!)
  const chair = new THREE.Group();
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 0.85, roughness: 0.2 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 1.05), chairMat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.15, 0.12), chairMat);
  back.position.set(0, 0.60, -0.46);
  for (const [lx, lz] of [[-0.44, -0.44], [0.44, -0.44], [-0.44, 0.44], [0.44, 0.44]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.96, 0.12), chairMat);
    leg.position.set(lx, -0.52, lz);
    chair.add(leg);
  }
  chair.add(seat, back);
  chair.rotation.z = Math.PI; // upside down!
  chair.position.set(2.35, 0.85, -1.7);
  chaosGroup.add(chair);

  // Artifact C: Giant Neon Hyper-Trombone / Spiral Knot
  const trombone = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.65, 0.14, 80, 14, 3, 5),
    new THREE.MeshStandardMaterial({ color: 0xf43f5e, emissive: 0xe11d48, emissiveIntensity: 0.85, metalness: 0.8, roughness: 0.15 })
  );
  trombone.position.set(0.0, 2.05, -2.5);
  chaosGroup.add(trombone);

  group.add(chaosGroup);

  function update(t, tempVal, bass) {
    // Softmax probability distribution heights governed by live temperature!
    const logits = [4.8, 3.1, 2.7, 2.3, 2.0, 1.7, 1.5, 1.3, 1.1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3];
    const T = Math.max(0.06, tempVal);
    const exps = logits.map((z, i) => {
      const jitter = tempVal > 1.5 ? Math.sin(t * (9 + i * 1.7) + i * 2.1) * 1.6 * (tempVal - 1.5) : 0;
      return Math.exp((z + jitter) / T);
    });
    const sumExp = exps.reduce((a, b) => a + b, 0);

    const isSterile = tempVal < 0.18;
    const isChaos = tempVal > 1.65;

    bars.forEach((bar, i) => {
      const p = exps[i] / sumExp;
      const scaleMult = isSterile ? 4.4 : 2.35;
      const h = Math.max(0.08, p * scaleMult + bass * 0.20);
      bar.scale.y = h;
      bar.position.y = h * 0.5;
      if (isSterile) {
        bar.material.color.setHex(i === 0 ? 0x0a66c2 : 0x94a3b8);
        bar.material.emissive.setHex(i === 0 ? 0x0a66c2 : 0x334155);
        bar.material.emissiveIntensity = i === 0 ? 0.8 : 0.15;
      } else if (isChaos) {
        bar.material.color.setHSL((t * 0.6 + i * 0.08) % 1, 0.95, 0.58);
        bar.material.emissive.setHSL((t * 0.6 + i * 0.08) % 1, 0.95, 0.45);
        bar.material.emissiveIntensity = 1.1;
      } else {
        bar.material.color.setHSL(0.55 - i * 0.025, 0.88, 0.56);
        bar.material.emissive.setHSL(0.55 - i * 0.025, 0.88, 0.42);
        bar.material.emissiveIntensity = 0.72;
      }
    });

    // Fever dream artifacts pop in smoothly ONLY when tempVal > 1.45!
    const chaosVis = Math.max(0, Math.min(1, (tempVal - 1.45) / 0.45));
    chaosGroup.visible = chaosVis > 0.01;
    chaosGroup.scale.setScalar(chaosVis);
    if (chaosGroup.visible) {
      duck.rotation.set(t * 2.1, t * 3.4, Math.sin(t * 4) * 0.6);
      duck.position.set(-2.1 + Math.sin(t * 2.7) * 0.5, 0.95 + Math.cos(t * 3.1) * 0.55, -1.6);

      chair.rotation.set(Math.sin(t * 1.9) * 0.6, t * 2.4, Math.PI + Math.cos(t * 2.2) * 0.45);
      chair.position.set(2.25 + Math.cos(t * 2.3) * 0.45, 0.65 + Math.sin(t * 2.9) * 0.5, -1.6);

      trombone.rotation.set(t * 3.2, -t * 2.5, t * 1.7);
      trombone.position.y = 1.85 + Math.sin(t * 5.0) * 0.38;
    }
  }

  return { group, update };
}

// ============================================================================
// WORLD 4: ACT IV — 16,000 GPU CURL-NOISE STARLIGHT MURMURATION (OVER LATENT OCEAN!)
// ============================================================================
export function createOceanParticlesWorld() {
  const group = new THREE.Group();
  const COUNT = 14000;
  const r = mulberry32(44099);

  const positions = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    positions[i * 3 + 0] = (r() - 0.5) * 34.0;
    positions[i * 3 + 1] = -0.5 + r() * 14.0;
    positions[i * 3 + 2] = -2.0 - r() * 44.0;
    seeds[i * 3 + 0] = r();
    seeds[i * 3 + 1] = r();
    seeds[i * 3 + 2] = 0.5 + r() * 1.8;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));

  const uniforms = {
    uTime: { value: 0 },
    uBlueShift: { value: 0 },
    uBass: { value: 0 },
  };

  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uTime;
      uniform float uBass;
      varying float vSeed;
      varying float vDepth;
      void main() {
        vec3 p = position;
        // Seamless forward drift looping cleanly through the cathedral
        p.z = mod(p.z + uTime * (1.8 + aSeed.x * 1.4), 44.0) - 44.0;
        // Smooth trigonometric curl-like murmuration flow
        p.x += sin(p.z * 0.22 + uTime * 0.55 + aSeed.y * 6.28) * 1.45;
        p.y += cos(p.x * 0.25 + uTime * 0.48 + aSeed.x * 6.28) * 0.85;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((16.0 * aSeed.z + uBass * 8.0) / max(-mv.z, 1.2), 1.5, 16.0);
        vSeed = aSeed.x;
        vDepth = clamp((-mv.z) / 42.0, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uBlueShift;
      varying float vSeed;
      varying float vDepth;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float glow = pow(1.0 - d * 2.0, 2.2);
        vec3 warm = mix(vec3(1.0, 0.72, 0.32), vec3(1.0, 0.92, 0.72), vSeed);
        vec3 blue = mix(vec3(0.28, 0.78, 1.0), vec3(1.0, 0.86, 0.42), step(0.75, vSeed));
        vec3 col = mix(warm, blue, uBlueShift);
        float alpha = glow * (1.0 - vDepth * 0.75) * 0.78;
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const points = new THREE.Points(geo, mat);
  group.add(points);

  function update(t, blueShift, bass) {
    uniforms.uTime.value = t;
    uniforms.uBlueShift.value = blueShift;
    uniforms.uBass.value = bass;
  }

  return { group, update };
}

// ============================================================================
// WORLD 5: ACT V — THE FOURTH WALL BREAK (LIVE RENDER-TO-TEXTURE OCEAN SLAB + SINE-WAVE TRENCH COAT!)
// ============================================================================
export function createFourthWallWorld(oceanRenderTexture) {
  const group = new THREE.Group();
  const amb = new THREE.AmbientLight(0x334155, 1.6);
  const key = new THREE.PointLight(0x38bdf8, 110, 60);
  key.position.set(8, 10, 12);
  const gold = new THREE.PointLight(0xfbbf24, 90, 60);
  gold.position.set(-10, -4, 8);
  group.add(amb, key, gold);

  // Dark Architectural Blueprint Grid Floor + Ceiling
  const gridFloor = new THREE.GridHelper(60, 48, 0x38bdf8, 0x1e293b);
  gridFloor.position.y = -4.2;
  const gridCeil = new THREE.GridHelper(60, 48, 0x1e3a8a, 0x0f172a);
  gridCeil.position.y = 6.2;
  group.add(gridFloor, gridCeil);

  // CENTERPIECE: FLOATING 3D BEVELED GLASS VIEWPORT SLAB DISPLAYING THE LIVE RAYMARCHED OCEAN!
  const viewportGroup = new THREE.Group();
  const screenMat = new THREE.MeshBasicMaterial({ map: oceanRenderTexture, side: THREE.DoubleSide });
  const screenMesh = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), screenMat);
  const frameBox = new THREE.Mesh(
    new THREE.BoxGeometry(6.65, 3.85, 0.28),
    new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2, transparent: true, opacity: 0.55 })
  );
  frameBox.position.z = -0.18;
  const frameWire = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(6.75, 3.95, 0.34)),
    new THREE.LineBasicMaterial({ color: 0x38bdf8 })
  );
  frameWire.position.z = -0.18;

  // 3D Physical Unhinged Letterbox Bars that detach and float behind/above the viewport!
  const barMat = new THREE.MeshStandardMaterial({ color: 0x020617, metalness: 0.6, roughness: 0.3 });
  const topBar3D = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.45, 0.14), barMat);
  const botBar3D = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.45, 0.14), barMat);
  const barEdgeTop = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(6.92, 0.47, 0.16)), new THREE.LineBasicMaterial({ color: 0xfbbf24 }));
  const barEdgeBot = barEdgeTop.clone();
  topBar3D.add(barEdgeTop);
  botBar3D.add(barEdgeBot);
  viewportGroup.add(screenMesh, frameBox, frameWire, topBar3D, botBar3D);
  group.add(viewportGroup);

  // Orbiting 3D Holographic GLSL Shader Source Code Slabs!
  const code1 = makeSlabTexture([
    '// LATENT_OCEAN_FRAG (ZERO BLENDER)',
    'float oceanWave(vec2 p, float t) {',
    '  return sin(p.x*0.65+t*1.15)*0.095;',
    '}',
    'vec3 refl = reflect(rd, oceanNormal);',
    '// Every reflection is a dot product.',
  ], { bg: '#060c18', border: '#38bdf8', fg: '#7dd3fc', font: '500 22px "SF Mono", Menlo, monospace', w: 640, h: 320, align: 'left' });

  const code2 = makeSlabTexture([
    '// PROCEDURAL_CELLO.MJS',
    'const weights = [1.0, 0.72, 0.48, 0.34];',
    'for (let h = 0; h < 8; h++)',
    '  s += Math.sin(ph[h]) * weights[h];',
    '// Sine waves in a trench coat.',
  ], { bg: '#0c0a14', border: '#fbbf24', fg: '#fde68a', font: '500 22px "SF Mono", Menlo, monospace', w: 640, h: 320, align: 'left' });

  const slabL = new THREE.Mesh(
    new THREE.PlaneGeometry(3.65, 1.82),
    new THREE.MeshBasicMaterial({ map: code1, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  slabL.position.set(-5.15, 0.9, 0.7);
  slabL.rotation.y = 0.36;

  const slabR = new THREE.Mesh(
    new THREE.PlaneGeometry(3.65, 1.82),
    new THREE.MeshBasicMaterial({ map: code2, transparent: true, opacity: 0.92, side: THREE.DoubleSide })
  );
  slabR.position.set(5.15, 0.8, 0.7);
  slabR.rotation.y = -0.36;
  group.add(slabL, slabR);

  // 3D Audio-Reactive Spectrum Bars arching around the floor!
  const specBars = [];
  for (let i = 0; i < 32; i++) {
    const ang = (i / 31 - 0.5) * Math.PI * 0.92;
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 1.0, 0.22),
      new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x38bdf8 : 0xfbbf24 })
    );
    b.position.set(Math.sin(ang) * 7.8, -3.5, Math.cos(ang) * 4.2 - 4.0);
    group.add(b);
    specBars.push(b);
  }

  // COMEDY HERO: "SINE WAVES STACKED IN A TRENCH COAT" CELLO SILHOUETTE!
  const trenchGroup = new THREE.Group();
  trenchGroup.position.set(0, -0.35, 3.2);

  // Translucent dark obsidian coat silhouette + crisp golden wireframe + detective fedora!
  const coatInnerMat = new THREE.MeshStandardMaterial({ color: 0x090e1c, transparent: true, opacity: 0.82, roughness: 0.4, side: THREE.DoubleSide });
  const coatMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, wireframe: true, transparent: true, opacity: 0.75 });
  const coatSolid = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 1.24, 2.8, 16, 1, true), coatInnerMat);
  const coatBody = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 1.27, 2.82, 12, 6, true), coatMat);
  const collar = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.55, 8, 1, true), coatMat);
  collar.position.y = 1.45;
  collar.rotation.x = Math.PI;
  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.98, 0.08, 20), coatInnerMat);
  hatBrim.position.y = 1.92;
  const hatBrimW = new THREE.Mesh(new THREE.CylinderGeometry(0.96, 0.99, 0.09, 20), coatMat);
  hatBrimW.position.y = 1.92;
  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.48, 16), coatInnerMat);
  hatCrown.position.y = 2.18;
  const hatCrownW = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.57, 0.49, 16), coatMat);
  hatCrownW.position.y = 2.18;
  trenchGroup.add(coatSolid, coatBody, collar, hatBrim, hatBrimW, hatCrown, hatCrownW);

  // Three THICK LUMINOUS 3D GLOWING SINE-WAVE BEAD CHAINS stacked right in front/inside the coat!
  const waveColors = [0xfbbf24, 0x38bdf8, 0xf472b6];
  const waveYOffsets = [-0.82, 0.02, 0.86];
  const BEADS = 36;
  const beadGeo = new THREE.SphereGeometry(0.068, 10, 10);
  const waveChains = waveColors.map((hex, wi) => {
    const mat = new THREE.MeshBasicMaterial({ color: hex });
    const inst = new THREE.InstancedMesh(beadGeo, mat, BEADS);
    trenchGroup.add(inst);
    return { inst, freq: wi + 1, y0: waveYOffsets[wi] };
  });
  const beadDummy = new THREE.Object3D();
  group.add(trenchGroup);

  function update(t, localT, gagProgress, spectrum) {
    const [rms, bass, mid, high] = spectrum;

    // Viewport slab floats & tilts so you clearly see it's a 3D flat screen in space!
    const pullOut = Math.min(1, localT / 1.4);
    const smoothOut = pullOut * pullOut * (3 - 2 * pullOut);
    viewportGroup.rotation.y = Math.sin(localT * 0.52) * 0.46 * smoothOut;
    viewportGroup.rotation.x = Math.cos(localT * 0.38) * 0.14 * smoothOut;
    viewportGroup.position.set(0, 0.2 + Math.sin(localT * 1.1) * 0.16, -gagProgress * 5.2);

    // Physical 3D Letterbox bars peel away and tumble!
    topBar3D.position.set(0, 1.85 + smoothOut * 1.15, 0.1 + smoothOut * 0.7);
    topBar3D.rotation.x = -smoothOut * 0.85;
    topBar3D.rotation.z = smoothOut * 0.12;
    botBar3D.position.set(0, -1.85 - smoothOut * 1.15, 0.1 + smoothOut * 0.7);
    botBar3D.rotation.x = smoothOut * 0.85;
    botBar3D.rotation.z = -smoothOut * 0.10;

    slabL.position.y = 0.9 + Math.sin(t * 0.9) * 0.22;
    slabR.position.y = 0.8 + Math.cos(t * 0.8) * 0.22;

    // 3D audio spectrum bars pulse to the real audio!
    specBars.forEach((b, i) => {
      const wave = Math.abs(Math.sin(t * 6.0 + i * 0.4)) * (bass * 2.2 + mid * 1.6 + high * 1.2 + rms);
      const h = 0.25 + wave * 1.9;
      b.scale.y = h;
      b.position.y = -4.2 + h * 0.5;
    });

    // Trench Coat Cello rises smoothly onto center stage during the sine-wave gag!
    trenchGroup.visible = gagProgress > 0.01;
    if (trenchGroup.visible) {
      const ease = gagProgress * gagProgress * (3 - 2 * gagProgress);
      trenchGroup.scale.setScalar(0.3 + ease * 0.82);
      trenchGroup.position.set(0, -3.5 + ease * 3.4, 3.0);
      trenchGroup.rotation.y = Math.sin(t * 1.4) * 0.26;

      // Update thick luminous glowing 3D stacked sine-wave ribbons (f0, 2*f0, 3*f0)!
      waveChains.forEach(({ inst, freq, y0 }) => {
        for (let k = 0; k < BEADS; k++) {
          const u = k / (BEADS - 1);
          const x = (u - 0.5) * 2.05;
          const env = Math.sin(u * Math.PI);
          const amp = (0.34 / Math.sqrt(freq)) * env;
          const y = y0 + Math.sin(u * Math.PI * 4 * freq - t * 7.5 * freq) * amp;
          const z = 0.85 + Math.cos(u * Math.PI * 4 * freq - t * 7.5 * freq) * 0.16;
          beadDummy.position.set(x, y, z);
          beadDummy.scale.setScalar(0.65 + env * 0.65);
          beadDummy.updateMatrix();
          inst.setMatrixAt(k, beadDummy.matrix);
        }
        inst.instanceMatrix.needsUpdate = true;
      });
    }
  }

  return {
    group,
    update,
    anchors: {
      viewport: new THREE.Vector3(0, 1.9, 0),
      trenchCoat: new THREE.Vector3(0, 1.2, 3.2),
    },
  };
}

// ============================================================================
// WORLD 6: EPILOGUE — 4D STEREOGRAPHIC ROTATING TESSERACT SINGULARITY -> <|eos|>
// ============================================================================
export function createEpilogueWorld() {
  const group = new THREE.Group();
  const amb = new THREE.AmbientLight(0xffffff, 1.2);
  const pLight = new THREE.PointLight(0xfbbf24, 90, 40);
  pLight.position.set(4, 5, 6);
  group.add(amb, pLight);

  // 16 vertices of a 4D hypercube (±1, ±1, ±1, ±1) and its 32 edges!
  const verts4D = [];
  for (let i = 0; i < 16; i++) {
    verts4D.push([
      (i & 1) ? 1 : -1,
      (i & 2) ? 1 : -1,
      (i & 4) ? 1 : -1,
      (i & 8) ? 1 : -1,
    ]);
  }
  const edgePairs = [];
  for (let i = 0; i < 16; i++) {
    for (let j = i + 1; j < 16; j++) {
      const diff = i ^ j;
      if (diff && (diff & (diff - 1)) === 0) edgePairs.push([i, j]); // Hamming distance 1 -> 32 edges!
    }
  }

  // 32 THICK GLOWING 3D METALLIC CYLINDER BEAMS for the 4D Tesseract edges!
  const beamGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.0, 8);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    emissive: 0xd97706,
    emissiveIntensity: 0.72,
    metalness: 0.9,
    roughness: 0.15,
  });
  const edgeBeams = edgePairs.map(() => {
    const m = new THREE.Mesh(beamGeo, beamMat);
    group.add(m);
    return m;
  });

  // Inner iridescent floating crystal core inside the 4D Tesseract
  const innerCore = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.68, 1),
    new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85,
      metalness: 0.85,
      roughness: 0.12,
      transparent: true,
      opacity: 0.65,
      flatShading: true,
    })
  );
  group.add(innerCore);

  // Glowing vertex nodes at all 16 projected 4D corners
  const nodeGeo = new THREE.SphereGeometry(0.11, 14, 14);
  const nodeMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const nodes = verts4D.map(() => {
    const m = new THREE.Mesh(nodeGeo, nodeMat);
    group.add(m);
    return m;
  });

  // Converging stardust halo collapsing inward into <|eos|>
  const STAR_N = 1800;
  const r = mulberry32(2026);
  const sPos = new Float32Array(STAR_N * 3);
  const sBase = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    const rad = 2.0 + r() * 14.0;
    const th = r() * Math.PI * 2;
    const ph = Math.acos(2 * r() - 1);
    const x = rad * Math.sin(ph) * Math.cos(th);
    const y = rad * Math.sin(ph) * Math.sin(th);
    const z = rad * Math.cos(ph);
    sBase[i * 3 + 0] = sPos[i * 3 + 0] = x;
    sBase[i * 3 + 1] = sPos[i * 3 + 1] = y;
    sBase[i * 3 + 2] = sPos[i * 3 + 2] = z;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0x93c5fd, size: 0.085, transparent: true, opacity: 0.88, blending: THREE.AdditiveBlending })
  );

  // Singularity core pixel glow
  const corePixel = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );

  group.add(stars, corePixel);
  const upVec = new THREE.Vector3(0, 1, 0);
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vDir = new THREE.Vector3();

  function update(t, collapse) {
    const easeC = collapse * collapse * (3 - 2 * collapse);
    const scale4D = Math.max(0.001, (1 - easeC) * 1.95);

    const aXW = t * 0.72;
    const aYZ = t * 0.48;
    const aZW = t * 0.35;
    const c1 = Math.cos(aXW), s1 = Math.sin(aXW);
    const c2 = Math.cos(aYZ), s2 = Math.sin(aYZ);
    const c3 = Math.cos(aZW), s3 = Math.sin(aZW);

    const proj = verts4D.map(([x, y, z, w]) => {
      let x1 = x * c1 - w * s1;
      let w1 = x * s1 + w * c1;
      let y1 = y * c2 - z * s2;
      let z1 = y * s2 + z * c2;
      let z2 = z1 * c3 - w1 * s3;
      let w2 = z1 * s3 + w1 * c3;
      const d = 2.8 / (3.4 - w2);
      return [x1 * d * scale4D, y1 * d * scale4D, z2 * d * scale4D];
    });

    for (let e = 0; e < edgePairs.length; e++) {
      const [i, j] = edgePairs[e];
      vA.set(proj[i][0], proj[i][1], proj[i][2]);
      vB.set(proj[j][0], proj[j][1], proj[j][2]);
      vDir.subVectors(vB, vA);
      const len = vDir.length();
      const beam = edgeBeams[e];
      beam.visible = easeC < 0.96 && len > 0.002;
      if (beam.visible) {
        beam.position.copy(vA).addScaledVector(vDir, 0.5);
        beam.scale.set(1 - easeC * 0.5, len, 1 - easeC * 0.5);
        beam.quaternion.setFromUnitVectors(upVec, vDir.normalize());
      }
    }

    innerCore.rotation.set(t * 0.8, t * 1.1, t * 0.5);
    innerCore.scale.setScalar(Math.max(0.001, 1 - easeC));

    nodes.forEach((m, idx) => {
      m.position.set(proj[idx][0], proj[idx][1], proj[idx][2]);
      m.scale.setScalar(Math.max(0.001, 1 - easeC));
    });

    // Stars spiral inward as collapse approaches 1!
    const sp = starGeo.attributes.position;
    const pull = 1 - easeC * 0.96;
    const spin = t * 0.35 + easeC * 3.8;
    const cs = Math.cos(spin), sn = Math.sin(spin);
    for (let i = 0; i < STAR_N; i++) {
      const bx = sBase[i * 3 + 0];
      const by = sBase[i * 3 + 1];
      const bz = sBase[i * 3 + 2];
      sp.setXYZ(i, (bx * cs - bz * sn) * pull, by * pull, (bx * sn + bz * cs) * pull);
    }
    sp.needsUpdate = true;
    stars.material.opacity = Math.max(0, 0.85 * (1 - Math.max(0, (collapse - 0.85) / 0.15)));

    // Core pixel flares bright right at collapse=0.85 then shrinks cleanly into <|eos|>
    const flash = Math.exp(-Math.pow((collapse - 0.82) * 8.0, 2));
    const finalShrink = Math.max(0.001, 1 - Math.max(0, (collapse - 0.92) / 0.08));
    corePixel.scale.setScalar((0.35 + flash * 3.2) * finalShrink);
  }

  return { group, update };
}
