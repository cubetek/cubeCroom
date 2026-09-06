import { copyFile, mkdir, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { DATABASE_FILE_NAME } from '../data-layout.js';
import { BackupFailedError } from '../errors.js';
import { DATABASE_NAME, FILES_DIR, type BackupContents } from './manifest.js';
import { verifyBackup, type BackupReport } from './verify.js';

/**
 * الاستعادة — FR-015 · لوح `T20Restore`.
 *
 * **الترتيب هنا هو الميزة، لا الشيفرة.** الاستعادة عمليةٌ تمحو عمل المعلم
 * وطلابه، وأخطر ما فيها أن تفشل في منتصفها: عندها لا هو استرجع القديم ولا
 * أبقى الجديد. فالترتيب مقصود سطراً سطراً:
 *
 *   ١. تُفحص النسخة **فحصاً عميقاً** — بصمة كل ملف لا حجمه.
 *   ٢. يُرفض ما لا يفهمه هذا الإصدار — قاعدةٌ من تطبيق أحدث لا تُفتح.
 *   ٣. **تُؤخذ نسخة من الوضع الحالي أولاً** — وهو نصّ اللوح: «سنحفظ الوضع
 *      الحالي أولاً». وفشلُها يوقف كل شيء: لا استبدال بلا مخرج رجعة.
 *   ٤. يُنسخ الجديد إلى مكان جانبي، ولا يُمسّ القائم بعد.
 *   ٥. ثم — وعندها فقط — تُبدَّل الأماكن دفعةً واحدة، وتُرجَع عند أي فشل.
 *
 * فإن انقطعت الكهرباء في أي لحظة قبل الخطوة الخامسة، بيانات المعلم كما هي.
 * وإن انقطعت أثناءها، فنسخته الوقائية من الخطوة الثالثة تنتظره.
 */

export type RestoreOptions = {
  readonly archivePath: string;
  readonly dataDirectory: string;
  /** كل ما يلزم لأخذ النسخة الوقائية قبل الاستبدال. */
  readonly safetyBackup: () => Promise<{ path: string }>;
  /** إصدار مخطط القاعدة في هذا التطبيق — نسخةٌ أحدث منه تُرفض. */
  readonly appSchemaVersion: number;
  readonly onProgress?: ((step: RestoreStep) => void) | undefined;
};

export type RestoreStep = 'verifying' | 'safety_backup' | 'staging' | 'swapping' | 'done';

export type RestoreResult =
  | { readonly status: 'restored'; readonly safetyBackupPath: string; readonly report: BackupReport }
  /** الرسالة عربية تُعرض كما هي — الرفض ليس عطلاً بل حكمٌ له سبب. */
  | { readonly status: 'refused'; readonly message: string; readonly report?: BackupReport };

const STAGING = '.restore-staging';
const PREVIOUS = '.restore-previous';

export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const { archivePath, dataDirectory } = options;

  /* ١. فحص عميق: بصمة كل ملف، لا حجمه. */
  options.onProgress?.('verifying');
  const report = await verifyBackup(archivePath, { deep: true });
  if (report.status === 'damaged' || report.manifest === undefined) {
    return {
      status: 'refused',
      message: report.reason ?? 'هذه النسخة لا تصلح للاستعادة.',
      report,
    };
  }

  /*
   * ٢. الإصدار.
   *
   * نسخةٌ أُخذت بتطبيق أحدث تحمل قاعدةً بمخطط لا يفهمه هذا الإصدار. واستعادتها
   * تُنتج جهازاً لا يُقلع أصلاً — والمعلم يكون قد محا بياناته الصالحة للتوّ.
   */
  if (report.manifest.schemaVersion > options.appSchemaVersion) {
    return {
      status: 'refused',
      message:
        'هذه النسخة أُخذت بإصدار أحدث من CubeCroom. حدِّث التطبيق أولاً ثم أعد المحاولة.',
      report,
    };
  }

  /* ٣. النسخة الوقائية — قبل أن يُمسّ شيء. */
  options.onProgress?.('safety_backup');
  let safetyBackupPath: string;
  try {
    safetyBackupPath = (await options.safetyBackup()).path;
  } catch {
    return {
      status: 'refused',
      message:
        'تعذّر حفظ نسخة من وضعك الحالي، فأوقفنا الاستعادة. لم يتغيّر شيء على جهازك.',
      report,
    };
  }

  /* ٤. التجهيز جانباً — القائم لم يُمسّ بعد. */
  options.onProgress?.('staging');
  const staging = join(dataDirectory, STAGING);
  const previous = join(dataDirectory, PREVIOUS);
  await rm(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await rm(previous, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });

  try {
    await mkdir(join(staging, FILES_DIR), { recursive: true });
    await copyFile(join(archivePath, DATABASE_NAME), join(staging, DATABASE_FILE_NAME));

    const names = await readdir(join(archivePath, FILES_DIR)).catch(() => [] as string[]);
    for (const name of names) {
      await copyFile(join(archivePath, FILES_DIR, name), join(staging, FILES_DIR, name));
    }
  } catch (cause) {
    await rm(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    throw new BackupFailedError(cause);
  }

  /*
   * ٥. التبديل.
   *
   * القديم يُزاح ولا يُحذف حتى ينجح الجديد كله: خطوةٌ تفشل بعد الحذف تترك
   * المعلم بلا قديم ولا جديد.
   */
  options.onProgress?.('swapping');
  await mkdir(previous, { recursive: true });
  const liveDatabase = join(dataDirectory, DATABASE_FILE_NAME);
  const liveFiles = join(dataDirectory, FILES_DIR);

  try {
    await moveIfExists(liveDatabase, join(previous, DATABASE_FILE_NAME));
    await moveIfExists(liveFiles, join(previous, FILES_DIR));

    await rename(join(staging, DATABASE_FILE_NAME), liveDatabase);
    await rename(join(staging, FILES_DIR), liveFiles);
  } catch (cause) {
    // إرجاع ما أُزيح: الفشل هنا يجب أن يعيد المعلم إلى ما كان عليه.
    await moveIfExists(join(previous, DATABASE_FILE_NAME), liveDatabase).catch(() => undefined);
    await moveIfExists(join(previous, FILES_DIR), liveFiles).catch(() => undefined);
    await rm(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    throw new BackupFailedError(cause);
  }

  await rm(staging, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  await rm(previous, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });

  options.onProgress?.('done');
  return { status: 'restored', safetyBackupPath, report };
}

/**
 * ما سيختفي من واجهة المعلم بعد الاستعادة — «سيُفقد كل ما أُنشئ بعد ذلك الوقت».
 *
 * فرقٌ لا مجموع: النسخة قد تحوي أكثر من الحالي في بابٍ وأقلّ في آخر (حذف
 * المعلم درساً بعد أخذها). والسالب يُقصّ إلى صفر — «سيُفقد ‎-٣ دروس» جملة لا
 * معنى لها، والزيادة ليست فقداً.
 */
export function describeLoss(
  current: BackupContents,
  backup: BackupContents,
): Omit<BackupContents, 'fileBytes'> {
  const drop = (a: number, b: number) => Math.max(0, a - b);
  return {
    classes: drop(current.classes, backup.classes),
    lessons: drop(current.lessons, backup.lessons),
    activities: drop(current.activities, backup.activities),
    submissions: drop(current.submissions, backup.submissions),
    files: drop(current.files, backup.files),
  };
}

async function moveIfExists(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw cause;
  }
}
