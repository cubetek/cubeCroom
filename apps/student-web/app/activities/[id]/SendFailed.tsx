'use client';

import { readableAnswers, when, type StudentActivity } from '@cubecroom/contracts';
import { buttonVariants, cn } from '@cubecroom/ui';

/**
 * S07SendFail — لم تصل إجابتك.
 *
 * **الشاشة كلها مبنيّة حول جملة واحدة:** «إجابتك محفوظة على هذا الجهاز ولم
 * تضِع». طفلٌ كتب فقرةً ثم رأى «فشل الإرسال» يظنّ أنه فقدها، فيعيد كتابتها أو
 * ييأس — فالإجابة تُعرض عليه **بنصّها** لا بوعدٍ بأنها محفوظة. الرؤية أصدق من
 * الطمأنة.
 *
 * والسبب يُقال كما هو: انقطاع الشبكة شيء، وانتهاء الحصة شيء آخر — ورسالةٌ
 * واحدة للحالتين تجعل الطالب يعيد المحاولة عشر مرات على بابٍ أُغلق.
 */

/**
 * الزرّان — `buttonVariants` لا `Button`، للسبب المشروح في `ActivityRunner`:
 * `Button` يشترط `disabledReason` ويرسمه سطراً تحته، والسطر الذي يشرح التعطيل
 * قائمٌ هنا أصلاً («إن تعذّر الإرسال مجدداً…») ويخدم الزرّين معاً.
 *
 * و٥٢px لا `--height-control`: هذان فعلا الشاشة، وهدف لمسهما أكبر.
 */
const ACTION = 'h-auto min-h-[52px] w-full text-s-body font-semibold';

export type SendFailedProps = {
  readonly activity: StudentActivity;
  readonly answers: Readonly<Record<string, string>>;
  readonly savedAt: string;
  readonly message: string;
  readonly retrying: boolean;
  readonly onRetry: () => void;
  readonly onEdit: () => void;
};

export function SendFailed({
  activity,
  answers,
  savedAt,
  message,
  retrying,
  onRetry,
  onEdit,
}: SendFailedProps) {
  const saved = readableAnswers(activity, answers);

  return (
    <section className="flex flex-col gap-3">
      {/*
        العنوان بلون خطر، والطمأنة بلون نجاح تحته مباشرة: الفشل حقيقي لكنه لا
        يمسّ ما كتبه الطالب — واللونان معاً يقولان ذلك قبل أن يُقرأ النصّ.
      */}
      <h1 className="text-s-h1 text-error-text">لم تصل إجابتك</h1>
      <p className="text-s-reading text-text-2">{message}</p>

      <p className="rounded-md border border-ok-border bg-ok-bg px-3.5 py-3 text-s-body text-ok-text">
        إجابتك محفوظة على هذا الجهاز ولم تضِع. ستبقى كما كتبتها حتى تُرسل.
      </p>

      <div className="rounded-lg border border-hairline bg-surface px-4 py-3.5">
        <div className="text-s-caption text-text-muted">إجابتك المحفوظة</div>
        {saved.length === 0 ? (
          <p className="mt-1 text-s-reading whitespace-pre-wrap">لم تُجب عن سؤال بعد.</p>
        ) : (
          saved.map((entry) => (
            <div key={entry.questionId} className="mt-2.5">
              <div className="text-s-caption text-text-muted">{entry.prompt}</div>
              {/* نصّ الطالب كما كتبه — بأسطره، فلا تُطوى فقرته سطراً واحداً. */}
              <p className="mt-1 text-s-reading whitespace-pre-wrap">{entry.answer}</p>
            </div>
          ))
        )}
        <div className="mt-1 text-s-caption text-text-muted">
          كُتبت {when(savedAt, { fallback: 'قبل قليل', time: 'always' })}
        </div>
      </div>

      <button
        type="button"
        className={cn(buttonVariants({ variant: 'primary' }), ACTION)}
        onClick={onRetry}
        disabled={retrying}
      >
        {retrying ? 'جارٍ الإرسال…' : 'إعادة الإرسال'}
      </button>
      <button
        type="button"
        className={cn(buttonVariants({ variant: 'secondary' }), ACTION)}
        onClick={onEdit}
        disabled={retrying}
      >
        العودة إلى الإجابة وتعديلها
      </button>

      <p className="text-s-caption text-text-muted">
        إن تعذّر الإرسال مجدداً، أخبر معلمك — يستطيع تشغيل دخول الطلاب من جديد.
      </p>
    </section>
  );
}
