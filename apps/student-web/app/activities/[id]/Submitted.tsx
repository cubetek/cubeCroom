import Link from 'next/link';
import { ar, when } from '@cubecroom/contracts';
import type { StudentActivity, SubmissionReceipt } from '@cubecroom/contracts';
import { buttonVariants, cn } from '@cubecroom/ui';

/**
 * S08 — تم إرسال إجابتك.
 *
 * وقت الإرسال هو **دليل الطالب على الوصول** (US-S07)، فهو أبرز ما في الشاشة
 * بعد العنوان: طفلٌ يشكّ أن إجابته وصلت يعيد إرسالها، أو يقلق حتى الحصة
 * القادمة.
 *
 * ولا زرّ «إرسال» هنا ولا «تعديل»: «لا حاجة لإرسالها مرة أخرى» كما في اللوح،
 * وزرٌّ يوحي بغير ذلك يجعل الطالب يظن أن شيئاً ينقص.
 */

/**
 * عمود الإيصال — **وهو وحده من يستعمل هذا العرض**.
 *
 * صفحة الإجابة التي تسبقه تأخذ عمود `lessons`: ١٠٤٠px يقف داخله عمود القراءة
 * عند ٧٦٠px. وهذا يقف عند ٧٦٠px مباشرةً لأن لا عمود قراءة داخله يحدّه. فالرقمان
 * يلتقيان عند ما يراه الطالب فعلاً — ينتقل من صفحةٍ إلى التي تليها مباشرةً ولا
 * يتغيّر عرض النصّ تحته.
 *
 * و٧٠٠px هي خطوة اللوحيّ الرأسيّ نفسها المشروحة في `lessons/page.tsx`.
 */
const PAGE = cn(
  'mx-auto flex min-h-svh max-w-[460px] flex-col gap-3 px-4 pt-5 pb-8 wrap-anywhere',
  'tablet:max-w-[700px]',
  'wide:max-w-[760px]',
);

const BACK = cn(buttonVariants({ variant: 'secondary' }), 'self-start text-s-caption');

/** بطاقة من بطاقات الإيصال — سطحٌ واحد يتكرّر ثلاث مرات في الشاشة. */
const CARD = 'rounded-lg border border-hairline bg-surface px-4 py-3.5';

/**
 * «العودة إلى الفصل» رابطٌ يبدو زرّاً — وهدف لمسه ٥٢px كبقية أفعال الطالب.
 *
 * و`text-s-body` مكتوبةٌ بيده: `buttonVariants` مبنيّ بمقياس المعلّم
 * (`text-t-body`)، و`data-app="student"` لا يبدّل منه إلا `--height-control`.
 */
const BACK_HOME = cn(
  buttonVariants({ variant: 'secondary' }),
  'h-auto min-h-[52px] w-full text-s-body font-semibold',
);

export type SubmittedProps = {
  readonly activity: StudentActivity;
  readonly receipt: SubmissionReceipt;
  /** حين تُعرض بعد إرسالٍ في الصفحة نفسها لا عند فتحها من جديد. */
  readonly inline?: boolean;
};

export function Submitted({ activity, receipt, inline = false }: SubmittedProps) {
  const body = (
    <div className="flex flex-col gap-3">
      <h1 className="text-s-h1 text-ok-text">تم إرسال إجابتك</h1>
      <p className="text-s-reading text-text-2">وصلت إلى معلمك. لا حاجة لإرسالها مرة أخرى.</p>

      <div className={CARD}>
        <div className="text-s-body font-bold">{activity.title}</div>
        <div className="mt-1 text-s-caption text-text-muted">
          {ar(receipt.total)} {receipt.total === 1 ? 'سؤال' : 'أسئلة'} · أجبت عن{' '}
          {ar(receipt.answered)}
        </div>
      </div>

      <div className={CARD}>
        <div className="text-s-caption text-text-muted">وقت الإرسال</div>
        {/* الوقت دليل الوصول — فهو أبرز رقم في الشاشة. */}
        <div className="mt-0.75 text-s-reading-h font-bold">
          {when(receipt.submittedAt, { time: 'always' })}
        </div>
      </div>

      <div className="self-start rounded-full border border-pending-border bg-pending-bg px-3.5 py-2 text-s-caption text-pending-text">
        بانتظار مراجعة معلمك
      </div>

      <Link href="/" className={BACK_HOME}>
        العودة إلى الفصل
      </Link>
    </div>
  );

  if (inline) return body;

  return (
    <main className={PAGE}>
      <Link href="/activities" className={BACK}>
        الأنشطة
      </Link>
      {body}
    </main>
  );
}
