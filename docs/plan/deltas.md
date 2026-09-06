# فروق PRD ↔ التصميم والسقالة

`Teacher_Local_AI_PRD_v1.0.docx` وصل بعد اكتمال التصميم وبعد بدء السقالة. هذا جرد كل موضع يخالف فيه الـ PRD ما هو قائم، وما يجب فعله.

**الـ PRD هو المرجع الأعلى** — ملف الـUX نفسه يقول «متوافق مع PRD v1.0». حيث اختلفا، الـ PRD يحكم.

---

## أ. تعارضان يوقفان البناء حتى يُحسما

### A-1 · إطار الواجهة: Next.js لا Vite ⛔

| | |
| --- | --- |
| **الـ PRD** | «Next.js: إطار الواجهات الأساسي للمشروع» · منصة التنفيذ: **Electron + Next.js + Vercel AI SDK** · Teacher UI = `Next.js Static Export` · Student Web = `Next.js output: standalone` |
| **القائم** | `apps/teacher` على Vite + React — بُني قبل وصول الـ PRD، بناءً على سؤال أجبتَ عليه حين لم تكن الوثيقة بين أيدينا |
| **الحكم** | الـ PRD يفصل. سؤالي كان ناقص المعلومة، لا اختياراً حراً. |

**ما يبقى بلا تغيير** (React هو React في الحالتين، و CSS Modules مدعومة أصلاً في Next.js):
`design-tokens/tokens.css` · `Icon.tsx` · `Badge.tsx` · `Button.tsx` · `Shell.tsx` + CSS · `Dashboard.tsx` + CSS · `lib/numerals.ts`

**ما يُستبدل**: `vite.config.ts` · `index.html` · `src/main.tsx` · سكربتات `dev`/`build` · مسار `apps/teacher`.

**التكلفة**: نقل ملفات ومسارات، لا إعادة كتابة. أقل من ساعة.

### A-2 · `sandbox` مطفأ يخالف SEC-001 ⛔

| | |
| --- | --- |
| **الـ PRD** | SEC-001: «contextIsolation=true و**sandbox=true** و nodeIntegration=false في Renderer» |
| **القائم** | `sandbox: false` في `electron/main.ts` — لأن preload بصيغة ESM لا يعمل داخل الصندوق |
| **الإصلاح** | preload يُبنى **CommonJS** (`preload.cjs`)، ويعود `sandbox: true`. الـ main يبقى ESM. |

هذه ليست مفاضلة: الـ PRD يذكرها متطلباً أمنياً برقم، و Definition of Done يشترط «اختبارات أمن أساسية لسطح Student LAN وIPC».

---

## ب. هيكل المستودع — يُعاد ترتيبه

الـ PRD يحدد الشجرة في §7 حرفياً:

```
apps/desktop/       Electron main + preload + packaging
apps/teacher-ui/    Next.js static export داخل Electron
apps/student-web/   Next.js standalone + student Route Handlers
packages/core/      use-cases · policies · domain rules
packages/db/        SQLite schema · migrations · repositories
packages/ai/        AI SDK providers · prompts · usage policies
packages/contracts/ Zod schemas + DTOs
packages/security/  tokens · sessions · rate limits · origin checks
packages/ui/        design tokens + shared components
scripts/ · docs/
```

القائم `apps/teacher` + `design-tokens/` يُفكَّك إلى: `apps/desktop` + `apps/teacher-ui` + `packages/ui`.
وأدوات العمل: **pnpm + Turborepo** (القائم pnpm بلا Turborepo) و**Electron Forge** للتغليف.

---

## ج. الـ PRD يُغلق سؤالاً كان مفتوحاً

### `D3` أسماء المزوّدات — ✅ حُسم

الـ PRD §11: **MVP Providers: OpenAI · Anthropic · Google Generative AI**، بصيغة `provider:model` عبر `createProviderRegistry`.

فالأقواس النائبة `[المزوّد الأول]` في `T04AiSetup` و `T19AiSettings` و `LF5Ai` تُملأ بأسماء حقيقية. يُحدَّث [06-decisions.md](../design/06-decisions.md) تحت `D3`.

---

## د. فروق تمسّ شاشات مرسومة

| # | الـ PRD | التصميم القائم | الأثر |
| --- | --- | --- | --- |
| **D-1** | FR-002: أول تشغيل يشمل **«لغة الواجهة»** ضمن خطواته | تدفّق أول تشغيل: ترحيب ← بيانات المعلم ← مكان البيانات ← AI ← أول فصل. لا خطوة لغة | القرار `D1` (العربية وحدها) يجعل خطوة اللغة بلا خيار. **المقترح**: تبقى محذوفة من الـwizard وتبقى في `T22` — وتُسجَّل مخالفة معلنة لـ FR-002 بدل تنفيذ خطوة بخيار واحد |
| ✅ **D-2** | §23: AI للطالب «يحتاج تفعيل صريح **لكل فصل/نشاط**» | `T19AiSettings` فيه مفتاح **عام واحد**: «للطلاب داخل الدرس» | **أُغلق في P4-7** بقرار `D10`: ثلاثة مفاتيح مفتوحة معاً — القاطع العام، ومفتاح الفصل (مبنيّ في «نظرة عامة»)، ومفتاح النشاط (يأتي مع الأنشطة في Phase 5). أربعة اختبارات للبوّابة وفحص دخان يثبت المنع الافتراضي |
| ✅ **D-3** | FR-003: «إنشاء/تعديل/**أرشفة** فصل» | `T06` و`T07` بلا أرشفة — الحذف فقط | **أُغلق في P3-1**: «أرشفة» إجراء في بطاقة الفصل، وشريحة «مؤرشفة» تقابل «الكل». مسجَّل قراراً `D8` في [06-decisions](../design/06-decisions.md) |
| **D-4** | §16: «افتراضياً **لا تُصدَّر** secrets إلى Backup العادي؛ يُعاد إدخالها بعد الاستعادة» | `T20Backup` لا يذكر مصير المفتاح | يُضاف سطر صريح في بطاقة النسخة وفي حوار الاستعادة: مفتاح AI لا يُنسخ، ويُعاد إدخاله بعد الاستعادة |
| **D-5** | NFR-003: 30 اتصال طالب متزامن | العدّادات في `T09` عيّنات (18) | لا أثر تصميمي — بند اختبار حِمل |
| **D-6** | §17: الحالة تعرض «جاهز / يحتاج Wi-Fi / يحتاج إذن Firewall / الفصل متاح للطلاب» | `T09` و`T21` يغطيان الأربعة بصياغات مقاربة | مطابقة نصّية فقط عند التنفيذ |

---

## هـ. ما يؤكده الـ PRD ولا يغيّره

- **Local-first بلا Cloud Backend** — مطابق لكل ما بُني.
- **موافقة المعلم قبل دخول الطالب** — `T10` · `S02`.
- **عربية RTL للنسخة الأولى** — مطابق للقرار `D1`.
- **المفتاح لا يظهر بعد الحفظ ولا يصل الطالب** — منفَّذ في `T04` و`T19` و`T14`.
- **«لا تعرض Port · IP · Host · SQLite · API Endpoint في المسار الطبيعي»** — منفَّذ: الأكورديون المطويّ في `T09`، ويظهر في العطل فقط.
- **«Start Server» ← «تشغيل دخول الطلاب»** — مسرد المصطلحات مطبَّق بالكامل.
- **Windows 11 x64 أولاً** — قاعدة العرض 1280×800 مناسبة.
