import { BrandLogo } from '@cubecroom/ui/components/brand';

type BrandSignatureProps = {
  className?: string;
  tone?: 'light' | 'dark';
  showTagline?: boolean;
};

/** Use the product's shared mark in every landing-page placement. */
export function BrandSignature({
  className = '',
  tone = 'light',
  showTagline = false,
}: BrandSignatureProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`} dir="ltr">
      <span className="flex flex-col gap-0.5">
        <BrandLogo
          markClassName={tone === 'dark' ? 'size-11 rounded-lg bg-white p-0.5' : 'size-11'}
          wordmarkClassName={tone === 'dark' ? 'text-xl tracking-tight text-white' : 'text-xl tracking-tight text-slate-900'}
        />
        {showTagline && <span dir="rtl" className={`text-[11px] font-medium ${tone === 'dark' ? 'text-teal-100/70' : 'text-slate-500'}`}>مساحة تجمع الفصل</span>}
      </span>
    </span>
  );
}
