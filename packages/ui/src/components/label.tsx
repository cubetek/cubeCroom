'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * عنوان الحقل.
 *
 * **مبنيّ على Radix لا على `<label>` عارية** لسببٍ واحد: النقر المزدوج.
 * حين يلفّ العنوانُ مربّعَ اختيار — كإقرار الحذف في T21 وT24 — يقع النقران
 * المتتاليان على نصٍّ طويل، فيظلّل المتصفّح الجملة كلّها بدل أن يقلب المربّع
 * مرّتين. وRadix يمنع ذلك ويترك النقر على العنصر نفسه على حاله.
 */
export type LabelProps = ComponentProps<typeof LabelPrimitive.Root>;

export function Label({ className, ...rest }: LabelProps) {
  return (
    <LabelPrimitive.Root
      className={cn(
        /*
         * `flex` لا `block`: العنوان يقف أحياناً في صفٍّ مع مربّع الاختيار أو
         * زرّ الاختيار، و`gap-2` هي المسافة بين العنصر واسمه في كلتا الحالتين.
         */
        'flex items-center gap-2 text-t-label',
        /*
         * `text-text-2` لا `text-text`: العنوان يصف الحقل ولا ينافسه في
         * الثقل، و10.35:1 فوق كلّ حدّ مطلوب.
         */
        'text-text-2',
        className,
      )}
      {...rest}
    />
  );
}
