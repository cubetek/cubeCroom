import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      /*
       * أيّ مخرَج لـNext لا `.next` وحده.
       *
       * موقع الدليل يبني التطوير في `.next-dev` والإنتاج في `.next` (فصلٌ
       * مقصود في `apps/docs/next.config.mjs`). والنمط القديم يعرف الثاني ولا
       * يعرف الأول، فدخلت شيفرةٌ مولَّدة في التدقيق: **٢١٦٢ خطأً** في ملفّات
       * لم يكتبها أحد.
       *
       * والقاعدة هنا كما في `apps/desktop/out*` أدناه: القائمة **تمنع
       * بالإغفال**، فيُطابَق نمطُ الاسم لا اسمٌ بعينه.
       */
      '**/.next*/**',
      '**/out-next/**',
      '**/dist/**',
      '**/.turbo/**',
      // Generated diagnostic bundles and execution reports are not application sources.
      '.cubeflow/reports/**',
      // مخرجات التغليف — شيفرة مبنيّة لا مصدر، وأياً كان اسم مجلدها.
      'apps/desktop/out*/**',
      'apps/desktop/pack*/**',
      'apps/desktop/dist-app/**',
      'apps/desktop/screenshots/**',
      '**/next-env.d.ts',
      // فهرس المحتوى الذي يولّده fumadocs-mdx — مشتقّ لا مصدر.
      'apps/docs/.source/**',
      // مخرَج التصدير الثابت لموقع الدليل.
      'apps/docs/out/**',
      // صفحات الدليل نفسها يولّدها `pnpm guide`.
      'apps/docs/content/**',
      'docs/design/screens/**', // ألواح التصميم — HTML لا شيفرة تطبيق
      'docs/design/canvas/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  {
    files: ['**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  /**
   * حدّ معماري مفروض بالأداة لا بالاتفاق:
   * zod يبقى داخل @cubecroom/contracts. أي حزمة أخرى تستورده تكسر مبدأ
   * «صياغة الرسائل في مكان واحد» وتفتح باب ترجمة الأخطاء في كل مسار.
   */
  {
    files: ['apps/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'zod',
              message:
                'zod يبقى داخل @cubecroom/contracts. استعمل validate() و Contract<T> من الحزمة.',
            },
          ],
        },
      ],
    },
  },

  // الاختبارات تعمل على Node مباشرةً — لا متصفّح ولا حزم.
  {
    files: ['**/test/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },

  // سكربتات البناء تطبع للمستخدم — console مقصود فيها.
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' },
  },

  /*
   * الفحص البصري: WebdriverIO يحقن `browser` و`expect`، وMocha يحقن
   * `describe` و`it`. وهي عوالم تشغيل لا شيفرة تطبيق — فتُعرَّف هنا بدل أن
   * تُستورد في كل ملف.
   */
  {
    files: ['apps/desktop/e2e/**/*.mjs', 'apps/desktop/wdio.conf.mjs'],
    languageOptions: {
      // و`document`/`window` لأن `browser.execute` يُنفَّذ داخل الصفحة نفسها.
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.mocha,
        browser: 'readonly',
        expect: 'readonly',
      },
    },
    rules: { 'no-console': 'off' },
  },

  /*
   * إعداد Electron Forge بصيغة CommonJS — يقرؤه Forge بـ`require`، فلا يصحّ
   * أن يكون ESM. والقاعدة التي تمنع `require` مقصودة في شيفرة التطبيق، وهذا
   * ملف إعداد لأداة بناء لا يعمل داخل التطبيق أصلاً.
   */
  {
    files: ['**/forge.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
