'use client';

import { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Card, CardContent, Icon, ar, cn } from '@cubecroom/ui';
import {
  CHECK_ACTION_LABELS,
  CHECK_STATE_LABELS,
  FIREWALL_STEPS,
  ISOLATION_NOTICE,
  type CheckState,
  type Diagnostics as DiagnosticsState,
  type DiagnosticCheck,
  type ExportedResults,
} from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';
import { when } from './Lessons';

/**
 * T21 — تشخيص الاتصال (FR-016).
 *
 * **الشاشة التي يفتحها المعلم حين يفشل كل شيء آخر**، فأخطر ما فيها أن تكذب:
 * «جدار الحماية يسمح» ثم لا يدخل طلابه يُفقده الثقة بكل سطر فيها، ويتركه بلا
 * دليل يتّبعه. ولذلك حالتان منها ليستا حكماً — «لم يُفحص» و«متوقّف على غيره»
 * — وتُعرضان بلونٍ محايد لا أخضر ولا أحمر.
 *
 * وكل مشكلة يقابلها إجراء يملك المعلم تنفيذه بنفسه: صفٌّ يقول «مشكلة» بلا زرّ
 * هو شكوى لا تشخيص.
 *
 * والفحص **لا يجري تلقائياً كل ثانية**: نتيجةٌ تتبدّل تحت عين المعلم وهو يقرؤها
 * تمنعه من اتّباعها. يُفحص عند الفتح، وبعد كل إجراء، وبزرّ «إعادة الفحص».
 */

/**
 * قاعدة اللون هنا أضيق منها في بقية المنتج: الأخضر والأحمر لحالتين **فُحصتا**
 * فقط. «لم يُفحص» و«متوقّف على غيره» رماديّان — لأن لوناً يوحي بحكم لم يصدر
 * هو أول ما يفقد المعلم ثقته بالشاشة.
 *
 * والنقطة كانت `#94a3b8` مكتوباً بيده، ولا نسبة محسوبة له في الرموز. و
 * `border-input` هو الرمز المحايد الوحيد المقيس (3.43:1) — يُرى على السطح ولا
 * يدّعي حكماً، فحلّ محلّه.
 */
const DOT: Readonly<Record<CheckState, string>> = {
  ok: 'bg-ok-text',
  problem: 'bg-error-text',
  unknown: 'bg-border-input',
  blocked: 'bg-border-input',
};

/**
 * الحالة نصّاً — والشارة هنا **ليست `Badge`**: درجات الشارة الخمس كلّها تحمل
 * أيقونةً تعلن حكماً (صحّ · ساعة · تنبيه)، و«لم يُفحص» لا حكم فيها. وشكلُها
 * حبّةٌ كاملة الاستدارة لا `rounded-sm`، فهي أقرب إلى وسمٍ في صفّ منها إلى
 * شارةِ كائن.
 */
const PILL: Readonly<Record<CheckState, string>> = {
  ok: 'border-ok-border bg-ok-bg text-ok-text',
  problem: 'border-error-border bg-error-bg text-error-text',
  unknown: 'border-hairline bg-canvas text-text-muted',
  blocked: 'border-hairline bg-canvas text-text-muted',
};

export type DiagnosticsProps = {
  readonly onOpenAccess: () => void;
};

export function Diagnostics({ onOpenAccess }: DiagnosticsProps) {
  const [state, setState] = useState<DiagnosticsState | null>(null);
  /** ما بعد التصدير: اسم الملفّ ومكانه — لا «تمّ» لا تقول أين ذهب. */
  const [exported, setExported] = useState<ExportedResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showTechnical, setShowTechnical] = useState(false);
  const [copied, setCopied] = useState(false);
  const [firewallHelp, setFirewallHelp] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      setState(await bridge().diagnostics());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إجراء الفحص.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  const act = async (check: DiagnosticCheck) => {
    if (check.action === 'open_access' || check.action === 'start_portal') {
      onOpenAccess();
      return;
    }
    if (check.action === 'open_firewall') {
      // شاشة النظام لا قاعدة يكتبها التطبيق: القرار يبقى عند المعلم في نظامه.
      const opened = await bridge().openFirewallSettings();
      setFirewallHelp(true);
      if (opened.status === 'failed') setError(opened.message);
      return;
    }
    await run();
  };

  const copyTechnical = async () => {
    if (state === null) return;
    const text = state.technical.map((row) => `${row.label}: ${row.value}`).join('\n');
    await bridge().copyText({ text });
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (state === null) {
    return <div className="m-auto text-t-body text-text-muted">{error ?? 'نفحص الاتصال…'}</div>;
  }

  const exportLog = async () => {
    try {
      setExported(await bridge().diagnosticsExport());
    } catch {
      setExported(null);
    }
  };

  return (
    <div className="flex min-h-0 grow flex-col gap-3.5 overflow-auto">
      {exported === null ? null : (
        /*
         * سطر ما بعد التصدير — يقول اسم الملفّ لا «تمّ» مجرّدة.
         *
         * والدور `status` لا `alert`: لم ينكسر شيء، فيُنطق دون مقاطعة ما يقرؤه
         * قارئ الشاشة. و`Alert` لا يعرف إلا `alert` أو لا شيء، فيُحمل الدور على
         * الحاوية ويبقى شكل اللوح من المكوّن.
         */
        <div role="status" className="mb-4">
          <Alert tone="ok">حُفظ «{exported.fileName}» في مجلد الصادرات — أرسله لمن يساعدك.</Alert>
        </div>
      )}

      <header className="flex flex-wrap items-center gap-3">
        {/* `me-auto` تدفع الزرّين إلى نهاية السطر بلا عنصرٍ فارغ يحشو ما بينهما. */}
        <div className="me-auto">
          <h2 className="text-t-h2 font-bold">تشخيص الاتصال</h2>
          <div className="text-t-label text-text-muted">آخر فحص: {when(state.checkedAt)}</div>
        </div>
        {busy ? (
          <Button variant="secondary" disabled disabledReason="جارٍ الفحص…">
            جارٍ الفحص…
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void run()}>
            إعادة الفحص
          </Button>
        )}
        {/*
          المعلم غير التقنيّ يُطلب منه أن يصف عطلاً لا يفهمه. فيُعطى ملفّاً
          يرسله بدل الوصف — منقّىً من الأسرار قبل أن يُكتب (SEC-005).

          ولا يتعطّل مع الفحص: تصدير ما قيس آخر مرة نافعٌ حتى أثناء إعادة فحص.
        */}
        <Button variant="secondary" onClick={() => void exportLog()}>
          تصدير السجلّ
        </Button>
      </header>

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {/* الخلاصة تلبس سطح الخطأ كلّه حين توجد مشكلة — لا حدّاً أحمر وحده. */}
      <Card className={cn('gap-2', state.problems > 0 && 'border-error-border bg-error-bg')}>
        <CardContent className="flex flex-col gap-2">
          <h3 className="text-t-h2 font-bold">{state.headline}</h3>
          <p className="text-t-label text-text-2">
            {state.problems > 0
              ? 'أصلِحها من الزر المقابل لها في القائمة أدناه، ثم أعد الفحص.'
              : state.unresolved > 0
                ? 'ما بقي لا يستطيع جهازك أن يفحصه وحده — الخطوة المقابلة له تُنهيه.'
                : 'لم يبقَ ما نستطيع فحصه من هنا.'}
          </p>
          <div className="mt-1 flex gap-5.5">
            <Count value={state.ok} label="تعمل" tone="ok" />
            <Count value={state.problems} label="مشكلة" tone="bad" />
            <Count value={state.unresolved} label="لم يُفحص" tone="muted" />
          </div>
        </CardContent>
      </Card>

      {/*
       * `shrink-0`: الصفحة عمود مرن، وبلا هذا تنكمش القائمة تحت ضغط ما بعدها
       * فيُقصّ آخر صفّ — وآخر صفّ هنا هو «وصول جهاز طالب»، وهو أهم ما يقرؤه
       * المعلم.
       */}
      <ul className="shrink-0 list-none overflow-hidden rounded-lg border border-hairline bg-surface">
        {state.checks.map((check) => (
          <li
            key={check.id}
            className="flex items-center gap-3 border-b border-hairline px-4.5 py-3.5 last:border-b-0"
          >
            <span className={cn('size-2.5 shrink-0 rounded-full', DOT[check.state])} aria-hidden />
            <div className="min-w-0 grow">
              <div className="text-t-body font-semibold">{check.title}</div>
              <p className="mt-0.75 text-t-label text-text-2">{check.detail}</p>
            </div>
            {check.action === null ? null : (
              <Button variant="secondary" size="sm" onClick={() => void act(check)}>
                {CHECK_ACTION_LABELS[check.action]}
              </Button>
            )}
            {/* الحالة نصّاً لا لوناً وحده — قاعدة الشارات في هذا المنتج. */}
            <span
              className={cn(
                'rounded-full border px-2.5 py-1 text-t-badge font-bold whitespace-nowrap',
                PILL[check.state],
              )}
            >
              {CHECK_STATE_LABELS[check.state]}
            </span>
          </li>
        ))}
      </ul>

      {/*
       * خطوات جدار الحماية — تُعرض بعد فتح شاشة النظام.
       * المعلم يغادر التطبيق إلى نافذة ويندوز ثم يعود، فيجد ما يفعله مكتوباً
       * أمامه لا في ذاكرته.
       */}
      {firewallHelp ? (
        <Card className="gap-2 py-4">
          <CardContent className="flex flex-col gap-2">
            <h3 className="text-t-body font-bold">ما تفعله في شاشة جدار الحماية</h3>
            {/*
             * `list-decimal` مكتوبة صراحةً: تهيئة Tailwind تُسقط ترقيم القوائم
             * كلَّه، والترقيم هنا هو الخطوات نفسها — لا زخرفة تُستغنى عنها.
             */}
            <ol className="list-decimal ps-5 text-t-label text-text-2">
              {FIREWALL_STEPS.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <p className="text-t-label text-text-muted">
              بعد السماح، أعد الفحص من هنا — لا حاجة لإعادة تشغيل التطبيق.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Alert tone="pending">{ISOLATION_NOTICE}</Alert>

      <section className="flex flex-col items-start gap-2.5">
        {/*
         * زرٌّ عارٍ لا `Button`: الصفّ ثلاثة أبناء بفجوة بينها — سهمٌ ونصٌّ
         * وتعليقٌ خافت — و`Button` يلفّ أبناءه في `<span>` واحد فيلتصق النصّان
         * بلا فاصل. والحالة مُعلَنة بـ`aria-expanded` لا بشكل السهم وحده.
         */}
        <button
          type="button"
          className="flex cursor-pointer items-center gap-1.5 text-t-label text-text-2"
          onClick={() => setShowTechnical((open) => !open)}
          aria-expanded={showTechnical}
        >
          <Icon name={showTechnical ? 'chevron-prev' : 'chevron-next'} size={15} />
          تفاصيل تقنية
          <span className="text-text-muted">— تُفتح وتُنسخ عند طلب الدعم الفني فقط</span>
        </button>

        {showTechnical ? (
          <>
            <dl className="w-full max-w-[520px] rounded-md border border-hairline bg-canvas px-3.5 py-3">
              {state.technical.map((row) => (
                <div key={row.label} className="flex gap-2.5 py-1">
                  <dt className="text-t-label text-text-muted">{row.label}</dt>
                  <dd className="ltr-island wrap-anywhere text-t-caption text-text-2" dir="ltr">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
            <Button variant="ghost" size="sm" onClick={() => void copyTechnical()}>
              {copied ? 'نُسخت' : 'نسخ التفاصيل'}
            </Button>
          </>
        ) : null}
      </section>
    </div>
  );
}

const COUNT_TONE = {
  ok: 'text-ok-text',
  bad: 'text-error-text',
  muted: 'text-text-muted',
} as const;

function Count({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: keyof typeof COUNT_TONE;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      {/* عرض ثابت: الرقم يتبدّل مع كل فحص فلا يجوز أن يزحزح ما بجانبه. */}
      <span className={cn('inline-block min-w-[1.2ch] text-t-h1 tabular-nums', COUNT_TONE[tone])}>
        {ar(value)}
      </span>
      <span className="text-t-label text-text-muted">{label}</span>
    </div>
  );
}

export type { CheckState };
