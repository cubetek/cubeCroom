'use client';

import { Slot } from '@radix-ui/react-slot';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '#lib/utils';
import { buttonVariants, type ButtonVariantProps } from '#lib/button-variants';

/**
 * الزرّ — **تسلسل من خمس درجات، وواحدة أساسية في كل سياق**.
 *
 * القاعدة من `05-foundations.md`: «Action أساسي واحد في كل سياق». و`danger`
 * للإجراء المدمّر وحده، و`ai` لما يستدعي نموذجاً — فيعرف المعلّم قبل النقر
 * أنّ ما بعده يخرج إلى مزوّد.
 *
 * وسلّم الأصناف نفسه في `#lib/button-variants` لا هنا: مكوّنات الخادم تستدعيه،
 * وهذا الملفّ `'use client'` — والسبب مشروح هناك.
 */

type BaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> &
  ButtonVariantProps & {
    icon?: ReactNode;
    /** يرسم الزرّ على ابنه — لرابطٍ يبدو زرّاً بلا `<button>` داخل `<a>`. */
    asChild?: boolean;
    className?: string;
  };

/**
 * **`disabledReason` إلزاميّ مع `disabled` — بحكم النوع لا بحكم المراجعة.**
 *
 * تباين الزرّ المعطَّل 2.34:1، وهو دون كل حدّ مقروء. فلا يجوز أن يحمل
 * التعطيلُ وحده المعنى: من لا يميّز الرماديّ يرى زرّاً لا يستجيب ولا يعرف
 * لماذا. والسبب يُعرض نصّاً بجانبه.
 *
 * والاتّحاد المُميَّز أدناه يجعل نسيانه **خطأ ترجمة** لا ملاحظةَ مراجع.
 */
export type ButtonProps =
  | (BaseProps & { disabled?: false | undefined; disabledReason?: never })
  | (BaseProps & { disabled: true; disabledReason: string });

export function Button({
  variant,
  size,
  icon,
  children,
  disabled,
  disabledReason,
  asChild = false,
  className,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';

  const button = (
    <Comp
      type={asChild ? undefined : 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled}
      {...rest}
    >
      {icon}
      {children ? <span>{children}</span> : null}
    </Comp>
  );

  if (!disabled) return button;

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {button}
      <span className="text-t-caption text-text-muted">{disabledReason}</span>
    </span>
  );
}
