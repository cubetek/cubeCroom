import type { TeacherLessonDetail } from '@cubecroom/contracts';
import { Badge, ar } from '@cubecroom/ui';

export function TeacherPreparation({
  preparation,
}: {
  preparation: TeacherLessonDetail['preparation'];
}) {
  if (!preparation)
    return (
      <div className="rounded-xl border border-dashed border-hairline p-8 text-center">
        <h2 className="text-xl font-semibold">خطة الحصة في مكانها</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-text-2">
          اكتب طلبك أعلى الصفحة واضغط «جهّز الدرس كاملاً». ستجد هنا تسلسل الحصة وأسئلة تكشف المفاهيم
          الخاطئة وخطوات معالجتها.
        </p>
      </div>
    );
  return (
    <section className="mx-auto w-full max-w-4xl space-y-7" aria-label="خطة المعلم">
      <header className="space-y-3">
        <Badge tone="draft">للمعلم فقط</Badge>
        <h2 className="text-2xl font-bold">خطة تنفيذ الحصة</h2>
        <p className="whitespace-pre-wrap text-base leading-8 text-text-2">
          {preparation.overview}
        </p>
      </header>
      <ol className="space-y-4">
        {preparation.steps.map((step, index) => (
          <li
            key={`${index}-${step.title}`}
            className="flex gap-4 rounded-xl border border-hairline bg-surface p-5"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft font-bold text-primary-on-soft">
              {ar(index + 1)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{step.title}</h3>
                <span className="text-sm text-text-muted">{ar(step.minutes)} دقيقة</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-2">
                {step.instructions}
              </p>
            </div>
          </li>
        ))}
      </ol>
      {preparation.misconceptions.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-xl font-semibold">مفاهيم تستحق التحقق</h3>
          <p className="text-sm text-text-muted">
            احتمالات لفحص الفهم أثناء الحصة، وليست أحكاماً على طلابك.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {preparation.misconceptions.map((item, index) => (
              <article key={index} className="rounded-xl border border-hairline bg-canvas p-5">
                <h4 className="font-semibold leading-7">{item.idea}</h4>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-text-2">
                  {item.response}
                </p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
