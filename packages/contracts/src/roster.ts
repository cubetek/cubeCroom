import { z } from 'zod';

/**
 * قائمة طلاب الفصل — FR-007 · T11.
 *
 * «مقبول» و«متصل الآن» حالتان مختلفتان، والمصدر يشترط تمييزهما. الأولى دائمة
 * تبقى بين الحصص، والثانية لحظية تُشتق من آخر نبضة وصلت من جهاز الطالب.
 *
 * النصّ في اللوح مذكّر ومؤنّث حسب الاسم («متصلة الآن» · «متصل الآن»)، والتطبيق
 * لا يسأل الطالب عن جنسه ولا يجوز أن يخمّنه من اسمه — فالحالة تُصاغ بعبارة لا
 * تحمل تذكيراً ولا تأنيثاً: «على الشبكة الآن» و«خارج الشبكة». مسجَّل قراراً
 * `D9` في docs/design/06-decisions.md.
 */

export const rosterRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  identifier: z.string().nullable(),
  /** آخر نبضة من جهازه — `null` يعني أنه لم يدخل في هذه الحصة بعد. */
  lastSeenAt: z.string().nullable(),
  online: z.boolean(),
});

export type RosterRow = z.infer<typeof rosterRowSchema>;

export const rosterStateSchema = z.object({
  /** لا حصة مفتوحة ⇦ لا أحد «على الشبكة»، والقائمة تبقى معروضة. */
  sessionOpen: z.boolean(),
  students: z.array(rosterRowSchema),
  online: z.number().int().nonnegative(),
});

export type RosterState = z.infer<typeof rosterStateSchema>;

export const renameStudentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2, 'اسم الطالب لا يكفي حرفاً واحداً.').max(60),
  identifier: z.string().trim().max(20).optional(),
});

export type RenameStudentInput = z.infer<typeof renameStudentSchema>;

/**
 * إجراءان مختلفان لا واحد:
 *   `kick`   يُبطل رمزه في هذه الحصة ويبقيه مقبولاً — يعود بطلب دخول جديد.
 *   `remove` يُخرجه من الفصل كله علامةً لا حذفاً، فتبقى إجاباته مفهومة.
 */
export const studentActionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(['kick', 'remove']),
});

export type StudentActionInput = z.infer<typeof studentActionSchema>;
