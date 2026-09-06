import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { FileCopyFailedError, FileDataMissingError, UnsafeStorageNameError } from '../errors.js';
import { classify, type FileClassification } from './classify.js';

/**
 * مخزن الملفات المحلي — SEC-006.
 *
 * المرفق يُنسخ إلى مجلد بيانات المعلم باسم UUID، لا باسمه الأصلي: اسم يكتبه
 * المستخدم قد يحمل فواصل مسارات أو محارف يرفضها النظام، وقد يتصادم مع اسم
 * آخر. الاسم الأصلي يبقى في القاعدة للعرض — «ورقة عمل — دورة الماء» في T18
 * تأتي من هناك لا من القرص.
 *
 * الامتداد يبقى ملحقاً بالـ UUID عمداً: لوح T18 فيه «فتح المجلد على الجهاز»،
 * ومجلدٌ من أسماء بلا امتدادات لا يفتحه نظام التشغيل ولا يميّزه المعلم.
 *
 * المجلد مسطّح بلا تفريع: مقياس PRD §23 معلمٌ واحد وثلاثون طالباً، لا ملايين
 * الملفات. والتفريع يجعل «فتح المجلد» متاهةً بلا مقابل.
 */

export type AddedFile = {
  /** الاسم الأصلي كما اختاره المعلم — للعرض فقط، لا يلمس القرص. */
  readonly name: string;
  /** اسم النسخة على القرص: UUID مع الامتداد. */
  readonly storageName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly kind: string;
  readonly mimeType: string;
} & Pick<FileClassification, 'category' | 'badge'>;

export type CopyProgress = {
  readonly copied: number;
  /** الحجم المتوقّع من نظام الملفات — يقابل «١٨٫٤ م.ب من ٢٨٫٦ م.ب» في T13Upload. */
  readonly total: number;
};

export type AddOptions = {
  /**
   * اسم يُعرض للمعلم بدل اسم الملف على قرصه.
   * يُستعمل حين يأتي المحتوى من غير منتقي ملفات.
   */
  readonly displayName?: string | undefined;
  readonly onProgress?: ((progress: CopyProgress) => void) | undefined;
  readonly signal?: AbortSignal | undefined;
};

export type FileStore = ReturnType<typeof createFileStore>;

/** UUID، وامتداد لاتيني قصير اختياري — لا شيء غيره يصل إلى join. */
const STORAGE_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(\.[a-z0-9]{1,12})?$/;

const PARTIAL_SUFFIX = '.part';

export function filesDirectory(dataDirectory: string): string {
  return join(dataDirectory, 'files');
}

export function createFileStore(dataDirectory: string) {
  const directory = filesDirectory(dataDirectory);

  const ensureReady = async (): Promise<void> => {
    await mkdir(directory, { recursive: true });
  };

  /** كل مسار يُبنى هنا وحده. لا join بمدخل غير مفحوص في هذا الملف. */
  const resolve = (storageName: string): string => {
    if (!STORAGE_NAME.test(storageName)) throw new UnsafeStorageNameError(storageName);
    return join(directory, storageName);
  };

  return {
    /** يُعرض في T18 عبر «فتح المجلد على الجهاز». */
    directory,
    ensureReady,
    resolve,

    /**
     * ينسخ الملف إلى المخزن ويعيد بياناته الوصفية — التسجيل في القاعدة
     * مسؤولية `filesRepository.register` بعد نجاح هذه العملية.
     *
     * النسخ يمرّ باسم مؤقّت `.part` ثم يُعاد تسميته: إعادة التسمية داخل
     * المجلد نفسه ذرّية، فلا يظهر في المخزن ملف نصفيّ إن انقطع النسخ أو
     * أُغلق التطبيق في أثنائه.
     *
     * والبصمة تُحسب في مرور القراءة نفسه: قراءة مقطع فيديو مرتين لحساب
     * sha256 تضاعف زمن الرفع بلا سبب.
     */
    async add(sourcePath: string, options: AddOptions = {}): Promise<AddedFile> {
      await ensureReady();

      let total = 0;
      let name: string;
      try {
        const info = await stat(sourcePath);
        if (!info.isFile()) throw new Error('المصدر ليس ملفاً');
        total = info.size;
        name = options.displayName ?? baseName(sourcePath);
      } catch (error) {
        throw new FileCopyFailedError(error);
      }

      const classification = classify(name);
      const storageName =
        classification.extension === ''
          ? randomUUID()
          : `${randomUUID()}.${classification.extension}`;
      const target = join(directory, storageName);
      const partial = `${target}${PARTIAL_SUFFIX}`;

      const hash = createHash('sha256');
      let copied = 0;

      try {
        await pipeline(
          createReadStream(sourcePath),
          async function* (source: AsyncIterable<Buffer>) {
            for await (const chunk of source) {
              hash.update(chunk);
              copied += chunk.length;
              options.onProgress?.({ copied, total });
              yield chunk;
            }
          },
          createWriteStream(partial),
          options.signal ? { signal: options.signal } : {},
        );
        await rename(partial, target);
      } catch (error) {
        await unlink(partial).catch(() => undefined);
        throw new FileCopyFailedError(error);
      }

      return {
        name,
        storageName,
        // المنسوخ فعلاً لا ما قاله stat: الملف قد يتغيّر تحت النسخ.
        sizeBytes: copied,
        sha256: hash.digest('hex'),
        kind: classification.kind,
        mimeType: classification.mimeType,
        category: classification.category,
        badge: classification.badge,
      };
    },

    async exists(storageName: string): Promise<boolean> {
      try {
        const info = await stat(resolve(storageName));
        return info.isFile();
      } catch {
        return false;
      }
    },

    async read(storageName: string): Promise<Buffer> {
      try {
        return await readFile(resolve(storageName));
      } catch (error) {
        if (isMissing(error)) throw new FileDataMissingError();
        throw error;
      }
    },

    /** للتقديم المتدفّق: مرفق بحجم ٢٨ م.ب لا يُحمَّل في الذاكرة ليُرسَل. */
    openRead(storageName: string): ReadStream {
      return createReadStream(resolve(storageName));
    },

    /**
     * يحذف النسخة من القرص. يُنادى بعد نجاح الحذف من القاعدة لا قبله:
     * صفٌّ يشير إلى ملف مفقود يظهر خطأً للمعلم، وملفٌّ بلا صفّ يشغل مساحة
     * ولا يؤذي — والثاني أهون.
     */
    async remove(storageName: string): Promise<boolean> {
      try {
        await unlink(resolve(storageName));
        return true;
      } catch (error) {
        if (isMissing(error)) return false;
        throw error;
      }
    },

    /**
     * يمسح بقايا `.part` من نسخٍ انقطع بإغلاق مفاجئ.
     * يُنادى عند الإقلاع: هذه البقايا لا يشير إليها أي صفّ، فلا شيء يحذفها.
     */
    async sweepPartials(): Promise<number> {
      let removed = 0;
      let entries: string[];
      try {
        entries = await readdir(directory);
      } catch (error) {
        if (isMissing(error)) return 0;
        throw error;
      }
      for (const entry of entries) {
        if (!entry.endsWith(PARTIAL_SUFFIX)) continue;
        await unlink(join(directory, entry)).catch(() => undefined);
        removed += 1;
      }
      return removed;
    },
  };
}

/** آخر مقطع بعد أيّ من الفاصلين — مسار ويندوز قد يصل بفواصل مختلطة. */
function baseName(filePath: string): string {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
