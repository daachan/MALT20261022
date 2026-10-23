import './fonts.js';
import gsap from 'gsap';

/* ---------- 安全なストレージ ---------- */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* noop */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* noop */ } },
};

/* ---------- QR コード(index のみ・PC のみ・画面右下に固定。chapter1/2 には出さない。スマホ幅では CSS で非表示) ---------- */
if (document.body.classList.contains('index')) {
  const qr = document.createElement('img');
  qr.className = 'qr-fixed';
  qr.src = `${import.meta.env.BASE_URL}images/qr/QR_646827.png`;
  qr.alt = 'QR コード';
  document.body.appendChild(qr);
}

/* ---------- ページ遷移ワイプ ---------- */
const wipe = document.createElement('div');
wipe.className = 'wipe';
document.body.appendChild(wipe);

/** ページ読み込み時: ワイプを開く */
export function enter() {
  gsap.set(wipe, { transformOrigin: 'bottom' });
  gsap.to(wipe, { scaleY: 0, duration: 0.9, ease: 'expo.inOut', delay: 0.05 });
}

/** 別ページへ遷移: ワイプで覆ってから移動 */
export function leave(url) {
  gsap.set(wipe, { transformOrigin: 'top', pointerEvents: 'auto' });
  gsap.to(wipe, {
    scaleY: 1, duration: 0.7, ease: 'expo.inOut',
    onComplete: () => { location.href = url; },
  });
}

/* bfcache(戻る操作)で復帰したとき、覆われたままにならないようにする */
window.addEventListener('pageshow', (e) => {
  if (e.persisted) gsap.set(wipe, { scaleY: 0, pointerEvents: 'none' });
});

/* ---------- 軽量モード (Q) ---------- */
export const lightMode = {
  get on() { return document.body.classList.contains('light-mode'); },
  toggle() {
    const on = !this.on;
    document.body.classList.toggle('light-mode', on);
    store.set('lt-light', on ? '1' : '0');
    document.dispatchEvent(new CustomEvent('lightmodechange', { detail: { on } }));
    toast(on ? '軽量モード ON' : '軽量モード OFF');
  },
};
// 保存された設定がなければ、タッチ端末(スマホ)は軽量モードで始める
if (store.get('lt-light') === '1' || (store.get('lt-light') === null && matchMedia('(pointer: coarse)').matches)) document.body.classList.add('light-mode');

/* ---------- トースト ---------- */
const toastEl = document.createElement('div');
toastEl.className = 'toast';
document.body.appendChild(toastEl);
let toastTimer;
export function toast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms);
}

/* ---------- 発表タイマー (T で表示切替 / R でリセット) ---------- */
const timerEl = document.createElement('div');
timerEl.className = 'timer';
document.body.appendChild(timerEl);
if (!store.get('lt-start')) store.set('lt-start', String(Date.now()));
const fmt = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
setInterval(() => {
  timerEl.textContent = fmt(Date.now() - Number(store.get('lt-start')));
}, 250);

/* ---------- 共通キー: F / Q / T / R ---------- */
export function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  switch (e.key.toLowerCase()) {
    case 'f': toggleFullscreen(); break;
    case 'q': lightMode.toggle(); break;
    case 't': timerEl.classList.toggle('show'); break;
    case 'r':
      store.set('lt-start', String(Date.now()));
      toast('タイマーをリセットしました');
      break;
    default:
  }
});

/* ---------- スリープ防止 (Wake Lock) ---------- */
let wakeLock;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { /* 非対応/拒否は無視 */ }
}
requestWakeLock();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});
