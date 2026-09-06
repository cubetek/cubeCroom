'use client';

import * as ProgressPrimitive from '@radix-ui/react-progress';
import type { CSSProperties } from 'react';
import { cn } from '#lib/utils';

/**
 * شريط تقدّم — **بنسبة معلومة وحدها**.
 *
 * التعليق في `Attachments.module.css` يقرّر القاعدة: «شريطٌ محدَّد بنسبة
 * حقيقية — لا يُعرض إلا حين تكون النسبة معلومة». ولذلك `value` إلزاميّ ولا
 * وجود لحالةٍ غير محدَّدة هنا: الشريط الزاحف بلا نسبة يَعِد بتقدّمٍ لا يقيسه
 * أحد، ويستوي فيه النسخُ الذي يعمل والنسخُ الذي علّق.
 */
export type ProgressProps = {
  /** من 0 إلى `max`. القيم خارج المدى تُقصّ لا تُمدّد الشريط. */
  value: number;
  max?: number;
  /**
   * **اسمٌ مقروء إلزاميّ.** الشريط عنصرٌ رسوميّ خالٍ من النصّ: بلا اسم يعلن
   * قارئ الشاشة «شريط تقدّم، ٦٠٪» ولا يقول ٦٠٪ من ماذا. والنوع يمنع نسيانه.
   */
  label: string;
  className?: string;
};

export function Progress({ value, max = 100, label, className }: ProgressProps) {
  /*
   * القصّ يسبق Radix لا يليه: `aria-valuenow` أكبر من `aria-valuemax` يُنطق
   * رقماً مستحيلاً، والشريط الممتلئ يبدو سليماً فوقه. فما يُعلَن هو ما يُرسم.
   */
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(safeMax, Math.max(0, value));
  const filled = (clamped / safeMax) * 100;

  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={clamped}
      max={safeMax}
      aria-label={label}
      className={cn('h-1 w-full overflow-hidden rounded-full bg-hairline', className)}
    >
      {/*
       * **`w-` لا `translateX`.** مصدر shadcn يزيح المؤشّر `-(100−value)%`
       * فيُفرَّغ الشريط من اليسار — وهو صحيح في اللاتينية ومقلوب في العربية:
       * التقدّم يجب أن يمتلئ من اليمين. والعرض لا اتجاه له: ابنٌ كتليّ يبدأ
       * من بداية السطر أيّاً كانت، فيصحّ الاتجاهان بلا فرعٍ في الشيفرة.
       *
       * والقيمة تُمرَّر متغيّرَ CSS تقرؤه الأداة `w-(--progress-fill)`:
       * النسبة **معطىً متغيّر** لا يُكتب صنفاً، وTailwind لا يولّد أصنافاً
       * لقيمٍ تُحسب وقت التشغيل. فالتنسيق كلّه في الأداة، والسمة تحمل الرقم
       * وحده.
       */}
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn(
          'h-full w-(--progress-fill) rounded-full bg-primary',
          // خطّيّ لا مُبطَّأ: النسخ يصل بمعدّل حقيقي، ومنحنى تسارعٍ فوقه يجعل
          // الشريط يكذب على العين بين تحديثين.
          'transition-[width] duration-200 ease-linear',
        )}
        style={{ '--progress-fill': `${filled}%` } as CSSProperties}
      />
    </ProgressPrimitive.Root>
  );
}
