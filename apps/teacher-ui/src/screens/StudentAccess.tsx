'use client';

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ar,
  cn,
} from '@cubecroom/ui';
import { formatJoinCode, type PortalStatus } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T09 — مشاركة الدخول.
 *
 * المصدر يصفها بأنها «الشاشة التي تُحوّل Local Hosting إلى تجربة بسيطة
 * للمعلم»، فقاعدتها: **لا IP ولا Port في الوضع الطبيعي**. الرابط ظاهر لأن
 * الطالب يكتبه، أما العنوان والمنفذ واسم البطاقة فداخل «تفاصيل تقنية» مطويّة
 * — وتُفتح وحدها في حالة تعذّر الوصول، وهو وقت حاجتها الوحيد.
 *
 * «متصلون الآن» يُقاس من نبضة صفحة الطالب ضمن نافذة عشرين ثانية، لا من قبولٍ
 * سابق: طالبٌ قُبل صباحاً وأغلق جهازه ليس متصلاً، وعدّادٌ يعدّه كذلك يجعل
 * المعلم يظن أن فصله كامل وهو ليس كذلك.
 *
 * ═══ وهذه الشاشة تُعرض على شاشة الفصل ═══
 *
 * ولذلك بقيت ثلاثة مقاسات مكتوبةً بالبكسل صراحةً (`[...]`) ولم تُردّ إلى
 * السلّم: **الرمز 44px** و**المربّع 196px** و**لوحته 236px**. وليست تنسيقاً
 * يُختار: هي مسافة القراءة من آخر الصفّ ومساحةُ المسح باللوحيّ. ولا رمز لها
 * في `globals.css` — وأكبرُ ما في سلّم النصّ 28px، أي أقلّ من ثلثَي الرمز.
 * فتُكتب القيمة صريحةً كما تفعل `dialog.tsx` بعرض حوارها، لا يُخترع لها رمز
 * من ملفّ شاشة.
 */

export type StudentAccessProps = {
  readonly classId: string;
  readonly className: string;
  readonly onOpenDiagnostics: () => void;
};

/**
 * سطر الرابط — يتكرّر مرّتين بالقيم نفسها (العنوان بالاسم والعنوان الرقمي).
 *
 * ارتفاعه 44px مكتوبٌ لا `--height-control`: السطر يقف بجانب زرّ نسخه، وارتفاع
 * التحكّم عند المعلّم 40px. والمقصود سطرٌ يُقرأ عن بُعد لا حقلُ إدخال.
 *
 * و`ltr-island` تتكفّل بالاتجاه والخطّ المونو معاً، فلا يُعاد إعلان أيّهما.
 */
const linkBox = cn(
  'ltr-island flex h-11 min-w-[200px] grow items-center overflow-x-auto whitespace-nowrap',
  'rounded-sm border border-hairline bg-canvas px-3.25 text-t-mono text-text',
);

/** بندُ فحصٍ داخل لوح تعذّر الوصول — سطرُ سببٍ وسطرُ ما يُفعل به. */
const checkItem = cn(
  'flex flex-col gap-0.5 rounded-sm border border-hairline bg-surface',
  'px-2.75 py-2.25 text-t-label',
);

/** عدّاد T09 — عرضٌ أدنى ثابت فلا يتغيّر عرض اللوحين مع تغيّر الأرقام. */
const statTile = cn(
  'flex min-w-[130px] flex-col rounded-md border border-hairline',
  'bg-canvas px-3.5 py-2.5',
);

export function StudentAccess({ classId, className, onOpenDiagnostics }: StudentAccessProps) {
  const [status, setStatus] = useState<PortalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [technical, setTechnical] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  /** يفتح شاشة النظام — ولا يكتب قاعدةً بنفسه (§22). */
  const openFirewall = async () => {
    const opened = await bridge().openFirewallSettings();
    if (opened.status === 'failed') setError(opened.message);
  };

  const refresh = useCallback(async () => {
    try {
      setStatus(await bridge().portalStatus());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة حالة الدخول.');
    }
  }, []);

  useEffect(() => {
    void refresh();
    // الشبكة تسقط وتعود بلا أن يلمس المعلم شيئاً — الحالة تُقرأ دورياً
    // لأن الشاشة تدّعي «جاهز»، وادّعاء الجاهزية بعد سقوط الشبكة أسوأ من صمت.
    const timer = setInterval(() => void refresh(), 4000);
    return () => clearInterval(timer);
  }, [refresh]);

  const run = async (action: 'start' | 'stop') => {
    setBusy(true);
    setError(null);
    try {
      setStatus(
        action === 'start' ? await bridge().portalStart({ classId }) : await bridge().portalStop(),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تنفيذ هذا الإجراء.');
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await bridge().copyText({ text });
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('تعذّر نسخ الرابط. اكتبه لطلابك كما هو ظاهر.');
    }
  };

  if (status === null) {
    return <div className="m-auto text-text-muted">{error ?? 'نقرأ حالة الدخول…'}</div>;
  }

  const open = status.state === 'running' || status.state === 'unreachable';
  // الخادم واحد والحصة واحدة: قد يكون الباب مفتوحاً لفصل غير هذا.
  const otherClass = open && status.classId !== classId ? status.className : null;
  const running = status.state === 'running' && otherClass === null;
  const unreachable = status.state === 'unreachable' && otherClass === null;
  const url = status.state === 'running' && otherClass === null ? `${status.url}/join` : null;
  const code = status.state === 'running' && otherClass === null ? status.joinCode : null;
  /*
   * العنوان بالاسم قد لا يوجد: شبكةٌ تمنع البثّ المتعدد تُسقط الإعلان، فيبقى
   * العنوان الرقمي وحده. ولذلك تُعرض الحالتان لا حالةٌ واحدة تُفترض.
   */
  const qrValue = url === null || code === null ? url : `${url}?code=${code}`;
  const friendly =
    status.state === 'running' && otherClass === null && status.friendlyUrl !== undefined
      ? `${status.friendlyUrl}/join`
      : null;

  return (
    // `min-h-0` مع `overflow-auto`: الشاشة ابنٌ مرن في تخطيط الصدفة، وبلا
    // الصفر تمتدّ بمحتواها فيمرّر الإطار كلّه بدل أن تمرّر هي وحدها.
    <div className="flex min-h-0 grow flex-col gap-3.5 overflow-auto">
      <header className="flex items-center gap-2.5">
        {running ? (
          <Badge tone="ok">دخول الطلاب متاح</Badge>
        ) : unreachable ? (
          <Badge tone="error">الطلاب لا يستطيعون الدخول</Badge>
        ) : (
          <Badge tone="draft">دخول الطلاب متوقف</Badge>
        )}
        {running || unreachable ? (
          // `tabular-nums` صراحةً: العدّاد يُعاد رسمه كل أربع ثوانٍ، وعرضُ
          // الرقم المتغيّر يزحزح ما بعده في السطر.
          <span className="text-t-label tabular-nums text-text-muted">
            منذ {sinceText(status.startedAt)}
          </span>
        ) : null}
      </header>

      {/* `live` لأن هذا اللوح جوابُ فعلٍ للتوّ — لا وصفٌ دائم للشاشة. */}
      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {otherClass !== null ? (
        // بطاقةٌ موسّطة في فراغ الشاشة: لا شيء آخر معروضاً، فلا معنى لأن
        // تمتدّ إلى عرض الصفحة كلّه.
        <Card className="m-auto w-[520px] max-w-full items-center gap-3 p-7.5 text-center">
          <h3 className="text-t-h1">الدخول مفتوح لفصل آخر</h3>
          <p className="text-t-body text-text-2">
            «{otherClass}» يستقبل طلابه الآن. الجهاز يفتح باباً واحداً في كل وقت، فأنهِ دخول ذلك
            الفصل قبل أن تفتح هذا.
          </p>
        </Card>
      ) : status.state === 'stopped' || status.state === 'failed' ? (
        <Card className="m-auto w-[520px] max-w-full items-center gap-3 p-7.5 text-center">
          <h3 className="text-t-h1">شغّل الدخول ليصل طلابك</h3>
          <p className="text-t-body text-text-2">
            سيظهر رمز ورابط يفتحه طلابك من حواسيبهم أو لوحيّاتهم وهم على شبكة Wi-Fi نفسها. لا شيء
            من هذا يمرّ بالإنترنت.
          </p>
          {/* بلا `live`: هذا يصف حالةً قائمة قبل أن يلمس المعلم شيئاً. */}
          {status.state === 'failed' ? <Alert tone="error">{status.message}</Alert> : null}
          {busy ? (
            <Button variant="primary" disabled disabledReason="جارٍ التشغيل…">
              تشغيل دخول الطلاب
            </Button>
          ) : (
            <Button variant="primary" onClick={() => void run('start')}>
              تشغيل دخول الطلاب
            </Button>
          )}
        </Card>
      ) : status.state === 'starting' ? (
        <div className="m-auto text-text-muted">جارٍ تشغيل الدخول…</div>
      ) : (
        <>
          {/*
            صفٌّ يلتفّ لا شبكةٌ بنقطة توقّف: اللوحة عرضها ثابت والجسد له حدّ
            أدنى، فيهبط الجسد تحت اللوحة من تلقائه متى ضاق الباقي عنه — ويصحّ
            ذلك عند أيّ عرضٍ لا عند عرضين مكتوبين.
          */}
          <Card className="flex-row flex-wrap items-start gap-4.5 p-5">
            <div
              className={cn(
                'flex w-[236px] shrink-0 flex-col items-center gap-2.5',
                'rounded-xl border border-hairline bg-surface p-4.5',
                // الرمز يبهت ولا يختفي حين ينقطع الوصول: مكانه يبقى محجوزاً
                // فلا يقفز ما تحته لحظة عودة الشبكة.
                unreachable && 'opacity-45',
              )}
            >
              {/*
                الرمز المربّع يحمل رمز الحصة في الرابط، والرابط المكتوب لا
                يحمله: من مسح المربّع رأى شاشة المعلم فهو في الغرفة، ومن يكتب
                بيده يكتب رابطاً قصيراً ثم الرمز في حقله.
              */}
              <Qr value={qrValue ?? 'about:blank'} />
              {unreachable ? (
                <div className="text-t-label font-semibold text-error-text">
                  الرمز غير صالح الآن
                </div>
              ) : (
                <div className="text-t-label text-text-2">
                  {/*
                    الطلاب على حواسيب ولوحيّات لا هواتف (الهواتف ممنوعة في
                    الصفوف)، والحاسوب لا كاميرا يمسح بها. فالرمز يبقى للّوحيّ
                    **والرابط هو الطريق المعوَّل عليه** — ولذلك يُذكر معه.
                  */}
                  امسح الرمز باللوحيّ، أو اكتب الرابط في المتصفّح
                </div>
              )}
            </div>

            {/* 280px حدُّ ما يسع سطر الرابط وزرَّ نسخه جنباً إلى جنب. */}
            <div className="flex min-w-[280px] grow flex-col gap-2.5">
              <h3 className="text-t-h3 font-bold">شارك هذا مع طلابك</h3>
              {/*
                ترتيب ما يُكتب على السبورة: أين يذهبون، ثم ماذا يكتبون.
                والعنوان بالاسم فوق العنوان الرقمي لأنه أقصر وأقلّ خطأً في
                النقل — والرقمي يبقى معروضاً لأن الاسم قد لا يصل.
              */}
              {friendly !== null ? (
                <>
                  <div className="text-t-label text-text-muted">يفتحون هذا العنوان</div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className={linkBox} dir="ltr">
                      {friendly}
                    </div>
                    <Button variant="secondary" onClick={() => void copy(friendly)}>
                      {copied ? 'نُسخ' : 'نسخ العنوان'}
                    </Button>
                  </div>
                </>
              ) : null}

              {url !== null ? (
                <>
                  <div className="text-t-label text-text-muted">
                    {friendly === null ? 'أو افتح هذا الرابط' : 'وإن لم يفتح، فهذا العنوان'}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className={linkBox} dir="ltr">
                      {url}
                    </div>
                    <Button variant="secondary" onClick={() => void copy(url)}>
                      {copied ? 'نُسخ' : 'نسخ الرابط'}
                    </Button>
                  </div>
                </>
              ) : null}

              {/*
                الرمز آخرُ ما يُقرأ وأكبرُ ما يُرى: هو الشيء الوحيد الذي
                يكتبه ثلاثون طالباً في اللحظة نفسها، ويقرؤه المعلم عن الشاشة
                لينقله إلى سبورة يراها آخرُ الصفّ.
              */}
              {code !== null ? (
                <div className="mt-1">
                  <div className="text-t-label text-text-muted">ويكتبون هذا الرمز</div>
                  {/*
                    `tracking-widest` (0.1em) يخالف `letter-spacing: 0` الذي
                    يفرضه الجذر — وذاك للحروف العربية لأن التتبّع يفكّك
                    اتّصالها. والأرقام العربية-الهندية لا تتّصل أصلاً، وستّ
                    خانات متلاصقة تُنقل خطأً: خانةٌ واحدة تعني ثلاثين طالباً
                    يُرفض طلبهم بلا سبب ظاهر لهم.
                  */}
                  <div
                    className={cn(
                      'text-[44px] font-bold leading-[1.15]',
                      'tracking-widest tabular-nums text-primary',
                    )}
                  >
                    {ar(formatJoinCode(code))}
                  </div>
                  <div className="mt-0.5 text-t-label text-text-muted">
                    بلا الرمز لا يصل طلبهم — والرمز وحده لا يُدخلهم حتى تقبلهم.
                  </div>
                </div>
              ) : null}

              {unreachable ? (
                <Alert tone="error" title="طلابك لا يستطيعون الدخول الآن">
                  <div className="flex flex-col gap-2">
                    <p className="text-t-label text-text-2">
                      شغّلنا دخول الطلاب، لكن أجهزتهم لن تصل إلى جهازك. السبب غالباً في الشبكة لا في
                      التطبيق.
                    </p>
                    {/*
                      الفحوص أسطحٌ بيضاء داخل لوحٍ أحمر: نصُّها يرث لون الدرجة
                      كما كان، فلا يُعاد إعلانه — وسطرُها الثاني وحده يخفت.
                    */}
                    <ul className="flex flex-col gap-2.25">
                      <li className={checkItem}>
                        <strong>{status.message}</strong>
                        <span className="text-t-caption text-text-muted">
                          صِل جهازك بشبكة المدرسة نفسها التي يستخدمها طلابك.
                        </span>
                      </li>
                      <li className={checkItem}>
                        <strong>شبكة المدرسة قد تمنع الأجهزة من رؤية بعضها</strong>
                        <span className="text-t-caption text-text-muted">
                          لم نفحص هذا بعد — يُفحص بعد اتصال الجهاز بالشبكة.
                        </span>
                      </li>
                      <li className={checkItem}>
                        <strong>جدار الحماية على هذا الجهاز</strong>
                        <span className="text-t-caption text-text-muted">لم يُفحص بعد.</span>
                      </li>
                    </ul>
                    <p className="text-t-label text-text-2">
                      سيعمل الرمز والرابط تلقائياً بمجرد اتصال جهازك بالشبكة — لا حاجة لإعادة تشغيل
                      شيء.
                    </p>
                    {/*
                      الأزرار الثلاثة من اللوح. وأهمّها ما ليس فيها: لا زرّ
                      «إعادة تشغيل» — الحالة تُحسب من الشبكة عند كل نبضة، فتتعافى
                      وحدها لحظة عودة الاتصال أو السماح في جدار الحماية.
                    */}
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => void openFirewall()}>
                        فتح إعدادات جدار الحماية
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void refresh()}>
                        إعادة الفحص
                      </Button>
                      <Button variant="ghost" size="sm" onClick={onOpenDiagnostics}>
                        فتح تشخيص الاتصال
                      </Button>
                    </div>
                  </div>
                </Alert>
              ) : (
                <Alert tone="ok">جاهز — الطلاب على نفس شبكة Wi-Fi يستطيعون الدخول.</Alert>
              )}

              {/* الاتصال يُقاس من نبضة صفحة الطالب كل خمس ثوانٍ ضمن نافذة
                  عشرين ثانية — لا من مجرد قبولٍ سابق. */}
              <div className="flex gap-2.5">
                <div className={statTile}>
                  {/* عرضٌ أدنى بخانتين فلا يهتزّ الرقم مع تحديث كل أربع ثوانٍ. */}
                  <span className="min-w-[2ch] text-t-display tabular-nums">
                    {ar(status.admitted)}
                  </span>
                  <span className="text-t-caption">متصلون الآن</span>
                </div>
                <div
                  className={cn(statTile, 'border-pending-border bg-pending-bg text-pending-text')}
                >
                  <span className="min-w-[2ch] text-t-display tabular-nums">
                    {ar(status.waiting)}
                  </span>
                  <span className="text-t-caption">بانتظار الموافقة</span>
                </div>
              </div>

              <details
                className="text-t-label text-text-2"
                open={unreachable || technical}
                onToggle={(event) => setTechnical(event.currentTarget.open)}
              >
                <summary className="cursor-pointer py-1.5">
                  تفاصيل تقنية <span className="text-text-muted">— للدعم الفني عند الحاجة فقط</span>
                </summary>
                {/* `ltr-island` تُخرج السطر التقنيّ من اتجاه الصفحة: `host` ثم
                    العنوان ثم المنفذ بترتيبها اللاتيني لا معكوسةً. */}
                <div
                  className={cn(
                    'ltr-island mt-1.5 overflow-x-auto rounded-sm border border-hairline',
                    'bg-canvas px-3 py-2.5 text-t-caption',
                  )}
                  dir="ltr"
                >
                  {technicalLine(status)}
                </div>
              </details>
            </div>
          </Card>

          <Card className="flex-row flex-wrap items-center gap-3.5 px-4.5 py-3.5">
            {/* 240px: الجملة تحتاج سطرين على الأكثر قبل أن ينزل الزرّ تحتها. */}
            <div className="min-w-[240px] grow text-t-label text-text-2">
              <strong>عند انتهاء الحصة:</strong> إنهاء الدخول يقطع اتصال الطلاب ويغلق الرابط —
              ومحتوى الفصل يبقى كما هو.
            </div>
            {busy ? (
              <Button variant="danger" disabled disabledReason="جارٍ الإنهاء…">
                إنهاء دخول الطلاب
              </Button>
            ) : (
              <Button variant="danger" onClick={() => setConfirmEnd(true)}>
                إنهاء دخول الطلاب
              </Button>
            )}
          </Card>
        </>
      )}

      {confirmEnd ? (
        <Dialog
          open
          onOpenChange={(next) => {
            if (!next) setConfirmEnd(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{`إنهاء دخول الطلاب إلى ${className}؟`}</DialogTitle>
              {/*
                الجملة وصفُ الحوار لا فقرةً فيه: Radix يربطها بـ
                `aria-describedby` فتُقرأ بعد العنوان مباشرة — وهي بعينها
                «ماذا سيحدث». و`text-t-body` تردّها إلى مقاسها الأول: الافتراض
                `t-label`، وهذه آخرُ ما يُقرأ قبل قطع الحصة على ثلاثين طالباً.
              */}
              <DialogDescription className="text-t-body">
                سيتوقف الرابط والرمز عن العمل فوراً، ولن يستطيع أحد الدخول حتى تشغّله من جديد. دروس
                الفصل وإجابات طلابه لا تتأثر.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirmEnd(false)}>
                إبقاء الدخول مفتوحاً
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  setConfirmEnd(false);
                  void run('stop');
                }}
              >
                إنهاء الدخول
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

/**
 * الرمز يُرسم مساراً واحداً داخل SVG.
 *
 * لا `dangerouslySetInnerHTML` لسلسلة SVG جاهزة: المصفوفة تُقرأ ويُبنى منها
 * المسار، فلا يدخل إلى الصفحة نصّ HTML من مولّد خارجي مهما كان موثوقاً.
 */
function Qr({ value }: { value: string }) {
  const [path, setPath] = useState<{ d: string; size: number } | null>(null);

  useEffect(() => {
    try {
      const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
      const size = qr.modules.size;
      const data = qr.modules.data;
      let d = '';
      for (let row = 0; row < size; row += 1) {
        for (let column = 0; column < size; column += 1) {
          if (data[row * size + column]) d += `M${column} ${row}h1v1h-1z`;
        }
      }
      setPath({ d, size });
    } catch {
      setPath(null);
    }
  }, [value]);

  if (path === null) {
    // البديل يشغل مربّع الرمز نفسه: لا تنكمش اللوحة حين يتعذّر التوليد.
    return (
      <div
        className={cn(
          'flex size-[196px] items-center justify-center',
          'text-center text-t-label text-text-muted',
        )}
      >
        تعذّر توليد الرمز
      </div>
    );
  }

  const quiet = 2;
  const box = path.size + quiet * 2;
  return (
    /*
     * `fill` هنا سمةُ SVG لا تنسيقَ شاشة: الماسح يقرأ تبايناً بين وحدتين، لا
     * لوناً من لوحة المنتج. ولذلك تبقى القيمتان كما كانتا.
     */
    <svg
      className="block size-[196px]"
      viewBox={`0 0 ${box} ${box}`}
      role="img"
      aria-label="رمز دخول الطلاب"
      shapeRendering="crispEdges"
    >
      <rect width={box} height={box} fill="#fff" />
      <g transform={`translate(${quiet} ${quiet})`}>
        <path d={path.d} fill="#0f172a" />
      </g>
    </svg>
  );
}

function technicalLine(status: PortalStatus): string {
  if (status.state === 'running') {
    return `host ${status.address} · port ${status.port} · adapter ${status.adapter} · lan reachable: yes`;
  }
  if (status.state === 'unreachable') {
    return `host — · port ${status.port} · adapter none · lan reachable: no`;
  }
  return '—';
}

function sinceText(startedAt: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 60000));
  if (minutes < 1) return 'لحظات';
  if (minutes === 1) return 'دقيقة';
  if (minutes === 2) return 'دقيقتين';
  return `${ar(minutes)} دقيقة`;
}
