import type { ComponentProps } from 'react';
import { cn } from '#lib/utils';

/**
 * البطاقة — **السطح الذي تقف عليه كل شاشة تقريباً**.
 *
 * صنف `.card` يتكرّر في `Classes` و`Dashboard` و`Backup` وغيرها بالقيم نفسها:
 * سطحٌ أبيض، وحدٌّ شعريّ، وزاوية `--radius-lg`. وثلاثتها هنا مرة واحدة.
 *
 * والظلّ `shadow-1` **ساكن لا مرفوع**: الرتبة الثانية (`shadow-2`) للقوائم
 * المنسدلة وما يطفو فوق الصفحة، والثالثة للأدراج والحوارات. فبطاقةٌ ترتدي
 * `shadow-2` تدّعي أنها فوق الصفحة لا فيها، ويضيع الفرق حين يحتاجه المنسدل.
 *
 * والحدّ `hairline` لا `border-input`: الفرق مقيس في `globals.css` — الثاني
 * وحده يبلغ 3:1 المطلوبة لعناصر التفاعل، والبطاقة ليست عنصر تفاعل.
 */
export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-lg border border-hairline bg-surface py-5 text-text shadow-1',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * **الحشو رأسيّاً على البطاقة وأفقيّاً على الأقسام** — والتقسيم مقصود.
 *
 * لوحة الطلبات في `Dashboard` صفوفٌ يمتدّ فاصل كلٍّ منها من حافة البطاقة إلى
 * حافتها. ولو كان الحشو الأفقي على الحاوية لاستحال ذلك إلا بحشوٍ سالب. فمن
 * أراد صفّاً ممتدّاً يضعه خارج `CardContent`، ومن أراد المعتاد يضعه داخله.
 *
 * والشبكة هنا — لا صفّ مرن — لتقف `CardAction` بجانب العنوان **ووصفِه معاً**
 * بدل أن تُحاذي أحدهما. وأعمدة CSS Grid منطقية أصلاً: العمود الأول هو الأيمن
 * في RTL، و`justify-self-end` تعني الحافة اليسرى. فهذا من قليل ما يُنقل عن
 * shadcn بلا تعديل — وقد رُوجع لا نُقل.
 */
export function CardHeader({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'grid auto-rows-min items-start gap-1 px-5',
        'has-data-[slot=card-action]:grid-cols-[1fr_auto]',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * `<div>` لا `<h3>`: رتبة العنوان تتبع موضع البطاقة في الصفحة لا نوعَ
 * المكوّن — وبطاقةٌ تفرض `<h3>` على نفسها تكسر تسلسل العناوين حين تُستعمل
 * تحت `<h1>` مباشرة. فمن أراد عنواناً في شجرة الوثيقة يلفّ نصّه بالرتبة
 * الصحيحة داخل هذا العنصر.
 */
export function CardTitle({ className, ...rest }: ComponentProps<'div'>) {
  return <div data-slot="card-title" className={cn('text-t-h3 text-text', className)} {...rest} />;
}

export function CardDescription({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-description"
      className={cn('text-t-label text-text-muted', className)}
      {...rest}
    />
  );
}

/** الشارة أو الزرّ في طرف الترويسة — الطرف المنطقي، أي اليسار في العربية. */
export function CardAction({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-action"
      className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)}
      {...rest}
    />
  );
}

export function CardContent({ className, ...rest }: ComponentProps<'div'>) {
  return <div data-slot="card-content" className={cn('px-5', className)} {...rest} />;
}

/**
 * الذيل بلا فاصل مرسوم. وأكثر بطاقات المصدر تفصل ذيلها بخطّ — لكنّ الخطّ
 * `<Separator />` يُوضع قبله، فلا يصير لرسم الخطّ الواحد طريقتان تختلفان في
 * اللون حين يتغيّر أحدهما.
 */
export function CardFooter({ className, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-footer"
      className={cn('flex flex-wrap items-center gap-2 px-5', className)}
      {...rest}
    />
  );
}
