# メディアアートとは？ — LT用Webスライド (雛形)

```bash
npm install
npm run dev       # 開発
npm run build && npm run preview   # 本番ビルドをローカル配信 (当日はこちら)
```

- `index.html` … スクロール演出のLP (Lenis + GSAP + Three.js)。`#s1`〜`#s7` がセクション
- `chapter1.html` / `chapter2.html` … スライドシステム (`src/deck.js`)。`data-prev` / `data-next` で index の復帰位置を指定
- 追加スライドは `<section class="slide">` を足し、`data-step` を付けた要素が1操作ずつ出現
