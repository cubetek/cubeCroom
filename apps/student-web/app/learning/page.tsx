import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { LEARNING_METHODS } from '@cubecroom/contracts';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';
import { StudentNav } from '../StudentNav';

export const dynamic = 'force-dynamic';
export default async function Page() {
  const h = await headers();
  const identity = currentStudent(
    new Request('http://local/', { headers: { cookie: h.get('cookie') ?? '' } }),
  );
  const repositories = store();
  const context = repositories?.sessions.activeContext();
  if (!identity || !repositories || !context || identity.sessionId !== context.session.id)
    redirect('/join');
  const list = repositories.learning.studentList(identity.studentId, context.session.classId);
  return (
    <main className="mx-auto flex min-h-svh max-w-4xl flex-col gap-5 p-5">
      <header>
        <p className="text-sm font-bold text-primary">تعلّم وجرب واكتشف</p>
        <h1 className="mt-2 text-2xl font-bold">تجارب التعلّم</h1>
        <p className="mt-2 text-text-muted">كل محاولة تساعدك على الفهم. تقدمك هنا خاص بك.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {list.map((e) => (
          <Link
            key={e.id}
            href={`/learning/${e.id}`}
            className="space-y-3 rounded-2xl border border-hairline bg-surface p-5 hover:border-primary"
          >
            <span className="text-sm font-semibold text-primary">
              {LEARNING_METHODS.find((m) => m.id === e.method)?.title}
            </span>
            <h2 className="text-lg font-bold">{e.title}</h2>
            {e.dueAt && (
              <p className="text-sm text-text-muted">
                {Date.parse(e.dueAt) <= Date.now()
                  ? 'حان وقت المراجعة'
                  : `مراجعتك التالية: ${new Date(e.dueAt).toLocaleDateString('ar')}`}
              </p>
            )}
            <p className="text-sm">ابدأ محاولتك ←</p>
          </Link>
        ))}
      </div>
      {list.length === 0 && (
        <p className="rounded-2xl border border-dashed border-hairline p-8 text-center">
          ستظهر تجاربك هنا عندما يتيحها المعلم.
        </p>
      )}
      <StudentNav />
    </main>
  );
}
