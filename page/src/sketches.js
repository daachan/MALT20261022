/**
 * スライド内に埋め込むインタラクティブ表現。
 * startSketch(canvas) は停止関数を返す。スライドが非表示になったら呼び出し側が止める。
 * (p5.js / Three.js に差し替える場合も、同じ「start → stop」の契約を守る)
 */
import { startHeatmap } from './heatmap.js';
import { startBlobs } from './blobs.js';

const sketches = {
  /** ヒートマップ上の境界線 blob (svg 要素に付ける。線のみ・塗りなし) */
  blobs(svg, { light }) { return startBlobs(svg, { light }); },

  /** 3点から色が広がるヒートマップ(スライドのステップと連動) */
  heatmap(canvas, { light }) { return startHeatmap(canvas, light); },

  /** マウスの軌跡が粒子になって散る */
  trail(canvas, { light }) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const parts = [];
    const max = light ? 250 : 900;
    const m = { x: w / 2, y: h / 2, moved: 0 };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      m.x = ((e.clientX - r.left) / r.width) * w;
      m.y = ((e.clientY - r.top) / r.height) * h;
      m.moved = performance.now();
      emit(m.x, m.y, 4);
    };
    function emit(x, y, n) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2;
        const v = 0.6 + Math.random() * 3;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hot: Math.random() < 0.12 });
      }
      if (parts.length > max) parts.splice(0, parts.length - max);
    }
    addEventListener('mousemove', onMove);

    let raf;
    const t0 = performance.now();
    const loop = (now) => {
      ctx.fillStyle = 'rgba(7,7,10,0.18)';
      ctx.fillRect(0, 0, w, h);
      // 操作がないときは自動で軌道を描く
      if (now - m.moved > 1500) {
        const t = (now - t0) / 1000;
        emit(w / 2 + Math.cos(t * 0.9) * w * 0.28, h / 2 + Math.sin(t * 1.3) * h * 0.28, 3);
      }
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.008;
        if (p.life <= 0) { parts.splice(k, 1); continue; }
        ctx.fillStyle = p.hot ? `rgba(142,197,255,${p.life})` : `rgba(242,241,238,${p.life * 0.9})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + p.life * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    ctx.fillStyle = '#07070a';
    ctx.fillRect(0, 0, w, h);
    raf = requestAnimationFrame(loop);

    return () => { cancelAnimationFrame(raf); removeEventListener('mousemove', onMove); };
  },
};

export function startSketch(canvas) {
  const fn = sketches[canvas.dataset.sketch];
  if (!fn) return () => {};
  return fn(canvas, { light: document.body.classList.contains('light-mode') });
}
