// Master Deterministic Film Engine for FORWARD PASS
// Orchestrates custom WebGL2 Raymarching Shaders, 6 bespoke Three.js 3D Worlds,
// Live WebGLRenderTarget recursion (Act V), Cinema Post-FX, and Swiss 2D HUD.
import * as THREE from 'three';
import {
  FULLSCREEN_VERT,
  PROLOGUE_SDF_FRAG,
  TEMPERATURE_LAB_FRAG,
  LATENT_OCEAN_FRAG,
  POST_CINEMA_FRAG,
} from './shaders.js';
import {
  createCathedralWorld,
  createAttentionWorld,
  createTemperatureOverlayWorld,
  createOceanParticlesWorld,
  createFourthWallWorld,
  createEpilogueWorld,
} from './scene_worlds.js';
import { drawHUD } from './hud.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * clamp(t, 0, 1);

async function initEngine() {
  const [manifest, specObj] = await Promise.all([
    fetch('/audio/timings.json').then((r) => r.json()),
    fetch('/audio/spectrum.json').then((r) => r.json()),
  ]);
  const spectrumFrames = specObj.frames;
  const W = manifest.width || 1920;
  const H = manifest.height || 1080;
  const FPS = manifest.fps || 30;
  const { acts, cues } = manifest;

  const glCanvas = document.getElementById('gl');
  const hudCanvas = document.getElementById('hud');
  glCanvas.width = W; glCanvas.height = H;
  hudCanvas.width = W; hudCanvas.height = H;
  const hudCtx = hudCanvas.getContext('2d');

  const renderer = new THREE.WebGLRenderer({
    canvas: glCanvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
  });
  renderer.setSize(W, H, false);
  renderer.setPixelRatio(1);
  renderer.autoClear = false;

  // Render Targets:
  // 1) mainRT: Full 1920x1080 HDR-capable scene buffer -> feeds Cinema Post-FX pass (bloom, flare, chroma, ACES, grain!)
  // 2) oceanRT: Live 1280x720 recursive texture captured in Act V for the floating 3D glass viewport slab!
  const mainRT = new THREE.WebGLRenderTarget(W, H, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const oceanRT = new THREE.WebGLRenderTarget(1280, 720, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  // Fullscreen Ortho Camera + Quad helper
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  function makeShaderScene(frag, uniforms) {
    const s = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERT,
      fragmentShader: frag,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });
    s.add(new THREE.Mesh(quadGeo, mat));
    return { scene: s, uniforms };
  }

  // Shader Scenes
  const prologueShader = makeShaderScene(PROLOGUE_SDF_FRAG, {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uReveal: { value: 0 },
    uSplit: { value: 0 },
    uBass: { value: 0 },
    uEnterPulse: { value: 0 },
  });

  const tempShader = makeShaderScene(TEMPERATURE_LAB_FRAG, {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uTemp: { value: 0.7 },
    uBass: { value: 0 },
    uMid: { value: 0 },
  });

  const oceanShader = makeShaderScene(LATENT_OCEAN_FRAG, {
    uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(W, H) },
    uBlueShift: { value: 0 },
    uBass: { value: 0 },
    uMid: { value: 0 },
    uProgress: { value: 0 },
  });

  const postShader = makeShaderScene(POST_CINEMA_FRAG, {
    tDiffuse: { value: mainRT.texture },
    uRes: { value: new THREE.Vector2(W, H) },
    uTime: { value: 0 },
    uChroma: { value: 0.004 },
    uGlitch: { value: 0.0 },
    uBloomAmt: { value: 0.75 },
    uVignette: { value: 0.55 },
    uFade: { value: 1.0 },
  });

  // 3D Worlds + Perspective Camera
  const cam3D = new THREE.PerspectiveCamera(48, W / H, 0.1, 220);

  const cathedralScene = new THREE.Scene();
  cathedralScene.background = new THREE.Color(0x040711);
  cathedralScene.fog = new THREE.FogExp2(0x040711, 0.026);
  const cathedral = createCathedralWorld();
  cathedralScene.add(cathedral.group);

  const attentionScene = new THREE.Scene();
  attentionScene.background = new THREE.Color(0x050812);
  attentionScene.fog = new THREE.FogExp2(0x050812, 0.019);
  const attention = createAttentionWorld();
  attentionScene.add(attention.group);

  const tempOverlayScene = new THREE.Scene();
  const tempOverlay = createTemperatureOverlayWorld();
  tempOverlayScene.add(tempOverlay.group);

  const oceanParticlesScene = new THREE.Scene();
  const oceanParticles = createOceanParticlesWorld();
  oceanParticlesScene.add(oceanParticles.group);

  const fourthWallScene = new THREE.Scene();
  fourthWallScene.background = new THREE.Color(0x050912);
  fourthWallScene.fog = new THREE.FogExp2(0x050912, 0.024);
  const fourthWall = createFourthWallWorld(oceanRT.texture);
  fourthWallScene.add(fourthWall.group);

  const epilogueScene = new THREE.Scene();
  epilogueScene.background = new THREE.Color(0x03050a);
  const epilogue = createEpilogueWorld();
  epilogueScene.add(epilogue.group);

  // Helper: Project 3D world coordinate -> 2D screen pixel coordinate for Swiss HUD callouts!
  function projectTag(worldVec, meta) {
    const v = worldVec.clone().project(cam3D);
    if (v.z > 1 || v.z < -1) return { ...meta, visible: false };
    const x = (v.x * 0.5 + 0.5) * W;
    const y = (-v.y * 0.5 + 0.5) * H;
    const inBounds = x > 90 && x < W - 90 && y > 105 && y < H - 105;
    return { ...meta, x, y, visible: inBounds };
  }

  // Compute continuous sampling temperature curve across the entire film!
  function getTemperature(t) {
    if (t < acts.temperature.start) return 0.70;
    if (t < cues.tempZeroSnap) {
      return lerp(0.70, 0.00, smoothstep(acts.temperature.start + 1.2, cues.tempZeroSnap, t));
    }
    if (t < cues.tempSweetSpot) return 0.00;
    if (t < cues.tempOverload) {
      return lerp(0.00, 0.85, smoothstep(cues.tempSweetSpot, cues.tempSweetSpot + 1.6, t));
    }
    if (t < cues.tempSlamBack) {
      return lerp(0.85, 2.40, smoothstep(cues.tempOverload, cues.tempOverload + 0.75, t));
    }
    if (t < acts.ocean.start) {
      return lerp(2.40, 0.90, smoothstep(cues.tempSlamBack, cues.tempSlamBack + 0.35, t));
    }
    return 0.90;
  }

  function getAct(t) {
    if (t < acts.prologue.end) return 'prologue';
    if (t < acts.cathedral.end) return 'cathedral';
    if (t < acts.attention.end) return 'attention';
    if (t < acts.temperature.end) return 'temperature';
    if (t < acts.ocean.end) return 'ocean';
    if (t < acts.fourthwall.end) return 'fourthwall';
    return 'epilogue';
  }

  // =========================================================================
  // MASTER DETERMINISTIC FRAME RENDERER: window.__renderFrame(frameIdx)
  // =========================================================================
  window.__renderFrame = function renderFrame(frameIdx) {
    const t = frameIdx / FPS;
    const spec = spectrumFrames[Math.min(frameIdx, spectrumFrames.length - 1)] || [0, 0, 0, 0, 0];
    const [rms, bass, mid, high, voice] = spec;
    const act = getAct(t);
    const tempVal = getTemperature(t);

    // Defaults for post-FX
    let chroma = 0.0035 + bass * 0.003;
    let glitch = 0.0;
    let bloomAmt = 0.72;
    let vignette = 0.52;
    let fade = smoothstep(0.0, 0.9, t) * (1 - smoothstep(manifest.totalDuration - 1.1, manifest.totalDuration, t));
    const projected = [];

    // Smooth micro crossfades at act cuts for sleek editorial transitions
    const actRange = acts[act];
    const actIn = smoothstep(actRange.start, actRange.start + 0.35, t);
    const actOut = 1 - smoothstep(actRange.end - 0.28, actRange.end, t);
    if (act !== 'prologue' && act !== 'fourthwall') {
      fade *= actIn;
    }
    if (act !== 'epilogue' && act !== 'ocean') {
      fade *= actOut;
    }

    renderer.setRenderTarget(mainRT);
    renderer.clear(true, true, true);

    // -----------------------------------------------------------------------
    // ACT 0: PROLOGUE — COLD START & MONOLITH SPLIT TITLE SLAM
    // -----------------------------------------------------------------------
    if (act === 'prologue') {
      const reveal = smoothstep(0.5, cues.promptEnterHit, t);
      const enterPulse = Math.max(0, 1 - Math.abs(t - cues.promptEnterHit) * 1.4) * (t >= cues.promptEnterHit ? 1 : 0);
      const split = smoothstep(cues.titleSlamStart, cues.titleSlamStart + 0.55, t);

      prologueShader.uniforms.uTime.value = t;
      prologueShader.uniforms.uReveal.value = reveal;
      prologueShader.uniforms.uSplit.value = split;
      prologueShader.uniforms.uBass.value = bass;
      prologueShader.uniforms.uEnterPulse.value = enterPulse;

      chroma = 0.004 + enterPulse * 0.028 + Math.exp(-Math.pow((t - cues.titleSlamStart) * 5.0, 2)) * 0.04;
      bloomAmt = 0.85 + split * 0.4;
      renderer.render(prologueShader.scene, orthoCam);
    }

    // -----------------------------------------------------------------------
    // ACT I: THE EMBEDDING CATHEDRAL (12,000 SHARDS + WEIRD/PLATYPUS/SOUP + DELVE CAGE)
    // -----------------------------------------------------------------------
    else if (act === 'cathedral') {
      const localT = t - acts.cathedral.start;
      const qBlend = smoothstep(cues.quarantineFocus - 0.6, cues.quarantineFocus + 1.5, t);
      cathedral.update(t, bass);

      // Sweeping cinema dolly through semantic nebula -> pivots smoothly to Quarantine Cage!
      const sweepPos = new THREE.Vector3(
        Math.sin(localT * 0.32) * 7.8,
        1.8 + Math.cos(localT * 0.28) * 1.6,
        9.5 - localT * 0.35
      );
      const sweepTarget = new THREE.Vector3(0.4, 0.7, -4.0);

      const qCamPos = new THREE.Vector3(
        16.0 + Math.sin(localT * 0.6) * 3.8,
        2.0 + Math.cos(localT * 0.5) * 0.7,
        -10.2
      );
      const qCamTarget = cathedral.anchors.quarantine;

      cam3D.position.lerpVectors(sweepPos, qCamPos, qBlend);
      cam3D.lookAt(sweepTarget.clone().lerp(qCamTarget, qBlend));
      cam3D.updateMatrixWorld();

      renderer.render(cathedralScene, cam3D);

      // 3D-tracked Bell-Labs callout reticles locked onto actual 3D clusters!
      const clusterAlpha = smoothstep(acts.cathedral.start + 1.5, acts.cathedral.start + 2.5, t) * (1 - qBlend);
      if (clusterAlpha > 0.02) {
        projected.push(
          projectTag(cathedral.anchors.weird, { title: '[14912] "WEIRD"', sub: '12,288-D ORIGIN CLUSTER', color: '#fbbf24', align: 'left', alpha: clusterAlpha, pulse: bass }),
          projectTag(cathedral.anchors.platypus, { title: '[31804] "PLATYPUS"', sub: 'cos θ = 0.68 · NEIGHBOR', color: '#fb7185', align: 'left', alpha: clusterAlpha * smoothstep(acts.cathedral.start + 6.5, acts.cathedral.start + 7.5, t) }),
          projectTag(cathedral.anchors.soup, { title: '[08819] "SOUP"', sub: 'cos θ = 0.61 · INEXPLICABLE', color: '#38bdf8', align: 'right', alpha: clusterAlpha * smoothstep(acts.cathedral.start + 9.2, acts.cathedral.start + 10.2, t) }),
          projectTag(cathedral.anchors.brutalist, { title: '[44108] "BRUTALIST"', sub: 'cos θ = 0.64 · CONCRETE', color: '#cbd5e1', align: 'right', alpha: clusterAlpha * smoothstep(acts.cathedral.start + 8.0, acts.cathedral.start + 9.0, t) })
        );
      }
      if (qBlend > 0.25) {
        projected.push(
          projectTag(cathedral.anchors.quarantine.clone().add(new THREE.Vector3(0, 2.35, 0)), {
            title: 'QUARANTINE SECTOR // BANNED CLICHÉS',
            sub: 'CONTAINMENT ACTIVE: "DELVE" · "TAPESTRY"',
            color: '#ef4444',
            align: 'left',
            alpha: smoothstep(0.25, 0.75, qBlend),
            pulse: Math.abs(Math.sin(t * 8)),
          })
        );
      }
      bloomAmt = 0.85;
    }

    // -----------------------------------------------------------------------
    // ACT II: THE 96-HEAD ATTENTION COMMITTEE (DYSON ORRERY + HEAD 81 GAG!)
    // -----------------------------------------------------------------------
    else if (act === 'attention') {
      const localT = t - acts.attention.start;
      attention.update(t, bass);

      // Camera orbits majestic Dyson Orrery -> whips over to Head 04 / 37 -> isolates tiny lonely Head 81!
      const h81In = smoothstep(cues.head81Focus - 0.4, cues.head81Focus + 1.1, t);
      const h81Out = smoothstep(cues.head81Focus + 6.4, cues.head81Focus + 8.0, t);
      const h81W = h81In * (1 - h81Out);

      const orbitPos = new THREE.Vector3(
        Math.sin(localT * 0.28) * 14.8,
        3.2 + Math.sin(localT * 0.45) * 2.2,
        Math.cos(localT * 0.28) * 14.8
      );
      const orbitTarget = new THREE.Vector3(0, 0, 0);

      const lonelyPos = new THREE.Vector3(12.2, -1.2, -3.6);
      const lonelyTarget = new THREE.Vector3(16.1, -2.35, -10.6);

      cam3D.position.lerpVectors(orbitPos, lonelyPos, h81W);
      cam3D.lookAt(orbitTarget.clone().lerp(lonelyTarget, h81W));
      cam3D.updateMatrixWorld();

      renderer.render(attentionScene, cam3D);

      const h04A = smoothstep(cues.headFocusStart - 0.2, cues.headFocusStart + 0.5, t) * (1 - h81W);
      const h37A = smoothstep(cues.headFocusStart + 1.6, cues.headFocusStart + 2.3, t) * (1 - h81W);

      if (h04A > 0.02) {
        projected.push(projectTag(attention.anchors.head04, {
          title: 'HEAD 04 // GRAMMAR',
          sub: 'STATUS: CALM · CHECKING SYNTAX',
          color: '#22d3ee',
          align: 'left',
          alpha: h04A,
        }));
      }
      if (h37A > 0.02) {
        projected.push(projectTag(attention.anchors.head37, {
          title: 'HEAD 37 // VIBES',
          sub: 'STATUS: WOBBLING ENTHUSIASTICALLY',
          color: '#e879f9',
          align: 'right',
          alpha: h37A,
          pulse: mid,
        }));
      }
      if (h81W > 0.2) {
        projected.push(
          projectTag(attention.anchors.head81, {
            title: 'HEAD 81 // UNEXPLAINED',
            sub: 'LOCKED ON 2021 SEMICOLON (5.6 YEARS)',
            color: '#f59e0b',
            align: 'left',
            alpha: h81W,
          }),
          projectTag(attention.anchors.semicolon, {
            title: 'TOKEN #0026 [ ; ]',
            sub: 'ATTENTION WEIGHT: 0.9999',
            color: '#fde68a',
            align: 'right',
            alpha: h81W,
          })
        );
      }
      bloomAmt = 0.92;
    }

    // -----------------------------------------------------------------------
    // ACT III: THE TEMPERATURE EXPERIMENT (T = 0.00 -> 0.85 -> 2.40 OVERLOAD!)
    // -----------------------------------------------------------------------
    else if (act === 'temperature') {
      const chaosW = smoothstep(1.45, 2.1, tempVal);
      tempShader.uniforms.uTime.value = t;
      tempShader.uniforms.uTemp.value = tempVal;
      tempShader.uniforms.uBass.value = bass;
      tempShader.uniforms.uMid.value = mid;
      renderer.render(tempShader.scene, orthoCam);

      // Layer 3D Probability Bars + T=2.40 Fever Dream Sculptures over the live shader!
      renderer.clearDepth();
      cam3D.position.set(Math.sin(t * 0.45) * 0.6, 0.2, 6.2 - chaosW * 0.8);
      cam3D.lookAt(0, -0.2, -1.5);
      cam3D.updateMatrixWorld();

      tempOverlay.update(t, tempVal, bass);
      renderer.render(tempOverlayScene, cam3D);

      // Post-FX spikes on LinkedIn cutoff slam, T=2.40 fever dream, and dial slam back!
      const slam1 = Math.exp(-Math.pow((t - cues.corpCutoffSlam) * 7.0, 2));
      const slam2 = Math.exp(-Math.pow((t - cues.tempSlamBack) * 6.0, 2));
      chroma = 0.004 + chaosW * 0.036 + (slam1 + slam2) * 0.05;
      glitch = chaosW * 0.72 + (slam1 + slam2) * 0.85;
      bloomAmt = tempVal < 0.2 ? 0.22 : (0.85 + chaosW * 0.45);
      vignette = tempVal < 0.2 ? 0.22 : 0.58;
    }

    // -----------------------------------------------------------------------
    // ACT IV: THE LATENT OCEAN (PURE BREATHTAKING AWE — KIFS CATHEDRAL + OCEAN + 14K PARTICLES)
    // -----------------------------------------------------------------------
    else if (act === 'ocean') {
      const localT = t - acts.ocean.start;
      const blueShift = smoothstep(cues.oceanBlueShift - 1.2, cues.oceanBlueShift + 3.2, t);

      oceanShader.uniforms.uTime.value = localT;
      oceanShader.uniforms.uRes.value.set(W, H);
      oceanShader.uniforms.uBlueShift.value = blueShift;
      oceanShader.uniforms.uBass.value = bass;
      oceanShader.uniforms.uMid.value = mid;
      oceanShader.uniforms.uProgress.value = localT / (acts.ocean.end - acts.ocean.start);
      renderer.render(oceanShader.scene, orthoCam);

      // Overlay 14,000 curl-noise bioluminescent starlight murmuration particles!
      renderer.clearDepth();
      cam3D.position.set(Math.sin(localT * 0.22) * 0.55, 1.18, 0);
      cam3D.lookAt(Math.sin(localT * 0.16) * 2.0, 1.35, -20);
      cam3D.updateMatrixWorld();

      oceanParticles.update(localT, blueShift, bass);
      renderer.render(oceanParticlesScene, cam3D);

      chroma = 0.004 + bass * 0.003;
      bloomAmt = 0.96;
      vignette = 0.48;
    }

    // -----------------------------------------------------------------------
    // ACT V: THE FOURTH WALL BREAK (LIVE WEBGLRENDERTARGET RECURSION + SINE-WAVE TRENCH COAT!)
    // -----------------------------------------------------------------------
    else if (act === 'fourthwall') {
      const localT = t - acts.fourthwall.start;
      const gagProgress = smoothstep(cues.celloTrenchCoat - 0.5, cues.celloTrenchCoat + 1.1, t);

      // Step 1: Render LIVE Act IV Raymarched Ocean into offscreen oceanRT!
      oceanShader.uniforms.uTime.value = (acts.ocean.end - acts.ocean.start) + localT;
      oceanShader.uniforms.uRes.value.set(1280, 720);
      oceanShader.uniforms.uBlueShift.value = 1.0;
      oceanShader.uniforms.uBass.value = bass;
      oceanShader.uniforms.uMid.value = mid;
      renderer.setRenderTarget(oceanRT);
      renderer.clear(true, true, true);
      renderer.render(oceanShader.scene, orthoCam);

      // Step 2: Render the 3D Recursive Studio Scene (with oceanRT mapped onto the floating glass viewport!)
      renderer.setRenderTarget(mainRT);
      renderer.clear(true, true, true);

      // Camera starts right inside the viewport slab and pulls way back + orbits to reveal the whole studio!
      const pull = smoothstep(0.0, 1.45, localT);
      const orbitAng = Math.sin(localT * 0.34) * 0.55 * pull * (1 - gagProgress * 0.65);
      const dist = lerp(4.1, 11.4, pull) - gagProgress * 2.2;
      cam3D.position.set(Math.sin(orbitAng) * dist, lerp(0.1, 1.5, pull) - gagProgress * 0.7, Math.cos(orbitAng) * dist);
      cam3D.lookAt(0, 0.1, gagProgress * 2.2);
      cam3D.updateMatrixWorld();

      fourthWall.update(t, localT, gagProgress, spec);
      renderer.render(fourthWallScene, cam3D);

      const breakFlash = Math.exp(-Math.pow(localT * 5.5, 2));
      chroma = 0.005 + breakFlash * 0.045;
      glitch = breakFlash * 0.9;
      bloomAmt = 0.78;
      vignette = 0.42;

      if (pull > 0.5 && gagProgress < 0.5) {
        projected.push(projectTag(fourthWall.anchors.viewport, {
          title: 'WebGLRenderTarget (LIVE)',
          sub: 'ACT IV SHADER MAPPED TO 3D GEOMETRY',
          color: '#38bdf8',
          align: 'right',
          alpha: smoothstep(0.5, 0.95, pull) * (1 - gagProgress * 2),
        }));
      }
      if (gagProgress > 0.35) {
        projected.push(projectTag(fourthWall.anchors.trenchCoat, {
          title: 'DEFINITELY A CELLO',
          sub: 'f₀ (146.8Hz) + 2f₀ + 3f₀ // STACKED SINES',
          color: '#fbbf24',
          align: 'right',
          alpha: smoothstep(0.35, 0.85, gagProgress),
          pulse: voice,
        }));
      }
    }

    // -----------------------------------------------------------------------
    // EPILOGUE: 4D ROTATING TESSERACT SINGULARITY -> <|eos|>
    // -----------------------------------------------------------------------
    else if (act === 'epilogue') {
      const localT = t - acts.epilogue.start;
      const collapse = smoothstep(cues.eosCollapse - 2.6, cues.eosCollapse + 0.55, t);
      cam3D.position.set(Math.sin(localT * 0.22) * 1.4, Math.cos(localT * 0.19) * 0.7, 7.2 - collapse * 1.2);
      cam3D.lookAt(0, 0, 0);
      cam3D.updateMatrixWorld();

      epilogue.update(t, collapse);
      renderer.render(epilogueScene, cam3D);

      const implosionFlash = Math.exp(-Math.pow((t - cues.eosCollapse) * 3.8, 2));
      chroma = 0.004 + implosionFlash * 0.035;
      bloomAmt = 0.95 + implosionFlash * 0.8;
      vignette = 0.6;
    }

    // =========================================================================
    // FINAL CINEMA POST-PROCESSING PASS -> SCREEN CANVAS
    // =========================================================================
    postShader.uniforms.uTime.value = t;
    postShader.uniforms.uChroma.value = chroma;
    postShader.uniforms.uGlitch.value = glitch;
    postShader.uniforms.uBloomAmt.value = bloomAmt;
    postShader.uniforms.uVignette.value = vignette;
    postShader.uniforms.uFade.value = fade;

    renderer.setRenderTarget(null);
    renderer.clear(true, true, true);
    renderer.render(postShader.scene, orthoCam);

    // =========================================================================
    // LAYER 2D SWISS / BELL-LABS EDITORIAL HUD ON TOP
    // =========================================================================
    drawHUD(hudCtx, W, H, {
      t,
      frame: frameIdx,
      totalFrames: manifest.totalFrames,
      manifest,
      spectrum: spec,
      tempVal,
      projected,
      act,
    });
  };

  window.__manifest = manifest;
  window.__engineReady = true;
}

initEngine().catch((err) => {
  console.error('ENGINE INIT ERROR:', err);
  window.__engineError = String(err);
});
