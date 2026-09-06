import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dataDir, shotsDir, userDataDir } from './e2e/paths.mjs';
import { packagedApplicationPaths, releasePaths } from '../../scripts/release/config.mjs';

/**
 * قيادة التطبيق آلياً — WebdriverIO + wdio-electron-service.
 *
 * **يقود الحزمة المغلَّفة نفسها**، لا نسخة تطوير: `CubeCroom.exe` التي يثبّتها
 * المعلم. فما يُفحص هنا هو ما يصله — بمسارات موارده، وبوحدته الأصلية المبنيّة
 * لـElectron، وبسياسة المحتوى المفروضة على بروتوكول `app://`.
 *
 * **وكل جولة تبدأ من مجلد بيانات جديد.** أول تشغيل حالة لا تتكرر: إن بقيت
 * بيانات جولة سابقة قفز التطبيق فوق شاشات الإعداد، فيصير الفحص يمرّ لأنه لم
 * يفحصها لا لأنها تعمل.
 *
 * **جولة لا ملفّ**: التنظيف في `onPrepare` وحده — وهي مرحلة المُشغِّل الأمّ.
 * وكان في أعلى هذا الملفّ، و`wdio` يُشغّل عاملاً مستقلّاً لكل ملفّ فحص وكلٌّ
 * يستورد الإعداد — فكان كل ملفّ يمحو ما بناه سابقه: لقطاتُ المعلم تختفي حين
 * يبدأ الطالب، وقاعدةُ البيانات تُفرَّغ قبل ملفّ التوثيق فيصوّر تطبيقاً
 * فارغاً. وكان مكتوباً هنا أن المحو يجري «مرة واحدة» — والشيفرة تقول غير ذلك.
 */

const here = dirname(fileURLToPath(import.meta.url));

// Select the configured builder output on every platform; never silently test an older Forge build.
const { outDirectory } = releasePaths(resolve(here, '..', '..'));
const requestedOut = process.env.CUBECROOM_OUT_DIR;
const appBinaryPath = packagedApplicationPaths(requestedOut === undefined ? outDirectory : resolve(here, requestedOut)).executable;
if (!existsSync(appBinaryPath)) throw new Error(`Build the packaged app first (pnpm package): ${appBinaryPath}`);

/*
 * التطبيق يقرأ `CUBECROOM_DATA_DIR` مكاناً افتراضياً، فيكتب في مجلد الفحص لا
 * في مجلد مستندات المعلم. **وهذا شرط لا تحسين:** بلاه يصير تنظيفُ الفحص
 * حذفاً لعمله الحقيقي.
 */
process.env.CUBECROOM_DATA_DIR = dataDir;
process.env.CUBECROOM_USER_DATA_DIR = userDataDir;

export { shotsDir };

const wipe = (target) => {
  const absolute = resolve(target);
  const inside = relative(here, absolute);
  if (!inside || inside.startsWith('..') || isAbsolute(inside)
    || ![dataDir, shotsDir, userDataDir].map((path) => resolve(path)).includes(absolute)) {
    throw new Error(`Refusing to remove a directory outside the isolated test output: ${target}`);
  }
  rmSync(absolute, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
};

export const config = {
  runner: 'local',
  /*
   * الترتيب مقصود لا أبجديّ.
   *
   * الملفات تتشارك مجلد البيانات (يُمسح مرة واحدة في `onPrepare`)، فكلٌّ
   * يبني على ما خلّفه سابقه: تدفّق المعلم يُنشئ الفصل، وتدفّق الطالب يملؤه
   * بطلبٍ وتسليم، والتقاطُ التوثيق يأتي أخيراً ليصوّر شاشاتٍ ممتلئة لا
   * فارغة. وترتيبٌ أبجديّ كان سيضع `docs` أولاً فيصوّر تطبيقاً بلا بيانات.
   *
   * وحارس المقاس بعدهما جميعاً: هو **يضيّق النافذة** إلى أدنى مقاس مسموح
   * (1024×768)، ولا يُعيدها. فلو سبق التقاطَ التوثيق لخرجت لقطات الدليل كلّها
   * بمقاسٍ غير الذي يراه المعلّم.
   */
  specs: [
    join(here, 'e2e', 'flow.e2e.mjs'),
    join(here, 'e2e', 'student.e2e.mjs'),
    join(here, 'e2e', 'docs.e2e.mjs'),
    join(here, 'e2e', 'responsive.e2e.mjs'),
  ],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'electron',
      'wdio:electronServiceOptions': { appBinaryPath },
    },
  ],

  services: ['electron'],
  framework: 'mocha',
  reporters: ['spec'],
  logLevel: 'error',

  // الواجهة تُحمَّل من بروتوكول app://، وأول رسم يأتي بعد قراءة حالة الإقلاع.
  waitforTimeout: 15_000,
  connectionRetryTimeout: 120_000,
  mochaOpts: { ui: 'bdd', timeout: 120_000 },

  /** مرة واحدة قبل أول عامل — وهذا كل الفرق. */
  onPrepare() {
    wipe(dataDir);
    wipe(userDataDir);
    wipe(shotsDir);
    mkdirSync(userDataDir, { recursive: true });
    mkdirSync(shotsDir, { recursive: true });
  },
};
