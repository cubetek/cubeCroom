import type { NextConfig } from 'next';
import { writeLegalAssets } from '../../scripts/release/legal-assets.mjs';
import { resolve } from 'node:path';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const config: NextConfig = {
  /**
   * standalone: حزمة Node مكتفية تُضمَّن داخل تطبيق المعلم وتبدأ وتتوقف مع الحصة.
   * (PRD §8: «Student Web — Next.js output: standalone»)
   */
  output: 'standalone',

  transpilePackages: ['@cubecroom/ui', '@cubecroom/contracts'],

  // بلا إنترنت داخل الحصة: لا تحسين صور عبر خدمة خارجية.
  images: { unoptimized: true },

  // Image optimization is disabled and no page imports sharp. Do not ship its unused native image libraries.
  outputFileTracingExcludes: {
    // Next 15 also matches its shared `next-server` trace against this key.
    '*': ['**/node_modules/sharp/**/*', '**/node_modules/@img/sharp-*/**/*'],
  },

  /**
   * التدقيق ليس عمل `next build`.
   *
   * المستودع يدقَّق بإعداد ESLint مسطّح واحد عند جذره (`pnpm lint`)، ولا
   * `eslint-config-next` فيه. فكان كل بناء يشغّل تدقيقاً ثانياً لا إعداد له،
   * ويطبع «The Next.js plugin was not detected» — ثلاث مرّات، مرّةً لكل
   * تطبيق Next.
   *
   * **والتحذير كان يقول شيئاً صحيحاً بطريقة مضلّلة:** لا خلل في الإعداد؛ الخلل
   * أن التدقيق يُطلب من الأداة الخطأ. فيُقال هنا صراحةً أين مكانه — لا لأن
   * التحذير مزعج، بل لأن تحذيراً يتكرر في كل بناء ولا يُقصد إصلاحه يعلّم
   * القارئ أن يتخطّى تحذيرات البناء، وهو الثمن الحقيقي.
   */
  eslint: { ignoreDuringBuilds: true },

  poweredByHeader: false,
  reactStrictMode: true,

  /**
   * ترويسات أمن سطح الطالب — SEC-008.
   *
   * `default-src 'self'` يقصر كل ما تحمّله الصفحة على خادمنا: لا سكربت ولا
   * خطّ ولا صورة من الإنترنت — وهو أصلاً مبدأ المنتج (لا شيء يمرّ بالشبكة
   * الخارجية)، والترويسة تجعله قاعدة يفرضها المتصفح لا نيّةً في الشيفرة.
   *
   * وسياسة المحتوى نفسها ليست هنا بل في `middleware.ts`: هي تحتاج رقم استعمال
   * يتغيّر مع كل طلب، وهذا الملفّ يُقرأ مرة واحدة عند الإقلاع.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // لا يتسرّب رابط الحصة إلى أي موقع يفتحه الطالب بعدها.
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ];
  },
};

export default async (phase: string): Promise<NextConfig> => {
  await writeLegalAssets(resolve(process.cwd(), 'public/legal'));
  return { ...config, ...(phase === PHASE_DEVELOPMENT_SERVER ? {
    distDir: '.next-dev', transpilePackages: ['@cubecroom/ui', '@cubecroom/contracts', '@cubecroom/core', '@cubecroom/db'],
    webpack: (cfg) => { cfg.resolve.extensionAlias = { ...cfg.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] }; for (const name of ['contracts', 'core', 'db']) cfg.resolve.alias[`@cubecroom/${name}`] = resolve(process.cwd(), `../../packages/${name}/src/index.ts`); return cfg; },
  } : {}) };
};
