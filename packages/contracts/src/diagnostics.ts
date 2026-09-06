import { z } from 'zod';

/**
 * تشخيص الاتصال — FR-016 · لوح `T21Diagnostics`.
 *
 * **القاعدة التي تحكم هذا الملف: لا يُقال «يعمل» لما لم يُفحص.** شاشة تشخيص
 * تكذب أسوأ من غيابها — معلمٌ يقرأ «جدار الحماية يسمح» ثم لا يدخل طلابه يفقد
 * ثقته بكل ما تقوله الشاشة، ويبقى بلا دليل يتّبعه.
 *
 * ولذلك للحالة أربع قيم لا اثنتان: يعمل · مشكلة · **لم نستطع التحقق** ·
 * **متوقّف على غيره**. والأخيرتان ليستا تهرّباً — هما الحقيقة حين لا يملك
 * جهاز المعلم وحده أن يجيب.
 */

export const checkStateSchema = z.enum(['ok', 'problem', 'unknown', 'blocked']);

export type CheckState = z.infer<typeof checkStateSchema>;

export const CHECK_STATE_LABELS: Readonly<Record<CheckState, string>> = {
  ok: 'يعمل',
  problem: 'مشكلة',
  unknown: 'لم يُفحص',
  blocked: 'متوقّف على غيره',
};

/** ما يفعله المعلم بنفسه — لا يُعرض إجراء لا يملك تنفيذه. */
export const checkActionSchema = z.enum(['start_portal', 'open_firewall', 'open_access', 'retry']);

export type CheckAction = z.infer<typeof checkActionSchema>;

export const CHECK_ACTION_LABELS: Readonly<Record<CheckAction, string>> = {
  start_portal: 'تشغيل دخول الطلاب',
  open_firewall: 'السماح لـ CubeCroom',
  open_access: 'فتح شاشة دخول الطلاب',
  retry: 'إعادة الفحص',
};

export const diagnosticCheckSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** سطر واحد بلغة المعلم لا بلغة الشبكات — «بلغة غير تقنية» في FR-016. */
  detail: z.string().min(1),
  state: checkStateSchema,
  action: checkActionSchema.nullable(),
});

export type DiagnosticCheck = z.infer<typeof diagnosticCheckSchema>;

export const diagnosticsSchema = z.object({
  checkedAt: z.string(),
  checks: z.array(diagnosticCheckSchema),
  ok: z.number().int().nonnegative(),
  problems: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  /**
   * سطر أعلى الشاشة: خلاصة الحال بجملة واحدة.
   * تُصاغ في العملية الرئيسية لا في الشاشة، فتبقى الصياغة في مكان واحد.
   */
  headline: z.string().min(1),
  /** «تفاصيل تقنية» — مطويّة، وتُنسخ عند طلب الدعم الفني فقط. */
  technical: z.array(z.object({ label: z.string(), value: z.string() })),
});

export type Diagnostics = z.infer<typeof diagnosticsSchema>;

/**
 * التنبيه الثابت أسفل اللوح.
 *
 * يبقى معروضاً في كل الحالات — حتى حين تكون كل الفحوص خضراء: عزلُ الأجهزة
 * (AP isolation) لا يظهر في أي فحص على جهاز المعلم، وهو أشيع أسباب الفشل في
 * شبكات المدارس. ولا يملك التطبيق حيلة فيه، فيُقال للمعلم إلى من يذهب.
 */
export const ISOLATION_NOTICE =
  'الشرط الأهم يبقى واحداً: أن يكون جهازك وأجهزة طلابك على شبكة Wi-Fi نفسها. ' +
  'بعض شبكات المدارس تعزل الأجهزة عن بعضها؛ في تلك الحال يحتاج الأمر إلى مسؤول الشبكة في مدرستك.';

/**
 * خلاصة الحال بجملة واحدة — سطر العنوان في `T21`.
 *
 * المشكلة تُذكر بعددها لا بوصف عام: «مشكلة واحدة تمنع طلابك من الدخول» تُقرأ
 * إجراءً، و«هناك مشاكل» تُقرأ عطلاً عاماً لا مخرج منه.
 */
export function diagnosticsHeadline(counts: {
  readonly problems: number;
  readonly unresolved: number;
}): string {
  if (counts.problems === 1) return 'وجدنا مشكلة واحدة تمنع طلابك من الدخول';
  if (counts.problems === 2) return 'وجدنا مشكلتين تمنعان طلابك من الدخول';
  if (counts.problems > 2) return `وجدنا ${counts.problems} مشاكل تمنع طلابك من الدخول`;
  if (counts.unresolved > 0) return 'لم نجد مشكلة، لكن بقي ما لا نستطيع فحصه من جهازك';
  return 'كل ما نستطيع فحصه يعمل';
}

/**
 * خطوات جدار الحماية — §22.
 *
 * الترتيب مقصود: الأرجح أولاً. ومعلمٌ يقرأ «جدار الحماية» في أول سطر يذهب
 * يعبث بإعدادات أمان جهازه، والسبب في تسع حالات من عشر أنه على شبكة أخرى.
 *
 * وموضعها هنا لا في `core`: هي نصٌّ تعرضه الشاشة، و`core` حزمةٌ تعمل في عملية
 * النظام — استيرادها في الواجهة يجرّ `node:net` و`node:fs` إلى المتصفّح.
 */
export const FIREWALL_STEPS: readonly string[] = [
  'تأكد أن جهازك وأجهزة طلابك على شبكة Wi-Fi نفسها — لا على شبكة الضيوف.',
  'إن ظهرت لك نافذة من ويندوز تسأل عن السماح لـ CubeCroom، اختر «السماح» مع «الشبكات الخاصة».',
  'إن أغلقتها سابقاً بـ«إلغاء»، افتح إعدادات جدار الحماية واسمح للتطبيق من هناك.',
  'إن بقي المنع، فالغالب أن شبكة المدرسة تعزل الأجهزة عن بعضها — وذلك يحتاج مسؤول الشبكة.',
];

/**
 * الوقائع التي يجمعها جهاز المعلم — والفحص يُبنى منها وحدها.
 *
 * دالة صافية عمداً: التشخيص هو الشاشة التي **يجب** أن تكون مفحوصة، فمعلمٌ
 * يتّبعها في حصة لا يملك أن يشكّ فيها. وبناؤها من وقائع مجرَّدة يجعل كل حالة
 * — حتى «جدار الحماية يمنع» — قابلة للاختبار بلا شبكة ولا جدار حماية.
 */
export type DiagnosticFacts = {
  /** عنوان الجهاز على الشبكة المحلية، أو `null` إن لم يوجد. */
  readonly lan: { readonly address: string; readonly adapter: string } | null;
  readonly portal:
    | { readonly state: 'running'; readonly port: number; readonly url: string }
    | { readonly state: 'stopped' }
    | { readonly state: 'unreachable'; readonly port: number };
  /**
   * وصل جهازٌ إلى البوابة خلال هذه الحصة — طلبُ دخول أو طالبٌ على الشبكة الآن.
   * هذه هي **الواقعة الوحيدة** التي تُثبت أن شيئاً لا يمنع الوصول: جهاز
   * المعلم لا يستطيع أن يفحص جدار حمايته على نفسه، فمرورُ طلبٍ من الشبكة هو
   * الدليل الوحيد المتاح.
   */
  readonly reachedByDevice: boolean;
  readonly studentsOnline: number;
};

export function buildDiagnostics(facts: DiagnosticFacts, checkedAt: Date): Diagnostics {
  const running = facts.portal.state === 'running';
  const checks: DiagnosticCheck[] = [];

  /* ١. الشبكة */
  checks.push(
    facts.lan === null
      ? {
          id: 'network',
          title: 'اتصال هذا الجهاز بالشبكة',
          detail:
            'جهازك غير متصل بشبكة محلية. صِله بشبكة Wi-Fi المدرسة نفسها التي عليها أجهزة طلابك.',
          state: 'problem',
          action: 'retry',
        }
      : {
          id: 'network',
          title: 'اتصال هذا الجهاز بالشبكة',
          // الاسم الذي يظهر هو اسم البطاقة كما يسمّيها النظام لا اسم الشبكة:
          // اسم الشبكة (SSID) لا يقرؤه التطبيق، واختراعُه كذبٌ يراه المعلم.
          detail: `متصل عبر «${facts.lan.adapter}» بالعنوان ${facts.lan.address}.`,
          state: 'ok',
          action: null,
        },
  );

  /* ٢. البوابة والمنفذ */
  checks.push(
    facts.portal.state === 'running'
      ? {
          id: 'portal',
          title: 'بوابة دخول الطلاب',
          detail: `تعمل على هذا الجهاز وجاهزة لاستقبال الطلاب — ${facts.portal.url}`,
          state: 'ok',
          action: null,
        }
      : facts.portal.state === 'unreachable'
        ? {
            id: 'portal',
            title: 'بوابة دخول الطلاب',
            detail: `شُغِّلت على المنفذ ${facts.portal.port} لكنها لا تستجيب. أوقف الحصة وشغّلها من جديد.`,
            state: 'problem',
            action: 'open_access',
          }
        : {
            id: 'portal',
            title: 'بوابة دخول الطلاب',
            detail: 'دخول الطلاب متوقّف الآن. لن يصل أحد حتى تشغّل الحصة.',
            state: 'problem',
            action: 'start_portal',
          },
  );

  /* ٣. جدار الحماية */
  checks.push(
    !running
      ? {
          id: 'firewall',
          title: 'جدار الحماية على هذا الجهاز',
          detail: 'سيُفحص بعد تشغيل دخول الطلاب.',
          state: 'blocked',
          action: null,
        }
      : facts.reachedByDevice
        ? {
            id: 'firewall',
            title: 'جدار الحماية على هذا الجهاز',
            detail: 'وصل جهاز إلى بوابتك عبر الشبكة خلال هذه الحصة، فلا شيء يمنع الوصول.',
            state: 'ok',
            action: null,
          }
        : {
            id: 'firewall',
            title: 'جدار الحماية على هذا الجهاز',
            // لا يُقال «يمنع» ولا «يسمح»: جهازٌ لا يفحص جدار حمايته على نفسه،
            // والاتصال بعنوانه من داخله لا يمرّ به أصلاً.
            detail:
              'لا يستطيع جهازك وحده أن يعرف. افتح رابط الحصة على جهاز طالب واحد: إن فُتحت الصفحة فلا مانع، وإن لم تُفتح فالغالب جدار الحماية.',
            state: 'unknown',
            action: 'open_firewall',
          },
  );

  /* ٤. وصول جهاز طالب */
  checks.push(
    !running
      ? {
          id: 'student-device',
          title: 'وصول جهاز طالب',
          detail: 'سيُفحص بعد تشغيل دخول الطلاب.',
          state: 'blocked',
          action: null,
        }
      : facts.studentsOnline > 0
        ? {
            id: 'student-device',
            title: 'وصول جهاز طالب',
            detail: `${facts.studentsOnline} من طلابك على الشبكة الآن — الوصول يعمل فعلاً لا نظرياً.`,
            state: 'ok',
            action: null,
          }
        : facts.reachedByDevice
          ? {
              id: 'student-device',
              title: 'وصول جهاز طالب',
              detail: 'وصل طلب دخول من جهاز خلال هذه الحصة، ولا أحد على الشبكة الآن.',
              state: 'ok',
              action: null,
            }
          : {
              id: 'student-device',
              title: 'وصول جهاز طالب',
              detail:
                'لم يصل جهاز بعد. جرّبه على جهاز طالب واحد قبل أن يجرّبه صفّك كله.',
              state: 'unknown',
              action: 'open_access',
            },
  );

  const ok = checks.filter((check) => check.state === 'ok').length;
  const problems = checks.filter((check) => check.state === 'problem').length;
  const unresolved = checks.filter(
    (check) => check.state === 'unknown' || check.state === 'blocked',
  ).length;

  return {
    checkedAt: checkedAt.toISOString(),
    checks,
    ok,
    problems,
    unresolved,
    headline: diagnosticsHeadline({ problems, unresolved }),
    technical: [],
  };
}
