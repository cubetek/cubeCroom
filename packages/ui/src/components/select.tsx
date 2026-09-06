'use client';

import * as SelectPrimitive from '@radix-ui/react-select';
import type { VariantProps } from 'class-variance-authority';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import type { ComponentProps } from 'react';
import { inputVariants } from '#components/input';
import { cn } from '#lib/utils';

/**
 * قائمة اختيار — على Radix لا على `<select>` الأصليّ.
 *
 * الأصليّ يرسمه نظام التشغيل: لا تُنسَّق قائمته، ولا يقبل حدّاً بلون
 * `--color-input`، ولا يعرض علامة على المختار داخل القائمة. وفي Electron
 * يخرج بشكل ويندوز اللاتينيّ داخل واجهةٍ عربية.
 *
 * **وفُحص عمله بلوحة المفاتيح عربياً في مصدر Radix لا بالتشغيل** (لا متصفّح
 * في بيئة هذه المهمّة): البحثُ بالكتابة يُلقَّم كلّ ضغطةٍ طولها محرفٌ واحد
 * (`event.key.length === 1` — وحروف العربية كذلك في UTF‑16)، ثم يطابق
 * `textValue.toLowerCase().startsWith(...)` — مطابقةٌ لا تفترض لغة، و
 * `toLowerCase` على العربية لا يغيّر شيئاً. والأسهم رأسية فلا تتأثّر بالاتجاه،
 * ومحاذاةُ القائمة تأتي من `DirectionProvider` في `direction.tsx`.
 *
 * ⚠ **ولا تمرّر `value=""` إلى `SelectItem`.** السلسلة الفارغة محجوزة عند
 * Radix لحالة «لا قيمة» (`shouldShowPlaceholder`)، فبندٌ قيمته `""` — مثل
 * «بلا درس مرتبط» في T13 — يُختار ثم تعود القائمة إلى النائب كأنّ شيئاً لم
 * يقع، بلا خطأ في الطرفية. استعمل قيمةً صريحة (`'none'`) وترجمها عند الحفظ.
 */
const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

export type SelectTriggerProps = ComponentProps<typeof SelectPrimitive.Trigger> &
  VariantProps<typeof inputVariants>;

export function SelectTrigger({ className, size, children, ...rest }: SelectTriggerProps) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        // صندوق الحقل نفسه — مصدرٌ واحد، فلا يفترق حدُّ القائمة عن حدّ الحقل بجانبها.
        inputVariants({ size }),
        /*
         * `text-start` هنا وحدها دون سائر الحقول: هذا `<button>` لا `<input>`،
         * ونصّ الزرّ يتوسّط افتراضياً.
         */
        'flex items-center justify-between gap-2 text-start',
        // النائب يُعرض بدرجة التلميح — لأنّه ليس قيمةً اختارها أحد.
        'data-[placeholder]:text-text-muted',
        '[&_svg]:pointer-events-none [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-text-muted',
        className,
      )}
      {...rest}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        {/*
          لا `rtl:-scale-x-100` على هذا السهم. قاعدة العكس في `05-foundations.md`
          §4 تخصّ الأيقونات التي تحمل جهةً **أفقية** (chevron-next/prev)، وسهمٌ
          إلى أسفل لا جهة له تنعكس — وعكسه يقلبه بلا أثرٍ سوى إرباك من يقرأ الصنف.
        */}
        <ChevronDown aria-hidden />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export type SelectContentProps = ComponentProps<typeof SelectPrimitive.Content>;

export function SelectContent({
  className,
  children,
  position = 'popper',
  sideOffset = 4,
  ...rest
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position={position}
        sideOffset={sideOffset}
        className={cn(
          /*
           * `text-popover-foreground` مع `bg-popover` لا بعده: القاعدة في
           * `input.tsx` أنّ الخلفية والنصّ يُكتبان معاً. و`SelectLabel` أدناه
           * لا يعلن لوناً، فكان يرث حبر `<body>` — يصحّ اليوم بالمصادفة وحدها
           * لأنّ `--color-popover-foreground` و`--color-foreground` متساويان،
           * ويسقط أوّلَ يوم يفترقان. (و`dropdown-menu.tsx` يعلنهما معاً.)
           */
          'relative z-50 overflow-hidden rounded-md border border-hairline',
          'bg-popover text-popover-foreground shadow-2',
          /*
           * السقفان من متغيّري Radix لا من رقم: الارتفاع يتبع ما بقي من الشاشة
           * تحت الزرّ، والعرض الأدنى يتبع عرض الزرّ — فلا تخرج قائمةُ الدروس
           * الطويلة عن النافذة ولا تضيق عن النصّ الذي فُتحت من أجله.
           */
          'max-h-(--radix-select-content-available-height)',
          'min-w-(--radix-select-trigger-width)',
          className,
        )}
        {...rest}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export type SelectItemProps = ComponentProps<typeof SelectPrimitive.Item>;

export function SelectItem({ className, children, ...rest }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      className={cn(
        // `pe-8` تفرغ مكان علامة الاختيار في طرف النهاية — اليسار في العربية.
        'relative flex w-full cursor-default items-center rounded-sm py-2 ps-2 pe-8',
        // اللون مُعلَن: القائمة تُنقل إلى `<body>` عبر بوّابة، ووراثتُها لا تتبع موضعها في الشجرة.
        'text-t-body text-text select-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
        /*
         * البند المعطَّل يخفت إلى `text-muted` (4.76:1) لا إلى شفافية 50%:
         * الشفافية تنزل بالنصّ إلى 2.34:1 — وهي النسبة نفسها المشروحة في
         * `button.tsx`. وتعطيلُه يُعرف من غياب التظليل عند المرور لا من اللون.
         */
        'data-[disabled]:pointer-events-none data-[disabled]:text-text-muted',
        className,
      )}
      {...rest}
    >
      <span className="absolute end-2 flex size-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export type SelectLabelProps = ComponentProps<typeof SelectPrimitive.Label>;

export function SelectLabel({ className, ...rest }: SelectLabelProps) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2 py-1.5 text-t-caption font-semibold', className)}
      {...rest}
    />
  );
}

export type SelectSeparatorProps = ComponentProps<typeof SelectPrimitive.Separator>;

export function SelectSeparator({ className, ...rest }: SelectSeparatorProps) {
  return (
    <SelectPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-hairline', className)} {...rest} />
  );
}

export type SelectScrollButtonProps = ComponentProps<typeof SelectPrimitive.ScrollUpButton>;

/**
 * زرّا التمرير: Radix يخفيهما ما لم تفض القائمة عن سقفها. وبلاهما تُمرَّر
 * القائمة الطويلة بالعجلة وحدها — ومن لا فأرة له لا يرى أنّ تحتها بقيّة.
 */
export function SelectScrollUpButton({ className, ...rest }: SelectScrollButtonProps) {
  return (
    <SelectPrimitive.ScrollUpButton
      className={cn('flex cursor-default items-center justify-center py-1 text-text-muted', className)}
      {...rest}
    >
      <ChevronUp className="size-4" aria-hidden />
    </SelectPrimitive.ScrollUpButton>
  );
}

export function SelectScrollDownButton({ className, ...rest }: SelectScrollButtonProps) {
  return (
    <SelectPrimitive.ScrollDownButton
      className={cn('flex cursor-default items-center justify-center py-1 text-text-muted', className)}
      {...rest}
    >
      <ChevronDown className="size-4" aria-hidden />
    </SelectPrimitive.ScrollDownButton>
  );
}

export { Select, SelectGroup, SelectValue };
