import { z } from 'zod';

/**
 * حالة بوابة الطالب — T09.
 *
 * خمس حالات متمايزة لأن كلاً منها يعرض شيئاً مختلفاً على الشاشة:
 *   stopped     زر «تشغيل دخول الطلاب» وحده.
 *   starting    الزر معطّل — لا نقرة ثانية تُشغّل خادمين.
 *   running     الرابط والعنوان والشارة الخضراء.
 *   unreachable الخادم يعمل والشبكة لا — لوح `T09NoLan` بحاله: الرمز يبقى
 *               معروضاً باهتاً لا يختفي، لأن اختفاءه يوهم أن الجلسة توقفت.
 *   failed      لم يبدأ أصلاً، برسالة تصف الإجراء لا السبب التقني.
 */
export const portalStatusSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('stopped') }),
  z.object({ state: z.literal('starting') }),
  z.object({
    state: z.literal('running'),
    address: z.string().min(1),
    adapter: z.string(),
    port: z.number().int().positive(),
    url: z.string().min(1),
    /**
     * رمز الحصة — يكتبه المعلم على السبورة ويكتبه الطالب.
     * حارسٌ يمنع طلبات من أجهزة لم ترَ السبورة، ولا يُغني عن الموافقة.
     */
    joinCode: z.string().min(4),
    /**
     * عنوان بالاسم بدل الأرقام (`cubecroom.local`) — يُعلَن عبر mDNS.
     * اختياريّ لأنه قد لا يُعلَن: شبكةٌ تمنع البثّ المتعدد تُسقطه، والعنوان
     * الرقمي يبقى يعمل.
     */
    friendlyUrl: z.string().min(1).optional(),
    startedAt: z.string().min(1),
    /** زمن الإقلاع بالمللي ثانية — سقفه ٣٠٠٠ في NFR-002. */
    startupMs: z.number().int().nonnegative(),
    /** الحصة مفتوحة لفصل واحد — الشاشة تحتاج معرفته لتقول لأيّهم فُتح الباب. */
    classId: z.string().min(1),
    className: z.string().min(1),
    /** «دخلوا الحصة»: رمزٌ حيّ لا مجرد قبول. */
    admitted: z.number().int().nonnegative(),
    /** «بانتظار الموافقة» — يقابل عدّاد T09. */
    waiting: z.number().int().nonnegative(),
  }),
  z.object({
    state: z.literal('unreachable'),
    port: z.number().int().positive(),
    startedAt: z.string().min(1),
    classId: z.string().min(1),
    className: z.string().min(1),
    admitted: z.number().int().nonnegative(),
    waiting: z.number().int().nonnegative(),
    message: z.string().min(1),
  }),
  z.object({ state: z.literal('failed'), message: z.string().min(1) }),
]);

export type PortalStatus = z.infer<typeof portalStatusSchema>;

/** «تشغيل دخول الطلاب» يفتح حصة لفصل بعينه. */
export const startPortalSchema = z.object({ classId: z.string().min(1) });

export type StartPortalInput = z.infer<typeof startPortalSchema>;
