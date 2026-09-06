'use client';

import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * الجدول — **حاوية التمرير جزءٌ منه، لا وصيّةٌ على مستعمله**.
 *
 * ستة جداول في واجهة المعلّم تتقاسم هذا الشكل، وأعرضها كشف الإجابات: الطالب ·
 * وقت الإرسال · الحالة · الدرجة · إجراء. والقاعدة المقيسة أنّ الجدول يمرّر
 * **داخل إطاره** ولا يُخرج الصفحة أفقياً — صفحةٌ تمرّر أفقياً تُخفي القائمة
 * الجانبية وترحّل العمود الأول خارج الشاشة.
 *
 * ولذلك تُرسم الحاوية هنا لا في الشاشات: من يكتب الشاشة السابعة سينسى
 * `overflow-x-auto`، ولن يظهر أثر النسيان إلا على الحاسوب الضيّق الذي ليس
 * أمامه.
 *
 * والحدّ والزوايا على الحاوية لا على `<table>`: زاوية على الجدول لا تقصّ
 * صفوفه، والإطار يجب أن يبقى ثابتاً بينما يجري المحتوى تحته.
 */

export type TableProps = ComponentProps<'table'> & {
  /**
   * وصف الجدول المسموع — **إلزاميّ**.
   *
   * الحاوية منطقةُ تمرير، ومنطقةُ تمرير لا تُبلَغ بلوحة المفاتيح محتواها
   * المخفيّ حبيسٌ: لا مفتاح يصل إليه. فتأخذ `tabindex` لتُبلَغ، وعنصرٌ يأخذ
   * التركيز بلا اسم يُنطق «منطقة» ولا شيء بعدها.
   *
   * ولا يكفي أن يتكفّل المتصفّح بذلك: كروم يجعل حاويات التمرير قابلة للتركيز
   * **ما لم تحتوِ عنصراً قابلاً للتركيز**، وكل صفّ في كشف الإجابات فيه زرّ.
   */
  readonly label: string;
  /** أصناف حاوية التمرير — و`className` تبقى للجدول نفسه. */
  readonly containerClassName?: string | undefined;
};

export function Table({ label, className, containerClassName, ...props }: TableProps) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className={cn(
        'w-full overflow-x-auto rounded-lg border border-border bg-surface',
        containerClassName,
      )}
    >
      <table
        className={cn('w-full border-collapse text-start text-t-label', className)}
        {...props}
      />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<'thead'>) {
  return <thead className={cn('bg-canvas', className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<'tbody'>) {
  return (
    <tbody
      className={cn(
        // آخر صفّ بلا خطّ: الحدّ تحته يزدوج مع حدّ الحاوية فيبدو ثقيلاً.
        '[&_tr:last-child]:border-b-0',
        /*
         * التظليل عند المرور — تتبُّع صفٍّ عبر خمسة أعمدة. والقيمة `surface-2`
         * هي رمز «صفوف الجدول البديلة» في المصدر، فلا لون جديد هنا، ولا يتغيّر
         * لون النصّ فوقه فيبقى التباين كما قيس.
         */
        '[&_tr:hover]:bg-surface-2',
        className,
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: ComponentProps<'tr'>) {
  return <tr className={cn('border-b border-border', className)} {...props} />;
}

/**
 * خلية الترويسة — `text-start` لا `text-left`: الجدول يُقرأ من اليمين.
 *
 * و`whitespace-nowrap` على الترويسة وحدها: «وقت الإرسال» في سطرين ترفع كل صفّ
 * في الجدول، وهي أقصر ما فيه.
 */
export function TableHead({ className, ...props }: ComponentProps<'th'>) {
  return (
    <th
      className={cn(
        'h-(--height-control) px-4 text-start align-middle',
        'font-semibold whitespace-nowrap text-text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<'td'>) {
  return <td className={cn('px-4 py-3 align-middle', className)} {...props} />;
}
