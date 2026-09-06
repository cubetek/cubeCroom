import { z } from 'zod';

/**
 * مزوّدو الذكاء الاصطناعي — PRD §11 · SEC-005.
 *
 * السحابة والخوادم المحلية تشترك في العقود نفسها؛ خصائص المزوّد مصدرها هنا.
 *
 * **ولا حقل للمفتاح في أي عقد هنا.** ما يعبر إلى الواجهة هو `hasKey`
 * و`maskedKey` فقط — «Never display full key» في لوح T19، وSEC-005 يمنع
 * خروجه أصلاً.
 */

export const PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'lmstudio',
  'ollama',
] as const;

export type ProviderId = (typeof PROVIDERS)[number];

export const providerIdSchema = z.enum(PROVIDERS);

export const PROVIDER_LABELS: Readonly<Record<ProviderId, string>> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  openrouter: 'OpenRouter',
  lmstudio: 'LM Studio',
  ollama: 'Ollama',
};

export const LOCAL_PROVIDERS = ['lmstudio', 'ollama'] as const;
export type LocalProviderId = (typeof LOCAL_PROVIDERS)[number];

export function isLocalProvider(provider: ProviderId): provider is LocalProviderId {
  return (LOCAL_PROVIDERS as readonly string[]).includes(provider);
}

export const LOCAL_PROVIDER_URLS: Readonly<Record<LocalProviderId, string>> = {
  lmstudio: 'http://localhost:1234/v1',
  ollama: 'http://localhost:11434/v1',
};

/** لا أسرار في العنوان؛ المفتاح له خزنة مستقلة. يقبل عنوان الخادم أو جذر API. */
export const localProviderUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url('أدخل عنوان خادم صالحاً.')
  .superRefine((value, ctx) => {
    if (!URL.canParse(value)) return;
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'استخدم عنوان HTTP أو HTTPS بلا كلمة مرور أو معاملات إضافية.',
      });
    }
  })
  .transform((value) => {
    const url = new URL(value);
    if (url.pathname === '/') url.pathname = '/v1';
    return url.toString().replace(/\/+$/, '');
  });

export const localProviderEndpointsSchema = z.object({
  lmstudio: localProviderUrlSchema.optional(),
  ollama: localProviderUrlSchema.optional(),
});
export type LocalProviderEndpoints = z.infer<typeof localProviderEndpointsSchema>;

export const providerStateSchema = z.object({
  provider: providerIdSchema,
  label: z.string().min(1),
  /** connected · error · disconnected */
  status: z.enum(['connected', 'error', 'disconnected']),
  defaultModel: z.string().nullable(),
  baseURL: z.string().nullable(),
  hasKey: z.boolean(),
  /** «sk-…4f2a» — الطرفان وحدهما، ولا يكفيان للاستعمال. */
  maskedKey: z.string().nullable(),
  connectedAt: z.string().nullable(),
  /**
   * الاستهلاك — US-T13: «يظهر فقط إن وفّره المزوّد».
   * `tokens: null` تعني أن أحداً من النداءات لم يُعد عدداً، لا أن العدد صفر.
   */
  usage: z.object({
    requests: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative().nullable(),
    lastUsedAt: z.string().nullable(),
  }),
});

export type ProviderState = z.infer<typeof providerStateSchema>;

export const aiSettingsSchema = z.object({
  /** هل تستطيع خزنة النظام تشفير المفاتيح على هذا الجهاز؟ */
  encryptionAvailable: z.boolean(),
  activeProvider: providerIdSchema.nullable(),
  providers: z.array(providerStateSchema),
});

export type AiSettings = z.infer<typeof aiSettingsSchema>;

export const saveKeySchema = z
  .object({
    provider: providerIdSchema,
    key: z
      .string()
      .trim()
      .max(400, 'المفتاح أطول من المتوقّع. تأكّد أنك نسخت المفتاح وحده.')
      .default(''),
    baseURL: localProviderUrlSchema.optional(),
  })
  .superRefine((input, ctx) => {
    if (!isLocalProvider(input.provider) && input.key.length < 8) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['key'],
        message: 'المفتاح أقصر من أن يكون صحيحاً. انسخه كاملاً من صفحة مزوّدك.',
      });
    }
    if (!isLocalProvider(input.provider) && input.baseURL !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['baseURL'],
        message: 'عنوان الخادم متاح للمزوّدين المحليين فقط.',
      });
    }
  });

export type SaveKeyInput = z.infer<typeof saveKeySchema>;

/**
 * نتيجة ربط مفتاح — FR-011.
 *
 * معيار الإنجاز: **المفتاح لا يُحفظ إذا فشل الاختبار**. ولذلك لا توجد قناة
 * تحفظ بلا اختبار: النتيجة إمّا `connected` بعد نجاح النداء، أو فشلٌ بسببه —
 * ولا حالة ثالثة تترك في الجهاز مفتاحاً لا يعمل.
 */
export const saveKeyResultSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('connected'),
    /** نماذج الحساب كما سردها المزوّد — خطوة اختيار النموذج في T04. */
    models: z.array(z.string()),
    settings: aiSettingsSchema,
  }),
  z.object({
    status: z.literal('rejected'),
    reason: z.enum(['rejected_key', 'offline', 'quota', 'timeout', 'provider_error']),
    message: z.string().min(1),
  }),
  z.object({ status: z.literal('unavailable'), message: z.string().min(1) }),
]);

export type SaveKeyResult = z.infer<typeof saveKeyResultSchema>;

/** «حذف المفتاح» — المزوّد وحده يكفي. */
export const providerKeySchema = z.object({ provider: providerIdSchema });

export type ProviderKeyInput = z.infer<typeof providerKeySchema>;

/** اختيار النموذج الافتراضي بعد نجاح الاختبار — T04States/٢. */
export const setModelSchema = z.object({
  provider: providerIdSchema,
  model: z.string().trim().min(1, 'اختر نموذجاً قبل المتابعة.').max(256),
});

export type SetModelInput = z.infer<typeof setModelSchema>;
