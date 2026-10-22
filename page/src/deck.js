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
function fit() {
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
  pin.addEventListener('mouseenter', () => { pin.classList.add('open'); mountYouTube(pop); });
  pin.addEventListener('mouseleave', () => { pin.classList.remove('open'); unmountYouTube(pop); });
  pin.addEventListener('click', (e) => e.stopPropagation()); // ピンのクリックでスライドが進まないように
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
