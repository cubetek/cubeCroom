import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * تشغيل الفحص البصري الآليّ — WebdriverIO على الحزمة المغلَّفة.
 *
 * يُشغَّل من جذر المستودع ويقود WDIO في مجلد التطبيق: `wdio` يقرأ إعداده من
 * مجلد التطبيق، ولا يمرّ الأمر بـ`pnpm --filter` لأن فحصه للتبعيات قبل كل
 * سكربت يحاول تثبيتاً ويفشل على شبكة بطيئة — والفحص لا علاقة له بذلك.
 *
 * والشرط قبله: حزمة مغلَّفة موجودة. `pnpm package` يصنعها.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const app = join(root, 'apps', 'desktop');

const result = spawnSync(
  process.execPath,
  [join(root, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js'), 'run', 'wdio.conf.mjs'],
  { cwd: app, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
