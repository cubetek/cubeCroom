import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';
import { createMDX } from 'fumadocs-mdx/next';

/**
 * دليل الاستخدام — موقع ثابت لا خادم.
 *
 * `output: 'export'` عمداً: الدليل يُقرأ من ملفّات على القرص أو من أيّ استضافة
 * ساكنة، ولا يجوز أن يشترط تشغيل عملية Node ليقرأه معلم.
 */
const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  // Emit /docs/topic/index.html so direct links work on static hosts without rewrites.
  trailingSlash: true,
  reactStrictMode: true,
  transpilePackages: ['@cubecroom/ui'],

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
  // لقطات PNG تُقدَّم كما هي — لا خادم لتحسين الصور في مخرَج ثابت.
  images: { unoptimized: true },
};

// Keep live preview artifacts separate from production builds.
export default (phase) => withMDX({
  ...config,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
});
