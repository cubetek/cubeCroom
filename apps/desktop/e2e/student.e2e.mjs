import {
  clickLabeled,
  chooseOption,
  clickText,
  closeStudentBrowser,
  consoleErrors,
  documentStep,
  ensureOnboarded,
  horizontalOverflow,
  openStudentBrowser,
  screenText,
  setViewport,
  studentFetch,
  switchToStudent,
  switchToTeacher,
  timings,
  typeInto,
  waitForText,
} from './helpers.mjs';
import {
  ACTIVITY_TITLE,
  CLASS_NAME,
  LESSON_TITLE,
  QUESTION,
  RIGHT,
  STUDENT_NAME,
  TEACHER_NAME,
  WRONG,
} from './fixtures.mjs';

/**
 * نظام الطالب من جهة المعلم — كل شاشة في جرد `S`، على الحزمة المغلَّفة.
 *
 * **جهازان لا نافذتان:** المعلم على Electron، والطالب على Chrome حقيقي.
 * وكلّ خطوة تُوثَّق: لقطة، ونصّها، وأزمنة تحميلها كما قاسها المتصفّح، وما
 * اشتكى منه في وحدة التحكّم. فالمراقبة ليست ملحقاً بالفحص — هي نصفه: صفحةٌ
 * تُرسم صحيحة بعد ثماني ثوانٍ صفحةٌ فاشلة أمام طفل ينتظر.
 *
 * والترتيب هو ترتيب الحصة نفسها: يُنشئ المعلم، ثم يفتح، ثم يبتّ، ثم يُنهي.
 */

const STUDENT = STUDENT_NAME;

/** سقف زمن نراه مقبولاً لصفحة يفتحها طفل على شبكة مدرسة. */
const SLOW_MS = 3000;

/** ما تجاوز السقف — يُجمع ويُقال في آخر الجولة بدل أن يُسقطها في وسطها. */
const slow = [];

async function watch(label) {
  const measured = await timings();
  if (measured !== null && measured.load > SLOW_MS) {
    slow.push(`${label}: ${measured.load}ms`);
  }
  const errors = await consoleErrors();
  return { measured, errors };
}

describe('نظام الطالب — من إعداد المعلم إلى إنهاء الحصة', () => {
  let joinUrl = null;
  let joinCode = null;

  after(async () => {
    // الملاحظات تُلحق فور التقاطها في `helpers.mjs` — لا تُكتب دفعةً هنا.
    if (slow.length > 0) console.log(`\nصفحات تجاوزت ${SLOW_MS}ms:\n  ${slow.join('\n  ')}`);
    await closeStudentBrowser();
  });

  /* ── ١. المعلم يجهّز ما سيراه الطالب ─────────────────────────────── */

  it('١ · المعلم يُعِدّ جهازه وينشئ فصله', async () => {
    await ensureOnboarded(TEACHER_NAME);

    await clickText('الفصول');
    const text = await screenText();
    if (!text.includes(CLASS_NAME)) {
      await clickText('إنشاء فصل');
      await typeInto('اسم الفصل', CLASS_NAME);
      await clickText('إنشاء الفصل');
      await waitForText(CLASS_NAME, 20_000);
    }

    await documentStep('teacher-classes', {
      title: 'T06 — فصول المعلم',
      notes: [{ at: CLASS_NAME, text: 'الفصل الذي سيدخله الطلاب. كل حصة تُفتح لفصل واحد.' }],
    });
  });

  it('٢ · درسٌ منشور — لأن المسودة لا يراها طالب', async () => {
    await clickText('فتح الفصل');
    await waitForText('الدروس والمحتوى', 25_000);

    /*
     * يُنشأ الدرس إن لم يكن منشوراً بعد.
     *
     * هذا الملفّ يعمل على بيانات قد خلّفها سيناريو المعلم، وإنشاء درسٍ ثانٍ
     * بالاسم نفسه يجعل النقر بالنصّ يصيب أيّهما — فيصير الفحص متذبذباً.
     */
    if (!(await screenText()).includes('منشور للطلاب')) {
      await clickText('إنشاء درس');
      await waitForText('نشر للطلاب', 25_000);
      await clickText('نشر للطلاب');
      await waitForText('منشور للطلاب', 20_000);
      await clickText('الدروس والمحتوى');
      await waitForText('منشور للطلاب', 20_000);
    }

    await documentStep('teacher-lesson', {
      title: 'T13 — محرّر الدرس',
      notes: [
        {
          at: 'منشور للطلاب',
          text: 'الدرس لا يصل الطالب إلا بعد النشر (FR-009). المسودة تبقى عند المعلم وحده.',
        },
      ],
    });
  });

  it('٣ · نشاطٌ باختيارٍ من متعدد، منشور ومربوط بالدرس', async () => {
    await clickText('الأنشطة والنتائج');
    await waitForText('إنشاء نشاط', 25_000);

    if ((await screenText()).includes(ACTIVITY_TITLE)) {
      await documentStep('teacher-activity', {
        title: 'T15 — أنشطة الفصل',
        notes: [{ at: ACTIVITY_TITLE, text: 'النشاط المنشور — الطالب يراه في تبويب «الأنشطة».' }],
      });
      return;
    }

    await clickText('إنشاء نشاط');
    await waitForText('عنوان النشاط', 25_000);

    await typeInto('عنوان النشاط', ACTIVITY_TITLE);
    // الربط بالدرس: النشاط يظهر داخل الدرس نفسه، لا في قائمة منفصلة وحدها.
    await chooseOption('الدرس المرتبط', LESSON_TITLE);

    /*
     * النشاط يُخلق **بلا أسئلة** — وهذا مقصود في T16: لا يُفترض عدد ولا نوع.
     * فالسؤال يُضاف أولاً، ثم يُملأ.
     */
    await clickText('إضافة سؤال');
    await waitForText('نص السؤال', 20_000);
    await typeInto('نص السؤال', QUESTION);
    await typeInto('نص الخيار ١', RIGHT);
    await typeInto('نص الخيار ٢', WRONG);
    // مفتاح الإجابة يُعلَّم هنا — وهو ما **لا** يجوز أن يصل جهاز الطالب.
    await clickLabeled('الإجابة الصحيحة: الخيار ١');

    await documentStep('teacher-activity', {
      title: 'T16 — بناء النشاط',
      notes: [
        { at: 'علّم الإجابة الصحيحة', text: 'مفتاح الإجابة يبقى عند المعلم — لا يُرسل إلى المتصفّح.' },
        { at: QUESTION, text: 'نصّ السؤال كما سيقرؤه الطالب.' },
      ],
    });

    await clickText('نشر للطلاب', { last: true });
    await waitForText('منشور للطلاب', 20_000);
  });

  /* ── ٢. الحصة تُفتح ─────────────────────────────────────────────── */

  it('٤ · T09 — المعلم يشغّل دخول الطلاب', async () => {
    await clickText('تشغيل دخول الطلاب');
    await clickText('تشغيل دخول الطلاب', { last: true });

    await browser.waitUntil(async () => /https?:\/\/[\d.]+:\d+/.test(await screenText()), {
      timeout: 45_000,
      interval: 800,
      timeoutMsg: 'لم يظهر رابط الحصة',
    });

    const text = await screenText();
    joinUrl = `${text.match(/https?:\/\/[\d.]+:\d+/)[0]}/join`;
    joinCode = text.match(/[٠-٩]{3}\s[٠-٩]{3}/)[0];

    await documentStep('teacher-access', {
      title: 'T09 — مشاركة الحصة',
      notes: [
        { at: joinCode, text: 'رمز الحصة: يُكتب على السبورة، ويكتبه كل طالب مع اسمه.' },
        { at: 'cubecroom.local', text: 'عنوانٌ بالاسم يُعلَن على الشبكة — أقصر من الأرقام وأقلّ خطأً.' },
        { at: joinUrl.replace('/join', ''), text: 'العنوان الرقمي يبقى معروضاً: بعض الشبكات تمنع إعلان الاسم.' },
      ],
    });

    expect(joinCode).toMatch(/^[٠-٩]{3} [٠-٩]{3}$/);
  });

  /* ── ٣. الطالب: S01 ⇦ S03 ⇦ S02 ⇦ S04 ⇦ S05 ⇦ S06 ⇦ S07 ⇦ S08 ⇦ S09 ── */

  it('٥ · S01 — الطالب يفتح العنوان في متصفّحه', async () => {
    await openStudentBrowser(joinUrl);
    const { measured, errors } = await watch('S01 الانضمام');

    const text = await documentStep('s01-join', {
      title: 'S01 — الانضمام إلى الفصل',
      notes: [
        { at: 'رمز الحصة', text: 'الرمز أولاً: بلاه لا يصل الطلب أصلاً.' },
        { at: 'اسمك', text: 'الاسم كما يريد المعلم أن يراه. لا حساب ولا كلمة مرور.' },
        { at: CLASS_NAME, text: 'اسم الفصل يطمئن الطالب أنه في المكان الصحيح.' },
      ],
    });

    expect(text).toContain(CLASS_NAME);
    expect(text).not.toContain('كلمة المرور');
    expect(errors).toEqual([]);
    expect(measured === null || measured.load).toBeDefined();
  });

  it('٦ · §22 — رمزٌ خاطئ يُرفض قبل أن يصل قائمة المعلم', async () => {
    await typeInto('رمز الحصة', '000000');
    await typeInto('اسمك', 'جارٌ فضولي');
    await clickText('طلب الدخول');
    await waitForText('غير مطابق', 20_000);

    const text = await documentStep('s01-wrong-code', {
      title: 'S01 — رمز غير مطابق',
      notes: [
        {
          at: 'غير مطابق',
          text: 'الرسالة تقول ماذا يفعل الطالب لا أنه أخطأ: يسأل معلمه عن الرمز.',
        },
      ],
    });

    expect(text).toContain('معلمك');
  });

  it('٧ · S02 — بالرمز الصحيح يُرسَل الطلب وينتظر', async () => {
    await typeInto('رمز الحصة', joinCode);
    await typeInto('اسمك', STUDENT);
    await clickText('طلب الدخول');
    await waitForText('بانتظار', 25_000);

    const text = await documentStep('s02-pending', {
      title: 'S02 — بانتظار موافقة المعلم',
      notes: [
        { at: 'بانتظار الموافقة', text: 'الطلب لا يمنح وصولاً: لا درس ولا نشاط قبل موافقة المعلم.' },
        { at: STUDENT, text: 'الاسم الذي وصل جهاز المعلم — يستطيع الطالب تعديله وإعادة الإرسال.' },
      ],
    });

    expect(text).not.toContain(LESSON_TITLE);
  });

  it('٨ · S03 — المعلم يرفض، فيرى الطالب رفضاً قابلاً لإعادة المحاولة', async () => {
    await switchToTeacher();
    await clickText('طلبات الدخول');
    await waitForText(STUDENT, 25_000);

    await documentStep('t10-requests', {
      title: 'T10 — طلبات الدخول',
      notes: [
        { at: STUDENT, text: 'كل طلب يحمل اسمه ووقته. لا يدخل أحد قبل أن يبتّ المعلم فيه.' },
        { at: 'قبول', text: 'القبول نقرة واحدة — الحصة لا تحتمل حواراً لكل طالب.' },
      ],
    });

    await clickText('رفض');
    await browser.pause(1500);

    await switchToStudent();
    await waitForText('لم يُقبل طلبك', 30_000);
    const text = await documentStep('s03-rejected', {
      title: 'S03 — لم يُقبل الطلب',
      notes: [
        { at: 'لم تُحفظ عنك', text: 'الرفض لا يترك أثراً عن الطالب — ولا يُغلق الباب أمامه.' },
        { at: 'إعادة المحاولة', text: 'الرفض قابل لإعادة المحاولة دائماً (قرار C4).' },
      ],
    });

    expect(text).toContain('إعادة المحاولة');
  });

  it('٩ · S04 — يعيد المحاولة، فيقبله المعلم فيدخل بلا تحديث يدوي', async () => {
    await clickText('إعادة المحاولة');
    await typeInto('رمز الحصة', joinCode);
    await typeInto('اسمك', STUDENT);
    await clickText('طلب الدخول');
    await waitForText('بانتظار', 25_000);

    await switchToTeacher();
    await waitForText(STUDENT, 30_000);
    await clickText('قبول');
    await browser.pause(1500);
    await documentStep('t10-approved', { title: 'T10 — الطلب بعد قبوله' });

    await switchToStudent();
    // اللوح يَعِد بأنها «تُفتح تلقائياً» — فلا يُنقر زرّ تحديث هنا.
    await waitForText(CLASS_NAME, 45_000);
    const { errors } = await watch('S04 الرئيسية');

    const text = await documentStep('s04-home', {
      title: 'S04 — رئيسية الطالب',
      notes: [
        { at: 'سارة العتيبي', text: 'اسم المعلم والفصل: الطالب يعرف أنه دخل الصفّ الصحيح.' },
        { at: 'الدروس', text: 'شريط سفليّ بثلاثة تبويبات: الرئيسية · الدروس · الأنشطة.' },
      ],
    });

    expect(text).toContain('سارة العتيبي');
    expect(errors).toEqual([]);
  });

  it('١٠ · S05 · S06 — قائمة الدروس ثم عارض الدرس', async () => {
    await waitForText(LESSON_TITLE, 30_000);

    /*
     * **التبويب يُفتح قبل أن يُصوَّر.**
     *
     * كانت اللقطة تُؤخذ هنا مباشرة والطالب ما زال على الرئيسية — فخرجت صورةٌ
     * مطابقة لسابقتها بايتاً ببايت، وفوقها عنوان «دروس الطالب». ولم يكشفها
     * الفحص: عنوان الدرس يظهر في الرئيسية أيضاً بطاقةَ «آخر درس»، فالانتظار
     * ينجح والتأكيد ينجح — والصورة تكذب وحدها.
     */
    await clickText('الدروس');
    await waitForText('الدروس', 15_000);
    await documentStep('s05-lessons', {
      title: 'S05 — دروس الطالب',
      notes: [{ at: LESSON_TITLE, text: 'الدروس المنشورة وحدها. المسودة لا تظهر هنا ولا تُفتح برابطها.' }],
    });

    await clickText(LESSON_TITLE);
    const { errors } = await watch('S06 عارض الدرس');
    const text = await documentStep('s06-viewer', {
      title: 'S06 — عارض الدرس',
      notes: [{ at: LESSON_TITLE, text: 'عنوان الدرس ومحتواه كما نشره المعلم.' }],
    });

    expect(text).toContain(LESSON_TITLE);
    // مساعدة الذكاء الاصطناعي مخفيّة تماماً لا معطّلة — قرار D10.
    expect(text).not.toContain('اسأل عن شيء في الدرس');
    expect(errors).toEqual([]);
  });

  it('١١ · S07 — النشاط يصل بلا مفتاح إجابته', async () => {
    /*
     * **عارض الدرس صفحةٌ بلا شريط تبويبات — فيُخرَج منه قبل التنقّل.**
     *
     * الشريط السفليّ (الرئيسية · الدروس · الأنشطة) يظهر في قوائم الطالب لا
     * في قراءة الدرس: القراءة تأخذ الشاشة كلها عمداً. وكان الفحص ينقر
     * «الأنشطة» وهو داخل الدرس، فلا يجد شيئاً — ويسقط معه كل ما بعده: خمس
     * شاشات لم تُصوَّر، وستّ خطوات فشلت لسببٍ واحد في أوّلها.
     *
     * والرجوع بالرابط الذي يراه الطالب — «الدروس» في أعلى الصفحة — لا بزرّ
     * المتصفّح: هذا ما يفعله هو.
     */
    await clickText('الدروس');
    await waitForText('درس منشور', 20_000);

    await clickText('الأنشطة');
    await waitForText(ACTIVITY_TITLE, 30_000);
    await documentStep('s07-activities', {
      title: 'S07 — أنشطة الطالب',
      notes: [{ at: ACTIVITY_TITLE, text: 'الأنشطة المنشورة وحدها، وكل واحد يحمل حالته.' }],
    });

    await clickText(ACTIVITY_TITLE);
    await waitForText(QUESTION, 30_000);

    const text = await documentStep('s07-question', {
      title: 'S07 — الإجابة عن السؤال',
      notes: [
        { at: QUESTION, text: 'السؤال كما كتبه المعلم.' },
        { at: RIGHT, text: 'الخيارات تصل بلا علامة صواب: مفتاح الإجابة لا يغادر جهاز المعلم.' },
      ],
    });

    /*
     * **الإثبات في المصدر لا في الشاشة.** خيارٌ صحيح قد يُخفى بصرياً ويبقى
     * في HTML أو في حالة الصفحة — فيقرؤه طالبٌ يفتح أدوات المطوّر.
     */
    const leaked = await browser.execute(() => {
      const source = document.documentElement.outerHTML;
      return {
        isCorrect: source.includes('isCorrect'),
        expected: source.includes('expectedAnswer'),
      };
    });
    expect(leaked.isCorrect).toBe(false);
    expect(leaked.expected).toBe(false);
    expect(text).toContain(QUESTION);
  });

  it('١٢ · S08 — يُرسل إجابته فيأخذ إيصالاً بختم وقت', async () => {
    await clickText(RIGHT);
    await clickText('إرسال الإجابة');
    await waitForText('تم إرسال إجابتك', 30_000);

    const { errors } = await watch('S08 الإيصال');
    const text = await documentStep('s08-submitted', {
      title: 'S08 — تم إرسال الإجابة',
      notes: [
        { at: 'تم إرسال إجابتك', text: 'إيصالٌ بختم وقت: الطالب يعرف أن إجابته وصلت فعلاً.' },
        { at: 'وقت الإرسال', text: 'الوقت من جهاز المعلم لا من جهاز الطالب.' },
      ],
    });

    expect(text).toContain('بانتظار مراجعة معلمك');
    expect(errors).toEqual([]);
  });

  /**
   * المقاس على لوحيّ رأسيّ — **المدى الذي لا يغطّيه أحد**.
   *
   * القرار D15: «طلاب هذا المنتج على حواسيب ولوحيّات لا هواتف»، والبوابة
   * تتوسّع فوق `900px`. وهو **استعلام الوسائط الوحيد** في بوابة الطالب، في
   * أربعة ملفّات من سبعة — وثلاثة بلا استعلام واحد، منها شريط التنقّل السفليّ.
   *
   * فما بين ٧٦٨ و٩٠٠ مدى لا يخصّه شيء: أضيقُ من حدّ التوسّع، وأوسعُ من مقاس
   * الهاتف الذي رُسمت له الألواح أصلاً. واللوحيّ الرأسيّ يقع فيه بالضبط —
   * وهو جهازٌ يذكره القرار بالاسم.
   *
   * ويُقاس هنا لا في ملفٍّ مستقلّ: الطالب **داخلٌ الآن** بكعكة جلسةٍ حيّة
   * ومحتوىً حقيقيّ. وفتحُ جلسةٍ ثانية يعني إعادة الطلب والموافقة كلّها لقياسٍ
   * يستغرق ثوانيَ ثلاثاً.
   */
  it('١٢ب · المقاس — بوابة الطالب على لوحيّ رأسيّ (768px)', async () => {
    const got = await setViewport(768, 1024);
    const spills = [];

    /*
     * الشاشة الحالية أولاً، ثمّ التبويبات **إن كان شريطها ظاهراً**.
     *
     * الشريط السفليّ يظهر في القوائم لا في صفحات القراءة والإرسال: عارضُ
     * الدرس وشاشةُ «تم إرسال إجابتك» تأخذان الشاشة كاملة عمداً. فالنقر عليه
     * حيث لا يوجد يُسقط القياس كلَّه — وهو أوسع الشاشات وأولاها بالقياس.
     */
    const look = async (label) => {
      const seen = await horizontalOverflow();
      if (seen.overflows) {
        spills.push(
          `${label}: +${seen.by}px — ${seen.culprits.map((c) => `${c.tag}.${c.cls.split(' ')[0]}`).join('، ')}`,
        );
      }
    };

    await look('شاشة الإرسال');

    for (const tab of ['الرئيسية', 'الدروس', 'الأنشطة']) {
      if (!(await screenText()).includes(tab)) continue;
      await clickText(tab).catch(() => {});
      await browser.pause(600);
      await look(tab);
    }

    // يُعاد المقاس قبل أيّ لقطة تالية: لقطات الدليل بمقاس الحاسوب لا اللوحيّ.
    await setViewport(1280, 900);

    /*
     * **ويُعاد الطالب إلى حيث وجدناه.**
     *
     * الخطوة ١٥ تبدأ من إيصال الإرسال وتنقر «العودة إلى الفصل». وهذا القياس
     * يتنقّل بين التبويبات الثلاثة، فيتركه على «الأنشطة» — فتسقط ١٥ وما
     * بعدها بسببٍ ليس فيها.
     *
     * وقياسٌ يغيّر الحالة التي يقيسها **دَينٌ على من بعده**: يُسدَّد هنا لا
     * يُترك ليُكتشف بعد ثلاث خطوات.
     */
    await clickText(ACTIVITY_TITLE);
    await waitForText('العودة إلى الفصل', 20_000);

    expect(`${got.width}`).toBe('768');
    expect(spills).toEqual([]);
  });

  it('١٣ · T17 — الإجابة وصلت جهاز المعلم', async () => {
    await switchToTeacher();
    await clickText('الأنشطة والنتائج');
    await waitForText(ACTIVITY_TITLE, 25_000);
    await clickText('عرض النتائج');
    await waitForText(STUDENT, 25_000);

    const text = await documentStep('t17-submissions', {
      title: 'T17 — إجابات الطلاب',
      notes: [{ at: STUDENT, text: 'إجابة الطالب في قاعدة المعلم — لا في متصفّح الطالب.' }],
    });

    expect(text).toContain(STUDENT);
  });

  /**
   * ١٤ · تصدير النتائج — والشاشة مفتوحة من الخطوة السابقة، فلا تنقّل.
   *
   * ويُفحص بعد وصول تسليمٍ فعليّ: بلا تسليم تعرض `T17` حالتها الفارغة،
   * ويختفي شريط التصدير كلّه — فيمرّ الفحص على شاشةٍ لا زرّ فيها.
   */
  it('١٤ · T17 — تصدير النتائج إلى ملفّ يشاركه المعلم', async () => {
    await clickText('تصدير النتائج');

    /*
     * لا يُفحص بـ«النتائج»: تبويب «الأنشطة والنتائج» فوق الشاشة يحملها، فيمرّ
     * الفحص بلا أن يُصدَّر شيء. ولا بالاسم ولا بالعدد — كلاهما يتغيّر مع كل
     * جولة (ختم وقت، وعدد الفصل). فالمفحوص ما يثبت: امتداد الملفّ.
     */
    await waitForText('.csv', 25_000);
    const text = await documentStep('t17-export', {
      title: 'T17 — تصدير النتائج',
      notes: [
        { at: 'تصدير النتائج', text: 'يخرج الملفّ إلى مجلد على الجهاز — لا رفع ولا حساب.' },
        {
          at: 'فتح المجلد',
          text: 'ولا يُملى على المعلم مسار: نقرةٌ تفتح المجلد الذي كُتب فيه.',
        },
      ],
    });

    expect(text).toContain('.csv');
    // ولا يُنقر «فتح المجلد»: يفتح مستكشف ويندوز فوق نافذة الفحص.
  });

  it('١٥ · الطالب يبقى على عارض الدرس — ثم يُنهي المعلم الحصة', async () => {
    /*
     * **الطالب يُترك على عارض الدرس عمداً.**
     *
     * الرئيسية تستطلع الخادم أصلاً، فنجاحها لا يُثبت شيئاً جديداً. وعارض
     * الدرس كان الصفحة التي **لا تسأل**: يبقى الطالب فيها يقرأ درساً انتهت
     * حصّته، ثم ينقر رابطاً فيرى صفحة خطأ من متصفّحه. فهنا يُفحص الإصلاح.
     */
    await switchToStudent();
    // من الإيصال إلى الفصل، ثم إلى الدرس — كما يمشي الطالب لا بقفزة.
    await clickText('العودة إلى الفصل');
    await waitForText(CLASS_NAME, 30_000);
    await clickText('الدروس');
    await waitForText(LESSON_TITLE, 25_000);
    await clickText(LESSON_TITLE);
    await waitForText('نُشر', 25_000);

    await switchToTeacher();
    await clickText('تشغيل دخول الطلاب');
    await clickText('إنهاء دخول الطلاب');

    /*
     * الإنهاء لا يقع بنقرة واحدة — يسأل أولاً.
     *
     * وهذا صواب لا عائق: زرٌّ أحمر يقطع الحصة على ثلاثين طالباً لا يُنقر
     * سهواً. والفحص يمرّ من حيث يمرّ المعلم: يقرأ السؤال ثم يؤكّد.
     */
    await waitForText('سيتوقف الرابط والرمز عن العمل فوراً', 15_000);
    await documentStep('t09-confirm-end', {
      title: 'T09 — تأكيد إنهاء الحصة',
      notes: [
        { at: 'سيتوقف الرابط والرمز', text: 'الإنهاء يُسأل عنه: زرٌّ يقطع الحصة لا يُنقر سهواً.' },
        { at: 'إبقاء الدخول مفتوحاً', text: 'التراجع هو الخيار الأسهل — والإنهاء يحتاج قصداً.' },
      ],
    });

    await clickText('إنهاء الدخول', { last: true });
    await waitForText('دخول الطلاب متوقف', 25_000);

    await documentStep('t09-stopped', {
      title: 'T09 — بعد إنهاء الحصة',
      notes: [
        {
          at: 'دخول الطلاب متوقف',
          text: 'الباب يُغلق فعلاً: تُوقَف عملية خادم الطلاب، فلا يبقى مسار يُحجب.',
        },
      ],
    });
  });

  it('١٦ · S09 — الصفحة التي لا تستطلع صارت تقول ذلك بلا أن تخمّن سببه', async () => {
    await switchToStudent();

    /*
     * **الرمز لا يُحجب — الخادم كلّه يذهب.**
     *
     * فلا يصل الطالبَ ٤٠٣ يقرؤها، بل لا يصله شيء: الطلب يفشل في الشبكة
     * (الحالة صفر). وهذا أقوى من إبطال رمز، وأصعب على الواجهة: كان
     * الاستثناء يُبتلع صامتاً فيبقى الطالب ينظر إلى دروسٍ لم يعد يملكها.
     */
    const gone = await studentFetch('/api/student/lessons');
    expect([0, 403, 410]).toContain(gone.status);

    /*
     * ثلاث محاولات فاشلة على مهل ثلاث ثوانٍ = تسع ثوانٍ للاكتشاف.
     *
     * والمهلة هنا **ضيّقة عمداً**: مهلةٌ فضفاضة تمرّ لو عاد الإيقاع إلى عشر
     * ثوانٍ — فلا تحرس الرقم الذي اختير. والصفحة عارضُ الدرس: لا استطلاع
     * فيها قبل اليوم.
     */
    await waitForText('انقطع الاتصال', 25_000);

    const text = await documentStep('s09-lost', {
      title: 'S09 — انقطع الاتصال، والطالب على عارض الدرس',
      notes: [
        {
          at: 'انقطع الاتصال بجهاز معلمك',
          text: 'لا يُقال «أنهى معلمك الحصة» جزماً: الخروج من Wi-Fi يعطي الأثر نفسه.',
        },
        { at: 'محفوظ عنده', text: 'الطمأنة أولاً — الطالب يخاف على ما أرسله قبل أن يسأل عن السبب.' },
      ],
    });

    // ولا يبقى محتوى الفصل معروضاً بعد أن انقطع الوصول إليه.
    expect(text).not.toContain(LESSON_TITLE);
    expect(text).toContain('أبقِ هذه الصفحة مفتوحة');
  });

  it('١٧ · وحين تبدأ الحصة القادمة، يعرف الطالب أنها ليست حصّته', async () => {
    /*
     * **الحالة الثانية: الخادم يردّ ويرفض.**
     *
     * المعلم يشغّل حصة جديدة، وفي جهاز الطالب صفحةٌ من حصة أمس ما زالت
     * مفتوحة. هنا نعرف يقيناً — الخادم ردّ ٤٠٣ — فيُقال له «انتهت الحصة»
     * جزماً لا تخميناً، وهو الفرق بين الرسالتين.
     */
    await switchToTeacher();
    await clickText('تشغيل دخول الطلاب', { last: true });
    await browser.waitUntil(async () => (await screenText()).includes('دخول الطلاب متاح'), {
      timeout: 45_000,
      interval: 800,
      timeoutMsg: 'لم تبدأ الحصة الثانية',
    });

    await switchToStudent();
    await waitForText('انتهت الحصة', 45_000);

    const text = await documentStep('s09-ended', {
      title: 'S09 — انتهت الحصة (حصةٌ جديدة، ورمزٌ قديم)',
      notes: [
        {
          at: 'انتهت الحصة',
          text: 'هنا يُجزم بالسبب: الخادم ردّ ورفض الرمز — لا صمت يُخمَّن.',
        },
        { at: 'حتى يشغّلها مرة أخرى', text: 'ورمز الحصة القديم لا يفتح الجديدة: يُطلب الدخول من أوله.' },
      ],
    });

    expect(text).not.toContain(LESSON_TITLE);
  });
});
