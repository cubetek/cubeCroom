'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * التلميح — **زيادةٌ لا حاملُ معنى**.
 *
 * لا يظهر إلا بمرور المؤشّر أو بالتركيز: فمن يعمل باللمس لا يراه أبداً، ومن
 * يقرأ الشاشة يصله عبر `aria-describedby` **بعد** اسم العنصر لا بدلاً منه.
 * فما لا يُفهم العنصر بدونه يُكتب على الشاشة — كما يفعل `disabledReason` في
 * `button.tsx` حين لم يكفِ التعطيل وحده.
 *
 * وهو موضع «ما هذا الاختصار» و«ما القيمة الكاملة لهذا المختصَر»، لا موضع
 * تعليماتٍ لا تُوجد في مكان آخر.
 */

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipTrigger = TooltipPrimitive.Trigger;
const TooltipPortal = TooltipPrimitive.Portal;

/**
 * المزوّد ملفوفٌ هنا لا مُوصى به في الجذر: Radix **يرمي** إن لم يجده، فتصير
 * إضافةُ تلميحٍ واحد في شاشة عطلاً في زمن التشغيل. ومن أراد تأخيراً موحّداً
 * يضع `TooltipProvider` أعلى شجرته — وتداخل المزوّدين مسموح، والأقرب يفوز.
 */
function Tooltip({ children, ...props }: ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
    </TooltipProvider>
  );
}

/**
 * حبرٌ داكن وحرفٌ أبيض — لا `bg-primary` كما في مصدر shadcn.
 *
 * الأخضر المائي دورٌ محجوز للإجراء الأساسي («Action أساسي واحد في كل سياق»)،
 * وتلميحٌ بلونه يقول للعين إن ثمّ شيئاً يُنقر. و`--color-text` فوق
 * `--color-surface` هو الزوج المقيس نفسه عند 17.85:1، ونسبة WCAG لا تتغيّر
 * بعكس طرفيها.
 *
 * وموضع اللوحة يتكفّل به `floating-ui` تحت Radix: يقرأ `direction` المحسوب من
 * الوثيقة، فـ`align="start"` تعني بداية السطر — أي اليمين هنا — بلا تدخّل.
 */
function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPortal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 max-w-[280px] rounded-sm bg-text px-3 py-2 text-t-caption text-surface shadow-2',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-text" />
      </TooltipPrimitive.Content>
    </TooltipPortal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, TooltipPortal };
