import { CircleAlert, CircleCheck, Clock, Pencil, Sparkles } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { cn } from '#lib/utils';

/**
 * شارة حالة — نقلٌ لمكوّن قائم، بعقده كما هو (`packages/ui/src/Badge.tsx`).
 *
 * القاعدة الملزِمة في المصدر: «لا تعتمد على اللون وحده في Pending/Approved/
 * Error؛ استخدم icon + text». ولذلك **الأيقونة ليست خياراً**: كل درجة تحمل
 * أيقونتها الثابتة عبر المنتج، فمن لا يميّز الأصفر من الأخضر يقرأ الفرق.
 *
 * وكلٌّ من الدرجات الخمس ثلاثةُ رموز في `globals.css`: سطحٌ وحدٌّ ونصّ. ولا
 * تُختصر إلى لون واحد — نصُّ الشارة يقف على سطحها هي لا على سطح الصفحة، وتباينه
 * مقيسٌ على ذلك السطح.
 */
export type BadgeTone = 'ok' | 'pending' | 'error' | 'draft' | 'ai';

/**
 * أيقونات lucide هذه **غير اتجاهية**، فلا تحتاج `rtl:-scale-x-100`.
 * القاعدة في `05-foundations.md` §4: `chevron`/`arrow` وحدها تُعكس مع RTL،
 * وعكسُ ساعةٍ أو علامةِ صحّ يقلبها إلى شكل خاطئ لا إلى شكل معكوس.
 */
const TONE_ICON = {
  ok: CircleCheck,
  pending: Clock,
  error: CircleAlert,
  draft: Pencil,
  ai: Sparkles,
} as const;

const badgeVariants = cva(
  cn(
    'inline-flex shrink-0 items-center whitespace-nowrap rounded-sm border text-t-badge',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
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
      size: {
        md: 'gap-2 px-3 py-1 [&_svg]:size-3.5',
        /*
         * `sm` يصغر بالحشو والأيقونة لا بالخطّ: الشارة الصغيرة في المصدر
         * كانت 11px، وليس في السلّم رمزٌ بهذا المقاس. واختراع مقاسٍ سادس
         * خارج `globals.css` أسوأ من فرق البكسل الواحد.
         */
        sm: 'gap-1.5 px-2 py-0.5 [&_svg]:size-3',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

export type BadgeProps = Omit<VariantProps<typeof badgeVariants>, 'tone'> & {
  tone: BadgeTone;
  children: ReactNode;
  /**
   * استبدال الأيقونة الافتراضية — للحالات التي تحمل معنى أدقّ داخل الدرجة نفسها.
   * ونصُّ الشارة هو ما يُقرأ، فالبديل يُمرَّر بـ`aria-hidden` مثل الافتراضي.
   */
  icon?: ReactNode;
  className?: string;
};

export function Badge({ tone, size, icon, children, className }: BadgeProps) {
  const ToneIcon = TONE_ICON[tone];

  return (
    <span className={cn(badgeVariants({ tone, size }), className)}>
      {icon ?? <ToneIcon aria-hidden />}
      <span>{children}</span>
    </span>
  );
}

export { badgeVariants };
