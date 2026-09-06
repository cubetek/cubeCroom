'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Icon } from '@cubecroom/ui';
import type { BootState } from '@cubecroom/contracts';
import { Home } from '@/screens/Home';
import { Recovery } from '@/screens/Recovery';
import { Onboarding } from '@/onboarding/Onboarding';
import { bridge, hasBridge } from '@/lib/bridge';
import { UpdateLifecycle } from '@/updates/UpdateLifecycle';

/**
 * جذر واجهة المعلم: يقرأ حالة الإقلاع ثم يفرّع.
 *
 *   loading    ⇦ T01 — شعار وشريط تقدّم، ورسالة «نجهّز بياناتك…» بعد ٥ ثوانٍ
 *   onboarding ⇦ T02 · T03 · T03b
 *   blocked    ⇦ T01States/٣ — رفض الإقلاع برسالة وإجراء
 *   ready      ⇦ T05
 */
export default function Page() {
  return <UpdateLifecycle><Application /></UpdateLifecycle>;
}

function Application() {
  const [state, setState] = useState<BootState | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  const load = useCallback(async () => {
    setFatal(null);
    setState(null);
    if (!hasBridge()) {
      setFatal('افتح CubeCroom من التطبيق نفسه — هذه الصفحة لا تعمل داخل المتصفح.');
      return;
    }
    try {
      setState(await bridge().bootState());
    } catch (error) {
      setFatal(error instanceof Error ? error.message : 'تعذّر تشغيل التطبيق.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // «إذا طال التشغيل: نجهّز بياناتك…» — تظهر متأخرة فلا تومض في التشغيل السريع.
  useEffect(() => {
    if (state !== null || fatal !== null) return;
    const timer = setTimeout(() => setSlow(true), 5000);
    return () => clearTimeout(timer);
  }, [state, fatal]);

  const relocate = async () => {
    try {
      setState(await bridge().relocateDataDirectory());
    } catch (error) {
      setFatal(error instanceof Error ? error.message : 'تعذّر تحديد مكان البيانات.');
    }
  };

  // بلا جسر لا مخرج غير إعادة المحاولة: لا نافذة اختيار مجلد في متصفّح.
  if (fatal !== null) return <Blocked message={fatal} canRetry onRetry={() => void load()} />;
  if (state === null) return <Splash slow={slow} />;

  if (state.status === 'blocked') {
    return (
      <Blocked
        message={state.message}
        canRetry={state.canRetry}
        onRetry={() => void load()}
        onRelocate={() => void relocate()}
      />
    );
  }

  if (state.status === 'onboarding') {
    return (
      <Onboarding defaultDataDirectory={state.defaultDataDirectory} onDone={(next) => setState(next)} />
    );
  }

  return <Home teacherName={state.teacher.name} />;
}

/** إطار الشاشات التي تسبق القشرة — الترحيب والحجب والاستعادة تشترك فيه. */
const FRAME = 'flex h-full flex-col';
const FRAME_BODY = 'flex grow items-start justify-center overflow-auto px-8 pt-6 pb-8';

/* ── T01 ────────────────────────────────────────────── */

function Splash({ slow }: { slow: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4.5">
      <div className="size-18 rounded-xl bg-primary" />
      <div className="text-t-display">CubeCroom</div>
      <div className="h-1 w-42 overflow-hidden rounded-full bg-hairline">
        {/*
         * نبضةٌ من الإطار مكان `@keyframes` كانت مكتوبة بيد.
         *
         * والمؤشّر الزاحف القديم كان يُزاح بـ`translateX` وهو فيزيائيّ لا
         * ينعكس مع `dir="rtl"`، فكان يخرج من الجهة الخطأ ويترك المسار فارغاً
         * أكثر من ثلث كل دورة. والنبض شفافيةٌ لا إزاحة، فلا اتجاه له أصلاً —
         * ويستوي في العربية والّلاتينية بلا قاعدةٍ ثانية.
         *
         * و`motion-safe` تحفظ ما كان يحفظه `prefers-reduced-motion`: من ضبط
         * جهازه على تقليل الحركة يرى مؤشّراً ساكناً في مكانه لا يُقصّ ولا يقفز.
         */}
        <div className="h-full w-5/12 rounded-full bg-primary motion-safe:animate-pulse" />
      </div>
      {slow ? <p className="text-t-h3 font-normal text-text-2">نجهّز بياناتك…</p> : null}
    </div>
  );
}

/**
 * T01States/٣ — الحالة الوحيدة التي تظهر فيها كلمة خطأ، ولا تظهر في تشغيل
 * سليم أبداً. ثلاثة مخارج كما في اللوح، والنمط نفسه المستعمل في خطأ T06
 * المانع — نمط واحد لا نمطان.
 *
 * «إعادة المحاولة» تختفي حين `canRetry === false`: القاعدة الأحدث من التطبيق
 * لا تُصلحها إعادة محاولة، وعرض زرّ لا يفيد يُبقي المعلم يضغطه.
 *
 * «استعادة نسخة احتياطية» معطّلة هنا لا محذوفة: اللوح يعدّها مخرجاً، والمسار
 * نفسه يحتاج تأكيداً قوياً ونسخة وقائية (P6-3) — واستعادةٌ بلا ذلك تستبدل
 * بيانات الجهاز بلا رجعة.
 */
function Blocked({
  message,
  canRetry,
  onRetry,
  onRelocate,
}: {
  message: string;
  canRetry: boolean;
  onRetry: () => void;
  onRelocate?: (() => void) | undefined;
}) {
  const [recovering, setRecovering] = useState(false);

  if (recovering) {
    return (
      <div className={FRAME}>
        <div className={FRAME_BODY}>
          <Recovery onCancel={() => setRecovering(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className={FRAME}>
      <div className={FRAME_BODY}>
        {/*
         * `m-auto` لا `items-center` على الحاوية: الهامش التلقائي يوسّط
         * البطاقة على المحورين ويتجاوز `items-start` أعلاه، فتبقى الحاوية
         * تلصق ما هو أطول من الشاشة بأعلاها بدل أن تقصّه.
         */}
        <div className="m-auto flex w-140 flex-col items-center gap-3 rounded-lg border border-error-border bg-surface p-8 text-center shadow-2">
          <div className="flex size-16 items-center justify-center rounded-full border border-error-border bg-error-bg text-error-text">
            <Icon name="alert-circle" size={30} />
          </div>
          <h1 className="text-t-h1">تعذّر فتح بياناتك</h1>
          <p className="text-t-body text-text-2">{message}</p>

          {/*
           * المخارج الثلاثة تلتفّ على سطرين عند الحاجة — أطولها «استعادة نسخة
           * احتياطية» ومعه سبب تعطيله، فلا يُدفع خارج البطاقة.
           */}
          <div className="mt-3 flex flex-wrap items-start justify-center gap-3">
            {canRetry ? (
              <Button variant="primary" onClick={onRetry}>
                إعادة المحاولة
              </Button>
            ) : null}

            {onRelocate ? (
              <Button variant="secondary" onClick={onRelocate} icon={<Icon name="folder" size={17} />}>
                تحديد مكان البيانات
              </Button>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => setRecovering(true)}
              icon={<Icon name="database" size={17} />}
            >
              استعادة نسخة احتياطية
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
