import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import { BrandMark } from '@cubecroom/ui/components/brand';

/** Internal guide navigation also works when the docs are served locally. */
export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span className="inline-flex min-w-0 items-center gap-2"><BrandMark decorative className="size-8" /><span className="truncate">دليل استخدام CubeCroom</span></span>,
      url: '/docs',
    },
    links: [
      { text: 'تنزيل التطبيق', url: '/download' },
      { text: 'سجل التغييرات', url: '/changelog' },
      { text: 'الرخصة والمساهمة', url: '/docs/project/license' },
      { text: 'عن CubeCroom', url: '/' },
    ],
    githubUrl: undefined,
  };
}
