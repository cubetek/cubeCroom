import { cn } from '#lib/utils';

export type BrandMarkProps = {
  readonly className?: string | undefined;
  /** Hide the image from assistive technology when the product name is adjacent. */
  readonly decorative?: boolean | undefined;
};

/** Shared local raster asset; available in Electron and the classroom portal without image services. */
export function BrandMark({ className, decorative = false }: BrandMarkProps) {
  return (
    <img
      src="/brand/mark.png"
      width={512}
      height={512}
      alt={decorative ? '' : 'CubeCroom'}
      aria-hidden={decorative || undefined}
      draggable={false}
      decoding="async"
      className={cn(
        'inline-block size-8 shrink-0 rounded-md object-contain dark:bg-white dark:p-0.5',
        className,
      )}
    />
  );
}

export type BrandLogoProps = {
  readonly className?: string | undefined;
  readonly markClassName?: string | undefined;
  readonly wordmarkClassName?: string | undefined;
};

/** The text stays legible at small sizes and follows the current theme. */
export function BrandLogo({ className, markClassName, wordmarkClassName }: BrandLogoProps) {
  return (
    <span dir="ltr" className={cn('inline-flex min-w-0 max-w-full items-center gap-2.5', className)}>
      <BrandMark decorative className={markClassName} />
      <span className={cn('truncate font-bold text-text', wordmarkClassName)}>CubeCroom</span>
    </span>
  );
}
