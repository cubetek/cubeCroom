'use client';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

export type RadioGroupProps = ComponentProps<typeof RadioGroupPrimitive.Root>;

/**
 * مجموعة اختيارٍ واحد — الإجابة الصحيحة بين خيارات السؤال في T13.
 *
 * والمجموعة عنصرٌ واحد في تنقّل لوحة المفاتيح: `Tab` يدخلها ويخرج منها،
 * والأسهم تتنقّل داخلها. **وجهةُ الأسهم تأتي من `DirectionProvider`** في
 * `direction.tsx` لا من `dir` على الوثيقة — فمجموعةٌ تُركَّب خارج المزوّد
 * يمشي فيها السهم الأيمن إلى ما بعدُ بدل ما قبل: صفحةٌ عربية سليمة المظهر
 * يتحرّك التنقّل فيها بالعكس.
 */
export function RadioGroup({ className, ...rest }: RadioGroupProps) {
  return <RadioGroupPrimitive.Root className={cn('grid gap-2', className)} {...rest} />;
}

export type RadioGroupItemProps = ComponentProps<typeof RadioGroupPrimitive.Item>;

export function RadioGroupItem({ className, ...rest }: RadioGroupItemProps) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
        // `border-input` لا `border` — 3.43:1؛ التفصيل في `input.tsx`.
        'border border-input bg-surface',
        'transition-colors duration-200 ease-motion',
        'data-[state=checked]:border-primary',
        'disabled:cursor-not-allowed disabled:border-hairline disabled:bg-surface-2',
        className,
      )}
      {...rest}
    >
      {/*
        القرص ممتلئ لا مفرَّغ: الحلقة وحدها تفرّق بين المختار وغيره بلونِ حدٍّ
        فقط، والقرص يضيف فرقاً في **الشكل** يبقى قائماً بلا تمييزٍ للّون.
      */}
      <RadioGroupPrimitive.Indicator className="block size-2.5 rounded-full bg-primary" />
    </RadioGroupPrimitive.Item>
  );
}
