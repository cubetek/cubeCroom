import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { StudentHome } from './StudentHome';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';

/**
 * S04 — رئيسية الطالب بعد القبول.
 *
 * «انتقال تلقائي دون كلمة مرور» (US-S04): الطالب لا يسجّل دخولاً هنا ولا
 * يكتب شيئاً — الكعكة التي أخذها لحظة الموافقة هي كل ما يلزم. ومن لا كعكة
 * له يُحوَّل إلى `/join` لا يُعرض له خطأ: هو لم يخطئ، بل لم يدخل بعد.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const list = await headers();
  const cookie = list.get('cookie');
  const identity = currentStudent(new Request('http://local/', { headers: cookie === null ? {} : { cookie } }));

  if (identity === null) redirect('/join');

  const repositories = store();
  const context = repositories?.sessions.activeContext();
  if (repositories === null || context === undefined) redirect('/join');

  const student = repositories.students.get(identity.studentId);

  return (
    <StudentHome
      studentName={student.name}
      className={context.className}
      teacherName={context.teacherName}
    />
  );
}
