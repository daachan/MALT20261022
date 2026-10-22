import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { createBackground } from './bg.js';
import { enter, leave } from './common.js';
import './variants.js';
import { mountGeometry } from './geometry.js';
import { mountRich } from './rich.js';

gsap.registerPlugin(ScrollTrigger);
history.scrollRestoration = 'manual';

const sections = [...document.querySelectorAll('.sec')];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- スムーススクロール ---------- */
const lenis = new Lenis({ lerp: 0.085 });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

/* ---------- 背景 (Three.js) ---------- */
const bg = createBackground(document.getElementById('bg'));
const geo = mountGeometry(document.body);
const rich = mountRich(document.body, { total: document.querySelectorAll('.sec').length }); // 案2: 最背面
lenis.on('scroll', ({ scroll }) => { bg.setScroll(scroll); geo.setScroll(scroll); rich.setScroll(scroll); });

/* ---------- 文字スプリット ---------- */
function splitChars(el) {
  const chars = [];
  // <mark> などの入れ子も再帰的に1文字ずつ分割する。<br> はそのまま残す
  const walk = (parent, nodes) => {
    nodes.forEach((n) => {
      if (n.nodeType === 3) {
        [...n.textContent].forEach((c) => {
          const s = document.createElement('span');
          const wrap = document.createElement('span');
          wrap.className = 'char-wrap';
          s.className = 'char';
          s.textContent = c;
          wrap.appendChild(s);
          parent.appendChild(wrap);
          chars.push(s);
        });
      } else if (n.nodeName === 'BR') {
        parent.appendChild(n);
      } else {
        const shell = n.cloneNode(false);
        parent.appendChild(shell);
        walk(shell, [...n.childNodes]);
      }
    });
  };
  const nodes = [...el.childNodes];
  el.textContent = '';
  walk(el, nodes);
  return chars;
}

document.querySelectorAll('.split').forEach((el) => {
  const chars = splitChars(el);
  const isHero = !!el.closest('.hero');
  gsap.from(chars, {
    yPercent: 120, rotate: 6, duration: reduce ? 0 : 1.2, ease: 'expo.out', stagger: 0.035,
    delay: isHero ? 1.0 : 0,
    scrollTrigger: isHero ? undefined : { trigger: el, start: 'top 88%' },
  });
});

document.querySelectorAll('[data-reveal]').forEach((el) => {
  gsap.from(el, {
    y: 48, opacity: 0, duration: reduce ? 0 : 1.1, ease: 'power3.out',
    delay: el.closest('.hero') ? 1.6 : 0,
    scrollTrigger: el.closest('.hero') ? undefined : { trigger: el, start: el.closest('.kan-sec') ? 'top bottom' : 'top 90%' }, // 画面下端に置く要素も確実に発火させる
  });
});

/* セクション見出しの罫線を左から描く */
document.querySelectorAll('.label i, .big > i').forEach((line) => {
  gsap.from(line, {
    scaleX: 0, duration: reduce ? 0 : 1.1, ease: 'expo.out', delay: 0.15,
    scrollTrigger: { trigger: line, start: 'top 92%' },
  });
});

/* ギャラリー: 枚数をレイアウト用に data-n へ入れる。動画は画面に入っている間だけ再生する */
document.querySelectorAll('.gallery').forEach((g) => { g.dataset.n = String(Math.min(3, g.querySelectorAll('.g-item').length)); /* 最大3枠 */ });
/* Web サイトの枠: 画面に入っている間だけ iframe を読み込む */
const ytId = (v) => { const m = String(v || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : ''; };
const ytStart = (v) => { const m = String(v || '').match(/[?&#]t=(\d+)/); return m ? Number(m[1]) : 0; };
const webItems = [...document.querySelectorAll('.g-item.web[data-embed], .g-item.yt[data-youtube]')];
if (webItems.length && 'IntersectionObserver' in window) {
  const wio = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const el = en.target;
      const f = el.querySelector('iframe');
      if (en.isIntersecting && !f && navigator.onLine) {
        const i = document.createElement('iframe');
        if (el.dataset.youtube) {
          const id = ytId(el.dataset.youtube); const st = ytStart(el.dataset.youtube);
          i.src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1&playsinline=1${st ? `&start=${st}` : ''}`;
          i.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
        } else i.src = el.dataset.embed;
        i.title = 'embedded content';
        el.appendChild(i);
        el.classList.add('ready');
      } else if (!en.isIntersecting && f) { f.remove(); el.classList.remove('ready'); }
    });
  }, { threshold: 0.4 });
  webItems.forEach((el) => wio.observe(el));
}
const galleryVideos = [...document.querySelectorAll('.gallery video')];
if (galleryVideos.length && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) en.target.play().catch(() => {}); else en.target.pause(); });
  }, { threshold: 0.4 });
  galleryVideos.forEach((v) => { v.muted = true; io.observe(v); });
}

/* マーキー: スクロール量に連動して横移動 */
if (!reduce) {
  gsap.fromTo('.marquee .r1', { xPercent: 0 }, {
    xPercent: -30, ease: 'none',
    scrollTrigger: { trigger: '#s5', start: 'top bottom', end: 'bottom top', scrub: true },
  });
  gsap.fromTo('.marquee .r2', { xPercent: -30 }, {
    xPercent: 0, ease: 'none',
    scrollTrigger: { trigger: '#s5', start: 'top bottom', end: 'bottom top', scrub: true },
  });
}

/* 作り方: 数字を大きく反応させる */
document.querySelectorAll('.steps li b').forEach((b) => {
  gsap.from(b, {
    scale: 0.4, transformOrigin: 'left bottom', duration: 1, ease: 'back.out(2)',
    scrollTrigger: { trigger: b, start: 'top 88%' },
  });
});

/* ---------- アクティブセクション ---------- */
// 背景/幾何学/案2の構図は data-scene で指定(停止位置が増えても構図の数は変わらない)
const sceneOf = (i) => Number(sections[i].dataset.scene ?? i);
const hudSec = document.querySelector('.hud-sec');
const dotsNav = document.querySelector('.dots');
const dots = sections.map((sec, i) => {
  const b = document.createElement('button');
  b.setAttribute('aria-label', `セクション${i + 1}`);
  b.addEventListener('click', () => goTo(i));
  dotsNav.appendChild(b);
  return b;
});

let active = -1;
function setActive(i) {
  if (i === active) return;
  active = i;
  dots.forEach((d, k) => d.classList.toggle('on', k === i));
  // data-plain のセクションは背景を消し、黒地と文字だけにする
  document.body.classList.toggle('is-plain', sections[i].hasAttribute('data-plain'));
  hudSec.textContent = `${String(i + 1).padStart(2, '0')} / ${String(sections.length).padStart(2, '0')}`;
  bg.morphTo(Number(sections[i].dataset.shape));
  rich.setScene(sceneOf(i), i);
  geo.setScene(sceneOf(i), false, document.body.dataset.design === 'rich' ? rich.center(sceneOf(i)) : null);
}
sections.forEach((sec, i) => {
  ScrollTrigger.create({
    trigger: sec, start: 'top 50%', end: 'bottom 50%',
    onToggle: (self) => { if (self.isActive) setActive(i); },
  });
});
setActive(0);
// 案の切り替え時は、幾何学レイヤーを現在の構図(案2なら被写体の中心)に合わせ直す
document.addEventListener('designchange', () => {
  const i = Math.max(active, 0);
  rich.setScene(sceneOf(i), i);
  geo.setScene(sceneOf(i), true, document.body.dataset.design === 'rich' ? rich.center(sceneOf(i)) : null);
});

/* ---------- キー操作 (発表者が意図したときだけ遷移) ---------- */
function goTo(i, immediate = false) {
  const idx = Math.max(0, Math.min(sections.length - 1, i));
  lenis.scrollTo(sections[idx], { duration: 1.6, immediate, easing: (t) => 1 - Math.pow(1 - t, 4) });
}
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const cur = Math.max(active, 0);
  if (['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); goTo(cur + 1); }
  else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); goTo(cur - 1); }
  else if (e.key === 'Home') goTo(0);
  else if (e.key === 'End') goTo(sections.length - 1);
  else if (e.key === 'Enter') {
    const cta = sections[cur].querySelector('.cta');
    if (cta) leave(cta.getAttribute('href'));
  }
});

/* ---------- CTA / カーソル ---------- */
document.querySelectorAll('.cta').forEach((a) => {
  a.addEventListener('click', (e) => { e.preventDefault(); leave(a.getAttribute('href')); });
});
const cursor = document.querySelector('.cursor');
const cx = gsap.quickTo(cursor, 'x', { duration: 0.25, ease: 'power3' });
const cy = gsap.quickTo(cursor, 'y', { duration: 0.25, ease: 'power3' });
addEventListener('mousemove', (e) => { cx(e.clientX); cy(e.clientY); });
document.querySelectorAll('a, button').forEach((el) => {
  el.addEventListener('mouseenter', () => cursor.classList.add('big'));
  el.addEventListener('mouseleave', () => cursor.classList.remove('big'));
});

/* ---------- 起動: chapter から戻ったときは #sN の位置へ ---------- */
enter();
// セクションの id で復帰位置を決める(停止位置が増えても #s3 などは変わらない)
const target = sections.findIndex((sec) => `#${sec.id}` === location.hash);
if (target >= 0) {
  lenis.scrollTo(sections[target], { immediate: true, force: true });
  ScrollTrigger.refresh();
  setActive(target);
}
