import { appendFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { redactSecrets } from './security/secrets.js';

/**
 * سجلّ التعطّل المحلي — §22 · إعداد `keepLocalCrashLog` في `T22`.
 *
 * **يبقى على جهاز المعلم ولا يغادره**: لا إرسال ولا تقارير، وهو ما يعنيه
 * الإعداد باسمه — «سجلّ محلي». والمعلم يستطيع إطفاءه، وعندها لا يُكتب شيء.
 *
 * **وكل سطر يمرّ بـ`redactSecrets` قبل أن يُكتب.** أثرُ استثناءٍ في مسار
 * الذكاء الاصطناعي قد يحمل مفتاح المعلم داخل رسالة خطأ من مكتبة لا نملكها —
 * وسجلٌّ يكتبه على قرصه بنصّه الصريح ينقض SEC-005 من حيث أراد أن يساعد.
 */

export const CRASH_LOG_NAME = 'crash.log';

/**
 * حدّ الملف.
 *
 * سجلٌّ ينمو بلا حدّ يملأ قرص المعلم بصمت. وحين يتجاوز الحدّ يُبقى نصفه
 * الأحدث: العطل الذي وقع قبل قليل أنفع من عطلٍ وقع قبل شهر.
 */
const MAX_BYTES = 256 * 1024;

export type CrashEntry = {
  readonly at: Date;
  /** `main` · `renderer` · `rejection` — من أين جاء. */
  readonly source: string;
  readonly message: string;
  readonly stack?: string | undefined;
};

export function formatCrashEntry(entry: CrashEntry): string {
  const lines = [
    `── ${entry.at.toISOString()} · ${entry.source}`,
    entry.message,
    ...(entry.stack === undefined || entry.stack === '' ? [] : [entry.stack]),
    '',
  ];
  // التنقية على النصّ المجمَّع لا على كل حقل: السرّ قد يقع على حدّ بينها.
  return redactSecrets(lines.join('\n'));
}

/**
 * يكتب سطراً في السجلّ — ولا يرمي أبداً.
 *
 * يُنادى من معالج تعطّل: استثناءٌ داخل معالج الاستثناء يُسقط العملية قبل أن
 * تُغلق القاعدة إغلاقاً نظيفاً، فيُحوَّل عطلٌ يُسجَّل إلى عطلٍ يُفقد معه العمل.
 */
export async function appendCrashEntry(directory: string, entry: CrashEntry): Promise<void> {
  const path = join(directory, CRASH_LOG_NAME);
  try {
    await mkdir(dirname(path), { recursive: true });
    await trim(path);
    await appendFile(path, formatCrashEntry(entry), 'utf8');
  } catch {
    // مقصود: انظر تعليق الدالة.
  }
}

export async function readCrashLog(directory: string): Promise<string | null> {
  try {
    return await readFile(join(directory, CRASH_LOG_NAME), 'utf8');
  } catch {
    return null;
  }
}

/** «حذف السجلّ» — حين يطفئ المعلم الإعداد لا يبقى ما جُمع قبله. */
export async function clearCrashLog(directory: string): Promise<void> {
  await rm(join(directory, CRASH_LOG_NAME), { force: true });
}

async function trim(path: string): Promise<void> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return;
  }
  if (size <= MAX_BYTES) return;

  const text = await readFile(path, 'utf8');
  await writeFile(path, text.slice(Math.floor(text.length / 2)), 'utf8');
}
