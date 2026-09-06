import { writeFileSync } from 'node:fs';
import {
  capturedNotes,
  clickText,
  documentStep,
  ensureOnboarded,
  screenText,
  waitForText,
} from './helpers.mjs';
import { unreachableFile } from './paths.mjs';
import {
  ACTIVITY_TITLE,
  CLASS_NAME,
  LESSON_TITLE,
  STUDENT_NAME,
  TEACHER_NAME,
} from './fixtures.mjs';

/**
 * التقاط ما تبقّى من شاشات المعلم — **لدليل الاستخدام لا للتحقق**.
 *
 * الملفّان السابقان يفحصان تدفّقاً: كل خطوة تُثبت أن التي قبلها عملت، وفشلُ
 * واحدة يوقف ما بعدها بحقّ. وهذا الملفّ غرضه آخر: **زيارة كل شاشة وتصويرها**.
 * فشرطه معكوس — شاشةٌ تتعذّر تُسجَّل ويُمضى إلى غيرها، وإلّا حرمت شاشةٌ واحدة
 * الدليلَ من عشر.
 *
 * ولا يمرّ الفشل صامتاً: ما تعذّر يُكتب في `unreachable.json` بجانب اللقطات،
 * ويُطبع في آخر الجولة، ويُذكر في الدليل نفسه — «هذه الشاشة لم تُصوَّر ولماذا».
 *
 * ويأتي أخيراً في `wdio.conf.mjs` عمداً: التطبيق حينها ممتلئ — فصلٌ ودرسٌ
 * ونشاطٌ وطالبةٌ وإجابةٌ مُرسَلة. وشاشةٌ فارغة لا تعلّم أحداً كيف يستعملها.
 */

/** يعود إلى جذر الواجهة أياً كان موضعها — كل زيارة تبدأ من مكان معروف. */
async function toRoot() {
  const text = await screenText();
  for (const back of ['رجوع', 'إغلاق', '← رجوع']) {
    if (text.includes(back)) {
      await clickText(back).catch(() => {});
      break;
    }
  }
  await clickText('الرئيسية').catch(() => {});
  await waitForText('الفصول', 15_000);
}

async function openClassSection(label) {
  await toRoot();
  await clickText('الفصول');
  await waitForText(CLASS_NAME, 15_000);
  await clickText('فتح الفصل');
  await waitForText('الدروس والمحتوى', 20_000);
  await clickText(label);
}

/**
 * يفتح محرّر الدرس.
 *
 * **والانتظار على «المرفقات» لا على «نشر للطلاب».** الزرّ يقول «نشر للطلاب»
 * في المسودّة و«إلغاء النشر» بعد النشر — والدرس هنا منشورٌ دائماً لأن تدفّق
 * الطالب يحتاجه كذلك. فكان الانتظار على نصٍّ لا يظهر أبداً في هذا السياق،
 * وسقطت شاشتان لسببٍ ليس فيهما.
 */
async function openLessonEditor() {
  await openClassSection('الدروس والمحتوى');
  await clickText(LESSON_TITLE);
  await waitForText('المرفقات', 20_000);
}

async function openActivityBuilder() {
  await openClassSection('الأنشطة والنتائج');
  await clickText(ACTIVITY_TITLE);
  await waitForText('توليد أسئلة من الدرس', 20_000);
}

/**
 * الخطّة — **مُعلَنة بيانات لا مبثوثة في المتن**.
 *
 * وهذا شرط الوفاء بوعد «لا تُتخطّى شاشة»: ما لم يُلتقط يُعرف بمقارنة هذه
 * القائمة بما في `notes.json`. وكانت الزيارات مبثوثة في أربع خطوات، فحين
 * تجاوزت إحداها مهلة Mocha ماتت من خارجها — فلم يُلتقط شيء ولم يُسجَّل شيء:
 * **شاشتان اختفتا من الدليل بلا أثر**، لا في اللقطات ولا في قائمة المتعذّر.
 */
const PLAN = [
  {
    name: 'nav-files',
    title: 'الملفات — كل ما رُفع في مكان واحد',
    reach: async () => {
      await toRoot();
      await clickText('الملفات');
      await waitForText('الملفات', 15_000);
    },
  },
  {
    name: 'nav-ai',
    title: 'الذكاء الاصطناعي — مفتاحك أنت، لا مفتاحنا',
    reach: async () => {
      await toRoot();
      await clickText('الذكاء الاصطناعي');
      await waitForText('الذكاء الاصطناعي', 15_000);
    },
  },
  {
    name: 'nav-settings',
    title: 'الإعدادات',
    reach: async () => {
      await toRoot();
      await clickText('الإعدادات');
      await waitForText('الإعدادات', 15_000);
    },
  },
  {
    name: 'class-overview',
    title: 'نظرة عامة على الفصل',
    reach: () => openClassSection('نظرة عامة'),
  },
  {
    name: 'class-students',
    title: 'الطلاب — من دخل الفصل',
    reach: () => openClassSection('الطلاب'),
  },
  {
    name: 'class-activities',
    title: 'الأنشطة والنتائج',
    reach: () => openClassSection('الأنشطة والنتائج'),
  },
  {
    name: 'lesson-attachments',
    title: 'مرفقات الدرس',
    reach: async () => { await openLessonEditor(); await clickText('المرفقات'); },
  },
  {
    name: 'lesson-ai-drawer',
    title: 'وكيل إعداد الدرس',
    reach: async () => {
      await openLessonEditor();
      await waitForText('جهّز الدرس كاملاً', 20_000);
    },
  },
  {
    name: 'activity-generator',
    title: 'توليد أسئلة من الدرس',
    reach: async () => {
      await openActivityBuilder();
      await clickText('توليد أسئلة من الدرس');
    },
  },
  {
    name: 'activity-review',
    title: 'مراجعة إجابات الطلاب',
    /*
     * **يُدخل إليها من صفّ الطالب لا من زرّ «بدء المراجعة».**
     *
     * ذلك الزرّ لا يظهر إلّا حين توجد إجابةٌ **بانتظار المراجعة**، وسؤال
     * السيناريو سؤال اختيارٍ يُصحَّح آلياً — فلا ينتظر شيء، فلا يظهر الزرّ.
     * وكل صفٍّ في الجدول يحمل مدخله الخاص: «مراجعة» لما ينتظر، و«فتح» لما
     * صُحِّح — والشاشة واحدة.
     */
    reach: async () => {
      await openClassSection('الأنشطة والنتائج');
      await waitForText(ACTIVITY_TITLE, 20_000);
      // عنوان النشاط يفتح بناءه؛ والنتائج لها مدخلها الخاص.
      await clickText('عرض النتائج');
      await waitForText(STUDENT_NAME, 25_000);
      await clickText('فتح');
    },
  },
];

/** ما تعذّر الوصول إليه بسببٍ معروف — يُجمع ولا يُسقط الجولة. */
const failures = new Map();

describe('توثيق — زيارة كل شاشة وتصويرها', () => {
  /**
   * **لا يُنقر شيء قبل أن تُرسم الواجهة، ولا قبل تخطّي الإعداد.**
   *
   * `wdio` يُقلع نسخةً جديدة من التطبيق لكل ملفّ فحص، وأول لحظات Electron
   * نافذةٌ قائمة بلا محتوى. وأسوأ: مجلد مستخدم Electron خاصٌّ بكل جلسة، فتعود
   * شاشات الإعداد وإن كانت البيانات موجودة.
   */
  before(() => ensureOnboarded(TEACHER_NAME));

  /*
   * **خطوةٌ لكل شاشة، لا أربع خطوات تجمع عشراً.**
   *
   * مهلة Mocha تقتل الخطوة من خارجها، فلا يبلغها `try/catch` في المتن. وخطوةٌ
   * تحمل ثلاث زيارات تُسقط الثلاث معاً حين تتجاوز المهلة واحدةٌ منها.
   */
  for (const screen of PLAN) {
    it(`يوثّق: ${screen.title}`, async () => {
      try {
        await screen.reach();
        await documentStep(screen.name, { title: screen.title });
      } catch (error) {
        const why = error instanceof Error ? error.message : String(error);
        failures.set(screen.name, why.split('\n')[0].slice(0, 300));
        console.warn(`⚠ تعذّر توثيق «${screen.title}» — ${why.split('\n')[0]}`);
      }
    });
  }

  after(() => {
    /*
     * **ما لم يُصوَّر يُكتب باسمه — ويُعرف بالمقارنة لا بالثقة.**
     *
     * ما في `notes.json` هو ما التُقط فعلاً. وكل اسمٍ في الخطّة لا يقابله شيء
     * هناك شاشةٌ ناقصة، سواء عرفنا سببها أم ماتت خطوتها بمهلة من خارجها.
     * ودليلٌ ينقصه شاشة ولا يقول ذلك يترك قارئه يظنّ أنها غير موجودة.
     */
    const taken = new Set(capturedNotes().map((one) => one.name));

    const unreachable = PLAN.filter((screen) => !taken.has(screen.name)).map((screen) => ({
      name: screen.name,
      title: screen.title,
      why: failures.get(screen.name) ?? 'انتهت مهلة الخطوة قبل أن تكتمل.',
    }));

    /*
     * وشاشة `Recovery` تُذكر دائماً: لا يُوصل إليها إلّا بعد سقوط التطبيق —
     * وإسقاطه عمداً في فحصٍ يقود الحزمة المغلَّفة يترك خلفه حالةً لا تُنظَّف.
     */
    unreachable.push({
      name: 'recovery',
      title: 'استعادة بعد تعطّل',
      why: 'لا تظهر إلّا بعد سقوط التطبيق — تُوثَّق بالوصف لا باللقطة.',
    });

    writeFileSync(unreachableFile, JSON.stringify(unreachable, null, 2), 'utf8');

    // والملاحظات تُلحق فور التقاطها — تُقرأ هنا للعدّ لا للكتابة.
    console.log(`\nوُثِّقت ${taken.size} شاشة · تعذّرت ${unreachable.length}`);
    for (const one of unreachable) console.log(`  ✗ ${one.title} — ${one.why}`);
  });
});
