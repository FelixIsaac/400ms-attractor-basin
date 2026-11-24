// Custom WebGL2 GLSL Shaders for FORWARD PASS (Polished Director's Cut)
// 100% procedural raymarching, signed-distance geometry, iridescent PBR, volumetric lighting, & cinema post-FX.

export const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// ============================================================================
// SHADER A: PROLOGUE — SCULPTURAL OBSIDIAN-AND-LIQUID-GOLD CRYSTAL MONOLITH
// Razor-sharp 3-iteration faceted architecture, deep velvet background, molten fissure split!
// ============================================================================
export const PROLOGUE_SDF_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uRes;
uniform float uReveal;
uniform float uSplit;
uniform float uBass;
uniform float uEnterPulse;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735027;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

vec3 iridescence(float cosTheta, float phase) {
  vec3 a = vec3(0.45, 0.45, 0.52);
  vec3 b = vec3(0.45, 0.42, 0.48);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.06, 0.34, 0.62) + phase;
  return a + b * cos(6.28318 * (c * cosTheta + d));
}

float mapScene(vec3 p, out float matId) {
  // Split smoothly into two obsidian halves on TITLE SLAM (leaving clean dark center for title!)
  float side = sign(p.x + 0.0001);
  p.x -= side * uSplit * 1.45;

  vec3 q = p;
  q.xz *= rot(uTime * 0.24 + side * uSplit * 0.35);
  q.xy *= rot(uTime * 0.14);

  // Clean 3-iteration architectural octahedral fold (sculptural facets, zero noisy sand!)
  float scale = 1.0;
  for (int i = 0; i < 3; i++) {
    q = abs(q);
    if (q.x < q.y) q.xy = q.yx;
    if (q.x < q.z) q.xz = q.zx;
    q.xz *= rot(0.38 + 0.10 * sin(uTime * 0.4));
    q = q * 1.62 - vec3(0.92, 0.54, 0.42);
    scale *= 1.62;
  }
  float dCrystal = (sdBox(q, vec3(0.55, 0.72, 0.55)) - 0.06) / scale;
  float dOct = sdOctahedron(p, 1.48 + uBass * 0.10 + uEnterPulse * 0.18);
  float dBody = max(dCrystal, dOct - 0.35);
  dBody = smin(dBody, length(p) - (0.72 + uBass * 0.08), 0.16);

  // Precision orbital brass/cyan calibration rings
  vec3 r1 = p;
  r1.yz *= rot(uTime * 0.45 + 0.4);
  r1.xz *= rot(0.3);
  float dRing1 = length(vec2(length(r1.xz) - 1.78, r1.y)) - 0.022;

  vec3 r2 = p;
  r2.xy *= rot(-uTime * 0.32 + 1.0);
  float dRing2 = length(vec2(length(r2.xz) - 2.15, r2.y)) - 0.014;

  float dRings = min(dRing1, dRing2);
  matId = dRings < dBody ? 1.0 : 0.0;
  return min(dBody, dRings);
}

vec3 calcNormal(vec3 p) {
  float m;
  vec2 e = vec2(0.002, -0.002);
  return normalize(
    e.xyy * mapScene(p + e.xyy, m) +
    e.yyx * mapScene(p + e.yyx, m) +
    e.yxy * mapScene(p + e.yxy, m) +
    e.xxx * mapScene(p + e.xxx, m)
  );
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  float camZ = mix(5.1, 3.65, smoothstep(0.0, 1.0, uReveal)) + uSplit * 0.35;
  vec3 ro = vec3(sin(uTime * 0.2) * 0.22, cos(uTime * 0.17) * 0.12, camZ);
  vec3 rd = normalize(vec3(uv, -1.55));

  // Deep dramatic obsidian velvet background (so kinetic white/gold title pops 100%!)
  vec3 col = vec3(0.010, 0.014, 0.024);
  float radial = exp(-length(uv) * 2.8);
  col += mix(vec3(0.06, 0.18, 0.36), vec3(0.28, 0.14, 0.04), uSplit) * radial * (0.45 + uEnterPulse * 0.5);

  // Crisp shockwave ring on Enter press
  if (uEnterPulse > 0.001) {
    float ringR = (1.0 - uEnterPulse) * 1.45;
    float ring = exp(-abs(length(uv) - ringR) * 38.0) * uEnterPulse;
    col += vec3(0.35, 0.85, 1.0) * ring * 1.2;
  }

  float t = 0.0;
  float matId = 0.0;
  float glowAcc = 0.0;
  bool hit = false;

  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = mapScene(p, matId);
    glowAcc += exp(-abs(d) * 9.0) * 0.011;
    if (d < 0.0015) {
      hit = true;
      break;
    }
    if (t > 12.0) break;
    t += d * 0.85;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    vec3 l1 = normalize(vec3(2.0, 2.4, 2.5));
    vec3 l2 = normalize(vec3(-2.5, -1.0, 1.5));
    float diff1 = max(dot(n, l1), 0.0);
    float diff2 = max(dot(n, l2), 0.0);
    float spec1 = pow(max(dot(reflect(-l1, n), v), 0.0), 64.0);
    float spec2 = pow(max(dot(reflect(-l2, n), v), 0.0), 36.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.4);

    float mDummy;
    float ao = clamp(
      (mapScene(p + n * 0.08, mDummy) / 0.08) * 0.5 +
      (mapScene(p + n * 0.24, mDummy) / 0.24) * 0.5,
      0.18, 1.0
    );

    if (matId > 0.5) {
      // Glowing precision orbital brass-cyan rings
      col = vec3(0.95, 0.72, 0.34) * (0.4 + 0.6 * diff1) + vec3(0.35, 0.82, 1.0) * fres * 1.2;
    } else {
      vec3 irid = iridescence(dot(n, v) * 1.2 + length(p) * 0.4, uTime * 0.05);
      // Glossy dark volcanic obsidian with dichroic rim highlights!
      vec3 obs = mix(vec3(0.025, 0.035, 0.06), irid * 0.42, 0.28 + fres * 0.65);
      col = obs * (diff1 * vec3(1.15, 0.92, 0.68) + diff2 * vec3(0.28, 0.62, 1.18)) * ao;
      col += vec3(1.0, 0.86, 0.62) * spec1 * 1.3;
      col += vec3(0.35, 0.82, 1.0) * spec2 * 0.8;
      col += irid * fres * (0.95 + uBass * 0.55);

      // Subtle molten golden rim along the split interior edge (not washing out center text!)
      float innerEdge = exp(-abs(p.x) * 4.5) * uSplit;
      col += vec3(1.35, 0.72, 0.22) * innerEdge * 0.95;
    }
  }

  col += mix(vec3(0.22, 0.62, 1.0), vec3(0.95, 0.58, 0.22), uSplit) * glowAcc * (0.52 + uBass * 0.45);
  // Keep center subtly darkened behind Title Slam so white typography reads with razor clarity!
  float titleDim = 1.0 - uSplit * exp(-length(uv * vec2(0.85, 1.7)) * 3.0) * 0.58;
  col *= titleDim * mix(0.10, 1.0, smoothstep(0.0, 0.22, uReveal));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// SHADER B: ACT III — TEMPERATURE EXPERIMENT (T = 0.0 -> 0.85 JELLYFISH -> 2.40 CHAOS)
// ============================================================================
export const TEMPERATURE_LAB_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uRes;
uniform float uTemp;
uniform float uBass;
uniform float uMid;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

vec3 cosinePal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

// 1) T = 0.00 Sterile Corporate Cube Lattice
float sdfSterile(vec3 p) {
  vec3 q = p;
  q.xz *= rot(uTime * 0.14);
  q.xy *= rot(0.32);
  vec3 c = vec3(1.22);
  vec3 r = mod(q + 0.5 * c, c) - 0.5 * c;
  return max(sdBox(r, vec3(0.34)), sdBox(q, vec3(1.55)));
}

// 2) T = 0.85 Bioluminescent Iridescent Chrome-Jellyfish Cathedral ("Triangles remember they could have been jellyfish"!)
float sdfLiquid(vec3 p) {
  vec3 q = p;
  q.y -= 0.18 + sin(uTime * 1.1) * 0.12;
  q.xz *= rot(uTime * 0.36);

  // Sculpted jellyfish bell dome (hollowed organic double-shell!)
  vec3 b = q - vec3(0.0, 0.35, 0.0);
  float pulse = 1.0 + 0.08 * sin(uTime * 2.2 - length(b.xz) * 2.5) + uBass * 0.08;
  float bellOuter = length(vec3(b.x, b.y * 1.38, b.z)) - 0.98 * pulse;
  float bellInner = -(length(vec3(b.x, (b.y + 0.24) * 1.32, b.z)) - 0.82 * pulse);
  float bell = max(bellOuter, bellInner);
  bell = max(bell, -(b.y + 0.26));

  // Frilled geometric crystal crown (echoes of triangles turning organic!)
  float ang = atan(b.z, b.x);
  bell += sin(ang * 8.0 + uTime * 1.6) * 0.045 * smoothstep(-0.2, 0.3, -b.y);
  bell += sin(b.x * 7.0 + uTime * 2.0) * sin(b.z * 7.0 - uTime * 1.8) * 0.018;

  // 8 flowing sinuous chrome tentacles trailing below the bell!
  float dTent = 1e5;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float a = fi * 0.785398 + uTime * 0.25;
    float rad = 0.42 + 0.18 * mod(fi, 2.0);
    vec3 tp = q;
    // Sway sinuously as y goes down
    float sway = max(0.0, 0.2 - tp.y);
    vec2 center = vec2(cos(a) * rad, sin(a) * rad) +
                  vec2(sin(tp.y * 2.4 - uTime * 2.8 + fi), cos(tp.y * 2.1 - uTime * 2.4 + fi * 1.7)) * (0.24 * sway);
    float tRad = mix(0.085, 0.025, clamp(sway * 0.55, 0.0, 1.0));
    float seg = length(tp.xz - center) - tRad;
    seg = max(seg, tp.y - 0.22);
    seg = max(seg, -1.65 - tp.y);
    dTent = smin(dTent, seg, 0.14);
  }

  // Glowing inner geometric nucleus orb
  float core = length(q - vec3(0.0, 0.22, 0.0)) - (0.30 + uMid * 0.07);
  float d = smin(bell, dTent, 0.18);
  d = smin(d, core, 0.16);
  return d;
}

// 3) T = 2.40 Psychedelic Domain-Warped Tunnel
float sdfChaos(vec3 p) {
  vec3 q = p;
  q.z -= uTime * 3.8;
  q.xy *= rot(q.z * 0.32 + sin(uTime * 3.0) * 0.6);
  vec3 rep = mod(q + 1.5, 3.0) - 1.5;
  rep = abs(rep);
  rep.xy *= rot(uTime * 1.4);
  float torus = length(vec2(length(rep.xy) - 0.82, rep.z)) - (0.19 + 0.06 * sin(q.z * 3.0));
  float pillars = length(rep.xz - vec2(0.75)) - 0.16;
  float tunnel = -(length(p.xy) - 0.78);
  return max(smin(torus, pillars, 0.35), tunnel);
}

float mapTemp(vec3 p) {
  float sterileW = 1.0 - smoothstep(0.12, 0.78, uTemp);
  float chaosW = smoothstep(1.25, 1.95, uTemp);
  if (sterileW >= 0.999) return sdfSterile(p);
  if (chaosW >= 0.999) return sdfChaos(p);
  if (sterileW > 0.001) return mix(sdfLiquid(p), sdfSterile(p), sterileW);
  if (chaosW > 0.001) return mix(sdfLiquid(p), sdfChaos(p), chaosW);
  return sdfLiquid(p);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0025, -0.0025);
  return normalize(
    e.xyy * mapTemp(p + e.xyy) +
    e.yyx * mapTemp(p + e.yyx) +
    e.yxy * mapTemp(p + e.yxy) +
    e.xxx * mapTemp(p + e.xxx)
  );
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float chaosW = smoothstep(1.25, 1.95, uTemp);
  float sterileW = 1.0 - smoothstep(0.12, 0.78, uTemp);

  if (chaosW > 0.01) {
    float r = length(uv);
    uv *= 1.0 + chaosW * 0.13 * sin(r * 10.0 - uTime * 9.0);
    uv *= rot(chaosW * sin(uTime * 2.8) * 0.20);
  }

  vec3 ro = vec3(sin(uTime * 0.3) * 0.35 * (1.0 - sterileW * 0.8), 0.12, 3.65 - chaosW * 0.85);
  vec3 rd = normalize(vec3(uv, -1.48));

  vec3 bgSterile = mix(vec3(0.84, 0.85, 0.82), vec3(0.68, 0.72, 0.76), length(uv) * 0.9);
  vec3 bgSweet = mix(vec3(0.015, 0.025, 0.065), vec3(0.006, 0.010, 0.026), length(uv)) +
                 vec3(0.08, 0.22, 0.42) * exp(-length(uv) * 2.2);
  vec3 bgChaos = cosinePal(length(uv) * 1.4 - uTime * 0.8, vec3(0.16, 0.04, 0.20), vec3(0.32, 0.16, 0.34), vec3(1.0), vec3(0.0, 0.33, 0.67));

  vec3 col = mix(bgSweet, bgSterile, sterileW);
  col = mix(col, bgChaos, chaosW);

  float t = 0.0;
  float glow = 0.0;
  bool hit = false;

  for (int i = 0; i < 72; i++) {
    vec3 p = ro + rd * t;
    float d = mapTemp(p);
    glow += exp(-abs(d) * 7.5) * 0.014;
    if (d < 0.002) {
      hit = true;
      break;
    }
    if (t > 14.0) break;
    t += d * 0.78;
  }

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 v = -rd;
    vec3 l1 = normalize(vec3(1.6, 2.5, 2.2));
    vec3 l2 = normalize(vec3(-2.2, -1.2, 1.4));
    float diff1 = max(dot(n, l1), 0.0);
    float diff2 = max(dot(n, l2), 0.0);
    float spec = pow(max(dot(reflect(-l1, n), v), 0.0), 56.0);
    float fres = pow(1.0 - max(dot(n, v), 0.0), 2.8);

    vec3 matSterile = vec3(0.76, 0.78, 0.80) * (0.45 + 0.55 * diff1) + vec3(0.25, 0.38, 0.52) * diff2 * 0.25;

    // Sculpted liquid-chrome jellyfish bioluminescence!
    vec3 reflDir = reflect(-v, n);
    vec3 envCol = cosinePal(reflDir.y * 0.55 + reflDir.x * 0.35 + uTime * 0.14,
      vec3(0.42, 0.45, 0.56), vec3(0.45, 0.42, 0.44), vec3(1.0, 1.0, 1.0), vec3(0.08, 0.34, 0.64));
    vec3 matSweet = envCol * (0.28 + 0.72 * diff1) +
                    vec3(1.0, 0.82, 0.52) * spec * 1.4 +
                    vec3(0.18, 0.88, 1.0) * fres * (1.35 + uBass * 0.7) +
                    vec3(0.95, 0.26, 0.58) * diff2 * 0.55;

    vec3 neon = cosinePal(dot(n, v) * 1.8 + p.z * 0.45 - uTime * 1.8,
      vec3(0.5), vec3(0.5), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.33, 0.67));
    vec3 matChaos = neon * (0.65 + 0.85 * diff1 + fres * 1.4) + vec3(1.0) * spec;

    col = mix(matSweet, matSterile, sterileW);
    col = mix(col, matChaos, chaosW);
    float fog = exp(-t * (0.07 + chaosW * 0.10));
    col = mix(mix(bgSweet, bgChaos, chaosW), col, mix(fog, 1.0, sterileW));
  }

  col += vec3(0.22, 0.78, 1.0) * glow * (1.0 - sterileW) * (0.58 + uBass * 0.45);
  col += vec3(1.0, 0.25, 0.72) * glow * chaosW * 1.3;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// SHADER C: ACT IV — THE LATENT OCEAN (MONUMENTAL ESCHER CATHEDRAL + MIRROR-BLACK OCEAN!)
// Deep dramatic midnight-obsidian & ultramarine contrast, continuous vaulted pillars plunging into water!
// ============================================================================
export const LATENT_OCEAN_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uRes;
uniform float uBlueShift;
uniform float uBass;
uniform float uMid;
uniform float uProgress;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float oceanWave(vec2 p, float t) {
  float h = 0.0;
  h += sin(p.x * 0.55 + t * 1.05) * cos(p.y * 0.42 - t * 0.75) * 0.085;
  h += sin(p.x * 1.35 - p.y * 0.95 + t * 1.55) * 0.036;
  h += sin(p.x * 2.9 + p.y * 2.4 - t * 2.2) * 0.014;
  h += cos(p.x * 5.8 - p.y * 5.1 + t * 2.9) * 0.005;
  return h;
}

vec3 oceanNormal(vec2 p, float t) {
  vec2 e = vec2(0.035, 0.0);
  float h = oceanWave(p, t);
  return normalize(vec3(
    h - oceanWave(p + e.xy, t),
    0.11,
    h - oceanWave(p + e.yx, t)
  ));
}

// Monumental Continuous Gothic/Brutalist Vaulted Cathedral rising directly from the dark ocean!
float mapArch(vec3 p, out float lightStrip) {
  vec3 q = p;
  float bayId = floor((q.z + 4.0) / 8.0);
  q.z = mod(q.z + 4.0, 8.0) - 4.0;

  // Symmetric pair of colossal fluted architectural columns rising straight out of water!
  vec3 colP = q;
  colP.x = abs(colP.x) - 3.65;
  float pillar = sdBox(colP - vec3(0.0, 2.2, 0.0), vec3(0.55, 3.6, 0.65)) - 0.05;
  // Architectural carved flutes along the columns
  pillar += sin(colP.y * 4.0) * 0.025 + cos(colP.z * 7.0) * 0.02;

  // Sweeping pointed Gothic/Parabolic vaulted arch spanning overhead from pillar to pillar!
  vec3 archP = q - vec3(0.0, 1.9, 0.0);
  float archRad = length(vec2(archP.x * 0.96, archP.y * 0.82));
  float mainArch = length(vec2(archRad - 3.55, archP.z)) - 0.28;
  mainArch = max(mainArch, -archP.y - 0.35);

  // Inner suspended luminous meridian ring + delicate breathing 4D cross-ribs
  float breathe = 0.14 * sin(uTime * 0.4 + bayId * 0.9);
  vec3 ribP = archP;
  ribP.xy *= rot(breathe);
  float innerRing = length(vec2(length(ribP.xy) - 2.95, ribP.z)) - 0.055;

  // Longitudinal upper vaulted cornices connecting bays continuously into infinity!
  vec3 beamP = vec3(abs(p.x) - 3.65, p.y - 4.35, 0.0);
  float cornice = sdBox(beamP, vec3(0.42, 0.28, 100.0));

  // Secondary outer flying buttress colonnade for monumental depth!
  vec3 outP = q;
  outP.x = abs(outP.x) - 6.8;
  float outerPillar = sdBox(outP - vec3(0.0, 2.5, 0.0), vec3(0.62, 4.5, 0.72));

  float d = min(min(pillar, mainArch), min(cornice, outerPillar));
  // Mark glowing golden/cyan filigree light strips (inner ring + vertical light veins on columns)
  float pillarVein = length(vec2(abs(colP.x) - 0.56, colP.z));
  lightStrip = min(innerRing, pillarVein);
  return min(d, innerRing);
}

vec3 archNormal(vec3 p) {
  float ls;
  vec2 e = vec2(0.008, -0.008);
  return normalize(
    e.xyy * mapArch(p + e.xyy, ls) +
    e.yyx * mapArch(p + e.yyx, ls) +
    e.yxy * mapArch(p + e.yxy, ls) +
    e.xxx * mapArch(p + e.xxx, ls)
  );
}

vec3 skyColor(vec3 rd, float blueShift) {
  float h = clamp(rd.y, 0.0, 1.0);
  // Deep dramatic twilight palette — NEVER blown-out pastel white!
  vec3 warmZenith = vec3(0.008, 0.009, 0.018);
  vec3 warmHoriz  = vec3(0.18, 0.085, 0.032);
  vec3 blueZenith = vec3(0.006, 0.018, 0.075);
  vec3 blueHoriz  = vec3(0.025, 0.13, 0.34);

  vec3 zenith = mix(warmZenith, blueZenith, blueShift);
  vec3 horiz  = mix(warmHoriz, blueHoriz, blueShift);
  vec3 col = mix(horiz, zenith, pow(h, 0.42));

  // Sculpted glowing horizon solar disc + subtle golden/blue corona
  vec3 sunDir = normalize(vec3(0.0, 0.095, -1.0));
  float sunDot = max(dot(rd, sunDir), 0.0);
  vec3 coronaCol = mix(vec3(1.15, 0.58, 0.20), vec3(0.95, 0.78, 0.36), blueShift);
  col += coronaCol * pow(sunDot, 48.0) * 1.15;
  col += mix(vec3(0.55, 0.25, 0.09), vec3(0.10, 0.42, 0.92), blueShift) * pow(sunDot, 6.0) * 0.45;

  // Delicate high aurora veil
  float aurora = sin(rd.x * 6.0 + uTime * 0.25) * cos(rd.x * 13.0 - uTime * 0.18) * exp(-abs(rd.y - 0.32) * 8.0);
  col += mix(vec3(0.45, 0.22, 0.08), vec3(0.08, 0.55, 1.0), blueShift) * max(aurora, 0.0) * 0.32;
  return col;
}

vec3 traceArch(vec3 ro, vec3 rd, float blueShift, int maxSteps) {
  float t = 0.0;
  float lightStrip = 1e5;
  float glowAcc = 0.0;
  float hitDist = -1.0;

  for (int i = 0; i < 68; i++) {
    if (i >= maxSteps) break;
    vec3 p = ro + rd * t;
    float d = mapArch(p, lightStrip);
    glowAcc += exp(-abs(lightStrip) * 6.5) * 0.016;
    if (d < 0.012) {
      hitDist = t;
      break;
    }
    if (t > 48.0) break;
    t += max(d * 0.80, 0.025);
  }

  vec3 sky = skyColor(rd, blueShift);
  vec3 rimCol = mix(vec3(1.05, 0.58, 0.22), vec3(0.18, 0.68, 1.35), blueShift);
  vec3 goldStrip = mix(vec3(1.35, 0.75, 0.28), vec3(1.35, 0.96, 0.40), blueShift);

  vec3 col = sky;
  if (hitDist > 0.0) {
    vec3 p = ro + rd * hitDist;
    vec3 n = archNormal(p);
    vec3 lDir = normalize(vec3(0.15, 0.35, -0.92)); // dramatic horizon backlighting!
    float diff = max(dot(n, lDir), 0.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.2);

    // Rich dark wet obsidian stone catching golden/ultramarine rim light!
    vec3 stone = mix(vec3(0.032, 0.028, 0.038), vec3(0.018, 0.045, 0.12), blueShift);
    vec3 surf = stone * (0.28 + diff * 1.15) + rimCol * fres * 0.95;

    // Blazing golden architectural filigree along inner meridian rings & column veins!
    float stripGlow = exp(-abs(lightStrip) * 14.0);
    surf += goldStrip * stripGlow * (1.45 + uMid * 0.75);

    float fog = 1.0 - exp(-hitDist * 0.046);
    col = mix(surf, sky, clamp(fog, 0.0, 1.0));
  }

  col += mix(rimCol, goldStrip, 0.55) * glowAcc * (0.48 + uBass * 0.35);
  return col;
}

void main() {
  vec2 uv = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  float zPos = -uTime * 1.85;
  vec3 ro = vec3(sin(uTime * 0.20) * 0.42, 1.28 + sin(uTime * 0.28) * 0.10, zPos);
  vec3 rd = normalize(vec3(uv.x, uv.y + 0.045, -1.42));
  rd.xz *= rot(sin(uTime * 0.15) * 0.06);

  vec3 col;
  if (rd.y < -0.001) {
    float tWater = -ro.y / rd.y;
    if (tWater > 0.0 && tWater < 72.0) {
      vec3 wp = ro + rd * tWater;
      vec3 wn = oceanNormal(wp.xz, uTime);
      vec3 reflRd = reflect(rd, wn);
      reflRd.y = max(reflRd.y, 0.008);

      // Trace real reflected cathedral pillars & arches in the ripples!
      vec3 reflCol = traceArch(wp + vec3(0.0, 0.04, 0.0), reflRd, uBlueShift, 38);

      float fres = pow(1.0 - max(dot(-rd, wn), 0.0), 3.6);
      vec3 deepWater = mix(vec3(0.008, 0.009, 0.015), vec3(0.004, 0.018, 0.065), uBlueShift);
      vec3 glintCol = mix(vec3(1.15, 0.65, 0.24), vec3(1.25, 0.92, 0.42), uBlueShift);
      float glint = pow(max(dot(reflRd, normalize(vec3(0.0, 0.11, -1.0))), 0.0), 64.0);

      col = mix(deepWater, reflCol * 0.88, clamp(0.32 + fres * 0.68, 0.0, 1.0));
      col += glintCol * glint * (1.25 + uBass * 0.55);

      float waterFog = 1.0 - exp(-tWater * 0.038);
      col = mix(col, skyColor(vec3(rd.x, 0.01, rd.z), uBlueShift), clamp(waterFog, 0.0, 1.0));
    } else {
      col = skyColor(rd, uBlueShift);
    }
  } else {
    col = traceArch(ro, rd, uBlueShift, 64);
  }

  // Subtle god-ray shafts radiating softly from horizon
  float shaftAngle = atan(uv.y - 0.045, uv.x);
  float shafts = pow(0.5 + 0.5 * sin(shaftAngle * 12.0 + uTime * 0.22), 6.0) * exp(-length(uv - vec2(0.0, 0.045)) * 2.8);
  col += mix(vec3(0.85, 0.48, 0.18), vec3(0.24, 0.62, 1.1), uBlueShift) * shafts * 0.18;

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// SHADER D: ACT II — SOFTMAX ATTENTION MATRIX STAINED-GLASS HOLOGRAM
// ============================================================================
export const ATTENTION_HEATMAP_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform float uSeed;
uniform vec3 uColorA;
uniform vec3 uColorB;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

void main() {
  float cells = 8.0;
  vec2 gid = floor(vUv * cells);
  vec2 guv = fract(vUv * cells);

  float causal = step(gid.x, (cells - 1.0 - gid.y) + 1.0);
  float pulse = 0.5 + 0.5 * sin(uTime * 2.6 + gid.x * 1.1 + gid.y * 0.7 + uSeed * 6.28);
  float weight = hash21(gid + uSeed * 19.0) * 0.65 + pulse * 0.35;
  weight = pow(weight, 2.2) * (0.25 + 0.75 * causal);

  float border = smoothstep(0.06, 0.11, guv.x) * smoothstep(0.06, 0.11, guv.y) *
                 smoothstep(0.06, 0.11, 1.0 - guv.x) * smoothstep(0.06, 0.11, 1.0 - guv.y);

  vec3 col = mix(uColorA * 0.25, uColorB * 1.6, weight) * border;
  float edge = max(
    smoothstep(0.46, 0.5, abs(vUv.x - 0.5)),
    smoothstep(0.46, 0.5, abs(vUv.y - 0.5))
  );
  col += uColorB * edge * 0.9;
  float alpha = (0.16 + weight * 0.72 + edge * 0.6) * 0.85;
  gl_FragColor = vec4(col, alpha);
}
`;

// ============================================================================
// SHADER E: CINEMATIC POST-PROCESSING (BLOOM, ANAMORPHIC FLARE, CHROMATIC AB, ACES, GRAIN)
// ============================================================================
export const POST_CINEMA_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uTime;
uniform float uChroma;
uniform float uGlitch;
uniform float uBloomAmt;
uniform float uVignette;
uniform float uFade;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;

  if (uGlitch > 0.001) {
    float band = floor(uv.y * 28.0);
    float g = rand(vec2(band, floor(uTime * 24.0)));
    if (g > 1.0 - uGlitch * 0.35) {
      uv.x += (rand(vec2(band + 13.0, floor(uTime * 30.0))) - 0.5) * 0.065 * uGlitch;
    }
  }

  vec2 dir = uv - 0.5;
  float dist = length(dir);
  vec2 shift = dir * dist * uChroma;

  vec3 col;
  col.r = texture2D(tDiffuse, uv + shift).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - shift).b;

  vec2 px = 1.0 / uRes;
  vec3 bloom = vec3(0.0);
  vec3 streak = vec3(0.0);

  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    vec2 off1 = vec2(cos(a), sin(a)) * px * 5.0;
    vec2 off2 = vec2(cos(a), sin(a)) * px * 13.0;
    vec3 s1 = texture2D(tDiffuse, uv + off1).rgb;
    vec3 s2 = texture2D(tDiffuse, uv + off2).rgb;
    bloom += max(s1 - 0.58, 0.0) * 0.085 + max(s2 - 0.65, 0.0) * 0.055;
  }

  for (int k = -4; k <= 4; k++) {
    if (k == 0) continue;
    vec3 sh = texture2D(tDiffuse, uv + vec2(float(k) * px.x * 11.0, 0.0)).rgb;
    float w = 1.0 - abs(float(k)) / 5.0;
    streak += max(sh - 0.80, 0.0) * w * 0.06;
  }

  col += bloom * uBloomAmt;
  col += streak * vec3(0.65, 0.85, 1.15) * uBloomAmt * 0.62;

  col = aces(col * 1.06);
  col = pow(col, vec3(0.95));

  float vig = 1.0 - dot(dir, dir) * uVignette;
  col *= clamp(vig, 0.26, 1.0);

  float grain = (rand(uv * uRes + fract(uTime * 17.3)) - 0.5) * 0.024;
  col += grain;

  col *= uFade;
  gl_FragColor = vec4(col, 1.0);
}
`;
