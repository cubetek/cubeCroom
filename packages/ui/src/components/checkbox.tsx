'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

export type CheckboxProps = ComponentProps<typeof CheckboxPrimitive.Root>;

/**
 * مربّع اختيار — إقرارُ الحذف في T21 وT24، واختيارُ صفوف في T19.
 *
 * والعلامة داخله ليست زينة: هي الفرق المرئيّ بين مختارٍ وغيره لمن لا يميّز
 * الأخضر عن الرمادي — فلا يُترك اللون وحده حاملاً للحالة (القيد 4).
 */
export function Checkbox({ className, ...rest }: CheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'group inline-flex size-5 shrink-0 items-center justify-center rounded-sm',
        // `border-input` لا `border` — 3.43:1 مقابل 1.23:1؛ التفصيل في `input.tsx`.
        'border border-input bg-surface',
        'transition-colors duration-200 ease-motion',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary',
        'data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary',
        'data-[state=indeterminate]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2',
        className,
      )}
      {...rest}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {/*
          الأيقونتان مرسومتان معاً ويحسم بينهما `data-state` على الجذر، لا شرطٌ
          يقرأ `props.checked`: الحالة الثالثة تصل أيضاً من داخل Radix (مربّع
          غير مضبوط، أو تبديل من الجذر)، وشرطٌ يقرأ الخاصية وحدها يفوته ذلك.

          و«بعض» ليست «لا شيء»: مربّعٌ فارغ لحالة الاختيار الجزئي يقول للمعلّم
          إنّه لم يختر شيئاً وهو قد اختار بعضاً — فيعيد الاختيار من أوّله.
        */}
        <Check className="size-4 group-data-[state=indeterminate]:hidden" aria-hidden />
        <Minus className="hidden size-4 group-data-[state=indeterminate]:block" aria-hidden />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
