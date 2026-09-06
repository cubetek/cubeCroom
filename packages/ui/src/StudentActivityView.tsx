'use client';

import type { ReactNode } from 'react';
import type { StudentActivity } from '@cubecroom/contracts';
import { ar } from './numerals';
import { buttonVariants } from '#lib/button-variants';
import { Label } from '#components/label';
import { RadioGroup, RadioGroupItem } from '#components/radio-group';
import { Textarea } from '#components/textarea';
import { cn } from '#lib/utils';

/**
 * النشاط كما يراه الطالب — المكوّن الوحيد الذي يرسمه.
 *
 * موضعه هنا لا في تطبيق المعلم ولا في بوابة الطالب، لأن الاثنين يرسمانه:
 * معاينة `T16` و`S07` نفسه. ولو كان مكوّنين لانحرف أحدهما عن الآخر مع أول
 * تعديل، فصارت «معاينة ما يراه الطالب» وعداً لا يُتحقق منه أحد.
 *
 * وما يقطع الوعد قطعاً هو نوع مدخله: `StudentActivity` — النوع الذي لا يحمل
 * `isCorrect` ولا `expectedAnswer` أصلاً. فحتى لو أراد هذا المكوّن أن يرسم
 * علامة الإجابة الصحيحة لم يجد حقلاً يقرؤها منه.
 *
 * سؤال واحد في الشاشة كما في اللوح: الطالب على هاتف بعرض ٣٦٠px، وخمسة أسئلة
 * في صفحة واحدة تعني تمريراً يفقد فيه موضعه.
 *
 * **ومقياس النصّ هنا `s-` لا `t-` وإن رُسم داخل شاشة معلّم.** هذه شاشة الطالب
 * تُعرض عليه معاينةً — فلو تبعت مقياس المعلّم لصارت المعاينة تَعِد بحجمٍ لا
 * يراه الطالب، وهو الوعد الوحيد الذي يقوم عليه هذا المكوّن.
 */

/**
 * عرض الإطار متغيّر: ٣٦٠px في معاينة المعلم (كما رُسم)، ويتوسّع على شاشة
 * الطالب الكبيرة عبر `--student-frame`. فالمكوّن واحد والمقاس يتبع مكانه.
 *
 * **والقيمة الاحتياطية داخل `var()` لا في صنفٍ ثانٍ**: من يركّب هذا المكوّن
 * خارج بوابة الطالب — باني النشاط عند المعلم — لا يعرّف المتغيّر أصلاً، فلو
 * لم يحمل الصنفُ احتياطيَّه لتمدّد الإطار إلى عرض عمود المحرر كلّه.
 */
const FRAME = cn(
  'flex w-full max-w-[var(--student-frame,360px)] flex-col gap-2.5',
  'rounded-lg border border-hairline bg-surface px-4.5 py-4',
  // كلمةٌ طويلة أو رابط يُكسر داخل حدّه — لا شريط تمرير يجرّ الصفحة كلّها.
  'wrap-anywhere',
);

/** ما لم يكتبه المعلم بعد: نصٌّ خافت، لا فراغ يظنّه الطالب عطلاً. */
const BLANK = 'text-s-caption text-text-muted';

/**
 * زرّا التنقّل — `buttonVariants` لا `Button`.
 *
 * `Button` يُلزم كلَّ `disabled` بسببٍ مكتوب تحته، و«السابق» في أوّل سؤال
 * لا سبب له إلا موضعه: سطرٌ يشرح ذلك تحت كلّ زرّ يضيف نصّاً لم يكن في اللوح
 * ويزيح ما بعده. والتعطيل هنا يقرؤه قارئ الشاشة من `disabled` نفسها.
 *
 * و٤٨px لا `--height-control`: هذان زرّان متجاوران يُنقران بالإبهام على
 * لوحيّ، فارتفاعهما أكبر من ارتفاع الحقل المعتاد.
 */
const NAV_BUTTON = cn(
  buttonVariants({ variant: 'secondary' }),
  'h-auto min-h-12 grow text-s-caption',
);

export type StudentActivityViewProps = {
  readonly activity: StudentActivity;
  readonly index: number;
  readonly onIndexChange: (next: number) => void;
  /** معرّف الخيار المختار أو نصّ الإجابة، بمعرّف السؤال. */
  readonly answers?: Readonly<Record<string, string>> | undefined;
  /** غيابه يجعل العرض للقراءة وحدها — وهو حال المعاينة عند المعلم. */
  readonly onAnswer?: ((questionId: string, value: string) => void) | undefined;
  /** «إرسال الإجابة» — يأتي فعلياً مع `S07` في P5-3. */
  readonly footer?: ReactNode;
  /** سطر الطمأنة في اللوح: «إجاباتك محفوظة على هذا الجهاز…». */
  readonly note?: string | undefined;
};

export function StudentActivityView({
  activity,
  index,
  onIndexChange,
  answers,
  onAnswer,
  footer,
  note,
}: StudentActivityViewProps) {
  const total = activity.questions.length;
  const question = activity.questions[index];

  if (question === undefined) {
    return (
      <div className={FRAME}>
        <h3 className="text-s-body font-bold">{activity.title}</h3>
        <p className={BLANK}>لا أسئلة في هذا النشاط بعد.</p>
      </div>
    );
  }

  const readOnly = onAnswer === undefined;
  const answer = answers?.[question.id] ?? '';

  return (
    <div className={FRAME}>
      <h3 className="text-s-body font-bold">{activity.title}</h3>
      <div className="text-s-caption text-text-muted">
        سؤال {ar(index + 1)} من {ar(total)}
      </div>

      {/* نصّ السؤال بمقياس القراءة المعتمد — يقرؤه طفل على لوحيّ أو حاسوب. */}
      <p className="mt-1 text-s-reading">
        {question.prompt.trim() === '' ? 'سؤال بلا نصّ بعد.' : question.prompt}
      </p>

      {question.type === 'choice' ? (
        <RadioGroup
          name={`answer-${question.id}`}
          value={answer}
          onValueChange={(next) => onAnswer?.(question.id, next)}
          disabled={readOnly}
          aria-label="خيارات الإجابة"
        >
          {question.options.length === 0 ? <p className={BLANK}>لا خيارات بعد.</p> : null}
          {question.options.map((option, at) => (
            <Label
              key={option.id}
              htmlFor={`answer-${question.id}-${option.id}`}
              className={cn(
                /*
                 * الصفّ كلّه هدف النقر لا القرصُ وحده: ٥٢px ارتفاعاً وإصبعٌ
                 * على لوحيّ. و`gap-2.5` تفصل القرص عن نصّه.
                 */
                'min-h-[52px] items-center gap-2.5 rounded-md border border-input bg-canvas',
                'px-3.5 py-2.5 text-s-body text-text',
                /*
                 * **المختار وحده يُعلَّم — ولا شيء يعلّم الصحيح.** الشرط على
                 * `answer` لا على حقلٍ في السؤال: النوع الواصل لا يحمل مفتاح
                 * الإجابة أصلاً، فلا صنف هنا يمكن أن يكشفه.
                 */
                answer === option.id && 'border-primary bg-primary-soft text-primary-on-soft',
              )}
            >
              <RadioGroupItem id={`answer-${question.id}-${option.id}`} value={option.id} />
              <span>{option.text.trim() === '' ? `الخيار ${ar(at + 1)}` : option.text}</span>
            </Label>
          ))}
        </RadioGroup>
      ) : (
        <Textarea
          rows={4}
          value={answer}
          disabled={readOnly}
          onChange={(event) => onAnswer?.(question.id, event.target.value)}
          placeholder="اكتب إجابتك هنا…"
          aria-label="إجابتك"
          // سطحُ الحقل `canvas` لا `surface`: الإطار حوله أبيض، فحقلٌ أبيض فيه يختفي.
          className="rounded-md bg-canvas px-3.5 py-2.5 text-s-body"
        />
      )}

      {note === undefined ? null : <p className="text-s-caption text-text-muted">{note}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          className={NAV_BUTTON}
          disabled={index === 0}
          onClick={() => onIndexChange(index - 1)}
        >
          السابق
        </button>
        <button
          type="button"
          className={NAV_BUTTON}
          disabled={index >= total - 1}
          onClick={() => onIndexChange(index + 1)}
        >
          التالي
        </button>
      </div>

      {footer}
    </div>
  );
}
