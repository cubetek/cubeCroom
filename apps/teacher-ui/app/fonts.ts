import localFont from 'next/font/local';

/**
 * خطّ الواجهة — **IBM Plex Sans Arabic، مضمَّناً مع الحزمة لا من الشبكة**.
 *
 * القرار A4: التطبيق يعمل بلا إنترنت. و`next/font/local` يستضيف الملفّات في
 * مخرَج البناء نفسه (`_next/static/media`)، فلا نداء خارجيّ ولا CDN — وهو
 * الشرط الذي يجعل هذا الخطّ صالحاً هنا أصلاً.
 *
 * ولا `@font-face` مكتوبة بيد: كانت في `apps/teacher-ui/app/fonts.css`
 * **معلّقةً كلّها** بانتظار ملفّات لم تُوضع قطّ، فعملت الواجهة منذ أول يوم
 * بالاحتياطي `system-ui`. والملفّات الآن تأتي من `@fontsource` — الترخيص
 * SIL OFL 1.1 يسمح بالتضمين والتوزيع، والقيد كان الملفّات لا الإذن.
 *
 * ═══ عائلتان لا واحدة ═══
 *
 * `@fontsource` يقسّم الخطّ إلى مجموعات محارف في ملفّات منفصلة: `arabic`
 * و`latin` وغيرهما، ولا ملفّ جامع. وعائلةٌ واحدة بوزنٍ واحد لا تحمل إلّا
 * ملفّاً واحداً — فلو حُمّل الملفّان تحت اسمٍ واحد لضاع أحدهما بصمت.
 *
 * فهما عائلتان تُرصَّان في `--font-sans`: العربية أولاً، واللاتينية بعدها.
 * والمتصفّح يهبط بين العائلات **لكل محرف على حدة**، فتأخذ الأرقام والقيم
 * التقنية («API Key» · `gpt-4o`) وجهها اللاتينيّ من التصميم نفسه — وهو
 * السبب الذي اختير الخطّ من أجله في `05-foundations.md` §القيد ٢.
 *
 * ═══ ولماذا `block` لا `swap` ═══
 *
 * `swap` يرسم بالاحتياطي ثمّ يستبدله، فتقفز العناوين وتتغيّر عروضها بعد
 * الرسم الأول. والملفّات هنا على القرص لا على الشبكة، فالانتظار أجزاءٌ من
 * الثانية — والقفزة أسوأ منه. وهو ما كان مكتوباً في `fonts.css` المحذوف.
 *
 * ═══ ولماذا تُكتب المسارات حرفاً حرفاً ═══
 *
 * `next/font` ليس مكتبةً تُستدعى وقت التشغيل: هو **تحويلٌ في المُصرِّف** يقرأ
 * الاستدعاء نصّاً قبل أن يعمل شيء. فلا يقبل مصفوفةً مبنيّة بـ`map` ولا قيمةً
 * محسوبة — يردّ «Font loader values must be explicitly written literals».
 * فالتكرار هنا ليس إهمالاً، هو الشكل الوحيد الذي يقبله.
 */

export const plexArabic = localFont({
  src: [
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-arabic',
  display: 'block',
  fallback: ['system-ui', 'sans-serif'],
});

export const plexLatin = localFont({
  src: [
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: '../../../node_modules/@fontsource/ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-plex-latin',
  display: 'block',
  fallback: ['system-ui', 'sans-serif'],
});

/** القيم التقنية وحدها — تُلفّ في الأداة `ltr-island`. */
export const plexMono = localFont({
  src: [
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../../node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
      weight: '500',
      style: 'normal',
    },
  ],
  variable: '--font-plex-mono',
  display: 'block',
  fallback: ['ui-monospace', 'monospace'],
});

/** يُوضع على `<html>` — الرموز تُعرَّف على الجذر فتصل كلّ شاشة. */
export const fontVariables = `${plexArabic.variable} ${plexLatin.variable} ${plexMono.variable}`;
