/**
 * مجموعة أيقونات المنتج — خطّية، شبكة 24، سُمك 2.
 * قاعدة الاتجاه (docs/design/05-foundations.md §4):
 *   الأيقونات الاتجاهية (chevron / arrow) تُعكس مع RTL — يتكفّل بذلك `flipRtl`.
 *   غير الاتجاهية (check · clock · alert · trash · sparkles) لا تُعكس أبداً.
 */
import type { ReactNode, SVGProps } from 'react';
import { cn } from './lib/utils';

export type IconName =
  | 'home'
  | 'book'
  | 'folder'
  | 'sparkles'
  | 'sliders'
  | 'database'
  | 'wifi'
  | 'bell'
  | 'check-circle'
  | 'clock'
  | 'alert-circle'
  | 'pencil'
  | 'plus'
  | 'x'
  | 'chevron-next'
  | 'chevron-prev'
  | 'chevron-down'
  | 'search'
  | 'sidebar'
  | 'sun'
  | 'moon'
  | 'monitor'
  | 'stop';

/**
 * الأيقونات الاتجاهية وحدها تُعكس في RTL.
 *
 * و`sidebar` منها: هي رسمُ لوحٍ ملتصقٍ بحافة — وحافتُه في العربية اليمنى.
 * فلو لم تُعكس أشارت إلى جهةٍ لا شريط فيها. أمّا `chevron-down` فرأسيّة،
 * والرأسيّ لا جهة له تُعكس.
 */
const DIRECTIONAL: ReadonlySet<IconName> = new Set(['chevron-next', 'chevron-prev', 'sidebar']);

const PATHS: Record<IconName, ReactNode> = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H10v6H4a1 1 0 0 1-1-1z" />,
  book: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5Z" />
      <path d="M4 18a2.5 2.5 0 0 1 2.5-2.5H20" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  sparkles: (
    <>
      <path d="M12 3.2l1.75 4.55 4.55 1.75-4.55 1.75L12 15.8l-1.75-4.55L5.7 9.5l4.55-1.75Z" />
      <path d="M18 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" />
    </>
  ),
  sliders: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <circle cx="15" cy="7" r="2.5" />
      <line x1="4" y1="17" x2="20" y2="17" />
      <circle cx="9" cy="17" r="2.5" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9a15 15 0 0 1 19 0" />
      <path d="M6 12.5a10 10 0 0 1 12 0" />
      <path d="M9.5 16a5 5 0 0 1 5 0" />
      <line x1="12" y1="19.5" x2="12" y2="19.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7" />
      <path d="M10.3 20a2 2 0 0 0 3.4 0" />
    </>
  ),
  'check-circle': (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </>
  ),
  'alert-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="7.5" x2="12" y2="12.5" />
      <line x1="12" y1="16" x2="12" y2="16" />
    </>
  ),
  pencil: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </>
  ),
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  x: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  // في RTL: «التالي» يشير يساراً و«السابق» يميناً — التعريف هنا LTR ويُعكس تلقائياً.
  'chevron-next': <polyline points="9 6 15 12 9 18" />,
  'chevron-prev': <polyline points="15 6 9 12 15 18" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  'chevron-down': <polyline points="6 9 12 15 18 9" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </>
  ),
  sidebar: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <line x1="15" y1="4" x2="15" y2="20" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  monitor: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <line x1="8" y1="20" x2="16" y2="20" />
      <line x1="12" y1="16" x2="12" y2="20" />
    </>
  ),
};

type IconProps = {
  name: IconName;
  size?: number;
  /** نص بديل للأيقونات التي تحمل معنى وحدها. اتركه فارغاً للأيقونات الزخرفية. */
  label?: string;
} & Omit<SVGProps<SVGSVGElement>, 'name' | 'ref'>;

export function Icon({ name, size = 20, label, className, ...rest }: IconProps) {
  const decorative = label === undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : 'img'}
      aria-label={label}
      className={cn(DIRECTIONAL.has(name) && 'rtl:-scale-x-100', className)}
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
