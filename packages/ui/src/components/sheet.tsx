'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogTitle,
} from '#components/dialog';
import { cn } from '#lib/utils';

/**
 * اللوح الجانبي — حوارٌ ملتصق بحافة، على `@radix-ui/react-dialog` نفسه.
 *
 * وهو **الحوار نفسه لا قريبه**: حبس التركيز و`Escape` وردّ التركيز وإخفاء ما
 * خلفه عن قارئ الشاشة كلّها من `dialog.tsx` — انظر تعليقه، فما فُحص هناك يسري
 * هنا حرفياً. والمختلف الموضعُ وحده.
 *
 * ولهذا تُستورد الطبقة والرأس والتذييل والعنوان من `dialog.tsx` بدل أن تُكتب
 * مرة ثانية: طبقتان مظلمتان بقيمتين تفترقان أوّلَ تعديل، ولا يلاحظ أحد.
 */

/**
 * **من أيّ جهة؟ من `end` — وهي اليسار في العربية.**
 *
 * `09-sprint-ux-3.md:48` يقول: «الدرج يفتح من حافة المحتوى المقابلة للـ
 * Sidebar (يسار في RTL) فلا يزاحم التنقّل». والشريط الجانبي في صفحة عربية عند
 * **بداية** السطر (يميناً)، فالحافة المقابلة له هي **نهايته** — أي `end`.
 * و`AiDrawer.module.css` قائمٌ على هذا اليوم: `inset-inline-end: var(--sp-6)`.
 *
 * فمن قرأ «يسار» فكتب `start` عكَس اللوح إلى فوق الشريط الجانبي: في RTL
 * `start` هو اليمين. والصفة `side` هنا منطقية لا فيزيائية، والتسمية وحدها
 * كافية للخلط ما لم تُقرأ الجهة من `dir` لا من العادة اللاتينية.
 *
 * **وRadix لا يعينك هنا:** `react-dialog` — بخلاف `react-menu` — لا يستهلك
 * `useDirection` أصلاً (مفحوص في مصدر الحزمة). فلا أثر لـ`direction.tsx` على
 * موضع اللوح: الخصائص المنطقية أدناه هي كلّ ما يعكسه.
 *
 * و`420px` عرض ألواح الدرج المعتمد في `09-sprint-ux-3.md:26`.
 */
const sheetVariants = cva(
  cn(
    'fixed inset-y-0 z-50 flex w-full max-w-[420px] flex-col gap-3 overflow-y-auto',
    'bg-surface p-5 text-text shadow-3',
  ),
  {
    variants: {
      side: {
        // الحدّ على الجهة التي تواجه المحتوى، لا على الحافة الملتصقة بالشاشة.
        start: 'start-0 border-e',
        end: 'end-0 border-s',
      },
    },
    defaultVariants: { side: 'end' },
  },
);

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetPortal = SheetPrimitive.Portal;
const SheetClose = SheetPrimitive.Close;

type SheetContentProps = ComponentProps<typeof SheetPrimitive.Content> &
  VariantProps<typeof sheetVariants>;

function SheetContent({ className, children, side, ...props }: SheetContentProps) {
  return (
    <SheetPortal>
      <DialogOverlay />
      <SheetPrimitive.Content className={cn(sheetVariants({ side }), className)} {...props}>
        {children}
        {/* الهدف مربّع `--height-control-sm` لا حجمُ الأيقونة — التفصيل في `dialog.tsx`. */}
        <SheetPrimitive.Close
          className="absolute end-3 top-3 flex size-(--height-control-sm) items-center justify-center rounded-sm text-text-muted transition-colors duration-200 ease-motion hover:text-text"
          aria-label="إغلاق اللوحة"
        >
          <X className="size-[18px]" aria-hidden />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
}

export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetClose,
  SheetContent,
  DialogHeader as SheetHeader,
  DialogTitle as SheetTitle,
  DialogDescription as SheetDescription,
  DialogFooter as SheetFooter,
  sheetVariants,
};
