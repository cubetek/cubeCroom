import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { DirectionProvider, LegalNotice } from '@cubecroom/ui';
import { fontVariables } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'CubeCroom',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // الطالب يقرأ درساً على حاسوب أو لوحيّ: التكبير حقّ لا إزعاج.
  maximumScale: 5,
};

/**
 * بوابة الطالب — عربية RTL، قاعدة 360px.
 * `data-app="student"` يرفع ارتفاع عناصر التحكم إلى 44px عبر التوكنز
 * (`@cubecroom/ui/globals.css`) فلا تتكرّر القاعدة في كل شاشة.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl" data-app="student" className={fontVariables}>
      <body>
        <DirectionProvider>
          {children}
          <footer className="flex justify-center border-t border-hairline px-4 py-3">
            <LegalNotice />
          </footer>
        </DirectionProvider>
      </body>
    </html>
  );
}
