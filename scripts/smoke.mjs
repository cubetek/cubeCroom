import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile, access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, createRepositories } from '@cubecroom/db';
import { createBuilderConfig } from '../apps/desktop/electron-builder.config.mjs';
import { RELEASE_CONFIG, releasePaths } from './release/config.mjs';
import {
  assertBuilt,
  awaitStudentServer,
  measureStartup,
  spawnStudentServer,
  studentServerEntry,
} from './lib/student-server.mjs';

/**
 * فحص دخان بعد البناء — PRD §20 Phase 0.
 *
 * يتحقق من شيئين لا يكشفهما `tsc` ولا `next build`:
 *   ١. حزمة بوابة الطالب تُقلع فعلاً عمليةَ Node مستقلة، وعقودها تعمل.
 *   ٢. متطلبات SEC-001 قائمة في المخرَج المبنيّ لا في النية وحدها.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const PORT = 4319; // منفذ الفحص — غير منفذ التطوير حتى لا يتصادما
/** رمز الحصة في هذا الفحص — ثابتٌ ليُقارَن به الصحيح والخاطئ. */
const JOIN_CODE = '482917';

const ORIGIN = `http://127.0.0.1:${PORT}`;

let failures = 0;

function check(name, passed, detail = '') {
  if (passed) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`);
  }
}

/* ── ١. حراسة متطلبات الأمن في المخرَج المبنيّ ──────────── */

async function checkDesktopSecurity() {
  console.log('\nقشرة Electron — SEC-001');

  const mainPath = join(root, 'apps', 'desktop', 'dist', 'main.js');
  const preloadPath = join(root, 'apps', 'desktop', 'dist', 'preload.cjs');

  try {
    await access(preloadPath);
    const preload = await readFile(preloadPath, 'utf8');
    check(
      'preload مبنيّ CommonJS (شرط تشغيله داخل sandbox)',
      preload.includes('require("electron")') || preload.includes("require('electron')"),
      'لو تحوّل إلى ESM لتعطّل preload صامتاً داخل الصندوق.',
    );
  } catch {
    check('preload.cjs موجود', false, `غير موجود: ${preloadPath}`);
  }

  try {
    const main = await readFile(mainPath, 'utf8');
    check('sandbox: true', /sandbox:\s*true/.test(main));
    check('contextIsolation: true', /contextIsolation:\s*true/.test(main));
    check('nodeIntegration: false', /nodeIntegration:\s*false/.test(main));
  } catch {
    check('main.js موجود', false, `غير موجود: ${mainPath}`);
  }

  try {
    const portalSource = await readFile(join(root, 'apps', 'desktop', 'dist', 'portal.js'), 'utf8');
    const ipcSource = await readFile(join(root, 'apps', 'desktop', 'dist', 'ipc.js'), 'utf8');

    /*
     * §22 · P6-2 — نصف قصة جدار الحماية الذي يملكه التطبيق.
     *
     * الجدار نفسه لا يُفحص من هنا. لكن **ربط الخادم بالشبكة لا بالجهاز وحده**
     * شرطٌ لازم قبله: خادمٌ مربوط بـ`127.0.0.1` لا يصله طالب مهما سمح المعلم
     * في جداره — والعطل عندها في التطبيق لا في النظام.
     *
     * ويُفحص على **المخرَج المبنيّ** لا بفتح منفذ حقيقي: فحصٌ يستمع على الشبكة
     * يستدعي نافذة جدار الحماية على كل جهاز يشغّل الاختبارات، ويترك منفذاً
     * مفتوحاً في كل مرة. (ولهذا يشغّل هذا الفحص خادمه على 127.0.0.1.)
     */
    check(
      'التطبيق يربط خادم الطلاب بالشبكة لا بالجهاز وحده — شرط وصول الطالب',
      /HOSTNAME:\s*['"]0\.0\.0\.0['"]/.test(portalSource),
      'ربطٌ بـ127.0.0.1 يجعل الطالب لا يصل مهما سمح المعلم في جدار حمايته.',
    );

    // §22: سؤال النظام يُستدعى عند أول تشغيل — لا أول مرة تُشغَّل فيها حصة.
    check(
      'نافذة جدار الحماية تُستدعى عند أول تشغيل لا وسط الحصة',
      /primeFirewallPrompt\(/.test(ipcSource),
      'بلا ذلك يسأل ويندوز سؤاله أول مرة يشغّل المعلم حصةً وأمامه صفّ ينتظر.',
    );
  } catch {
    check('مخرَج البوابة مبنيّ', false, 'dist/portal.js أو dist/ipc.js غير موجود');
  }

  /* ── المراجعة الأمنية — P6-4 ── */

  try {
    const ipcSource = await readFile(join(root, 'apps', 'desktop', 'dist', 'ipc.js'), 'utf8');
    const contract = await readFile(join(root, 'packages', 'contracts', 'src', 'ipc.ts'), 'utf8');

    /*
     * SEC-004: «التحقق من sender لكل IPC privileged operation».
     *
     * يُفحص بنيوياً لا قناةً قناة: نداء `ipcMain.handle` واحد في الملف كله —
     * داخل الغلاف الذي يستدعي `assertTrustedSender`. فقناة جديدة لا تستطيع
     * أن تتخطّاه إلا بكتابة `ipcMain.handle` ثانٍ، وهذا الفحص يراه.
     */
    const rawHandles = ipcSource.match(/ipcMain\.handle\(/g) ?? [];
    check(
      'كل قناة IPC تمرّ بحارس المُرسِل — نداء ipcMain.handle واحد لا غير',
      rawHandles.length === 1 && /assertTrustedSender\(/.test(ipcSource),
      `عدد نداءات ipcMain.handle: ${rawHandles.length}`,
    );

    // ولا قناة معلَنة بلا معالِج: قناة تُنادى ولا تردّ عطلٌ صامت.
    const declared = [...contract.matchAll(/^ {2}(\w+): '[^']+',/gm)].map((m) => m[1]);
    const orphans = declared.filter((key) => !ipcSource.includes(`IPC.${key}`));
    check(
      'كل قناة معلَنة في العقد لها معالِج',
      orphans.length === 0,
      orphans.join(', '),
    );

    /*
     * SEC-004 على القيمة لا على الشكل.
     *
     * قناتان تأخذان مساراً وتفعلان به ما لا يُرجَع: الحذف المتكرر واستبدال
     * بيانات المعلم. والعقد يتحقق أنه نصّ — لا أنه مسارنا.
     */
    check(
      'مسارات النسخ الاحتياطي محصورة في مجلدها قبل الحذف أو الاستبدال',
      /insideBackups\(/.test(ipcSource) && /isInsideDirectory\(/.test(ipcSource),
      'بلا ذلك يصير الحذف المتكرر على مجلد تختاره الواجهة.',
    );

    /*
     * SEC-005: المفتاح لا يُسجَّل ولا يُطبع.
     * لا سطر طباعة واحد في العملية الرئيسية — والمفتاح يمرّ بها وحدها.
     */
    check(
      'لا طباعة في العملية الرئيسية — المفتاح يمرّ بها ولا يُسجَّل',
      !/console\.(log|error|warn|info|debug)\(/.test(ipcSource),
      'سطر طباعة في مسار يمرّ به المفتاح يكتبه في سجلّ الجهاز.',
    );
  } catch {
    check('مصادر المراجعة الأمنية متاحة', false, 'dist/ipc.js أو contracts/src/ipc.ts غير موجود');
  }

  try {
    const bridge = await readFile(join(root, 'apps', 'desktop', 'dist', 'preload.cjs'), 'utf8');
    /*
     * SEC-005 على الجسر: لا قناة تُعيد مفتاحاً ولا تأخذه إلا `ai:save-key`
     * — وهي الاتجاه الوحيد المسموح: من الشاشة إلى الخزنة، ولا رجعة.
     */
    const returnsKey = /getKey|readKey|revealKey|'ai:key'/.test(bridge);
    check(
      'لا قناة في الجسر تُعيد مفتاح المعلم — SEC-005',
      !returnsKey,
      'المفتاح يدخل ولا يخرج: الشاشة تعرض قناعه لا نصّه.',
    );
  } catch {
    check('preload.cjs متاح للمراجعة', false, 'غير موجود');
  }

  /* ── التغليف — P6-7 · §19 ── */

  try {
    const paths = releasePaths(root);
    const builder = await createBuilderConfig({ root, outDirectory: paths.outDirectory, afterPack: async () => {} });
    check('التغليف يقرأ موارد staging المستقل عن التطوير',
      builder.directories.app === paths.stagedApp && builder.extraResources[0].from === paths.stagedResources);
    check('أهداف التغليف تشمل NSIS وDMG/ZIP وAppImage',
      builder.win.target.includes('nsis') && builder.mac.target.includes('dmg')
      && builder.mac.target.includes('zip') && builder.linux.target.includes('AppImage'));
    check(
      'الوحدة الأصلية تُخرَج من أرشيف asar عند التغليف',
      builder.asar === true && builder.asarUnpack.includes('node_modules/better-sqlite3/**'),
      'ملف .node داخل asar لا يستطيع النظام تحميله.',
    );
    check('التغليف لا يعيد بناء نسخة SQLite في شجرة التطوير', builder.npmRebuild === false && builder.nodeGypRebuild === false);
    const feed = builder.publish[0];
    check('التحديث يتبع المستودع المركزي دون token داخل التطبيق',
      feed.provider === 'github' && feed.owner === RELEASE_CONFIG.repository.owner
      && feed.repo === RELEASE_CONFIG.repository.repo && !('token' in feed));
    // These are configuration checks. package-app verifies real resources and native runtimes after packaging.
  } catch (error) {
    check('إعداد electron-builder صالح', false, error instanceof Error ? error.message : String(error));
  }
}

/* ── ٢. بوابة الطالب تُقلع وعقودها تعمل ────────────────── */

async function postJson(path, body, origin = ORIGIN, cookie = null) {
  const response = await fetch(`${ORIGIN}${path}`, {
    method: 'POST',
    // المتصفح يرسل Origin مع كل طلب كاتب؛ الفحص يحاكيه ليختبر ما يختبره.
    headers: {
      'Content-Type': 'application/json',
      ...(origin === null ? {} : { Origin: origin }),
      ...(cookie === null ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    setCookie: response.headers.get('set-cookie'),
    json: await response.json().catch(() => null),
  };
}

/**
 * يزرع معلماً وفصلاً وحصة مفتوحة في مجلد بيانات مؤقّت.
 *
 * الفحص يكتب في القاعدة نفسها التي يقرأ منها الخادم — وهو ما تفعله بوابة
 * الطالب في المنتج (عمليتان على ملف SQLite واحد بوضع WAL). فحصٌ ببيانات
 * مزيّفة داخل الخادم كان سيثبت أن الشيفرة تعمل، لا أن المعمارية تعمل.
 */
function seed(dataDirectory) {
  const handle = openDatabase({ file: join(dataDirectory, 'cubecroom.sqlite') });
  const repositories = createRepositories(handle);

  const teacherName = 'سارة العتيبي';
  const className = 'الصف السادس — علوم';
  repositories.teacher.save({ name: teacherName });
  const klass = repositories.classes.create({ name: className });
  repositories.sessions.start(klass.id, 'smoke-invite-token', JOIN_CODE);

  const file = join(dataDirectory, 'cubecroom.sqlite');
  const ids = { published: '', draft: '', attachment: '', activity: '', draftActivity: '' };
  return {
    className,
    teacherName,
    approve: (requestId) => repositories.sessions.approveRequest(requestId),
    endSession: () => repositories.sessions.endActive(),
    /** درس منشور + مسودة + درس فصل آخر — ثلاثة، ولا يصل الطالب إلا واحد. */
    seedLessons: () => {
      const published = repositories.lessons.create({
        classId: klass.id,
        title: 'دورة الماء في الطبيعة',
        blocks: [
          { type: 'paragraph', text: 'تبدأ دورة الماء حين تسخّن الشمس سطح البحار.' },
          { type: 'richText', section: 'summary', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'تتحرّك المياه في دورة مستمرة.', marks: [{ type: 'bold' }] }] }] } },
          { type: 'richText', section: 'outcomes', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'يميّز الطالب التبخّر والتكاثف.' }] }] } },
        ],
      });
      repositories.lessons.setPublished(published.id, true);
      const draft = repositories.lessons.create({ classId: klass.id, title: 'مسودة لا يراها أحد' });

      const other = repositories.classes.create({ name: 'الصف الخامس — علوم' });
      const elsewhere = repositories.lessons.create({ classId: other.id, title: 'درس فصل آخر' });
      repositories.lessons.setPublished(elsewhere.id, true);

      // مرفق حقيقي على القرص: الفحص ينزّله لا يكتفي بوجود صفّه.
      const storageName = '00000000-0000-4000-8000-000000000001.png';
      mkdirSync(join(dataDirectory, 'files'), { recursive: true });
      writeFileSync(join(dataDirectory, 'files', storageName), 'PNGDATA');
      const file = repositories.files.register({
        name: 'مخطط الدورة.png',
        kind: 'صورة',
        mimeType: 'image/png',
        sizeBytes: 7,
        storageName,
      });
      repositories.lessons.replaceAttachments(published.id, [file.id]);

      ids.published = published.id;
      ids.draft = draft.id;
      ids.attachment = file.id;
    },
    /**
     * نشاطان: منشور بسؤالَين، ومسودة لا تصل الطالب — كما في الدروس.
     * والخيارات معرّفاتها معروفة هنا حتى يستطيع الفحص أن يرسل إجابةً حقيقية.
     */
    seedActivities: () => {
      const published = repositories.activities.create({
        classId: klass.id,
        title: 'اختبار قصير: دورة الماء',
      });
      repositories.activities.replaceQuestions(published.id, [
        {
          id: 'smoke-q1',
          type: 'choice',
          prompt: 'أيّ المراحل تأتي مباشرةً بعد التبخّر؟',
          points: 1,
          expectedAnswer: null,
          options: [
            { id: 'smoke-q1-a', text: 'الجريان السطحي', isCorrect: false },
            { id: 'smoke-q1-b', text: 'التكاثف', isCorrect: true },
          ],
        },
        {
          id: 'smoke-q2',
          type: 'text',
          prompt: 'اذكر مرحلتين من مراحل الدورة.',
          points: 2,
          expectedAnswer: 'التبخّر ثم التكاثف',
          options: [],
        },
      ]);
      repositories.activities.update(published.id, { lessonId: ids.published });
      repositories.activities.setPublished(published.id, true);

      const draft = repositories.activities.create({
        classId: klass.id,
        title: 'نشاط مسودة لا يراه أحد',
      });
      repositories.activities.replaceQuestions(draft.id, [
        {
          id: 'smoke-d1',
          type: 'text',
          prompt: 'سؤال في مسودة',
          points: 1,
          expectedAnswer: null,
          options: [],
        },
      ]);

      ids.activity = published.id;
      ids.draftActivity = draft.id;
    },
    activityId: () => ids.activity,
    hasLinkedActivity: () =>
      ids.activity !== '' &&
      repositories.activities.get(ids.activity).lessonId === ids.published,
    draftActivityId: () => ids.draftActivity,
    submissionCount: () =>
      ids.activity === '' ? 0 : repositories.submissions.listByActivity(ids.activity).length,
    submissionRows: () =>
      ids.activity === '' ? [] : repositories.submissions.listByActivity(ids.activity),
    storedAnswers: () => {
      const [row] = repositories.submissions.listByActivity(ids.activity);
      return row === undefined ? [] : repositories.submissions.answersFor(row.submission.id);
    },
    publishedLessonId: () => ids.published,
    draftLessonId: () => ids.draft,
    attachmentId: () => ids.attachment,
    readCount: (lessonId) =>
      repositories.students
        .listByClass(klass.id)
        .filter((student) => repositories.lessons.readBy(student.id).includes(lessonId)).length,
    /** عدد الطلبات المعلّقة — يُثبت أن المرفوض لم يُسجَّل أصلاً لا أنه أُخفي. */
    pendingCount: () => {
      const active = repositories.sessions.active();
      return active === undefined ? 0 : repositories.sessions.listRequests(active.id, 'pending').length;
    },
    /** يقرأ ملف القاعدة خاماً: أصدق طريقة لإثبات أن الرمز ليس فيه (SEC-007). */
    rawDatabaseContains: (needle) => readFileSync(file).includes(needle),
    close: () => handle.close(),
  };
}

async function checkStudentPortal() {
  console.log('\nبوابة الطالب — حزمة standalone');

  const entry = studentServerEntry(root);
  await assertBuilt(entry);

  // بيانات حقيقية لا وهمية: بلا حصة مفتوحة لا يمكن إثبات أن الطلب لا يمنح
  // وصولاً — سيُرفض قبل أن يصل إلى المنطق الذي نريد فحصه.
  const dataDirectory = await mkdtemp(join(tmpdir(), 'cubecroom-smoke-'));
  const seeded = seed(dataDirectory);

  /*
   * NFR-002 — «يبدأ خلال ≤ ٣ ثوانٍ». يُقاس هنا لأن `tsc` لا يقيس زمناً.
   *
   * **بوسيط ثلاث محاولات لا بعيّنة واحدة.** أول إقلاع بارد على جهاز مشغول
   * يقفز إلى ثلاثة أضعاف المعتاد — فكان هذا الحارس يسقط حين يُشغَّل بعد
   * الفحص البصريّ مباشرة (٣٤٠١ms)، ويمرّ وحده (٩٧٩ · ٩٩٦ · ١٠١٥ms). وحارسٌ
   * يسقط بلا سبب يُعطَّل بعد ثالث مرة فيصير كأنه غير موجود.
   *
   * والعيّنات كلّها تُعرض: تراجعٌ حقيقيّ يُبطئ الثلاث معاً، وضجيجُ جهازٍ
   * يُبطئ واحدة — والفرق يُقرأ من السطر نفسه.
   */
  const startup = await measureStartup({ entry, dataDirectory, port: PORT });
  check(
    'الخادم يُقلع عملية Node مستقلة',
    startup.samples.length > 0,
    startup.lastError.slice(0, 400),
  );
  if (startup.samples.length === 0) return;

  check(
    `الإقلاع خلال ثلاث ثوانٍ — NFR-002 (وسيط ${startup.median}ms)`,
    startup.median <= 3000,
    `العيّنات: ${startup.samples.join(' · ')}ms`,
  );

  // ثم خادمٌ واحد يبقى قائماً لبقيّة الفحوص — لا إقلاعٌ لكل فحص.
  const portal = spawnStudentServer({ entry, port: PORT, dataDirectory });

  try {
    const up = (await awaitStudentServer(PORT, portal.hasExited)) !== null;
    check('الخادم يبقى قائماً لبقيّة الفحوص', up, portal.stderr().slice(0, 400));
    if (!up) return;

    /*
     * **٢٠٠ لا تعني أن الطالب يستطيع الدخول.**
     *
     * بقي `/join` يردّ ٢٠٠ وهو يعرض نصّاً مؤقتاً من P1 — «تُبنى في الخطوة
     * التالية» — لأن شاشة الانضمام بُنيت ولم تُوصَل بمسارها. ولم يكشفه شيء:
     * الفحص كان يسأل عن رمز الحالة، والصفحة كانت تردّ به بأمانة.
     *
     * ويُفحص هنا لا في آخر الملفّ: هناك تكون الحصة قد أُنهيت، فالصفحة تعرض
     * «الدخول غير مفتوح الآن» بحقّ — ولا نموذج فيها ولا يجب أن يكون.
     */
    const joinPage = await fetch(`${ORIGIN}/join`);
    const joinHtml = await joinPage.text();

    /*
     * **حين تفشل هذه، اقرأ `stderr` لا الصفحة.**
     *
     * الصفحة تعرض «الدخول غير مفتوح الآن» لسببين متباعدين: لا حصة (سليم)، أو
     * البوابة لا تفتح قاعدتها (عطل). وشكلهما واحد في HTML — فكان الفشل يُخرج
     * ثمانية أسطر متطابقة لا يُقرأ منها شيء. وقد وقع: `bundle-desktop` يعيد
     * بناء الوحدة الأصلية لـElectron **داخل مخرَج `standalone`**، فبقيت هناك
     * بـABI لا يحمّله `node` — والسبب لا يظهر إلا في `stderr` الخادم.
     */
    const why_ = () => {
      const noise = portal.stderr();
      return noise === '' ? joinHtml.slice(0, 300) : noise.slice(-600);
    };

    for (const [needle, why] of [
      ['رمز الحصة', 'حقل الرمز — بلاه لا يصل طلب'],
      ['اسمك', 'حقل الاسم'],
      ['طلب الدخول', 'زرّ الإرسال'],
      [seeded.className, 'اسم الفصل — ليعرف الطالب أنه في المكان الصحيح'],
    ]) {
      check(`/join يعرض ${why}`, joinHtml.includes(needle), why_());
    }
    check('ولا أثر لنصّ مؤقّت من مرحلة سابقة', !joinHtml.includes('تُبنى في الخطوة التالية'));

    const page = await fetch(ORIGIN);
    const html = await page.text();
    check('الصفحة الجذر ترد 200', page.status === 200);
    check('الوثيقة عربية RTL', html.includes('dir="rtl"') && html.includes('lang="ar"'));
    check('مقياس الطالب مفعّل (data-app)', html.includes('data-app="student"'));

    // FR-005: الطلب يُسجَّل ولا يمنح وصولاً — لا رمز ولا كعكة في الردّ.
    /*
     * §22 — الرمز حارسٌ لا زينة: طلبٌ برمز خاطئ يُرفض، ولا يظهر في قائمة
     * المعلم. وفحصه قبل الطلب الصحيح ليثبت أن الرفض ليس أثراً لطلب سابق.
     */
    const wrongCode = await postJson('/api/join', { name: 'جارٌ فضولي', joinCode: '000000' });
    check(
      'رمز خاطئ ⇦ يُرفض الطلب — §22',
      wrongCode.status === 400 &&
        wrongCode.json?.error?.code === 'validation' &&
        wrongCode.json?.error?.field === 'joinCode',
      JSON.stringify(wrongCode),
    );
    check(
      'الطلب المرفوض لا يصل إلى قائمة المعلم',
      seeded.pendingCount() === 0,
      `معلّق: ${seeded.pendingCount()}`,
    );

    const noCode = await postJson('/api/join', { name: 'بلا رمز' });
    check(
      'طلب بلا رمز ⇦ validation على الحقل joinCode',
      noCode.status === 400 && noCode.json?.error?.field === 'joinCode',
      JSON.stringify(noCode),
    );

    // الأرقام العربية والشرطة تُنظَّف قبل المقارنة — لا تُعاقَب صياغةُ الكتابة.
    const valid = await postJson('/api/join', {
      name: 'ريم عبدالله',
      joinCode: '٤٨٢-٩١٧',
    });
    const accepted = valid.json?.data;
    check(
      'POST /api/join باسم صالح ⇦ طلب معلّق',
      valid.status === 200 && accepted?.status === 'pending' && typeof accepted?.requestId === 'string',
      JSON.stringify(valid),
    );
    check(
      'الطلب لا يمنح وصولاً — لا رمز ولا كعكة',
      accepted !== undefined &&
        !('token' in accepted) &&
        !('sessionToken' in accepted) &&
        !('studentId' in accepted) &&
        valid.setCookie === null,
      JSON.stringify({ body: accepted, setCookie: valid.setCookie }),
    );
    check(
      'ترويسة الطالب تحمل اسم فصله ومعلمه',
      accepted?.className === seeded.className && accepted?.teacherName === seeded.teacherName,
      JSON.stringify(accepted),
    );

    let sessionCookie = null;
    if (typeof accepted?.requestId === 'string') {
      const pending = await fetch(`${ORIGIN}/api/join/status?request=${accepted.requestId}`);
      const pendingBody = await pending.json();
      check(
        'GET /api/join/status ⇦ pending ولا يعيد بيانات صاحب الطلب',
        pending.status === 200 &&
          pendingBody?.data?.status === 'pending' &&
          pendingBody?.data?.submittedName === undefined,
        JSON.stringify(pendingBody),
      );

      // بلا جلسة: محتوى الطالب مغلق — SEC-007.
      const before = await fetch(`${ORIGIN}/api/student/lessons`);
      const beforeBody = await before.json();
      check(
        'محتوى الطالب مغلق بلا جلسة',
        before.status === 403 && beforeBody?.error?.code === 'forbidden',
        JSON.stringify(beforeBody),
      );

      seeded.approve(accepted.requestId);
      const approved = await fetch(`${ORIGIN}/api/join/status?request=${accepted.requestId}`);
      const approvedBody = await approved.json();
      const cookie = approved.headers.get('set-cookie');
      check(
        'القبول يُصدر رمزاً في كعكة، ولا يظهر الرمز في جسم الردّ',
        approvedBody?.data?.status === 'approved' &&
          approvedBody?.data?.token === undefined &&
          cookie !== null &&
          cookie.includes('cubecroom_student='),
        JSON.stringify({ body: approvedBody, cookie }),
      );
      check(
        'الكعكة HttpOnly و SameSite — لا تقرؤها شيفرة الصفحة',
        cookie !== null && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie),
        String(cookie),
      );

      const jar = cookie === null ? '' : (cookie.split(';')[0] ?? '');
      sessionCookie = jar;
      const token = jar.split('=')[1] ?? '';
      check(
        'الرمز نفسه غير مخزَّن في القاعدة — الهاش وحده',
        token !== '' && !seeded.rawDatabaseContains(token),
        'وُجد نصّ الرمز داخل ملف القاعدة',
      );

      // FR-009: الطالب يرى المنشور من فصله وحده — والمسودة لا تصله.
      seeded.seedLessons();
      seeded.seedActivities();
      const withSession = await fetch(`${ORIGIN}/api/student/lessons`, {
        headers: { cookie: jar },
      });
      const home = (await withSession.json())?.data;
      check(
        'الجلسة الحيّة تفتح رئيسية الطالب',
        withSession.status === 200 && home?.studentName === 'ريم عبدالله',
        JSON.stringify(home),
      );
      check(
        'المسودة لا تصل الطالب، ولا درسُ فصل آخر',
        Array.isArray(home?.lessons) &&
          home.lessons.length === 1 &&
          home.lessons[0]?.title === 'دورة الماء في الطبيعة',
        JSON.stringify(home?.lessons),
      );
      check(
        'الردّ لا يحمل معرّف الفصل ولا معرّف الطالب',
        home !== undefined && home.classId === undefined && home.studentId === undefined,
        JSON.stringify(Object.keys(home ?? {})),
      );

      // S05 · S06: العارض يفتح المنشور وحده، ويسجّل القراءة بفتحه.
      const published = seeded.publishedLessonId();
      const viewer = await fetch(`${ORIGIN}/lessons/${published}`, { headers: { cookie: jar } });
      const viewerHtml = await viewer.text();
      check('أقسام الدرس والتنسيق تصل إلى الطالب عبر HTTP', viewerHtml.includes('<strong>تتحرّك المياه في دورة مستمرة.</strong>') && viewerHtml.includes('مخرجات التعلّم') && viewerHtml.includes('يميّز الطالب التبخّر والتكاثف.'));
      check(
        'عارض الدرس يفتح لصاحب الجلسة',
        viewer.status === 200 && viewerHtml.includes('دورة الماء في الطبيعة'),
        `status=${viewer.status}`,
      );
      check(
        'فتح الدرس يسجّل القراءة — «قرأه الطلاب» أثر لا تخمين',
        seeded.readCount(published) === 1,
        `عدد القراءات: ${seeded.readCount(published)}`,
      );

      const draftId = seeded.draftLessonId();
      const draftView = await fetch(`${ORIGIN}/lessons/${draftId}`, { headers: { cookie: jar } });
      check('المسودة لا تُفتح بمعرّفها المباشر', draftView.status === 404, `status=${draftView.status}`);

      const anonymous = await fetch(`${ORIGIN}/lessons/${published}`, { redirect: 'manual' });
      check(
        'بلا جلسة يُحوَّل إلى /join لا يُعرض الدرس',
        anonymous.status === 307 || anonymous.status === 302,
        `status=${anonymous.status}`,
      );

      const attachmentId = seeded.attachmentId();
      const download = await fetch(`${ORIGIN}/api/student/files/${attachmentId}`, {
        headers: { cookie: jar },
      });
      check(
        'المرفق يُقدَّم للتنزيل لا للعرض — لا تنفيذ في متصفّح الطالب',
        download.status === 200 &&
          download.headers.get('content-type') === 'application/octet-stream' &&
          (download.headers.get('content-disposition') ?? '').startsWith('attachment'),
        JSON.stringify({
          status: download.status,
          type: download.headers.get('content-type'),
          disposition: download.headers.get('content-disposition'),
        }),
      );

      const stolen = await fetch(`${ORIGIN}/api/student/files/${attachmentId}`);
      check('المرفق مغلق بلا جلسة', stolen.status === 403, `status=${stolen.status}`);

      // السياسة §23 · قرار D10: مطفأة افتراضياً — **حتى لطالب بجلسة صحيحة**،
      // فالمنع سياسة لا نتيجةَ نقصٍ في المصادقة.
      const ai = await postJson(
        '/api/student/ai',
        { lessonId: seeded.publishedLessonId(), question: 'ليش الغيوم فوق؟' },
        ORIGIN,
        sessionCookie,
      );
      check(
        'مساعدة الطالب مطفأة افتراضياً ولو كانت جلسته صحيحة — §23',
        ai.status === 403 && ai.json?.error?.code === 'ai_disabled',
        JSON.stringify(ai),
      );

      const anonymousAi = await postJson('/api/student/ai', {
        lessonId: seeded.publishedLessonId(),
        question: 'سؤال',
      });
      check('ومغلقة تماماً بلا جلسة', anonymousAi.status === 403, JSON.stringify(anonymousAi));

/* ── الأنشطة والإرسال — FR-012 · FR-013 ────────── */

      const listed = await fetch(`${ORIGIN}/api/student/activities`, { headers: { cookie: jar } });
      const listedBody = await listed.json();
      check(
        'المسودة لا تصل الطالب في الأنشطة أيضاً',
        listed.status === 200 &&
          Array.isArray(listedBody?.data) &&
          listedBody.data.length === 1 &&
          listedBody.data[0].id === seeded.activityId(),
        JSON.stringify(listedBody),
      );

      // معيار P5-1 مُثبَتاً عبر الشبكة: مفتاح الإجابة لا يعبر إلى جهاز الطالب.
      const activityPage = await fetch(`${ORIGIN}/activities/${seeded.activityId()}`, {
        headers: { cookie: jar },
      });
      const activityHtml = await activityPage.text();
      check(
        'صفحة النشاط تفتح لصاحب الجلسة',
        activityPage.status === 200 && activityHtml.includes('اختبار قصير: دورة الماء'),
        `status=${activityPage.status}`,
      );
      check(
        'مفتاح الإجابة لا يظهر في صفحة الطالب — لا isCorrect ولا الإجابة المتوقَّعة',
        !activityHtml.includes('isCorrect') && !activityHtml.includes('التبخّر ثم التكاثف'),
      );

      const draftActivity = await fetch(`${ORIGIN}/activities/${seeded.draftActivityId()}`, {
        headers: { cookie: jar },
      });
      check(
        'نشاط المسودة لا يُفتح بمعرّفه المباشر',
        draftActivity.status === 404,
        `status=${draftActivity.status}`,
      );

      // FR-013: الإرسال يعيد ختم وقت — وهو دليل الطالب على الوصول (US-S07).
      const answersBody = {
        activityId: seeded.activityId(),
        answers: [
          { type: 'choice', questionId: 'smoke-q1', optionId: 'smoke-q1-b' },
          { type: 'text', questionId: 'smoke-q2', text: 'التبخّر والتكاثف' },
        ],
      };
      const sent = await postJson('/api/student/submissions', answersBody, ORIGIN, sessionCookie);
      const receipt = sent.json?.data;
      check(
        'إرسال الإجابة يردّ إيصالاً بختم وقت — Sending ⇦ Submitted',
        sent.status === 200 &&
          typeof receipt?.submissionId === 'string' &&
          !Number.isNaN(Date.parse(receipt?.submittedAt ?? '')) &&
          receipt?.answered === 2 &&
          receipt?.total === 2,
        JSON.stringify(sent),
      );
      check(
        'الإجابة وصلت جهاز المعلم فعلاً — الصفّان في قاعدته لا في متصفّح الطالب',
        seeded.submissionCount() === 1 && seeded.storedAnswers().length === 2,
        `submissions=${seeded.submissionCount()} answers=${seeded.storedAnswers().length}`,
      );

      // «يمنع submit المكرر»: القيد في المخطط لا الزرّ في الصفحة.
      const again = await postJson(
        '/api/student/submissions',
        {
          activityId: seeded.activityId(),
          answers: [{ type: 'text', questionId: 'smoke-q2', text: 'إجابة ثانية مختلفة' }],
        },
        ORIGIN,
        sessionCookie,
      );
      check(
        'الإرسال الثاني يعيد الإيصال الأول ولا يُنشئ تسليماً ثانياً',
        again.status === 200 &&
          again.json?.data?.submissionId === receipt?.submissionId &&
          again.json?.data?.submittedAt === receipt?.submittedAt &&
          seeded.submissionCount() === 1,
        JSON.stringify(again),
      );
      check(
        'ولا يكتب فوق الإجابة الأولى — عليها بنى المعلم تصحيحه',
        seeded.storedAnswers().some((row) => row.text === 'التبخّر والتكاثف'),
        JSON.stringify(seeded.storedAnswers().map((row) => row.text)),
      );

      // المفاتيح الأجنبية وحدها تقبل خيار سؤالٍ آخر — الفحص في المستودع يمنعه.
      const tampered = await postJson(
        '/api/student/submissions',
        {
          activityId: seeded.activityId(),
          answers: [{ type: 'choice', questionId: 'smoke-q1', optionId: 'smoke-d1' }],
        },
        ORIGIN,
        sessionCookie,
      );
      check(
        'إجابة بخيار لا ينتمي إلى سؤالها تُرفض',
        tampered.status === 400 && tampered.json?.error?.code === 'validation',
        JSON.stringify(tampered),
      );

      const anonymousSend = await postJson('/api/student/submissions', answersBody);
      check(
        'ولا يُقبل إرسال بلا جلسة',
        anonymousSend.status === 403,
        JSON.stringify(anonymousSend),
      );

// P5-4: الفشل يبقى فشلاً في الخادم — ولا يُكتب تسليم ناقص لأن الطلب
      // وصل نصفه. الحالة الوحيدة القابلة للفحص هنا هي الرفض المعلَّل.
      const countBefore = seeded.submissionCount();
      const rejected = await postJson(
        '/api/student/submissions',
        { activityId: seeded.draftActivityId(), answers: [{ type: 'text', questionId: 'smoke-d1', text: 'إجابة' }] },
        ORIGIN,
        sessionCookie,
      );
      check(
        'نشاط غير منشور لا يُقبل تسليمه — ورسالته عربية يفهمها الطالب',
        rejected.status === 404 &&
          /[؀-ۿ]/.test(rejected.json?.error?.message ?? '') &&
          seeded.submissionCount() === countBefore,
        JSON.stringify(rejected),
      );

// P5-5: النشاط المزروع فيه سؤال نصّيّ، فلا يُختم «صُحّح» بلا قراءة بشرية.
      const [landed] = seeded.submissionRows();
      check(
        'التسليم فيه سؤال نصّيّ فيبقى بانتظار المعلم — لا يُصحَّح آلياً',
        landed !== undefined &&
          landed.submission.status === 'submitted' &&
          landed.submission.score === null &&
          landed.submission.reviewedAt === null,
        JSON.stringify(landed?.submission ?? null),
      );

      // S06: «نشاط مرتبط بهذا الدرس» — الرابط يظهر حين يوجد نشاط منشور له.
      const linkedPage = await fetch(`${ORIGIN}/lessons/${seeded.publishedLessonId()}`, {
        headers: { cookie: jar },
      });
      const linkedHtml = await linkedPage.text();
      check(
        'الدرس يعرض نشاطه المرتبط، ولا يعرض نشاطاً غير مرتبط به',
        linkedHtml.includes('نشاط مرتبط بهذا الدرس') === seeded.hasLinkedActivity(),
        `linked=${seeded.hasLinkedActivity()}`,
      );

      // شريط التنقّل على شاشات القوائم وحدها — قرار D11.
      const listPage = await fetch(`${ORIGIN}/activities`, { headers: { cookie: jar } });
      const listHtml = await listPage.text();
      const runnerPage = await fetch(`${ORIGIN}/activities/${seeded.activityId()}`, {
        headers: { cookie: jar },
      });
      const runnerHtml = await runnerPage.text();
      check(
        'شريط التنقّل في القوائم لا في شاشة الإجابة — ولا تبويب «مساعدة» فيه',
        listHtml.includes('أقسام الفصل') &&
          !listHtml.includes('>مساعدة<') &&
          !runnerHtml.includes('أقسام الفصل'),
      );

      // معيار الإنجاز: «إنهاء دخول الطلاب» يبطل الجلسات.
      seeded.endSession();
      const afterEnd = await fetch(`${ORIGIN}/api/student/lessons`, { headers: { cookie: jar } });
      const afterBody = await afterEnd.json();
      check(
        'إنهاء الحصة يُبطل رمز الطالب فوراً',
        afterEnd.status === 403 && afterBody?.error?.code === 'forbidden',
        JSON.stringify(afterBody),
      );

      const endedStatus = await fetch(`${ORIGIN}/api/join/status?request=${accepted.requestId}`);
      const endedBody = await endedStatus.json();
      check(
        'وحالة الطلب تصير session_ended لا approved',
        endedBody?.data?.status === 'session_ended',
        JSON.stringify(endedBody),
      );
    }

    const unknown = await fetch(`${ORIGIN}/api/join/status?request=lا-وجود-له`);
    check('طلب مجهول ⇦ not_found لا تسريب', unknown.status === 404);

    // العقد: التحقق يرفض ويربط الرسالة بحقلها — ورسالتها من لوح S01Error
    const invalid = await postJson('/api/join', { name: 'ر', joinCode: JOIN_CODE });
    check(
      'POST /api/join باسم ناقص ⇦ validation على الحقل name',
      invalid.status === 400 &&
        invalid.json?.error?.code === 'validation' &&
        invalid.json?.error?.field === 'name' &&
        typeof invalid.json?.error?.message === 'string' &&
        invalid.json.error.message.length > 0,
      JSON.stringify(invalid),
    );


    // لا يظهر للطالب رمز HTTP ولا مصطلح تقني — الرسالة عربية دائماً
    const foreignPreview = await postJson('/api/student/ai', { lessonId: 'x', question: 'سؤال' });
    const arabic = /[؀-ۿ]/;
    check(
      'رسائل الأخطاء عربية موجَّهة للإنسان',
      arabic.test(invalid.json?.error?.message ?? '') &&
        arabic.test(foreignPreview.json?.error?.message ?? ''),
    );

    // SEC-008: طلب كاتب من صفحة أخرى على الشبكة يُرفض قبل أن يُقرأ.
    const foreign = await postJson(
      '/api/join',
      { name: 'مهاجم', joinCode: JOIN_CODE },
      'http://192.168.1.99:8080',
    );
    check(
      'طلب من أصل آخر يُرفض — CSRF',
      foreign.status === 403 && foreign.json?.error?.code === 'forbidden',
      JSON.stringify(foreign),
    );

    const originless = await postJson('/api/join', { name: 'بلا أصل', joinCode: JOIN_CODE }, null);
    check('طلب كاتب بلا ترويسة أصل يُرفض', originless.status === 403, JSON.stringify(originless));

    /*
     * الحدّ بعد P6-5 يحرس شيئين متضادّين، فيُفحص الاثنان:
     *
     *   ١. **صفٌّ كامل يدخل.** الحدّ القديم كان عشرة مشتركة بين الجميع، فكان
     *      الطالب الحادي عشر يُمنع دقيقةً كاملة — عطلٌ أسوأ ممّا يحرس منه.
     *   ٢. **والإغراق يُوقَف** بعد سعة صفّ مع إعادة محاولاته.
     */
    let blockedAt = null;
    let lastGood = 0;
    for (let attempt = 0; attempt < 120 && blockedAt === null; attempt += 1) {
      const response = await postJson('/api/join', {
        name: `طالب ${attempt}`,
        joinCode: JOIN_CODE,
      });
      if (response.status === 429) blockedAt = { attempt, response };
      else lastGood = attempt + 1;
    }

    check(
      'صفٌّ كامل (٣٠ طالباً) يدخل بلا أن يوقفه الحدّ — NFR-003',
      lastGood >= 30,
      `مرّ ${lastGood} طلباً قبل الحدّ`,
    );
    check(
      'والإغراق بعدها يُوقَف بـ rate limit ورسالة عربية',
      blockedAt !== null && blockedAt.response.json?.error?.code === 'rate_limited',
      JSON.stringify(blockedAt?.response ?? null),
    );

    const headers = await fetch(ORIGIN);
    check(
      'ترويسات الأمن مضبوطة على صفحات الطالب',
      headers.headers.get('x-content-type-options') === 'nosniff' &&
        (headers.headers.get('content-security-policy') ?? '').includes("default-src 'self'") &&
        headers.headers.get('referrer-policy') === 'no-referrer',
      JSON.stringify({
        csp: headers.headers.get('content-security-policy'),
        nosniff: headers.headers.get('x-content-type-options'),
        referrer: headers.headers.get('referrer-policy'),
      }),
    );

    // ممنوع أي سطح إدارة على خادم الطلاب — PRD §14
    // الرابط الذي يحمله رمز T09 — يُكتب على السبورة، فلا يجوز أن يردّ 404.
    const join = await fetch(`${ORIGIN}/join`);
    check('مسار الدعوة /join يردّ 200', join.status === 200);



    for (const forbidden of ['/api/admin', '/api/teacher', '/teacher']) {
      const response = await fetch(`${ORIGIN}${forbidden}`);
      check(`لا سطح إدارة على ${forbidden}`, response.status === 404);
    }
  } finally {
    await portal.stop();
    seeded.close();
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
}

/* ── ٣. حزمة المعلم مُصدَّرة ثابتة ─────────────────────── */

async function checkTeacherExport() {
  console.log('\nواجهة المعلم — static export');
  const index = join(root, 'apps', 'teacher-ui', 'out-next', 'index.html');
  try {
    const html = await readFile(index, 'utf8');
    check('index.html مُصدَّر', html.length > 0);
    check('الوثيقة عربية RTL', html.includes('dir="rtl"') && html.includes('lang="ar"'));
  } catch {
    check('out-next/index.html موجود', false, `غير موجود: ${index}`);
    return;
  }

  // T01States — الحالات الثلاث تشحن فعلاً في الحزمة، لا في الشيفرة وحدها.
  const bundle = await readAll(join(root, 'apps', 'teacher-ui', 'out-next', '_next'));
  check('رسالة التشغيل الطويل مشحونة', bundle.includes('نجهّز بياناتك'));
  check('مسار الاسترجاع مشحون', bundle.includes('تحديد مكان البيانات'));
}

/** يقرأ كل ملفات المجلد نصّاً — الحزمة مقسَّمة، والنصّ قد يقع في أي قطعة. */
async function readAll(directory) {
  const { readdir } = await import('node:fs/promises');
  let out = '';
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out += await readAll(path);
    else if (/\.(js|html)$/.test(entry.name)) out += await readFile(path, 'utf8');
  }
  return out;
}

console.log('فحص الدخان — CubeCroom');
await checkDesktopSecurity();
await checkTeacherExport();
await checkStudentPortal();

console.log(
  failures === 0 ? '\nكل الفحوص نجحت.' : `\nفشل ${failures} فحصاً.`,
);
process.exit(failures === 0 ? 0 : 1);
