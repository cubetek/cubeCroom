import {
  clickText,
  ensureOnboarded,
  horizontalOverflow,
  setViewport,
  waitForText,
} from './helpers.mjs';
import { CLASS_NAME, TEACHER_NAME } from './fixtures.mjs';

/**
 * حارس المقاس — **هل تتّسع شاشات المعلّم عند أضيق مقاسٍ مسموح؟**
 *
 * القيد مكتوب في المصدر: «الأساس 1280×800، ويجب أن تبقى العمليات الأساسية
 * usable حتى **1024×768**» (`docs/design/01-product-context.md`). ونافذة
 * Electron تُعلنه بنفسها: `minWidth: 1024, minHeight: 768` — فالمقاس يبلغه
 * المعلّم بسحب الحافة، لا يفترضه أحد.
 *
 * **وكان القيد بلا حارس.** ثلاثٌ وعشرون ورقة أنماط في واجهة المعلّم، وفيها
 * **صفرُ استعلامات وسائط** — أي أن الوعد بـ1024×768 لم يُفحص مرة واحدة منذ
 * كُتب. وورقةٌ بلا استعلام قد تتّسع بحقّ، وأخرى بعشرة استعلامات قد تفيض:
 * الفيضان خاصيّة الصفحة المرسومة لا نصّ الأنماط.
 *
 * وما يُفحص هنا شيء واحد لا يُختلف عليه: **ألّا تخرج الصفحة عن حدّها أفقياً**.
 * فالمعلّم لا يمرّر شاشته يميناً ليقرأ عمود الدرجات — يظنّ أن العمود غير
 * موجود. وجدولٌ داخل حاويةٍ تمرّر أفقياً ليس فيضاناً: هو الحلّ الصحيح،
 * ولذلك يستثنيه القياس.
 */

/** أضيق ما تسمح به النافذة — وهو ما يُفحص. الأوسع منه يمرّ بداهةً. */
const NARROW = { width: 1024, height: 768 };

/** ما وجدناه فائضاً — يُجمع كلّه ثمّ يُقال مرة واحدة. */
const spills = [];

/**
 * ما قِيس فعلاً — **وبلاه يكذب الحارس**.
 *
 * `spills` فارغةٌ في حالتين متناقضتين: لا فيضان في شيء، أو لم يُقَس شيء. وقد
 * وقعت الثانية: سقط `before` بـ`unknown command`، فتخطّى Mocha كلّ الخطوات،
 * وطبع `after` «✓ لا فيضان في اثنتي عشرة شاشة» — على قياسٍ لم يجرِ.
 *
 * فيُعَدّ المقيس، ويُقارَن بالمنتظَر، ويسقط الفحص إن اختلفا.
 */
const measured = [];

/** ما لم نبلغه — شاشةٌ لم تُقَس ليست شاشةً سليمة. */
const unreached = [];

/**
 * يقيس شاشةً واحدة ويسجّل فيضانها إن فاضت.
 *
 * ولا يُسقط الجولة عند أول فيضان: المطلوب **جردٌ كامل** لما يفيض، لا أول
 * ما يفيض. وشاشةٌ واحدة تُسقط الفحص تُخفي التسع بعدها.
 */
async function measure(label) {
  const seen = await horizontalOverflow();
  measured.push(label);
  if (seen.overflows) {
    spills.push({ label, by: seen.by, culprits: seen.culprits });
    const who = seen.culprits
      .map((one) => `${one.tag}.${one.cls.split(' ')[0]} (+${one.by}px، عرضه ${one.width})`)
      .join('\n      ');
    console.warn(`⚠ «${label}» تفيض ${seen.by}px عند ${seen.viewport}px:\n      ${who}`);
  }
  return seen;
}

/** يعود إلى الجذر — كل قياس يبدأ من مكان معروف. */
async function toRoot() {
  await clickText('الرئيسية').catch(() => {});
  await waitForText('الفصول', 15_000);
}

describe('المقاس — واجهة المعلّم عند 1024×768', () => {
  before(async () => {
    await ensureOnboarded(TEACHER_NAME);

    const got = await setViewport(NARROW.width, NARROW.height);
    /*
     * المقاس المطلوب قد لا يُبلَغ: النافذة لها إطار، والنظام له حدّ أدنى.
     * فيُقال ما بُلغ فعلاً بدل أن يُفترض — قياسٌ على عرضٍ آخر ليس قياساً.
     */
    console.log(`المنفذ الفعليّ: ${got.width}×${got.height} (المطلوب ${NARROW.width}×${NARROW.height})`);
  });

  const visits = [
    { label: 'الرئيسية', reach: toRoot },
    {
      label: 'الفصول',
      reach: async () => {
        await toRoot();
        await clickText('الفصول');
        await waitForText(CLASS_NAME, 15_000);
      },
    },
    {
      label: 'داخل الفصل — الدروس والمحتوى',
      reach: async () => {
        await toRoot();
        await clickText('الفصول');
        await waitForText(CLASS_NAME, 15_000);
        await clickText('فتح الفصل');
        await waitForText('الدروس والمحتوى', 20_000);
      },
    },
    {
      label: 'الأنشطة والنتائج',
      reach: async () => {
        await clickText('الأنشطة والنتائج');
        await waitForText('إنشاء نشاط', 20_000);
      },
    },
    {
      label: 'جدول الإجابات',
      reach: async () => {
        await clickText('عرض النتائج');
        await waitForText('أرسلوا إجاباتهم', 20_000);
      },
    },
    {
      label: 'الطلاب',
      reach: async () => {
        await toRoot();
        await clickText('الفصول');
        await clickText('فتح الفصل');
        await waitForText('الدروس والمحتوى', 20_000);
        await clickText('الطلاب');
      },
    },
    {
      label: 'تشغيل دخول الطلاب',
      reach: async () => {
        await clickText('تشغيل دخول الطلاب');
        await waitForText('تشغيل دخول الطلاب', 15_000);
      },
    },
    {
      label: 'تشخيص الاتصال',
      reach: async () => {
        await toRoot();
        await clickText('تشخيص الاتصال');
        await waitForText('تشخيص الاتصال', 15_000);
      },
    },
    {
      label: 'النسخ الاحتياطي',
      reach: async () => {
        await toRoot();
        await clickText('النسخ الاحتياطي');
        await waitForText('النسخ المحفوظة', 15_000);
      },
    },
    {
      label: 'الإعدادات',
      reach: async () => {
        await toRoot();
        await clickText('الإعدادات');
        await waitForText('الإعدادات', 15_000);
      },
    },
    {
      label: 'الملفات',
      reach: async () => {
        await toRoot();
        await clickText('الملفات');
        await waitForText('الملفات', 15_000);
      },
    },
    {
      label: 'الذكاء الاصطناعي',
      reach: async () => {
        await toRoot();
        await clickText('الذكاء الاصطناعي');
        await waitForText('الذكاء الاصطناعي', 15_000);
      },
    },
  ];

  /*
   * خطوةٌ لكل شاشة: مهلة Mocha تقتل الخطوة من خارجها، فخطوةٌ تحمل اثنتي عشرة
   * زيارة تُسقطها كلّها. وهذا الدرس دُفع ثمنه في `docs.e2e.mjs`.
   */
  for (const visit of visits) {
    it(`لا تفيض: ${visit.label}`, async () => {
      try {
        await visit.reach();
      } catch (error) {
        // شاشةٌ لم نبلغها لا تُقاس — ويُقال ذلك بدل أن تُعدّ سليمة.
        unreached.push(visit.label);
        console.warn(`⚠ لم نبلغ «${visit.label}»: ${String(error).split('\n')[0]}`);
        return;
      }
      await measure(visit.label);
    });
  }

  after(() => {
    /*
     * **أوّلاً: هل قِسنا أصلاً؟**
     *
     * لا يُقال «سليم» عن شاشةٍ لم تُفتح. وصمتُ `spills` يحتمل معنيين، وهذا
     * السطر يفصل بينهما قبل أن يُقرأ أيّ حكم بعده.
     */
    if (measured.length === 0) {
      throw new Error(
        `لم تُقَس شاشة واحدة من ${visits.length} — الحارس لم يفحص شيئاً، ` +
          `ولا يجوز أن يُقرأ صمتُه نجاحاً.${
            unreached.length > 0 ? `\nلم نبلغ: ${unreached.join(' · ')}` : ''
          }`,
      );
    }

    if (unreached.length > 0) {
      console.warn(`\n${unreached.length} شاشة لم نبلغها فلم تُقَس:\n  ${unreached.join('\n  ')}`);
    }

    if (spills.length === 0) {
      console.log(`\n✓ لا فيضان أفقيّ في ${measured.length} شاشة مقيسة عند ${NARROW.width}px.`);
      return;
    }

    console.log(`\n${spills.length} من ${measured.length} شاشة مقيسة تفيض أفقياً عند ${NARROW.width}px:`);
    for (const one of spills) console.log(`  ✗ ${one.label} — ${one.by}px`);

    /*
     * **يُسقط الفحص هنا لا في وسطه.**
     *
     * الوعد في المصدر: «تبقى العمليات الأساسية usable حتى 1024×768». وشاشةٌ
     * تفيض أفقياً ليست usable: المعلّم لا يعرف أن ثمّة عموداً لم يره. فإسقاطُ
     * الفحص هو ما يجعل الوعد وعداً بدل أن يكون جملة في مستند.
     */
    throw new Error(
      `فيضان أفقيّ في ${spills.length} شاشة عند ${NARROW.width}px — ` +
        'والمصدر يشترط بقاءها صالحة للاستعمال عند هذا المقاس.',
    );
  });
});
