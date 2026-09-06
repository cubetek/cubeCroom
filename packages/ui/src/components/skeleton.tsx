import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * صندوق انتظار — شكلُ المحتوى قبل وصوله.
 *
 * **`aria-hidden` لا خيار**: هذه صناديق فارغة تحاكي نصّاً لم يصل، ومن يسمع
 * الشاشة لا يرى المحاكاة — يسمع فراغاً أو تكراراً بلا معنى. فالانتظار يُعلَن
 * في منطقةٍ حيّة واحدة («جارٍ التحميل…») والصناديق تبقى للعين وحدها. وهي
 * قاعدة `disabledReason` في `button.tsx` نفسها: ما يُرى وحده لا يحمل المعنى
 * وحده.
 *
 * **و`motion-safe`** لأن النبض حركةٌ لا تتوقّف ما دام الانتظار: من ضبط جهازه
 * على تقليل الحركة يرى بدلها لوناً ساكناً، والصناديق تبقى في مكانها.
 *
 * ولونه `surface-2` — الرماديّ الذي يُبنى عليه سطحٌ ثانٍ في المنتج، لا
 * `accent` الذي يميل إلى الأخضر ويجعل الانتظار يبدو حالةً ناجحة.
 */
export function Skeleton({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('rounded-md bg-surface-2 motion-safe:animate-pulse', className)}
      {...rest}
    />
  );
}
