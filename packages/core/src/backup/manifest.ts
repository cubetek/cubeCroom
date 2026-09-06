/**
 * فهرس النسخة الاحتياطية.
 *
 * وجود `manifest.json` هو تعريف اكتمال النسخة: يُكتب آخر شيء بعد نسخ القاعدة
 * وكل الملفات. فنسخةٌ بلا فهرس هي نسخةٌ توقّفت في منتصفها — وهي الحالة التي
 * يعرضها لوح `T20Backup` بصفّ أحمر لا بإخفائها.
 *
 * يحمل الفهرس ثلاثة أرقام إصدار متمايزة عمداً:
 *   `format`        صيغة الأرشيف نفسه — يتغيّر إن تغيّرت بنية المجلد.
 *   `schemaVersion` مخطط القاعدة — عليه يقوم فحص الاستعادة في P6-3.
 *   `app`           إصدار التطبيق — للعرض والدعم لا للقرار.
 * دمجها في رقم واحد يمنع ترقية أحدها بلا الآخر.
 */

import { DATABASE_FILE_NAME } from '../data-layout.js';

export const MANIFEST_NAME = 'manifest.json';
/** القاعدة تُحفظ في الأرشيف باسمها الحيّ نفسه، فالاستعادة نسخٌ لا إعادة تسمية. */
export const DATABASE_NAME = DATABASE_FILE_NAME;
export const FILES_DIR = 'files';

/** صيغة الأرشيف الحالية. تُرفض الأعلى منها عند الاستعادة. */
export const BACKUP_FORMAT_VERSION = 1;

export type BackupContents = {
  readonly classes: number;
  readonly lessons: number;
  readonly activities: number;
  readonly submissions: number;
  readonly files: number;
  readonly fileBytes: number;
};

export type BackupEntry = {
  readonly name: string;
  readonly sizeBytes: number;
  readonly sha256: string;
};

export type BackupManifest = {
  readonly format: number;
  readonly app: string;
  readonly schemaVersion: number;
  /** ISO 8601 — «اليوم ٧:١٥ ص» تُصاغ عند العرض لا تُخزَّن مصوغة. */
  readonly createdAt: string;
  readonly database: BackupEntry;
  readonly files: readonly BackupEntry[];
  readonly contents: BackupContents;
  readonly totalBytes: number;
};

export type ManifestParse =
  | { readonly ok: true; readonly manifest: BackupManifest }
  | { readonly ok: false; readonly reason: string };

/**
 * تحقّق يدويّ من بنية الفهرس.
 *
 * الفهرس ملفّنا نحن، لكنه يعيش خارج التطبيق: على قرص خارجي، أو منسوخاً
 * بيد المعلم، أو نصفَ مكتوب. فيُقرأ كمدخل غير موثوق ككل مدخل آخر.
 */
export function parseManifest(raw: unknown): ManifestParse {
  const damaged = (reason: string): ManifestParse => ({ ok: false, reason });

  if (typeof raw !== 'object' || raw === null) return damaged(UNREADABLE);
  const value = raw as Record<string, unknown>;

  if (typeof value.format !== 'number') return damaged(UNREADABLE);
  if (value.format > BACKUP_FORMAT_VERSION) return damaged(TOO_NEW);

  if (typeof value.app !== 'string') return damaged(UNREADABLE);
  if (typeof value.schemaVersion !== 'number') return damaged(UNREADABLE);
  if (typeof value.createdAt !== 'string' || Number.isNaN(Date.parse(value.createdAt))) {
    return damaged(UNREADABLE);
  }
  if (typeof value.totalBytes !== 'number') return damaged(UNREADABLE);

  const database = parseEntry(value.database);
  if (!database) return damaged(UNREADABLE);

  if (!Array.isArray(value.files)) return damaged(UNREADABLE);
  const files: BackupEntry[] = [];
  for (const entry of value.files) {
    const parsed = parseEntry(entry);
    if (!parsed) return damaged(UNREADABLE);
    files.push(parsed);
  }

  const contents = parseContents(value.contents);
  if (!contents) return damaged(UNREADABLE);

  return {
    ok: true,
    manifest: {
      format: value.format,
      app: value.app,
      schemaVersion: value.schemaVersion,
      createdAt: value.createdAt,
      database,
      files,
      contents,
      totalBytes: value.totalBytes,
    },
  };
}

const UNREADABLE =
  'فهرس هذه النسخة غير مقروء — لا يمكن التأكد من محتواها، فلا تصلح للاستعادة.';

const TOO_NEW =
  'هذه النسخة أُنشئت بإصدار أحدث من CubeCroom المثبَّت على هذا الجهاز. ' +
  'حدّث التطبيق ثم أعد المحاولة.';

function parseEntry(raw: unknown): BackupEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== 'string' || value.name === '') return null;
  if (typeof value.sizeBytes !== 'number') return null;
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) return null;
  return { name: value.name, sizeBytes: value.sizeBytes, sha256: value.sha256 };
}

function parseContents(raw: unknown): BackupContents | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const keys = ['classes', 'lessons', 'activities', 'submissions', 'files', 'fileBytes'] as const;
  const result: Record<string, number> = {};
  for (const key of keys) {
    if (typeof value[key] !== 'number') return null;
    result[key] = value[key];
  }
  return result as unknown as BackupContents;
}
