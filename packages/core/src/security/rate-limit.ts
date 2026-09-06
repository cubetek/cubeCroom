/**
 * حدّ معدّل الطلبات — SEC-008.
 *
 * دلو رموز في الذاكرة لا في القاعدة: الحدّ حماية من إغراق لحظي، وكتابته إلى
 * القرص في كل طلب تصنع الحمل الذي تحاول منعه. وضياعه عند إعادة التشغيل مقبول
 * — الحصة تنتهي وتبدأ من جديد أصلاً.
 *
 * والمفتاح عنوان الجهاز على الشبكة المحلية: طلاب الفصل خلف نقطة وصول واحدة
 * لكن لكلٍّ عنوانه، فحدُّ جهازٍ لا يخنق زميله. مقياس NFR-003 ثلاثون طالباً
 * متزامنين، والسعة هنا لجهاز واحد لا للصفّ كله.
 */

export type RateLimitOptions = {
  /** أقصى عدد طلبات مسموح داخل النافذة. */
  readonly capacity: number;
  readonly windowMs: number;
};

export type RateLimitResult = {
  readonly allowed: boolean;
  /** الثواني حتى تُتاح محاولة أخرى — تُعرض للطالب بلا مصطلحات. */
  readonly retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

export function createRateLimiter({ capacity, windowMs }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      // تنظيف كسول: النوافذ المنتهية تُحذف عند المرور بها، فلا مؤقّت يعمل
      // في الخلفية ولا خريطة تنمو بلا حدّ طوال اليوم.
      for (const [entry, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(entry);
      }

      const existing = buckets.get(key);
      if (existing === undefined) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (existing.count < capacity) {
        existing.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
      }

      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      };
    },

    /** للاختبار ولإعادة الضبط عند بدء حصة جديدة. */
    reset(): void {
      buckets.clear();
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
