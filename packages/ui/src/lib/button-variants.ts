import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '#lib/utils';

/**
 * أصناف الزرّ — **في وحدةٍ بلا `'use client'` عمداً**.
 *
 * `buttonVariants` دالّةُ تنسيق خالصة: تأخذ نوعاً ومقاساً وتردّ سلسلة أصناف،
 * ولا تلمس حالةً ولا حدثاً. لكنّها كانت تسكن `button.tsx`، وذلك الملفّ
 * `'use client'` — فصار كلُّ ما يصدُر عنه عبر حدّ العميل.
 *
 * وأثرُه أنّ **مكوّن خادم لا يستطيع استدعاءها**: صفحات الطالب ترسم روابط
 * «الأنشطة» و«الدروس» بها وهي مكوّنات خادم (تقرأ `headers()` وتعيد التوجيه)،
 * فيسقط البناء بـ«Attempted to call buttonVariants() from the server».
 *
 * فتُفصل هنا: الملفّ بلا توجيه، فيقرؤه الخادم والعميل معاً. و`button.tsx`
 * يستوردها كما يستوردها غيره — والزرّ نفسه يبقى مكوّن عميل كما كان.
 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium',
    'whitespace-nowrap transition-colors duration-200 ease-motion',
    // الأيقونة تتبع لون النصّ ولا تُصطاد بالنقر.
    '[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0',
    // التعطيل يُرى، ولا يحمل المعنى وحده — انظر `disabledReason` في `button.tsx`.
    'disabled:pointer-events-none disabled:opacity-50',
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        secondary: 'border border-input bg-surface text-text hover:bg-surface-2',
        ghost: 'text-text-2 hover:bg-surface-2 hover:text-text',
        danger: 'bg-destructive text-destructive-foreground hover:brightness-90',
        ai: 'border border-ai-border bg-ai-bg text-ai-text hover:brightness-95',
      },
      size: {
        /*
         * الارتفاع من الرمز لا من رقم مكتوب: `--height-control` تساوي 40px
         * عند المعلّم و44px تحت `[data-app="student"]` — فالزرّ الواحد يكبر
         * على جهاز الطالب بلا صنفٍ ثانٍ ولا فرعٍ في الشيفرة.
         */
        md: 'h-(--height-control) px-4 text-t-body',
        sm: 'h-(--height-control-sm) px-3 text-t-label',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export { buttonVariants };
