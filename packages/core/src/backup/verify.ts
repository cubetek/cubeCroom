import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  DATABASE_NAME,
  FILES_DIR,
  MANIFEST_NAME,
  parseManifest,
  type BackupEntry,
  type BackupManifest,
} from './manifest.js';

/**
 * فحص نسخة احتياطية — النصف الثاني من «Archive يُنشأ ويُفحص».
 *
 * على مستويين عمداً:
 *   `deep: false` (الافتراضي) — وجود الملفات وأحجامها. تُنادى عند عرض قائمة
 *     T20: أربع نسخ × ٣١٤ م.ب تعني بصمة ١٫٢ ج.ب في كل مرة تُفتح فيها الشاشة.
 *   `deep: true` — بصمة كل ملف. تُنادى قبل الاستعادة وحدها (P6-3)، حيث الخطأ
 *     يعني استبدال بيانات الجهاز بأخرى تالفة.
 *
 * النسخة التالفة تُعاد بحالتها وسببها لا بخطأ يُرمى: اللوح يعرضها صفّاً أحمر،
 * والاستثناء يعني اختفاءها من القائمة.
 */

export type BackupStatus = 'complete' | 'damaged';

export type BackupReport = {
  readonly path: string;
  readonly name: string;
  readonly status: BackupStatus;
  readonly createdAt: Date | null;
  /** ما تشغله النسخة فعلاً على القرص — يُعرض حتى للتالفة. */
  readonly sizeBytes: number;
  /** رسالة عربية تُعرض كما هي تحت الصفّ الأحمر. */
  readonly reason?: string;
  readonly manifest?: BackupManifest;
};

export type VerifyOptions = {
  readonly deep?: boolean | undefined;
};

/** الرسالة منقولة حرفياً من لوح `T20Backup`. */
const INCOMPLETE = 'توقّفت قبل أن تكتمل — لا تصلح للاستعادة.';

export async function verifyBackup(path: string, options: VerifyOptions = {}): Promise<BackupReport> {
  const name = basename(path);
  const sizeBytes = await directorySize(path);
  const damaged = (reason: string, createdAt: Date | null = null): BackupReport => ({
    path,
    name,
    status: 'damaged',
    createdAt,
    sizeBytes,
    reason,
  });

  let raw: string;
  try {
    raw = await readFile(join(path, MANIFEST_NAME), 'utf8');
  } catch {
    // لا فهرس ⇦ النسخ توقّف قبل أن يُكتب. هذه الحالة بعينها في اللوح.
    return damaged(INCOMPLETE);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return damaged('فهرس هذه النسخة غير مقروء — لا يمكن التأكد من محتواها، فلا تصلح للاستعادة.');
  }

  const result = parseManifest(parsed);
  if (!result.ok) return damaged(result.reason);

  const manifest = result.manifest;
  const createdAt = new Date(manifest.createdAt);

  const database = await checkEntry(
    join(path, DATABASE_NAME),
    manifest.database,
    options.deep === true,
  );
  if (database !== null) {
    return damaged(
      database === 'missing'
        ? INCOMPLETE
        : 'قاعدة البيانات داخل هذه النسخة لا تطابق بصمتها المسجَّلة — تعرّض محتواها للتلف.',
      createdAt,
    );
  }

  let missing = 0;
  let mismatched = 0;
  for (const entry of manifest.files) {
    const problem = await checkEntry(
      join(path, FILES_DIR, entry.name),
      entry,
      options.deep === true,
    );
    if (problem === 'missing') missing += 1;
    else if (problem === 'mismatch') mismatched += 1;
  }

  if (missing > 0 && mismatched === 0 && missing === manifest.files.length) {
    return damaged(INCOMPLETE, createdAt);
  }
  if (missing > 0 || mismatched > 0) {
    return damaged(
      `${missing + mismatched} من مرفقات هذه النسخة ناقصة أو تالفة — استعادتها ستفقدها.`,
      createdAt,
    );
  }

  return { path, name, status: 'complete', createdAt, sizeBytes, manifest };
}

/**
 * قائمة النسخ لشاشة T20 — الأحدث أولاً، والتالفة معروضة لا مخفية.
 * فحص سطحي: انظر تعليق `verifyBackup`.
 */
export async function listBackups(root: string, options: VerifyOptions = {}): Promise<BackupReport[]> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }

  const reports: BackupReport[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    reports.push(await verifyBackup(join(root, entry.name), options));
  }

  // التالفة بلا تاريخ تنزل إلى الآخر بدل أن تتصدّر بصفر.
  return reports.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

type EntryProblem = 'missing' | 'mismatch' | null;

async function checkEntry(path: string, entry: BackupEntry, deep: boolean): Promise<EntryProblem> {
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) return 'missing';
    size = info.size;
  } catch {
    return 'missing';
  }

  if (size !== entry.sizeBytes) return 'mismatch';
  if (!deep) return null;

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex') === entry.sha256 ? null : 'mismatch';
}

async function directorySize(path: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      total += await directorySize(child);
    } else {
      total += await stat(child)
        .then((info) => info.size)
        .catch(() => 0);
    }
  }
  return total;
}
