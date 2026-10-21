import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p) => fileURLToPath(new URL(p, import.meta.url));

// 完全オフラインで動かすため base は相対パス。複数HTMLをエントリにするMPA構成。
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        chapter1: r('./chapter1.html'),
        chapter2: r('./chapter2.html'),
      },
    },
  },
});
