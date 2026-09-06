import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db, OpenResult } from '../open.js';
import { files, lessonFiles, lessonReads, lessons, students } from '../schema.js';
import type { Student } from './students.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Lesson = typeof lessons.$inferSelect;
export type LessonStatus = 'draft' | 'published';

export type LessonInput = {
  readonly classId: string;
  readonly title: string;
  readonly blocks?: unknown;
};

/**
 * الدروس — FR-008 و FR-009.
 *
 * قاعدة ملزِمة: `listPublished` هو المدخل الوحيد لبوابة الطالب. التصفية تتم
 * في الاستعلام لا في الواجهة، فإخفاء المسودة عند العرض ليس كافياً.
 */
export function lessonsRepository(db: Db, transaction: OpenResult['transaction']) {
  const require = (id: string): Lesson => {
    const row = db.select().from(lessons).where(eq(lessons.id, id)).get();
    if (!row) throw new NotFoundError('الدرس');
    return row;
  };

  return {
    get: require,

    /** Indexed lookup for a single published lesson, scoped to its classroom. */
    findPublished(id: string, classId: string): Lesson | undefined {
      return db.select().from(lessons).where(and(
        eq(lessons.id, id), eq(lessons.classId, classId), eq(lessons.status, 'published'),
      )).get();
    },

    listByClass(classId: string, { status }: { status?: LessonStatus } = {}): Lesson[] {
      const condition =
        status === undefined
          ? eq(lessons.classId, classId)
          : and(eq(lessons.classId, classId), eq(lessons.status, status));
      return db.select().from(lessons).where(condition).orderBy(desc(lessons.updatedAt)).all();
    },

    /** ما يراه الطالب — ولا شيء غيره. */
    listPublished(classId: string): Lesson[] {
      return db
        .select()
        .from(lessons)
        .where(and(eq(lessons.classId, classId), eq(lessons.status, 'published')))
        .orderBy(desc(lessons.publishedAt))
        .all();
    },

    create(input: LessonInput): Lesson {
      const timestamp = now();
      const row: Lesson = {
        id: newId(),
        classId: input.classId,
        title: input.title,
        blocks: input.blocks ?? [],
        status: 'draft',
        publishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.insert(lessons).values(row).run();
      return row;
    },

    update(id: string, patch: { title?: string; blocks?: unknown }): Lesson {
      const existing = require(id);
      const next = {
        title: patch.title ?? existing.title,
        blocks: patch.blocks === undefined ? existing.blocks : patch.blocks,
        updatedAt: now(),
      };
      db.update(lessons).set(next).where(eq(lessons.id, id)).run();
      return { ...existing, ...next };
    },

    setPublished(id: string, published: boolean): Lesson {
      const existing = require(id);
      const next = {
        status: published ? 'published' : 'draft',
        // إلغاء النشر يمحو تاريخه: إعادة النشر حدث جديد لا استئناف لقديم.
        publishedAt: published ? now() : null,
        updatedAt: now(),
      };
      db.update(lessons).set(next).where(eq(lessons.id, id)).run();
      return { ...existing, ...next };
    },

    remove(id: string): void {
      require(id);
      db.delete(lessons).where(eq(lessons.id, id)).run();
    },

    /**
     * «تكرار الدرس» في T12.
     *
     * النسخة **مسودة دائماً** ولو كان الأصل منشوراً: تكرار درسٍ منشور بغرض
     * تعديله ثم نشره لاحقاً هو الحالة المقصودة، ونسخةٌ تُنشر لحظة إنشائها
     * تُظهر لطلابه درساً مكرّراً نصفَ محرَّر.
     *
     * والمرفقات تُنسخ معه في المعاملة نفسها — NFR-005: نسخة بلا مرفقاتها
     * ليست نسخة.
     */
    duplicate(id: string): Lesson {
      const source = require(id);
      const timestamp = now();
      const copy: Lesson = {
        ...source,
        id: newId(),
        title: `${source.title} — نسخة`,
        status: 'draft',
        publishedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      transaction(() => {
        db.insert(lessons).values(copy).run();
        const attachments = db
          .select()
          .from(lessonFiles)
          .where(eq(lessonFiles.lessonId, id))
          .all();
        for (const row of attachments) {
          db.insert(lessonFiles)
            .values({ lessonId: copy.id, fileId: row.fileId, position: row.position })
            .run();
        }
      });

      return copy;
    },

    /** أعداد بطاقة T12: المرفقات، ومن قرأه من الطلاب. */
    stats(classId: string): Map<string, { attachments: number; reads: number }> {
      const result = new Map<string, { attachments: number; reads: number }>();
      const ids = db
        .select({ id: lessons.id })
        .from(lessons)
        .where(eq(lessons.classId, classId))
        .all()
        .map((row) => row.id);
      for (const id of ids) result.set(id, { attachments: 0, reads: 0 });

      // فصلٌ بلا دروس: لا جدول يُقرأ أصلاً.
      if (ids.length === 0) return result;

      /*
       * **المسحان محصوران بدروس هذا الفصل — `inArray` لا ترشيحٌ في JavaScript.**
       *
       * كانا يقرآن الجدولين كاملين ثم يُسقطان ما ليس من الفصل. و`lesson_reads`
       * ينمو حاصلَ ضرب الطلاب في الدروس المنشورة، فهو أكبر جدول في القاعدة
       * عند صفٍّ كامل. وهذه الدالّة تُنادى **في مسار الطالب** (قائمة دروسه)،
       * أي مرةً لكل طالب مع كل فتح صفحة: ثلاثون طالباً يعني ثلاثين مسحاً
       * كاملاً في اللحظة نفسها، وألفُ طالبٍ ألفَ مسح.
       *
       * والفهرس `lesson_reads_pk` بادئته `lesson_id`، فالحصر به مخدومٌ
       * بالفهرس. وهذا هو النمط نفسه الذي تتبعه `activities.tally` أصلاً.
       */
      for (const row of db
        .select({ lessonId: lessonFiles.lessonId })
        .from(lessonFiles)
        .where(inArray(lessonFiles.lessonId, ids))
        .all()) {
        const entry = result.get(row.lessonId);
        if (entry) entry.attachments += 1;
      }

      for (const row of db
        .select({ lessonId: lessonReads.lessonId })
        .from(lessonReads)
        .where(inArray(lessonReads.lessonId, ids))
        .all()) {
        const entry = result.get(row.lessonId);
        if (entry) entry.reads += 1;
      }

      return result;
    },

    /**
     * أثر القراءة — «قرأه الطلاب» في T12 و«مقروء» في S05.
     * قيد `unique` في المخطط يجعل إعادة الفتح لا تُضاعف الأثر، فالكتابة
     * تتجاهل التكرار بدل أن تفشل عند كل فتحة ثانية.
     */
    markRead(lessonId: string, studentId: string): void {
      db.insert(lessonReads)
        .values({ lessonId, studentId, readAt: now() })
        .onConflictDoNothing()
        .run();
    },

    readBy(studentId: string): string[] {
      return db
        .select({ lessonId: lessonReads.lessonId })
        .from(lessonReads)
        .where(eq(lessonReads.studentId, studentId))
        .all()
        .map((row) => row.lessonId);
    },

    /**
     * من لم يقرأ الدرس بعد — أسماؤهم لا عددهم.
     *
     * **البناء من الفصل نحو أثر القراءة لا العكس.** `students.remove` علامة لا
     * حذف، و`lesson_reads` لا يُنظَّف بعده، فأثر قراءة من أخرجه المعلم يبقى
     * أبداً. من بنى القائمة من الجدول ثم طرح عاد إلى المعلم باسمٍ أخرجه بنفسه،
     * أو أنقص العدّ عليه. لذا الشرط هنا هو شرط `students.listByClass` حرفاً
     * بحرف: فصلُ الدرس، وغير المُخرَجين، مرتّبين بالاسم.
     *
     * واستعلامان اثنان لا غير: الفصل مرة، وقُرّاء **هذا الدرس** مرة، ثم الفرق
     * في الذاكرة. ونداء `readBy` لكل طالب ممنوع: بادئة `lesson_reads_pk` هي
     * `lesson_id`، فالترشيح بـ `student_id` مسحٌ كامل لأكبر جدول في القاعدة —
     * ألف طالبٍ تعني ألف مسحٍ في ضغطةٍ واحدة، والعملية الرئيسية تتجمّد.
     */
    unreadStudents(lessonId: string): Student[] {
      const lesson = require(lessonId);
      const roster = db
        .select()
        .from(students)
        .where(and(eq(students.classId, lesson.classId), isNull(students.removedAt)))
        .orderBy(asc(students.name))
        .all();

      const readers = new Set(
        db
          .select({ studentId: lessonReads.studentId })
          .from(lessonReads)
          .where(eq(lessonReads.lessonId, lessonId))
          .all()
          .map((row) => row.studentId),
      );

      return roster.filter((student) => !readers.has(student.id));
    },

    listAttachments(lessonId: string) {
      return db
        .select({ file: files, position: lessonFiles.position })
        .from(lessonFiles)
        .innerJoin(files, eq(files.id, lessonFiles.fileId))
        .where(eq(lessonFiles.lessonId, lessonId))
        .orderBy(asc(lessonFiles.position))
        .all()
        .map((row) => row.file);
    },

    /**
     * استبدال مرفقات الدرس دفعةً واحدة — NFR-005: «أي كتابة حرجة تكون
     * Transactional». الحذف والإدراج داخل معاملة واحدة، فإن فشل الإدراج
     * (مرجع ملف غير موجود مثلاً) لا يبقى الدرس بلا مرفقاته.
     */
    replaceAttachments(lessonId: string, fileIds: readonly string[]): void {
      require(lessonId);
      transaction(() => {
        db.delete(lessonFiles).where(eq(lessonFiles.lessonId, lessonId)).run();
        fileIds.forEach((fileId, position) => {
          db.insert(lessonFiles).values({ lessonId, fileId, position }).run();
        });
        db.update(lessons).set({ updatedAt: now() }).where(eq(lessons.id, lessonId)).run();
      });
    },
  };
}
