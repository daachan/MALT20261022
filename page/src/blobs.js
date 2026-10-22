/**
 * 境界線の blob (線のみ・塗りなし)
 *
 * ヒートマップ上に引く「境界線」。ヒートマップのコンテナ(940x700)と同じ座標系の閉じた滑らかな曲線で、
 * 制御点(下の POINTS)を Catmull-Rom 補間して SVG の path にする。ゆっくり揺らいで有機的な blob に見せる。
 *
 * 点の取り方: スクリーンショットに描いた線をなぞった座標(BLOB_POINTS)を元に、実際には
 *   等間隔に少数の点へ間引き(BLOB_SMOOTH.points)、角を丸める(BLOB_SMOOTH.passes)ことで、
 *   画像に忠実ではなく角のとれた滑らかな線にデフォルメして描く。形を直すときは BLOB_POINTS を変える。
 *   (座標は heat コンテナの左上が(0,0)、幅940・高さ700。data-heat-spread=1.2 の配置が前提)
 *
 * マークアップ:
 *   <svg class="blobs" viewBox="0 0 940 700">
 *     <path class="blob" data-blob="red" data-step pathLength="1" />   ← data-step: 押すたびに1本ずつ描かれる
 */
import gsap from 'gsap';

export const BLOB_POINTS = {"red": [[339, -93], [454, -97], [478, -102], [567, -84], [655, -54], [734, 7], [783, 63], [807, 154], [827, 225], [812, 286], [763, 429], [714, 489], [626, 591], [567, 596], [395, 608], [341, 581], [272, 540], [174, 489], [95, 449], [36, 408], [-52, 337], [-70, 322], [-52, 286], [17, 154], [66, 53], [125, -8], [203, -49], [272, -72]], "blue": [[336, -112], [410, -108], [478, -84], [567, -39], [645, 7], [714, 73], [773, 154], [837, 261], [881, 307], [913, 368], [917, 398], [896, 500], [873, 611], [857, 619], [773, 596], [694, 566], [626, 520], [567, 489], [508, 459], [459, 439], [400, 408], [341, 378], [272, 337], [213, 276], [174, 215], [158, 175], [162, 124], [174, 63], [203, 2], [243, -49], [272, -84]], "green": [[370, -72], [419, -74], [469, -69], [527, -49], [596, -13], [604, -3], [586, 63], [562, 175], [552, 200], [508, 213], [459, 225], [390, 234], [321, 195], [252, 154], [228, 124], [231, 73], [252, 27], [302, -18], [351, -49]]};

/** デフォルメの強さ。points: 制御点の数(少ないほど単純) / passes: 角を丸める回数(多いほど丸い) */
export const BLOB_SMOOTH = { points: 16, passes: 4 };
/** 形の変形: lobe=もともとの輪郭にうねりを足す量(px)、wobble=常時の揺らぎの振れ幅(px) */
export const BLOB_DEFORM = { lobe: 22, wobble: 9 };

/** 線・引き出し線・ラベルの色(いまは白に統一)。見た目は CSS の .b-red / .b-green / .b-blue の --c が決める */
export const BLOB_COLORS = { red: '#ffffff', green: '#ffffff', blue: '#ffffff' };

/** 閉じた折れ線を、弧長で等間隔に n 点へ再サンプルする */
function resample(pts, n) {
  const m = pts.length;
  const seg = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % m];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    seg.push(l);
    total += l;
  }
  const out = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (acc + seg[i] < target) { acc += seg[i]; i = (i + 1) % m; }
    const t = (target - acc) / (seg[i] || 1);
    const a = pts[i];
    const b = pts[(i + 1) % m];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/** Taubin 平滑化: 縮める(λ)→ 少し膨らませる(μ)を繰り返し、形を保ったまま細かい凹凸と角だけを丸める */
function smooth(pts, passes) {
  const step = (src, f) => {
    const n = src.length;
    return src.map((p, i) => {
      const a = src[(i - 1 + n) % n];
      const b = src[(i + 1) % n];
      return [p[0] + f * ((a[0] + b[0]) / 2 - p[0]), p[1] + f * ((a[1] + b[1]) / 2 - p[1])];
    });
  };
  let cur = pts;
  for (let k = 0; k < passes; k++) cur = step(step(cur, 0.5), -0.53);
  return cur;
}

/** 閉じた Catmull-Rom 曲線 → ベジェの path 文字列 */
function closedPath(pts, tension = 0.5) {
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3];
    const c2 = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3];
    d += ` C ${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return d + ' Z';
}

/** svg.blobs の中の path.blob[data-blob] を描き、ゆっくり揺らす。停止関数を返す
 *  HUD 風: 細い実線(本体) + 少しずらした点線の残像 + ブロブ追跡のようなハンドル(四角)を数か所に付ける */
let hatchSeq = 0;
const k0 = (id) => ({ red: 0.7, green: 2.4, blue: 4.1 }[id] || 0);

export function startBlobs(svg, { wobble = BLOB_DEFORM.wobble, light = false } = {}) {
  const NS = 'http://www.w3.org/2000/svg';
  // スライドの再表示などで再度呼ばれても、飾りが二重にならないよう前回分を消す
  svg.querySelectorAll('.blob-echo, .blob-handles, .blob-leader, .blob-fill, defs.blob-defs').forEach((n) => n.remove());
  const items = [...svg.querySelectorAll('path.blob[data-blob]')].map((el, k) => {
    const id = el.dataset.blob;
    const smoothed = smooth(resample(BLOB_POINTS[id], BLOB_SMOOTH.points), BLOB_SMOOTH.passes);
    // 重心から外向きに、点ごとに異なる量(±lobe)ずらして、うねりのある有機的な形にする
    const cx = smoothed.reduce((a, p) => a + p[0], 0) / smoothed.length;
    const cy = smoothed.reduce((a, p) => a + p[1], 0) / smoothed.length;
    const base = smoothed.map(([x, y], i) => {
      const dx = x - cx; const dy = y - cy; const len = Math.hypot(dx, dy) || 1;
      const k = Math.sin(i * 2.1 + k0(id)) * 0.6 + Math.sin(i * 0.9 + k0(id) * 2) * 0.4;
      return [x + (dx / len) * k * BLOB_DEFORM.lobe, y + (dy / len) * k * BLOB_DEFORM.lobe];
    });
    // 塗り(data-fill="solid" 塗りつぶし / "hatch" 斜線 / 指定なし=塗りなし)。不透明度50%。線(path.blob)より下に置く
    let fill = null;
    const mode = el.dataset.fill;
    if (mode === 'solid' || mode === 'hatch') {
      fill = document.createElementNS(NS, 'path');
      fill.setAttribute('class', `blob-fill ${mode}`);
      if (mode === 'hatch') {
        const hid = `blob-hatch-${++hatchSeq}`;
        const defs = document.createElementNS(NS, 'defs');
        defs.setAttribute('class', 'blob-defs');
        defs.innerHTML = `<pattern id="${hid}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" stroke="#fff" stroke-width="3.5" /></pattern>`;
        svg.prepend(defs);
        fill.setAttribute('fill', `url(#${hid})`);
      }
      svg.insertBefore(fill, el);
    }
    // 残像(点線・薄い・ずらす)
    const echo = document.createElementNS(NS, 'path');
    echo.setAttribute('class', 'blob-echo');
    el.before(echo);
    // ハンドル: 制御点のうち等間隔の4点に小さな四角(data-deco="none" の svg では付けない)
    const handles = [];
    const plain = svg.dataset.deco === 'none';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'blob-handles');
    const idx = [0, 1, 2, 3].map((q) => Math.round((q * base.length) / 4));
    if (!plain) idx.forEach((pi) => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('width', 11); r.setAttribute('height', 11);
      g.appendChild(r);
      handles.push({ r, pi });
    });
    el.after(g);
    // 引き出し線: ラベルの位置(data-lx, data-ly)に最も近い輪郭上の点から、ラベルへ線を引く
    const lx = Number(el.dataset.lx); const ly = Number(el.dataset.ly);
    let leader = null; let anchor = 0;
    if (!Number.isNaN(lx)) {
      anchor = base.reduce((best, p, i) => (Math.hypot(p[0] - lx, p[1] - ly) < Math.hypot(base[best][0] - lx, base[best][1] - ly) ? i : best), 0);
      leader = document.createElementNS(NS, 'line');
      leader.setAttribute('class', 'blob-leader');
      leader.setAttribute('pathLength', 1);
      g.before(leader);
      const dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('r', 5); dot.setAttribute('class', 'blob-anchor');
      g.appendChild(dot);
      leader.dot = dot;
    }
    return { el, fill, echo, handles, leader, anchor, lx, ly, base, phase: base.map((_, i) => [i * 1.7 + k * 2.3, i * 2.9 + k * 1.1]) };
  });
  const draw = (t) => {
    items.forEach(({ el, fill, echo, handles, leader, anchor, lx, ly, base, phase }) => {
      const pts = light || !wobble
        ? base
        : base.map(([x, y], i) => [
          x + Math.sin(t * 0.7 + phase[i][0]) * wobble,
          y + Math.cos(t * 0.6 + phase[i][1]) * wobble,
        ]);
      const d = closedPath(pts);
      el.setAttribute('d', d);
      echo.setAttribute('d', d);
      if (fill) fill.setAttribute('d', d);
      if (leader) {
        const [ax, ay] = pts[anchor];
        leader.setAttribute('x1', ax.toFixed(1)); leader.setAttribute('y1', ay.toFixed(1));
        leader.setAttribute('x2', lx); leader.setAttribute('y2', ly);
        leader.dot.setAttribute('cx', ax.toFixed(1)); leader.dot.setAttribute('cy', ay.toFixed(1));
      }
      handles.forEach(({ r, pi }) => { r.setAttribute('x', (pts[pi][0] - 5.5).toFixed(1)); r.setAttribute('y', (pts[pi][1] - 5.5).toFixed(1)); });
    });
  };
  draw(0);
  const t0 = performance.now();
  const tick = () => draw((performance.now() - t0) / 1000);
  if (!light) gsap.ticker.add(tick);
  return () => gsap.ticker.remove(tick);
}
