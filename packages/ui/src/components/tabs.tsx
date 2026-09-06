'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * التبويبات — **صفٌّ يمرّر، لا يفيض ولا يُقصّ**.
 *
 * قشرة الفصل تعرض ستة أقسام في صفّ واحد: «نظرة عامة» · «تشغيل دخول الطلاب» ·
 * «طلبات الدخول» · «الطلاب» · «الدروس والمحتوى» · «الأنشطة والنتائج».
 * ومجموعها يتجاوز عرض المحتوى حين تُطوى القائمة الجانبية أو يضيق حاسوب
 * المدرسة، فيبقى خياران:
 *
 *   • **القصّ** مرفوض: «الدروس والمح…» لا تعني شيئاً، والعربية لا تُختصر
 *     بأول حرفين كما تفعل اللاتينية.
 *   • **اللفّ** يقطع الخطّ السفليّ الذي يحمل التبويب النشط، فيطفو مؤشّره في
 *     سطرٍ بلا قاعدة.
 *
 * فالصفّ يمرّر داخل نفسه. ولا حساب اتجاه هنا: `overflow-x` يتبع `dir` على
 * الوثيقة فيبدأ من اليمين، والأسهم تتبع `DirectionProvider` — وبدونه ينتقل
 * السهم الأيمن إلى ما بعدُ لا إلى ما قبل.
 */
export function Tabs({
  className,
  /*
   * **`manual` لا `automatic`.**
   *
   * كل قسم يفتح نداءً على الجسر عند تركيبه — الطلبات والطلاب والدروس
   * والأنشطة كلّها تقرأ من القاعدة. والتفعيل التلقائي يربط التركيز بالاختيار،
   * فمرورُ المعلّم بالأسهم على الصفّ يركّب ستة أقسام ويفكّكها واحداً بعد آخر
   * ويطلق نداءاتها كلّها في طريقه. فالسهم ينقل التركيز، والمسافة أو الإدخال
   * يفتح.
   */
  activationMode = 'manual',
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      activationMode={activationMode}
      className={cn('flex min-h-0 flex-col gap-4', className)}
      {...props}
    />
  );
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        // `shrink-0` مع `whitespace-nowrap`: هما ما يجعل الصفّ يمرّر بدل أن
        // يضغط العناوين على بعضها حتى تلتفّ داخل التبويب الواحد.
        'shrink-0 whitespace-nowrap px-4 py-2.5 text-t-body text-text-2',
        'border-b-2 border-transparent transition-colors duration-200 ease-motion',
        'hover:text-text',
        // الحالة النشطة بثلاثة: لون وخطّ سفليّ ووزن — فلا يحملها اللونُ وحده.
        'data-[state=active]:border-primary data-[state=active]:font-semibold',
        'data-[state=active]:text-primary-on-soft',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/**
 * اللوح — `min-h-0` مقصودة: بدونها لا ينكمش ابنٌ يمرّر داخل عمود مرن، فيدفع
 * الصفحة كلّها طولاً بدل أن يمرّر في مكانه.
 */
export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content className={cn('min-h-0 flex-1', className)} {...props} />
  );
}
