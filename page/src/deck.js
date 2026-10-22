/**
 * スライドシステム (chapterページ共通)
 *
 * マークアップ規約:
 *   <body data-prev="index.html#s3" data-next="index.html#s4" data-chapter="CHAPTER 1">
 *     <div class="stage">                     ← 1920x1080 固定。ウィンドウに合わせて縮尺
 *       <section class="slide">               ← 1枚のスライド
 *         <h2 data-step>…</h2>                ← data-step: 操作のたびに1つずつ出現 (DOM順)
 *         <canvas data-sketch="trail">        ← 表示中のスライドでのみ描画が動く
 *
 * 操作: → ↓ Space PageDown Enter クリック = 進む / ← ↑ PageUp Backspace Shift+クリック = 戻る
 *       F フルスクリーン / T タイマー / Q 軽量モード / ? ヘルプ / 1-9 N枚目へ(Shift+数字不要)
 */
import { enter, leave, toast } from './common.js';
import { startSketch } from './sketches.js';
import './variants.js';
import { mountGeometry } from './geometry.js';
import { mountRich } from './rich.js';

const W = 1920;
const H = 1080;

const stage = document.querySelector('.stage');
const slides = [...document.querySelectorAll('.slide')];
/* ステップのグループ化: data-step="" (値なし)は1要素ごとに1ステップ。data-step="2" のように数字を付けると、
   同じ数字の要素は同じステップでまとめて現れる(スライド内のすべてに数字を付けた場合は、数字の小さい順に出る) */
const groupSteps = (slide) => {
  const groups = [];
  const byKey = new Map();
  slide.querySelectorAll('[data-step]').forEach((el) => {
    const key = el.dataset.step;
    if (key !== '' && byKey.has(key)) { byKey.get(key).push(el); return; }
    const g = [el];
    groups.push(g);
    if (key !== '') byKey.set(key, g);
  });
  // すべて数字が付いているスライドは、数字の小さい順に並べる(DOM の順に依らない)
  const keys = groups.map((g) => g[0].dataset.step);
  if (keys.length && keys.every((k) => k !== '' && !Number.isNaN(Number(k)))) {
    groups.sort((a, b) => Number(a[0].dataset.step) - Number(b[0].dataset.step));
  }
  return groups;
};
const stepsOf = slides.map(groupSteps);
const prevUrl = document.body.dataset.prev;
const nextUrl = document.body.dataset.next;

const geo = mountGeometry(stage);
const rich = mountRich(stage, { total: slides.length, offset: Number(document.body.dataset.sceneOffset || 0) }); // 案2: 最背面(後から prepend)

/* ---------- HUD ---------- */
const hud = document.createElement('div');
hud.className = 'deck-hud';
hud.innerHTML = `
  <div class="hud-l">${document.body.dataset.chapter ?? ''}</div>
  <div class="hud-c"><div class="bar"><i></i></div></div>
  <div class="hud-r"><span class="count"></span></div>
  <div class="keys">
    <span><kbd>→</kbd><kbd>Space</kbd><kbd>クリック</kbd> 進む</span>
    <span><kbd>←</kbd> 戻る</span>
    <span><kbd>F</kbd> フルスクリーン</span>
    <span><kbd>T</kbd> タイマー</span>
    <span><kbd>Q</kbd> 軽量モード</span>
    <span><kbd>?</kbd> ヘルプ</span>
  </div>`;
document.body.appendChild(hud);
const barFill = hud.querySelector('.bar i');
const countEl = hud.querySelector('.count');
setTimeout(() => hud.querySelector('.keys').classList.add('hide'), 9000);

const help = document.createElement('div');
help.className = 'help';
help.innerHTML = `
  <div>
    <h3>キー操作</h3>
    <dl>
      <dt><kbd>→</kbd> <kbd>↓</kbd> <kbd>Space</kbd> <kbd>PageDown</kbd> <kbd>Enter</kbd></dt><dd>次へ（要素 → スライド）</dd>
      <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>PageUp</kbd> <kbd>Backspace</kbd></dt><dd>戻る</dd>
      <dt>クリック / <kbd>Shift</kbd>+クリック</dt><dd>進む / 戻る</dd>
      <dt><kbd>1</kbd>〜<kbd>9</kbd></dt><dd>N枚目へジャンプ</dd>
      <dt><kbd>Home</kbd> <kbd>End</kbd></dt><dd>最初 / 最後</dd>
      <dt><kbd>F</kbd></dt><dd>フルスクリーン</dd>
      <dt><kbd>T</kbd> / <kbd>R</kbd></dt><dd>タイマー表示 / リセット</dd>
      <dt><kbd>Q</kbd></dt><dd>軽量モード</dd>
      <dt><kbd>P</kbd></dt><dd>動画の再生 / 一時停止</dd>
      <dt><kbd>?</kbd></dt><dd>このヘルプ</dd>
    </dl>
    <p>最初のスライドで「戻る」を2回、最後のスライドで「進む」を押すと index へ戻ります。</p>
  </div>`;
document.body.appendChild(help);

/* ---------- 縮尺 (16:9固定 + レターボックス) ---------- */
const SP = matchMedia('(max-width: 820px)');
function fit() {
  // スマホ幅: ステージは全画面(CSS)。ヒートマップ(940px 幅)を画面幅に収めるための縮小率だけ渡す
  document.documentElement.style.setProperty('--k', Math.min(1, (innerWidth - 24) / 940).toFixed(4));
  if (SP.matches) { stage.style.transform = ''; return; }
  const k = Math.min(innerWidth / W, innerHeight / H);
  stage.style.transform = `translate(-50%, -50%) scale(${k})`;
}
addEventListener('resize', fit);
fit();

/* ---------- 状態 ---------- */
let i = 0; // 現在のスライド
let s = 0; // 表示済みステップ数
let exitArmed = false;
let armTimer;

function render() {
  slides.forEach((el, k) => {
    el.classList.toggle('active', k === i);
    el.classList.toggle('past', k < i);
  });
  stepsOf[i].forEach((grp, k) => grp.forEach((el) => el.classList.toggle('on', k < s)));
  // ステップの進行を他の部品(ヒートマップなど)へ通知する
  slides[i].dataset.step = String(s);
  document.body.classList.toggle('is-clean', slides[i].hasAttribute('data-clean'));
  document.dispatchEvent(new CustomEvent('stepchange', { detail: { index: i, step: s, el: slides[i] } }));
  barFill.style.transform = `scaleX(${(i + (stepsOf[i].length ? s / stepsOf[i].length : 1)) / slides.length})`;
  countEl.textContent = `${String(i + 1).padStart(2, '0')} / ${String(slides.length).padStart(2, '0')}`;
  history.replaceState(null, '', `#${i + 1}`);
}

function goSlide(n, steps = 0) {
  const changed = n !== i;
  i = n;
  s = steps === 'all' ? stepsOf[i].length : steps;
  render();
  rich.setScene(i);
  geo.setScene(i, false, document.body.dataset.design === 'rich' ? rich.center(i) : null);
  if (changed) {
    document.dispatchEvent(new CustomEvent('slidechange', { detail: { index: i, el: slides[i] } }));
  }
}

function disarm() { exitArmed = false; clearTimeout(armTimer); }

function next() {
  disarm();
  if (s < stepsOf[i].length) { s += 1; render(); return; }
  if (i < slides.length - 1) { goSlide(i + 1, 0); return; }
  if (nextUrl) leave(nextUrl);
  else toast('最後のスライドです');
}

function prev() {
  if (s > 0) { s -= 1; render(); disarm(); return; }
  if (i > 0) { disarm(); goSlide(i - 1, 'all'); return; }
  // 最初のスライドからの離脱は誤操作防止のため2回押し
  if (!prevUrl) return;
  if (exitArmed) { leave(prevUrl); return; }
  exitArmed = true;
  toast('もう一度「戻る」で index へ戻ります', 2200);
  armTimer = setTimeout(disarm, 2200);
}

/* ---------- 入力 ---------- */
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); next(); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); prev(); }
  else if (e.key === 'Home') goSlide(0);
  else if (e.key === 'End') goSlide(slides.length - 1, 'all');
  else if (/^[1-9]$/.test(e.key) && Number(e.key) <= slides.length) goSlide(Number(e.key) - 1);
  else if (e.key === '?' || e.key === '/') help.classList.toggle('show');
  else if (e.key.toLowerCase() === 'p') togglePlayback();
  else if (e.key === 'Escape') help.classList.remove('show');
});
addEventListener('click', (e) => {
  if (e.target.closest('.help, .deck-hud a, button')) { help.classList.remove('show'); return; }
  if (e.shiftKey) prev(); else next();
});

/* ---------- chapter2: 作品の位置にピンを刺す ----------
 * <section data-pin-art="0.8" data-pin-ent="0.2" data-pin-design="0.3">  (すべて 0.0〜1.0)
 * 3点(アート=上 / エンタメ=右下 / デザイン=左下)の「値で重みづけした平均」の位置に、ヒートマップの平面の上へピンを置く。
 *   位置 = (アート×アートの点 + エンタメ×エンタメの点 + デザイン×デザインの点) ÷ 3つの合計
 *   - 3つの値の「比」だけが位置を決める(合計が1でなくてもよい)
 *   - アート1.0・他0.0 → アートの点 / 3つ同じ → 3点の中央 / アートとエンタメが同じ → その中間
 * 3つとも未指定(または 0)のスライドには、ピンを置かない。 */
const PIN_POINTS = { art: [0.5, 0.19], ent: [0.8, 0.8], design: [0.2, 0.8] }; // heatmap.js の POINTS と同じ
/** 位置マーカー: 下向きの三角(▼)と、その下の円(輪・脈動・四隅のブラケット・光の筋を重ねて、周りの HUD に合わせる)。円の中心が刺した位置。
 *  立てて表示する(billboard)ので、全体を位置より上に置き、平面の下に潜らないようにしている。 */
const pinHud = () => '<div class="pin-hud"><i class="beam"></i><i class="tri echo"></i><i class="tri"></i><i class="pulse"></i><i class="pulse p2"></i><i class="ring"></i><i class="bar"></i><i class="bk tl"></i><i class="bk tr"></i><i class="bk bl"></i><i class="bk br"></i></div>';
export function pinPosition({ art = 0, ent = 0, design = 0 }) {
  const v = { art, ent, design };
  const sum = art + ent + design;
  if (!(sum > 0)) return null;
  return [0, 1].map((k) => (v.art * PIN_POINTS.art[k] + v.ent * PIN_POINTS.ent[k] + v.design * PIN_POINTS.design[k]) / sum);
}
slides.forEach((sl) => {
  const heat = sl.querySelector('.bg-heat .heat');
  if (!heat) return;
  const num = (k) => { const n = parseFloat(sl.dataset[k]); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0; };
  const pos = pinPosition({ art: num('pinArt'), ent: num('pinEnt'), design: num('pinDesign') });
  if (!pos) return;
  const layer = document.createElement('div');
  layer.className = 'heat-pins';
  const at = `left:${(pos[0] * 100).toFixed(1)}%;top:${(pos[1] * 100).toFixed(1)}%`;
  layer.innerHTML = `<div class="pin" style="${at}">${pinHud()}</div>`;
  heat.appendChild(layer);
});

/* ---------- スマホ操作: 画面下のボタン / 横スワイプ(左へ=進む・右へ=戻る) ---------- */
const spNav = document.createElement('div');
spNav.className = 'sp-nav';
spNav.innerHTML = '<button type="button" aria-label="戻る">‹</button><button type="button" aria-label="進む">›</button>';
document.body.appendChild(spNav);
spNav.children[0].addEventListener('click', (e) => { e.stopPropagation(); prev(); });
spNav.children[1].addEventListener('click', (e) => { e.stopPropagation(); next(); });
let touch0 = null;
addEventListener('touchstart', (e) => { if (e.touches.length === 1) touch0 = [e.touches[0].clientX, e.touches[0].clientY]; }, { passive: true });
addEventListener('touchend', (e) => {
  if (!touch0 || !e.changedTouches.length) return;
  const dx = e.changedTouches[0].clientX - touch0[0];
  const dy = e.changedTouches[0].clientY - touch0[1];
  touch0 = null;
  if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.6) { if (dx < 0) next(); else prev(); }
}, { passive: true });

/* ---------- スケッチ (表示中のスライドだけ動かす) ---------- */
let stopSketches = [];
function syncSketches() {
  stopSketches.forEach((f) => f());
  stopSketches = [...slides[i].querySelectorAll('canvas[data-sketch], svg[data-sketch]')].map((c) => startSketch(c));
}
/* ---------- 動画 ----------
 * ・.video-frame[data-youtube="動画IDまたはURL"] : YouTube 埋め込み(インターネット接続が必要)
 *     表示中のスライドでだけ iframe を作って自動再生し、離れたら iframe ごと消して停止する。
 * ・<video src> : ローカルの動画ファイル(オフライン可)
 * どちらも枠(.video-frame)に .ready が付くとプレースホルダーが消える。 */
const ytId = (v) => {
  const m = String(v || '').trim().match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})|^([\w-]{11})$/);
  return m ? (m[1] || m[2]) : '';
};
const phText = (frame, msg) => { const s = frame.querySelector('.video-ph span'); if (s) s.textContent = msg; };
/** URL の t=3044 / start=3044 から開始秒を取り出す */
const ytStart = (v) => { const m = String(v || '').match(/[?&#](?:t|start)=(\d+)/); return m ? Number(m[1]) : 0; };
function mountYouTube(frame) {
  if (frame.querySelector('iframe')) return;
  const isEmbed = frame.hasAttribute('data-embed');
  const id = ytId(frame.dataset.youtube);
  frame.classList.remove('ready');
  if (isEmbed) {
    // 通常のWebページの埋め込み(操作できる)。マウスが枠から出たらキー操作をスライドへ戻す
    if (!frame.dataset.embed) { phText(frame, 'data-embed に埋め込むページの URL を設定してください'); return; }
    if (!navigator.onLine) { phText(frame, 'オフラインのため表示できません'); return; }
  } else {
    if (!id) { phText(frame, 'data-youtube に YouTube の動画ID(またはURL)を設定してください'); return; }
    if (!navigator.onLine) { phText(frame, 'オフラインのため YouTube を再生できません'); return; }
  }
  const f = document.createElement('iframe');
  const start = ytStart(frame.dataset.youtube);
  f.src = isEmbed
    ? frame.dataset.embed
    : `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&iv_load_policy=3${start ? `&start=${start}` : ''}${frame.hasAttribute('data-mute') ? '&mute=1' : ''}`;
  f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
  f.title = 'YouTube video';
  f.addEventListener('load', () => frame.classList.add('ready'));
  frame.appendChild(f);
}
function unmountYouTube(frame) {
  if (!frame) return;
  frame.querySelector('iframe')?.remove();
  frame.classList.remove('ready');
}
slides.forEach((sl) => sl.querySelectorAll('video').forEach((v) => {
  const frame = v.closest('.video-frame');
  const ready = () => frame?.classList.add('ready');
  v.addEventListener('loadeddata', ready);
  if (v.readyState >= 2) ready();
}));
function syncVideos() {
  slides.forEach((sl, k) => {
    if (k !== i) sl.querySelectorAll('.pin').forEach((p) => { p.classList.remove('open'); unmountYouTube(p.querySelector('.pin-pop')); });
    // data-step の要素の中にある枠は、その要素が表示されてから読み込む(見えない間に音が出ないように)
    sl.querySelectorAll('.video-frame[data-youtube], .video-frame[data-embed]').forEach((fr) => {
      // 注意: deck がスライド自身にも data-step(現在のステップ数)を付けるため、スライドは除外して探す
      const gate = fr.closest('[data-step]:not(.slide)');
      const visible = k === i && (!gate || gate.classList.contains('on'));
      if (visible) mountYouTube(fr); else unmountYouTube(fr);
    });
    sl.querySelectorAll('video').forEach((v) => {
      if (k === i) v.play().catch(() => {});
      else { v.pause(); try { v.currentTime = 0; } catch { /* noop */ } }
    });
  });
}
/* ヒートマップのピン: マウスを合わせている間だけ、ピンの上に YouTube を表示して再生する */
slides.forEach((sl) => sl.querySelectorAll('.pin').forEach((pin) => {
  const pop = pin.querySelector('.pin-pop');
  if (!pop) return; // chapter2 の位置ピンには動画ポップアップがない
  const touchOnly = matchMedia('(hover: none)');
  const openPin = () => { pin.classList.add('open'); mountYouTube(pop); };
  const closePin = () => { pin.classList.remove('open'); unmountYouTube(pop); };
  pin.addEventListener('mouseenter', () => { if (!touchOnly.matches) openPin(); });
  pin.addEventListener('mouseleave', () => { if (!touchOnly.matches) closePin(); });
  pin.addEventListener('click', (e) => { // ピンのクリックでスライドが進まないように。タッチ端末ではタップで開閉
    e.stopPropagation();
    if (touchOnly.matches) { if (pin.classList.contains('open')) closePin(); else { slides[i].querySelectorAll('.pin.open').forEach((p2) => { p2.classList.remove('open'); unmountYouTube(p2.querySelector('.pin-pop')); }); openPin(); } }
  });
}));
/* 埋め込みページ内をクリックするとキー操作が iframe に移るため、マウスが枠から出たらスライドへ戻す */
slides.forEach((sl) => sl.querySelectorAll('.video-frame[data-embed]').forEach((fr) => {
  fr.addEventListener('mouseleave', () => { fr.querySelector('iframe')?.blur(); window.focus(); });
}));
/** P キー: 表示中の動画(YouTube / ローカル)の再生・一時停止 */
let ytPaused = false;
function togglePlayback() {
  const fr = slides[i].querySelector('.video-frame');
  if (!fr) return;
  const yt = fr.querySelector('iframe');
  if (yt) {
    ytPaused = !ytPaused;
    yt.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: ytPaused ? 'pauseVideo' : 'playVideo', args: [] }), '*');
    toast(ytPaused ? '一時停止' : '再生');
  }
  const v = fr.querySelector('video');
  if (v) { if (v.paused) v.play(); else v.pause(); }
}
document.addEventListener('slidechange', syncVideos);
document.addEventListener('stepchange', syncVideos);
document.addEventListener('slidechange', syncSketches);
document.addEventListener('designchange', () => {
  rich.setScene(i);
  geo.setScene(i, true, document.body.dataset.design === 'rich' ? rich.center(i) : null);
});
document.addEventListener('lightmodechange', syncSketches);

/* ---------- 起動 ---------- */
const startAt = Number(location.hash.slice(1));
enter();
goSlide(startAt >= 1 && startAt <= slides.length ? startAt - 1 : 0);
syncSketches();
syncVideos();
