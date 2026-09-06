'use client';

import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * الفاصل — خطُّ شعرة، أفقيّ أو رأسيّ.
 *
 * **ولونه `hairline` عن قصد**: `globals.css` يفصل بين رمزين متقاربين — حدُّ
 * التفاعل `border-input` يبلغ 3:1 لأنه يرسم حدود الحقول، والشعرة أفتح منه
 * لأنها زخرفة. والفاصل زخرفة بحكم `decorative` أدناه، فلا يقع تحت ذلك الحدّ.
 *
 * **و`decorative` افتراضُه `true`** لا مصادفةً: خطٌّ يفصل مجموعتين متجاورتين
 * لا يضيف معنى يُقرأ، وRadix حينها يخفيه عن شجرة الوصول بدل أن يعلن
 * `role="separator"` بين كل قسمين. ومن يفصل به معنىً حقيقياً — بين مجموعتَي
 * أوامر في قائمة مثلاً — يمرّر `decorative={false}` فيُعلَن.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...rest
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-hairline',
        'data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full',
        /*
         * `self-stretch` لا `h-full` للرأسيّ. الفاصل الرأسي في الشريط العلوي
         * يقف بين عنصرين في صفّ مرن بلا ارتفاع محدَّد، و`h-full` تُحسب على
         * ارتفاعٍ لا يعرفه الأب فتنهار إلى صفر. أما `align-self: stretch`
         * فتمدّه إلى ارتفاع الصفّ نفسه — وهو المطلوب.
         */
        'data-[orientation=vertical]:w-px data-[orientation=vertical]:self-stretch',
        className,
      )}
      {...rest}
    />
  );
}
