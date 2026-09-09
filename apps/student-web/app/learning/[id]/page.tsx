import { headers } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import { currentStudent } from '@/lib/session';
import { store } from '@/lib/store';
import { LearningRunner } from './runner';

export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const h = await headers();
  const identity = currentStudent(
    new Request('http://local/', { headers: { cookie: h.get('cookie') ?? '' } }),
  );
  const repositories = store();
  const context = repositories?.sessions.activeContext();
  if (!identity || !repositories || !context || context.session.id !== identity.sessionId)
    redirect('/join');
  const { id } = await params;
  if (
    !repositories.learning
      .studentList(identity.studentId, context.session.classId)
      .some((e) => e.id === id)
  )
    notFound();
  return <LearningRunner experienceId={id} />;
}
