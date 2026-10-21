/**
 * 案2 (RICH): HUD / ブロブトラッキング風のビジュアル
 *
 * - 宇宙写真をキャンバスで処理(ポスタライズ + 水色デュオトーン + しきい値マスク)して
 *   白いグローをまとった「切り抜き」にする。
 * - 切り抜いたマスク上の明るい塊(ブロブ)を連結成分ラベリングで実際に検出し、
 *   トラッキング枠・引き出し線・拡大クロップで注釈する。
 * - マウス位置もブロブとして追跡するトラッカーを表示する。
 * - セクション/スライドごとに被写体・枠(切り抜き / 円 / カード)・配置を切り替え、
 *   clip-path のマスクで出現させる。
 */
import gsap from 'gsap';
import { currentDesign } from './variants.js';

const BASE = import.meta.env.BASE_URL;

/* ---------- 素材 ---------- */
// keep: 残す画素の割合 / blur: マスク用ぼかし(縮小率) / invert: 暗部を残す
const IMAGES = {
  flag: { file: 'apollo-flag.jpg', keep: 0.2, blur: 5 },
  cluster: { file: 'cluster.jpg', keep: 0.4, blur: 8 },
  earth: { file: 'earth.jpg', keep: 0.1, blur: 8, crop: [0.2, 0.3, 0.6, 0.5] },
  footprint: { file: 'footprint.jpg', keep: 0.5, blur: 6 },
  galaxy: { file: 'galaxy.jpg', keep: 0.3, blur: 12 },
  limb: { file: 'limb.jpg', keep: 0.32, blur: 6 },
  walker: { file: 'walker.jpg', keep: 0.2, blur: 4 },
};
const RAMP = [[16, 40, 130], [52, 100, 224], [102, 153, 255], [153, 204, 255], [255, 255, 255]];
const PALETTE = ['#000000', '#99CCFF', '#6699FF', '#FFFFFF'];

/* ---------- 構図 (index のセクション / chapter のスライドで共用) ---------- */
// x,y: 中心(コンテナ比) / h: 高さ(コンテナ高さ比) / frame: cut | circle | card
const SCENES = [
  { img: 'flag', frame: 'cut', x: 0.72, y: 0.54, h: 1.04, rot: 0, boxes: 4 },
  { img: 'cluster', frame: 'circle', x: 0.85, y: 0.3, h: 0.46, rot: 0, boxes: 4 },
  { img: 'earth', frame: 'cut', x: 0.72, y: 0.55, h: 0.9, rot: 0, boxes: 4 },
  { img: 'footprint', frame: 'circle', x: 0.74, y: 0.6, h: 0.62, rot: 0, boxes: 3 },
  { img: 'limb', frame: 'card', x: 0.78, y: 0.32, h: 0.5, rot: -5, boxes: 3 },
  { img: 'galaxy', frame: 'cut', x: 0.74, y: 0.52, h: 1.0, rot: 0, boxes: 5 },
  { img: 'walker', frame: 'card', x: 0.86, y: 0.28, h: 0.46, rot: 6, boxes: 2 },
];

/* ---------- 画像処理 ---------- */
const cache = new Map();

function loadImage(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = url;
  });
}

/** keep=0 なら全画素をデュオトーン化(カード用)。それ以外はしきい値で切り抜く */
async function processImage(key, solid) {
  const id = `${key}:${solid ? 'solid' : 'cut'}`;
  if (cache.has(id)) return cache.get(id);
  const cfg = IMAGES[key];
  const img = await loadImage(`${BASE}images/space/${cfg.file}`);
  const [cx0, cy0, cw0, ch0] = cfg.crop || [0, 0, 1, 1];
  const srcX = cx0 * img.naturalWidth; const srcY = cy0 * img.naturalHeight;
  const srcW = cw0 * img.naturalWidth; const srcH = ch0 * img.naturalHeight;
  const W = 720;
  const H = Math.round((W * srcH) / srcW);

  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, W, H);
  const src = ctx.getImageData(0, 0, W, H).data;

  // マスク用: 縮小→拡大でぼかした輝度
  const sm = document.createElement('canvas');
  sm.width = Math.max(8, Math.round(W / cfg.blur));
  sm.height = Math.max(8, Math.round(H / cfg.blur));
  const sctx = sm.getContext('2d', { willReadFrequently: true });
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, sm.width, sm.height);
  ctx.clearRect(0, 0, W, H);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sm, 0, 0, W, H);
  const blurred = ctx.getImageData(0, 0, W, H).data;

  const lum = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const hist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) hist[Math.min(255, lum(blurred, i * 4) | 0)]++;
  // keep の割合に相当するしきい値
  let thr = 0;
  if (!solid) {
    let acc = 0;
    const target = W * H * cfg.keep;
    if (cfg.invert) { for (thr = 0; thr < 255; thr++) { acc += hist[thr]; if (acc >= target) break; } }
    else { for (thr = 255; thr > 0; thr--) { acc += hist[thr]; if (acc >= target) break; } }
  }

  // 色の段階: シャープな輝度を 2%〜98% で正規化して5段階にポスタライズ
  const sharpHist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) sharpHist[Math.min(255, lum(src, i * 4) | 0)]++;
  const pct = (p) => { let a = 0; for (let v = 0; v < 256; v++) { a += sharpHist[v]; if (a >= W * H * p) return v; } return 255; };
  const lo = pct(0.02); const hi = Math.max(lo + 1, pct(0.985));

  const out = ctx.createImageData(W, H);
  const level = new Uint8Array(W * H);
  const inside = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    const i = p * 4;
    const bl = lum(blurred, i);
    const keepPx = solid || (cfg.invert ? bl <= thr : bl >= thr);
    const t = Math.min(1, Math.max(0, (lum(src, i) - lo) / (hi - lo)));
    const lv = Math.min(4, Math.floor(Math.pow(t, 0.8) * 5));
    level[p] = lv;
    if (keepPx) {
      const col = RAMP[lv];
      out.data[i] = col[0]; out.data[i + 1] = col[1]; out.data[i + 2] = col[2]; out.data[i + 3] = 255;
      inside[p] = 1;
    } else {
      // 背景側にも、ごく薄く文脈を残す
      out.data[i] = 20; out.data[i + 1] = 40; out.data[i + 2] = 110; out.data[i + 3] = 0;
    }
  }
  ctx.putImageData(out, 0, 0);

  const blobs = detectBlobs(level, inside, W, H, solid);
  const info = { canvas: c, W, H, blobs };
  cache.set(id, info);
  return info;
}

/** 明るい画素(level>=3)の連結成分を検出し、枠として使えるブロブを返す */
function detectBlobs(level, inside, W, H, solid) {
  const S = 4; // 縮小率
  const gw = Math.floor(W / S); const gh = Math.floor(H / S);
  const grid = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      let on = 0;
      for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
        const p = (y * S + dy) * W + (x * S + dx);
        if (inside[p] && level[p] >= 3) on++;
      }
      grid[y * gw + x] = on >= 4 ? 1 : 0;
    }
  }
  const seen = new Uint8Array(gw * gh);
  const found = [];
  const stack = [];
  for (let s0 = 0; s0 < grid.length; s0++) {
    if (!grid[s0] || seen[s0]) continue;
    let minX = gw, minY = gh, maxX = 0, maxY = 0, area = 0, sx = 0, sy = 0;
    stack.push(s0); seen[s0] = 1;
    while (stack.length) {
      const q = stack.pop();
      const x = q % gw; const y = (q / gw) | 0;
      area++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const n = ny * gw + nx;
        if (grid[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
      }
    }
    const frac = area / (gw * gh);
    const pw = maxX - minX + 1; const ph = maxY - minY + 1;
    if (area < 5 || pw / ph > 3 || ph / pw > 3) continue;
    found.push({ frac,
      x: (minX - 1) / gw, y: (minY - 1) / gh,
      w: (maxX - minX + 3) / gw, h: (maxY - minY + 3) / gh,
      cx: sx / area / gw, cy: sy / area / gh, score: Math.sqrt(area),
    });
  }
  // 画面の大半を占める塊は除外する。ただし候補が足りないときは大きな塊も許容する
  const limit = solid ? 0.05 : 0.06;
  let pool = found.filter((b) => b.frac <= limit);
  if (pool.length < 3) pool = found.filter((b) => b.frac <= 0.3);
  pool.sort((a, b) => b.score - a.score);
  // 近すぎるものを除外して分散させる
  const picked = [];
  for (const b of pool) {
    if (picked.every((p) => Math.hypot(p.cx - b.cx, p.cy - b.cy) > 0.16)) picked.push(b);
    if (picked.length >= 10) break;
  }
  return picked;
}

/* ---------- 乱数(構図ごとに固定) ---------- */
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

const SPARK = '<svg viewBox="0 0 40 40" width="100%" height="100%"><path d="M20 0 C21 12 28 19 40 20 C28 21 21 28 20 40 C19 28 12 21 0 20 C12 19 19 12 20 0Z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>';
const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');

/* ---------- マウント ---------- */
export function mountRich(parent, { total = 7, offset = 0 } = {}) {
  const root = document.createElement('div');
  root.className = 'rich';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <div class="rich-grid"></div>
    <div class="rich-glow"></div>
    <div class="rich-subjects"></div>
    <div class="rich-deco"></div>
    <div class="rich-top">
      <span class="rt-l">MEDIA ART — LT <em class="rt-n"></em></span>
      <span class="rt-pal">${PALETTE.map((c) => `<i style="--c:${c}">${c}</i>`).join('')}</span>
      <span class="rt-r">LOCAL TIME <b class="rt-clock"></b></span>
    </div>
    <div class="rich-tracker"><i></i><i></i><i></i><i></i><span></span></div>
    <div class="rich-vig"></div>
    <div class="rich-tex"></div>`;
  parent.prepend(root);

  const q = (s) => root.querySelector(s);
  const subjects = q('.rich-subjects');
  const deco = q('.rich-deco');
  const tracker = q('.rich-tracker');
  const trackerText = tracker.querySelector('span');
  const clockEl = q('.rt-clock');
  const nEl = q('.rt-n');

  const size = () => ({ w: root.offsetWidth || innerWidth, h: root.offsetHeight || innerHeight });

  let sceneIdx = 0;
  let token = 0;
  let current = null; // 現在の被写体 { el, blobs }

  /* 時計 */
  const tick = () => {
    const d = new Date();
    clockEl.textContent = [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
  };
  tick();
  setInterval(tick, 1000);

  /* 装飾 (スパークル・バーコード・十字・小ラベル) */
  function buildDeco(i) {
    deco.innerHTML = '';
    const { w, h } = size();
    const r = rng(i + offset + 3);
    const place = (el, x, y) => { el.style.left = `${x * w}px`; el.style.top = `${y * h}px`; deco.appendChild(el); return el; };
    for (let k = 0; k < 4; k++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      const sz = 22 + r() * 46;
      s.style.width = s.style.height = `${sz}px`;
      s.innerHTML = SPARK;
      place(s, 0.04 + r() * 0.9, 0.12 + r() * 0.78);
      gsap.fromTo(s, { scale: 0, rotate: -90 }, { scale: 1, rotate: 0, duration: 1.2, delay: 0.4 + k * 0.15, ease: 'back.out(2)' });
      gsap.to(s, { rotate: 45, duration: 12 + k * 3, repeat: -1, yoyo: true, ease: 'sine.inOut' });
    }
    const bar = document.createElement('div');
    bar.className = 'barcode';
    let bars = '';
    for (let k = 0; k < 34; k++) bars += `<i style="width:${1 + ((r() * 4) | 0)}px"></i>`;
    bar.innerHTML = bars;
    place(bar, 0.05 + r() * 0.1, 0.86);
    for (let k = 0; k < 3; k++) {
      const c = document.createElement('div');
      c.className = 'cross';
      c.textContent = '+';
      place(c, 0.1 + r() * 0.8, 0.1 + r() * 0.8);
    }
    const labels = [`FRAME ${String(i + 1).padStart(3, '0')}`, `SIG ${hex2((r() * 255) | 0)}${hex2((r() * 255) | 0)}`, 'TRACKING…', `VEC ${(r() * 9).toFixed(2)}`];
    labels.forEach((t) => {
      const l = document.createElement('div');
      l.className = 'dlabel';
      l.textContent = t;
      place(l, 0.03 + r() * 0.86, 0.07 + r() * 0.84);
    });
    gsap.from(deco.children, { opacity: 0, duration: 1, stagger: 0.05, delay: 0.3 });
  }

  /* 被写体の構築 */
  async function build(i) {
    const my = ++token;
    const sc = SCENES[(i + offset) % SCENES.length];
    const solid = sc.frame !== 'cut';
    let info;
    try { info = await processImage(sc.img, solid); } catch { return; }
    if (my !== token) return;

    const { w: cw, h: ch } = size();
    const ia = info.W / info.H;
    let bh = sc.h * ch;
    let bw = sc.frame === 'cut' ? bh * ia : sc.frame === 'circle' ? bh : bh * 1.22;
    if (sc.frame === 'cut' && bw > cw * 0.62) { bw = cw * 0.62; bh = bw / ia; }
    const pad = sc.frame === 'card' ? Math.round(bh * 0.05) : 0;

    // 画像→枠の座標写像 (cover)
    const innerW = bw - pad * 2; const innerH = bh - pad * 2;
    const s = Math.max(innerW / info.W, innerH / info.H);
    const ox = pad + (innerW - info.W * s) / 2;
    const oy = pad + (innerH - info.H * s) / 2;
    const toBox = (nx, ny) => [ox + nx * info.W * s, oy + ny * info.H * s];

    const el = document.createElement('div');
    el.className = `subj ${sc.frame}`;
    let sx = sc.x * cw - bw / 2;
    let sy = sc.y * ch - bh / 2;
    if (sc.frame !== 'cut') { // 円・カードは画面内に収める
      sx = Math.min(Math.max(sx, 14), cw - bw - 14);
      sy = Math.min(Math.max(sy, 54), ch - bh - 54);
    }
    el.style.cssText = `left:${sx}px;top:${sy}px;width:${bw}px;height:${bh}px;rotate:${sc.rot}deg;`;
    el.innerHTML = `
      <div class="subj-glow"><div class="subj-mask"><canvas></canvas></div></div>
      <svg class="subj-lines" width="${bw}" height="${bh}" viewBox="0 0 ${bw} ${bh}"></svg>`;
    subjects.appendChild(el);

    const cv = el.querySelector('canvas');
    const dpr = Math.min(devicePixelRatio || 1, 2);
    cv.width = Math.min(1600, Math.round(bw * dpr));
    cv.height = Math.round(cv.width * (bh / bw));
    cv.style.width = '100%'; cv.style.height = '100%';
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    const k = cv.width / bw;
    if (sc.frame === 'card') { cx.fillStyle = '#eceff6'; cx.fillRect(0, 0, cv.width, cv.height); }
    cx.drawImage(info.canvas, ox * k, oy * k, info.W * s * k, info.H * s * k);

    /* ブロブのトラッキング枠 + 引き出し + 拡大クロップ */
    const lines = el.querySelector('.subj-lines');
    const nsvg = 'http://www.w3.org/2000/svg';
    const blobEls = [];
    const inFrame = (b) => {
      const [px, py] = toBox(b.cx, b.cy);
      if (px < pad + 4 || py < pad + 4 || px > bw - pad - 4 || py > bh - pad - 4) return false;
      if (sc.frame === 'circle') return Math.hypot(px - bw / 2, py - bh / 2) < bw * 0.42;
      return true;
    };
    const placed = [];
    const chosen = info.blobs.filter(inFrame).slice(0, sc.boxes);
    chosen.forEach((b, n) => {
      const [x0, y0] = toBox(b.x, b.y);
      const bwid = Math.max(26, b.w * info.W * s);
      const bhei = Math.max(26, b.h * info.H * s);
      const box = document.createElement('div');
      box.className = 'blob';
      box.style.cssText = `left:${x0}px;top:${y0}px;width:${bwid}px;height:${bhei}px;`;
      box.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><span class="bl"></span>';
      const conf0 = 0.86 + ((n * 37) % 13) / 100;
      box.querySelector('.bl').textContent = `ID ${String(n + 1).padStart(2, '0')}  ${conf0.toFixed(2)}`;
      el.appendChild(box);
      blobEls.push({ box, label: box.querySelector('.bl'), conf: conf0, n });

      // 引き出し先のクロップ窓: 被写体の中心から放射方向へ置き、画面内に収めて重なりを避ける
      const csz = 112 + (n % 3) * 30;
      const bcx = x0 + bwid / 2; const bcy = y0 + bhei / 2;
      let vx = bcx - bw / 2; let vy = bcy - bh / 2;
      if (Math.hypot(vx, vy) < 8) { vx = 1; vy = -1; }
      const D = Math.max(bw, bh) * 0.42 + csz;
      const ang0 = Math.atan2(vy, vx);
      let place = null;
      for (let t = 0; t < 12 && !place; t++) {
        const ang = ang0 + (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 0.55;
        let px = bcx + Math.cos(ang) * D - csz / 2;
        let py = bcy + Math.sin(ang) * D - csz / 2;
        px = Math.min(Math.max(px, 12 - sx), cw - 12 - sx - csz);
        py = Math.min(Math.max(py, 52 - sy), ch - 40 - sy - csz);
        const clash = placed.some((o) => px < o.x + o.s + 16 && px + csz + 16 > o.x && py < o.y + o.s + 16 && py + csz + 16 > o.y);
        if (!clash) place = { x: px, y: py, s: csz };
      }
      if (!place) place = { x: bcx + D / 2, y: bcy - D / 2, s: csz };
      placed.push(place);
      const crop = document.createElement('div');
      crop.className = 'crop';
      const cxp = place.x; const cyp = place.y;
      crop.style.cssText = `left:${cxp}px;top:${cyp}px;width:${csz}px;height:${csz}px;`;
      const cc = document.createElement('canvas');
      cc.width = cc.height = csz * 2;
      const cctx = cc.getContext('2d');
      cctx.imageSmoothingEnabled = false;
      const sw = Math.min(Math.max(b.w * info.W * 1.9, 28), info.W, info.H);
      const srcX = Math.min(Math.max(b.cx * info.W - sw / 2, 0), info.W - sw);
      const srcY = Math.min(Math.max(b.cy * info.H - sw / 2, 0), info.H - sw);
      cctx.drawImage(info.canvas, srcX, srcY, sw, sw, 0, 0, cc.width, cc.height);
      crop.appendChild(cc);
      crop.insertAdjacentHTML('beforeend', '<i></i><i></i><i></i><i></i><em>#99CCFF</em>');
      el.appendChild(crop);

      // 線: ブロブ枠の角 → クロップ窓の角 (肘付き)
      const dx = cxp + csz / 2 - bcx; const dy = cyp + csz / 2 - bcy;
      const ax = dx > 0 ? x0 + bwid : x0;
      const ay = dy > 0 ? y0 + bhei : y0;
      const bx = dx > 0 ? cxp : cxp + csz;
      const by = dy > 0 ? cyp : cyp + csz;
      const ln = document.createElementNS(nsvg, 'polyline');
      ln.setAttribute('points', `${ax},${ay} ${(ax + bx) / 2},${ay} ${bx},${by}`);
      ln.setAttribute('class', 'tl');
      lines.appendChild(ln);

      gsap.from(box, { scale: 0.2, opacity: 0, duration: 0.7, delay: 1.0 + n * 0.18, ease: 'back.out(2.4)' });
      gsap.from(crop, { opacity: 0, scale: 0.6, duration: 0.7, delay: 1.3 + n * 0.18, ease: 'power3.out' });
      const len = ln.getTotalLength ? ln.getTotalLength() : 200;
      ln.style.strokeDasharray = `${len}`;
      gsap.fromTo(ln, { strokeDashoffset: len }, { strokeDashoffset: 0, duration: 0.9, delay: 1.15 + n * 0.18, ease: 'power2.out' });
    });

    // マスクで出現
    const mask = el.querySelector('.subj-mask');
    const from = sc.frame === 'circle' ? 'circle(0% at 50% 50%)' : sc.frame === 'card' ? 'inset(100% 0 0 0)' : 'inset(0 100% 0 0)';
    const to = sc.frame === 'circle' ? 'circle(75% at 50% 50%)' : 'inset(-6% -6% -6% -6%)';
    gsap.fromTo(mask, { clipPath: from }, { clipPath: to, duration: 1.5, ease: 'expo.inOut' });
    gsap.from(el, { scale: 1.12, duration: 2, ease: 'expo.out' });

    // 退場 (旧被写体)
    const old = current;
    if (old) {
      old.blobs.length = 0;
      gsap.to(old.el, { opacity: 0, scale: 0.96, duration: 0.8, ease: 'power2.in', onComplete: () => old.el.remove() });
    }
    current = { el, blobs: blobEls };
  }

  /* 信頼度の数値を揺らす(トラッキング中の演出) */
  setInterval(() => {
    if (!current) return;
    current.blobs.forEach((b) => {
      b.conf = Math.min(0.99, Math.max(0.8, b.conf + (Math.random() - 0.5) * 0.04));
      b.label.textContent = `ID ${String(b.n + 1).padStart(2, '0')}  ${b.conf.toFixed(2)}`;
    });
  }, 400);

  /* マウス = ブロブとして追跡 */
  const tx = gsap.quickTo(tracker, 'x', { duration: 0.35, ease: 'power3' });
  const ty = gsap.quickTo(tracker, 'y', { duration: 0.35, ease: 'power3' });
  addEventListener('mousemove', (e) => {
    if (currentDesign() !== 'rich') return;
    const r = root.getBoundingClientRect();
    const k = (root.offsetWidth || r.width) / r.width;
    const x = (e.clientX - r.left) * k; const y = (e.clientY - r.top) * k;
    tx(x); ty(y);
    gsap.to(subjects, { x: (x / (root.offsetWidth || r.width) - 0.5) * -22, y: (y / (root.offsetHeight || r.height) - 0.5) * -14, duration: 1.2, ease: 'power3' });
    trackerText.textContent = `TRK  X ${(x / (root.offsetWidth || r.width)).toFixed(3)}  Y ${(y / (root.offsetHeight || r.height)).toFixed(3)}`;
    if (current) {
      current.blobs.forEach(({ box }) => {
        const b = box.getBoundingClientRect();
        const hot = e.clientX > b.left - 8 && e.clientX < b.right + 8 && e.clientY > b.top - 8 && e.clientY < b.bottom + 8;
        box.classList.toggle('hot', hot);
      });
    }
  });

  /* 表示切替 / リサイズ */
  const sync = () => {
    const on = currentDesign() === 'rich';
    root.style.display = on ? 'block' : 'none';
    if (on) { build(sceneIdx); buildDeco(sceneIdx); }
  };
  document.addEventListener('designchange', sync);
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (currentDesign() === 'rich') { subjects.innerHTML = ''; current = null; build(sceneIdx); buildDeco(sceneIdx); } }, 250); });
  sync();

  return {
    /** i: 構図の番号 / n: HUD に表示する現在位置(省略時は i) */
    setScene(i, n = i) {
      nEl.textContent = `${String(n + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
      if (i === sceneIdx && current) return;
      sceneIdx = i;
      if (currentDesign() !== 'rich') return;
      build(i);
      buildDeco(i);
    },
    setScroll() {},
    /** 被写体の中心 (SVG 幾何学レイヤーの 1600x900 座標) */
    center(i) { const sc = SCENES[(i + offset) % SCENES.length]; return { x: sc.x * 1600, y: sc.y * 900 }; },
  };
}
