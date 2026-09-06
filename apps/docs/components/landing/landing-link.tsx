import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@cubecroom/ui/lib/button-variants';
import { cn } from '@cubecroom/ui/lib/utils';

/** Reuse the shared shadcn button variants without adding client JavaScript for links. */
export function LandingLink({ href, children, secondary = false }: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <Link href={href} className={cn(
      buttonVariants({ variant: 'secondary' }),
      'min-h-12 h-auto whitespace-normal rounded-xl px-6 py-3 text-base leading-6 shadow-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700',
      secondary
        ? 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
        : 'border-teal-700 bg-teal-700 text-white hover:bg-teal-800',
    )}>
      {children}
      <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
    </Link>
  );
}
