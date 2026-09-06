import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * مسارات الجولة — **بلا أثر جانبيّ واحد**.
 *
 * كانت هذه المسارات تُصدَّر من `wdio.conf.mjs`، وفيه يُمحى مجلد البيانات ومجلد
 * اللقطات في أعلى الملفّ. و`wdio` يُشغّل **عاملاً مستقلّاً لكل ملفّ فحص**، وكل
 * عامل يستورد الإعداد ليصل إلى المسار — فيعيد تنفيذ المحو من جديد.
 *
 * والنتيجة أن كل ملفّ فحص كان يبدأ على أنقاض سابقه: لقطات تدفّق المعلم تُمحى
 * حين يبدأ تدفّق الطالب، وقاعدة البيانات تُفرَّغ قبل ملفّ التوثيق فيصوّر
 * تطبيقاً فارغاً. وكان مكتوباً في الإعداد أن المحو يجري «مرة واحدة في
 * `onPrepare`» — وهو ما لم يكن يجري.
 *
 * فصارت المسارات هنا، والمحو هناك في `onPrepare` وحده: وهي مرحلةٌ لا يدخلها
 * إلّا المُشغِّل الأمّ مرة واحدة قبل أول عامل.
 */

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');

/** بيانات التطبيق أثناء الفحص — لا مجلد مستندات المعلم الحقيقي. */
export const dataDir = join(app, '.wdio-data');

/** اللقطات ونصوصها وملفّ ملاحظاتها. */
export const shotsDir = join(app, 'screenshots');

/** مجلد بيانات Electron نفسه — يُمحى ليعود «أول تشغيل» أول تشغيل. */
export const userDataDir = join(dataDir, 'electron');

/** ملفّ الملاحظات الذي يُبنى منه دليل الاستخدام. */
export const notesFile = join(shotsDir, 'notes.json');

/** الشاشات التي تعذّر الوصول إليها — تُذكر في الدليل بدل أن تغيب منه. */
export const unreachableFile = join(shotsDir, 'unreachable.json');
