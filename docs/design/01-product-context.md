# 01 — سياق المنتج ومبادئ التصميم

كل ما في هذا الملف `[مصدر]` — منقول من `Teacher_Local_AI_UX_UserStories_v1.0.docx`.

## 1. مبدأ المنتج

تطبيق **Desktop محلي بالكامل للمعلم**؛ جهاز المعلم هو المضيف وقاعدة البيانات ومخزن الملفات. لا يوجد Cloud Backend لتشغيل النظام، واستدعاءات نماذج الذكاء الاصطناعي فقط تتم عبر مفاتيح المعلم **BYOK**.

## 2. قاعدة UX الأساسية

> المعلم **غير تقني**. كل مفهوم تقني يجب أن يتحول في الواجهة إلى لغة مهمة/حالة/إجراء مفهوم.
> مثال: لا نكتب "Local Server running on port 4317"، بل "دخول الطلاب متاح الآن".

المصمم لا يحتاج معرفة SQLite أو Electron IPC أو Ports.

## 3. مبادئ التصميم

- **Arabic-first** وRTL كامل؛ المصطلحات الإنجليزية تظهر فقط عند الحاجة مثل AI وAPI Key وModel.
- **Desktop Teacher UI** بسيطة وعملية: Sidebar ثابت + محتوى واضح + **Action أساسي واحد في كل سياق**.
- **Student Web Mobile-first** لأن أغلب الطلاب قد يدخلون من الهاتف.
- **Progressive disclosure**: الإعدادات المتقدمة مخفية عن المسار اليومي.
- **Status-first**: حالة الفصل/الاتصال/الطلبات مرئية دائماً عندما تكون ذات صلة.
- **لا تعتمد على اللون وحده** في Pending/Approved/Error؛ استخدم **icon + text**.
- كل **destructive action** يحتاج confirmation واضحاً، خصوصاً حذف فصل، حذف طالب، Restore backup.

## 4. Information Architecture

### واجهة المعلم — Desktop

```
الرئيسية
الفصول
  ├─ نظرة عامة
  ├─ تشغيل دخول الطلاب
  ├─ طلبات الدخول
  ├─ الطلاب
  ├─ الدروس والمحتوى
  └─ الأنشطة والنتائج
الملفات
AI
الإعدادات
النسخ الاحتياطي
تشخيص الاتصال
```

### واجهة الطالب — Web

```
الانضمام
انتظار الموافقة
الصفحة الرئيسية
الدروس
عرض درس
الأنشطة
إرسال إجابة
حالة التسليم
AI للطالب (اختياري إذا فعّله المعلم)
```

## 5. Copywriting — المصطلحات المعتمدة

| مصطلح تقني | النص الذي يراه المستخدم |
| --- | --- |
| Start Server | تشغيل دخول الطلاب |
| Stop Server | إنهاء دخول الطلاب |
| Host | جهاز المعلم / هذا الجهاز |
| Connection URL | رابط الدخول |
| Pending Request | طلب بانتظار الموافقة |
| Approve | قبول |
| Reject | رفض |
| API Key | مفتاح API |
| Provider | مزود الذكاء الاصطناعي |
| Model | النموذج |
| Backup | نسخة احتياطية |
| Restore | استعادة نسخة احتياطية |
| Published | منشور للطلاب |
| Draft | مسودة |

## 6. Responsive / Layout Requirements

- **Teacher Desktop baseline: 1280×800** وما فوق؛ يجب أن تبقى العمليات الأساسية usable حتى **1024×768**.
- **Student baseline: 360px** mobile width؛ يدعم tablet/desktop تلقائياً.
- Teacher Sidebar قابلة للطي عند عرض ضيق.
- Tables على Desktop يمكن أن تتحول إلى cards في **Student Web فقط**.
- **RTL icons directional**: أسهم back/next يجب أن تعكس الاتجاه.

## 7. Accessibility

- Contrast مناسب **WCAG AA** قدر الإمكان.
- **Keyboard navigation كاملة** في Teacher Desktop.
- **Focus states** واضحة.
- **Labels فعلية** لكل inputs، لا تعتمد فقط على placeholder.
- Error messages مرتبطة بالحقل وتشرح **كيفية التصحيح**.
- **Touch targets** مناسبة للهاتف في Student Web.

## 8. Design Deliverables المطلوبة

- Low-fidelity flow لأول تشغيل وإنشاء أول فصل.
- High-fidelity Teacher Shell + Dashboard.
- High-fidelity Class Overview + Live Access + Access Requests.
- Lesson List + Lesson Editor + AI Assistant.
- Student Join/Pending/Home/Lesson/Activity flows — mobile first.
- Settings: AI، Backup، Diagnostics.
- **Design tokens**: type scale، spacing، radii، shadows، semantic colors، states.
- **Component specs**: buttons، inputs، select، cards، tables، badges، toast، dialogs، drawer، empty states.
- Prototype قابل للنقر لمسار: Teacher starts session → Student joins → Teacher approves → Student opens lesson.

## 9. Handoff Checklist

- [ ] كل شاشة لها Default + Empty + Loading + Error.
- [ ] كل CTA له label عربي واضح.
- [ ] لا توجد مصطلحات شبكات في المسار الأساسي.
- [ ] AI disabled/no-key state مصممة.
- [ ] جلسة الطالب expired/rejected/ended مصممة.
- [ ] Mobile student flow مجرّب على 360px.
- [ ] Components مسماة بنفس أسماء design system المتفق عليها.
- [ ] Figma frames مرتبة حسب Screen IDs الموجودة في هذا المستند.

## 10. ترتيب التصميم المقترح

| الترتيب | الشاشات |
| --- | --- |
| **Sprint UX 1** | T05 Dashboard، T06 Classes، T07 Create Class، T08 Class Overview |
| **Sprint UX 2** | T09 Live Access، T10 Access Requests، S01 Join، S02 Pending، S04 Student Home |
| **Sprint UX 3** | T12 Lessons، T13 Editor، T14 AI Drawer، S05/S06 Lesson |
| **Sprint UX 4** | T15–T17 Activities/Submissions، S07/S08 Activity flow |
| **Sprint UX 5** | T04/T19 AI Settings، T20 Backup، T21 Diagnostics، system states |
