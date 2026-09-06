# نشر دليل CubeCroom على DigitalOcean

ينشر `app.yaml` موقعاً ثابتاً واحداً باسم `cubecroom-docs` من فرع `main` في
`cubetek/cubeCroom`. يُبنى Next.js وFumadocs مرة واحدة ثم تُقدّم محتويات
`apps/docs/out` عبر CDN. لا توجد خدمة Node أو قاعدة بيانات أو أمر تشغيل للموقع.

## البناء والتحقق

```sh
docker build --file .do/docs.Dockerfile --tag cubecroom-docs .
```

يقرأ Docker رقم pnpm من `packageManager` في ملف الجذر، ويتحقق أن إصدار Node
الرئيسي يطابق `.nvmrc`. تثبّت مرحلة البناء الدليل و`ui` و`contracts` فقط، مع
`--frozen-lockfile`. لا تنسخ manifest الجذر إلى مساحة العمل إلا بعد التثبيت؛
pnpm يثبت تبعيات الجذر حتى مع `--filter`، والجذر يحتوي أدوات تغليف Electron.
يُستخدم linker معزول داخل صورة البناء لأن hoisted يثبت حزم lockfile غير المرتبطة
بالدليل أيضاً. تُرفع حزم `@types` فقط ليجد `contracts` أنواع المنصة المستخدمة
في بنائه، وتبقى إعدادات التطوير المحلية كما هي.
تعطّل أوامر البناء إعادة التثبيت التلقائية في pnpm بعد استعادة manifest الجذر؛
التبعيات المطلوبة ثُبّتت مسبقاً من lockfile في المرحلة السابقة.

بعد التثبيت يُشغّل مولّد Fumadocs صراحةً، ثم تبنى تبعيات الدليل بالترتيب.
أمر البناء المعتاد للدليل يتحقق من أصول الهوية ويولّد الصفحات من مصادرها المشتركة.
تحتفظ `.dockerignore` بأيقونات سطح المكتب وأصول جميع التطبيقات التي يحتاجها هذا الفحص.
تحتوي الصورة النهائية على الملفات الثابتة فقط، في `/apps/docs/out`.

في مساحة تطوير مثبّتة التبعيات، يمكن أيضاً التحقق من المخرجات محلياً:

```sh
pnpm --filter @cubecroom/docs... --recursive run build
node scripts/deploy-docs-check.mjs
```

`trailingSlash: true` يصدر كل صفحة كـ `path/index.html` حتى تعمل الروابط المباشرة.
`/api/search` ملف JSON ثابت من Fumadocs، وليس endpoint يحتاج خادماً.
إعداد `error_document: 404.html` يحافظ على استجابة 404 للمسارات غير الموجودة؛
لا تضف `catchall_document: index.html`. الصور تُصدّر مباشرة، والخط الأساسي خط
النظام؛ لا يحتاج عرض الموقع إلى خدمة تحسين صور أو خدمة خطوط خارجية.

## النشر

يستخدم التطبيق مصدر Git عاماً:
`https://github.com/cubetek/cubeCroom.git`، فرع `main`. لا يحتاج هذا المصدر
إلى ربط تطبيق GitHub الخاص بـ DigitalOcean بالمؤسسة. مسار المخرجات في App Spec
هو `/apps/docs/out`؛ يتطلب نشر Docker مساراً مطلقاً داخل الصورة النهائية.

يجب أن تكون الملفات موجودة على فرع `main` قبل إنشاء التطبيق لأول مرة:

```sh
doctl apps spec validate .do/app.yaml
doctl apps create --spec .do/app.yaml
```

لتغيير إعداد التطبيق نفسه، استخدم معرّف **cubecroom-docs** الذي أعاده الإنشاء.
النشر التلقائي يعيد بناء الشيفرة، ولا يطبّق تغييرات App Spec تلقائياً:

```sh
doctl apps update YOUR_CUBECROOM_DOCS_APP_ID --spec .do/app.yaml
node scripts/deploy-docs-check.mjs --url https://YOUR-APP.ondigitalocean.app
```

## النشر التلقائي بعد CI

المصدر العام `git` لا يستخدم `deploy_on_push`. يتولى
`.github/workflows/docs-deploy.yml` النشر بعد نجاح workflow باسم **CI** على
`main`. يمكن تشغيل **Deploy docs** يدوياً من `main`، لكنه يشترط أيضاً وجود
CI ناجح للالتزام الحالي. لا يُشغّل النشر من pull requests أو فروع أخرى.

اضبط بيئة GitHub Actions المسماة `docs-production` بحيث تسمح بفرع `main` فقط، مع:

- السر `DIGITALOCEAN_ACCESS_TOKEN`: رمز يستطيع قراءة التطبيق وتحديث نشره
  (`app:read` و`app:update`).
- المتغير `DIGITALOCEAN_APP_ID`: معرّف تطبيق `cubecroom-docs`.

مهمة النشر لا تنسخ المستودع ولا تثبّت تبعياته؛ الرمز متاح لخطوة API فقط.
تتحقق من نجاح CI وحداثة `main` وهوية التطبيق، ثم تنتظر اكتمال نشر DigitalOcean
وتتحقق من `source_commit_hash`. بعدها تفحص مهمة مستقلة الصفحات والبحث والصور
واستجابة 404 باستخدام `deploy-docs-check.mjs`، دون الوصول إلى بيئة النشر أو أسرارها.

واجهة DigitalOcean لإنشاء deployment تجلب أحدث الفرع ولا تقبل تثبيت SHA في
الطلب. لذلك تتخطى الأتمتة الالتزامات القديمة، وتلغي النشر المعلّق عند تغيّر
`main` أو اختلاف التزام المصدر. هذه مراقبة لسباق التحديث وليست عملية ذرية:
إذا أصبح نشر مختلف نشطاً قبل اكتشاف الاختلاف، تفشل المهمة وتعرض معرّف النشر
لمراجعته في App Platform؛ لا تعتبره نشراً ناجحاً.

ملف App Spec لا يحتوي على أسرار أو معرّفات حساب أو نطاق مخصص.
الموقع الثابت يُقدّم عبر CDN عالمي، لذلك لا يحدد منطقة.
يمكن متابعة البناء وحالة النشر من لوحة App Platform أو أوامر `doctl apps logs`
و`doctl apps list-deployments`.

## التكلفة والمراجع

حسب التسعير الرسمي المتحقق منه في 2026-09-06: حتى **3 تطبيقات تتكون حصراً من
مواقع ثابتة مجاناً**؛ يمكن لكل تطبيق أن يضم أكثر من موقع ثابت. كل تطبيق إضافي
من هذا النوع **3 دولارات شهرياً**. لكل تطبيق **1 GiB** نقل خارجي شهرياً،
والزيادة **0.02 دولار لكل GiB**. تُجمع حصص النقل واستخدامها على مستوى الفريق؛
التكلفة الفعلية تعتمد على تطبيقات الفريق واستخدامه.

- [App Spec الرسمي](https://docs.digitalocean.com/products/app-platform/reference/app-spec/)
- [البناء باستخدام Dockerfile](https://docs.digitalocean.com/products/app-platform/reference/dockerfile/)
- [نشر monorepo والوصول إلى GitHub وCDN](https://docs.digitalocean.com/products/app-platform/how-to/deploy-from-monorepo/)
- [إدارة مصدر المستودع](https://docs.digitalocean.com/products/app-platform/how-to/manage-source-repo/)
- [إنشاء deployment من أحدث المصدر](https://docs.digitalocean.com/reference/pydo/reference/apps/create_deployment/)
- [إلغاء deployment معلّق](https://docs.digitalocean.com/reference/pydo/reference/apps/cancel_deployment/)
- [تشغيل workflow بعد اكتمال CI](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- [المواقع الثابتة وصفحة الخطأ](https://docs.digitalocean.com/products/app-platform/how-to/manage-static-sites/)
- [التسعير الرسمي](https://docs.digitalocean.com/products/app-platform/details/pricing/)
- [تصدير Next.js بمجلدات index.html](https://nextjs.org/docs/app/api-reference/config/next-config-js/trailingSlash)
- [تفسير pnpm لتثبيت تبعيات الجذر](https://github.com/pnpm/pnpm/issues/7208)
