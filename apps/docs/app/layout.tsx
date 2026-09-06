import type { ReactNode } from 'react';
import { GuideProvider } from '@/components/guide-provider';
import './global.css';

/**
 * جذر الدليل — عربيّ من اليمين إلى اليسار كالمنتج نفسه.
 *
 * و`dir="rtl"` على `<html>` لا على غلافٍ داخلي: القوائم المنسدلة وشريط البحث
 * في Fumadocs تُركَّب في `body` مباشرة، فاتجاهٌ موضعيّ لا يصل إليها.
 *
 * **ولا يكفي `dir` على الوثيقة وحدها.**
 *
 * مكوّنات الشريط الجانبي وشريط البحث مبنيّة على Radix، وهي لا تقرأ اتجاه
 * الصفحة من DOM: تقرؤه من `DirectionProvider` الذي يمرّره `RootProvider`.
 * فبلا `dir` هنا يبقى **منطق** التنقّل بالسهمين، وموضعُ القوائم المنبثقة،
 * ودورانُ أسهم الطيّ — كلّها من اليسار إلى اليمين فوق صفحةٍ عربية. والصفحة
 * تبدو صحيحة والتنقّل فيها معكوس، وهو أسوأ من خللٍ ظاهر.
 */

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      suppressHydrationWarning
      // Wide screenshots remain readable; collapsed sidebar arrows point into RTL text.
      className="[--fd-page-width:1400px] [&_[data-icon].-rotate-90]:rotate-90!"
    >
      <body dir="rtl" className="font-['Segoe_UI','Noto_Naskh_Arabic','Tahoma',system-ui,sans-serif]">
        <GuideProvider>
          {children}
        </GuideProvider>
      </body>
    </html>
  );
}
