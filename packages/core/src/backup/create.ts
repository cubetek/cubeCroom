import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BackupFailedError } from '../errors.js';
import type { FileStore } from '../files/store.js';
import {
  BACKUP_FORMAT_VERSION,
  DATABASE_NAME,
  FILES_DIR,
  MANIFEST_NAME,
  type BackupContents,
  type BackupEntry,
  type BackupManifest,
} from './manifest.js';

/**
 * إنشاء نسخة احتياطية — «إنشاء نسخة احتياطية الآن» في T20.
 *
 * الأرشيف **مجلد** لا ملفاً واحداً مضغوطاً:
 *   ١. لا يحتاج مكتبة ضغط، فلا تبعية جديدة في مسار حماية البيانات.
 *   ٢. سلامته تُفحص ملفاً ملفاً ببصمة كلٍّ منها في الفهرس، لا بمجموع تحقّق
 *      واحد لا يقول أيّ جزء تلف.
 *   ٣. «فتح مجلد النسخ» في اللوح يفتح شيئاً مفهوماً للمعلم.
 * الكلفة: نقله إلى قرص خارجي نسخُ مجلد لا نسخُ ملف. مقبولة لأن المجلد
 * قابل للسحب كما هو.
 *
 * القاعدة تُنسخ عبر واجهة النسخ الاحتياطي في SQLite لا بنسخ الملف: قاعدة في
 * وضع WAL لها ملفات مصاحبة، ونسخُ ملفها وحده أثناء الكتابة ينتج قاعدة تالفة
 * تبدو سليمة.
 */

/**
 * المكان الافتراضي: `…\CubeCroom\Backups` كما في لوح T20 حرفياً.
 *
 * داخل مجلد البيانات لا خارجه، ولا خطر من ذلك: النسخة تُبنى من القاعدة ومجلد
 * `files` بالاسم لا بنسخ مجلد البيانات كله، فلا تلتهم النسخُ بعضها.
 * والمعلم يستطيع تغييره من «تغيير المكان» — وقرصٌ خارجي أفضل، وهو ما تنصح به
 * الشاشة نفسها.
 */
export function defaultBackupsDirectory(dataDirectory: string): string {
  return join(dataDirectory, 'Backups');
}

/** ما نحتاجه من الاتصال — بنيةً لا استيراداً، فتبقى core مستقلة عن packages/db. */
export type DatabaseSource = {
  readonly backup: (destination: string) => Promise<unknown>;
};

export type CreateBackupOptions = {
  /** مجلد النسخ المعروض في T20. يُنشأ إن لم يكن موجوداً. */
  readonly destinationRoot: string;
  readonly database: DatabaseSource;
  readonly fileStore: FileStore;
  /** أسماء نسخ الملفات على القرص — من `repositories.stats.storageNames()`. */
  readonly storageNames: readonly string[];
  readonly contents: BackupContents;
  readonly appVersion: string;
  readonly schemaVersion: number;
  readonly now?: Date | undefined;
  readonly onProgress?: ((progress: BackupProgress) => void) | undefined;
};

export type BackupProgress = {
  readonly step: 'database' | 'files' | 'manifest';
  /** عدد الملفات المنسوخة من المجموع — الخطوة الأطول. */
  readonly copiedFiles: number;
  readonly totalFiles: number;
};

export type BackupSummary = {
  readonly path: string;
  readonly name: string;
  readonly manifest: BackupManifest;
};

export async function createBackup(options: CreateBackupOptions): Promise<BackupSummary> {
  const createdAt = options.now ?? new Date();
  const root = options.destinationRoot;

  await mkdir(root, { recursive: true }).catch((cause: unknown) => {
    throw new BackupFailedError(cause);
  });

  const name = await uniqueName(root, folderName(createdAt));
  const path = join(root, name);

  try {
    await mkdir(join(path, FILES_DIR), { recursive: true });

    options.onProgress?.({ step: 'database', copiedFiles: 0, totalFiles: options.storageNames.length });
    const databasePath = join(path, DATABASE_NAME);
    await options.database.backup(databasePath);
    const database = await entryOf(databasePath, DATABASE_NAME);

    const files: BackupEntry[] = [];
    let copiedFiles = 0;
    for (const storageName of options.storageNames) {
      const source = options.fileStore.resolve(storageName);
      const target = join(path, FILES_DIR, storageName);
      const entry = await copyWithHash(source, target, storageName);
      files.push(entry);
      copiedFiles += 1;
      options.onProgress?.({
        step: 'files',
        copiedFiles,
        totalFiles: options.storageNames.length,
      });
    }

    const totalBytes = database.sizeBytes + files.reduce((sum, file) => sum + file.sizeBytes, 0);

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT_VERSION,
      app: options.appVersion,
      schemaVersion: options.schemaVersion,
      createdAt: createdAt.toISOString(),
      database,
      files,
      contents: options.contents,
      totalBytes,
    };

    // الفهرس آخر ما يُكتب: وجودُه هو ما يجعل النسخة صالحة للاستعادة.
    options.onProgress?.({
      step: 'manifest',
      copiedFiles,
      totalFiles: options.storageNames.length,
    });
    await writeFile(join(path, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return { path, name, manifest };
  } catch (cause) {
    // المجلد الناقص يبقى: اللوح يعرضه صفّاً أحمر «توقّفت قبل أن تكتمل»،
    // ومحوُه يخفي عن المعلم أن محاولةً جرت وفشلت. يُحذف بزر «حذف» وحده.
    throw new BackupFailedError(cause, path);
  }
}

/** `2026-09-04_07-15-00` — يرتّب أبجدياً كما يرتّب زمنياً. */
function folderName(at: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
    `_${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`
  );
}

/** نسختان في الثانية نفسها ممكنتان — لا تُكتب إحداهما فوق الأخرى. */
async function uniqueName(root: string, base: string): Promise<string> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    try {
      await stat(join(root, candidate));
    } catch {
      return candidate;
    }
  }
  throw new BackupFailedError(new Error('تعذّر إيجاد اسم غير مستعمل لمجلد النسخة'));
}

async function copyWithHash(source: string, target: string, name: string): Promise<BackupEntry> {
  const hash = createHash('sha256');
  let sizeBytes = 0;

  await pipeline(
    createReadStream(source),
    async function* (chunks: AsyncIterable<Buffer>) {
      for await (const chunk of chunks) {
        hash.update(chunk);
        sizeBytes += chunk.length;
        yield chunk;
      }
    },
    createWriteStream(target),
  );

  return { name, sizeBytes, sha256: hash.digest('hex') };
}

async function entryOf(path: string, name: string): Promise<BackupEntry> {
  const hash = createHash('sha256');
  let sizeBytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk as Buffer);
    sizeBytes += (chunk as Buffer).length;
  }
  return { name, sizeBytes, sha256: hash.digest('hex') };
}

/** يحذف مجلد نسخة — زر «حذف» في صفّ النسخة التالفة. */
export async function deleteBackup(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}
