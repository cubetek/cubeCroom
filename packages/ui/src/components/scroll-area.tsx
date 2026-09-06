'use client';

import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * منطقة تمرير — شريطٌ واحد في الواجهتين بدل شريط كل نظام.
 *
 * **والجهة ليست شأن هذا الملفّ.** Radix هو من يضع الشريط: يقرأ الاتجاه من
 * `DirectionProvider` فيلصقه باليسار في RTL. فلا `start-0` ولا `end-0` هنا —
 * صنفٌ مثلهما يزاحم ما يكتبه Radix سطراً في العنصر، ويثبّت الشريط في جهة لا
 * تتغيّر. وبلا المزوّد يهبط الشريط على اليمين فوق أول النصّ.
 */
export function ScrollArea({
  className,
  children,
  /*
   * `auto` لا `hover` (وهو مذهب Radix الافتراضي): الشريط الذي يظهر عند المرور
   * وحده يُخفي أنّ تحته بقيّة. والقائمة التي تبدو منتهية لا يبحث أحد عن باقيها
   * — فيظنّ المعلّم أن فصله ثمانية طلاب وهم عشرون.
   */
  type = 'auto',
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Root>) {
  return (
    <ScrollAreaPrimitive.Root
      type={type}
      className={cn('relative overflow-hidden', className)}
      {...props}
    >
      {/* `rounded-[inherit]` ترث زاوية الجذر: بدونها يخرج المحتوى من ركن مدوّر. */}
      <ScrollAreaPrimitive.Viewport className="size-full rounded-[inherit]">
        {children}
      </ScrollAreaPrimitive.Viewport>
      {/*
       * الشريطان معاً: كلٌّ لا يظهر إلا إذا فاض محوره تحت `type="auto"`، فرسمهما
       * لا يكلّف شيئاً، ونسيان الأفقيّ يحبس محتوىً عريضاً بلا طريق إليه.
       */}
      <ScrollBar orientation="vertical" />
      <ScrollBar orientation="horizontal" />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export function ScrollBar({
  className,
  orientation = 'vertical',
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      orientation={orientation}
      className={cn(
        'flex touch-none select-none p-px',
        orientation === 'vertical' ? 'h-full w-2.5' : 'h-2.5 w-full flex-col',
        className,
      )}
      {...props}
    >
      {/*
       * `border-input` لا لونَ فاصلٍ أفتح: القبضة عنصر تفاعل يُمسك ويُسحب،
       * فحدّها 3:1 — وهذا الرمز وحده مقيسٌ عليه (3.43:1).
       */}
      <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-border-input" />
    </ScrollAreaPrimitive.Scrollbar>
  );
}
