/**
 * «متى يصير الخادم جاهزاً؟» — تعريفٌ واحد لا ثلاثة.
 *
 * **الجاهزية تُقاس بردٍّ حقيقي، لا بظهور العملية.** العملية تحيا قبل أن يصبح
 * الخادم قادراً على الردّ، وإعطاء المعلم رابطاً قبل ذلك يعني طلاباً يفتحونه
 * فيرون خطأ.
 *
 * وكان هذا المعنى مكتوباً في ثلاثة مواضع بثلاثة إيقاعات — ٦٠ms في الإنتاج،
 * و٢٠٠ms في اختبار الحِمل، و٣٠٠ms في فحص الدخان. والفرق ليس تفصيلاً: إيقاعُ
 * الاستطلاع هو **دقّة القياس نفسه**، فقياسُ إقلاعٍ باستطلاع كل ٣٠٠ms يحمل
 * خطأً قدره ٣٠٠ms — أي عُشر الميزانية كلها (NFR-002).
 */

/**
 * ميزانية NFR-002: «يبدأ خلال ≤ ٣ ثوانٍ».
 *
 * **وهي هدفُ أداءٍ يُقاس، لا حدُّ فشلٍ يُقطع عنده.** الفرق بينهما وقع مرتين:
 * جهازٌ مشغول أبطأ الإقلاع إلى ٣٤٠١ms، فأُعلن فشلاً — ولم يدخل طالب واحد،
 * والخادم كان سيجهز بعد أربعمئة جزء من الألف.
 */
export const READY_BUDGET_MS = 3000;

/**
 * ومهلة الانتظار قبل إعلان الفشل — أوسع من الميزانية عمداً.
 *
 * المعلم يريد أن تعمل الحصة؛ وأنت تريد أن تعرف أنها كانت بطيئة. فالانتظار
 * يمتدّ، والبطء يُسجَّل ويُعرض في «تشخيص الاتصال» — ولا يُخلط الأمران.
 */
export const READY_TIMEOUT_MS = 10_000;

/**
 * إيقاع الاستطلاع — وهو حدّ دقّة أيّ قياس مبنيّ عليه.
 *
 * ستّون جزءاً من الألف: أضيق من أن تُلوّث قياساً بالثواني، وأوسع من أن تُغرق
 * خادماً لم يُقلع بعد (خمسون طلباً في ثلاث ثوانٍ).
 */
export const READY_POLL_MS = 60;

export type ReadyOptions = {
  /** أقصى انتظار. الافتراضي ميزانية NFR-002. */
  readonly timeoutMs?: number;
  /** ما بين محاولة وأخرى. */
  readonly intervalMs?: number;
  /**
   * «هل ماتت العملية؟» — فلا نُكمل انتظار ميت.
   *
   * بلاها ينتظر الفحص المهلة كاملة على خادمٍ سقط في أول ثانية، فيقول
   * «تأخّر» بدل «لم يُقلع» — وهما عطلان مختلفان وإصلاحان مختلفان.
   */
  readonly hasExited?: () => boolean;
};

/**
 * ينتظر أول ردّ **سليم** من العنوان، ويعيد زمن الوصول إليه.
 *
 * `null` تعني أنه لم يجهز: انتهت المهلة أو ماتت العملية. والزمن يُقاس من
 * لحظة النداء لا من لحظة الإقلاع — فمن يريد قياس الإقلاع ينادي فور التشغيل.
 */
export async function awaitHttpReady(url: string, options: ReadyOptions = {}): Promise<number | null> {
  const timeoutMs = options.timeoutMs ?? READY_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? READY_POLL_MS;
  const began = Date.now();
  const deadline = began + timeoutMs;

  while (Date.now() < deadline) {
    if (options.hasExited?.() === true) return null;
    try {
      /*
       * `ok` لا مجرّد «ردّ»: خادمٌ يردّ ٥٠٠ على كل شيء ليس جاهزاً — وقبولُ
       * أيّ ردّ يجعل الفحص يمرّ على خادم معطوب.
       */
      const response = await fetch(url, { signal: AbortSignal.timeout(intervalMs * 8) });
      if (response.ok) return Date.now() - began;
    } catch {
      // لم يُقلع بعد — تُعاد المحاولة.
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  return null;
}

/** الوسيط — مقاومٌ للعيّنة الشاذّة، بخلاف المتوسّط. */
export function median(samples: readonly number[]): number {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}
