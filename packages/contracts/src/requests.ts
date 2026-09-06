import { z } from 'zod';

/**
 * طلبات الدخول من منظور المعلم — FR-006 · T10.
 *
 * القبول **نقرة واحدة** بلا حوار تأكيد (مقياس §3)، لذلك لا حقل تأكيد هنا ولا
 * خطوة وسطى. والتراجع متاح على الرفض وحده: قبولٌ يُتراجع عنه يعني طالباً
 * دخل الفصل ثم أُخرج منه، وذلك إزالة طالب لا تراجع عن قرار.
 */

export const requestRowSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  identifier: z.string().nullable(),
  createdAt: z.string().min(1),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  /** تنبيه T10: «اسم مشابه لطالب مقبول بالفعل» — معلومة تساعد ولا تمنع. */
  similarToAccepted: z.boolean(),
});

export type RequestRow = z.infer<typeof requestRowSchema>;

export const requestsStateSchema = z.discriminatedUnion('state', [
  /** لا حصة مفتوحة لهذا الفصل — لا طلبات تصل أصلاً. */
  z.object({ state: z.literal('closed') }),
  /** الباب مفتوح لفصل آخر: الطلبات تخصّه لا هذا الفصل. */
  z.object({ state: z.literal('other_class'), className: z.string().min(1) }),
  z.object({
    state: z.literal('open'),
    pending: z.array(requestRowSchema),
    decided: z.array(requestRowSchema),
    accepted: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
  }),
]);

export type RequestsState = z.infer<typeof requestsStateSchema>;

export const decideRequestSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(['approve', 'reject', 'undo_reject']),
});

export type DecideRequestInput = z.infer<typeof decideRequestSchema>;

/** «قبول الكل (٤)» — العدد يُرسل ليُرفض التنفيذ إن تغيّرت القائمة تحته. */
export const approveAllSchema = z.object({
  classId: z.string().min(1),
  expected: z.number().int().nonnegative(),
});

export type ApproveAllInput = z.infer<typeof approveAllSchema>;
