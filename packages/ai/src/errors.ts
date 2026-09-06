/**
 * أخطاء المزوّدين — FR-011 · NFR-006.
 *
 * لوح `T04States` ينصّ: **«لا رمز خطأ ولا اسم استجابة تقنية في أيٍّ من
 * الحالات الثلاث»**. فكل ما قد يقوله المزوّد — رقم حالة، اسم استثناء، جسم
 * JSON — يُترجَم هنا إلى سبب معدود ورسالة عربية، ولا يعبر شيء منه إلى الشاشة.
 *
 * والأسباب خمسة لأن إجراء المعلم يختلف بينها: مفتاح خطأ يُستبدل، وانقطاع شبكة
 * يُنتظر، وحصة منتهية تُراجَع عند المزوّد، وطلبٌ طال فيُقصَّر نصّه، وعطل مؤقّت
 * يُعاد بعده. سببٌ واحد جامع كان سيقول للمعلم «حدث خطأ» ويتركه بلا إجراء.
 */

export type AiFailureReason =
  | 'rejected_key'
  | 'offline'
  | 'quota'
  | 'timeout'
  | 'provider_error';

const MESSAGES: Readonly<Record<AiFailureReason, string>> = {
  rejected_key:
    'رفضه المزوّد. غالباً نُسخ ناقصاً أو تُرك فيه فراغ في أوله أو آخره.',
  offline:
    'تعذّر الوصول إلى مزوّدك. تأكّد من اتصال هذا الجهاز بالإنترنت ثم أعد المحاولة.',
  quota:
    'تجاوز حسابك الحصة المسموحة عند مزوّدك. راجع حسابك عنده ثم أعد المحاولة.',
  timeout:
    'استغرق الطلب وقتاً أطول من المتوقّع فأوقفناه. أعد المحاولة، أو جرّب نصّاً أقصر.',
  provider_error: 'لم يُكمل مزوّدك الطلب. أعد المحاولة بعد قليل.',
};

export class AiFailure extends Error {
  readonly code = 'ai_failure';
  constructor(readonly reason: AiFailureReason, message?: string) {
    super(message ?? MESSAGES[reason]);
    this.name = 'AiFailure';
  }
}

/**
 * يترجم حالة HTTP إلى سبب.
 *
 * ٤٠١ و٤٠٣ مفتاح مرفوض، و٤٢٩ حصة، وما فوق ٥٠٠ عطل عند المزوّد. وما عدا ذلك
 * يُعدّ عطلاً أيضاً: تفصيله للمعلم لا يفيده، وإخفاؤه لا يضرّه.
 */
export function reasonForStatus(status: number): AiFailureReason {
  if (status === 401 || status === 403) return 'rejected_key';
  if (status === 402 || status === 429) return 'quota';
  return 'provider_error';
}

/**
 * يترجم خطأ شبكة أو استثناء غير متوقَّع.
 * انقطاع الشبكة يصل كـ`TypeError` من `fetch` بلا حالة HTTP.
 */
export function reasonForThrown(error: unknown): AiFailureReason {
  if (error instanceof AiFailure) return error.reason;
  if (error instanceof DOMException && error.name === 'TimeoutError') return 'timeout';
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    return reasonForStatus(error.statusCode);
  }
  if (error instanceof DOMException && error.name === 'AbortError') return 'offline';
  if (error instanceof TypeError) return 'offline';
  return 'provider_error';
}
