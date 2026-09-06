'use client';

import { useEffect, useState } from 'react';
import { toStudentActivity, type StudentActivity } from '@cubecroom/contracts';
import { Alert, StudentActivityView } from '@cubecroom/ui';
import { bridge } from '../lib/bridge';

/** Reuse the student's read-only activity projection; answer keys never enter the preview. */
export function LessonCheckActivity({ activityId }: { activityId: string }) {
  const [activity, setActivity] = useState<StudentActivity | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void bridge()
      .activityGet({ id: activityId })
      .then((found) => {
        if (alive) setActivity(toStudentActivity(found));
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : 'تعذّر عرض نشاط التحقق.');
      });
    return () => {
      alive = false;
    };
  }, [activityId]);
  return (
    <section className="space-y-3 border-t border-hairline pt-6" aria-label="نشاط التحقق الجاهز">
      <div>
        <h2 className="text-xl font-semibold">نشاط التحقق الجاهز</h2>
        <p className="mt-1 text-sm leading-7 text-text-2">
          يظهر مع نشر الدرس لجمع إجابات الطلاب. يمكنك تعديل الأسئلة ومتابعة الإجابات من قسم الأنشطة.
        </p>
      </div>
      {error ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : activity ? (
        <StudentActivityView
          activity={activity}
          index={index}
          onIndexChange={setIndex}
          note="معاينة نشاط الطالب؛ لا تُرسل إجابات من هنا."
        />
      ) : (
        <p role="status" className="text-text-muted">
          نفتح أسئلة التحقق…
        </p>
      )}
    </section>
  );
}
