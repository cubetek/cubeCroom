import electron from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const { app, BrowserWindow } = electron;
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
const scratch = process.env.CUBECROOM_QA_ROOT;
const report = process.env.CUBECROOM_QA_REPORT;
if (!scratch || !report) throw new Error('Run pnpm test:ai-education for an isolated profile.');
mkdirSync(join(scratch, 'profile'), { recursive: true });
app.setPath('userData', join(scratch, 'profile'));
process.env.CUBECROOM_DATA_DIR = join(scratch, 'data');
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Launching this ESM fixture otherwise makes Electron use e2e/ as the app directory.
app.getAppPath = () => desktop;
const calls = [];
const pending = [];
const errors = [];
const captures = [];
const answer = 'لاحظ ما يحدث لبخار الماء عندما يبرد. ما الذي تتوقع أن يظهر على سطح بارد؟';
const pagePlan = {
  title: 'التبخر والتكاثف',
  introduction: 'تسخن الشمس الماء فيتبخر. عندما يبرد البخار يتكاثف ويتحول إلى قطرات ماء.',
  outcomes: ['يفسر الطالب انتقال الماء بين حالاته', 'يربط التبخر والتكاثف بموقف يومي'],
  blocks: [
    { kind: 'concept', title: 'كيف تتكون القطرة؟', body: 'يتكاثف بخار الماء عندما يبرد.' },
    {
      kind: 'example',
      title: 'الكوب البارد',
      body: 'لاحظ قطرات الماء خارج الكوب البارد وفكر في مصدرها.',
    },
    {
      kind: 'practice',
      title: 'جرّب الملاحظة',
      body: 'قارن كوباً بارداً بكوب في درجة حرارة الغرفة. سجل ما تراه.',
    },
    { kind: 'check', title: 'توقف وفكر', body: 'ما الدليل على أن القطرة جاءت من الهواء؟' },
    { kind: 'takeaway', title: 'الفكرة التي تبقى', body: 'الماء يغير حالته ولا يختفي.' },
  ],
  summary: ['الحرارة تساعد على التبخر', 'التبريد يسبب التكاثف'],
  preparation: {
    overview: 'توجيه خاص بالمعلم: راقب الاستدلال قبل التصحيح',
    steps: [
      {
        title: 'تمهيد بالملاحظة',
        minutes: 10,
        instructions: 'اعرض كوباً بارداً واسأل عن مصدر القطرات.',
      },
      { title: 'شرح ومثال', minutes: 15, instructions: 'اربط الإجابات بتحول حالة الماء.' },
      { title: 'تطبيق وتحقق', minutes: 20, instructions: 'راقب المحاولات واستخدم سؤال التحقق.' },
    ],
    misconceptions: [{ idea: 'الماء تسرب من الكوب', response: 'قارن بالكوب غير البارد.' }],
  },
  activity: {
    title: 'تحقق من فهم التكاثف',
    questions: [
      {
        type: 'choice',
        prompt: 'متى يتكاثف بخار الماء؟',
        options: [
          { text: 'عندما يبرد', isCorrect: true },
          { text: 'عندما يسخن أكثر', isCorrect: false },
        ],
      },
      {
        type: 'text',
        prompt: 'فسر القطرات خارج الكوب',
        expectedAnswer: 'مفتاح خاص للتجربة: تكاثف بخار الهواء',
      },
    ],
  },
};
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/v1/models') {
    return response.end(JSON.stringify({ data: [{ id: 'education-fixture' }] }));
  }
  if (request.url !== '/v1/chat/completions') return response.writeHead(404).end('{}');
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  calls.push(body);
  let composition;
  try {
    composition = JSON.parse(body.messages.find((message) => message.role === 'user').content);
  } catch {
    /* Plain student question. */
  }
  const content =
    composition?.teacherInstructions !== undefined
      ? composition.teacherInstructions.includes('نتيجة غير صالحة')
        ? '{invalid json'
        : JSON.stringify(pagePlan)
      : answer;
  const reply = () =>
    response.end(
      JSON.stringify({
        id: 'education-qa',
        object: 'chat.completion',
        created: 1,
        model: body.model,
        choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 20, completion_tokens: 20, total_tokens: 40 },
      }),
    );
  if (raw.includes('انتظار الاختبار')) pending.push(reply);
  else reply();
});
server.listen(0, '127.0.0.1');
const windowReady = new Promise((ready) =>
  app.once('browser-window-created', (_event, window) => {
    window.show = () => {};
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message);
    });
    window.webContents.once('did-finish-load', () => ready(window));
  }),
);
createRequire(import.meta.url)(join(desktop, 'dist-app/main.cjs'));
const deadline = setTimeout(() => {
  console.error('AI education smoke timed out');
  app.exit(1);
}, 180_000);
const pause = (ms = 100) => new Promise((done) => setTimeout(done, ms));
async function until(check) {
  const end = Date.now() + 25_000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`Timed out: ${check}`);
    await pause();
  }
}
function ui(window) {
  const evaluate = (code) => window.webContents.executeJavaScript(code);
  const click = async (label) => {
    const selector = `Array.from(document.querySelectorAll('button,[role="tab"],[role="radio"]')).find(n => n.getClientRects().length && (n.innerText.trim() === ${JSON.stringify(label)} || n.getAttribute('aria-label') === ${JSON.stringify(label)} || n.querySelector('span')?.innerText.trim() === ${JSON.stringify(label)}))`;
    await until(() => evaluate(`Boolean(${selector})`));
    await evaluate(
      `(() => { const n = ${selector}; n.scrollIntoView({ block: 'center' }); n.focus(); n.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); n.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })); n.click(); })()`,
    );
    await pause();
  };
  return {
    evaluate,
    click,
    capture: async (name) => {
      await evaluate(
        'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      );
      window.webContents.invalidate();
      await pause(400);
      const captured = await window.webContents.capturePage();
      writeFileSync(join(report, name), captured.toPNG());
      captures.push({
        file: name,
        view: { ...captured.getSize(), dpr: 1 },
        notes: [],
        timings: null,
        errors: [],
        text: await evaluate('document.body.innerText'),
      });
    },
  };
}

async function run() {
  let studentWindow;
  let invoke;
  try {
    if (!server.listening) await once(server, 'listening');
    const window = await windowReady;
    const teacher = ui(window);
    invoke = (method, input) =>
      teacher.evaluate(
        `window.cubecroom[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`,
      );
    assert.equal(
      (
        await invoke('completeOnboarding', {
          name: 'معلم التجربة',
          dataDirectory: join(scratch, 'data'),
        })
      ).status,
      'ready',
    );
    const klass = await invoke('classesCreate', { name: 'علوم التجربة' });
    const lesson = await invoke('lessonCreate', { classId: klass.id, title: 'التبخر والتكاثف' });
    const blocks = [
      {
        type: 'paragraph',
        text: 'تسخن الشمس الماء فيتبخر. عندما يبرد البخار يتكاثف ويتحول إلى قطرات ماء.',
      },
    ];
    await invoke('lessonUpdate', { id: lesson.id, blocks });
    assert.equal(
      (
        await invoke('aiSaveKey', {
          provider: 'ollama',
          key: '',
          baseURL: `http://127.0.0.1:${server.address().port}/v1`,
        })
      ).status,
      'connected',
    );
    await invoke('aiSetModel', { provider: 'ollama', model: 'education-fixture' });
    const preparation = await invoke('aiRun', {
      requestId: 'education-context',
      action: 'lesson_plan',
      content: blocks[0].text,
      context: { stage: 'secondary', support: 'scaffolded', durationMinutes: 30 },
    });
    assert.equal(preparation.status, 'ok');
    assert.match(JSON.stringify(calls.at(-1)), /الثانوية/);
    assert.match(JSON.stringify(calls.at(-1)), /30/);
    assert.deepEqual((await invoke('lessonGet', { id: lesson.id })).blocks, blocks);

    window.reload();
    await teacher.click('الفصول');
    await teacher.click('فتح الفصل');
    await teacher.click('الدروس والمحتوى');
    await teacher.click('متابعة التحرير');
    await until(() => teacher.evaluate('Boolean(document.querySelector("#lesson-agent-request"))'));
    await teacher.capture('teacher-agent.png');
    await teacher.click('جهّز الدرس كاملاً');
    await until(() => teacher.evaluate('document.body.innerText.includes("الدرس جاهز ومحفوظ")'));
    const edited = await invoke('lessonGet', { id: lesson.id });
    assert.equal(edited.id, lesson.id);
    assert.equal(edited.status, 'draft');
    assert.ok(edited.generatedActivityId);
    assert.ok(edited.agentUndoToken);
    assert.ok(edited.blocks.some((block) => block.section === 'outcomes'));
    assert.ok(edited.blocks.some((block) => block.section === 'summary'));
    for (const kind of ['concept', 'example', 'practice', 'check', 'takeaway']) {
      assert.ok(
        await teacher.evaluate(`Boolean(document.querySelector('[data-learning-card="${kind}"]'))`),
      );
    }
    await pause(1300);
    assert.deepEqual(
      (await invoke('lessonGet', { id: lesson.id })).blocks,
      edited.blocks,
      'old autosave cannot overwrite the generated page',
    );
    await teacher.evaluate(
      `document.querySelector('[data-lesson-section="outcomes"]').scrollIntoView({ block: 'start' })`,
    );
    await teacher.capture('teacher-page.png');
    await teacher.click('خطة المعلم');
    await until(() => teacher.evaluate('document.body.innerText.includes("توجيه خاص بالمعلم")'));
    await teacher.evaluate(
      `document.querySelector('section[aria-label="خطة المعلم"]').scrollIntoView({ block: 'start' })`,
    );
    await teacher.capture('teacher-preparation.png');
    await teacher.click('علوم التجربة · الدروس');
    await teacher.click('متابعة التحرير');
    await teacher.click('تراجع عن التجهيز');
    await until(() => teacher.evaluate('document.body.innerText.includes("استُعيد الدرس السابق")'));
    assert.deepEqual((await invoke('lessonGet', { id: lesson.id })).blocks, blocks);
    assert.equal((await invoke('lessonGet', { id: lesson.id })).generatedActivityId, null);
    await teacher.click('جهّز الدرس كاملاً');
    await until(() => teacher.evaluate('document.body.innerText.includes("الدرس جاهز ومحفوظ")'));
    await teacher.click('تحرير يدوي');
    await until(() =>
      teacher.evaluate(
        `Boolean(document.querySelector('input[aria-label="عنوان الفكرة الأساسية"]'))`,
      ),
    );
    await teacher.evaluate(
      `(() => {const input = document.querySelector('input[aria-label="عنوان الفكرة الأساسية"]'); input.focus(); input.select(); })()`,
    );
    await window.webContents.insertText('الفكرة الأساسية بعد التعديل');
    await teacher.evaluate(
      `document.querySelector('[data-learning-card="concept"]').scrollIntoView({ block: 'start' })`,
    );
    await teacher.capture('teacher-editor.png');
    await teacher.click('نشر للطلاب');
    await until(async () => (await invoke('lessonGet', { id: lesson.id })).status === 'published');
    const published = await invoke('lessonGet', { id: lesson.id });
    assert.match(JSON.stringify(published.blocks), /الفكرة الأساسية بعد التعديل/);
    assert.equal(
      (await invoke('activityGet', { id: published.generatedActivityId })).status,
      'published',
    );
    await teacher.click('صفحة الطالب');
    await teacher.capture('teacher-published.png');

    // Malformed model output, cancellation and concurrent manual edits never partially apply.
    const sandboxLesson = await invoke('lessonCreate', {
      classId: klass.id,
      title: 'درس اختبارات الوكيل',
    });
    const agentInput = {
      id: sandboxLesson.id,
      context: { stage: 'primary', support: 'balanced', durationMinutes: 45 },
    };
    const invalidBefore = calls.length;
    const invalid = await invoke('lessonAgentRun', {
      ...agentInput,
      requestId: 'agent-invalid',
      instructions: 'نتيجة غير صالحة',
    });
    assert.equal(invalid.status, 'failed');
    assert.equal(calls.length - invalidBefore, 2, 'one bounded repair attempt');
    assert.deepEqual((await invoke('lessonGet', { id: sandboxLesson.id })).blocks, []);
    const cancelled = invoke('lessonAgentRun', {
      ...agentInput,
      requestId: 'agent-cancel',
      instructions: 'انتظار الاختبار',
    });
    await until(() => pending.length > 0);
    await invoke('aiCancel', { requestId: 'agent-cancel' });
    assert.equal((await cancelled).status, 'cancelled');
    pending.shift()();
    assert.equal((await invoke('lessonGet', { id: sandboxLesson.id })).generatedActivityId, null);
    const conflict = invoke('lessonAgentRun', {
      ...agentInput,
      requestId: 'agent-conflict',
      instructions: 'انتظار الاختبار',
    });
    await until(() => pending.length > 0);
    await invoke('lessonUpdate', { id: sandboxLesson.id, title: 'تعديل المعلم أثناء التجهيز' });
    pending.shift()();
    assert.equal((await conflict).status, 'failed');
    assert.equal(
      (await invoke('lessonGet', { id: sandboxLesson.id })).title,
      'تعديل المعلم أثناء التجهيز',
    );
    assert.equal((await invoke('lessonGet', { id: sandboxLesson.id })).generatedActivityId, null);
    await invoke('writeSetting', { key: 'studentAiMasterEnabled', value: 'true' });
    await invoke('classesStudentAi', { id: klass.id, enabled: true });
    // Reserve an unused port without fixed-port collisions on any supported OS.
    const probe = createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise((done) => probe.close(done));
    await invoke('studentPortSet', { port });
    await invoke('portalStart', { classId: klass.id });
    await until(async () => (await invoke('portalStatus')).state !== 'starting');
    const portal = await invoke('portalStatus');
    assert.equal(portal.state, 'running', JSON.stringify(portal));
    const origin = `http://127.0.0.1:${portal.port}`;
    const post = (path, body, cookie) =>
      fetch(`${origin}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) },
        body: JSON.stringify(body),
      });
    async function admit(name) {
      const joined = await (await post('/api/join', { name, joinCode: portal.joinCode })).json();
      await invoke('requestDecide', { id: joined.data.requestId, decision: 'approve' });
      const approved = await fetch(`${origin}/api/join/status?request=${joined.data.requestId}`);
      assert.equal((await approved.json()).data.status, 'approved');
      return approved.headers.get('set-cookie').split(';')[0];
    }
    const cookie = await admit('طالب تجربة المساعدة');
    const question = 'لماذا يتكاثف بخار الماء؟';
    const legacy = await post('/api/student/ai', { lessonId: lesson.id, question }, cookie);
    assert.equal(legacy.status, 200, await legacy.clone().text());
    assert.equal((await legacy.json()).data.groundedIn, 'المصدر المستخدم: التبخر والتكاثف');
    assert.match(JSON.stringify(calls.at(-1)), /تلميحاً واحداً/);
    assert.ok(!JSON.stringify(calls.at(-1)).includes('طالب تجربة المساعدة'));
    assert.ok(!JSON.stringify(calls.at(-1)).includes(klass.id));

    studentWindow = new BrowserWindow({
      show: false,
      width: 1040,
      height: 980,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        partition: 'education-student',
        backgroundThrottling: false,
      },
    });
    studentWindow.webContents.on('console-message', (_event, level, message) => {
      if (level >= 3) errors.push(message);
    });
    await studentWindow.webContents.session.cookies.set({
      url: origin,
      name: 'cubecroom_student',
      value: cookie.split('=')[1],
      httpOnly: true,
      sameSite: 'lax',
    });
    await studentWindow.loadURL(`${origin}/lessons/${lesson.id}`);
    const student = ui(studentWindow);
    assert.equal(
      await student.evaluate('document.querySelectorAll("[data-learning-card]").length'),
      5,
    );
    assert.ok(
      await student.evaluate('document.body.innerText.includes("الفكرة الأساسية بعد التعديل")'),
    );
    assert.doesNotMatch(
      await student.evaluate('document.documentElement.outerHTML'),
      /توجيه خاص بالمعلم|مفتاح خاص للتجربة/,
    );
    await student.evaluate('window.scrollTo(0, 0)');
    await student.capture('student-page.png');
    await until(() => student.evaluate('Boolean(document.querySelector("textarea"))'));
    await student.evaluate('document.querySelector("textarea").focus()');
    await studentWindow.webContents.insertText(question);
    await student.click('ساعدني على الفهم');
    await until(() => student.evaluate('document.body.innerText.includes("المصدر المستخدم:")'));
    await student.click('أعطني مثالاً مشابهاً');
    await until(() => student.evaluate('!document.querySelector("textarea").disabled'));
    const followup = JSON.stringify(calls.at(-1));
    assert.match(followup, /مثالاً صغيراً مماثلاً/);
    assert.ok(followup.includes(question));
    assert.ok(followup.includes(answer));
    await student.capture('student-tutor.png');

    const beforeInvalid = calls.length;
    assert.equal(
      (await post('/api/student/ai', { lessonId: lesson.id, question: 'س'.repeat(70_000) }, cookie))
        .status,
      400,
    );
    assert.equal(
      (await post('/api/student/ai', { lessonId: lesson.id, question, mode: 'solve' }, cookie))
        .status,
      400,
    );
    const activity = await invoke('activityCreate', {
      classId: klass.id,
      title: 'نشاط التحقق',
      lessonId: lesson.id,
    });
    await invoke('activityUpdate', {
      id: activity.id,
      questions: [
        {
          type: 'text',
          id: 'question-qa',
          prompt: question,
          points: 1,
          expectedAnswer: 'مفتاح إجابة خاص بالمعلم',
        },
      ],
    });
    await invoke('activityPublish', { id: activity.id, published: true });
    assert.equal(
      (
        await post(
          '/api/student/ai',
          { lessonId: lesson.id, activityId: activity.id, question },
          cookie,
        )
      ).status,
      403,
    );
    await invoke('activityStudentAi', { id: activity.id, enabled: true });
    const other = await invoke('lessonCreate', { classId: klass.id, title: 'درس آخر' });
    await invoke('lessonUpdate', { id: other.id, blocks });
    await invoke('lessonPublish', { id: other.id, published: true });
    assert.equal(
      (
        await post(
          '/api/student/ai',
          { lessonId: other.id, activityId: activity.id, question },
          cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      calls.length,
      beforeInvalid,
      'invalid and unauthorized requests never call the model',
    );
    assert.equal(
      (
        await post(
          '/api/student/ai',
          { lessonId: lesson.id, activityId: activity.id, question },
          cookie,
        )
      ).status,
      200,
    );
    assert.ok(!JSON.stringify(calls.at(-1)).includes('مفتاح إجابة خاص بالمعلم'));

    const slow = post(
      '/api/student/ai',
      { lessonId: lesson.id, question: 'انتظار الاختبار الأول' },
      cookie,
    );
    await until(() => pending.length > 0);
    assert.equal(
      (await post('/api/student/ai', { lessonId: lesson.id, question }, cookie)).status,
      429,
    );
    await invoke('classesStudentAi', { id: klass.id, enabled: false });
    pending.shift()();
    assert.equal((await slow).status, 403, 'disabling AI during generation blocks delivery');
    await invoke('classesStudentAi', { id: klass.id, enabled: true });
    const kickedCookie = await admit('طالب تجربة الإخراج');
    const revoked = post(
      '/api/student/ai',
      { lessonId: lesson.id, question: 'انتظار الاختبار الثاني' },
      kickedCookie,
    );
    await until(() => pending.length > 0);
    const roster = await invoke('rosterList', { classId: klass.id });
    const kicked = roster.students.find((row) => row.name === 'طالب تجربة الإخراج');
    await invoke('rosterAction', { id: kicked.id, action: 'kick' });
    pending.shift()();
    assert.equal((await revoked).status, 410, 'revoked student cannot receive a delayed answer');
    assert.deepEqual(errors, []);
    writeFileSync(join(report, 'captures.json'), JSON.stringify(captures, null, 2));
    writeFileSync(
      join(report, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          model: 'deterministic local fixture; no real model quality evaluated',
          checks: [
            'automatic complete page, private preparation and real linked activity',
            'semantic cards round trip through editor and student reader',
            'undo after reopening and no stale autosave',
            'bounded repair, cancellation and optimistic conflict with no partial writes',
            'student follow-up continuity',
            'bounded validation',
            'activity gates and lesson binding',
            'no identities or answer keys sent',
            'concurrency',
            'mid-request permission and revocation',
          ],
          errors,
        },
        null,
        2,
      ),
    );
    console.log('AI education: Electron, teacher UI, student UI and HTTP checks passed.');
    await invoke('portalStop');
    app.exit(0);
  } catch (error) {
    console.error(error);
    writeFileSync(
      join(report, 'result.json'),
      JSON.stringify({ passed: false, error: String(error), errors }, null, 2),
    );
    if (invoke) await invoke('portalStop').catch(() => {});
    app.exit(1);
  } finally {
    clearTimeout(deadline);
    studentWindow?.destroy();
    server.closeAllConnections();
    server.close();
  }
}
void run();
