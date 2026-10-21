import * as THREE from 'three';
import gsap from 'gsap';

const N = 9000;
const N_LIGHT = 2500;

/* ---------- 形状ジェネレータ (各セクションに1つ) ---------- */
const rnd = (a, b) => a + Math.random() * (b - a);
const fill = (fn) => {
  const arr = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = fn(i);
    arr.set([x, y, z], i * 3);
  }
  return arr;
};
const inSphere = (r) => {
  const u = Math.random() * 2 - 1;
  const t = Math.random() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const k = r * Math.cbrt(Math.random());
  return [k * s * Math.cos(t), k * u, k * s * Math.sin(t)];
};
const onSphere = (r, i) => {
  const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
  const th = Math.PI * (1 + Math.sqrt(5)) * i;
  return [r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)];
};

const shapes = [
  // 0: 波打つ平面 (タイトル)
  fill(() => { const x = rnd(-9, 9); const z = rnd(-6, 6); return [x, Math.sin(x * 0.7) * Math.cos(z * 0.7) * 0.9 - 1.2, z]; }),
  // 1: カオス (定義できない)
  fill(() => [rnd(-9, 9), rnd(-6, 6), rnd(-6, 6)]),
  // 2: 3つの重なる球 (デザイン / エンタメ / アート)
  fill((i) => {
    const c = [[-2.4, 1.1], [2.4, 1.1], [0, -2.8]][i % 3];
    const [x, y, z] = inSphere(2.9);
    return [x + c[0], y + c[1], z];
  }),
  // 3: ひとつの球 (感情を形にする)
  fill((i) => onSphere(3.6, i)),
  // 4: 画面 (メディア)
  fill(() => [rnd(-5.6, 5.6), rnd(-3.15, 3.15), rnd(-0.12, 0.12)]),
  // 5: 渦 (作品に触れる)
  fill((i) => {
    const t = (i / N) * Math.PI * 14;
    const r = 0.4 + (i / N) * 6.5;
    return [Math.cos(t) * r + rnd(-0.25, 0.25), rnd(-0.6, 0.6) * (1 - i / N * 0.5), Math.sin(t) * r + rnd(-0.25, 0.25)];
  }),
  // 6: 3段の階段 (作り方)
  fill((i) => {
    const s = i % 3;
    return [rnd(-1.4, 1.4) + (s - 1) * 3, rnd(-0.4, 0.4) + s * 1.7 - 1.6, rnd(-1.4, 1.4)];
  }),
];

const vert = /* glsl */ `
  attribute vec3 aTo;
  attribute float aRand;
  uniform float uMix;
  uniform float uTime;
  uniform float uSize;
  uniform float uPixel;
  varying float vRand;
  varying float vDepth;
  void main() {
    float e = uMix * uMix * (3.0 - 2.0 * uMix);
    vec3 p = mix(position, aTo, e);
    // 微かな揺らぎ
    p += sin(p.yzx * 1.3 + uTime * 0.5 + aRand * 6.28) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * uPixel * (0.6 + aRand) * (8.0 / -mv.z);
    vRand = aRand;
    vDepth = clamp((-mv.z - 6.0) / 14.0, 0.0, 1.0);
  }
`;
const frag = /* glsl */ `
  uniform vec3 uAccent;
  varying float vRand;
  varying float vDepth;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    float a = smoothstep(0.5, 0.0, d);
    vec3 col = vRand < 0.07 ? uAccent : vec3(0.95, 0.94, 0.92);
    gl_FragColor = vec4(col, a * (0.85 - vDepth * 0.55));
  }
`;

export function createBackground(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.z = 11;

  const geo = new THREE.BufferGeometry();
  const from = new Float32Array(shapes[0]);
  const rand = new Float32Array(N).map(Math.random);
  geo.setAttribute('position', new THREE.BufferAttribute(from, 3));
  geo.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(shapes[0]), 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));

  const uniforms = {
    uMix: { value: 1 },
    uTime: { value: 0 },
    uSize: { value: 2.2 },
    uPixel: { value: 1 },
    uAccent: { value: new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, uniforms,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);

  let current = 0;
  let tween;
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  let scrollY = 0;
  let light = document.body.classList.contains('light-mode');

  function applyQuality() {
    renderer.setPixelRatio(light ? 1 : Math.min(devicePixelRatio, 2));
    uniforms.uPixel.value = renderer.getPixelRatio();
    geo.setDrawRange(0, light ? N_LIGHT : N);
    resize();
  }
  function resize() {
    const w = innerWidth; const h = innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長ウィンドウでは引いて全体が収まるように
    camera.position.z = w / h < 1 ? 11 / Math.max(w / h, 0.5) : 11;
    camera.updateProjectionMatrix();
  }

  /** 指定の形状へモーフィング */
  function morphTo(idx) {
    if (idx === current) return;
    const pos = geo.attributes.position;
    const to = geo.attributes.aTo;
    // 現在の見た目の位置を新しい「from」として確定してから次へ
    const m = uniforms.uMix.value;
    const e = m * m * (3 - 2 * m);
    for (let i = 0; i < pos.array.length; i++) {
      pos.array[i] = pos.array[i] + (to.array[i] - pos.array[i]) * e;
    }
    to.array.set(shapes[idx]);
    pos.needsUpdate = true;
    to.needsUpdate = true;
    uniforms.uMix.value = 0;
    tween?.kill();
    tween = gsap.to(uniforms.uMix, { value: 1, duration: 2.2, ease: 'power2.out' });
    current = idx;
  }

  addEventListener('mousemove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
  });
  addEventListener('resize', resize);
  document.addEventListener('lightmodechange', (e) => { light = e.detail.on; applyQuality(); });
  applyQuality();

  const clock = new THREE.Clock();
  gsap.ticker.add(() => {
    const t = clock.getElapsedTime();
    uniforms.uTime.value = t;
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
    points.rotation.y = t * 0.06 + mouse.sx * 0.5 + scrollY * 0.0004;
    points.rotation.x = mouse.sy * 0.25;
    renderer.render(scene, camera);
  });

  return {
    morphTo,
    setScroll(y) { scrollY = y; },
  };
}
