'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * الحوار المُشكِّل — **بديل `Modal.tsx`، والثلاثة التي احتجّ بها مفحوصة**.
 *
 * `Modal.tsx` بُني على `<dialog>` الأصلي مع `showModal()`، وحجّته أن المتصفّح
 * يعطي ثلاثة أشياء بلا شيفرة. وقد فُحص مصدر `@radix-ui/react-dialog` فوُجدت
 * كلّها:
 *
 *   • حبس التركيز — `FocusScope` بـ`trapped`.
 *   • `Escape` يُغلق — `DismissableLayer` وحدثه `onEscapeKeyDown`.
 *   • ردّ التركيز إلى ما فتح الحوار — `onUnmountAutoFocus` في `FocusScope`.
 *
 * ويزيد `hideOthers`: بقيّة الوثيقة تصير `aria-hidden` فلا يجول فيها قارئ
 * الشاشة — وهو ما كان `showModal()` يفعله بالخمول (inert).
 *
 * **والمفقود واحد وحقيقي: الطبقة العليا.** `showModal()` يرفع الحوار خارج
 * ترتيب الطبقات كلّه فلا `z-index` في الصفحة يعلوه مهما بلغ. وRadix يرسم في
 * بوّابة داخل `<body>`، فالترتيب صار مسؤوليّتنا: `z-50` أدناه، وأيّ عنصر في
 * الواجهة يتجاوزها سيظهر **فوق** الحوار.
 *
 * **ومكسبٌ مقابله:** البوّابة داخل `<body>` ترث `dir="rtl"` من الوثيقة، فسقط
 * `direction: rtl` الذي كان `Modal.module.css` مضطرّاً إلى إعادة إعلانه لأن
 * الطبقة العليا تخرج من شجرة الصفحة أصلاً.
 *
 * وعنوانٌ مفقود ليس تفصيلاً: Radix يشترط `DialogTitle` — وبدونه يخرج حوارٌ
 * بلا اسم عند قارئ الشاشة، ويُحذّر في التطوير. وأخفِه بـ`sr-only` إن لم ترده
 * مرئياً، ولا تحذفه.
 */

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

/**
 * الطبقة المظلمة — `text/45` لا رماديّ يُختار الآن.
 *
 * `--color-text` هو `#0f172a`، وهو نفسه `rgb(15 23 42)` الذي كان في
 * `Modal.module.css`. فالنسبة وحدها هي الجديد، واللون يبقى مربوطاً بالرمز:
 * يوم يتغيّر حبر المنتج تتبعه طبقته.
 */
function DialogOverlay({ className, ...props }: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay className={cn('fixed inset-0 z-50 bg-text/45', className)} {...props} />
  );
}

/**
 * التوسيط بـ`inset-4` و`m-auto` — **لا `translate`**.
 *
 * الطريقة الشائعة `start-1/2` مع `translate-x-[-50%]`، و`translate` فيزيائي
 * لا منطقي: يبقى «يساراً» في صفحة عربية فينزاح الحوار عن مركزه. أمّا
 * `inset-4` مع هامشٍ تلقائي فيوسّط على المحورين بلا معرفة الاتجاه، ويترك
 * ١٦px حول الحوار على الشاشات الضيّقة بلا قاعدة ثانية.
 *
 * و`h-fit` بين `top` و`bottom` محدَّدين يقصّ الارتفاع عند المتاح وحده، فيتكفّل
 * `overflow-y-auto` بحوارٍ أطول من الشاشة.
 *
 * و`520px` منقولة عن `Modal.module.css` كما كانت — لا رمز لعرض الحوار في
 * `globals.css`، ولا يُخترع رمزٌ من ملفّ مكوّن.
 */
function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-4 z-50 m-auto flex h-fit max-w-[520px] flex-col gap-3 overflow-y-auto',
          'rounded-lg border border-hairline bg-surface p-5 text-text shadow-3',
          className,
        )}
        {...props}
      >
        {children}
        {/*
         * `end-5` لا `right-5`: الزاوية العليا **بعد** العنوان — أي اليسرى في
         * العربية — وهي حيث تقصدها اليد.
         *
         * **والهدف مربّعٌ مقيس لا حجمُ الرسم.** زرٌّ يلتفّ حول أيقونة ١٨px بلا
         * حشو يصير هدفاً ١٨×١٨ — دون ٢٤×٢٤ التي تفرضها WCAG 2.2 (2.5.8)، وهو
         * أوّل ما تقصده اليد في الحوار. و`alert.tsx` وسّع زرّ إخفائه بـ`p-1`
         * ولم يصل هذا الزرّ التوسيعُ نفسه.
         *
         * و`--height-control-sm` هو المقاس المحجوز أصلاً: `pe-8` في
         * `DialogHeader` أدناه تفرغ ٣٢px لهذا الزرّ تحديداً، فيملأ الهدفُ
         * حجزَه بلا أن يزحف تحت العنوان. ولا `--height-control`: تصير ٤٤px عند
         * الطالب فتتجاوز الحجز ويُغلق الحوار بضغطةٍ على آخر السطر.
         *
         * والإزاحة `3` لا `5` تُبقي الأيقونة حيث كانت بعد أن كبر ما حولها.
         */}
        <DialogPrimitive.Close
          className="absolute end-3 top-3 flex size-(--height-control-sm) items-center justify-center rounded-sm text-text-muted transition-colors duration-200 ease-motion hover:text-text"
          aria-label="إغلاق"
        >
          <X className="size-[18px]" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

/** `pe-8` تُبقي العنوان بعيداً عن زرّ الإغلاق فلا يمرّ نصٌّ طويل تحته. */
function DialogHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1 pe-8', className)} {...props} />;
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('text-t-h3 font-bold', className)} {...props} />;
}

/**
 * الوصف يُربط بـ`aria-describedby` تلقائياً — فما يُكتب هنا يُقرأ عند فتح
 * الحوار بعد عنوانه مباشرة. وهو موضع «ماذا سيحدث» لا موضع تفصيلٍ طويل.
 */
function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn('text-t-label text-text-2', className)}
      {...props}
    />
  );
}

/**
 * **`justify-end` هنا، فتسقط حشوةُ `.grow` من الشاشات.**
 *
 * حواراتُ المعلّم اليوم تدفع أزرارها بـ`<div className={styles.grow} />` أوّلَ
 * التذييل — لأن التذييل القديم كان `flex` بلا محاذاة. ومن أراد عنصراً في
 * البداية (تحذيرٌ أو إقرار) يضع عليه `me-auto` بدل عنصرٍ فارغ.
 */
function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-center justify-end gap-2 pt-2', className)} {...props} />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
};
