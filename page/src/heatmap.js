/**
 * ヒートマップ(インフォグラフィック): 「デザイン」「エンタメ」「アート」の3点から色が広がり、混ざり、流れる
 *
 * ステップ(スライドの data-step の進行と連動。slide.dataset.step = 0..3)
 *   0 → ステージ1: 3つの点だけ(位置は固定。わずかに wiggle)
 *   1 → ステージ2: 点を起点に、点ごとに異なる色が流体的に広がる(色は混ざらない)
 *   2 → ステージ3: 異なる色同士が混ざる(Oklab で混色)
 *   3 → ステージ4: 全体の色の流れ(フォースフィールド)が加わる
 *
 * 軽さ: 色は低解像度の WebGL フラグメントシェーダー1枚で計算し、CSS で拡大する。
 *   パーティクルや流体シミュレーションは使わない(ノイズ + 距離場 + ドメインワープ)。
 *   軽量モード(Q)では解像度とノイズの段数を下げる。
 */
import gsap from 'gsap';

/* ---------- 設定 (見た目の調整はここ) ---------- */
// 3色は「どの2色を混ぜても濁らない」よう、シアン〜青〜マゼンタ付近に揃えた
// (補色同士を混ぜると灰色に沈むので避ける)。混色は知覚均等な Oklab で行う。
export const HEAT_COLORS = {
  design: '#2fd0ff', // シアン
  entertainment: '#ff4fc3', // ピンク(マゼンタ)
  art: '#8a63ff', // バイオレット
};
// 点の基本位置(コンテナ比 0..1)と、wiggle の振れ幅(px)
const POINTS = [
  { id: 'art', x: 0.5, y: 0.19 },
  { id: 'design', x: 0.2, y: 0.8 },
  { id: 'entertainment', x: 0.8, y: 0.8 },
];
const WIGGLE = 9;
const CX = POINTS.reduce((a, p) => a + p.x, 0) / POINTS.length; // 点の重心(拡大の中心)
const CY = POINTS.reduce((a, p) => a + p.y, 0) / POINTS.length;
const MAX_RADIUS = 0.86; // 高さを1としたときの色の最大到達半径

/* ---------- 色変換 (sRGB hex → Oklab) ---------- */
function hexToOklab(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = lin;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/* ---------- シェーダー ---------- */
const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

const makeFrag = (octaves) => `
precision highp float;
varying vec2 vUv;
uniform vec2 uSize, uOff;          // キャンバスの大きさ / コンテナ左上までのずれ(px)
uniform float uH, uTime, uGrow, uMix, uFlow, uScale;
uniform vec2 uP0, uP1, uP2;       // 点の位置 (高さ=1 の座標系)
uniform vec3 uC0, uC1, uC2;       // Oklab
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < ${octaves}; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
vec3 oklab2rgb(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  vec3 rgb = vec3(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
                  -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
                  -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
  return pow(clamp(rgb, 0.0, 1.0), vec3(1.0 / 2.2));
}
void main() {
  // キャンバスはコンテナより一回り大きい(縁で色が切れないように)。コンテナの高さを1とする座標へ変換
  vec2 q = (vec2(vUv.x * uSize.x, (1.0 - vUv.y) * uSize.y) - uOff) / uH;
  float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(0.0, 0.16, 1.0 - vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(0.0, 0.2, 1.0 - vUv.y);
  float t = uTime;

  // ドメインワープ: ふだんは境界をゆらがせ(流体らしさ)、uFlow が上がると全体が流れ出す
  // fbm の平均は約0.44。中心をずらさないよう、その分を引いてゆらぎを0中心にする
  vec2 w = vec2(fbm(q * 1.7 + vec2(0.0, t * 0.10)), fbm(q * 1.7 + vec2(5.2, 1.3) - t * 0.09)) - 0.44;
  vec2 qq = q + w * (0.16 + 0.10 * uFlow);
  if (uFlow > 0.001) {
    // フォースフィールド: 渦と流れを重ねて、色が一方向に押し流されるようにする
    vec2 c = q - vec2(uSize.x / uH * 0.5, 0.52);
    vec2 swirl = vec2(-c.y, c.x) * (0.55 * uFlow);
    float f2 = fbm(q * 2.4 + w * 2.5 + vec2(t * 0.18, -t * 0.12));
    qq += swirl * (0.35 + f2) * 0.55 + vec2(cos(f2 * 6.28 + t * 0.4), sin(f2 * 6.28 + t * 0.4)) * 0.05 * uFlow;
  }

  float R = mix(0.0, ${MAX_RADIUS.toFixed(3)}, uGrow) * uScale;
  float breathe = 1.0 + 0.05 * sin(t * 0.8);
  float s0 = pow(1.0 - smoothstep(0.0, R * breathe + 0.0001, length(qq - uP0)), 2.0);
  float s1 = pow(1.0 - smoothstep(0.0, R * (2.0 - breathe) + 0.0001, length(qq - uP1)), 2.0);
  float s2 = pow(1.0 - smoothstep(0.0, R * (1.0 + 0.04 * sin(t * 0.6 + 2.0)) + 0.0001, length(qq - uP2)), 2.0);

  // 混色: uMix=0 は「いちばん強い色が勝つ」(混ざらない)、1 で重みつき平均(混ざる)
  float k = mix(14.0, 1.15, uMix);
  vec3 wgt = pow(vec3(s0, s1, s2) + 1e-4, vec3(k));
  vec3 lab = (wgt.x * uC0 + wgt.y * uC1 + wgt.z * uC2) / (wgt.x + wgt.y + wgt.z);
  float I = (1.0 - (1.0 - s0) * (1.0 - s1) * (1.0 - s2)) * edge;
  float core = pow(max(max(s0, s1), s2), 5.0);
  lab.x += 0.10 * core;                         // 点の近くは明るく
  vec3 rgb = oklab2rgb(lab);
  float a = clamp(I * 1.15, 0.0, 1.0);
  gl_FragColor = vec4(rgb * a, a);               // premultiplied
}`;

function createGL(canvas, octaves) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return null;
  const compile = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, makeFrag(octaves)));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  ['uSize', 'uOff', 'uH', 'uTime', 'uGrow', 'uMix', 'uFlow', 'uScale', 'uP0', 'uP1', 'uP2', 'uC0', 'uC1', 'uC2'].forEach((n) => { u[n] = gl.getUniformLocation(prog, n); });
  return { gl, prog, u };
}

/* ---------- 本体 ---------- */
// ステップ → 目標値
const STAGES = [
  { grow: 0, mix: 0, flow: 0 }, // 1: 点だけ
  { grow: 1, mix: 0, flow: 0 }, // 2: 色が広がる
  { grow: 1, mix: 1, flow: 0 }, // 3: 混ざる
  { grow: 1, mix: 1, flow: 0 }, // 4: (ピンが刺さる。色は変えない)
  { grow: 1, mix: 1, flow: 1 }, // 5: 流れる
];

export function startHeatmap(canvas, light = false) {
  const root = canvas.parentElement; // .heat
  const slide = canvas.closest('.slide');
  const dots = POINTS.map((p) => root.querySelector(`.heat-dot[data-id="${p.id}"]`));
  const cols = [HEAT_COLORS.art, HEAT_COLORS.design, HEAT_COLORS.entertainment].map(hexToOklab);

  const W = root.offsetWidth || 940;
  const H = root.offsetHeight || 700;
  const scale = light ? 0.26 : 0.42; // 低解像度で計算し、CSS で拡大して使う(流体の柔らかい表現と軽さの両立)
  // キャンバスはコンテナの外側に余白をとり、色が四角い縁で切れて見えないようにする
  // 点の間隔の拡大率(スライドの data-heat-spread)。重心を中心に点・色の広がりをまとめて拡大する
  const spread = Number(slide?.dataset.heatSpread || 1);
  const MX = 120 + (spread - 1) * 500;
  const MY = 90 + (spread - 1) * 500;
  const CW = W + MX * 2;
  const CH = H + MY * 2;
  canvas.style.cssText = `left:${-MX}px;top:${-MY}px;width:${CW}px;height:${CH}px;`;
  canvas.width = Math.round(CW * scale);
  canvas.height = Math.round(CH * scale);

  let ctx = null;
  try { ctx = createGL(canvas, light ? 2 : 3); } catch (e) { console.warn('heatmap shader:', e); }

  const state = { grow: 0, mix: 0, flow: 0 };
  let tween;
  let stage = -1;
  function setStage(n, instant = false) {
    const k = Math.max(0, Math.min(STAGES.length - 1, n));
    if (k === stage) return;
    const goingUp = k > stage;
    stage = k;
    tween?.kill();
    const target = STAGES[k];
    tween = gsap.to(state, {
      ...target,
      duration: instant ? 0 : (k === 1 ? 6 : k === 2 ? 3.2 : 4),
      ease: goingUp ? 'power2.out' : 'power2.inOut',
    });
  }
  // data-heat-stage があるスライドは、その段階に固定して表示する(アニメーションなしで最終状態から)
  // data-heat-reveal="N": ステップ N に達したとき、点から色が広がって最終状態(混ざって流れる)まで一気に進む。それまでは何も見えない
  const reveal = slide?.dataset.heatReveal;
  const toStage = (step) => (reveal !== undefined ? (step >= Number(reveal) ? STAGES.length - 1 : 0) : step);
  const fixed = slide?.dataset.heatStage;
  const readStep = () => Number(slide?.dataset.step || 0);
  if (fixed !== undefined) setStage(Number(fixed), true);
  else setStage(toStage(readStep()), false);
  const onStep = (e) => { if (fixed === undefined && e.detail.el === slide) setStage(toStage(e.detail.step)); };
  document.addEventListener('stepchange', onStep);

  // 点の wiggle (位置は固定を基準にして、わずかにゆらす)
  const phase = POINTS.map((_, i) => [i * 1.9 + 0.3, i * 2.7 + 1.1, i * 0.8 + 2.2, i * 1.3 + 0.7]);
  const pos = POINTS.map(() => ({ x: 0, y: 0 }));
  const t0 = performance.now();

  function tick() {
    const t = (performance.now() - t0) / 1000;
    POINTS.forEach((p, i) => {
      const ph = phase[i];
      pos[i].x = (CX + (p.x - CX) * spread) * W + (Math.sin(t * 0.7 + ph[0]) * 0.65 + Math.sin(t * 1.31 + ph[1]) * 0.35) * WIGGLE;
      pos[i].y = (CY + (p.y - CY) * spread) * H + (Math.cos(t * 0.6 + ph[2]) * 0.65 + Math.cos(t * 1.17 + ph[3]) * 0.35) * WIGGLE;
      dots[i].style.transform = `translate(${pos[i].x}px, ${pos[i].y}px)`;
    });
    if (!ctx) return;
    const { gl, u } = ctx;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.uSize, CW, CH);
    gl.uniform2f(u.uOff, MX, MY);
    gl.uniform1f(u.uH, H);
    gl.uniform1f(u.uTime, t);
    gl.uniform1f(u.uGrow, state.grow);
    gl.uniform1f(u.uMix, state.mix);
    gl.uniform1f(u.uFlow, state.flow);
    gl.uniform1f(u.uScale, spread);
    // シェーダーは「高さ=1」の座標系
    gl.uniform2f(u.uP0, pos[0].x / H, pos[0].y / H);
    gl.uniform2f(u.uP1, pos[1].x / H, pos[1].y / H);
    gl.uniform2f(u.uP2, pos[2].x / H, pos[2].y / H);
    gl.uniform3fv(u.uC0, cols[0]);
    gl.uniform3fv(u.uC1, cols[1]);
    gl.uniform3fv(u.uC2, cols[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    tween?.kill();
    document.removeEventListener('stepchange', onStep);
  };
}
