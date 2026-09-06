import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { remote } from 'webdriverio';
import { notesFile, shotsDir } from './paths.mjs';

/**
 * أدوات الفحص البصري.
 *
 * **النقر بالنصّ المرئي لا بمعرّف في الشيفرة.** الفحص يقلّد المعلم: هو لا يعرف
 * `data-testid`، يعرف الزرّ المكتوب عليه «ابدأ». وفحصٌ مربوط بمعرّفات داخلية
 * يبقى أخضر بعد أن يتغيّر النصّ إلى ما لا يفهمه أحد.
 *
 * **وجهازان لا نافذتان.** المعلم على Electron، والطالب على متصفّح حقيقي
 * منفصل — لأن هذا ما يحدث في الصفّ. وكلّ الأدوات هنا تعمل على «الجهاز
 * النشط» أياً كان، فالسيناريو يقرأ كما يُروى: هنا المعلم، وهنا الطالب.
 */

let step = 0;

/**
 * جلسة متصفّح الطالب — تُفتح مرة وتبقى حتى نهاية الفحص.
 *
 * إغلاقها وفتحها بين خطوة وأخرى يمسح ما في `localStorage`، وعليه يقوم وعدُ
 * «تُفتح الصفحة تلقائياً بمجرد موافقة معلمك»: رقم الطلب محفوظ هناك.
 */
let studentSession = null;

/** `null` تعني جهاز المعلم — المتغيّر العام الذي يهيّئه wdio-electron-service. */
let active = null;

/** الجهاز النشط الآن. كلّ أداة أدناه تمرّ من هنا لا من `browser` مباشرة. */
function driver() {
  return active ?? browser;
}

/**
 * **الضغطة الحقيقية — `element.click()` وحدها لا تكفي.**
 *
 * تُطلق حدث `click` فقط. ومكوّنات Radix — وهي أساس المكتبة كلّها بعد الهجرة
 * إلى shadcn — تستمع إلى **`pointerdown`/`mousedown`** لا إلى `click`:
 * التبويب يتبدّل عند الضغط، والقائمة تُفتح عند الضغط، والزرّ المنسدل كذلك.
 *
 * فكان الفحص ينقر تبويب «الأنشطة والنتائج» فلا يتبدّل شيء، ويبقى على تبويب
 * الدروس — ثمّ يفشل بعد خمسٍ وعشرين ثانية برسالة «لم يظهر إنشاء نشاط»، وهي
 * تصف العَرَض لا السبب. وسقطت معها أربع عشرة خطوة بعدها.
 *
 * فتُرسَل السلسلة كاملة كما يرسلها المتصفّح: `pointerdown` ثمّ `mousedown`
 * ثمّ `pointerup` و`mouseup` و`click`. وهذا ما يفعله الإصبع على الشاشة —
 * وقياسٌ على غيره يفحص ما لا يحدث.
 *
 * ويُعاد نصّاً لا دالّةً: `execute` يُسلسِل ما يُمرَّر إليه، فلا يعبر المغلَق.
 */
const PRESS = `
  (node) => {
    node.scrollIntoView({ block: 'center' });
    const box = node.getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    const common = { bubbles: true, cancelable: true, composed: true, view: window, ...at };
    const Pointer = window.PointerEvent ?? window.MouseEvent;
    node.dispatchEvent(new Pointer('pointerdown', { ...common, pointerId: 1, button: 0, isPrimary: true }));
    node.dispatchEvent(new MouseEvent('mousedown', { ...common, button: 0 }));
    node.focus?.();
    node.dispatchEvent(new Pointer('pointerup', { ...common, pointerId: 1, button: 0, isPrimary: true }));
    node.dispatchEvent(new MouseEvent('mouseup', { ...common, button: 0 }));
    node.click();
  }
`;

/** لقطة مرقَّمة بترتيبها — الترتيب نفسه قصّة التدفّق حين تُقرأ الصور. */
export async function shot(name) {
  step += 1;
  const file = `${shotsDir}/${String(step).padStart(2, '0')}-${name}.png`;
  await driver().saveScreenshot(file);
  return file;
}

export async function screenText() {
  return driver().execute(() => document.body.innerText.replace(/\n{2,}/g, '\n').trim());
}

/** يكتب نصّ الشاشة بجانب لقطتها — لتُقرأ آلياً لا بالعين وحدها. */
export async function record(name) {
  const file = await shot(name);
  const text = await screenText();
  writeFileSync(file.replace(/\.png$/, '.txt'), text, 'utf8');
  return text;
}

/**
 * ينقر أول عنصر تفاعليّ يحمل هذا النصّ.
 *
 * ولا ينتظر ظهوره صامتاً إلى الأبد: إن لم يوجد، يرمي برسالة فيها **نصّ الشاشة
 * كما هو** — فمن يقرأ الفشل يعرف أين وقف التطبيق لا أن شيئاً لم يُنقر.
 */
/**
 * `last` حين يتكرّر النصّ نفسه في الشاشة.
 *
 * «تشغيل دخول الطلاب» اسم قسمٍ في الشريط **وزرٍّ داخله** — والمعلم يميّزهما
 * بموضعهما، والفحص يميّزهما بالترتيب. وبلا هذا ينقر الفحص التبويب مرتين
 * ويظنّ أنه شغّل الحصة.
 */
export async function clickText(label, { last = false, timeout = 15_000 } = {}) {
  const device = driver();
  const found = await device
    .waitUntil(
      async () =>
        device.execute(
          (needle, takeLast, pressSource) => {
            const press = eval(pressSource);
            const interactive =
              'button, a, [role="tab"], [role="radio"], [role="button"], [role="option"], [role="combobox"], [role="switch"], [role="menuitem"], label';
            const nodes = [...document.querySelectorAll(interactive)];
            const matches = nodes.filter((node) => (node.innerText ?? '').trim().includes(needle));
            let hit = takeLast ? matches[matches.length - 1] : matches[0];

            /*
             * وإن لم يكن الهدف عنصراً تفاعلياً بذاته — بطاقة فصل مثلاً — يُؤخذ
             * أصغر عنصر يحمل النصّ. والنقر يتصاعد، فيصل إلى المستمع أياً كان
             * موضعه: هذا ما يفعله المعلم حين ينقر البطاقة لا الزرّ.
             */
            if (!hit) {
              const carriers = [...document.querySelectorAll('body *')].filter(
                (node) =>
                  (node.innerText ?? '').trim().includes(needle) && node.children.length === 0,
              );
              hit = carriers[0];
            }
            if (!hit) return false;
            press(hit);
            return true;
          },
          label,
          last,
          PRESS,
        ),
      { timeout, interval: 400, timeoutMsg: `لم يظهر «${label}»` },
    )
    .catch(async () => {
      throw new Error(`لم يظهر «${label}». الشاشة الآن:\n${await screenText()}`);
    });

  await device.pause(700);
  return found;
}

/**
 * يكتب في الحقل الذي **تسميته** كذا.
 *
 * والبحث بالتسمية المرئية أولاً — `<label for>` — لا بـ`placeholder`: المعلم
 * يرى «الاسم» فوق الحقل، والنائب مثالٌ رماديّ داخله. وفحصٌ يبحث عن المثال
 * ينكسر أول مرة يتغيّر فيها المثال، وهو أقلّ ما يُعتنى به في الشاشة.
 *
 * والقيمة تُضبط عبر واضع النموذج الأصلي ثم يُطلق حدث `input`: React يستمع
 * إليه، وضبطُ `value` وحده لا يصل إلى حالته فيبقى الحقل ممتلئاً بصرياً
 * وفارغاً منطقياً.
 */
export async function typeInto(label, value) {
  const device = driver();
  const ok = await device.execute(
    (needle, text) => {
      const byLabel = [...document.querySelectorAll('label')]
        .filter((node) => (node.innerText ?? '').includes(needle))
        .map((node) => {
          const id = node.getAttribute('for');
          return id ? document.getElementById(id) : node.querySelector('input, textarea');
        })
        .filter(Boolean);

      const byAttribute = [...document.querySelectorAll('input, textarea')].filter(
        (node) =>
          (node.getAttribute('aria-label') ?? '').includes(needle) ||
          (node.placeholder ?? '').includes(needle),
      );

      const hit = [...byLabel, ...byAttribute][0];
      if (!hit) return false;

      const proto =
        hit.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(hit, text);
      hit.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    },
    label,
    value,
  );

  if (!ok) throw new Error(`لم نجد حقلاً تسميته «${label}». الشاشة:\n${await screenText()}`);
  await device.pause(400);
}

/** ينتظر ظهور نصّ على الشاشة — دليلَ أن الخطوة تمّت فعلاً. */
export async function waitForText(needle, timeout = 20_000) {
  await driver()
    .waitUntil(async () => (await screenText()).includes(needle), {
      timeout,
      interval: 500,
    })
    .catch(async () => {
      throw new Error(`لم يظهر «${needle}». الشاشة:\n${await screenText()}`);
    });
}

/**
 * ينتظر جاهزية جهاز المعلم، **ويعبر شاشات الإعداد إن ظهرت**.
 *
 * `wdio` يُقلع نسخةً جديدة من التطبيق لكل ملفّ فحص، وchromedriver يعطي كلَّ
 * جلسةٍ مجلدَ مستخدمٍ خاصاً بها. فبيانات التطبيق **تُشارَك** (قاعدةٌ واحدة في
 * `CUBECROOM_DATA_DIR`)، وحالةُ Electron نفسها **لا تُشارَك** — ومنها علامةُ
 * «انتهى الإعداد». فكل ملفّ يفتح التطبيق فيراه أول مرة من جديد.
 *
 * والفصلُ بينهما ليس عيباً: هو الشرط الذي جعل `student.e2e` يتخطّى الإعداد
 * بشرطٍ مكتوب في متنه. وكان `docs.e2e` بلا هذا الشرط فسقط قبل أول لقطة —
 * عشر شاشات لم تُصوَّر لأن الفحص ينتظر «الفصول» والشاشة تقول «أهلاً بك».
 *
 * وهذا التعريف واحد لا نسختان: شرطٌ يُكتب مرتين يتباعد عند أول تغيير في
 * شاشات الإعداد.
 */
export async function ensureOnboarded(teacherName) {
  await browser.pause(4000);

  if ((await screenText()).includes('أهلاً بك')) {
    await clickText('ابدأ');
    await typeInto('الاسم', teacherName);
    await clickText('التالي');
    await clickText('إنهاء الإعداد');
  }

  await waitForText('الفصول', 45_000);
}

/**
 * يفتح صفحة الطالب في **متصفّح حقيقي منفصل** — لا في نافذة Electron.
 *
 * **ولماذا هذا فرقٌ لا تفصيل:** نافذة Electron ثانية تشترك مع التطبيق في
 * محرّكه وسياساته وذاكرته، فتُخفي بالضبط ما يقع على جهاز الطالب: سياسة
 * المحتوى، والكعكات بين أصلين مختلفين، وصفحةٌ تُحمَّل من الشبكة لا من الملفّ.
 * وفحصٌ يمرّ في نافذة داخلية ثم يسقط على حاسوب الطالب فحصٌ يطمئن بلا سبب.
 *
 * والمقاس مقاس حاسوب: الطلاب على حواسيب ولوحيّات لا هواتف — الهواتف ممنوعة
 * في الصفوف.
 */
export async function openStudentBrowser(url) {
  if (studentSession === null) {
    studentSession = await remote({
      logLevel: 'error',
      capabilities: {
        browserName: 'chrome',
        // بلا هذا لا تُقرأ وحدة التحكّم — والصفحة البيضاء كانت تشتكي فيها وحدها.
        'goog:loggingPrefs': { browser: 'ALL' },
        'goog:chromeOptions': {
          args: [
            '--window-size=1280,900',
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-features=Translate',
          ],
        },
      },
    });
  }

  active = studentSession;
  await studentSession.url(url);

  /*
   * الانتظار على **ظهور محتوى** لا على مهلة ثابتة.
   *
   * أول تحميل لصفحة الطالب يمرّ بخادم بارد يترجم الصفحة عند الطلب — وثانيةٌ
   * ونصف تكفي أحياناً ولا تكفي أحياناً، فيصير الفحص متذبذباً لا كاشفاً.
   */
  await studentSession
    .waitUntil(async () => (await screenText()) !== '', { timeout: 45_000, interval: 700 })
    .catch(async () => {
      /*
       * الفشل يقول **ما الذي رآه المتصفّح**: عنوانه، وما تعذّر تحميله.
       * 'صفحة لم تُحمّل' وحدها تترك من يقرأها بين خادمٍ لم يُقلع وشبكةٍ لا
       * تصل وجدارٍ ناريّ يمنع — وثلاثتها إصلاحات مختلفة.
       */
      const seen = await studentSession.execute(() => ({
        href: location.href,
        title: document.title,
        body: (document.body?.innerText ?? '').slice(0, 400),
        error: document.querySelector('#main-message, .error-code')?.textContent ?? null,
      }));
      throw new Error(`صفحة الطالب لم تُحمّل شيئاً. المتصفّح يرى: ${JSON.stringify(seen)}`);
    });
}

/** يُغلق متصفّح الطالب — وإلّا بقي مفتوحاً بعد انتهاء الفحص. */
export async function closeStudentBrowser() {
  if (studentSession === null) return;
  const session = studentSession;
  studentSession = null;
  active = null;
  try {
    await session.deleteSession();
  } catch {
    /* أُغلق أصلاً — لا شيء يعتمد على نجاح الإغلاق. */
  }
}

/** يعود إلى جهاز المعلم. */
export async function switchToTeacher() {
  active = null;
  await browser.pause(800);
}

/* ────────────────────────────────────────────────────────────────────────
 * المقاس — «هل تتّسع الشاشة فعلاً؟»
 *
 * القيد مكتوب في المصدر لا مُخترَع: **المعلّم على 1280×800، وتبقى العمليات
 * الأساسية usable حتى 1024×768** (`01-product-context.md`)، ونافذة Electron
 * نفسها `minWidth: 1024` — أي أن هذا المقاس يبلغه المعلّم بسحب الحافة، لا
 * يفترضه أحد. والطالب على حاسوب أو لوحيّ (القرار D15).
 *
 * **ولا يُقاس هذا بقراءة CSS.** ملفٌّ فيه استعلامات وسائط قد يفيض، وملفٌّ بلا
 * استعلام واحد قد يتّسع. الفيضان خاصيّة **الصفحة المرسومة** لا نصّ الأنماط،
 * ولا يُعرف إلّا بتضييق النافذة والسؤال.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * يضبط **منفذ** الجهاز النشط — لا نافذته — ويتأكّد أنه بلغ المطلوب.
 *
 * **وجهازان لا واحد، وأمران لا أمر.** جلسة Electron لا تعرف `setWindowRect`:
 * تردّ `unknown command`. وهذا ما وقع فعلاً — سقط `before` بهذا الخطأ، فتخطّى
 * Mocha كلّ القياسات، وبقي `after` يطبع «لا فيضان في اثنتي عشرة شاشة» على
 * قياسٍ **لم يجرِ قطّ**. حارسٌ يمرّ لأنه لم يفحص أخطرُ من غياب الحارس.
 *
 * فتُضبط نافذة Electron من عمليتها الرئيسية بـ`setContentSize` — و«content»
 * لا «bounds» عمداً: الثانية تشمل الإطار وأشرطة النظام، فيبقى المنفذ أضيق
 * ممّا طُلب بمقدارها، ويُقاس عرضٌ غير الذي يُراد.
 *
 * **ثمّ يُتحقّق.** ما لم يبلغ المنفذُ المطلوبَ فالقياس على غير ما يُظَنّ —
 * فيُرمى الخطأ بدل أن يُبنى عليه حكم.
 */
export async function setViewport(width, height) {
  const device = driver();

  const apply = async (w, h) => {
    if (active === null) {
      // جهاز المعلّم: النافذة تُضبط من العملية الرئيسية لا من الصفحة.
      await browser.electron.execute(
        (electron, cw, ch) => {
          const [window_] = electron.BrowserWindow.getAllWindows();
          if (window_ === undefined) return;
          window_.setContentSize(cw, ch);
        },
        w,
        h,
      );
    } else {
      await device.setWindowRect(null, null, w, h);
    }
    await device.pause(600);
    return device.execute(() => ({ width: window.innerWidth, height: window.innerHeight }));
  };

  let got = await apply(width, height);

  /*
   * **تصحيحٌ بالفرق المقيس، لا بثابتٍ مُقدَّر.**
   *
   * `setWindowRect` يضبط النافذة **بإطارها**، والمنفذ داخلها أضيق بمقدار
   * الإطار وشريط التمرير: طُلب ٧٦٨ فبلغ ٧٥٢. وثابتٌ مكتوب بيدنا (`+16`) يصحّ
   * على هذا الجهاز ويكذب على غيره — فيُقاس الفرق ويُضاف، ثمّ يُقاس ثانيةً.
   */
  const drift = width - got.width;
  if (drift !== 0) got = await apply(width + drift, height + (height - got.height));

  /*
   * وما بقي بعد التصحيح ليس تقريباً — هو مقاسٌ آخر، وقياسٌ عليه يصف شاشةً
   * غير التي نفحصها. فيُرمى الخطأ بدل أن يُبنى عليه حكم: حارسٌ يقيس المقاس
   * الخطأ ويقول «سليم» أخطرُ من غياب الحارس. وقد وقع هذا فعلاً.
   */
  if (Math.abs(got.width - width) > 2) {
    throw new Error(
      `لم يبلغ المنفذ المقاس المطلوب: طُلب ${width}px وبلغ ${got.width}px بعد التصحيح. ` +
        'وأيّ قياس بعد هذا يصف شاشةً غير التي نفحصها.',
    );
  }

  return got;
}

/**
 * «هل تفيض الصفحة أفقياً؟ ومَن يُفيضها؟»
 *
 * **والجواب يسمّي الجاني.** `scrollWidth > clientWidth` يقول إن ثمّة فيضاناً
 * ولا يقول أين — ومن يقرأ ذلك يبحث في ألف عنصر. فيُمشى على الشجرة ويُلتقط كل
 * عنصر يتجاوز حافة المنفذ، بصنفه ونصّه، مرتَّبين بالأعرض.
 *
 * وتُستثنى الحاويات التي **يجوز** لها التمرير: عنصرٌ داخل `overflow-x: auto`
 * لا يُفيض الصفحة — يُمرَّر داخل حاويته، وهو الحلّ الصحيح للجداول العريضة لا
 * عطلاً فيها.
 */
export async function horizontalOverflow() {
  return driver().execute(() => {
    const root = document.documentElement;
    const limit = root.clientWidth;

    /** أقرب سلفٍ يمرّر أفقياً — فإن وُجد فالعنصر ليس فائضاً على الصفحة. */
    const scrollable = (node) => {
      for (let at = node.parentElement; at && at !== root; at = at.parentElement) {
        const how = getComputedStyle(at).overflowX;
        if (how === 'auto' || how === 'scroll') return true;
      }
      return false;
    };

    const culprits = [];
    for (const node of document.querySelectorAll('body *')) {
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;

      /*
       * الفيضان يُقاس من **الحافتين**: في صفحة عربية يخرج المحتوى من اليسار،
       * وفي لاتينية من اليمين. وفحصُ جهةٍ واحدة يمرّ على نصف الأعطال.
       */
      const past = Math.max(0, Math.round(box.right - limit), Math.round(-box.left));
      if (past <= 1 || scrollable(node)) continue;

      culprits.push({
        tag: node.tagName.toLowerCase(),
        cls: (node.className || '').toString().slice(0, 60),
        by: past,
        width: Math.round(box.width),
        text: (node.innerText || '').trim().slice(0, 40),
      });
    }

    /*
     * الأب والابن يفيضان معاً، والذكرُ للأب وحده يكفي: إصلاحه يُصلحهما.
     * فيُبقى الأعرض فيضاناً من كل سلسلة.
     */
    culprits.sort((a, b) => b.by - a.by);

    return {
      viewport: limit,
      scrollWidth: root.scrollWidth,
      overflows: root.scrollWidth > limit + 1,
      by: Math.max(0, root.scrollWidth - limit),
      culprits: culprits.slice(0, 6),
    };
  });
}

/** ينتقل إلى جهاز الطالب — ويرفض الصمت إن لم يكن قد فُتح. */
export async function switchToStudent() {
  if (studentSession === null) throw new Error('لم يُفتح متصفّح الطالب بعد');
  active = studentSession;
  await studentSession.pause(800);
}

/* ────────────────────────────────────────────────────────────────────────
 * المراقبة والتوثيق
 *
 * لقطةٌ تُثبت أن الشاشة ظهرت، ولا تقول كم انتظر الطالب ولا ما اشتكى منه
 * متصفّحه. وهذان — الزمن وسجلّ الأخطاء — هما ما يسقط بلا صوت: صفحةٌ تُرسم
 * صحيحة بعد ثماني ثوانٍ صفحةٌ فاشلة أمام طفل، وخطأٌ في وحدة التحكّم اليوم
 * صفحةٌ بيضاء غداً.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * ما جُمع في هذه الجولة — **يُقرأ من القرص لا من الذاكرة**.
 *
 * `wdio` يُشغّل عاملاً مستقلّاً لكل ملفّ فحص، ولكلٍّ ذاكرته. فمصفوفةٌ في
 * الوحدة تجمع خطوات ملفٍّ واحد لا غير — وكان كل ملفّ يكتب `notes.json`
 * بخطواته وحدها فوق خطوات سابقه. فبقيت في الدليل شاشاتُ آخر ملفّ فقط.
 *
 * والقرص هو الذاكرة المشتركة الوحيدة بين العُمّال هنا: كل خطوة تُلحق فور
 * التقاطها، والمطابقة بالاسم — فإعادةُ تصوير شاشةٍ تُحدّثها ولا تُكرّرها.
 */
export function capturedNotes() {
  if (!existsSync(notesFile)) return [];
  try {
    return JSON.parse(readFileSync(notesFile, 'utf8'));
  } catch {
    return [];
  }
}

function appendNote(entry) {
  const all = capturedNotes();
  const at = all.findIndex((one) => one.name === entry.name);
  if (at === -1) all.push(entry);
  else all[at] = entry;
  writeFileSync(notesFile, JSON.stringify(all, null, 2), 'utf8');
}

/**
 * أخطاء وحدة تحكّم المتصفّح منذ آخر قراءة.
 *
 * متاحة في Chrome وحده؛ جلسة Electron لا تعطيها، فتعود فارغة بلا ادّعاء.
 */
export async function consoleErrors() {
  if (active === null) return [];
  try {
    const logs = await active.getLogs('browser');
    return logs
      .filter((entry) => entry.level === 'SEVERE')
      .map((entry) => String(entry.message))
      /*
       * تُستبعد ضجّة لا تخصّ التطبيق: أيقونة موقع غير موجودة، وسياسة يحقنها
       * برنامج حماية في جهاز المطوّر. وما عداها يبقى — بما فيه ما نظنّه صغيراً.
       */
      .filter((message) => !message.includes('favicon.ico'))
      .filter((message) => !message.includes('kaspersky'));
  } catch {
    return [];
  }
}

/** أزمنة التحميل كما قاسها المتصفّح نفسه — لا كما قدّرناها من الخارج. */
export async function timings() {
  try {
    return await driver().execute(() => {
      const [nav] = performance.getEntriesByType('navigation');
      if (nav === undefined) return null;
      return {
        ttfb: Math.round(nav.responseStart),
        domReady: Math.round(nav.domContentLoadedEventEnd),
        load: Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd),
      };
    });
  } catch {
    return null;
  }
}

/**
 * لقطة موثَّقة: صورة، ونصّها، وأزمنتها، وأخطاؤها، **ومواضع ما يُشرح فيها**.
 *
 * الملاحظات تُربط بالنصّ المرئي لا بإحداثيات مكتوبة بيدنا: يُبحث عن العنصر
 * الذي يحمل النصّ ويُؤخذ إطاره. فإن تحرّك في التصميم تحرّكت معه الإشارة،
 * وإن اختفى **فشل التوثيق بصوت** بدل أن يشير سهمٌ إلى فراغ.
 */
export async function documentStep(name, { title, notes = [] } = {}) {
  const file = await shot(name);
  const text = await screenText();
  writeFileSync(file.replace(/\.png$/, '.txt'), text, 'utf8');

  const measured = await driver().execute((wanted) => {
    const view = {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio,
    };
    const found = wanted.map((needle) => {
      /*
       * **المطابقة التامّة أولاً.**
       *
       * «اسمك» موجودة في تسمية الحقل وفي جملة الشرح فوقه معاً — وأول عنصر
       * يحملها في ترتيب الوثيقة هو الجملة، فكانت الإشارة تقع عليها. والتسمية
       * هي المقصودة: نصّها **هو** المطلوب لا يحتويه.
       */
      const carriers = [...document.querySelectorAll('body *')].filter(
        (node) => (node.innerText ?? '').trim().includes(needle) && node.children.length === 0,
      );
      const exact = carriers.filter((node) => node.innerText.trim() === needle);
      const shortest = [...carriers].sort(
        (a, b) => a.innerText.trim().length - b.innerText.trim().length,
      );
      const node =
        exact[0] ??
        shortest[0] ??
        [...document.querySelectorAll('body *')]
          .filter((one) => (one.innerText ?? '').trim().includes(needle))
          .sort((a, b) => a.innerText.length - b.innerText.length)[0];
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    });
    return { view, found };
  }, notes.map((one) => one.at));

  const missing = notes
    .map((one, at) => (measured.found[at] === null ? one.at : null))
    .filter((one) => one !== null);
  if (missing.length > 0) {
    throw new Error(`تعذّر تحديد موضع الشرح: ${missing.join(' · ')}\nالشاشة:\n${text}`);
  }

  appendNote({
    name,
    file: basename(file),
    title: title ?? name,
    device: active === null ? 'المعلم' : 'الطالب',
    view: measured.view,
    notes: notes.map((one, at) => ({ n: at + 1, ...one, rect: measured.found[at] })),
    timings: await timings(),
    errors: await consoleErrors(),
    text,
  });

  return text;
}

/** ينقر عنصراً باسمه الوصفي — لا كل زرّ يحمل نصّاً مرئياً. */
export async function clickLabeled(ariaLabel) {
  const device = driver();
  const ok = await device.execute(
    (needle, pressSource) => {
      const press = eval(pressSource);
      const hit = document.querySelector(`[aria-label="${needle}"]`);
      if (!hit) return false;
      press(hit);
      return true;
    },
    ariaLabel,
    PRESS,
  );

  if (!ok) throw new Error(`لم نجد عنصراً اسمه «${ariaLabel}». الشاشة:\n${await screenText()}`);
  await device.pause(400);
}

/**
 * يختار من قائمة منسدلة بنصّ الخيار كما يقرؤه المستخدم.
 *
 * **وقائمتان لا واحدة.**
 *
 * كانت الواجهة تستعمل `<select>` أصلياً، فكان الاختيار ضبطَ قيمةٍ وإطلاقَ
 * `change`. وبعد الهجرة إلى shadcn صارت القائمة زرّاً يفتح لوحاً في `portal`
 * خارج شجرة النموذج — فلا `value` تُضبط، ولا `<option>` توجد أصلاً.
 *
 * والأصلية تبقى مدعومة: هذا الفحص يخدم شاشتين قد تتباعدان، وحذفُ الفرع
 * الأول يجعل الأداة تعمل اليوم وتسقط يوم تعود قائمةٌ نظاميّة.
 *
 * والفتح **بالنقر** لا بضبط حالةٍ داخلية: هذا ما يفعله المعلّم، وهو الشيء
 * الوحيد الذي يُثبت أن القائمة تُفتح فعلاً بالفأرة.
 */
export async function chooseOption(label, optionText) {
  const device = driver();

  /* ── ١. القائمة النظاميّة ── */
  const native = await device.execute(
    (needle, wanted) => {
      const byLabel = [...document.querySelectorAll('label')]
        .filter((node) => (node.innerText ?? '').includes(needle))
        .map((node) => {
          const id = node.getAttribute('for');
          return id ? document.getElementById(id) : node.querySelector('select');
        })
        .filter(Boolean);

      const select = byLabel.find((node) => node.tagName === 'SELECT');
      if (!select) return false;

      const option = [...select.options].find((one) => (one.text ?? '').includes(wanted));
      if (!option) return false;

      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value',
      ).set;
      setter.call(select, option.value);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    label,
    optionText,
  );

  if (native) {
    await device.pause(400);
    return;
  }

  /* ── ٢. قائمة shadcn: زرٌّ يفتح لوحاً في `portal` ── */
  const opened = await device.execute(
    (needle, pressSource) => {
      const press = eval(pressSource);
      const trigger = [...document.querySelectorAll('label')]
        .filter((node) => (node.innerText ?? '').includes(needle))
        .map((node) => {
          const id = node.getAttribute('for');
          return id ? document.getElementById(id) : null;
        })
        .find((node) => node !== null && node.getAttribute('role') === 'combobox');

      if (!trigger) return false;
      press(trigger);
      return true;
    },
    label,
    PRESS,
  );

  if (!opened) {
    throw new Error(`لم نجد قائمة «${label}». الشاشة:\n${await screenText()}`);
  }

  /*
   * اللوح يُركَّب بعد النقر لا معه — فيُنتظر ظهورُه بدل تقديرِ مهلةٍ ثابتة.
   * ومهلةٌ مقدَّرة هنا تعني فحصاً يمرّ على جهازٍ سريع ويسقط على بطيء.
   */
  const picked = await device
    .waitUntil(
      async () =>
        device.execute(
          (wanted, pressSource) => {
            const press = eval(pressSource);
            const option = [...document.querySelectorAll('[role="option"]')].find((node) =>
              (node.textContent ?? '').trim().includes(wanted),
            );
            if (!option) return false;
            press(option);
            return true;
          },
          optionText,
          PRESS,
        ),
      { timeout: 10_000, interval: 300 },
    )
    .catch(() => false);

  if (!picked) {
    throw new Error(`لم نجد «${optionText}» في قائمة «${label}». الشاشة:\n${await screenText()}`);
  }

  await device.pause(400);
}

/**
 * طلبٌ يخرج **من صفحة الطالب نفسها** بكعكتها وأصلها.
 *
 * لا من عملية الفحص: كعكة الجلسة `HttpOnly`، وطلبٌ من الخارج بلا كعكة يُردّ
 * ٤٠٣ دائماً — فيُثبت لا شيء. وهذا يُثبت شيئاً واحداً بعينه: **رمزٌ كان
 * يعمل قبل لحظة صار لا يعمل.**
 */
export async function studentFetch(path) {
  if (studentSession === null) throw new Error('لم يُفتح متصفّح الطالب بعد');
  return studentSession.executeAsync((target, done) => {
    fetch(target)
      .then((response) => done({ status: response.status }))
      .catch((error) => done({ status: 0, error: String(error) }));
  }, path);
}
