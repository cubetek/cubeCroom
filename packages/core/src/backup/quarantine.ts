import { mkdir, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { DATABASE_FILE_NAME } from '../data-layout.js';
import { FILES_DIR } from './manifest.js';

/**
 * عزل البيانات القائمة قبل استعادةٍ من قاعدة لا تُفتح — FR-015 · §22.
 *
 * **لماذا لا تُستعمل النسخة الاحتياطية العادية هنا:** `createBackup` يفتح
 * القاعدة ويقرأ منها. وفي هذا المسار **القاعدة نفسها هي العطل** — تالفة أو
 * أحدث من التطبيق — فلا شيء يُقرأ منها.
 *
 * والبديل ليس التخلّي عن الأمان بل تغيير شكله: تُنقل ملفات المعلم إلى مجلد
 * مؤرَّخ بجانبها **ولا تُحذف**. فإن تبيّن أن التلف كان في مكان آخر، أو أن
 * النسخة المستعادة أسوأ، فعمله كله باقٍ حيث يستطيع أن يريه لمن يفهم.
 *
 * والنقل لا النسخ: النسخ يحتاج ضعف المساحة على قرصٍ قد يكون ممتلئاً — وامتلاؤه
 * أحد أسباب تلف القاعدة أصلاً.
 */

export const QUARANTINE_PREFIX = 'Recovered';

export type QuarantineResult = {
  readonly path: string;
  /** ما نُقل فعلاً — قد لا يكون هناك مجلد ملفات أصلاً. */
  readonly moved: readonly string[];
};

export async function quarantineData(
  dataDirectory: string,
  now: Date = new Date(),
): Promise<QuarantineResult> {
  const path = join(dataDirectory, `${QUARANTINE_PREFIX}-${stamp(now)}`);
  await mkdir(path, { recursive: true });

  const moved: string[] = [];

  // ملفات SQLite الثلاثة معاً: القاعدة بلا سجلّ الكتابة (-wal) قاعدةٌ ناقصة.
  const databaseParts = [
    DATABASE_FILE_NAME,
    `${DATABASE_FILE_NAME}-wal`,
    `${DATABASE_FILE_NAME}-shm`,
  ];
  for (const name of databaseParts) {
    if (await move(join(dataDirectory, name), join(path, name))) moved.push(name);
  }

  if (await move(join(dataDirectory, FILES_DIR), join(path, FILES_DIR))) moved.push(FILES_DIR);

  return { path, moved };
}

/** أسماء المجلدات المعزولة الموجودة — تُعرض للمعلم ليعرف أين ذهب عمله. */
export async function listQuarantined(dataDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(dataDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(`${QUARANTINE_PREFIX}-`))
      .map((entry) => entry.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

async function move(from: string, to: string): Promise<boolean> {
  try {
    await rename(from, to);
    return true;
  } catch {
    return false;
  }
}

/** وقت محلي لا UTC: الاسم يقرؤه المعلم في مستكشف الملفات. */
function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}`
  );
}
