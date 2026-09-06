'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JoinAccepted, JoinStatus, JoinStatusResponse } from '@cubecroom/contracts';
import { Alert, Badge, BrandLogo, Button, Card, Input, Label } from '@cubecroom/ui';

/**
 * تدفّق الطالب: S01 الانضمام ⇦ S02 الانتظار ⇦ S03 الرفض.
 *
 * الانتقال إلى S02 لا يعني وصولاً: الصفحة تسأل عن الحالة كل ثلاث ثوانٍ لأن
 * اللوح يَعِد بأنها «تُفتح تلقائياً بمجرد موافقة معلمك» — ووعدٌ كهذا يجب أن
 * ينفَّذ بلا أن يضغط الطالب شيئاً.
 *
 * ورقم الطلب يُحفظ في تخزين المتصفح: الطالب قد يُغلق الصفحة أو ينطفئ جهازه
 * وهو ينتظر، وإعادةُ إرسال الطلب تُظهر لمعلمه اسمين لطالب واحد.
 */

const STORAGE_KEY = 'cubecroom.join.request';

/**
 * ══ المقياس هنا طلابيّ صراحةً ══
 *
 * مكوّنات المكتبة مكتوبة بمقياس المعلّم، و`data-app="student"` لا يبدّل منها
 * إلا `--height-control`. فكلّ مكوّن في هذه الشاشة يأخذ `text-s-*` بيده —
 * **ولا يأخذ سواه**: الألوان والحدود والحشو تبقى للمكتبة كما هي.
 */

/** البطاقة في وسط الشاشة رأسياً وأفقياً مهما قصر محتواها — والحشو يمنع لصقها بالحافة. */
const SHELL = 'flex min-h-svh items-center justify-center p-5';

/*
 * البطاقة تعرض ما كتبه الطالب بنفسه واسمَ الفصل الآتي من المعلم: اسمٌ بلا فراغ
 * أطول من ٢٧٠px يخرج منها، و`wrap-anywhere` تكسره داخلها — والحقل وظيفته أن
 * يُقرأ للتأكّد، فخروجه منها يُبطل وظيفته.
 *
 * وخطوة اللوحيّ الرأسي (٧٠٠px) كما في بقيّة شاشات الطالب: بلاها تقفز البطاقة
 * من ٣٦٠px إلى ٥٦٠px بفارق بكسل واحد عند ٩٠٠px. والعمود يبقى ضيّقاً عمداً،
 * فهو نموذجُ إدخال لا صفحةُ قراءة.
 */
const CARD = 'w-full max-w-90 gap-2.5 p-6 wrap-anywhere tablet:max-w-115 wide:max-w-140';

type View =
  | { readonly step: 'form' }
  | { readonly step: 'pending'; readonly name: string }
  | { readonly step: 'rejected' }
  | { readonly step: 'approved' }
  | { readonly step: 'ended' };

export type JoinFlowProps = {
  readonly className: string | null;
  readonly teacherName: string | null;
  /** البوابة لا تصل إلى بياناتها — عطلٌ في الجهاز لا حصةٌ مغلقة. */
  readonly broken?: boolean;
};

export function JoinFlow({ className, teacherName, broken = false }: JoinFlowProps) {
  const [view, setView] = useState<View>({ step: 'form' });
  const [requestId, setRequestId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  /**
   * انقطاعٌ أثناء الانتظار — والحالة هنا أشدّ من الرئيسية.
   *
   * الطالب هنا **لم يدخل بعد** وينتظر موافقة قد لا تأتي أبداً لأن معلمه أنهى
   * الحصة قبل أن يبتّ. وصفحةٌ تقول «بانتظار موافقة معلمك» إلى الأبد تجعله
   * ينتظر ما لن يحدث.
   */
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);

  /*
   * اللوحيّ يمسح الرمز المربّع، فيصل ومعه رمز الحصة في الرابط.
   *
   * ومطالبته بكتابته بعد ذلك تعبٌ بلا فائدة: الرمز المربّع معروضٌ على شاشة
   * المعلم نفسها التي عليها الرمز — من رآه فهو في الغرفة. والكتابة تبقى لمن
   * جاء على حاسوب بلا كاميرا، وهم الأكثر.
   */
  useEffect(() => {
    try {
      const fromLink = new URLSearchParams(window.location.search).get('code');
      if (fromLink !== null && fromLink.trim() !== '') setJoinCode(fromLink);
    } catch {
      /* رابطٌ بلا استعلام — يُكتب الرمز يدوياً كالمعتاد. */
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved) as { id?: string; name?: string };
        if (typeof parsed.id === 'string' && typeof parsed.name === 'string') {
          setRequestId(parsed.id);
          setName(parsed.name);
          setView({ step: 'pending', name: parsed.name });
        }
      }
    } catch {
      // تخزين معطّل أو محتوى تالف — يبدأ الطالب من النموذج، ولا شيء يتعطّل.
    }
  }, []);

  const forget = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* لا شيء يعتمد على نجاح المسح. */
    }
    setRequestId(null);
  }, []);

  const misses = useRef(0);
  /** ثلاث محاولات ≈ تسع ثوانٍ هنا — الاستطلاع أسرع (كل ثلاث ثوانٍ). */
  const PATIENCE = 3;

  const poll = useCallback(async () => {
    if (requestId === null) return;
    try {
      const response = await fetch(`/api/join/status?request=${encodeURIComponent(requestId)}`);
      misses.current = 0;
      setLost(false);
      const body = (await response.json()) as { data?: JoinStatusResponse };
      const status: JoinStatus | undefined = body.data?.status;
      if (status === 'approved') {
        setView({ step: 'approved' });
        // «انتقال تلقائي دون كلمة مرور» (US-S04): الكعكة وصلت مع هذا الردّ،
        // وتحميل الصفحة كاملاً هو ما يجعل الخادم يقرؤها في الطلب التالي.
        window.location.assign('/');
      } else if (status === 'rejected') {
        forget();
        setView({ step: 'rejected' });
      } else if (status === 'session_ended' || status === 'expired') {
        forget();
        setView({ step: 'ended' });
      }
    } catch {
      // تعثّرة واحدة لا تُقلق الطالب؛ وانقطاعٌ يدوم يُقال له بلا تخمين سببه.
      misses.current += 1;
      if (misses.current >= PATIENCE) setLost(true);
    }
  }, [requestId, forget]);

  useEffect(() => {
    if (view.step !== 'pending' || requestId === null) return;
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => clearInterval(timer);
  }, [view.step, requestId, poll]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          joinCode: joinCode.trim(),
          ...(identifier.trim() === '' ? {} : { identifier: identifier.trim() }),
        }),
      });
      const body = (await response.json()) as {
        data?: JoinAccepted;
        error?: { message: string };
      };

      if (body.data === undefined) {
        setError(body.error?.message ?? 'تعذّر إرسال طلبك. أعد المحاولة.');
        return;
      }

      setRequestId(body.data.requestId);
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ id: body.data.requestId, name: body.data.submittedName }),
        );
      } catch {
        /* بلا تخزين يعمل التدفّق، لكن إغلاق الصفحة يفقد المتابعة. */
      }
      setView({ step: 'pending', name: body.data.submittedName });
    } catch {
      setError('تعذّر الوصول إلى جهاز معلمك. تأكد أنك على شبكة Wi-Fi نفسها.');
    } finally {
      setBusy(false);
    }
  };

  const header = (
    /*
     * الخطّ الفاصل حدٌّ على الكتلة لا `Separator` مستقلّاً: فوقه ١٢px وتحته
     * ٨px زيادةً على فجوة البطاقة — أي أنّ الترويسة تلتصق بخطّها ثم تُبعد ما
     * بعدها. و`Separator` عنصرٌ في العمود، فيأخذ فجوة البطاقة من طرفيه معاً
     * فيتساوى ما فوقه بما تحته وتفقد الترويسة انتماء خطّها إليها.
     */
    <div className="mb-2 flex flex-col gap-0.5 border-b border-hairline pb-3">
      <BrandLogo className="mb-1.5 self-start" markClassName="size-7" wordmarkClassName="text-s-body" />
      {className !== null ? (
        <>
          <div className="text-s-body font-semibold">{className}</div>
          {teacherName !== null && teacherName !== '' ? (
            <div className="text-s-caption text-text-muted">أ. {teacherName}</div>
          ) : null}
        </>
      ) : null}
    </div>
  );

  /*
   * يُفحص قبل `className === null` لأنه يشرحها: حين تُعطب البوابة لا يصل
   * اسم الفصل أصلاً — فلو تأخّر لَابتلعته رسالةُ «الدخول غير مفتوح».
   */
  if (broken) {
    return (
      <main className={SHELL}>
        <Card className={CARD}>
          {header}
          <h1 className="text-s-h1">تعذّر فتح صفحة الدخول</h1>
          <p className="text-s-body text-text-2">
            المشكلة في جهاز المعلم لا في اتصالك — وإعادة التحميل لن تُصلحها. أخبر معلمك أن بوابة
            الطلاب لا تصل إلى بياناتها.
          </p>
        </Card>
      </main>
    );
  }

  if (className === null) {
    return (
      <main className={SHELL}>
        <Card className={CARD}>
          {header}
          <h1 className="text-s-h1">الدخول غير مفتوح الآن</h1>
          <p className="text-s-body text-text-2">
            لم يفتح معلمك دخول الطلاب بعد، أو أنهى الحصة. أبقِ هذه الصفحة مفتوحة وأعد تحميلها حين
            يطلب منك.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className={SHELL}>
      <Card className={CARD}>
        {header}

        {view.step === 'form' ? (
          <>
            <h1 className="text-s-h1">الانضمام إلى الفصل</h1>
            <p className="text-s-body text-text-2">
              اكتب اسمك وأرسل طلب الدخول — سيوافق معلمك عليه من جهازه.
            </p>

            {/*
              الرمز أولاً لأنه أول ما يُكتب على السبورة، ولأنّ الاسم بلا رمز
              لا يصل — فترتيبٌ يعكس ذلك أقلّ إحباطاً من نموذجٍ يُملأ ثم يُرفض.
            */}
            <Label className="mt-2 text-s-label" htmlFor="student-code">
              رمز الحصة
            </Label>
            <Input
              id="student-code"
              /*
               * حقل الرمز: أرقام كبيرة متباعدة.
               *
               * الطالب ينقل ستّ خانات عن سبورة بعيدة إلى لوحة مفاتيح، وحقلٌ
               * بخطّ النصّ العادي لا يُظهر له أنه أخطأ خانةً قبل أن يُرسل.
               * والتتبّع استثناء مقصود من `letter-spacing: 0` في الأساس: تلك
               * القاعدة تحمي اتصال الحروف العربية، ولا حرف هنا — أرقامٌ وحدها.
               */
              className="text-center text-s-h1 tracking-[0.16em] tabular-nums"
              value={joinCode}
              onChange={(event) => {
                setJoinCode(event.target.value);
                if (error !== null) setError(null);
              }}
              placeholder="٤٨٢ ٩١٧"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
            />
            <p className="text-s-caption text-text-muted">الرمز الذي كتبه معلمك على السبورة.</p>

            <Label className="mt-2 text-s-label" htmlFor="student-name">
              اسمك
            </Label>
            <Input
              id="student-name"
              className="text-s-body"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                if (error !== null) setError(null);
              }}
              placeholder="اكتب اسمك الكامل"
            />
            <p className="text-s-caption text-text-muted">يظهر لمعلمك كما تكتبه.</p>

            {/* `Label` صفٌّ مرن بفجوته: «اختياري» تقف بجانب الاسم بلا مسافة مكتوبة. */}
            <Label className="mt-2 text-s-label" htmlFor="student-identifier">
              رقمك في الفصل
              <span className="text-s-caption font-normal text-text-muted">اختياري</span>
            </Label>
            <Input
              id="student-identifier"
              className="text-s-body"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="إن طلبه معلمك"
              inputMode="numeric"
            />

            {error !== null ? (
              <Alert tone="error" live className="text-s-caption">
                {error}
              </Alert>
            ) : null}

            {/*
              ثلاثة فروع لا شرطٌ واحد: الزرّ المعطَّل يحمل سببه تحته بحكم نوعه،
              والسبب يختلف باختلاف ما ينقص. وحال الإرسال يكرّر نصّ الزرّ عمداً
              — لا سبب سواه، ولا تُخترع للطالب جملة لم تكن على الشاشة.

              و`w-full` لأن الزرّ المعطَّل يُلفّ مع سببه في عمودٍ يبدأ من حافته:
              بلاها ينكمش إلى عرض نصّه، فيقفز عرضُ الدعوة الأساسية بين حالتين.
            */}
            {busy ? (
              <Button
                variant="primary"
                className="mt-1.5 w-full text-s-body"
                disabled
                disabledReason="جارٍ الإرسال…"
              >
                جارٍ الإرسال…
              </Button>
            ) : joinCode.trim() === '' ? (
              <Button
                variant="primary"
                className="mt-1.5 w-full text-s-body"
                disabled
                disabledReason="اكتب رمز الحصة ليصبح الزر جاهزاً."
              >
                طلب الدخول
              </Button>
            ) : name.trim().length < 2 ? (
              <Button
                variant="primary"
                className="mt-1.5 w-full text-s-body"
                disabled
                disabledReason="أكمِل اسمك ليصبح الزر جاهزاً."
              >
                طلب الدخول
              </Button>
            ) : (
              <Button
                variant="primary"
                className="mt-1.5 w-full text-s-body"
                onClick={() => void submit()}
              >
                طلب الدخول
              </Button>
            )}

            <p className="mt-1.5 text-s-caption text-text-muted">
              لا تحتاج إلى حساب ولا كلمة مرور. اسمك يُرسَل إلى جهاز معلمك فقط.
            </p>
          </>
        ) : null}

        {view.step === 'pending' && lost ? (
          <>
            <h1 className="text-s-h1">انقطع الاتصال بجهاز معلمك</h1>
            <p className="text-s-body text-text-2">
              إمّا أنهى معلمك الحصة، وإمّا خرج جهازك من شبكة Wi-Fi. أبقِ هذه الصفحة مفتوحة — تعود
              وحدها متى عاد الاتصال.
            </p>
            <p className="mt-1.5 text-s-caption text-text-muted">
              طلبك لم يضِع: إن عاد الاتصال والحصة مفتوحة، تابعنا حالته.
            </p>
          </>
        ) : null}

        {view.step === 'pending' && !lost ? (
          <>
            <h1 className="text-s-h1">تم إرسال طلبك</h1>
            <p className="text-s-body text-text-2">بانتظار موافقة معلمك على دخولك.</p>
            {/* الشارة تلتصق ببداية السطر: لولا ذلك لمُدّت بعرض البطاقة كلها. */}
            <Badge tone="pending" className="self-start text-s-caption font-semibold">
              طلب بانتظار الموافقة
            </Badge>
            <div className="rounded-md border border-hairline bg-canvas px-3.5 py-3">
              <div className="text-s-caption text-text-muted">الاسم الذي أرسلته</div>
              <div className="mt-0.5 text-s-body font-semibold">{view.name}</div>
            </div>
            <Button
              variant="secondary"
              className="mt-1.5 text-s-body"
              onClick={() => {
                forget();
                setView({ step: 'form' });
              }}
            >
              تعديل
            </Button>
            <p className="mt-1.5 text-s-caption text-text-muted">
              تُفتح الصفحة تلقائياً بمجرد موافقة معلمك — أبقِها مفتوحة ولا تحتاج إلى تحديثها.
            </p>
          </>
        ) : null}

        {view.step === 'approved' ? (
          <>
            <h1 className="text-s-h1">وافق معلمك على دخولك</h1>
            <p className="text-s-body text-text-2">
              صفحة دروسك تُبنى في الخطوة التالية من المشروع. عد إلى معلمك حتى ذلك الحين.
            </p>
          </>
        ) : null}

        {view.step === 'rejected' ? (
          <>
            <h1 className="text-s-h1">لم يُقبل طلبك</h1>
            <p className="text-s-body text-text-2">
              لم تُحفظ عنك أي بيانات، ولا يظهر اسمك في الفصل.
            </p>
            <Button
              variant="primary"
              className="mt-1.5 text-s-body"
              onClick={() => setView({ step: 'form' })}
            >
              إعادة المحاولة
            </Button>
            <p className="mt-1.5 text-s-caption text-text-muted">
              تحدّث مع معلمك أولاً، فسيرى طلبك من جديد.
            </p>
          </>
        ) : null}

        {/* S09 — النصّ من اللوح: الطمأنة أولاً، فالطالب يخاف على ما أرسله. */}
        {view.step === 'ended' ? (
          <>
            <h1 className="text-s-h1">انتهت الحصة</h1>
            <p className="text-s-body text-text-2">
              أنهى معلمك جلسة الدخول. لن تستطيع فتح الفصل حتى يشغّلها مرة أخرى في الحصة القادمة.
            </p>
            <Alert tone="ok" className="text-s-caption">
              كل ما أرسلته وصل إلى معلمك ومحفوظ عنده — لم يضِع شيء بإنهاء الجلسة.
            </Alert>
            <p className="mt-1.5 text-s-caption text-text-muted">
              لا تحتاج إلى الانتظار هنا — افتح العنوان واكتب رمز الحصة الجديد عند بدئها.
            </p>
          </>
        ) : null}
      </Card>
    </main>
  );
}
