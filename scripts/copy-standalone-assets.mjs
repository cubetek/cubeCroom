import { cp, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * إكمال حزمة standalone.
 *
 * `next build` بوضع standalone لا ينسخ `.next/static` ولا `public` — ينسخ
 * الخادم وتبعياته فقط. والـ PRD ينصّ على ذلك صراحةً (§8: «ينسخ
 * public/.next/static ضمن bundle»)، فالحزمة بدونهما تُقلع بلا أنماط ولا صور.
 *
 * يعمل بعد كل بناء لبوابة الطالب.
 */
const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..', 'apps', 'student-web');
const standaloneAppDir = join(appDir, '.next', 'standalone', 'apps', 'student-web');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function copyIfPresent(from, to, label) {
  if (!(await exists(from))) {
    console.log(`تخطٍّ: ${label} غير موجود.`);
    return;
  }
  await cp(from, to, { recursive: true });
  console.log(`نُسخ: ${label}`);
}

if (!(await exists(standaloneAppDir))) {
  console.error('لم يُعثر على مخرَج standalone. شغّل `next build` أولاً.');
  process.exit(1);
}

await copyIfPresent(
  join(appDir, '.next', 'static'),
  join(standaloneAppDir, '.next', 'static'),
  '.next/static',
);
await copyIfPresent(join(appDir, 'public'), join(standaloneAppDir, 'public'), 'public');
