'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '#lib/utils';

/**
 * مفتاح تشغيل — كما في T22 و T19 و T08، وعقده هو عقد `Toggle` قبله.
 *
 * `checked` و`onChange` و`label` كما كانت: المفتاح مضبوطٌ من خارجه دائماً،
 * لأنّ كل استعمالٍ في الواجهة يكتب على الجسر ثم يردّ الحالة إن فشل النداء
 * (`.catch(() => setStudentAi(!next))`). ومفتاحٌ يحفظ حالته داخله يبقى مفتوحاً
 * بعد كتابةٍ لم تنجح.
 *
 * وموضع القرص هو ما يحمل الحالة لا لونُ المسار وحده: من لا يميّز الألوان يرى
 * الفرق. و`justify-start` / `justify-end` تتبعان اتجاه الكتابة، فيقف القرص
 * يميناً عند الإطفاء ويساراً عند التشغيل بلا حساب اتجاه — بخلاف `translate-x`
 * الذي يزحف إلى الجهة الخطأ في RTL.
 */

export type SwitchProps = {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  /** وصف مسموع حين لا يكفي النصّ المجاور. */
  readonly label: string;
  readonly disabled?: boolean | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
};

export function Switch({ checked, onChange, label, disabled = false, id, className }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'inline-flex h-6.5 w-11 shrink-0 items-center justify-start rounded-full p-0.5',
        'transition-colors duration-200 ease-motion',
        /*
         * **المسار المطفأ `border-input` لا `#cbd5e1` الذي كان.**
         *
         * القرص الأبيض على `#cbd5e1` يعطي 1.45:1، ومثلها المسارُ على السطح —
         * دون 3:1 التي تطلبها WCAG 1.4.11 لتمييز عنصر التفاعل عمّا حوله. فكان
         * المفتاح المطفأ يكاد يختفي على شاشة عاكسة أو لعينٍ ضعيفة، وهو نصف
         * حالاته. و`border-input` هو الرمز المقيس لهذا الحدّ (3.43:1).
         */
        'bg-border-input data-[state=checked]:justify-end data-[state=checked]:bg-primary',
        'disabled:cursor-not-allowed disabled:opacity-55',
        className,
      )}
    >
      <SwitchPrimitive.Thumb className="size-5 rounded-full bg-surface shadow-1" />
    </SwitchPrimitive.Root>
  );
}
