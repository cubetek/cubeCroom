'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  Input,
  Label,
  Separator,
  Switch,
  ar,
} from '@cubecroom/ui';
import { when, isLocalProvider, LOCAL_PROVIDER_URLS, saveKeySchema } from '@cubecroom/contracts';
import type { AiSettings as Settings, ProviderState } from '@cubecroom/contracts';
import { bridge } from '../lib/bridge';

/**
 * T19 — الذكاء الاصطناعي (ربط المفاتيح).
 *
 * «Never display full key»: الحقل المعروض مقنَّع وغير قابل للتحرير، وإدخال
 * مفتاح جديد يعني **استبداله** لا تعديله. والمفتاح لا يعود من الخادم أصلاً —
 * ما يصل إلى هذه الشاشة صورته المقنَّعة فقط (SEC-005).
 *
 * والمنصة تعمل كاملةً بلا هذا الربط، ولذلك لا شيء هنا يبدو ناقصاً حين لا
 * يُربط مزوّد: «المنصة تعمل كاملةً بدونه» مكتوبة على الشاشة لا مفهومة ضمناً.
 *
 * والربط أربع خطوات كما في T04: مزوّد ← مفتاح ← **اختبار** ← نموذج. والاختبار
 * يجري في العملية الرئيسية قبل الحفظ، فالشاشة لا تملك قناةً تحفظ بلا اختبار.
 */

export function AiSettings({
  onConnectionChange,
}: {
  onConnectionChange: (connected: boolean) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProviderState | null>(null);
  const [studentAi, setStudentAi] = useState<boolean | null>(null);

  const applySettings = useCallback(
    (next: Settings) => {
      setSettings(next);
      onConnectionChange(next.activeProvider !== null);
    },
    [onConnectionChange],
  );

  const load = useCallback(async () => {
    try {
      applySettings(await bridge().aiSettings());
      const values = await bridge().readSettings();
      setStudentAi(values.values.studentAiMasterEnabled === 'true');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة إعدادات الذكاء الاصطناعي.');
    }
  }, [applySettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (provider: ProviderState) => {
    setError(null);
    try {
      applySettings(await bridge().aiDeleteKey({ provider: provider.provider }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حذف المفتاح.');
    }
  };

  const activate = async (provider: ProviderState) => {
    if (!provider.defaultModel) return;
    setError(null);
    try {
      applySettings(
        await bridge().aiSetModel({ provider: provider.provider, model: provider.defaultModel }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر اختيار المزوّد.');
    }
  };

  if (settings === null) {
    return <div className="m-auto text-t-body text-text-muted">{error ?? 'نقرأ إعداداتك…'}</div>;
  }

  return (
    /*
     * ٨٦٠px سقفُ عرض القراءة كما كان في الورقة قبل الهجرة. ولا رمز لعرض
     * المحتوى بهذا المقاس في `globals.css` — و`--width-content-max` أوسع منه
     * بكثير (١١٢٠) لأنها للشاشات الجدوليّة لا لعمودٍ من فقرات — فيبقى الرقم
     * منقولاً كما هو، على سنّة `520px` في `dialog.tsx`.
     */
    <div className="flex min-h-0 max-w-[860px] grow flex-col gap-3.5 overflow-auto">
      <p className="text-t-body text-text-2">
        اربط مزوّداً ليساعدك في صياغة الدروس والأسئلة. <strong>المنصة تعمل كاملةً بدونه</strong>،
        واختر خدمة سحابية أو خادماً محلياً لتشغيل الطلبات عليه.
      </p>

      {!settings.encryptionAvailable ? (
        <Alert tone="pending" live>
          لا نستطيع حفظ مفتاحك بأمان على هذا الجهاز، ولن نحفظه بصيغة مقروءة. شغّل خزنة كلمات المرور
          في نظامك ثم أعد المحاولة.
        </Alert>
      ) : null}

      {error !== null ? (
        <Alert tone="error" live>
          {error}
        </Alert>
      ) : null}

      {/*
       * ٢٦٠px أضيقُ عمودٍ يسع اسم المزوّد وشارته معاً، و`auto-fill` تملأ الصفّ
       * بما اتّسع له — فيتبدّل عدد الأعمدة مع عرض النافذة بلا نقطة توقّف
       * مكتوبة، وهو ما لا يعبّر عنه رمزٌ في السلّم.
       */}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3.5">
        {settings.providers.map((provider) => {
          const local = isLocalProvider(provider.provider);
          const configured = provider.hasKey || provider.status === 'connected';
          return (
            <Card key={provider.provider} className="gap-2.25 py-4">
              <CardHeader className="px-4.5">
                {/* ثقل ٧٠٠ لا ٦٠٠: اسم المزوّد هو عنوان البطاقة لا وصفها. */}
                <CardTitle className="font-bold">{provider.label}</CardTitle>
                <CardAction>
                  {provider.status === 'connected' ? (
                    <Badge tone="ok">
                      {settings.activeProvider === provider.provider ? 'مستخدم الآن' : 'مربوط'}
                    </Badge>
                  ) : provider.status === 'error' ? (
                    <Badge tone="error">تعذّر الاتصال</Badge>
                  ) : provider.hasKey ? (
                    <Badge tone="draft">مفتاح محفوظ — لم يُختبر</Badge>
                  ) : (
                    <Badge tone="draft">غير مربوط</Badge>
                  )}
                </CardAction>
              </CardHeader>

              <CardContent className="flex flex-col gap-2.25 px-4.5">
                <p className="text-t-caption text-text-muted">
                  {local
                    ? 'خادم محلي — شغّله وحمّل نموذجاً قبل الاتصال.'
                    : `خدمة سحابية — تحتاج مفتاحاً من حسابك عند ${provider.label}.`}
                </p>
                {local ? (
                  <p className="break-all text-t-mono text-text-muted" dir="ltr">
                    {provider.baseURL}
                  </p>
                ) : null}
                {configured ? (
                  <>
                    {/* المفتاح المقنَّع بخط أحادي داخل جزيرة ltr — قيمة تقنية لا نصّ عربي. */}
                    {provider.hasKey ? (
                      <div
                        className="ltr-island flex h-(--height-control) items-center rounded-sm border border-hairline bg-canvas px-3 text-t-mono text-text-2"
                        dir="ltr"
                      >
                        {provider.maskedKey}
                      </div>
                    ) : null}
                    <p className="break-words text-t-caption text-text-muted">
                      {provider.defaultModel === null
                        ? 'لم تختر نموذجاً بعد — افتح إعداد الاتصال لاختياره.'
                        : `النموذج الافتراضي: ${provider.defaultModel}`}
                    </p>
                    {provider.hasKey ? (
                      <p className="text-t-caption text-text-muted">
                        لا يُعرض المفتاح كاملاً بعد حفظه — ولا يخرج من هذا الجهاز إلا إلى مزوّدك.
                      </p>
                    ) : null}

                    <Usage usage={provider.usage} />
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Button variant="secondary" size="sm" onClick={() => setEditing(provider)}>
                        {local ? 'إعداد الاتصال' : 'استبدال المفتاح'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(provider)}>
                        {local ? 'فصل الاتصال' : 'حذف المفتاح'}
                      </Button>
                      {provider.status === 'connected' &&
                      provider.defaultModel &&
                      settings.activeProvider !== provider.provider ? (
                        <Button variant="primary" size="sm" onClick={() => void activate(provider)}>
                          استخدام هذا المزوّد
                        </Button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      {settings.encryptionAvailable || local ? (
                        <Button variant="primary" size="sm" onClick={() => setEditing(provider)}>
                          {local ? 'ربط الخادم' : 'ربط المفتاح'}
                        </Button>
                      ) : (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled
                          disabledReason="خزنة النظام غير متاحة — لن نحفظ مفتاحاً بلا تشفير."
                        >
                          ربط المفتاح
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="gap-2.25 py-4">
        <CardHeader className="px-4.5">
          <CardTitle className="font-bold">أين يظهر الذكاء الاصطناعي</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.25 px-4.5">
          <div className="flex items-center gap-3">
            <span className="grow">
              <span className="block text-t-body font-medium">مساعدة الطلاب داخل الدرس</span>
              <span className="text-t-caption text-text-muted">
                قاطع عام. حتى بعد فتحه تبقى المساعدة مطفأة في كل فصل حتى تفتحها فيه بنفسك.
              </span>
            </span>
            <Switch
              label="مساعدة الطلاب داخل الدرس"
              checked={studentAi === true}
              disabled={studentAi === null}
              onChange={(next) => {
                setStudentAi(next);
                void bridge().writeSetting({
                  key: 'studentAiMasterEnabled',
                  value: next ? 'true' : 'false',
                });
              }}
            />
          </div>
          <p className="text-t-caption text-text-muted">
            يستخدم الطلاب المزوّد المختار هنا. الطلبات السحابية تُحتسب على حسابك، والمحلية تعمل على
            خادمك.
          </p>
        </CardContent>
      </Card>

      <p className="text-t-caption text-text-muted">
        تظهر أرقام الاستهلاك فقط إذا كان مزوّدك يوفّرها، والفوترة تجري عنده لا عبر هذه المنصة.
      </p>

      {/*
       * الأيقونة مستبدَلة عمداً: درجة `ok` تأتي بعلامة صحّ، والمقصود هنا
       * **أين** يُحفظ المفتاح لا أنّ شيئاً نجح — فالقاعدة أَولى بالمعنى.
       */}
      <Alert tone="ok" icon={<Icon name="database" size={16} />}>
        المفتاح يُحفظ مشفَّراً في خزنة نظامك خارج مجلد بياناتك، فلا يدخل النسخ الاحتياطية ولا يظهر
        في ملف القاعدة. بعد استعادة نسخة على جهاز آخر ستحتاج إلى إدخاله من جديد.
      </Alert>

      {editing !== null ? (
        <KeyDialog
          provider={editing}
          encryptionAvailable={settings.encryptionAvailable}
          onConnected={applySettings}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            applySettings(next);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * الاستهلاك — US-T13 بشرطها: «إن توفّرت».
 *
 * عدد الطلبات نعدّه نحن فيُعرض دائماً. أمّا الوحدات فمن المزوّد: حين لا يعيدها
 * يُقال ذلك صراحةً بدل عرض صفر — والصفر يقرؤه المعلم «لم أستهلك شيئاً» وهو
 * غير صحيح، فيبني عليه قراراً عن فاتورته.
 */
function Usage({ usage }: { usage: ProviderState['usage'] }) {
  if (usage.requests === 0) {
    return <p className="text-t-caption text-text-muted">لم تستعمله بعد من هذا الجهاز.</p>;
  }

  return (
    <div className="flex flex-col gap-1.25 rounded-sm border border-hairline bg-canvas px-3 py-2.5">
      <UsageRow label="الطلبات" value={ar(usage.requests)} />
      <UsageRow
        label="الوحدات"
        value={usage.tokens === null ? 'لا يوفّرها مزوّدك' : ar(usage.tokens)}
      />
      {usage.lastUsedAt !== null ? (
        <UsageRow label="آخر استخدام" value={when(usage.lastUsedAt)} />
      ) : null}
    </div>
  );
}

/** صفّ استهلاك: الاسم يمتدّ والقيمة تقف في نهاية السطر — أي يساراً في العربية. */
function UsageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-t-caption text-text-muted">
      <span className="grow">{label}</span>
      <span className="font-semibold text-text-2 tabular-nums">{value}</span>
    </div>
  );
}

function KeyDialog({
  provider,
  encryptionAvailable,
  onConnected,
  onClose,
  onSaved,
}: {
  provider: ProviderState;
  encryptionAvailable: boolean;
  onConnected: (settings: Settings) => void;
  onClose: () => void;
  onSaved: (settings: Settings) => void;
}) {
  const local = isLocalProvider(provider.provider);
  const [key, setKey] = useState('');
  const [baseURL, setBaseURL] = useState(
    provider.baseURL ??
      (isLocalProvider(provider.provider) ? LOCAL_PROVIDER_URLS[provider.provider] : ''),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [model, setModel] = useState('');
  const [search, setSearch] = useState('');

  const input = { provider: provider.provider, key: key.trim(), ...(local ? { baseURL } : {}) };
  const valid = saveKeySchema.safeParse(input).success;
  const canStoreKey = key.trim() === '' || encryptionAvailable;
  const visibleModels = (models ?? [])
    .filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))
    .slice(0, 80);

  const test = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await bridge().aiSaveKey(input);
      if (result.status !== 'connected') {
        setError(result.message);
        return;
      }
      setKey('');
      setModels(result.models);
      setModel(
        provider.defaultModel && result.models.includes(provider.defaultModel)
          ? provider.defaultModel
          : (result.models[0] ?? ''),
      );
      onConnected(result.settings);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر اختبار الاتصال.');
    } finally {
      setBusy(false);
    }
  };

  const confirmModel = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await bridge().aiSetModel({ provider: provider.provider, model: model.trim() }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر حفظ النموذج.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{local ? `إعداد ${provider.label}` : `ربط ${provider.label}`}</DialogTitle>
        </DialogHeader>

        {models === null ? (
          <>
            <DialogDescription>
              {local
                ? 'شغّل الخادم وحمّل نموذجاً، ثم اختبر الاتصال. المفتاح مطلوب فقط إذا فعّلت المصادقة في خادمك.'
                : 'الصق مفتاح حسابك. سنختبره قبل حفظه مشفّراً على هذا الجهاز.'}
            </DialogDescription>
            {local ? (
              <>
                <Label htmlFor="provider-url">عنوان الخادم</Label>
                <Input
                  id="provider-url"
                  type="url"
                  dir="ltr"
                  className="ltr-island text-t-mono"
                  value={baseURL}
                  onChange={(event) => {
                    setBaseURL(event.target.value);
                    setError(null);
                  }}
                  disabled={busy}
                  autoFocus
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-t-caption text-text-muted">
                  استخدم عنوان الجهاز الذي يشغّل الخادم. تُرسل الطلبات إلى هذا العنوان.
                </p>
              </>
            ) : null}
            <Label htmlFor="provider-key">{local ? 'مفتاح الوصول — اختياري' : 'المفتاح'}</Label>
            <Input
              id="provider-key"
              type="password"
              dir="ltr"
              className="ltr-island text-t-mono"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setError(null);
              }}
              disabled={busy || !encryptionAvailable}
              autoFocus={!local}
              autoComplete="off"
              spellCheck={false}
              placeholder={local ? 'اتركه فارغاً لاتصال دون مفتاح' : ''}
            />
            {!canStoreKey ? (
              <Alert tone="pending">خزنة النظام غير متاحة لحفظ المفتاح بأمان.</Alert>
            ) : null}
          </>
        ) : (
          <>
            <Alert tone="ok">نجح الاتصال. اختر النموذج الذي تريد استخدامه.</Alert>
            <DialogDescription>
              {models.length === 0
                ? local
                  ? 'لم يعرض الخادم أي نموذج. حمّل نموذجاً فيه ثم أعد الاختبار، أو أدخل اسم نموذج متاح لديك.'
                  : 'لم يعرض المزوّد نماذج. يمكنك إدخال معرّف النموذج من حسابك.'
                : 'اختر من القائمة أو أدخل معرّف النموذج. سيصبح هذا المزوّد هو المستخدم للدروس ومساعدة الطلاب.'}
            </DialogDescription>
            <Label htmlFor="provider-model">النموذج</Label>
            <Input
              id="provider-model"
              dir="ltr"
              className="ltr-island text-t-mono"
              value={model}
              onChange={(event) => setModel(event.target.value)}
              disabled={busy}
              maxLength={256}
              spellCheck={false}
              autoComplete="off"
            />
            {models.length > 0 ? (
              <Command shouldFilter={false} className="rounded-sm border border-hairline">
                <CommandInput
                  placeholder="ابحث عن نموذج…"
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList className="max-h-44">
                  <CommandEmpty>لا يوجد نموذج بهذا الاسم.</CommandEmpty>
                  {visibleModels.map((name) => (
                    <CommandItem
                      key={name}
                      value={name}
                      disabled={busy}
                      onSelect={() => setModel(name)}
                      className="break-all text-t-mono"
                      dir="ltr"
                    >
                      {name}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            ) : null}
            {models.length > 80 ? (
              <p className="text-t-caption text-text-muted">
                اكتب جزءاً من الاسم للوصول إلى بقية النماذج.
              </p>
            ) : null}
          </>
        )}

        {error !== null ? (
          <Alert tone="error" live>
            {error}
          </Alert>
        ) : null}
        <Separator />
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={onClose}
            {...(busy ? { disabled: true as const, disabledReason: 'جارٍ إكمال الطلب…' } : {})}
          >
            {models === null ? 'إلغاء' : 'إغلاق'}
          </Button>
          {models === null ? (
            <Button
              variant="primary"
              onClick={() => void test()}
              {...(busy || !valid || !canStoreKey
                ? {
                    disabled: true as const,
                    disabledReason: busy
                      ? 'جارٍ الاختبار…'
                      : !valid
                        ? 'أدخل عنواناً صالحاً ومفتاحاً كاملاً عند الحاجة.'
                        : 'خزنة النظام غير متاحة.',
                  }
                : {})}
            >
              {busy ? 'جارٍ الاختبار…' : 'اختبار الاتصال'}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => void confirmModel()}
              {...(busy || model.trim() === ''
                ? {
                    disabled: true as const,
                    disabledReason: busy ? 'جارٍ الحفظ…' : 'اختر نموذجاً أو أدخل معرّفه.',
                  }
                : {})}
            >
              حفظ واستخدام
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
