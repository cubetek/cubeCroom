import { defineDocs, defineConfig } from 'fumadocs-mdx/config';

/**
 * مصدر المحتوى: `content/docs` — **مولَّد لا مكتوب**.
 *
 * يولّد scripts/guide.mjs الصفحات من guide-copy.mjs ومقالات guide/*.mjs
 * واللقطات الموثّقة في guide/screens.json. التحرير مكانه هذه المصادر.
 */
export const docs = defineDocs({
  dir: 'content/docs',
});

export default defineConfig();
