import { desc, eq } from 'drizzle-orm';
import type { Db, OpenResult } from '../open.js';
import { activities, activityFiles, files, lessonFiles, lessons } from '../schema.js';
import { newId, now } from '../ids.js';
import { FileInUseError, NotFoundError } from '../errors.js';

export type StoredFile = typeof files.$inferSelect;

export type FileInput = {
  readonly name: string;
  /** نوع مقروء للإنسان: «مستند PDF» · «صورة» · «مقطع فيديو». */
  readonly kind: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  /** اسم الملف على القرص داخل مجلد البيانات — UUID لا اسم المستخدم. */
  readonly storageName: string;
  readonly sha256?: string | null | undefined;
};

export type FileUsage = {
  readonly kind: 'lesson' | 'activity';
  readonly id: string;
  readonly title: string;
  readonly published: boolean;
};

/**
 * مكتبة الملفات المحلية — T18.
 *
 * محور هذه الشاشة عمود «مستخدَم في»: بدونه لا يمكن تنفيذ الملاحظة الوحيدة
 * التي يفردها المصدر لـ T18 وهي «Warn before deleting used file».
 */
export function filesRepository(db: Db, transaction: OpenResult['transaction']) {
  const require = (id: string): StoredFile => {
    const row = db.select().from(files).where(eq(files.id, id)).get();
    if (!row) throw new NotFoundError('الملف');
    return row;
  };

  /** المواضع بأسمائها لا بعددها — الحوار يعدّدها للمعلم قبل أن يقرر. */
  const usage = (fileId: string): FileUsage[] => {
    const fromLessons = db
      .select({ id: lessons.id, title: lessons.title, status: lessons.status })
      .from(lessonFiles)
      .innerJoin(lessons, eq(lessons.id, lessonFiles.lessonId))
      .where(eq(lessonFiles.fileId, fileId))
      .all()
      .map<FileUsage>((row) => ({
        kind: 'lesson',
        id: row.id,
        title: row.title,
        published: row.status === 'published',
      }));

    const fromActivities = db
      .select({ id: activities.id, title: activities.title, status: activities.status })
      .from(activityFiles)
      .innerJoin(activities, eq(activities.id, activityFiles.activityId))
      .where(eq(activityFiles.fileId, fileId))
      .all()
      .map<FileUsage>((row) => ({
        kind: 'activity',
        id: row.id,
        title: row.title,
        published: row.status === 'published',
      }));

    return [...fromLessons, ...fromActivities];
  };

  return {
    get: require,
    usage,

    list(): StoredFile[] {
      return db.select().from(files).orderBy(desc(files.createdAt)).all();
    },

    register(input: FileInput): StoredFile {
      const row: StoredFile = {
        id: newId(),
        name: input.name,
        kind: input.kind,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        storageName: input.storageName,
        sha256: input.sha256 ?? null,
        createdAt: now(),
      };
      db.insert(files).values(row).run();
      return row;
    },

    /**
     * حذف محروس: يرفض إن كان الملف مستخدَماً، ويعيد المواضع في الخطأ نفسه
     * فلا تحتاج الواجهة استعلاماً ثانياً لتبني التحذير.
     *
     * الحذف من القاعدة فقط — إزالة الملف من القرص مسؤولية طبقة التخزين،
     * وتُنفَّذ بعد نجاح هذه العملية لا قبلها.
     */
    remove(id: string): StoredFile {
      const file = require(id);
      const usedBy = usage(id);
      if (usedBy.length > 0) {
        throw new FileInUseError(usedBy.map(({ kind, title }) => ({ kind, title })));
      }
      db.delete(files).where(eq(files.id, id)).run();
      return file;
    },

    /**
     * حذف مع فكّ الارتباط من كل موضع — الخيار الثاني في حوار T18DeleteWarn.
     * معاملة واحدة: لا يبقى درس يشير إلى ملف محذوف.
     */
    removeWithLinks(id: string): StoredFile {
      const file = require(id);
      transaction(() => {
        db.delete(lessonFiles).where(eq(lessonFiles.fileId, id)).run();
        db.delete(activityFiles).where(eq(activityFiles.fileId, id)).run();
        db.delete(files).where(eq(files.id, id)).run();
      });
      return file;
    },
  };
}
