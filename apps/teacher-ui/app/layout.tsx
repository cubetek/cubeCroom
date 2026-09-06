import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { DirectionProvider, ThemeProvider, THEME_SCRIPT } from '@cubecroom/ui';
import { fontVariables } from './fonts';
import './globals.css';
import { DesktopFrame } from '@/shell/DesktopFrame';

export const metadata: Metadata = {
  title: 'CubeCroom',
};

/**
 * واجهة المعلم عربية RTL بالكامل — قرار D1 و PRD §2.
 * `lang` و`dir` يُثبتان على الجذر فلا يحتاج أي مكوّن أن يعيد إعلانهما.
 */
/**
 * **`dir` على الوثيقة لا يبلغ Radix.**
 *
 * مكوّنات المكتبة مبنيّة على Radix، وهو لا يقرأ اتجاه الصفحة من DOM: يأخذه
 * من `DirectionProvider`. وما يتوقّف عليه سلوكٌ لا شكل — جهةُ فتح القوائم،
 * وترتيبُ الانتقال بالسهمين، وبداية التمرير. فبلاه تبدو الصفحة عربية سليمة
 * ويتحرّك التنقّل فيها بالعكس.
 *
 * وقد وقع هذا بعينه في موقع الدليل قبل أن يُكشف بالقياس.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={fontVariables} suppressHydrationWarning>
      <head>
        {/*
         * السمة تُوضع على `<html>` قبل أن يُرسم شيء.
         *
         * **وبلا هذا السطر ترتدّ الشاشة من الأبيض إلى الداكن عند كل إقلاع:**
         * React لا يركّب إلا بعد تحميل حزمته، فتُرسم الصفحة مرّةً بالتوكنز
         * الفاتحة ثمّ تُصحَّح أمام المعلم.
         *
         * وهو مسموح بسياسة المحتوى قصداً: `apps/desktop/src/main.ts` يحسب
         * بصمة كل سكربت مضمّن في المخرَج المبنيّ ويضعها في `script-src` —
         * فما نبنيه يعمل، وما يُحقن لا تطابق بصمته.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/*
       * `suppressHydrationWarning` على `<html>` وحده: السكربت أعلاه يغيّر
       * `data-theme` قبل الترطيب، فيختلف ما في DOM عمّا صُيِّر وقت البناء —
       * وهو اختلافٌ مقصود لا عطل. ولا يمتدّ الكتم إلى ما تحته.
       */}
      <body>
        <ThemeProvider>
          <DirectionProvider><DesktopFrame>{children}</DesktopFrame></DirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
