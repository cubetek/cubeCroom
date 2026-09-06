'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import type { InputHTMLAttributes } from 'react';
import { cn } from '#lib/utils';

/**
 * حقل نصّ سطرٍ واحد — صندوقُ الإدخال المرجعيّ في المنتج.
 *
 * ومنه يستعير `SelectTrigger` صندوقه: القائمةُ المنسدلة تقف في الصفّ مع
 * الحقول، فإن اختلف حدُّها أو ارتفاعها عنها بان الصفّ مكسوراً.
 */
const inputVariants = cva(
  cn(
    /*
     * **`border-input` لا `border`.**
     *
     * `--color-border` (‏#E2E8F0) تباينه 1.23:1 — فاصلٌ زخرفيّ لا يُرى وحده،
     * و`--color-input` (‏#7C8CA0) تباينه 3.43:1 فيحقّق 3:1 المطلوبة لحدود
     * عناصر التفاعل. والخلط بينهما لا يظهر في الشاشة: الحقل يبقى مرئياً
     * لمن يراه أصلاً، ويسقط عمّن لا يراه — وهو عطلٌ لا يُكتشف إلا في تدقيق.
     */
    'block w-full min-w-0 rounded-sm border border-input bg-surface',
    'placeholder:text-text-muted transition-colors duration-200 ease-motion',
    /*
     * **اللون مُعلَن ولا يُترك للوراثة.** `bg-surface` مكتوبة هنا، فلو بقي
     * النصّ موروثاً لتبع أيّ لونٍ يضعه الأب: حقلٌ داخل بطاقة خطأ تحمل
     * `text-error-text` يصير نصُّه المكتوب أحمرَ داكناً في صندوقٍ أبيض، بلا
     * صنفٍ في هذا الملفّ يدلّ على السبب. والخلفيةُ والنصُّ يُكتبان معاً أو
     * لا يُكتبان.
     */
    'text-text',
    'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-muted',
    /*
     * الحدّ الأحمر `--color-danger` لا `--color-error-border`.
     *
     * الثاني (#FECACA) حدُّ **سطحِ** رسالة الخطأ، تباينه دون 3:1؛ ولو وُضع على
     * الحقل لأعلن الخطأ بلونٍ لا يميّزه من يحتاج الإعلان. والحدّ وحده لا يكفي
     * على كل حال — تبقى الرسالة النصّية بجانبه.
     */
    'aria-invalid:border-danger',
    /*
     * ولا محاذاة نصّ هنا. الحقل يرث `dir` من الوثيقة فيبدأ من اليمين، ومحاذاةٌ
     * مكتوبة تكسر `ltr-island` — وهي أداة القيم التقنية (المنفذ · الرابط ·
     * IP) التي تُقلب إلى اليسار عمداً.
     */
  ),
  {
    variants: {
      size: {
        md: 'h-(--height-control) px-3 text-t-body',
        sm: 'h-(--height-control-sm) px-3 text-t-label',
      },
    },
    defaultVariants: { size: 'md' },
  },
);

/**
 * `size` الأصليّة مطروحة: هي في HTML **عددُ محارف** مرئية، وهنا ارتفاعُ
 * الحقل. واسمان بمعنيين على خاصية واحدة يجعل الاستدعاء يقول ما لا يعني.
 */
export type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> &
  VariantProps<typeof inputVariants>;

export function Input({ size, className, type = 'text', ...rest }: InputProps) {
  return <input type={type} className={cn(inputVariants({ size }), className)} {...rest} />;
}

export { inputVariants };
