"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Icon,
  Input,
  LegalNotice,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch,
  ar,
  cn,
} from "@cubecroom/ui";
import { toLatinDigits } from "@cubecroom/contracts";
import type {
  MoveDataResult,
  SettingKey,
  SettingsState,
  StudentPortState,
} from "@cubecroom/contracts";
import { bridge } from "../lib/bridge";
import { UpdateSettings } from "../updates/UpdateSettings";

/**
 * T22 — الإعدادات.
 *
 * خمسة أقسام بالترتيب المرسوم: اللغة · مكان البيانات · بدء التشغيل ·
 * التحديثات · الخصوصية، ثم «إعدادات متقدّمة» مطويّة بعيداً عن المسار اليومي.
 *
 * لا زرّ «حفظ»: كل تبديل يُكتب فوراً وتُعاد الحالة من القاعدة فتُرسم منها.
 * الواجهة لا ترسم ما أرسلته بل ما حُفظ فعلاً، فلا تعرض حالة لا وجود لها.
 *
 * ثلاثة إجراءات معطّلة بسببها المكتوب: «نقل البيانات» و«التحقّق الآن»
 * والإعدادات المتقدّمة. كلٌّ منها يخصّ مرحلة لاحقة، وتعطيلها بسبب ظاهر أصدق
 * من زرّ يبدو عاملاً ولا يفعل شيئاً.
 */

/**
 * هيئة الصفّ الواحد — تتكرّر في الأقسام الخمسة، فتُكتب مرّة.
 *
 * والبطاقة صفٌّ أفقيّ لا عمود: عنوانٌ بعرضٍ **ثابت** ثمّ جسمٌ يملأ الباقي.
 * و٢٣٠px ثابتة لا مرنة عن قصد — العناوين الخمسة تقف على خطّ واحد، فلو تبع
 * العمودُ طولَ عنوانه لبدأ كلُّ جسمٍ من موضعٍ مختلف. ولذلك `shrink-0` على
 * العنوان و`min-w-0` على الجسم: الانكماش كلّه على الجسم وحده.
 */
const CARD = "flex-row items-center gap-4 px-5 py-4";
const LABEL_COLUMN = "w-[230px] shrink-0";
const LABEL_TITLE = "text-t-h3";
const BODY = "flex min-w-0 grow items-center gap-2.5";

/** التلميح تحت العنوان وتحت الصفّ سواء — أصغر مقاسٍ في السلّم، بدرجة الخفوت. */
const HINT = "text-t-caption text-text-muted";

export function Settings() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<SettingKey | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [port, setPort] = useState<StudentPortState | null>(null);
  const [portDraft, setPortDraft] = useState("");
  const [portNote, setPortNote] = useState<string | null>(null);
  /** نتيجة آخر نقل — تُعرض حتى يغلقها المعلم، فيها مكان النسخة القديمة. */
  const [moved, setMoved] = useState<MoveDataResult | null>(null);
  const [moving, setMoving] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(await bridge().readSettings());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذّر فتح الإعدادات.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = async (key: SettingKey, value: string) => {
    setBusy(key);
    setError(null);
    try {
      setState(await bridge().writeSetting({ key, value }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "تعذّر حفظ هذا الإعداد.",
      );
      // القيمة القديمة تعود لأن الحالة لم تُستبدل — فلا يرى المعلم تبديلاً لم يُحفظ.
    } finally {
      setBusy(null);
    }
  };

  const openFolder = async () => {
    const result = await bridge().openDataDirectory();
    if (result.status === "failed") setError(result.message);
  };

  useEffect(() => {
    if (!advancedOpen || port !== null) return;
    void bridge()
      .studentPortGet()
      .then((state) => {
        setPort(state);
        setPortDraft(state.chosen === null ? "" : String(state.chosen));
      })
      .catch(() => setPort(null));
  }, [advancedOpen, port]);

  /**
   * الحفظ يقبل الفراغ عودةً إلى الافتراضي.
   *
   * والرسالة تقول **متى يسري** لا «حُفظ» وحدها: معلمٌ يغيّر المنفذ وحصته
   * قائمة يظنّ أنه قطعها على طلابه، وهو لم يفعل.
   */
  /**
   * النقل يبدأ باختيار المجلد ثم يُنفَّذ فوراً.
   *
   * ولا حوار تأكيد قبله: العملية **غير مدمّرة** — القديم يبقى كما هو، والرجوع
   * ممكن. وتأكيدٌ على فعلٍ يمكن الرجوع عنه يعلّم المعلم تجاهل التأكيدات، فلا
   * يقرؤها حين تكون على فعلٍ لا رجعة فيه.
   */
  const moveDataFolder = async () => {
    const chosen = await bridge().chooseDataDirectory();
    if (chosen.status !== "chosen") return;

    setMoving(true);
    setMoved(null);
    try {
      const result = await bridge().dataMove({ directory: chosen.path });
      setMoved(result);
      if (result.status === "moved") await load();
    } catch (cause) {
      setMoved({
        status: "refused",
        message: cause instanceof Error ? cause.message : "تعذّر نقل البيانات.",
      });
    } finally {
      setMoving(false);
    }
  };

  const savePort = async () => {
    const trimmed = portDraft.trim();
    const value = trimmed === "" ? null : Number(toLatinDigits(trimmed));
    if (
      value !== null &&
      (!Number.isInteger(value) || value < 1024 || value > 65535)
    ) {
      setPortNote(
        "اكتب رقماً بين ١٠٢٤ و٦٥٥٣٥، أو اترك الحقل فارغاً للعودة إلى الافتراضي.",
      );
      return;
    }
    try {
      const next = await bridge().studentPortSet({ port: value });
      setPort(next);
      setPortNote(
        next.active === null
          ? "حُفظ. يُستعمل عند تشغيل دخول الطلاب."
          : "حُفظ. الحصة القائمة تكمل على منفذها، والجديد يبدأ مع التشغيل التالي.",
      );
    } catch {
      setPortNote("تعذّر حفظ المنفذ.");
    }
  };

  if (state === null) {
    return (
      <div className="flex min-h-0 grow justify-center overflow-auto">
        <div className="m-auto text-text-muted">{error ?? "نقرأ إعداداتك…"}</div>
      </div>
    );
  }

  const isOn = (key: SettingKey) => state.values[key] === "true";
  const flip = (key: SettingKey) => (next: boolean) =>
    void write(key, next ? "true" : "false");

  return (
    <div className="flex min-h-0 grow justify-center overflow-auto">
      {/*
        الصفحة تُوسّط عمودها، فعمودٌ أعرض منها يفيض من الطرفين معاً — ونصفُ
        الفيض يخرج من حافة البداية حيث لا يبلغه التمرير. و`max-w-full` تحصر
        الفيض في جهةٍ تُمرَّر.
      */}
      <div className="flex w-[860px] max-w-full flex-col gap-3.5">
        {error !== null ? (
          <Alert tone="error" live>
            {error}
          </Alert>
        ) : null}

        {/* ١ — اللغة */}
        <Card className={CARD}>
          <div className={LABEL_COLUMN}>
            <div className={LABEL_TITLE}>اللغة</div>
            <div className={HINT}>لغة الواجهة واتجاهها.</div>
          </div>
          <div className={BODY}>
            <Select
              value={state.values.language ?? "ar"}
              onValueChange={(value) => void write("language", value)}
            >
              {/* عرض الزرّ عرضُ عمود العنوان نفسه — فيقف الحقلان على شبكة واحدة. */}
              <SelectTrigger className="w-[230px]" aria-label="لغة الواجهة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ar">العربية</SelectItem>
              </SelectContent>
            </Select>
            <div className={HINT}>
              العربية هي لغة الواجهة الوحيدة في هذا الإصدار.
            </div>
          </div>
        </Card>

        {/* ٢ — مكان البيانات */}
        <Card
          className={cn(
            CARD,
            /*
             * الالتفاف لهذه البطاقة وحدها، وعند ظهور النتيجة وحدها.
             *
             * النتيجة أخٌ ثالث في صفٍّ لا يلتفّ (العنوان ثمّ الجسم ثمّ هي)،
             * فتزاحم الصفّ بدل أن تقف تحته. وعند ١٠٢٤ — وهو مقاسٌ يبلغه
             * المعلّم بالسحب — يتّسع صفّ البطاقة لـ٦٧٨px بينما أدنى عرضٍ
             * يطلبه ≈٧٣٨px: ٢٣٠ للعنوان، وزرّا «فتح المجلد» و«نقل البيانات»
             * لا ينكمشان دون كلمتهما، والمسار كلمةٌ واحدة لا تنكسر.
             *
             * ولا يُبذل الالتفاف لبقيّة البطاقات: أجسامها نصّية تنكمش، فالتفافٌ
             * عامّ يفكّ عمودَي «بدء التشغيل» و«التحديثات» و«الخصوصية» على
             * مقاسٍ لا عطل فيه.
             */
            moved !== null && "flex-wrap",
          )}
        >
          <div className={LABEL_COLUMN}>
            <div className={LABEL_TITLE}>مكان البيانات</div>
            <div className={HINT}>فصولك ودروسك وملفاتك.</div>
          </div>
          <div className={BODY}>
            <div
              className="ltr-island flex h-(--height-control) min-w-0 grow items-center truncate rounded-sm border border-hairline bg-canvas px-3 text-t-caption text-text-2"
              dir="ltr"
            >
              {state.dataDirectory}
            </div>
            <Button variant="secondary" onClick={() => void openFolder()}>
              فتح المجلد
            </Button>
            {moving ? (
              <Button variant="secondary" disabled disabledReason="جارٍ النسخ…">
                نقل البيانات
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => void moveDataFolder()}>
                نقل البيانات
              </Button>
            )}
          </div>
          {/*
            مكان النسخة القديمة يُقال صراحةً: النقل نسخٌ لا حذف، والمعلم يحذف
            القديم بنفسه حين يطمئن — وإخفاؤه يجعله يظنّ بياناته ضاعت أو يترك
            نسخةً لا يعرف عنها.
          */}
          {moved === null ? null : (
            <p
              className={cn(
                // سطرٌ كامل تحت الصفّ لا عمودٌ ثالث فيه.
                "mt-3 basis-full rounded-md border px-3 py-2 text-t-label",
                // المسار كلمة واحدة بلا مسافة: بلا كسرها يفيض الصفّ.
                "wrap-anywhere",
                moved.status === "moved"
                  ? "border-ok-border bg-ok-bg text-ok-text"
                  : "border-hairline bg-surface-2 text-text-2",
              )}
              role="status"
            >
              {moved.status === "moved"
                ? `نُسخت بياناتك إلى المكان الجديد. النسخة القديمة ما زالت في «${moved.oldPath}» — احذفها بنفسك حين تطمئن.`
                : moved.message}
            </p>
          )}
        </Card>

        {/* ٣ — بدء التشغيل */}
        <Card className={CARD}>
          <div className={LABEL_COLUMN}>
            <div className={LABEL_TITLE}>بدء التشغيل</div>
            <div className={HINT}>سلوك التطبيق عند فتح الجهاز.</div>
          </div>
          <div className="flex min-w-0 grow flex-col gap-2.5">
            <Row
              title="افتح CubeCroom عند تشغيل الجهاز"
              checked={isOn("launchOnSystemStart")}
              busy={busy === "launchOnSystemStart"}
              onChange={flip("launchOnSystemStart")}
            />
            <Separator />
            <Row
              title="افتح آخر فصل استخدمته"
              hint="بدل الصفحة الرئيسية."
              checked={isOn("openLastClassOnStart")}
              busy={busy === "openLastClassOnStart"}
              onChange={flip("openLastClassOnStart")}
            />
          </div>
        </Card>

        {/* ٤ — التحديثات */}
        <Card className={CARD}>
          <div className={LABEL_COLUMN}>
            <div className={LABEL_TITLE}>التحديثات</div>
            {/* النقطة تبقى نقطةً لا فاصلةً عربية: الإصدار ليس كسراً عشرياً. */}
            <div className={cn(HINT, "tabular-nums")}>
              الإصدار الحالي {ar(state.appVersion)}
            </div>
          </div>
          <div className="flex min-w-0 grow flex-col gap-3">
            <Row title="تحقّق من التحديثات تلقائياً" checked={isOn("checkUpdatesAutomatically")} busy={busy === "checkUpdatesAutomatically"} onChange={flip("checkUpdatesAutomatically")} />
            <UpdateSettings />
          </div>
        </Card>

        {/* ٥ — الخصوصية */}
        {/* البيان سطران، والمحاذاة العلوية تمنع تعليق العنوان في منتصفهما. */}
        <Card className={cn(CARD, "items-start")}>
          <div className={LABEL_COLUMN}>
            <div className={LABEL_TITLE}>الخصوصية</div>
            <div className={HINT}>ما يغادر هذا الجهاز.</div>
          </div>
          <div className="flex min-w-0 grow flex-col gap-2.5">
            <Alert tone="ok">
              لا شيء من بيانات فصولك أو طلابك يغادر هذا الجهاز. الاستثناء الوحيد:
              نصّ الطلب الذي ترسله بنفسك إلى مزوّد الذكاء الاصطناعي بمفتاحك.
            </Alert>
            <Row
              title="حفظ سجلّ الأعطال على هذا الجهاز"
              hint="يبقى محلياً — يُنسخ يدوياً عند طلب الدعم الفني فقط."
              checked={isOn("keepLocalCrashLog")}
              busy={busy === "keepLocalCrashLog"}
              onChange={flip("keepLocalCrashLog")}
            />
          </div>
        </Card>

        {/* المتقدّمة — مطويّة. اللوح يرسمها مغلقة فقط، فالمفتوح يعدّد
            بنودها الثلاثة كما سمّاها ولا يخترع لها ضبطاً لم يُصمَّم.
            والحدّ المتقطّع يقول إنها ليست بطاقةً من بطاقات المسار اليومي. */}
        <section className="rounded-lg border border-dashed border-input bg-surface">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center gap-3 px-5 py-3.5 text-start"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
          >
            {/*
             * السهم يشير إلى الداخل مغلقاً ويدور للأسفل مفتوحاً — الدوران يتبع
             * الاتجاه.
             *
             * وكانت القيمة −90deg فيشير السهم إلى **أعلى** مفتوحاً:
             * `chevron-prev` مرسوم لـLTR (رأسه عند x=9 وطرفاه عند x=15، فمتّجهه
             * يساراً)، و`Icon` يعكس كلّ أيقونة اتجاهية بـ`scaleX(-1)` لأن RTL هو
             * الاتجاه الوحيد (قرار D1) — فيصير المتّجه يميناً، ومعه يعطي −90deg
             * أعلى لا أسفل. القيمة حُسبت قبل الانقلاب.
             */}
            <span className={advancedOpen ? "inline-flex rotate-90" : undefined}>
              <Icon name="chevron-prev" size={17} />
            </span>
            <span className="grow">
              <span className={LABEL_TITLE}>إعدادات متقدّمة</span>
              <span className={cn(HINT, "block")}>
                منفذ دخول الطلاب وتصدير سجلّات التشخيص. مطويّة بعيداً عن المسار
                اليومي.
              </span>
            </span>
          </button>

          {advancedOpen ? (
            <ul className="flex flex-col gap-3 px-5 pb-4">
              <li className="flex flex-col gap-0.5 border-t border-hairline pt-3">
                <span className="text-t-body">منفذ دخول الطلاب</span>
                <span className={HINT}>
                  اتركه فارغاً للافتراضي ({ar(port?.fallback ?? 4317)}). يُغيَّر
                  حين يكون المنفذ مشغولاً ببرنامج آخر على هذا الجهاز.
                  {port?.active === null || port === null
                    ? ""
                    : ` المنفذ العامل الآن: ${ar(port.active)}.`}
                </span>
                {/* صفّ المنفذ: حقلٌ ضيّق وزرّ — رقمٌ من أربع خانات لا يحتاج عرض السطر. */}
                <span className="mt-1.5 flex items-center gap-2">
                  <Input
                    size="sm"
                    className="w-[9ch] text-center"
                    value={portDraft}
                    onChange={(event) => {
                      setPortDraft(event.target.value);
                      setPortNote(null);
                    }}
                    inputMode="numeric"
                    aria-label="منفذ دخول الطلاب"
                    placeholder={String(port?.fallback ?? 4317)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void savePort()}
                  >
                    حفظ المنفذ
                  </Button>
                </span>
                {portNote === null ? null : (
                  <span className={HINT} role="status">
                    {portNote}
                  </span>
                )}
              </li>
              <li className="flex flex-col gap-0.5 border-t border-hairline pt-3">
                <span className="text-t-body">تصدير سجلّات التشخيص</span>
                <span className={HINT}>
                  بُني — تجده في «تشخيص الاتصال» بزرّ «تصدير السجلّ».
                </span>
              </li>
              {/*
                «إعادة الضبط» سُحبت — قرار D27.

                إجراءٌ لا رجعة فيه على النسخة الوحيدة من عمل سنة، وغايته راحةٌ
                يبلغها المعلم بحذف مجلد بياناته. وبندٌ معلَّق «إلى أن يُصمَّم
                تأكيده» يبقى وعداً لا يُوفى ويُوحي بأن الميزة قادمة.
              */}
            </ul>
          ) : null}
        </section>
        <LegalNotice />
      </div>
    </div>
  );
}

function Row({
  title,
  hint,
  checked,
  busy,
  onChange,
}: {
  title: string;
  hint?: string;
  checked: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 grow">
        <div className="text-t-body">{title}</div>
        {hint ? <div className={HINT}>{hint}</div> : null}
      </div>
      <Switch
        label={title}
        checked={checked}
        disabled={busy}
        onChange={onChange}
      />
    </div>
  );
}
