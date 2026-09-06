import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, createRepositories } from '@cubecroom/db';
import {
  assertBuilt,
  awaitStudentServer,
  spawnStudentServer,
  studentServerEntry,
} from './lib/student-server.mjs';

/**
 * اختبار الحِمل — NFR-003: «٣٠ طالباً متزامنين».
 *
 * **لماذا هو ملف مستقل لا جزءٌ من `pnpm verify`:** القياس يعتمد على الجهاز
 * الذي يعمل عليه. جعله شرطاً في كل بناء يُسقط البناء على حاسوب بطيء أو مشغول،
 * فيصير الرقم عائقاً يُتجاوَز بدل أن يكون مقياساً يُقرأ. يُشغَّل عمداً:
 * `pnpm load`.
 *
 * والحمل حقيقيّ لا محاكاة: ثلاثون طالباً يدخلون فعلاً، ولكلٍّ كعكته وجلسته،
 * ويطلبون معاً ما تطلبه صفحاتهم في الحصة. والقياس على **بوابة الطالب المبنيّة**
 * تقرأ قاعدةً يكتب فيها المعلم في اللحظة نفسها — وهو حال الحصة بالضبط.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const PORT = 4321;
/** رمز الحصة — ثلاثون طالباً يكتبونه في اللحظة نفسها. */
const JOIN_CODE = '204815';

const ORIGIN = `http://127.0.0.1:${PORT}`;
const STUDENTS = 30;
/** جولات لكل طالب: نبضة صفحته كل خمس ثوانٍ خلال حصة قصيرة. */
const ROUNDS = 6;
/** NFR-003 حرفياً. */
const P95_BUDGET_MS = 500;

let failures = 0;

function check(name, passed, detail = '') {
  console.log(`  ${passed ? '✓' : '✗'} ${name}${detail === '' ? '' : ` — ${detail}`}`);
  if (!passed) failures += 1;
}

/* ── بيانات حصة حقيقية ─────────────────────────────── */

function seed(dataDirectory) {
  const handle = openDatabase({ file: join(dataDirectory, 'cubecroom.sqlite') });
  const repositories = createRepositories(handle);

  repositories.teacher.save({ name: 'سارة العتيبي' });
  const klass = repositories.classes.create({ name: 'الصف السادس — علوم' });
  repositories.sessions.start(klass.id, 'load-invite-token', JOIN_CODE);

  // درسٌ بمحتوى ومرفق: صفحة فارغة لا تقيس شيئاً.
  const lesson = repositories.lessons.create({
    classId: klass.id,
    title: 'دورة الماء في الطبيعة',
    blocks: Array.from({ length: 12 }, (_, at) => ({
      type: 'paragraph',
      text: `فقرة ${at + 1}: ${'تبدأ دورة الماء حين تسخّن الشمس سطح البحار فيتبخّر الماء. '.repeat(3)}`,
    })),
  });
  repositories.lessons.setPublished(lesson.id, true);

  const storageName = '00000000-0000-4000-8000-000000000009.png';
  mkdirSync(join(dataDirectory, 'files'), { recursive: true });
  writeFileSync(join(dataDirectory, 'files', storageName), 'PNGDATA');
  const file = repositories.files.register({
    name: 'مخطط الدورة.png',
    kind: 'صورة',
    mimeType: 'image/png',
    sizeBytes: 7,
    storageName,
  });
  repositories.lessons.replaceAttachments(lesson.id, [file.id]);

  const activity = repositories.activities.create({
    classId: klass.id,
    title: 'اختبار قصير: دورة الماء',
    lessonId: lesson.id,
  });
  repositories.activities.replaceQuestions(activity.id, [
    {
      id: 'load-q1',
      type: 'choice',
      prompt: 'أيّ المراحل تأتي مباشرةً بعد التبخّر؟',
      points: 1,
      expectedAnswer: null,
      options: [
        { id: 'load-q1-a', text: 'الجريان السطحي', isCorrect: false },
        { id: 'load-q1-b', text: 'التكاثف', isCorrect: true },
      ],
    },
    {
      id: 'load-q2',
      type: 'text',
      prompt: 'اذكر مرحلتين من مراحل الدورة.',
      points: 2,
      expectedAnswer: 'التبخّر ثم التكاثف',
      options: [],
    },
  ]);
  repositories.activities.setPublished(activity.id, true);

  return {
    lessonId: lesson.id,
    activityId: activity.id,
    approve: (requestId) => repositories.sessions.approveRequest(requestId),
    close: () => handle.close(),
  };
}

/* ── القياس ────────────────────────────────────────── */

/**
 * P95 على العيّنة المرتّبة.
 * والمتوسط لا يُكتفى به: عشرون طلباً سريعاً تُخفي طلباً بطيئاً واحداً، وذلك
 * الطلب البطيء هو الطالب الذي انتظر أمام صفّه.
 */
function percentile(samples, fraction) {
  if (samples.length === 0) return 0;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[index];
}

function report(label, samples, errors) {
  const p50 = Math.round(percentile(samples, 0.5));
  const p95 = Math.round(percentile(samples, 0.95));
  const worst = Math.round(Math.max(...samples, 0));
  console.log(
    `  ${label.padEnd(34)} n=${String(samples.length).padStart(4)}  ` +
      `p50=${String(p50).padStart(4)}ms  p95=${String(p95).padStart(4)}ms  ` +
      `أسوأ=${String(worst).padStart(5)}ms  أخطاء=${errors}`,
  );
  return { p50, p95, worst, errors };
}

async function timed(url, cookie) {
  const began = performance.now();
  try {
    const response = await fetch(url, {
      headers: cookie === undefined ? {} : { cookie },
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    return { ms: performance.now() - began, ok: response.status === 200 };
  } catch {
    return { ms: performance.now() - began, ok: false };
  }
}

async function main() {
  const entry = studentServerEntry(root);
  await assertBuilt(entry);

  const dataDirectory = await mkdtemp(join(tmpdir(), 'cubecroom-load-'));
  const seeded = seed(dataDirectory);

  const portal = spawnStudentServer({ entry, port: PORT, dataDirectory });

  try {
    console.log(`\nحِمل ${STUDENTS} طالباً متزامنين — NFR-003\n`);
    if ((await awaitStudentServer(PORT, portal.hasExited)) === null) {
      console.error(`الخادم لم يُقلع.\n${portal.stderr().slice(0, 400)}`);
      process.exit(1);
    }

    /* ١. ثلاثون طالباً يدخلون معاً — وهو أول ما يحدث في الحصة فعلاً. */
    const joinSamples = [];
    let joinErrors = 0;
    const cookies = [];

    const joins = await Promise.all(
      Array.from({ length: STUDENTS }, async (_, at) => {
        const began = performance.now();
        const response = await fetch(`${ORIGIN}/api/join`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ name: `طالب رقم ${at + 1}`, joinCode: JOIN_CODE }),
        });
        joinSamples.push(performance.now() - began);
        const body = await response.json();
        if (response.status !== 200) joinErrors += 1;
        return body?.data?.requestId ?? null;
      }),
    );
    report('دخول (POST /api/join)', joinSamples, joinErrors);

    /*
     * القبول على جهاز المعلم — كتابةٌ في القاعدة نفسها التي يقرأ منها الخادم.
     * وهذا هو الشرط الذي يميّز هذا الاختبار: عمليتان على ملف واحد بوضع WAL.
     */
    for (const requestId of joins) {
      if (requestId !== null) seeded.approve(requestId);
    }

    const statusSamples = [];
    let statusErrors = 0;
    await Promise.all(
      joins.map(async (requestId) => {
        if (requestId === null) return;
        const began = performance.now();
        const response = await fetch(`${ORIGIN}/api/join/status?request=${requestId}`);
        statusSamples.push(performance.now() - began);
        if (response.status !== 200) statusErrors += 1;
        const raw = response.headers.get('set-cookie');
        if (raw !== null) cookies.push(raw.split(';')[0] ?? '');
      }),
    );
    report('استعلام الحالة + إصدار الرمز', statusSamples, statusErrors);

    if (cookies.length < STUDENTS) {
      check(`صدر رمز لكل الطلاب الثلاثين`, false, `صدر ${cookies.length} فقط`);
    }

    /* ٢. صفحات الطالب — الحِمل الذي يقيسه NFR-003. */
    const pages = [
      ['الرئيسية', `${ORIGIN}/`],
      ['قائمة الدروس', `${ORIGIN}/lessons`],
      ['عارض الدرس', `${ORIGIN}/lessons/${seeded.lessonId}`],
      ['قائمة الأنشطة', `${ORIGIN}/activities`],
      ['النشاط', `${ORIGIN}/activities/${seeded.activityId}`],
      ['نبضة الدروس (API)', `${ORIGIN}/api/student/lessons`],
    ];

    const all = [];
    let allErrors = 0;

    for (const [label, url] of pages) {
      const samples = [];
      let errors = 0;
      for (let round = 0; round < ROUNDS; round += 1) {
        // كل الطلاب معاً في اللحظة نفسها — لا واحداً بعد واحد.
        const results = await Promise.all(cookies.map((cookie) => timed(url, cookie)));
        for (const result of results) {
          samples.push(result.ms);
          if (!result.ok) errors += 1;
        }
      }
      const summary = report(label, samples, errors);
      all.push(...samples);
      allErrors += errors;
      check(
        `${label}: p95 دون ${P95_BUDGET_MS}ms`,
        summary.p95 < P95_BUDGET_MS && errors === 0,
        `p95=${summary.p95}ms أخطاء=${errors}`,
      );
    }

    console.log('');
    const overall = report('المجموع — صفحات الطالب', all, allErrors);
    check(
      `NFR-003: p95 دون ${P95_BUDGET_MS}ms عبر كل الصفحات`,
      overall.p95 < P95_BUDGET_MS && allErrors === 0,
      `p95=${overall.p95}ms · أسوأ=${overall.worst}ms · أخطاء=${allErrors}`,
    );

    /*
     * ٣. النبضة — الحِمل الذي أضافه `D19` على الخلفية.
     *
     * كل صفحة يطول بقاء الطالب عليها تسأل `ping` **كل ثلاث ثوانٍ**. فثلاثون
     * طالباً يعني عشرة طلبات في الثانية تجري **بينما** يقرؤون ويجيبون — لا
     * وحدها. ولذلك تُقاس هنا لا في فراغ: السؤال ليس «كم تكلّف النبضة؟» بل
     * «هل أبطأت ما يفعله الطالب فعلاً؟».
     *
     * وثلاث ثوانٍ اختيارٌ يُدفع ثمنه: كل تخفيض للنافذة يضاعف الحِمل، والرقم
     * الذي يظهر هنا هو ما يبرّره أو يردّه.
     */
    console.log('\nالنبضة — ٣٠ طالباً كل ثلاث ثوانٍ');

    const pingSamples = [];
    let pingErrors = 0;
    /** خمس جولات ≈ خمس عشرة ثانية من حصة حقيقية. */
    for (let round = 0; round < 5; round += 1) {
      const results = await Promise.all(
        cookies.map((cookie) => timed(`${ORIGIN}/api/student/ping`, cookie)),
      );
      for (const result of results) {
        pingSamples.push(result.ms);
        if (!result.ok) pingErrors += 1;
      }
    }
    const pingSummary = report('نبضة (٣٠ متزامنة × ٥ جولات)', pingSamples, pingErrors);
    check(
      'النبضة لا تتجاوز ١٠٠ms عند p95 — وإلا فهي تزاحم ما يفعله الطالب',
      pingSummary.p95 < 100 && pingErrors === 0,
      `p95=${pingSummary.p95}ms أخطاء=${pingErrors}`,
    );

    /*
     * ٤. لحظة التسليم — أشدّ لحظة في الحصة.
     *
     * ثلاثون كتابةً متزامنة على قاعدة واحدة. ليست في معيار NFR-003 لكنها
     * تُقاس وتُعرض: عددٌ يُعرف خيرٌ من عددٍ يُكتشف أمام صفّ.
     */
    const submitSamples = [];
    let submitErrors = 0;
    const submits = await Promise.all(
      cookies.map(async (cookie) => {
        const began = performance.now();
        const response = await fetch(`${ORIGIN}/api/student/submissions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
          body: JSON.stringify({
            activityId: seeded.activityId,
            answers: [
              { type: 'choice', questionId: 'load-q1', optionId: 'load-q1-b' },
              { type: 'text', questionId: 'load-q2', text: 'التبخّر ثم التكاثف' },
            ],
          }),
        });
        submitSamples.push(performance.now() - began);
        if (response.status !== 200) submitErrors += 1;
        return response.status;
      }),
    );
    const submitSummary = report('تسليم متزامن (٣٠ كتابة)', submitSamples, submitErrors);
    check(
      'كل الطلاب سلّموا بلا خطأ واحد',
      submitErrors === 0 && submits.length === cookies.length,
      `أخطاء=${submitErrors}`,
    );
    console.log(`  (خارج معيار NFR-003 — للعلم: p95=${submitSummary.p95}ms)`);
  } finally {
    await portal.stop();
    seeded.close();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }

  console.log(failures === 0 ? '\nالحِمل ضمن الحدّ.' : `\nفشل ${failures} فحصاً.`);
  process.exit(failures === 0 ? 0 : 1);
}

await main();
