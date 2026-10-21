/**
 * 案1: 幾何学レイヤー
 * 背景(Three.js)と文字の間に置く SVG。円・放射線・ハッチングされた扇形・点線・小円で構成し、
 * セクション/スライドごとに構図が変化する(gsap で連続的に補間)。
 */
import gsap from 'gsap';
import { currentDesign } from './variants.js';

const NS = 'http://www.w3.org/2000/svg';
const rad = (d) => (d * Math.PI) / 180;

/** 構図。x,y=中心, s=拡大, rot=回転, ax,ay=放射線の頂点, a1,a2=扇形の角度 */
const SCENES = [
  { x: 1020, y: 500, s: 1.0, rot: 0, ax: 120, ay: -470, a1: 20, a2: 110 },
  { x: 520, y: 430, s: 0.85, rot: 38, ax: -260, ay: -400, a1: 200, a2: 290 },
  { x: 1100, y: 470, s: 1.15, rot: -20, ax: 40, ay: -520, a1: 60, a2: 200 },
  { x: 800, y: 450, s: 0.78, rot: 12, ax: 0, ay: -380, a1: 0, a2: 360 },
  { x: 1250, y: 560, s: 1.25, rot: 70, ax: -180, ay: -480, a1: 100, a2: 170 },
  { x: 650, y: 520, s: 1.0, rot: -55, ax: 260, ay: -430, a1: 250, a2: 340 },
  { x: 980, y: 440, s: 1.35, rot: 90, ax: 0, ay: -560, a1: 30, a2: 150 },
];

export function mountGeometry(parent) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'geo');
  svg.setAttribute('viewBox', '0 0 1600 900');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <defs>
      <pattern id="geo-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)">
        <line x1="0" y1="0" x2="0" y2="9" />
      </pattern>
    </defs>
    <g class="parx">
     <g class="spin">
      <g class="pos">
      <g class="comp">
        <circle class="ring draw" r="420" />
        <circle class="ring ticks" r="438" />
        <circle class="ring dots" r="300" />
        <circle class="ring draw thin" r="212" />
        <path class="sector" />
        <g class="rays"></g>
        <line class="axis draw dashed" x1="-760" y1="0" x2="760" y2="0" />
        <line class="axis draw" x1="0" y1="-520" x2="0" y2="520" />
        <g class="coc">
          <circle class="c1" r="34" cx="-8" cy="0" />
          <circle class="c2" r="22" cx="30" cy="0" />
          <path class="c3" d="M60 0 a16 16 0 1 1 -2 -10" />
        </g>
        <g class="marks"></g>
        <text class="lab l-theta" x="318" y="-8"></text>
        <text class="lab l-phi" x="-436" y="-14">φ = 1.618</text>
        <text class="lab l-r" x="12" y="-436">r = 420</text>
      </g>
      </g>
     </g>
    </g>`;
  parent.prepend(svg);

  const q = (s) => svg.querySelector(s);
  const pos = q('.pos');
  const comp = q('.comp');
  const rays = q('.rays');
  const sector = q('.sector');
  const theta = q('.l-theta');
  const marks = q('.marks');

  for (let k = 0; k < 7; k++) {
    const l = document.createElementNS(NS, 'line');
    rays.appendChild(l);
  }
  // 軸上の目盛り
  for (let k = -12; k <= 12; k++) {
    const t = document.createElementNS(NS, 'line');
    const len = k % 4 === 0 ? 14 : 7;
    t.setAttribute('x1', k * 60); t.setAttribute('x2', k * 60);
    t.setAttribute('y1', -len / 2); t.setAttribute('y2', len / 2);
    marks.appendChild(t);
  }

  const st = { ...SCENES[0] };
  function draw() {
    const R = 300;
    const a1 = rad(st.a1); const a2 = rad(st.a2);
    const span = (((st.a2 - st.a1) % 360) + 360) % 360 || 360;
    const large = span > 180 ? 1 : 0;
    sector.setAttribute('d', span >= 359.5
      ? `M ${R} 0 A ${R} ${R} 0 1 1 ${-R} 0 A ${R} ${R} 0 1 1 ${R} 0 Z`
      : `M0 0 L ${R * Math.cos(a1)} ${R * Math.sin(a1)} A ${R} ${R} 0 ${large} 1 ${R * Math.cos(a2)} ${R * Math.sin(a2)} Z`);
    [...rays.children].forEach((l, k) => {
      const a = rad(st.a2 + 8 + k * 7);
      l.setAttribute('x1', st.ax); l.setAttribute('y1', st.ay);
      l.setAttribute('x2', 420 * Math.cos(a)); l.setAttribute('y2', 420 * Math.sin(a));
    });
    theta.textContent = `θ = ${span.toFixed(1)}°`;
  }
  draw();

  function applyScene(i, instant = false, anchor = null) {
    const sc = { ...SCENES[i % SCENES.length], ...(anchor || {}) };
    const d = instant ? 0 : 2.4;
    // 位置(pos)と回転・拡大(comp)を別の <g> に分け、構図の中心(ローカル原点)まわりで回転させる
    gsap.to(pos, { x: sc.x, y: sc.y, duration: d, ease: 'expo.inOut', overwrite: 'auto' });
    gsap.to(comp, { scale: sc.s, rotation: sc.rot, svgOrigin: '0 0', duration: d, ease: 'expo.inOut', overwrite: 'auto' });
    gsap.to(st, { ax: sc.ax, ay: sc.ay, a1: sc.a1, a2: sc.a2, duration: d, ease: 'expo.inOut', onUpdate: draw, overwrite: 'auto' });
  }
  gsap.set(pos, { x: SCENES[0].x, y: SCENES[0].y });
  gsap.set(comp, { scale: SCENES[0].s, rotation: SCENES[0].rot, svgOrigin: '0 0' });

  /* 線の描画アニメーション (stroke-dashoffset) */
  const drawables = [...svg.querySelectorAll('.draw')];
  const lens = drawables.map((el) => {
    const len = el.getTotalLength();
    if (!el.classList.contains('dashed')) el.style.strokeDasharray = `${len}`;
    return len;
  });
  function playIntro(delay = 0) {
    drawables.forEach((el, k) => {
      if (el.classList.contains('dashed')) { gsap.fromTo(el, { opacity: 0 }, { opacity: 1, duration: 1.6, delay: delay + k * 0.25 }); return; }
      gsap.fromTo(el, { strokeDashoffset: lens[k] }, { strokeDashoffset: 0, duration: 2.6, delay: delay + k * 0.25, ease: 'power3.inOut' });
    });
    gsap.fromTo(rays.children, { opacity: 0 }, { opacity: 1, duration: 1.2, stagger: 0.12, delay: delay + 0.6 });
    gsap.fromTo(sector, { opacity: 0 }, { opacity: 1, duration: 1.8, delay: delay + 0.8 });
    gsap.fromTo(marks.children, { scaleY: 0 }, { scaleY: 1, duration: 0.8, stagger: 0.03, delay: delay + 0.5, transformOrigin: '50% 50%' });
    gsap.fromTo('.geo .coc', { opacity: 0 }, { opacity: 1, duration: 1.4, delay: delay + 1.2 });
  }

  /* 常時のゆるやかな動き */
  gsap.to(q('.ticks'), { rotation: 360, svgOrigin: '0 0', duration: 220, ease: 'none', repeat: -1 });
  gsap.to(q('.dots'), { rotation: -360, svgOrigin: '0 0', duration: 300, ease: 'none', repeat: -1 });
  gsap.to(q('.coc'), { x: 150, duration: 7, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  gsap.to(q('.c2'), { attr: { cx: 70 }, duration: 5, ease: 'sine.inOut', yoyo: true, repeat: -1 });

  /* マウス / スクロール視差 */
  const parx = q('.parx');
  const spin = q('.spin');
  const px = gsap.quickTo(parx, 'x', { duration: 1.2, ease: 'power3' });
  const py = gsap.quickTo(parx, 'y', { duration: 1.2, ease: 'power3' });
  addEventListener('mousemove', (e) => {
    px((e.clientX / innerWidth - 0.5) * -36);
    py((e.clientY / innerHeight - 0.5) * -24);
  });
  const rot = gsap.quickTo(spin, 'rotation', { duration: 1.4, ease: 'power3' });
  spin.setAttribute('transform-origin', '800 450');
  gsap.set(spin, { svgOrigin: '800 450' });

  /* 表示/非表示 (classic案では隠す) */
  const sync = () => {
    const on = ['geo', 'rich'].includes(currentDesign());
    svg.style.display = on ? 'block' : 'none';
    return on;
  };
  let started = false;
  const onDesign = () => {
    if (sync() && !started) { started = true; playIntro(0.2); }
    else if (sync()) playIntro(0);
  };
  document.addEventListener('designchange', onDesign);
  if (sync()) { started = true; playIntro(1.0); }

  return {
    setScene: applyScene,
    setScroll(y) { rot(y * 0.006); },
  };
}
