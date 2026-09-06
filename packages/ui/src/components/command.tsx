'use client';

import { Command as CommandPrimitive } from 'cmdk';
import type { ComponentProps } from 'react';
import { Icon } from '../Icon';
import { cn } from '#lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '#components/dialog';

/**
 * لوحة الأوامر — `ctrl/⌘ + K`.
 *
 * مبنيّة على `cmdk` كما في shadcn: هي التي تدير الترشيح والتنقّل بالأسهم
 * وأدوار `combobox`/`listbox` — وكتابةُ ذلك بيد تعني إعادةَ بناء قارئ شاشة
 * يعمل، لا قائمةً تُرشَّح.
 */

/**
 * التطبيع العربي قبل المطابقة.
 *
 * **وبلاه تفشل اللوحة في اللغة الوحيدة التي تعمل بها الواجهة (D1).** معلمٌ
 * يكتب «الاعدادات» لا يجد «الإعدادات»، ومن يكتب «احمد» لا يجد «أحمد»: الهمزة
 * والمدّة والتشكيل حروفٌ مختلفة عند المقارنة النصّية وإن كانت حرفاً واحداً
 * عند من يكتب. والمقارنة الحرفية تجعل البحث يبدو معطّلاً لا دقيقاً.
 *
 * فتُوحَّد صور الألف والياء والتاء المربوطة، ويُسقط التشكيل والتطويل. ولا
 * يُمسّ النصّ المعروض — التطبيع للمطابقة وحدها.
 */
function normalizeArabic(value: string): string {
  return value
    .normalize('NFKD')
    // التشكيل والتطويل: علاماتٌ لا يكتبها من يبحث، ويحملها ما يُبحث فيه.
    .replace(/[ؐ-ًؚ-ٰٟـ]/gu, '')
    .replace(/[آأإٱ]/gu, 'ا') // آ أ إ ٱ ⇦ ا
    .replace(/ى/gu, 'ي') // ى ⇦ ي
    .replace(/ة/gu, 'ه') // ة ⇦ ه
    .toLowerCase()
    .trim();
}

/**
 * الترشيح: تطابقٌ على النصّ المطبَّع، ورتبةٌ تُقدّم ما يبدأ بالمكتوب.
 *
 * `cmdk` ينتظر رقماً بين ٠ و١، و٠ تعني «أخفِ هذا الصفّ».
 */
export function commandFilter(value: string, search: string, keywords?: string[]): number {
  const needle = normalizeArabic(search);
  if (needle === '') return 1;

  const haystack = normalizeArabic([value, ...(keywords ?? [])].join(' '));
  const at = haystack.indexOf(needle);
  if (at < 0) return 0;
  // البادئة أعلى رتبةً من التضمين: من يكتب «الف» يقصد «الفصول» قبل «الملفات».
  return at === 0 ? 1 : 0.5;
}

export function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      filter={commandFilter}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-lg bg-popover text-popover-foreground',
        className,
      )}
      {...props}
    />
  );
}

export type CommandDialogProps = ComponentProps<typeof Dialog> & {
  readonly title?: string;
  readonly description?: string;
};

export function CommandDialog({
  title = 'لوحة الأوامر',
  description = 'اكتب للبحث في الشاشات والفصول، ثم اضغط Enter.',
  children,
  ...props
}: CommandDialogProps) {
  return (
    <Dialog {...props}>
      {/*
       * العنوان والوصف موجودان دائماً ومخفيّان بصرياً لا محذوفين: `Dialog` في
       * Radix يشترط اسماً مُعلناً، وبلاه يعلن قارئ الشاشة نافذةً بلا هوية —
       * وهي هنا النافذة التي يُتنقَّل بها في التطبيق كلّه.
       */}
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-t-caption [&_[cmdk-group-heading]]:text-text-muted">
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  );
}

export function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex items-center gap-2.5 border-b border-hairline px-3.5" data-slot="command-input-wrapper">
      <Icon name="search" size={18} className="shrink-0 text-text-muted" />
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          'flex h-12 w-full bg-transparent py-3 text-t-body outline-hidden',
          'placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn('max-h-80 scroll-py-1 overflow-x-hidden overflow-y-auto p-1.5', className)}
      {...props}
    />
  );
}

export function CommandEmpty(props: ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-8 text-center text-t-body text-text-muted"
      {...props}
    />
  );
}

export function CommandGroup({ className, ...props }: ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn('overflow-hidden p-0.5 text-text', className)}
      {...props}
    />
  );
}

export function CommandSeparator({ className, ...props }: ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn('-mx-1.5 my-1 h-px bg-hairline', className)}
      {...props}
    />
  );
}

export function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2',
        'text-t-body text-text-2 outline-hidden',
        // الحالة المحدَّدة: خلفية ولون معاً — لا اللون وحده يحمل المعنى.
        'data-[selected=true]:bg-primary-soft data-[selected=true]:font-semibold data-[selected=true]:text-primary-on-soft',
        'data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

/**
 * اختصارُ الأمر — يُدفع إلى آخر الصفّ.
 *
 * `ms-auto` لا `ml-auto`: الواجهة RTL، والخاصية المنطقية تضعه في الطرف
 * المقابل للنصّ أياً كان الاتجاه.
 */
export function CommandShortcut({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn('ms-auto text-t-caption tracking-widest text-text-muted', className)}
      {...props}
    />
  );
}
