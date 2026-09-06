import { count, sum } from 'drizzle-orm';
import type { Db } from '../open.js';
import { activities, classes, files, lessons, submissions } from '../schema.js';

/**
 * أعداد ما في القاعدة — سطر «تشمل …» في بطاقة T20.
 *
 * «آخر نسخة احتياطية» رقمٌ بلا معنى ما لم يُعرَف ما بداخلها، فهذه الأعداد
 * تُكتب في فهرس النسخة نفسها لا تُحسب عند العرض: بعد الاستعادة أو نقل الأرشيف
 * إلى جهاز آخر لا تبقى قاعدةٌ تُسأل.
 *
 * لا يستثني المؤرشف: النسخة الاحتياطية تحفظ كل شيء، والأرشفة إخفاء من الواجهة
 * لا حذف.
 */

export type Contents = {
  readonly classes: number;
  readonly lessons: number;
  readonly activities: number;
  /** تُعرض للمعلم بكلمة «إجابة» — «١٨٦ إجابة» في اللوح. */
  readonly submissions: number;
  readonly files: number;
  readonly fileBytes: number;
};

export function statsRepository(db: Db) {
  return {
    contents(): Contents {
      const one = (value: { n: number } | undefined): number => value?.n ?? 0;

      const bytes = db.select({ total: sum(files.sizeBytes) }).from(files).get();

      return {
        classes: one(db.select({ n: count() }).from(classes).get()),
        lessons: one(db.select({ n: count() }).from(lessons).get()),
        activities: one(db.select({ n: count() }).from(activities).get()),
        submissions: one(db.select({ n: count() }).from(submissions).get()),
        files: one(db.select({ n: count() }).from(files).get()),
        // sum يعيد نصّاً في SQLite، و null على جدول فارغ.
        fileBytes: Number(bytes?.total ?? 0),
      };
    },

    /** أسماء النسخ على القرص — ما يجب أن تحمله النسخة الاحتياطية معها. */
    storageNames(): string[] {
      return db
        .select({ storageName: files.storageName })
        .from(files)
        .all()
        .map((row) => row.storageName);
    },
  };
}
