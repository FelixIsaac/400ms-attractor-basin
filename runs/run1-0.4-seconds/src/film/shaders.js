/**
 * Custom GLSL Shaders for "0.4 SECONDS" (Refined v2 — Cinema-Grade Contrast & Optical Clarity)
 */

export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.283185 * (c * t + d));
}
`;

// ============================================================================
// 1. SCULPTED LIQUID OBSIDIAN MERCURY / IRIDESCENT FERROFLUID (Acts I & IV)
// ============================================================================
export const MERCURY_VERT = /* glsl */ `
uniform float uTime;
uniform float uSpike;
uniform float uFreq;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisp;

${NOISE_GLSL}

void main() {
  vec3 p = position;
  float n1 = snoise(p * uFreq + vec3(uTime * 0.52, -uTime * 0.38, uTime * 0.31));
  float n2 = snoise(p * uFreq * 2.2 - vec3(uTime * 0.85, uTime * 0.65, -uTime * 0.55));
  float disp = (n1 * 0.72 + n2 * 0.28) * uSpike;
  vDisp = disp;
  vec3 displaced = p + normal * disp;

  float eps = 0.025;
  vec3 t1 = normalize(abs(normal.y) < 0.99 ? cross(normal, vec3(0.0, 1.0, 0.0)) : cross(normal, vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(normal, t1);
  vec3 p1 = p + t1 * eps;
  vec3 p2 = p + t2 * eps;
  float d1 = (snoise(p1 * uFreq + vec3(uTime * 0.52, -uTime * 0.38, uTime * 0.31)) * 0.72
            + snoise(p1 * uFreq * 2.2 - vec3(uTime * 0.85, uTime * 0.65, -uTime * 0.55)) * 0.28) * uSpike;
  float d2 = (snoise(p2 * uFreq + vec3(uTime * 0.52, -uTime * 0.38, uTime * 0.31)) * 0.72
            + snoise(p2 * uFreq * 2.2 - vec3(uTime * 0.85, uTime * 0.65, -uTime * 0.55)) * 0.28) * uSpike;
  vec3 newNorm = normalize(cross((p1 + normal * d1) - displaced, (p2 + normal * d2) - displaced));
  if (dot(newNorm, normal) < 0.0) newNorm = -newNorm;

  vNormal = normalize(mat3(modelMatrix) * newNorm);
  vec4 wp = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const MERCURY_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGlow;
uniform float uHeat;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisp;

${NOISE_GLSL}

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndotv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndotv, 2.8);

  // Synthetic studio chrome environment reflection bands (gives real sculpted liquid-metal look!)
  vec3 R = reflect(-V, N);
  float envBand1 = smoothstep(0.35, 0.92, sin(R.y * 5.0 + R.x * 2.5 + uTime * 0.4) * 0.5 + 0.5);
  float envBand2 = smoothstep(0.65, 0.98, cos(R.x * 4.0 - R.z * 3.0) * 0.5 + 0.5);

  // Rich thin-film interference spectrum (deep cobalt -> gold -> teal -> violet)
  float filmPhase = ndotv * 1.65 + vDisp * 2.8 + uTime * 0.14;
  vec3 iridCalm = cosPalette(
    filmPhase,
    vec3(0.30, 0.36, 0.48),
    vec3(0.36, 0.32, 0.40),
    vec3(1.0, 1.0, 1.0),
    vec3(0.08, 0.28, 0.58)
  );
  vec3 iridHot = cosPalette(
    filmPhase * 2.0 + uTime * 0.55,
    vec3(0.45, 0.18, 0.48),
    vec3(0.45, 0.36, 0.42),
    vec3(1.0, 0.85, 1.0),
    vec3(0.75, 0.12, 0.45)
  );
  vec3 irid = mix(iridCalm, iridHot, uHeat);

  // Crisp studio specular highlights
  vec3 L1 = normalize(vec3(6.0, 10.0, 7.0));
  vec3 L2 = normalize(vec3(-9.0, 3.0, -5.0));
  vec3 L3 = normalize(vec3(0.0, -8.0, 6.0));
  float spec1 = pow(max(dot(N, normalize(L1 + V)), 0.0), 72.0);
  float spec2 = pow(max(dot(N, normalize(L2 + V)), 0.0), 42.0);
  float spec3 = pow(max(dot(N, normalize(L3 + V)), 0.0), 28.0);

  // Deep obsidian liquid metal core so the 3D ripples & iridescence NEVER wash out white!
  vec3 baseObsidian = mix(vec3(0.02, 0.03, 0.065), vec3(0.09, 0.015, 0.12), uHeat);
  vec3 col = baseObsidian;
  col += irid * (0.14 + envBand1 * 0.28 + fresnel * 1.15);
  col += mix(vec3(1.0, 0.86, 0.58), vec3(0.42, 0.92, 1.0), envBand2) * envBand2 * 0.22;
  col += vec3(1.0, 0.94, 0.82) * spec1 * 1.15;
  col += vec3(0.28, 0.86, 1.0) * spec2 * 0.72;
  col += mix(vec3(0.95, 0.72, 0.32), vec3(1.0, 0.22, 0.82), uHeat) * spec3 * 0.55;

  // Inner dot glow only during Act I opening (0-5s)
  col = mix(col, vec3(0.98, 0.97, 1.0) * 1.25, clamp(uGlow * (0.65 + 0.35 * ndotv), 0.0, 1.0));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// 2. BIOLUMINESCENT EMBEDDING OCEAN TERRAIN (ACT II)
// ============================================================================
export const OCEAN_VERT = /* glsl */ `
uniform float uTime;
varying vec3 vWorldPos;
varying float vElev;
varying vec2 vUv;

${NOISE_GLSL}

void main() {
  vUv = uv;
  vec3 p = position;
  float w1 = snoise(vec3(p.x * 0.042, p.z * 0.042 - uTime * 0.18, uTime * 0.09)) * 4.4;
  float w2 = snoise(vec3(p.x * 0.11 + uTime * 0.12, p.z * 0.11, uTime * 0.14)) * 1.6;
  float w3 = sin(p.x * 0.07 + uTime * 0.5) * cos(p.z * 0.06 - uTime * 0.4) * 1.2;
  float elev = w1 + w2 + w3;
  p.y += elev;
  vElev = elev;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const OCEAN_FRAG = /* glsl */ `
uniform float uTime;
uniform float uAlert;
varying vec3 vWorldPos;
varying float vElev;
varying vec2 vUv;

void main() {
  float dist = length(vWorldPos.xz - cameraPosition.xz);
  float fog = smoothstep(26.0, 175.0, dist);

  float contour = abs(fract(vElev * 0.72) - 0.5);
  float contourLine = smoothstep(0.06, 0.012, contour);

  vec2 grid = abs(fract(vWorldPos.xz * 0.24) - 0.5);
  float gridLine = smoothstep(0.032, 0.008, min(grid.x, grid.y));

  float ridge = smoothstep(-2.0, 4.5, vElev);

  vec3 deepIndigo = vec3(0.012, 0.02, 0.065);
  vec3 cyanBiolum = vec3(0.08, 0.82, 0.96);
  vec3 goldPeak   = vec3(1.0, 0.74, 0.30);
  vec3 violetGlow = vec3(0.54, 0.22, 0.92);
  vec3 crimsonAlert = vec3(1.0, 0.12, 0.24);

  vec3 col = mix(deepIndigo, violetGlow * 0.26, ridge);
  col += mix(cyanBiolum, goldPeak, smoothstep(0.45, 0.95, ridge)) * contourLine * 0.78;
  col += cyanBiolum * gridLine * 0.20 * (1.0 - fog * 0.6);

  float wave = sin(length(vWorldPos.xz) * 0.14 - uTime * 1.9);
  col += vec3(0.18, 0.92, 1.0) * smoothstep(0.92, 1.0, wave) * 0.28;

  col = mix(col, col + crimsonAlert * (contourLine * 0.75 + 0.12), uAlert * 0.65);

  vec3 horizonCol = mix(vec3(0.01, 0.016, 0.045), vec3(0.13, 0.018, 0.038), uAlert * 0.6);
  col = mix(col, horizonCol, fog);

  gl_FragColor = vec4(col, 1.0);
}
`;

// ============================================================================
// 3. FULL-SCREEN RAYMARCHING ENGINE (v2: Sculpted Contrast + Gargantua Black Hole)
// ============================================================================
export const RAYMARCH_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const RAYMARCH_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;
uniform float uMode;     // 1.0 = Temp 2.1 Mandelbulb, 2.0 = KIFS Golden Cathedral, 3.0 = Black Hole Singularity
uniform float uIntensity;
uniform float uLocalT;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

vec3 cosPal(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.283185 * (c * t + d));
}

float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = i.x + i.y * 57.0 + 113.0 * i.z;
  return mix(
    mix(mix(fract(sin(n + 0.0) * 43758.5453),   fract(sin(n + 1.0) * 43758.5453),   f.x),
        mix(fract(sin(n + 57.0) * 43758.5453),  fract(sin(n + 58.0) * 43758.5453),  f.x), f.y),
    mix(mix(fract(sin(n + 113.0) * 43758.5453), fract(sin(n + 114.0) * 43758.5453), f.x),
        mix(fract(sin(n + 170.0) * 43758.5453), fract(sin(n + 171.0) * 43758.5453), f.x), f.y), f.z
  );
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.06 + vec3(13.1, 7.7, 5.3);
    a *= 0.5;
  }
  return v;
}

// --- MODE 1: SCULPTED MANDELBULB FRACTAL (TEMPERATURE 2.1 MELTDOWN) ---
vec2 deMandelbulb(vec3 p) {
  vec3 z = p;
  float dr = 1.0;
  float r = 0.0;
  float trap = 1e5;
  float power = 7.5 + 2.2 * sin(uLocalT * 1.15);
  for (int i = 0; i < 8; i++) {
    r = length(z);
    if (r > 2.2) break;
    trap = min(trap, r);
    float theta = acos(clamp(z.z / max(r, 1e-5), -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    float zr = pow(r, power);
    theta *= power;
    phi *= power;
    z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
    z += p;
  }
  return vec2(0.5 * log(max(r, 1e-5)) * r / max(dr, 1e-5), trap);
}

vec3 renderMandelbulb(vec2 uv) {
  float t = uLocalT;
  vec3 ro = vec3(sin(t * 0.55) * 2.75, cos(t * 0.42) * 0.95, cos(t * 0.55) * 2.75);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.5 * ww);

  float dist = 0.0;
  float trap = 0.0;
  float glow = 0.0;
  int steps = 0;
  bool hit = false;

  for (int i = 0; i < 80; i++) {
    steps = i;
    vec3 p = ro + rd * dist;
    p.xz *= rot(t * 0.42);
    p.xy *= rot(t * 0.24);
    vec2 res = deMandelbulb(p);
    float d = res.x;
    trap = res.y;
    glow += exp(-d * 22.0) * 0.011;
    if (d < 0.0018) {
      hit = true;
      break;
    }
    if (dist > 7.0) break;
    dist += d * 0.82;
  }

  // Deep velvety ultraviolet-obsidian void (high contrast, zero white washout!)
  vec3 col = mix(vec3(0.03, 0.008, 0.07), vec3(0.11, 0.02, 0.16), exp(-length(uv) * 1.8));

  if (hit) {
    vec3 p = ro + rd * dist;
    p.xz *= rot(t * 0.42);
    p.xy *= rot(t * 0.24);
    vec2 e = vec2(0.0018, 0.0);
    vec3 n = normalize(vec3(
      deMandelbulb(p + e.xyy).x - deMandelbulb(p - e.xyy).x,
      deMandelbulb(p + e.yxy).x - deMandelbulb(p - e.yxy).x,
      deMandelbulb(p + e.yyx).x - deMandelbulb(p - e.yyx).x
    ));
    float ao = clamp(1.0 - float(steps) / 68.0, 0.12, 1.0);
    vec3 L1 = normalize(vec3(0.8, 0.7, 0.5));
    vec3 L2 = normalize(vec3(-0.7, -0.4, 0.6));
    float diff1 = max(dot(n, L1), 0.0);
    float diff2 = max(dot(n, L2), 0.0);
    float spec = pow(max(dot(reflect(-L1, n), -rd), 0.0), 36.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.2);

    vec3 surf = cosPal(trap * 2.8 + t * 0.25, vec3(0.32, 0.12, 0.42), vec3(0.38, 0.28, 0.36), vec3(1.0, 0.9, 1.0), vec3(0.05, 0.25, 0.65));
    col = surf * (0.12 + diff1 * 0.85 + diff2 * 0.35) * ao;
    col += vec3(1.0, 0.78, 0.35) * spec * 0.95;
    col += vec3(0.95, 0.18, 1.0) * fres * 0.85;
  }

  col += vec3(0.82, 0.18, 0.95) * min(glow, 0.55);
  return col;
}

// --- MODE 2: MONUMENTAL OBSIDIAN & GOLD KIFS CATHEDRAL (ACT V-A) ---
vec2 deCathedral(vec3 p) {
  p.xy *= rot(p.z * 0.048 + sin(uLocalT * 0.16) * 0.18);
  vec3 q = p;
  q.z = mod(q.z + 3.2, 6.4) - 3.2;

  // Wide soaring central nave corridor
  float tunnel = -(length(p.xy) - 2.45);

  // Crisp architectural box-fold KIFS (Meneger / Cathedral vault geometry)
  float scale = 1.0;
  float trap = 1e5;
  vec3 z = q;
  for (int i = 0; i < 6; i++) {
    z.xy = abs(z.xy) - vec2(1.52, 1.42);
    z.xy *= rot(0.34 + 0.04 * sin(uLocalT * 0.2));
    if (z.x < z.y) z.xy = z.yx;
    z.xz *= rot(0.18);
    z = z * 1.48 - vec3(1.12, 0.88, 0.76);
    scale *= 1.48;
    trap = min(trap, abs(z.x) + abs(z.y));
  }

  vec3 b = abs(z) - vec3(0.95, 0.42, 0.82);
  float dBox = (length(max(b, 0.0)) + min(max(b.x, max(b.y, b.z)), 0.0)) / scale;
  float d = max(dBox, tunnel);
  return vec2(d, trap);
}

vec3 renderCathedral(vec2 uv) {
  float t = uLocalT;
  vec3 ro = vec3(sin(t * 0.22) * 0.48, cos(t * 0.17) * 0.34, t * 2.2);
  vec3 look = ro + vec3(sin(t * 0.16) * 0.28, cos(t * 0.14) * 0.15, 3.2);
  vec3 ww = normalize(look - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.48 * ww);

  float dist = 0.0;
  float trap = 0.0;
  float volGlow = 0.0;
  int steps = 0;
  bool hit = false;

  for (int i = 0; i < 96; i++) {
    steps = i;
    vec3 p = ro + rd * dist;
    vec2 res = deCathedral(p);
    float d = res.x;
    trap = res.y;
    float shaft = sin(p.z * 0.7 + uLocalT * 0.65) * 0.5 + 0.5;
    volGlow += exp(-abs(d) * 9.5) * (0.0055 + 0.006 * shaft);
    if (d < 0.002) {
      hit = true;
      break;
    }
    if (dist > 36.0) break;
    dist += d * 0.75;
  }

  // Deep midnight-indigo architectural atmosphere with warm golden altar horizon
  vec3 hazeCol = mix(vec3(0.015, 0.022, 0.055), vec3(0.22, 0.12, 0.04), exp(-length(uv) * 2.4));
  vec3 col = hazeCol;

  if (hit) {
    vec3 p = ro + rd * dist;
    vec2 e = vec2(0.0025, 0.0);
    vec3 n = normalize(vec3(
      deCathedral(p + e.xyy).x - deCathedral(p - e.xyy).x,
      deCathedral(p + e.yxy).x - deCathedral(p - e.yxy).x,
      deCathedral(p + e.yyx).x - deCathedral(p - e.yyx).x
    ));

    float ao = clamp(1.0 - float(steps) / 86.0, 0.12, 1.0);
    vec3 lightPos = ro + vec3(0.0, 0.6, 7.5);
    vec3 L = normalize(lightPos - p);
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), -rd), 0.0), 48.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.6);

    // Carved dark obsidian stone inlaid with sharp brushed-gold & cyan trim
    float goldMask = smoothstep(0.55, 0.85, sin(trap * 4.2 + p.z * 0.35) * 0.5 + 0.5);
    vec3 obsidian = vec3(0.022, 0.028, 0.052);
    vec3 gold = vec3(0.88, 0.64, 0.24);
    vec3 albedo = mix(obsidian, gold, goldMask * 0.82);

    col = albedo * (0.10 + diff * 1.25) * ao;
    col += mix(vec3(1.0, 0.82, 0.45), vec3(0.32, 0.85, 1.0), 1.0 - goldMask) * spec * 1.15 * ao;
    col += vec3(0.28, 0.72, 1.0) * fres * 0.38;

    // Fine architectural luminous gold ribs
    float rib = smoothstep(0.955, 0.995, abs(sin(p.z * 1.5708)) * cos(trap * 5.0));
    col += vec3(1.0, 0.78, 0.36) * rib * 1.05;

    float fog = 1.0 - exp(-dist * dist * 0.0038);
    col = mix(col, hazeCol, fog);
  }

  float vanish = exp(-length(uv) * 3.8);
  col += vec3(1.0, 0.74, 0.36) * min(volGlow, 0.42);
  col += vec3(1.0, 0.82, 0.52) * vanish * 0.38;
  return col;
}

// --- MODE 3: GARGANTUA-STYLE RELATIVISTIC BLACK HOLE (ACT V-B) ---
vec3 renderBlackHole(vec2 uv) {
  float t = uLocalT;
  // Pull back nicely so the entire iconic Event Horizon + Einstein Ring + Accretion Disk frames heroically!
  float orbit = t * 0.14 - 0.6;
  float camDist = 13.8 - 1.5 * sin(t * 0.18);
  vec3 ro = vec3(sin(orbit) * camDist, 2.35 + 0.35 * sin(t * 0.24), cos(orbit) * camDist);
  vec3 ww = normalize(-ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  // Subtle dramatic Dutch tilt (12 deg) like Interstellar
  float tilt = 0.21;
  vec2 tuv = uv * rot(tilt);
  vec3 rd = normalize(tuv.x * uu + tuv.y * vv + 1.65 * ww);

  vec3 pos = ro;
  vec3 dir = rd;

  vec3 accCol = vec3(0.0);
  float rs = 1.15;
  bool captured = false;

  for (int i = 0; i < 130; i++) {
    float r = length(pos);
    if (r < rs) {
      captured = true;
      break;
    }
    if (r > 28.0) break;

    // Gravitational photon deflection around Schwarzschild singularity
    float grav = 1.72 * rs / (r * r * r + 0.008);
    dir = normalize(dir - pos * grav * 0.145);

    float stepLen = clamp(r * 0.068, 0.055, 0.34);
    vec3 nextPos = pos + dir * stepLen;

    // Relativistic Accretion Disk (equatorial plane y ≈ 0, radii 1.65 .. 6.8)
    float diskY = abs(pos.y);
    if (diskY < 0.38 && r > 1.55 && r < 7.0) {
      float angle = atan(pos.z, pos.x);
      float kepler = angle + t * (2.2 / pow(r, 0.72));
      float radialFade = smoothstep(1.55, 2.15, r) * smoothstep(7.0, 3.0, r);
      float vertFade = exp(-diskY * diskY * 36.0);

      // Sharp swirling relativistic plasma bands & turbulent filaments
      float bands = sin(r * 7.5 - kepler * 2.0) * 0.5 + 0.5;
      float f1 = fbm(vec3(cos(kepler) * 2.4, sin(kepler) * 2.4, r * 1.65 - t * 0.32));
      float f2 = fbm(vec3(pos.x * 1.6, pos.z * 1.6, t * 0.22));
      float filament = pow(clamp(f1 * 0.72 + bands * 0.45, 0.0, 1.0), 1.65);
      float density = radialFade * vertFade * filament * 0.72;

      // Relativistic Doppler beaming
      vec3 vel = normalize(vec3(-pos.z, 0.0, pos.x));
      float doppler = clamp(1.0 + 0.52 * dot(vel, -dir), 0.48, 1.65);

      // Iconic Gargantua palette: deep crimson ember -> burnt gold -> incandescent amber-white -> sapphire edge
      float heat = clamp((6.4 - r) / 4.6, 0.0, 1.0);
      vec3 plasma = mix(vec3(0.68, 0.16, 0.04), vec3(0.98, 0.56, 0.14), smoothstep(0.0, 0.55, heat));
      plasma = mix(plasma, vec3(1.0, 0.90, 0.68), smoothstep(0.55, 0.92, heat) * (0.65 + 0.35 * f2));
      plasma = mix(plasma, vec3(0.62, 0.88, 1.0), smoothstep(0.88, 1.0, heat) * 0.55);

      accCol += plasma * density * doppler * stepLen * 0.92;
    }

    // Razor-sharp glowing golden-sapphire Einstein photon ring hugging r ≈ 1.48*rs
    float photonRing = exp(-abs(r - rs * 1.46) * 18.0);
    accCol += vec3(1.0, 0.84, 0.58) * photonRing * 0.011 * stepLen;

    pos = nextPos;
  }

  vec3 col = vec3(0.0);
  if (!captured) {
    // Crisp lensed deep-space starfield + faint indigo/amber nebula
    vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0)));
    vec2 cell = floor(sph * 64.0);
    vec2 f = fract(sph * 64.0) - 0.5;
    float h = hash21(cell);
    if (h > 0.962) {
      float star = exp(-dot(f, f) * 70.0) * (0.55 + 0.45 * sin(t * 2.2 + h * 100.0));
      col += mix(vec3(0.68, 0.85, 1.0), vec3(1.0, 0.82, 0.58), fract(h * 19.7)) * star * 1.15;
    }
    float neb = fbm(dir * 3.8 + vec3(0.0, t * 0.02, 0.0));
    col += mix(vec3(0.008, 0.014, 0.038), vec3(0.09, 0.04, 0.12), neb) * 0.38;
  }

  col += accCol;
  // Filmic compression preserving fiery amber/gold highlights without blowing to flat white
  col = col / (1.0 + col * 0.68);
  return col;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;
  vec3 col = vec3(0.0);

  if (uMode < 1.5) {
    col = renderMandelbulb(uv);
  } else if (uMode < 2.5) {
    col = renderCathedral(uv);
  } else {
    col = renderBlackHole(uv);
  }

  gl_FragColor = vec4(col * uIntensity, uIntensity);
}
`;

// ============================================================================
// 4. CINEMATIC POST-PROCESSING SHADER (Clean Optical Grade — Zero Text Ghosting!)
// ============================================================================
export const CINEMATIC_POST_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uChromatic: { value: 0.0008 },
    uGrain: { value: 0.022 },
    uFlash: { value: 0.0 },
    uGlitch: { value: 0.0 },
    uVignette: { value: 0.38 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uChromatic;
    uniform float uGrain;
    uniform float uFlash;
    uniform float uGlitch;
    uniform float uVignette;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;

      // Scanline glitch displacement strictly during Temperature 2.1 spike
      if (uGlitch > 0.001) {
        float band = floor(uv.y * 44.0);
        float rnd = hash(vec2(band, floor(uTime * 18.0)));
        if (rnd > 0.80) {
          uv.x += (rnd - 0.90) * 0.08 * uGlitch;
        }
      }

      // Subtle optical edge-weighted chromatic aberration (crisp at center, cinematic at edges)
      vec2 dir = uv - 0.5;
      float r2 = dot(dir, dir);
      vec2 offset = dir * (uChromatic * (0.15 + r2 * 2.6));

      float r = texture2D(tDiffuse, uv + offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offset).b;
      vec3 col = vec3(r, g, b);

      // Filmic ACES-inspired contrast curve
      col = max(col, 0.0);
      col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);

      // Gentle cinematic vignette
      float vig = smoothstep(0.96, 0.24, length(dir * vec2(1.16, 1.0)));
      col *= mix(1.0 - uVignette, 1.0, vig);

      // Fine deterministic 35mm film grain
      float grain = (hash(uv * vec2(1920.0, 1080.0) + fract(uTime * 13.37)) - 0.5) * uGrain;
      col += grain;

      // Smooth act-transition prism flash
      col = mix(col, vec3(0.96, 0.94, 1.0), clamp(uFlash, 0.0, 0.88));

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};
