# 03 — Screen Inventory

**المجموع: 32 شاشة** — 22 للمعلم (Desktop) + 10 للطالب (Web).

كل ما في الجدولين `[مصدر]`.

## واجهة المعلم — Desktop (22 شاشة)

| ID | الشاشة | الهدف | المكونات الأساسية | ملاحظات للمصمم |
| --- | --- | --- | --- | --- |
| T01 | Splash / Launch | تشغيل التطبيق والتحقق من البيانات. | Logo، status مختصر، recovery فقط عند الحاجة. | لا تعرض logs. إذا طال التشغيل: "نجهّز بياناتك…" |
| T02 | Welcome / First Run | بدء إعداد المستخدم غير التقني. | عنوان، شرح سطرين، CTA "ابدأ". | Minimal؛ لا تعرض إعدادات تقنية. |
| T03 | Teacher Profile Setup | تسجيل اسم المعلم. | الاسم، المؤسسة اختياري، Next. | حقول قليلة. |
| T04 | AI Setup | ربط BYOK اختيارياً. | Provider cards، API Key input، Test، Model select، Skip. | المفتاح Password field ولا يعرض لاحقاً. |
| T05 | Dashboard | نقطة البداية اليومية. | الفصول الأخيرة، "إنشاء فصل"، جلسة نشطة إن وجدت، طلبات معلقة، آخر Backup. | أهم Card هو حالة الحصة الحالية. |
| T06 | Classes | إدارة الفصول. | Cards/List، search، status، create. | Empty state يساعد على إنشاء أول فصل. |
| T07 | Create/Edit Class | تعريف الفصل. | اسم، مادة، مستوى، وصف، Save. | لا Wizard طويل. |
| T08 | Class Overview | مركز الفصل. | KPIs بسيطة، latest lesson، students، CTA تشغيل دخول الطلاب. | تبويب/Sidebar داخلي للفصل. |
| T09 | Live Access / Share | مشاركة الدخول. | QR كبير، link، copy، network status، عدد المتصلين، زر إنهاء. | لا IP/Port في الوضع الطبيعي؛ "تفاصيل تقنية" collapsible فقط. |
| T10 | Access Requests | قبول/رفض الطلاب. | Pending rows/cards، الاسم، وقت الطلب، approve/reject، bulk approve اختياري P1. | يجب أن تكون الموافقة سريعة جداً. |
| T11 | Students | قائمة الطلاب. | status، آخر نشاط، remove/revoke، filter. | Distinguish approved vs active now. |
| T12 | Lessons List | إدارة الدروس. | Draft/Published chips، create، duplicate، publish/unpublish. | Filter واضح. |
| T13 | Lesson Editor | إنشاء المحتوى. | عنوان، rich text/blocks، attachments، save state، publish، AI button. | Auto-save indicator مهم. |
| T14 | AI Assistant Drawer | مساعدة سياقية داخل الدرس. | Action presets، prompt box، model indicator، result preview، Insert/Replace/Copy. | لا Chat معقد كافتراضي؛ actions أولاً. |
| T15 | Activities | قائمة الأنشطة. | Quiz/short answer، status، submissions count، create. | MVP بسيط. |
| T16 | Activity Builder | إنشاء سؤال/اختبار. | type، prompt، options، answer key، AI generate. | Preview student view. |
| T17 | Submissions | مراجعة الإجابات. | student، time، status، response، grade/comment. | Batch navigation. |
| T18 | Files | مكتبة مرفقات محلية. | upload، search، size/type، used in. | Warn before deleting used file. |
| T19 | AI Settings | إدارة المزودات. | provider، connection status، default model، replace/delete key، usage. | Never display full key. |
| T20 | Backup & Restore | حماية البيانات. | Create backup، last backup، restore، open folder. | Restore confirmation قوي + pre-restore backup. |
| T21 | Connection Diagnostics | حل مشاكل الطلاب. | checklist status: Wi-Fi, portal, firewall, reachable؛ action per issue. | لغة بشرية؛ technical details hidden. |
| T22 | General Settings | إعدادات التطبيق. | language، data folder، startup، updates، privacy. | Advanced منفصل. |

## واجهة الطالب — Web (10 شاشات)

| ID | الشاشة | الهدف | المكونات الأساسية | ملاحظات للمصمم |
| --- | --- | --- | --- | --- |
| S01 | Join | طلب الانضمام. | اسم الطالب، معرف اختياري، اسم الفصل/المعلم، CTA "طلب الدخول". | Mobile-first، لا Account creation. |
| S02 | Pending | الانتظار. | spinner خفيف، "تم إرسال طلبك"، اسم الفصل، auto refresh. | لا زر refresh إجباري. |
| S03 | Rejected / Expired | تفسير عدم الدخول. | رسالة واضحة، CTA إعادة المحاولة إذا مسموح. | لا HTTP status. |
| S04 | Student Home | ملخص الفصل. | اسم الفصل، آخر درس، الدروس المنشورة، الأنشطة المطلوبة. | Bottom/top nav بسيطة. |
| S05 | Lessons | قائمة الدروس. | عنوان، وصف قصير، تاريخ النشر، status read. | Cards مريحة للهاتف. |
| S06 | Lesson Viewer | قراءة المحتوى. | rich content، attachments، back، activity link. | **Typography عربية قوية.** |
| S07 | Activity | الإجابة. | question(s)، inputs، progress، submit. | حفظ draft محلياً أثناء الكتابة إن أمكن. |
| S08 | Submitted | تأكيد. | نجاح، timestamp، العودة للفصل. | يمنع submit المكرر غير المقصود. |
| S09 | Session Ended | انتهاء الحصة. | رسالة "أنهى المعلم جلسة الدخول". | لا retry loop. |
| S10 | AI Help — Conditional | مساعدة AI إذا مفعلة. | question، context scope، response، usage notice. | مخفي بالكامل إذا disabled. |

## إضافة على الجرد — `T03b` `[قرار]`

معرّف واحد أُضيف بعد المصدر، بقرار `C5` في [06-decisions.md](06-decisions.md):

| ID | الشاشة | الهدف | المكونات الأساسية | ملاحظات |
| --- | --- | --- | --- | --- |
| **T03b** | مكان البيانات | اختيار مجلد حفظ البيانات في أول تشغيل. | خيار موصى به مُختار مسبقاً + المسار + المساحة الفارغة، خيار «اختيار مكان آخر» + تصفّح، تحذير القرص الخارجي. | خطوة موجودة في التدفّق الرئيسي §6/٣ بلا معرّف في المصدر. الخطوة ٣ من ٥ في الإعداد. |

بذلك تصير الشاشات **٣٣ معرّفاً** (٢٣ للمعلم + ١٠ للطالب)، والجرد الأصلي **٣٢** كما في المصدر.

## الشاشتان الأعلى أهمية

المصدر يفرد فصلين كاملين لشاشتين فقط — تفاصيلهما في [04-flows-and-states.md](04-flows-and-states.md):

1. **T09 Live Access** — "الشاشة التي تُحوّل Local Hosting إلى تجربة بسيطة للمعلم؛ يجب أن تكون من أوضح شاشات المنتج."
2. **T14 AI Assistant داخل Lesson Editor** — التصميم يبدأ من نية المعلم لا من Chat عام.
