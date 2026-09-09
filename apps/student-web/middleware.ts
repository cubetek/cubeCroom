import { NextResponse, type NextRequest } from 'next/server';

/**
 * سياسة المحتوى مع رقم استعمال واحد (nonce) — SEC-008.
 *
 * **ولماذا لم تعد ثابتة في `next.config`:** كانت `script-src 'self'` وحدها،
 * وNext يحقن في كل صفحة سكربتاتٍ مضمَّنة يسلّم بها حالتَه إلى المتصفّح. فكان
 * المتصفّح يمنعها، ويسقط الترطيب (hydration)، **وتُمحى الصفحة فيرى الطالب
 * بياضاً**. لا خطأ يظهر له، ولا شيء في السجلّات: صفحة فارغة وحسب.
 *
 * ولم يكشفه فحصٌ واحد: الطلبات المصاغة بيدنا تقرأ HTML الخادم — وهو سليم —
 * ولا متصفّحَ فيها يطبّق السياسة. كشفه أول تحميل في متصفّح حقيقي.
 *
 * والرقم يُولَّد لكل طلب، ويُمرَّر إلى Next في ترويسة الطلب: هو يقرؤه ويضعه
 * على سكربتاته وحدها. فلا يُفتح الباب لسكربت مضمَّن يحقنه غيرنا.
 */

/** ١٢٨ بتّاً من مصدر عشوائي — رقمٌ يُخمَّن يُلغي فائدة السياسة كلها. */
function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function middleware(request: NextRequest): NextResponse {
  const nonce = createNonce();

  /*
   * `strict-dynamic` يجعل الثقة تنتقل من السكربت الموقَّع إلى ما يحمّله هو
   * — وهذا ما يفعله Next بالضبط: سكربتٌ أوّل يجلب بقيّة الحزم.
   */
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join('; ');

  const headers = new Headers(request.headers);
  headers.set('x-nonce', nonce);
  // Next يقرأ الرقم من هذه الترويسة في الطلب لا من ردّنا.
  headers.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  /*
   * كل شيء عدا الملفات الساكنة: السياسة تعني شيئاً على الوثائق، وتوليد رقم
   * لكل ملفّ CSS وJS يُثقل بلا فائدة — والملفات نفسها تُقدَّم من أصلنا.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
