'use client';

import { useState } from 'react';
import {
  Alert,
  BrandLogo,
  BrandMark,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Icon,
  Input,
  Label,
  cn,
} from '@cubecroom/ui';
import type { BootState } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * أول تشغيل — T02 · T03 · T03b.
 *
 * التدفّق المعتمد خمس خطوات (docs/design/12-lowfi-first-run.md). المبنيّ منها
 * ثلاث: خطوة الذكاء الاصطناعي في P4-3 وخطوة أول فصل في P3-1. عدّاد الخطوات
 * يُشتق من الخطوات القائمة فعلاً لا من الرقم النهائي — عرض «١ من ٥» في بناء
 * فيه ثلاث خطوات يعِد بما لا يوجد.
 *
 * الكتابة تحدث مرة واحدة في نهاية الخطوة الثالثة: لا يمكن حفظ اسم المعلم قبل
 * معرفة مكان القاعدة، فلا إعداد نصفيّ يربك الإقلاع التالي إن أُغلق التطبيق.
 */

type Step = 'welcome' | 'profile' | 'location';

const ORDER: readonly Step[] = ['welcome', 'profile', 'location'];

/**
 * بطاقة الخطوة — عرضها ثابت لأنها لوحُ حوارٍ لا عمودُ محتوى: نصُّها قصير،
 * وتمديدها على شاشة عريضة يباعد العنوان عن حقله بلا فائدة. و`gap-5` و`py-7.5`
 * و`shadow-2` تتجاوز افتراضات `Card` (وهي `gap-4` و`py-5` و`shadow-1`): هذه
 * البطاقة تطفو وحدها على صفحة فارغة، ولا تقف في شبكة بطاقات.
 */
const STEP_CARD = 'w-155 gap-5 py-7.5 shadow-2';

/**
 * صندوق الخيار — مكتوبٌ مرة واحدة لأن الخيارين مختلفا العنصر: الأول `<button>`
 * كامل، والثاني لوحٌ ساكن يحمل زرّ التصفّح داخله. فالشكل واحد والعنصر عنصران.
 */
const CHOICE =
  'flex w-full items-start gap-3 rounded-md border border-input bg-surface p-4 text-start';
const CHOICE_ON = 'border-2 border-primary bg-primary-soft';

/** مسارُ مجلّد — قيمة تقنية: لاتينية ومونو ومعزولة عن اتجاه النصّ حولها. */
const PATH =
  'ltr-island mt-2 block rounded-sm border border-hairline bg-surface px-3 py-2 text-t-mono wrap-anywhere';

export type OnboardingProps = {
  readonly defaultDataDirectory: string;
  readonly onDone: (state: BootState) => void;
};

export function Onboarding({ defaultDataDirectory, onDone }: OnboardingProps) {
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [directory, setDirectory] = useState(defaultDataDirectory);
  const [custom, setCustom] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const index = ORDER.indexOf(step);

  const goNext = () => {
    if (step === 'welcome') return setStep('profile');
    if (step === 'profile') {
      // الرسالة نفسها التي في العقد — التحقق هنا لتسريع الرجع فقط،
      // والعملية الرئيسية تعيد التحقق لأنها لا تثق بالواجهة.
      if (name.trim().length < 2) {
        setNameError('اكتب اسمك ليعرفك طلابك حين يدخلون إلى فصلك.');
        return;
      }
      setNameError(null);
      return setStep('location');
    }
    void finish();
  };

  const goBack = () => {
    if (index > 0) setStep(ORDER[index - 1] ?? 'welcome');
  };

  const chooseDirectory = async () => {
    setLocationError(null);
    const result = await bridge().chooseDataDirectory();
    if (result.status === 'chosen') {
      setDirectory(result.path);
      setCustom(true);
    } else if (result.status === 'unusable') {
      setLocationError(result.message);
    }
  };

  const finish = async () => {
    setBusy(true);
    setLocationError(null);
    try {
      const state = await bridge().completeOnboarding({
        name: name.trim(),
        ...(institution.trim() === '' ? {} : { institution: institution.trim() }),
        dataDirectory: directory,
      });
      if (state.status === 'blocked') {
        setLocationError(state.message);
        return;
      }
      onDone(state);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'تعذّر إكمال الإعداد.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 px-8">
        <BrandLogo wordmarkClassName="text-t-h3" />

        {/* عدّاد الخطوات يُدفع إلى طرف الشريط بـ`ms-auto` لا بفاصلٍ فارغ يحمل النموّ. */}
        <div className="ms-auto flex items-center gap-2">
          {ORDER.map((s, i) => (
            <div
              key={s}
              className={cn('h-1 w-6.5 rounded-full', i <= index ? 'bg-primary' : 'bg-hairline')}
            />
          ))}
          <span className="ms-1.5 text-t-label text-text-muted">
            الخطوة {toArabic(index + 1)} من {toArabic(ORDER.length)}
          </span>
        </div>
      </header>

      <div
        className={cn(
          'flex grow justify-center overflow-auto px-8 pt-6 pb-8',
          /*
           * الترحيب وحده يتوسّط رأسياً — صفحةٌ فارغة تحمل جملتين. أمّا بطاقتا
           * الحقول فتُثبَّتان في الأعلى: قد تطول إحداهما عن الشاشة، وتوسيطها
           * يدفع عنوانها فوق حافة التمرير فلا يُرى إلا برجوعٍ إلى الأعلى.
           */
          step === 'welcome' ? 'items-center pb-16' : 'items-start',
        )}
      >
        {step === 'welcome' ? (
          <section className="flex w-155 flex-col items-center gap-1 text-center">
            <BrandMark decorative className="size-20 rounded-xl" />
            <h1 className="mt-5.5 text-t-display">أهلاً بك — لن يستغرق الإعداد سوى دقائق.</h1>
            {/*
              `52ch` قياسُ سطرٍ لا قياسُ بكسل: حدُّ العرض المريح للقراءة يُقاس
              بعدد المحارف، وليس في سلّم المسافات ما يقابله.
            */}
            <p className="mt-2.5 max-w-[52ch] text-t-h3 font-normal text-text-2">
              كل شيء في CubeCroom يعمل على هذا الجهاز: فصولك ودروسك وملفات طلابك محفوظة عندك، ولا
              تحتاج إلى إنترنت لتشغيل حصتك.
            </p>
            <p className="mt-2.5 max-w-[52ch] text-t-h3 font-normal text-text-2">
              سنسألك عن اسمك، وأين تُحفظ بياناتك — ثم تبدأ.
            </p>
            <div className="mt-7">
              <Button variant="primary" onClick={goNext}>
                ابدأ
              </Button>
            </div>
            <p className="mt-3.5 text-t-label text-text-muted">
              {toArabic(ORDER.length)} خطوات قصيرة، ولا شيء منها يحتاج معرفة تقنية.
            </p>
          </section>
        ) : null}

        {step === 'profile' ? (
          <Card className={STEP_CARD}>
            <CardHeader className="px-8">
              {/*
                `CardTitle` عنصرٌ عامّ عمداً — رتبةُ العنوان تتبع موضع البطاقة في
                الصفحة لا نوعَ المكوّن. وهذه أوّل عنوان في الشاشة، فرتبته `h1`.
              */}
              <CardTitle className="text-t-h1">
                <h1>عرّفنا بنفسك</h1>
              </CardTitle>
              <CardDescription className="text-t-body text-text-2">
                اسمك وحده مطلوب — لا بريد ولا كلمة مرور.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 px-8">
              <div className="flex flex-col gap-2">
                <Label htmlFor="teacher-name">
                  الاسم <span className="text-error-text">*</span>
                </Label>
                <Input
                  id="teacher-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  placeholder="سارة العتيبي"
                  aria-invalid={nameError !== null}
                  aria-describedby={nameError ? 'teacher-name-error' : 'teacher-name-help'}
                  autoFocus
                />
                {nameError ? (
                  /*
                    خطأ الحقل يبقى نصّاً بجانبه لا لوحَ `Alert`: `aria-describedby`
                    أعلاه يشير إلى هذا المعرّف بعينه، و`Alert` لا يقبل `id` —
                    فيتيتّم الوصف ولا يُنطق الخطأ لمن لا يرى الحقل.
                  */
                  <p
                    className="flex items-start gap-2 text-t-label text-error-text"
                    id="teacher-name-error"
                  >
                    <Icon name="alert-circle" size={16} className="shrink-0" />
                    {nameError}
                  </p>
                ) : (
                  <p className="text-t-label text-text-muted" id="teacher-name-help">
                    يظهر لطلابك في صفحاتهم هكذا: «أ. {name.trim() === '' ? 'سارة العتيبي' : name.trim()}».
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="institution">
                  اسم المدرسة أو المؤسسة <span className="font-normal text-text-muted">اختياري</span>
                </Label>
                <Input
                  id="institution"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  placeholder="مدرسة النور الابتدائية"
                />
              </div>

              {/*
                طمأنةٌ لا حالة، فسطحُها سطحُ الصفحة لا سطحُ درجةٍ ملوّنة: درجات
                `Alert` الخمس كلّها تُعلن شيئاً، وهذا السطر يصف المنتج ولا يعلن حدثاً.
              */}
              <p className="flex items-start gap-2.5 rounded-md bg-canvas px-4 py-3 text-t-label text-text-2">
                <Icon name="check-circle" size={17} className="shrink-0 text-ok-text" />
                هذه البيانات تبقى على جهازك ولا تُرسل إلى أي مكان. يمكنك تعديلها لاحقاً من الإعدادات.
              </p>
            </CardContent>

            <Footer onBack={goBack} onNext={goNext} nextLabel="التالي" />
          </Card>
        ) : null}

        {step === 'location' ? (
          // أعرض من بطاقة الاسم: صندوقا الخيار يحملان مساراً كاملاً لا سطراً قصيراً.
          <Card className={cn(STEP_CARD, 'w-165')}>
            <CardHeader className="px-8">
              <CardTitle className="text-t-h1">
                <h1>أين تُحفظ بياناتك</h1>
              </CardTitle>
              <CardDescription className="text-t-body text-text-2">
                فصولك ودروسك وملفاتك وإجابات طلابك — كلها في مجلد واحد على هذا الجهاز.
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col gap-5 px-8">
              <button
                type="button"
                className={cn(CHOICE, 'cursor-pointer', !custom && CHOICE_ON)}
                onClick={() => {
                  setCustom(false);
                  setDirectory(defaultDataDirectory);
                  setLocationError(null);
                }}
              >
                <Dot on={!custom} />
                <span className="grow">
                  <span className={cn('text-t-h3', !custom && 'text-primary-on-soft')}>
                    المكان الموصى به
                  </span>
                  <span className={PATH}>{defaultDataDirectory}</span>
                </span>
              </button>

              <div className={cn(CHOICE, custom && CHOICE_ON)}>
                <Dot on={custom} />
                <span className="grow">
                  <span className={cn('text-t-h3', custom && 'text-primary-on-soft')}>
                    اختيار مكان آخر
                  </span>
                  {custom ? (
                    <span className={PATH}>{directory}</span>
                  ) : (
                    <span className="mt-0.5 block text-t-label text-text-muted">
                      إن كنت تفضّل قرصاً آخر أو مجلداً تديره بنفسك.
                    </span>
                  )}
                </span>
                <Button variant="secondary" onClick={() => void chooseDirectory()}>
                  تصفّح…
                </Button>
              </div>

              <Alert tone="pending">
                لا تختر مجلداً على قرص خارجي أو شبكة إن كنت ستفصله أثناء الحصة — سيتوقف التطبيق عن
                الوصول إلى بياناتك.
              </Alert>

              {locationError ? (
                <p className="flex items-start gap-2 text-t-label text-error-text">
                  <Icon name="alert-circle" size={16} className="shrink-0" />
                  {locationError}
                </p>
              ) : null}
            </CardContent>

            <Footer
              onBack={goBack}
              onNext={goNext}
              nextLabel={busy ? 'جارٍ التجهيز…' : 'إنهاء الإعداد'}
              busy={busy}
            />
          </Card>
        ) : null}
      </div>
    </div>
  );
}

/**
 * قرص الاختيار — مرسومٌ هنا لا `RadioGroupItem`.
 *
 * البند يحتاج جذر `RadioGroup` وسياقه، والخياران هنا ليسا مجموعةً واحدة: الثاني
 * لا يُختار بنقره بل بنجاح نافذة التصفّح، فجمعُهما في مجموعةٍ يجعل السهم يختار
 * مساراً لم يُحدَّد بعد. والشكل هو شكل `radio-group.tsx` نفسه — حلقةٌ وقرصٌ
 * ممتلئ، فالفرق بين المختار وغيره في **الشكل** لا في اللون وحده.
 */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border bg-surface',
        on ? 'border-primary' : 'border-input',
      )}
    >
      {on ? <span className="block size-2.5 rounded-full bg-primary" /> : null}
    </span>
  );
}

function Footer({
  onBack,
  onNext,
  nextLabel,
  busy = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
  busy?: boolean;
}) {
  return (
    // `justify-between` بدل فاصلٍ فارغ بينهما: الرجوع في المبدأ والتقدّم في المنتهى.
    <CardFooter className="justify-between gap-3 border-t border-hairline px-8 pt-5">
      <Button variant="secondary" onClick={onBack} icon={<Icon name="chevron-prev" size={17} />}>
        رجوع
      </Button>
      {busy ? (
        <Button variant="primary" disabled disabledReason="لا تُغلق التطبيق الآن.">
          {nextLabel}
        </Button>
      ) : (
        <Button variant="primary" onClick={onNext}>
          {nextLabel}
        </Button>
      )}
    </CardFooter>
  );
}

const ARABIC = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'] as const;
function toArabic(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC[Number(d)] ?? d);
}
