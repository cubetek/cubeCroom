import { app } from 'electron';
import { appendCrashEntry, type CrashEntry } from '@cubecroom/core';
import { killPortal } from './portal.js';
import { closeStore, storeState } from './store.js';

/**
 * التعافي من التعطّل — §22.
 *
 * **الغرض ليس تسجيل العطل بل ألّا يتحوّل إلى فقدِ عمل.** SQLite في وضع WAL
 * تحتمل انقطاعاً مفاجئاً، لكن الاتصال المفتوح يبقى معلّقاً وسجلّ الكتابة بلا
 * دمج. فالمعالِج هنا يفعل ثلاثة أشياء بترتيبها:
 *
 *   ١. يُغلق القاعدة إغلاقاً نظيفاً — وهو ما يحفظ عمل المعلم.
 *   ٢. يقتل عملية خادم الطلاب — وإلا بقيت يتيمةً تحجز المنفذ بعد الإغلاق.
 *   ٣. **ثم** يكتب السجلّ إن كان المعلم قد أذن به.
 *
 * والترتيب مقصود: الكتابة آخر ما يجري، فإن فشلت هي أيضاً تكون البيانات قد
 * حُفظت. وعكسه — تسجيلٌ أولاً — يجعل عطلاً في الكتابة يبتلع فرصة الحفظ.
 */

let handling = false;

export function installCrashHandlers(): void {
  process.on('uncaughtException', (error) => {
    void bail('main', error);
  });

  process.on('unhandledRejection', (reason) => {
    void bail('rejection', reason instanceof Error ? reason : new Error(String(reason)));
  });
}

/**
 * هل يريد المعلم سجلّاً؟
 *
 * الإعداد يُقرأ من القاعدة إن كانت مفتوحة، **والافتراضي عند تعذّر القراءة هو
 * لا**: تعطّلٌ قبل فتح البيانات لا يُكتب له سجلّ في مجلدٍ لم يختره المعلم بعد.
 */
function wantsLog(): { directory: string } | null {
  const state = storeState();
  if (state.status !== 'open') return null;
  try {
    if (!state.repositories.settings.getBoolean('keepLocalCrashLog')) return null;
    return { directory: state.dataDirectory };
  } catch {
    return null;
  }
}

async function bail(source: string, error: Error): Promise<void> {
  // تعطّلٌ داخل معالج التعطّل لا يُعاد دخوله: الأول يكفي، والثاني يُغرق العملية.
  if (handling) return;
  handling = true;

  const target = wantsLog();
  const entry: CrashEntry = {
    at: new Date(),
    source,
    message: error.message,
    ...(error.stack === undefined ? {} : { stack: error.stack }),
  };

  try {
    killPortal();
    closeStore();
  } catch {
    // لا شيء يُفعل: نحن في مسار الخروج أصلاً.
  }

  if (target !== null) await appendCrashEntry(target.directory, entry);

  app.exit(1);
}
