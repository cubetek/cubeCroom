import { createServer } from 'node:net';

/**
 * جدار الحماية — §22.
 *
 * **ما لا يفعله التطبيق، ولماذا:** لا يضيف قاعدة في جدار حماية النظام. ذلك
 * يحتاج صلاحية مسؤول، وتعديلُ إعدادات أمان الجهاز خلسةً ليس ما يُنتظر من
 * تطبيق مدرسيّ — ولا يجوز أن يُطلب من معلم أن يوافق على رفع صلاحيات لا يفهمها
 * وسط حصة.
 *
 * **وما يفعله بدلاً من ذلك:** يجعل النظام يسأل سؤاله في الوقت المناسب.
 * ويندوز يعرض نافذته «السماح بالوصول؟» أول مرة يستمع فيها برنامج على منفذ
 * على الشبكة. فإن حدث ذلك أول مرة **وأمام المعلم ٢٥ طالباً ينتظرون**، ضاعت
 * الحصة. و`primeFirewallPrompt` يجعله يحدث في لحظة هادئة: عند أول تشغيل.
 *
 * والاستماع هنا على `0.0.0.0` لا على `127.0.0.1` — وهذا هو بيت القصيد:
 * الاستماع على العنوان المحليّ وحده لا يستدعي النافذة أصلاً، لأنه لا يعرّض
 * شيئاً للشبكة.
 */

export type PrimeResult =
  /** استمعنا على الشبكة ثم أغلقنا — إن كان النظام سيسأل فقد سأل الآن. */
  | { readonly status: 'primed'; readonly port: number }
  /** المنفذ مشغول: لا يعني منعاً، بل أن شيئاً آخر يشغله الآن. */
  | { readonly status: 'busy'; readonly port: number }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * يستمع لحظةً على المنفذ ثم يُغلق.
 *
 * لا يُبقي شيئاً مفتوحاً: الغرض استدعاء سؤال النظام لا تشغيل خادم. ولذلك
 * تُغلق الفتحة فوراً — منفذٌ يبقى مفتوحاً بلا خادم يخدمه سطحُ هجوم بلا فائدة.
 */
export async function primeFirewallPrompt(port: number, host = '0.0.0.0'): Promise<PrimeResult> {
  return new Promise((resolve) => {
    const probe = createServer();

    probe.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') resolve({ status: 'busy', port });
      else resolve({ status: 'failed', reason: error.code ?? error.message });
    });

    probe.once('listening', () => {
      probe.close(() => resolve({ status: 'primed', port }));
    });

    probe.listen({ port, host, exclusive: true });
  });
}

/**
 * هل جرت المحاولة على هذا الجهاز من قبل؟
 *
 * النافذة تُعرض مرة واحدة: النظام يحفظ جواب المعلم. فتكرارُ الاستدعاء عند كل
 * تشغيل لا يُظهر شيئاً، لكنه يفتح منفذاً بلا داعٍ في كل مرة — فيُسجَّل أنها
 * جرت، وتُترك بعدها للنظام.
 */
export const FIREWALL_PRIMED_FILE = 'firewall-primed';
