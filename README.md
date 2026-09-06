# CubeCroom

منصة للتعليم داخل الصف: تطبيق Electron للمعلم، وبوابة متصفح للطلاب على الشبكة المحلية. يجمع المشروع تحرير الدروس والأنشطة والتقييم ومساعدة الذكاء الاصطناعي للمعلم والطالب، مع قاعدة بيانات محلية ونسخ احتياطي.

[الموقع ودليل الاستخدام](https://cubecroom-docs-b23h2.ondigitalocean.app) منشوران على DigitalOcean App Platform. إعداد البناء والنشر في [.do/README.md](.do/README.md).

الذكاء الاصطناعي ميزة اختيارية تعتمد على المزود والنموذج المختارين. استخدام مزود خارجي قد يرسل إليه المحتوى المحدد ويخضع لشروطه وتكاليفه؛ تشغيل الصف محلياً لا يعني أن جميع طلبات AI محلية.

## الحالة والتنزيل

المشروع قيد التطوير. نستهدف Windows وmacOS وLinux؛ لا تُعد هذه العبارة دليلاً على اعتماد كل حزمة أو معمارية. راجع [نتائج تنفيذ OTA](docs/plan/ota-implementation-status.md) و[خطة الإصدار](docs/plan/ota-release-and-licensing.md) و[جاهزية النشر](docs/legal/release-readiness.md) لمعرفة الفحوص المتبقية. لم يُعلن في هذه الوثائق عن إصدار عام مكتمل الاختبارات.

سيكون التنزيل والتحديث العامان دون حساب من [إصدارات المستودع الرسمي](https://github.com/cubetek/cubeCroom/releases) بعد فتح الإتاحة واجتياز بوابات النشر. لا تَعِد هذه الوصلة بوجود مثبت منشور الآن.

## الاستخدام والترخيص

CubeCroom برنامج مفتوح المصدر تحت **GNU Affero General Public License، الإصدار الثالث فقط (AGPL-3.0-only)**. يجوز استخدامه وتعديله وبيعه واستضافته للتعليم ولأي غرض تجاري أو غير تجاري وفق [الرخصة](LICENSE).

[الترخيص التجاري البديل](COMMERCIAL-LICENSE.md) متاح لمن يحتاج شروطاً أخرى؛ لا يلزم شراؤه لمجرد الاستخدام التجاري. راجع [شرح الترخيص](docs/legal/licensing-ar.md) و[اتفاقية المساهمة القياسية](CLA.md).

Copyright (C) 2026 CUBETEK ARTIFICIAL INTELLIGENCE - SOLE PROPRIETORSHIP L.L.C. and contributors.

الشركة في الإمارات العربية المتحدة، والتواصل عبر [info@cubetek.dev](mailto:info@cubetek.dev). تبقى تراخيص مكونات الأطراف الثالثة سارية كما تبين إشعاراتها.

## تشغيل بيئة التطوير

استخدم نسخة Node المحددة في [.nvmrc](.nvmrc) ونسخة pnpm المحددة في حقل `packageManager` داخل [package.json](package.json). لا تضع نسخة ثانية مختلفة في إعداد محلي أو workflow.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm dev
```

الأمر الأخير يشغل واجهة المعلم وElectron. بناء بوابة الطالب مطلوب قبل تشغيلها من التطبيق؛ تجميع desktop يجهّز نسخ SQLite الأصلية لبيئة Electron. لا يكفي فتح واجهة المعلم في متصفح لاختبار وظائف Electron.

لتشغيل docs في عملية أخرى:

```sh
pnpm guide:dev
```

الدليل يعمل محلياً على المنفذ `4320`. انظر [المساهمة](CONTRIBUTING.md) لفحوص المصدر والتغليف والتحقق من SQLite داخل Node وElectron.

## تنظيم المشروع

| المسار | المسؤولية |
| --- | --- |
| `apps/desktop` | دورة حياة Electron، التخزين، تشغيل بوابة الطلاب، التحديث والتغليف |
| `apps/teacher-ui` | واجهة المعلم التي يحملها Electron |
| `apps/student-web` | بوابة الطلاب على الشبكة المحلية |
| `apps/docs` | الموقع والدليل |
| `packages/contracts` | العقود والأنواع والتحقق المشترك |
| `packages/core` و`packages/db` | منطق التعليم والملفات والنسخ الاحتياطي وقاعدة البيانات |
| `packages/ai` | التكامل الموحد مع مزودي الذكاء الاصطناعي |
| `packages/ui` | مكونات shadcn وتنسيق Tailwind المشترك |

## المساهمة والتواصل

ابدأ بـ[CONTRIBUTING](CONTRIBUTING.md)، وراجع [ميثاق السلوك](CODE_OF_CONDUCT.md) و[اتفاق المساهمة](CLA.md). أبلغ عن الثغرات وفق [SECURITY](SECURITY.md). توجد [إشعارات الأطراف الثالثة](THIRD_PARTY_NOTICES.md) و[سياسة العلامة](TRADEMARKS.md) في الجذر.

- مجتمع CubeCroom على [Telegram](https://t.me/cubetek).
- البريد: [info@cubetek.dev](mailto:info@cubetek.dev).
- حساب المطور على [X](https://x.com/i99dev).
