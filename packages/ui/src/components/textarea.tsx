'use client';

import type { TextareaHTMLAttributes } from 'react';
import { cn } from '#lib/utils';

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * حقل نصّ متعدّد الأسطر — نصّ السؤال والإجابة المتوقَّعة في T13 وT14.
 *
 * ولا `rows` مفروضة هنا: الشاشات تمرّرها بنفسها (`rows={2}` في باني النشاط)،
 * وقيمةٌ افتراضية في المكوّن تصير سقفاً صامتاً يتجاوزه كلٌّ على حدة.
 */
export function Textarea({ className, ...rest }: TextareaProps) {
  return (
    <textarea
      className={cn(
        // `border-input` لا `border` — القياس نفسه المشروح في `input.tsx`.
        'block w-full min-h-(--height-control) rounded-sm border border-input bg-surface',
        // اللون مُعلَن مع الخلفية لا موروثاً — القياس نفسه المشروح في `input.tsx`.
        'px-3 py-2 text-t-body text-text placeholder:text-text-muted',
        'transition-colors duration-200 ease-motion',
        /*
         * التمدّد رأسيّ فقط: السؤال يطول سطوراً لا عرضاً، وسحبةٌ أفقية تخرج
         * الحقل عن عمود الورقة فيقصّ الأب الفائض أو يمدّ الصفحة تمريراً جانبياً.
         */
        'resize-y',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-text-muted',
        // حدُّ الخطأ `danger` لا `error-border` — انظر `input.tsx`.
        'aria-invalid:border-danger',
        className,
      )}
      {...rest}
    />
  );
}
