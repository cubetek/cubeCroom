'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@cubecroom/ui';

/**
 * شريط تنقّل الطالب — مرسوم في `S04Home` و`S05Lessons`.
 *
 * على شاشات القوائم وحدها، لا على `S06` و`S07` و`S08`: تلك شاشات فيها عملٌ
 * يُكمَل — درسٌ يُقرأ أو نشاطٌ يُجاب — وشريطٌ أسفلها يدعو الطالب إلى مغادرتها
 * وسط ما يفعله. واللوح نفسه يرسمها بلا شريط، وبرابط رجوع في أعلاها.
 *
 * **وليس فيه تبويب «مساعدة» المرسوم في اللوح** — قرار `D11`: المساعدة في هذا
 * المنتج لوحةٌ داخل الدرس (`S10`) لا مكانٌ يُذهب إليه، وهي مخفيّة أصلاً ما لم
 * تُفتح بواباتها الثلاث. وتبويبٌ يقود إلى لا شيء — أو إلى شيء يختفي — أسوأ من
 * غيابه.
 */

const TABS = [
  { href: '/', label: 'الرئيسية' },
  { href: '/lessons', label: 'الدروس' },
  { href: '/activities', label: 'الأنشطة' },
  { href: '/learning', label: 'تجاربي' },
] as const;

/**
 * شريط ثابت أسفل الشاشة على الهاتف.
 *
 * و`env(safe-area-inset-bottom)` ليست تزيّناً: على هواتف بلا زرّ رئيسي يقع
 * الشريط تحت شريط النظام فيصير أحد تبويباته غير قابل للمس. والثمانية تحته هي
 * حشو الشريط نفسه، فتُجمع إليها لا تُستبدل بها.
 */
const NAV = cn(
  'sticky bottom-0 mt-auto flex gap-1 border-t border-hairline bg-surface',
  'px-1.5 pt-2 pb-[calc(var(--spacing)*2_+_env(safe-area-inset-bottom))]',
);

/**
 * التبويب — هدف لمس ٥٢px على هاتف.
 *
 * والشريط ابنٌ مباشر لعمود الصفحة فيتمدّد بتمدّده: من ٧٠٠px يصير كلّ تبويب
 * ٢١٦px، وعلى حاسوب ١٣٦٦px يصير ٣٢٤px — لعنوانٍ بحجم ١٣px. والحدّ هو ٧٠٠px
 * نفسه الذي يتّسع عنده العمود في `StudentHome` وصفحة الدروس، فلا يتمدّد
 * التبويب خطوةً ثم ينكمش في التي تليها.
 *
 * و`flex-initial` لا إخفاءَ لشيء: التبويبات الثلاثة تبقى ظاهرة وهدف اللمس
 * ٥٢px كما هو، والحشو منطقيّ لا فيزيائيّ.
 */
const TAB = cn(
  'flex min-h-13 flex-1 items-center justify-center rounded-md text-s-caption text-text-2',
  'tablet:flex-initial tablet:px-5.5',
);

/** الحالة لا يحملها اللون وحده: الوزن يحملها معه. */
const TAB_ON = 'bg-primary-soft font-bold text-primary-on-soft';

export function StudentNav() {
  const pathname = usePathname();

  return (
    <nav className={NAV} aria-label="أقسام الفصل">
      {TABS.map((tab) => {
        const current = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(TAB, current ? TAB_ON : '')}
            aria-current={current ? 'page' : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
