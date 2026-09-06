import { eq } from 'drizzle-orm';
import type { Db } from '../open.js';
import { teacher } from '../schema.js';
import { newId, now } from '../ids.js';

export type Teacher = typeof teacher.$inferSelect;

export type TeacherInput = {
  readonly name: string;
  readonly institution?: string | null | undefined;
};

/**
 * بيانات المعلم — صفّ واحد. T03 يكتبها في أول تشغيل، و T22 يعدّلها لاحقاً.
 */
export function teacherRepository(db: Db) {
  return {
    get(): Teacher | undefined {
      return db.select().from(teacher).limit(1).get();
    },

    /**
     * يُنشئ الصفّ إن لم يوجد، ويعدّله إن وُجد.
     * أول تشغيل وتعديل الإعدادات مسار واحد — فلا تحتاج الواجهة أن تعرف أيّهما.
     */
    save(input: TeacherInput): Teacher {
      const existing = db.select().from(teacher).limit(1).get();
      const timestamp = now();

      if (existing) {
        db.update(teacher)
          .set({
            name: input.name,
            institution: input.institution ?? null,
            updatedAt: timestamp,
          })
          .where(eq(teacher.id, existing.id))
          .run();
        return { ...existing, name: input.name, institution: input.institution ?? null, updatedAt: timestamp };
      }

      const row: Teacher = {
        id: newId(),
        name: input.name,
        institution: input.institution ?? null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.insert(teacher).values(row).run();
      return row;
    },
  };
}
