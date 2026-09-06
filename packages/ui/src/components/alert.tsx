'use client';

import { CircleAlert, CircleCheck, Info, Sparkles, TriangleAlert, X } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '#lib/utils';

/**
 * لوح رسالة — الشريط الملوّن الذي يعلن خطأً أو ينبّه أو يؤكّد.
 *
 * صنفا `.error` و`.notice` مكرّران في كل ورقة أنماط تقريباً بالقيم نفسها،
 * وثلاثتها هنا: سطحُ الدرجة وحدُّها ونصُّها من `globals.css` — والنصّ مقيسٌ
 * على سطحه هو، فلا يُنقل لونُ درجةٍ إلى سطح أخرى.
 *
 * والدرجات الخمس هي درجات `Badge` نفسها، **لكنّ الأيقونات ليست نفسها**:
 * `pending` في الشارة حالةُ انتظار — فأيقونتها ساعة، وفي اللوح تحذيرٌ دائم
 * («لا خادم يحتفظ بنسخة ثانية» في T20) — فأيقونته مثلّث. والشارة تصف كائناً،
 * واللوح يخاطب قارئاً، فلا تُوحَّد الأيقونتان لأن اللون واحد.
 */
export type AlertTone = 'ok' | 'pending' | 'error' | 'draft' | 'ai';

const TONE_ICON = {
  ok: CircleCheck,
  pending: TriangleAlert,
  error: CircleAlert,
  draft: Info,
  ai: Sparkles,
} as const;

const alertVariants = cva(
  cn(
    'flex items-start gap-2 rounded-md border px-4 py-3 text-t-label',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ),
  {
    variants: {
      tone: {
        ok: 'border-ok-border bg-ok-bg text-ok-text',
        pending: 'border-pending-border bg-pending-bg text-pending-text',
        error: 'border-error-border bg-error-bg text-error-text',
        draft: 'border-draft-border bg-draft-bg text-draft-text',
        ai: 'border-ai-border bg-ai-bg text-ai-text',
      },
    },
  },
);

export type AlertProps = Omit<VariantProps<typeof alertVariants>, 'tone'> & {
  tone: AlertTone;
  children: ReactNode;
  /** سطرٌ أوّل أثقل — للّوح الذي يشرح أكثر من جملة. */
  title?: string;
  /** استبدال الأيقونة الافتراضية. تُمرَّر بـ`aria-hidden` — النصّ هو ما يُقرأ. */
  icon?: ReactNode;
  /**
   * **هل ظهر هذا اللوح جواباً لفعلٍ للتوّ؟**
   *
   * shadcn يضع `role="alert"` دائماً، وهو خطأ في الاتجاهين: لوحُ T20 الدائم
   * يصف المنتج ولا يعلن شيئاً — و`role="alert"` يقاطع قارئ الشاشة به عند كل
   * دخول للشاشة. وخطأٌ يظهر بعد ضغطة «حفظ» بلا هذا الدور لا يُنطق أصلاً، فلا
   * يعرف من لا يرى الشاشة أنّ شيئاً حدث.
   *
   * فالفرق ليس في الدرجة بل في **سبب الظهور**، ولا يعرفه إلا المستدعي.
   */
  live?: boolean;
  /** يظهر زرّ الإخفاء حين يُمرَّر — كما في شريط «أُنشئ الفصل» في T04. */
  onDismiss?: () => void;
  dismissLabel?: string;
  className?: string;
};

export function Alert({
  tone,
  title,
  icon,
  children,
  live = false,
  onDismiss,
  dismissLabel = 'إخفاء',
  className,
}: AlertProps) {
  const ToneIcon = TONE_ICON[tone];

  return (
    <div role={live ? 'alert' : undefined} className={cn(alertVariants({ tone }), className)}>
      {/* السطر الأول 19.5px والأيقونة 16px — بكسلان يردّان مركزها إلى مركزه. */}
      <span className="mt-0.5 flex">{icon ?? <ToneIcon aria-hidden />}</span>

      <div className="min-w-0 flex-1">
        {title ? <p className="text-t-h3">{title}</p> : null}
        {title ? <div className="mt-1">{children}</div> : children}
      </div>

      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          /*
           * `-me-1` سالبةٌ في الطرف المنطقي: تردّ الزرّ إلى حافة اللوح البصرية
           * بعد أن باعده حشوُه هو — وفي RTL هذا الطرف هو اليسار.
           * ولونه `text-current`: نصُّ الدرجة مقيسٌ على سطحها، وأيّ رماديّ
           * محايد فوق سطحٍ ملوّن يخرج من القياس.
           */
          className="-me-1 flex shrink-0 rounded-sm p-1 text-current"
        >
          <X aria-hidden />
        </button>
      ) : null}
    </div>
  );
}

export { alertVariants };
