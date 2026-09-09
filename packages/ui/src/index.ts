/**
 * واجهة الحزمة الوحيدة — `import { … } from '@cubecroom/ui'`.
 *
 * والشاشات لا تستورد من `#components/*` مباشرةً: مسارُ الملفّ يصير حينها
 * عقداً عاماً، فلا يُنقل مكوّن ولا يُدمج ملفّان إلا بتعديل كلّ مستدعٍ. وهذا
 * الملفّ هو ما يفصل الاسم عن موضعه.
 *
 * **وما اختفى منه عن قصد**: `Modal` و`Toggle` — كانا مكوّنَي CSS Modules،
 * وبديلاهما هنا `Dialog` (بعائلته) و`Switch`. و`Switch` يحفظ عقد `Toggle`
 * حرفياً (`checked` · `onChange` · `label`)، فالترحيل إليه تبديلُ اسم؛ أمّا
 * `Dialog` فبنيةٌ مركّبة تُقرأ من `dialog.tsx`. وبقي `Button` و`Badge`
 * باسميهما لأنّ ثلاثين شاشة تستوردهما اليوم.
 */

/* ————— الأساسات: لم تُهاجَر بعد، وتُستعمل كما هي ————— */
export { Icon } from './Icon';
export type { IconName } from './Icon';
export { BrandMark, BrandLogo } from '#components/brand';
export type { BrandMarkProps, BrandLogoProps } from '#components/brand';
export { ar, toLatinDigits, formatBytes } from './numerals';
export { StudentActivityView } from './StudentActivityView';
export type { StudentActivityViewProps } from './StudentActivityView';

/*
 * مزوّد الاتجاه — **يُركَّب في جذر كلّ تطبيق**، لا في شاشة.
 * `dir="rtl"` على `<html>` لا يبلغ Radix؛ وبدونه تفتح القوائم الفرعية في
 * الجهة المعاكسة وتسير الأسهم إلى الخلف. انظر `direction.tsx`.
 */
export { DirectionProvider } from '#components/direction';

/* ————— الفعل ————— */
export { Button } from '#components/button';
/*
 * `buttonVariants` من `#lib/` لا من `#components/button`: ذاك الملفّ
 * `'use client'`، وإعادة التصدير عبره تُبقي الدالّة خلف حدّ العميل فيسقط
 * كلّ مكوّن خادم يستدعيها. والتفصيل في رأس الوحدة نفسها.
 */
export { buttonVariants } from '#lib/button-variants';
export type { ButtonVariantProps } from '#lib/button-variants';
export type { ButtonProps } from '#components/button';

/* ————— الإدخال ————— */
export { Input, inputVariants } from '#components/input';
export type { InputProps } from '#components/input';
export { Textarea } from '#components/textarea';
export type { TextareaProps } from '#components/textarea';
export { Label } from '#components/label';
export type { LabelProps } from '#components/label';
export { Checkbox } from '#components/checkbox';
export type { CheckboxProps } from '#components/checkbox';
export { RadioGroup, RadioGroupItem } from '#components/radio-group';
export type { RadioGroupProps, RadioGroupItemProps } from '#components/radio-group';
export { Switch } from '#components/switch';
export type { SwitchProps } from '#components/switch';
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
} from '#components/select';
export type {
  SelectTriggerProps,
  SelectContentProps,
  SelectItemProps,
  SelectLabelProps,
  SelectSeparatorProps,
  SelectScrollButtonProps,
} from '#components/select';

/* ————— الأسطح والعرض ————— */
export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '#components/card';
export { Badge, badgeVariants } from '#components/badge';
export type { BadgeTone, BadgeProps } from '#components/badge';
export { Alert, alertVariants } from '#components/alert';
export type { AlertTone, AlertProps } from '#components/alert';
export { Separator } from '#components/separator';
export { Skeleton } from '#components/skeleton';
export { Progress } from '#components/progress';
export type { ProgressProps } from '#components/progress';

/* ————— التنقّل والجداول ————— */
export { Tabs, TabsList, TabsTrigger, TabsContent } from '#components/tabs';
export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '#components/table';
export type { TableProps } from '#components/table';
export { ScrollArea, ScrollBar } from '#components/scroll-area';

/* ————— الطبقات العائمة ————— */
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
} from '#components/dialog';
export {
  Sheet,
  SheetTrigger,
  SheetPortal,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  sheetVariants,
} from '#components/sheet';
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
} from '#components/dropdown-menu';
export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
  TooltipPortal,
} from '#components/tooltip';

/* ————— السمة ————— */
/*
 * `THEME_SCRIPT` يُحقن في `<head>` قبل أول رسم — انظر رأس `theme.tsx`.
 * ويُصدَّر نصّاً لا مكوّناً: من يحقنه هو تخطيط التطبيق، وهو الوحيد الذي يعرف
 * أين يوضع.
 */
export { ThemeProvider, useTheme, THEME_SCRIPT } from '#components/theme';
export type { Theme } from '#components/theme';

/* ————— لوحة الأوامر ————— */
export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
  commandFilter,
} from '#components/command';
export type { CommandDialogProps } from '#components/command';

/* ————— الدمج ————— */
export { cn } from '#lib/utils';
export { LegalNotice } from '#components/legal-notice';
export { LearningInteraction } from './LearningInteraction';
