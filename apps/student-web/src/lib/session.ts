import { hashStudentToken } from '@cubecroom/core';
import { store } from './store';

/**
 * جلسة الطالب على بوابة الطلاب — SEC-007.
 *
 * الرمز يعيش في كعكة `HttpOnly`: شيفرة الصفحة لا تقرؤه، فحتى لو تسرّبت
 * ثغرة نصّية إلى صفحة الطالب لا تُسرَق بها هويته. و`SameSite=Lax` يمنع موقعاً
 * آخر من استعمال جلسته بطلب مُهيّأ.
 *
 * ولا `Secure` عمداً: البوابة تعمل على `http://` داخل الشبكة المحلية بلا
 * شهادة (PRD §9)، ووضع `Secure` يجعل المتصفح يُسقط الكعكة فلا يدخل أحد.
 */

export const SESSION_COOKIE = 'cubecroom_student';

export function sessionCookie(token: string): string {
  return [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    // عمر الكعكة عمر الحصة تقريباً؛ الإبطال الحقيقي في القاعدة لا هنا.
    'Max-Age=43200',
  ].join('; ');
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie');
  if (header === null) return null;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

export type StudentIdentity = {
  readonly studentId: string;
  readonly sessionId: string;
};

/**
 * هوية صاحب الطلب، أو `null`.
 *
 * كل مسار يخدم محتوى الطالب يبدأ من هنا. والبحث بالهاش لا بالرمز: القاعدة
 * لا تعرف الرمز أصلاً.
 */
export function currentStudent(request: Request): StudentIdentity | null {
  const token = readCookie(request, SESSION_COOKIE);
  if (token === null || token === '') return null;

  const repositories = store();
  if (repositories === null) return null;

  const hash = hashStudentToken(token);
  const found = repositories.sessions.findStudentByToken(hash);
  if (found === undefined) return null;

  repositories.sessions.touchStudentSession(hash);
  return found;
}
