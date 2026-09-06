import { clickText, documentStep, typeInto, waitForText } from './helpers.mjs';
import { CLASS_NAME, LESSON_BODY, LESSON_TITLE } from './fixtures.mjs';

/**
 * سيناريو المعلم من أوله — على الحزمة المغلَّفة نفسها.
 *
 * **وكل لقطة تحمل عنوانها.** كانت تُلتقط بـ`record` — صورةٌ ونصّها وكفى —
 * فلا تدخل `notes.json`، فلا يعرفها دليل الاستخدام. فكان الدليل يبدأ من
 * منتصف القصّة: لا شاشة ترحيب، ولا إنشاء فصل، ولا محرّر درس. و`documentStep`
 * بلا ملاحظات تكلفتها عنوانٌ واحد، ومردودها خمس عشرة شاشة.
 *
 * الترتيب مقصود: كل خطوة تبني على ما قبلها، فالفشل يقول **أين** وقف التدفّق لا
 * أن شيئاً فشل. ولقطة عند كل خطوة: ما لا يُرى لا يُقال إنه يعمل.
 */
describe('تدفّق المعلم — من أول تشغيل إلى حصة', () => {
  it('١ · شاشة الترحيب تظهر بالعربية', async () => {
    await browser.pause(4000);
    const text = await documentStep('welcome', { title: 'أول تشغيل — شاشة الترحيب' });

    expect(text).toContain('أهلاً بك');
    expect(text).toContain('الخطوة ١ من ٣');
    // RTL شرط لا تحسين: الواجهة عربية بالكامل (D1).
    const dir = await browser.execute(() => document.documentElement.dir);
    expect(dir).toBe('rtl');
  });

  it('٢ · بيانات المعلم', async () => {
    await clickText('ابدأ');
    const text = await documentStep('profile', { title: 'تعريف بنفسك — الاسم' });
    expect(text).toContain('الخطوة ٢');

    await typeInto('الاسم', 'سارة العتيبي');
    await documentStep('profile-filled', { title: 'الاسم بعد كتابته' });
  });

  it('٣ · مكان البيانات ثم إنهاء الإعداد', async () => {
    await clickText('التالي');
    await documentStep('data-location', { title: 'أين تُحفظ بياناتك' });

    await clickText('إنهاء الإعداد');
    await waitForText('الرئيسية', 30_000);
    await documentStep('home', { title: 'الرئيسية — حالة الحصة أمامك' });
  });

  it('٤ · إنشاء فصل', async () => {
    await clickText('الفصول');
    await documentStep('classes-empty', { title: 'الفصول — قبل إنشاء أوّل فصل' });

    await clickText('إنشاء فصل');
    await typeInto('اسم الفصل', CLASS_NAME);
    await documentStep('class-dialog', { title: 'إنشاء فصل جديد' });

    await clickText('إنشاء الفصل');
    await waitForText('الصف السادس');
    await documentStep('classes-list', { title: 'الفصول بعد الإنشاء' });
  });

  it('٥ · درس جديد ومحرره', async () => {
    await clickText('فتح الفصل');
    await waitForText('الدروس والمحتوى', 25_000);
    await documentStep('class-view', { title: 'داخل الفصل — الدروس والمحتوى' });

    await clickText('إنشاء درس');
    await waitForText('نشر للطلاب', 25_000);

    /*
     * **درسٌ له عنوان ومحتوى، لا مسودّة فارغة.**
     *
     * كان يُنشر كما يُنشأ: بلا عنوان وبلا كتلة واحدة. والفحص يمرّ — «منشور
     * للطلاب» تظهر — لكن كل لقطةٍ بعدها تعرض «درس بلا عنوان» وصفحةً خالية،
     * على جهاز المعلم وجهاز الطالب معاً. وهذه اللقطات هي دليل الاستخدام.
     *
     * ودرسٌ ممتلئ يفحص أكثر لا أقلّ: حفظُ العنوان، وإضافةُ الكتل، ووصولُ
     * المحتوى إلى عارض الطالب — ولا شيء من ذلك يُفحص في درسٍ فارغ.
     */
    await typeInto('عنوان الدرس', LESSON_TITLE);
    await clickText('تحرير يدوي');
    const editor = await browser.$('[contenteditable="true"][aria-label="محتوى الدرس"]');
    await editor.waitForDisplayed({ timeout: 25_000 });
    await editor.click();
    /*
     * **حرفاً حرفاً — لا السلسلة دفعةً واحدة.**
     *
     * `browser.keys` يقبل مفتاحاً واحداً في كل عنصر، ويردّ السلسلة كاملة بـ
     * «Your key input contains more than one character». والعربية تجعل هذا
     * أقرب ممّا يبدو: «يُ» محرفان لا واحد — ياءٌ وضمّةٌ مركّبة فوقها — فتسقط
     * أول كلمة فيها تشكيل.
     *
     * والتفكيك بـ`[...]` لا بـ`.split('')`: الأول يقطع عند نقاط الترميز
     * فيبقى كل محرف سليماً، والثاني يقطع عند وحدات UTF-16 فيشقّ ما جاوز
     * الصفحة الأساسية نصفين.
     */
    await browser.keys([...LESSON_BODY]);
    await clickText('صفحة الطالب');
    await documentStep('lesson-editor', { title: 'صفحة الدرس' });

    // المسودة لا يراها طالب (FR-009) — فتُنشر ليكون لتدفّق الطالب ما يعرضه.
    await clickText('نشر للطلاب');
    await waitForText('منشور للطلاب', 20_000);
    await clickText('صفحة الطالب');
    await documentStep('lesson-published', { title: 'الدرس بعد نشره للطلاب' });
  });

  it('٦ · تشخيص الاتصال', async () => {
    await clickText('تشخيص الاتصال');
    await waitForText('تشخيص الاتصال', 25_000);
    const text = await documentStep('diagnostics', { title: 'تشخيص الاتصال' });

    // معيار FR-016: كل صفّ يحمل حالته نصّاً لا لوناً وحده.
    expect(text).toMatch(/يعمل|مشكلة|لم يُفحص/);
  });

  it('٧ · النسخ الاحتياطي', async () => {
    await clickText('النسخ الاحتياطي');
    await waitForText('النسخ المحفوظة', 25_000);
    const text = await documentStep('backup', { title: 'النسخ الاحتياطي' });

    expect(text).toContain('بياناتك كلها على هذا الجهاز وحده');
  });

  /**
   * ٨ · تصدير سجلّ التشخيص — الملفّ الذي يرسله المعلم بدل أن يصف عطلاً.
   *
   * والفشل هنا **صامت**: `exportLog` تبتلع كل خطأ وتُعيد الحالة إلى `null`،
   * فلا يتغيّر شيء على الشاشة. ولذلك انتظارُ نصّ النجاح هو الفحص نفسه — لا
   * تزيينٌ بعده.
   */
  it('٨ · T21 — تصدير سجلّ التشخيص', async () => {
    await clickText('تشخيص الاتصال');
    await waitForText('إعادة الفحص', 25_000);

    await clickText('تصدير السجلّ');

    /*
     * «مجلد الصادرات» لا «حُفظ»: الأولى نصٌّ لا يظهر إلا بعد كتابة الملفّ
     * فعلاً، والثانية كلمةٌ شائعة قد تسبقه في الشاشة.
     */
    await waitForText('مجلد الصادرات', 25_000);
    const text = await documentStep('t21-export', { title: 'تصدير سجلّ التشخيص' });

    expect(text).toContain('أرسله لمن يساعدك');
  });

  /**
   * ٩ · منفذ دخول الطلاب — ويُعاد إلى الافتراضي في آخر الخطوة.
   *
   * **الإعادة ليست تنظيفاً بل شرط صحّة:** المنفذ يُكتب في ملفّ إعدادات الجهاز
   * ويبقى بعد انتهاء الفحص، فجولةٌ تترك ٤٣٢٠ تجعل كل جولةٍ بعدها تُقلع على
   * منفذٍ لم يختره أحد — وفحصٌ يغيّر بيئته ليس فحصاً.
   */
  it('٩ · T22 — ضبط منفذ دخول الطلاب ثم إعادته', async () => {
    await clickText('الإعدادات');
    await waitForText('إعدادات متقدّمة', 25_000);
    await clickText('إعدادات متقدّمة');
    await waitForText('اتركه فارغاً للافتراضي', 20_000);

    await typeInto('منفذ دخول الطلاب', '4320');
    await clickText('حفظ المنفذ');
    await waitForText('حُفظ', 20_000);

    /*
     * الرسالة وحدها لا تُثبت أن القيمة حُفظت — تظهر أيضاً على حفظٍ لا يغيّر
     * شيئاً. فتُقرأ القيمة من الحقل نفسه بعد أن ردّها الخادم.
     */
    const saved = await browser.execute(
      () => document.querySelector('[aria-label="منفذ دخول الطلاب"]')?.value ?? '',
    );
    expect(saved).toBe('4320');

    await documentStep('t22-port', { title: 'منفذ بوابة الطلاب' });

    // العودة إلى الافتراضي: الحقل الفارغ يعني «استعمل ٤٣١٧».
    await typeInto('منفذ دخول الطلاب', '');
    await clickText('حفظ المنفذ');
    await waitForText('حُفظ', 20_000);

    const cleared = await browser.execute(
      () => document.querySelector('[aria-label="منفذ دخول الطلاب"]')?.value ?? '',
    );
    expect(cleared).toBe('');
  });
});
