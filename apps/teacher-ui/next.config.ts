import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import { writeLegalAssets } from '../../scripts/release/legal-assets.mjs';
import { resolve } from 'node:path';

const config: NextConfig = {
  /**
   * static export: لا خادم HTTP لواجهة المعلم — تُحمَّل من القرص داخل Electron.
   * (PRD §8: «Teacher UI — Next.js Static Export … لا حاجة لتشغيل Admin HTTP Server محلياً»)
   */
  output: 'export',
  distDir: 'out-next',

  // حزمة الواجهة المشتركة تُشحن TypeScript خاماً ويترجمها Next.
  transpilePackages: ['@cubecroom/ui'],

  // لا تحسين صور عبر خادم — لا خادم أصلاً.
  images: { unoptimized: true },

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

  // تطبيق سطح مكتب: لا حاجة لـ powered-by header ولا لتحليلات.
  poweredByHeader: false,
  reactStrictMode: true,
  devIndicators: false,
};

// A production export must not overwrite the running Electron development server.
export default async (phase: string): Promise<NextConfig> => {
  await writeLegalAssets(resolve(process.cwd(), 'public/legal'));
  return { ...config, distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : 'out-next', ...(phase === PHASE_DEVELOPMENT_SERVER ? {
    transpilePackages: ['@cubecroom/ui', '@cubecroom/contracts'],
    webpack: (cfg) => { cfg.resolve.extensionAlias = { ...cfg.resolve.extensionAlias, '.js': ['.ts', '.tsx', '.js'] }; cfg.resolve.alias['@cubecroom/contracts'] = resolve(process.cwd(), '../../packages/contracts/src/index.ts'); return cfg; },
  } : {}) };
};
