/**
 * デザイン案の切り替え。
 *   classic … 現状の案 (粒子BG + 文字)
 *   geo     … 案1: 幾何学レイヤーを BG と文字の間に追加
 *   rich    … 案2: NASA 画像のマスク処理 + ブロブ検出 + HUD + 案1の幾何学を重ねがけ
 * 切り替え: URL に ?design=classic|geo|rich / D キーで順送り。選択は localStorage に保持。
 */
import { toast } from './common.js';

export const DESIGNS = [
  { id: 'classic', label: 'CLASSIC — 粒子BG' },
  { id: 'geo', label: '案1 — GEOMETRY 幾何学レイヤー' },
  { id: 'rich', label: '案2 — RICH HUD / ブロブトラッキング + 幾何学' },
];

const KEY = 'lt-design';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const write = (v) => { try { localStorage.setItem(KEY, v); } catch { /* noop */ } };
const valid = (id) => DESIGNS.some((d) => d.id === id);

export function currentDesign() { return document.body.dataset.design; }

export function setDesign(id, notify = false) {
  if (!valid(id)) return;
  document.body.dataset.design = id;
  write(id);
  document.dispatchEvent(new CustomEvent('designchange', { detail: { id } }));
  if (notify) toast(DESIGNS.find((d) => d.id === id).label, 2200);
}

const fromUrl = new URLSearchParams(location.search).get('design');
setDesign(valid(fromUrl) ? fromUrl : valid(read()) ? read() : 'rich');

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'd') return;
  const i = DESIGNS.findIndex((d) => d.id === currentDesign());
  setDesign(DESIGNS[(i + 1) % DESIGNS.length].id, true);
});
