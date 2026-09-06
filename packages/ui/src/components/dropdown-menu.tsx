'use client';

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, ChevronRight, Circle } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * القائمة المنسدلة — **وهي المكوّن الوحيد هنا الذي يقرأ `direction.tsx` فعلاً**.
 *
 * `@radix-ui/react-menu` تحتها يستدعي `useDirection`، فيتعلّق به سلوكان لا
 * شكلان: السهم الأفقيّ يفتح القائمة الفرعية نحو **نهاية** السطر لا يمينَه
 * دائماً، ومحاذاة اللوحة تُحسب من البداية الصحيحة. وبلا `DirectionProvider`
 * في الشجرة يعود Radix إلى `ltr` صامتاً — تبدو القائمة عربية سليمة ويفتح
 * فرعُها في الجهة الخطأ.
 *
 * (و`react-dialog` بخلافه لا يستهلك الاتجاه — فـ`dialog.tsx` و`sheet.tsx`
 * يضعان أنفسهما بالخصائص المنطقية وحدها.)
 */

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

/** `--shadow-2` هو ظلّ المنسدلة المعتمد في `05-foundations.md` §4. */
const surface = cn(
  'z-50 min-w-[180px] overflow-y-auto rounded-md border border-hairline p-1',
  'bg-popover text-popover-foreground shadow-2',
);

/**
 * صنف السطر — **بلا `outline-hidden` خلافاً لمصدر shadcn**.
 *
 * `globals.css` يفرض حلقة تركيز على كل `[tabindex]`، وسطرُ القائمة منها.
 * وshadcn يطفئها ويكتفي بالخلفية، والخلفية `primary-soft` فاتحة: من ينتقل
 * بلوحة المفاتيح يفقد أظهر ما يدلّه على موضعه. فتُترك الحلقة، وتُضاف الخلفية
 * فوقها.
 */
const item = cn(
  'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5',
  'text-t-body transition-colors duration-200 ease-motion',
  'focus:bg-accent focus:text-accent-foreground',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  /*
   * `[&>svg]` لا `[&_svg]` كما في `button.tsx` — والفرق هنا يُنتج خطأً مرئياً.
   *
   * علامتا الاختيار أدناه تسكنان داخل `span` لا في السطر مباشرة، وصنف النسل
   * `.x svg` تخصيصه (0,1,1) يعلو `.size-2` عند (0,1,0). فنقطة الاختيار
   * الواحدة كانت تُرسم بحجم ٤ لا ٢ — قرصاً مصمتاً مكان نقطة. والقصر على
   * الابن المباشر يترك لكل علامة مقاسها.
   */
  '[&>svg]:pointer-events-none [&>svg]:size-4 [&>svg]:shrink-0',
);

/** الحشوة الأمامية موضع علامة الاختيار — تُحجز حتى في السطر غير المعلَّم ليصطفّ النصّ. */
const marked = 'ps-8 pe-2';

function DropdownMenuContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          surface,
          // Radix يقيس ما بقي تحت الزرّ حتى لا تخرج قائمةٌ طويلة عن الشاشة.
          'max-h-(--radix-dropdown-menu-content-available-height)',
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuItem({
  className,
  variant = 'default',
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  /** `danger` للإجراء المدمّر وحده — كما في `button.tsx`. */
  variant?: 'default' | 'danger';
  /** يزيح السطر ليصطفّ مع أسطر تحمل علامة اختيار. */
  inset?: boolean;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        item,
        inset === true ? marked : null,
        variant === 'danger'
          ? 'text-error-text focus:bg-error-bg focus:text-error-text'
          : null,
        className,
      )}
      {...props}
    />
  );
}

/**
 * `start-2` لا `left-2`: العلامة تسبق النصّ — أي إلى يمينه في العربية.
 * وموضع العلامة مطلق فلا يزحزح النصّ بين حالتَي التعليم.
 */
function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem className={cn(item, marked, className)} {...props}>
      <span className="absolute start-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="size-4" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem className={cn(item, marked, className)} {...props}>
      <span className="absolute start-2 flex size-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="size-2 fill-current" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      className={cn('px-2 py-1.5 text-t-label text-text-muted', inset === true ? marked : null, className)}
      {...props}
    />
  );
}

/** `-mx-1` تمدّ الفاصل إلى حافّتَي اللوحة عبر حشوة `p-1` — و`mx` منطقيّ فيتناظر. */
function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn('-mx-1 my-1 h-px bg-hairline', className)}
      {...props}
    />
  );
}

/**
 * `rtl:-scale-x-100` على السهم — **قاعدة `05-foundations.md` §4**: الأيقونات
 * الاتجاهية تُعكس مع RTL. و`Icon.tsx` يفعلها لأيقونات المستودع بنفسه، أمّا
 * `lucide` فلا يعكس شيئاً: `ChevronRight` يظلّ يشير يميناً في صفحة عربية بينما
 * يفتح Radix الفرعَ يساراً — فيدلّ السهم على عكس ما يحدث.
 */
function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      className={cn(item, 'data-[state=open]:bg-accent', inset === true ? marked : null, className)}
      {...props}
    >
      {children}
      <ChevronRight className="ms-auto rtl:-scale-x-100" aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  );
}

function DropdownMenuSubContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.SubContent className={cn(surface, className)} {...props} />;
}

/**
 * الاختصار — `ms-auto` لا `ml-auto`: يُدفع إلى **نهاية** السطر، وهي يساره هنا.
 * ولا `tracking-*` معه: `globals.css` يصفّر التتبّع لأنه يفكّ اتصال الحروف
 * العربية، وسطرٌ واحد لا يستثنى من قاعدة الوثيقة.
 */
function DropdownMenuShortcut({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('ms-auto text-t-caption text-text-muted', className)} {...props} />;
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuRadioGroup,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuShortcut,
};
