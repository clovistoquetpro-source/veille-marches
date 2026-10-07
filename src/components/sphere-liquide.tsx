"use client";

/**
 * Sphère liquide en WebGL 2 (composant « Liquid Sphere » d'Originkit, choisi par clo pour le fond des
 * pages). Adaptations : taille fluide (plus de largeur minimale), pause quand la sphère est hors de
 * l'écran ou l'onglet caché, une seule image fixe si l'utilisateur limite les animations, apparition
 * en fondu à la première image, et pas de rotation au doigt sur mobile pour laisser la page défiler.
 */
import { useEffect, useRef } from "react";

type Vec3 = [number, number, number];

/** Les neuf formes du composant d'origine. */
export const FORMES = ["wave", "ember", "mint", "frost", "sky", "storm", "coral", "ice", "magenta"] as const;
export type Forme = (typeof FORMES)[number];

type Props = {
  forme?: Forme;
  /** Couleur du verre, en hexadécimal. */
  teinte?: string;
  /** Couleur du cœur : blanc = transparent, sombre = opaque. */
  coeur?: string;
  reflet?: string;
  /** Vitesse de l'ondulation, 50 = normale. */
  vitesse?: number;
  ondulations?: number;
  amplitude?: number;
  className?: string;
};

const MAX_DT = 0.05;
const MAX_DPR = 1.5;
const SURVOL = 1.23;
const PORTEE = 0.92;
const SENSIBILITE = 0.4 * 1.77 * (Math.PI / 180);
const AMORTI = 2.2;
const ROTATION_MAX = 12;
const VITESSE_SURVOL = 8;

function hex(couleur: string): Vec3 {
  const h = couleur.replace("#", "");
  const long = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(long, 16);
  if (Number.isNaN(n)) return [1, 1, 1];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const VERT = `#version 300 es
precision highp float;
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uSize;
uniform float uTime;
uniform float uStyle;
uniform float uWaveFreq;
uniform float uAmplitude;
uniform vec3 uTint;
uniform vec3 uCore;
uniform vec3 uHighlight;
uniform vec3 uPointer;
uniform float uHover;
uniform float uReach;
uniform vec3 uClick;
uniform mat3 uRot;

const float HOVER_DEPTH = 1.6;
const float HOVER_CLARITY = 0.55;
const float HOVER_GLINT = 1.5;
const float CLICK_DEPTH = 1.3;
const float CLICK_CLARITY = 0.6;
const float CLICK_GLINT = 1.8;
const float CLICK_SPEED = 1.4;
const float CLICK_WIDTH = 0.30;
const float CLICK_LIFE = 1.6;

out vec4 fragColor;

vec2 goSph(vec3 ro, vec3 rd, float rad) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - rad * rad;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  float hs = sqrt(h);
  return vec2(-b - hs, -b + hs);
}

float goWaveDisp(vec3 p, float t, float fr, float amp, int style) {
  float disp = 0.0;
  if (style == 1) {
    vec3 q = normalize(p) * 3.0;
    float uu = q.x * 0.90 + q.y * 0.45 + q.z * 0.25;
    uu = uu + 0.35 * sin(q.y * 1.5 + t * 0.50);
    uu = uu + 0.18 * sin(q.z * 2.1 - t * 0.55);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.30 * sin(q.x * 1.6 - t * 0.55);
    vv = vv + 0.16 * sin(q.y * 2.0 + t * 0.60);
    disp = 0.040 * sin(uu * 5.5 * fr) + 0.032 * sin(vv * 5.0 * fr);
  } else if (style == 2) {
    vec3 q = normalize(p) * 4.0;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.25 * sin(q.y * 1.1 + t * 0.28);
    uu = uu + 0.15 * sin(q.z * 1.9 - t * 0.30);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.22 * sin(q.x * 1.3 - t * 0.30);
    vv = vv + 0.13 * sin(q.y * 2.0 + t * 0.32);
    disp = 0.026 * sin(uu * 9.0 * fr) + 0.022 * sin(vv * 8.5 * fr);
  } else if (style == 3) {
    vec3 q = normalize(p) * 3.5;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.30 * sin(q.y * 1.2 + t * 0.20);
    uu = uu + 0.18 * sin(q.z * 2.1 - t * 0.25);
    uu = uu + 0.10 * sin(q.y * 3.5 + q.z * 2.8 + t * 0.18);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.28 * sin(q.x * 1.3 - t * 0.22);
    vv = vv + 0.16 * sin(q.y * 2.4 + t * 0.30);
    vv = vv + 0.09 * sin(q.x * 3.2 + q.z * 2.5 - t * 0.20);
    disp = 0.038 * sin(uu * 7.5 * fr) + 0.030 * sin(vv * 7.0 * fr);
  } else if (style == 4) {
    vec3 q = normalize(p) * 3.0;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.28 * sin(q.y * 1.0 + t * 0.18);
    uu = uu + 0.14 * sin(q.z * 1.6 - t * 0.22);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.25 * sin(q.x * 1.1 - t * 0.20);
    vv = vv + 0.12 * sin(q.y * 1.7 + t * 0.24);
    disp = 0.022 * sin(uu * 6.5 * fr) + 0.018 * sin(vv * 6.0 * fr);
  } else if (style == 5) {
    vec3 q = normalize(p) * 3.5;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.32 * sin(q.y * 1.6 + t * 0.50);
    uu = uu + 0.20 * sin(q.z * 2.3 - t * 0.60);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.28 * sin(q.x * 1.7 + t * 0.55);
    vv = vv + 0.18 * sin(q.y * 2.4 - t * 0.70);
    disp = 0.042 * sin(uu * 6.5 * fr) + 0.034 * sin(vv * 6.0 * fr) + 0.018 * sin((uu + vv) * 8.5 * fr + t * 0.4);
  } else if (style == 6) {
    vec3 q = normalize(p) * 3.3;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.32 * sin(q.y * 1.2 + t * 0.30);
    uu = uu + 0.18 * sin(q.z * 1.8 - t * 0.28);
    float vv = -q.x * 0.55 + q.z * 0.65 + q.y * 0.40;
    vv = vv + 0.28 * sin(q.x * 1.3 + t * 0.35);
    vv = vv + 0.16 * sin(q.y * 2.0 - t * 0.25);
    disp = 0.040 * sin(uu * 6.5 * fr) + 0.034 * sin(vv * 6.0 * fr);
  } else if (style == 7) {
    vec3 q = normalize(p) * 4.0;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.22 * sin(q.y * 1.4 + t * 0.22);
    uu = uu + 0.13 * sin(q.z * 2.3 - t * 0.18);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.20 * sin(q.x * 1.5 - t * 0.22);
    vv = vv + 0.12 * sin(q.y * 2.5 + t * 0.20);
    disp = 0.030 * sin(uu * 10.0 * fr) + 0.025 * sin(vv * 9.5 * fr);
  } else if (style == 8) {
    vec3 q = normalize(p) * 4.0;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.25 * sin(q.y * 1.4 + t * 0.55);
    uu = uu + 0.14 * sin(q.z * 2.0 - t * 0.45);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.22 * sin(q.x * 1.5 - t * 0.50);
    vv = vv + 0.13 * sin(q.y * 2.2 + t * 0.45);
    disp = 0.030 * sin(uu * 9.5 * fr + t * 0.45) + 0.025 * sin(vv * 9.0 * fr - t * 0.40);
  } else {
    vec3 q = normalize(p) * 3.5;
    float uu = q.x * 0.85 + q.y * 0.50 + q.z * 0.20;
    uu = uu + 0.32 * sin(q.y * 1.0 + t * 0.30);
    uu = uu + 0.22 * sin(q.z * 1.3 - t * 0.35);
    uu = uu + 0.14 * sin(q.y * 1.9 + q.z * 1.6 + t * 0.25);
    float vv = q.z * 0.70 + q.x * 0.55 + q.y * 0.45;
    vv = vv + 0.30 * sin(q.x * 1.2 - t * 0.32);
    vv = vv + 0.20 * sin(q.y * 1.5 + t * 0.45);
    vv = vv + 0.14 * sin(q.z * 1.9 + q.x * 1.6 + t * 0.28);
    disp = 0.042 * sin(uu * 7.0 * fr) + 0.034 * sin(vv * 6.5 * fr);
  }
  return disp * amp;
}

float goMap(vec3 p, float t, float fr, float amp, int style) {
  return length(p) - 1.0 - goWaveDisp(p, t, fr, amp, style);
}

float goAmpSum(int style) {
  if (style == 1) return 0.072;
  if (style == 2) return 0.048;
  if (style == 3) return 0.068;
  if (style == 4) return 0.040;
  if (style == 5) return 0.094;
  if (style == 6) return 0.074;
  if (style == 7) return 0.055;
  if (style == 8) return 0.055;
  return 0.076;
}

float goLip(int style) {
  if (style == 1) return 2.5;
  if (style == 2) return 3.0;
  if (style == 3) return 2.8;
  if (style == 4) return 2.2;
  if (style == 5) return 3.0;
  if (style == 6) return 2.5;
  if (style == 7) return 3.5;
  if (style == 8) return 3.5;
  return 2.0;
}

vec3 goLight1(int style) {
  if (style == 1) return normalize(vec3(0.55, 0.80, 0.55));
  if (style == 2) return normalize(vec3(-0.45, 0.85, 0.55));
  if (style >= 6) return normalize(vec3(-0.50, 0.85, 0.55));
  return normalize(vec3(-0.55, 0.85, 0.55));
}

vec3 goLight2(int style) {
  if (style == 1) return normalize(vec3(-0.40, 0.30, 0.80));
  if (style == 2 || style == 6) return normalize(vec3(0.50, 0.30, 0.75));
  if (style >= 7) return normalize(vec3(0.45, 0.30, 0.80));
  return normalize(vec3(0.40, 0.30, 0.80));
}

vec3 goNormal(vec3 p, float t, float e, float fr, float amp, int style) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * goMap(p + k.xyy * e, t, fr, amp, style) +
    k.yyx * goMap(p + k.yyx * e, t, fr, amp, style) +
    k.yxy * goMap(p + k.yxy * e, t, fr, amp, style) +
    k.xxx * goMap(p + k.xxx * e, t, fr, amp, style)
  );
}

void main() {
  vec2 size = uSize;
  vec2 pos = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y);
  vec2 uv = (pos - 0.5 * size) / min(size.x, size.y) * 2.0;

  int style = int(uStyle);
  float fr = uWaveFreq;
  float t = uTime;
  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.8));

  float ampSum = goAmpSum(style);
  float rDial = 1.0 + ampSum * uAmplitude + 0.04;
  float orbUv = 1.8 * rDial / sqrt(max(9.0 - rDial * rDial, 1e-4));
  float reach = max(uReach * orbUv, 1e-4);
  float w = uPointer.z * (1.0 - smoothstep(0.0, reach, length(uv - uPointer.xy)));

  float clickAge = max(uClick.z, 0.0);
  float ringDist = length(uv - uClick.xy) - clickAge * CLICK_SPEED;
  float ring = exp(-(ringDist * ringDist) / (CLICK_WIDTH * CLICK_WIDTH)) * exp(-clickAge / CLICK_LIFE);

  float amp = uAmplitude * (1.0 + HOVER_DEPTH * uHover * w + CLICK_DEPTH * ring);
  float boundRad = 1.0 + ampSum * amp + 0.04;
  float lip = goLip(style) * max(1.0, fr) * max(1.0, amp);

  mat3 rInv = transpose(uRot);
  vec3 roO = rInv * ro;
  vec3 rdO = rInv * rd;
  vec2 hh = goSph(roO, rdO, boundRad);
  if (hh.x < 0.0) { fragColor = vec4(0.0); return; }

  float tHit = max(hh.x - 0.02, 0.0);
  float tMax = hh.y + 0.02;
  bool hit = false;
  vec3 pHit = vec3(0.0);
  for (int i = 0; i < 96; i++) {
    vec3 p = roO + rdO * tHit;
    float d = goMap(p, t, fr, amp, style) / lip;
    if (d < 0.0004) { hit = true; pHit = p; break; }
    tHit = tHit + d * 0.85;
    if (tHit > tMax) break;
  }
  if (!hit) { fragColor = vec4(0.0); return; }

  float chord = hh.y - hh.x;
  float graze = clamp(1.0 - chord / (2.5 * boundRad), 0.0, 1.0);
  float nEps = mix(0.0015, 0.0070, graze);
  vec3 n = goNormal(pHit, t, nEps, fr, amp, style);
  vec3 v = -rdO;
  float ndv = clamp(dot(n, v), 0.0, 1.0);

  vec3 L1 = rInv * goLight1(style);
  vec3 L2 = rInv * goLight2(style);
  vec3 baseTint = uTint * 2.0;
  vec3 absorption = 4.5 * (1.0 - uCore) * clamp(1.0 - HOVER_CLARITY * uHover * w - CLICK_CLARITY * ring, 0.0, 1.0);

  vec3 rIn = refract(rdO, n, 1.0 / 1.45);
  float tBack = 0.01;
  vec3 pBack = pHit + rIn * tBack;
  for (int i = 0; i < 32; i++) {
    pBack = pHit + rIn * tBack;
    float d = goMap(pBack, t, fr, amp, style);
    if (d > -0.0008) break;
    tBack = tBack + (-d) / lip * 0.85;
    if (tBack > 3.5) break;
  }
  vec3 transmit = exp(-absorption * tBack);
  vec3 nBack = goNormal(pBack, t, nEps, fr, amp, style);
  float bDiff = (dot(nBack, L1) * 0.5 + 0.5) * 0.65 + (dot(nBack, L2) * 0.5 + 0.5) * 0.40;
  vec3 interior = baseTint * (0.20 + bDiff) * transmit;
  interior = interior + baseTint * pow(1.0 - ndv, 3.5) * 0.55;

  vec3 H1 = normalize(L1 + v);
  vec3 H2 = normalize(L2 + v);
  float spec1 = pow(clamp(dot(n, H1), 0.0, 1.0), mix(380.0, 90.0, graze));
  float spec2 = pow(clamp(dot(n, H2), 0.0, 1.0), mix(240.0, 60.0, graze));
  float gloss = pow(clamp(dot(n, H1), 0.0, 1.0), 40.0) * 0.10;

  vec3 hl = uHighlight * (1.0 + HOVER_GLINT * uHover * w + CLICK_GLINT * ring);
  vec3 col = interior + hl * spec1 * 6.5 + hl * spec2 * 3.0 + hl * gloss;
  col = col / (1.0 + col * 0.65);
  fragColor = vec4(col, 1.0);
}
`;

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v;
}

export function SphereLiquide({
  forme = "mint",
  teinte = "#02082E",
  coeur = "#FFFFFF",
  reflet = "#FFFFFF",
  vitesse = 50,
  ondulations = 125,
  amplitude = 160,
  className,
}: Props) {
  const toile = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = toile.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", { alpha: true, antialias: false, premultipliedAlpha: true });
    // sans WebGL 2, le dégradé de secours du conteneur reste seul visible
    if (!gl) return;

    const compiler = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader;
      console.error("Sphère liquide :", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    };
    const vs = compiler(gl.VERTEX_SHADER, VERT);
    const fs = compiler(gl.FRAGMENT_SHADER, FRAG);
    const programme = gl.createProgram();
    if (!vs || !fs || !programme) return;
    gl.attachShader(programme, vs);
    gl.attachShader(programme, fs);
    gl.linkProgram(programme);
    if (!gl.getProgramParameter(programme, gl.LINK_STATUS)) return;
    gl.useProgram(programme);
    gl.bindVertexArray(gl.createVertexArray());

    const u = (nom: string) => gl.getUniformLocation(programme, nom);
    const U = {
      size: u("uSize"), time: u("uTime"), style: u("uStyle"), waveFreq: u("uWaveFreq"),
      amplitude: u("uAmplitude"), tint: u("uTint"), core: u("uCore"), highlight: u("uHighlight"),
      pointer: u("uPointer"), hover: u("uHover"), reach: u("uReach"), click: u("uClick"), rot: u("uRot"),
    };
    const [tr, tg, tb] = hex(teinte);
    const [cr, cg, cb] = hex(coeur);
    const [hr, hg, hb] = hex(reflet);
    gl.uniform1f(U.style, FORMES.indexOf(forme));
    gl.uniform1f(U.waveFreq, clamp(ondulations, 1, 400) / 100);
    gl.uniform1f(U.amplitude, Math.max(0, amplitude) / 100);
    gl.uniform3f(U.tint, tr, tg, tb);
    gl.uniform3f(U.core, cr, cg, cb);
    gl.uniform3f(U.highlight, hr, hg, hb);
    gl.uniform1f(U.hover, SURVOL);
    gl.uniform1f(U.reach, PORTEE);

    let bw = 1;
    let bh = 1;
    const redimensionner = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      bw = Math.max(1, Math.round((canvas.clientWidth || 1) * dpr));
      bh = Math.max(1, Math.round((canvas.clientHeight || 1) * dpr));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      gl.viewport(0, 0, bw, bh);
    };
    redimensionner();
    // changer la taille du canevas l'efface : on redessine au moins une image (utile sans animation)
    const taille = new ResizeObserver(() => {
      redimensionner();
      if (!image) image = requestAnimationFrame(dessiner);
    });
    taille.observe(canvas);

    const pointeur = { fx: 0.5, fy: 0.5, presence: 0, cible: 0 };
    const clic = { fx: 0.5, fy: 0.5, debut: -1e6 };
    const rotation = { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0 };
    let glisse = false;
    let dernierX = 0;
    let dernierY = 0;
    let dernierMouvement = performance.now();

    const bouger = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      pointeur.fx = (e.clientX - r.left) / r.width;
      pointeur.fy = (e.clientY - r.top) / r.height;
      const dedans = pointeur.fx >= 0 && pointeur.fx <= 1 && pointeur.fy >= 0 && pointeur.fy <= 1;
      pointeur.cible = dedans || glisse ? 1 : 0;
      if (!glisse) return;
      const maintenant = performance.now();
      const dt = Math.max((maintenant - dernierMouvement) / 1000, 1 / 240);
      dernierMouvement = maintenant;
      const dx = (e.clientX - dernierX) * SENSIBILITE;
      const dy = (e.clientY - dernierY) * SENSIBILITE;
      dernierX = e.clientX;
      dernierY = e.clientY;
      rotation.yaw += dx;
      rotation.pitch += dy;
      rotation.vYaw = clamp(dx / dt, -ROTATION_MAX, ROTATION_MAX);
      rotation.vPitch = clamp(dy / dt, -ROTATION_MAX, ROTATION_MAX);
    };
    const appuyer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        clic.fx = (e.clientX - r.left) / r.width;
        clic.fy = (e.clientY - r.top) / r.height;
        clic.debut = performance.now();
      }
      // au doigt, on garde l'onde du toucher mais pas la rotation : la page doit pouvoir défiler
      if (e.pointerType === "touch") return;
      glisse = true;
      dernierX = e.clientX;
      dernierY = e.clientY;
      dernierMouvement = performance.now();
      rotation.vYaw = 0;
      rotation.vPitch = 0;
    };
    const relacher = () => { glisse = false; };
    const sortir = () => { if (!glisse) pointeur.cible = 0; };
    canvas.addEventListener("pointerdown", appuyer);
    canvas.addEventListener("pointerleave", sortir);
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", relacher);
    window.addEventListener("pointercancel", relacher);

    const animationsReduites = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    const vue = new IntersectionObserver(([entree]) => {
      visible = entree.isIntersecting;
      if (visible) relancer();
    });
    vue.observe(canvas);
    const onglet = () => { if (!document.hidden) relancer(); };
    document.addEventListener("visibilitychange", onglet);

    let image = 0;
    let precedent = performance.now();
    let horloge = 0;
    let premiere = true;

    const dessiner = (maintenant: number) => {
      image = 0;
      const dt = clamp((maintenant - precedent) / 1000, 0, MAX_DT);
      precedent = maintenant;
      horloge = (horloge + dt * (vitesse / 50)) % 100000;
      pointeur.presence += (pointeur.cible - pointeur.presence) * (1 - Math.exp(-dt * VITESSE_SURVOL));
      if (!glisse) {
        rotation.yaw += rotation.vYaw * dt;
        rotation.pitch += rotation.vPitch * dt;
        const amorti = Math.exp(-dt * AMORTI);
        rotation.vYaw *= amorti;
        rotation.vPitch *= amorti;
      }
      const cy = Math.cos(rotation.yaw);
      const sy = Math.sin(rotation.yaw);
      const cp = Math.cos(rotation.pitch);
      const sp = Math.sin(rotation.pitch);
      const cote = Math.min(bw, bh);
      gl.uniform2f(U.size, bw, bh);
      gl.uniform1f(U.time, horloge);
      gl.uniform3f(U.pointer, ((pointeur.fx - 0.5) * bw * 2) / cote, ((pointeur.fy - 0.5) * bh * 2) / cote, pointeur.presence);
      gl.uniform3f(U.click, ((clic.fx - 0.5) * bw * 2) / cote, ((clic.fy - 0.5) * bh * 2) / cote, (maintenant - clic.debut) / 1000);
      gl.uniformMatrix3fv(U.rot, false, new Float32Array([cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp]));
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (premiere) {
        premiere = false;
        canvas.dataset.prete = "oui";
      }
      if (!animationsReduites && visible && !document.hidden) image = requestAnimationFrame(dessiner);
    };
    function relancer() {
      if (image || animationsReduites) return;
      precedent = performance.now();
      image = requestAnimationFrame(dessiner);
    }
    image = requestAnimationFrame(dessiner);

    return () => {
      cancelAnimationFrame(image);
      taille.disconnect();
      vue.disconnect();
      document.removeEventListener("visibilitychange", onglet);
      canvas.removeEventListener("pointerdown", appuyer);
      canvas.removeEventListener("pointerleave", sortir);
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", relacher);
      window.removeEventListener("pointercancel", relacher);
    };
  }, [forme, teinte, coeur, reflet, vitesse, ondulations, amplitude]);

  return (
    <canvas
      ref={toile}
      aria-hidden="true"
      className={`sphere-liquide ${className ?? ""}`}
      style={{ touchAction: "pan-y", cursor: "grab" }}
    />
  );
}
