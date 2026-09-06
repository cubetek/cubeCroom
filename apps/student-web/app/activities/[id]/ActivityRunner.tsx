'use client';

import { useEffect, useState } from 'react';
import { StudentActivityView, buttonVariants, cn } from '@cubecroom/ui';
import { ar } from '@cubecroom/contracts';
import type { Answer, StudentActivity, SubmissionReceipt } from '@cubecroom/contracts';
import { clearDraft, readDraft, writeDraft } from '@/lib/draft';
import { SendFailed } from './SendFailed';
import { Submitted } from './Submitted';

/**
 * S07 — الطالب يجيب ويرسل.
 *
 * **إجاباته محفوظة على جهازه قبل أن تُرسل** — وهو نصّ اللوح لا استنتاج. تفاصيل
 * الحفظ في `lib/draft.ts`؛ ما يهمّ هنا أن **المسوّدة لا تُمحى إلا بعد وصول
 * الإجابة**: تمحوها قبلها يعني أن انقطاعاً في الشبكة يمحو ما كتبه الطالب.
 *
 * **ومنع الإرسال المكرر في ثلاث طبقات، وكلها لازمة:** الزرّ يُعطَّل أثناء
 * الإرسال فتمتنع الضغطة المزدوجة؛ والشاشة تتحوّل إلى الإيصال فلا يبقى زرّ
 * يُضغط؛ وقيد `unique` في القاعدة يمنع ما لا تمنعه الشاشة أصلاً — تبويباً
 * ثانياً، أو صفحةً أُعيد تحميلها.
 *
 * والوقت المعروض يأتي من ردّ الخادم لا من ساعة الجهاز: ساعةٌ مضبوطة خطأً على
 * جهاز طالب تُظهر له إيصالاً بوقتٍ لا يطابق ما يراه معلمه.
 */

export type ActivityRunnerProps = {
  readonly activity: StudentActivity;
};

type Phase =
  | { readonly at: 'answering' }
  | { readonly at: 'sending' }
  | { readonly at: 'failed'; readonly message: string; readonly retrying: boolean }
  | { readonly at: 'done'; readonly receipt: SubmissionReceipt };

/**
 * سبب الفشل يُصاغ من حالة الردّ لا من نصٍّ واحد لكل الحالات.
 *
 * انقطاعُ الشبكة يُعاد المحاولة بعده؛ وانتهاءُ الحصة لا. ورسالةٌ واحدة
 * للحالتين تجعل الطالب يعيد المحاولة عشر مرات على بابٍ أُغلق.
 */
const OFFLINE =
  'انقطع الاتصال بجهاز معلمك أثناء الإرسال. غالباً ابتعدت عن شبكة Wi-Fi أو انتهت الحصة.';

/**
 * زرّ الإرسال — `buttonVariants` لا `Button`.
 *
 * `Button` يشترط `disabledReason` مع كلّ تعطيل ويرسمه سطراً تحته، والسطر
 * الذي يشرح التعطيل موجودٌ هنا أصلاً (`hint` أدناه) ويتغيّر بحالاته الثلاث.
 * فاستعماله يعني إمّا سطرين متطابقين، وإمّا اختفاء «أجبت عن كذا من كذا» حين
 * يُفتح الزرّ. والشرط `sending || answered.length === 0` قيمةٌ محسوبة لا
 * ثابتة، فلا يقبلها اتّحاد `ButtonProps` أصلاً بلا تفريعٍ يغيّر عرض الزرّ
 * بين الحالتين.
 *
 * و٥٢px لا `--height-control`: هذا الفعل الوحيد في الشاشة، وهدف لمسه أكبر.
 */
const SEND_BUTTON = cn(
  buttonVariants({ variant: 'primary' }),
  'h-auto min-h-[52px] w-full text-s-body font-semibold',
);

export function ActivityRunner({ activity }: ActivityRunnerProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string>(() => new Date().toISOString());
  const [phase, setPhase] = useState<Phase>({ at: 'answering' });

  // القراءة بعد التركيب لا أثناء الرسم: `localStorage` غير موجود على الخادم.
  useEffect(() => {
    const draft = readDraft(activity.id);
    if (draft === null) return;
    setAnswers(draft.answers);
    setSavedAt(draft.savedAt);
  }, [activity.id]);

  const answer = (questionId: string, value: string) => {
    setAnswers((current) => {
      const next = { ...current, [questionId]: value };
      setSavedAt(writeDraft(activity.id, next).savedAt);
      return next;
    });
  };

  const answered = activity.questions.filter(
    (question) => (answers[question.id] ?? '').trim() !== '',
  );

  const send = async (retry: boolean) => {
    setPhase(retry ? { at: 'failed', message: OFFLINE, retrying: true } : { at: 'sending' });
    try {
      const response = await fetch('/api/student/submissions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ activityId: activity.id, answers: payload(activity, answers) }),
      });
      const body = (await response.json()) as {
        data?: SubmissionReceipt;
        error?: { message: string };
      };

      if (body.data === undefined) {
        // رسالة الخادم كما هي: هي التي تعرف أن الحصة انتهت أو أن النشاط تغيّر.
        setPhase({
          at: 'failed',
          message: body.error?.message ?? OFFLINE,
          retrying: false,
        });
        return;
      }

      // وصلت — والآن وحدها تُمحى المسوّدة.
      clearDraft(activity.id);
      setPhase({ at: 'done', receipt: body.data });
    } catch {
      setPhase({ at: 'failed', message: OFFLINE, retrying: false });
    }
  };

  if (phase.at === 'done') {
    return <Submitted activity={activity} receipt={phase.receipt} inline />;
  }

  if (phase.at === 'failed') {
    return (
      <SendFailed
        activity={activity}
        answers={answers}
        savedAt={savedAt}
        message={phase.message}
        retrying={phase.retrying}
        onRetry={() => void send(true)}
        onEdit={() => setPhase({ at: 'answering' })}
      />
    );
  }

  const sending = phase.at === 'sending';
  const last = index >= activity.questions.length - 1;

  return (
    <StudentActivityView
      activity={activity}
      index={index}
      onIndexChange={setIndex}
      answers={answers}
      onAnswer={answer}
      note="إجاباتك محفوظة على هذا الجهاز — لو أُغلقت الصفحة ستجدها كما تركتها."
      footer={
        last ? (
          <>
            <button
              type="button"
              className={SEND_BUTTON}
              onClick={() => void send(false)}
              disabled={sending || answered.length === 0}
            >
              {sending ? 'جارٍ الإرسال…' : 'إرسال الإجابة'}
            </button>
            <p className="text-s-caption text-text-muted">
              {sending
                ? 'أبقِ الصفحة مفتوحة لحظة. الزر معطَّل الآن حتى لا تُرسل إجابتك مرتين.'
                : answered.length === 0
                  ? 'أجب عن سؤال واحد على الأقل قبل الإرسال.'
                  : `أجبت عن ${ar(answered.length)} من ${ar(activity.questions.length)}. تُرسل مرة واحدة فقط.`}
            </p>
          </>
        ) : null
      }
    />
  );
}

/**
 * ما يُرسل: الأسئلة المُجابة وحدها.
 *
 * السؤال المتروك لا يُرسل فارغاً — إجابةٌ فارغة في جدول المعلم تُقرأ «أجاب
 * خطأً»، والفرق بينها وبين «لم يجب» فرقٌ يبني عليه درجته.
 */
function payload(activity: StudentActivity, answers: Record<string, string>): Answer[] {
  const result: Answer[] = [];
  for (const question of activity.questions) {
    const value = (answers[question.id] ?? '').trim();
    if (value === '') continue;

    if (question.type === 'choice') {
      // خيارٌ لم يعد موجوداً (عدّل المعلم النشاط بعد فتح الصفحة) يُترك للخادم
      // أن يرفضه — ولا يُرسل بوصفه نصّاً فيُقرأ إجابةً مكتوبة.
      result.push({ type: 'choice', questionId: question.id, optionId: value });
    } else {
      result.push({ type: 'text', questionId: question.id, text: value });
    }
  }
  return result;
}
