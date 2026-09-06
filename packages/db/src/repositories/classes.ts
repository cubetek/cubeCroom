import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../open.js';
import { activities, classes, lessons, students } from '../schema.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Class = typeof classes.$inferSelect;

/** بطاقة الفصل في T06 — الصفّ مع أعداده. */
export type ClassSummary = Class & {
  readonly students: number;
  readonly lessons: number;
  readonly activities: number;
  readonly hasDraft: boolean;
};

/** يعدّ الصفوف حسب الفصل في مرور واحد. */
function tally(rows: ReadonlyArray<{ classId: string }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.classId, (counts.get(row.classId) ?? 0) + 1);
  return counts;
}

export type ClassInput = {
  readonly name: string;
  readonly subject?: string | null | undefined;
  readonly level?: string | null | undefined;
  readonly description?: string | null | undefined;
};

/**
 * الفصول — FR-003: «إنشاء/تعديل/أرشفة».
 *
 * الأرشفة ليست حذفاً: الفصل يبقى بطلابه وإجاباتهم ويخرج من المسار اليومي فقط.
 * الحذف الفعلي متاح لكنه يمرّ بتأكيد مدمّر في الواجهة (T07States).
 */
export function classesRepository(db: Db) {
  const require = (id: string): Class => {
    const row = db.select().from(classes).where(eq(classes.id, id)).get();
    if (!row) throw new NotFoundError('الفصل');
    return row;
  };

  return {
    get: require,

    /** الافتراضي يخفي المؤرشفة — المسار اليومي لا يُثقل بما أُخرج منه. */
    list({ includeArchived = false } = {}): Class[] {
      const query = db.select().from(classes);
      const rows = includeArchived
        ? query.orderBy(desc(classes.updatedAt)).all()
        : query.where(isNull(classes.archivedAt)).orderBy(desc(classes.updatedAt)).all();
      return rows;
    },

    create(input: ClassInput): Class {
      const timestamp = now();
      const row: Class = {
        id: newId(),
        name: input.name,
        subject: input.subject ?? null,
        level: input.level ?? null,
        description: input.description ?? null,
        archivedAt: null,
        studentAiEnabled: false,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.insert(classes).values(row).run();
      return row;
    },

    update(id: string, patch: Partial<ClassInput>): Class {
      const existing = require(id);
      const next = {
        name: patch.name ?? existing.name,
        subject: patch.subject === undefined ? existing.subject : (patch.subject ?? null),
        level: patch.level === undefined ? existing.level : (patch.level ?? null),
        description:
          patch.description === undefined ? existing.description : (patch.description ?? null),
        updatedAt: now(),
      };
      db.update(classes).set(next).where(eq(classes.id, id)).run();
      return { ...existing, ...next };
    },

    setArchived(id: string, archived: boolean): Class {
      const existing = require(id);
      const archivedAt = archived ? now() : null;
      db.update(classes).set({ archivedAt, updatedAt: now() }).where(eq(classes.id, id)).run();
      return { ...existing, archivedAt };
    },

    /** PRD §23: مساعدة الطالب تُفعَّل لكل فصل على حدة، لا مرة واحدة للجميع. */
    setStudentAiEnabled(id: string, enabled: boolean): Class {
      const existing = require(id);
      db.update(classes)
        .set({ studentAiEnabled: enabled, updatedAt: now() })
        .where(eq(classes.id, id))
        .run();
      return { ...existing, studentAiEnabled: enabled };
    },

    /** حذف نهائي — يجرّ معه الطلاب والدروس والأنشطة بـ cascade. */
    remove(id: string): void {
      require(id);
      db.delete(classes).where(eq(classes.id, id)).run();
    },

    /**
     * بطاقات T06 بأعدادها: «٢٤ طالباً · ٨ دروس · ٣ أنشطة» ووسم «درس مسودة».
     *
     * أربعة استعلامات مجمَّعة ثم دمج في الذاكرة، لا استعلام مرتبط لكل بطاقة:
     * ستة فصول تعني ١٩ استعلاماً بالطريقة الثانية. والأعداد تُحسب هنا لا في
     * الواجهة، فلا تُنقل صفوف لا تُعرض.
     */
    listSummaries({ includeArchived = false } = {}): ClassSummary[] {
      const rows = includeArchived
        ? db.select().from(classes).orderBy(desc(classes.updatedAt)).all()
        : db
            .select()
            .from(classes)
            .where(isNull(classes.archivedAt))
            .orderBy(desc(classes.updatedAt))
            .all();

      const studentCounts = tally(
        db
          .select({ classId: students.classId })
          .from(students)
          .where(isNull(students.removedAt))
          .all(),
      );
      const activityCounts = tally(db.select({ classId: activities.classId }).from(activities).all());

      const lessonRows = db
        .select({ classId: lessons.classId, status: lessons.status })
        .from(lessons)
        .all();
      const lessonCounts = tally(lessonRows);
      const drafts = new Set(
        lessonRows.filter((row) => row.status === 'draft').map((row) => row.classId),
      );

      return rows.map((row) => ({
        ...row,
        students: studentCounts.get(row.id) ?? 0,
        lessons: lessonCounts.get(row.id) ?? 0,
        activities: activityCounts.get(row.id) ?? 0,
        hasDraft: drafts.has(row.id),
      }));
    },

    countActive(): number {
      return db.select().from(classes).where(and(isNull(classes.archivedAt))).all().length;
    },
  };
}
