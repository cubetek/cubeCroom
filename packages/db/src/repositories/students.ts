import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../open.js';
import { students } from '../schema.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Student = typeof students.$inferSelect;

export type StudentInput = {
  readonly classId: string;
  readonly name: string;
  readonly identifier?: string | null | undefined;
};

/**
 * الطلاب المقبولون في فصل.
 *
 * «مقبول» هنا حالة دائمة تبقى بين الحصص. أمّا «متصل الآن» فحالة لحظية تُشتق
 * من `student_sessions` ولا تُخزَّن في هذا الجدول — التمييز بينهما مطلب
 * صريح في T11: «Distinguish approved vs active now».
 */
export function studentsRepository(db: Db) {
  const require = (id: string): Student => {
    const row = db.select().from(students).where(eq(students.id, id)).get();
    if (!row) throw new NotFoundError('الطالب');
    return row;
  };

  return {
    get: require,

    listByClass(classId: string, { includeRemoved = false } = {}): Student[] {
      const condition = includeRemoved
        ? eq(students.classId, classId)
        : and(eq(students.classId, classId), isNull(students.removedAt));
      return db.select().from(students).where(condition).orderBy(asc(students.name)).all();
    },

    /** يُستدعى عند قبول طلب الدخول — لا قبل ذلك (FR-005). */
    add(input: StudentInput): Student {
      const timestamp = now();
      const row: Student = {
        id: newId(),
        classId: input.classId,
        name: input.name,
        identifier: input.identifier ?? null,
        approvedAt: timestamp,
        removedAt: null,
        lastSeenAt: null,
        createdAt: timestamp,
      };
      db.insert(students).values(row).run();
      return row;
    },

    rename(id: string, name: string, identifier?: string | null): Student {
      const existing = require(id);
      const next = { name, identifier: identifier === undefined ? existing.identifier : identifier };
      db.update(students).set(next).where(eq(students.id, id)).run();
      return { ...existing, ...next };
    },

    /**
     * إزالة من الفصل — علامة لا حذف صفّ.
     * حذفه فعلياً يجرّ إجاباته معه، فتصير نتائج النشاط ناقصة بلا تفسير.
     */
    remove(id: string): Student {
      const existing = require(id);
      const removedAt = now();
      db.update(students).set({ removedAt }).where(eq(students.id, id)).run();
      return { ...existing, removedAt };
    },

    touchLastSeen(id: string): void {
      db.update(students).set({ lastSeenAt: now() }).where(eq(students.id, id)).run();
    },
  };
}
