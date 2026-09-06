import { apiError, type ApiError } from '@cubecroom/contracts';
import { createRateLimiter } from '@cubecroom/core';
import { SESSION_COOKIE } from './session';

/**
 * حرّاس سطح الطالب — SEC-008.
 *
 * البوابة تعمل على `http://` داخل شبكة المدرسة، وأي صفحة يفتحها الطالب على
 * الشبكة نفسها تستطيع أن ترسل طلباً إلى خادمنا من متصفّحه. فالطلبات الكاتبة
 * تُقاس بمصدرها ومعدّلها معاً:
 *
 *   `sameOrigin` — الطلب جاء من صفحتنا لا من صفحة أخرى (CSRF).
 *   `withinRate` — لا إغراق من جهاز واحد.
 *
 * القراءة لا تمرّ بالحدّ: صفحة الطالب تسأل عن حالتها كل ثلاث ثوانٍ، وخنقُها
 * يعطّل الوعد بأنها «تُفتح تلقائياً بمجرد موافقة معلمك».
 *
 * ── مفتاح القياس: ما نملكه فعلاً لا ما نتمنّاه ──────────────────
 *
 * **كان الحدّ يُقاس بعنوان الجهاز — وذلك لم يكن يعمل.** الخادم يُقلَع مباشرةً
 * من Electron بلا وسيط، فلا `x-forwarded-for` ولا `x-real-ip` يصل أبداً،
 * وكل الطلاب كانوا يقعون في دلوٍ واحد سعته عشرة. أي أن **الطالب الحادي عشر
 * في الصفّ يُمنع من الدخول دقيقةً كاملة** — وهو ما كشفه اختبار حِمل P6-5.
 *
 * فصار القياس على ما يُعرف حقاً:
 *   • المسارات المصادَق عليها — بكعكة الطالب: هويةٌ حقيقية لكل جهاز.
 *   • `/api/join` — لا هوية قبل الدخول، فالدلو مشترك وسعته سعة صفّ.
 */

/**
 * حدّ الطالب المصادَق عليه: ثلاثون كتابة في الدقيقة لجهازه وحده.
 *
 * يكفي لتسليم نشاط وإعادة محاولة وسؤالٍ أو سؤالين، ولا يسع سكربتاً يغرق
 * جهاز المعلم من متصفّح طالب.
 */
const perStudent = createRateLimiter({ capacity: 30, windowMs: 60_000 });

/**
 * حدّ الدخول: مشترك، لأنه **لا هوية قبل الدخول**.
 *
 * سعته سعة صفّ كامل مع إعادة محاولات: ثلاثون طالباً × ثلاث محاولات. وما دون
 * ذلك يمنع صفّاً حقيقياً من الدخول — وهو عطلٌ أسوأ ممّا يحرس منه الحدّ.
 * وما فوقه لا يمنع إغراقاً على أي حال: الإغراق آلاف في الدقيقة لا مئة.
 */
const joins = createRateLimiter({ capacity: 90, windowMs: 60_000 });

/**
 * المتصفح يرسل `Origin` مع كل طلب كاتب — غيابه يعني عميلاً ليس متصفحاً.
 * والمقارنة بترويسة `Host` لا بقيمة ثابتة: العنوان يتغيّر مع شبكة المدرسة،
 * وتثبيته في الشيفرة يجعل التطبيق يرفض نفسه في أول قاعة مختلفة.
 */
export function sameOrigin(request: Request): ApiError | null {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');

  if (origin === null || host === null) {
    return apiError('forbidden', 'تعذّر التحقق من مصدر الطلب. افتح رابط الدخول من جديد.');
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return apiError('forbidden', 'تعذّر التحقق من مصدر الطلب. افتح رابط الدخول من جديد.');
  }

  if (originHost !== host) {
    return apiError('forbidden', 'هذا الطلب لم يأتِ من صفحة فصلك. افتح رابط الدخول من جديد.');
  }

  return null;
}

/**
 * هوية الجهاز الكاتب — من كعكته.
 *
 * الرمز نفسه لا يُستعمل مفتاحاً كاملاً: بادئته تكفي للتمييز، وحملُ الرمز كاملاً
 * في ذاكرة الحدّ يوسّع مواضع وجوده بلا حاجة (SEC-007).
 */
function studentKey(request: Request): string | null {
  const cookie = request.headers.get('cookie');
  if (cookie === null) return null;

  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) {
      const value = rest.join('=');
      return value === '' ? null : value.slice(0, 16);
    }
  }
  return null;
}

function retryMessage(seconds: number): ApiError {
  return apiError(
    'rate_limited',
    `أرسلت طلبات كثيرة في وقت قصير. انتظر ${seconds} ثانية ثم أعد المحاولة.`,
  );
}

export function withinRate(request: Request): ApiError | null {
  const key = studentKey(request);
  const result = key === null ? joins.check('join') : perStudent.check(key);
  return result.allowed ? null : retryMessage(result.retryAfterSeconds);
}

/** الحارسان معاً — كل مسار كاتب يبدأ بهذا السطر. */
export function guardWrite(request: Request): ApiError | null {
  return sameOrigin(request) ?? withinRate(request);
}
