import { z } from 'zod';
import { classSummarySchema } from './classes.js';
import { requestRowSchema } from './requests.js';

/**
 * حالة الرئيسية والشريط العلوي — T05 · FR-004 · FR-006.
 *
 * نداء واحد يخدم الاثنين: «الحالة مرئية من أي شاشة» يعني أن الشارة والعدّاد
 * في الشريط يقرآن المصدر نفسه الذي تقرؤه البطاقة. مصدران يعنيان لحظةً تقول
 * فيها الشارة «متاح» والبطاقة «متوقف».
 */
export const homeStateSchema = z.object({
  session: z
    .object({
      className: z.string().min(1),
      classId: z.string().min(1),
      startedAt: z.string().min(1),
      /** متصلون الآن — نبضة ضمن نافذة الحضور لا قبولٌ سابق. */
      connected: z.number().int().nonnegative(),
      pending: z.number().int().nonnegative(),
      /** الخادم يعمل والشبكة لا: الشارة تتغيّر ولا تختفي. */
      reachable: z.boolean(),
    })
    .nullable(),
  requests: z.array(requestRowSchema),
  classes: z.array(classSummarySchema),
  /** آخر نسخة احتياطية مكتملة — `null` يعني «لا توجد نسخة بعد» في T05Empty. */
  lastBackupAt: z.string().nullable(),
});

export type HomeState = z.infer<typeof homeStateSchema>;
