import electron from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const { app } = electron;
const scratch = process.env.CUBECROOM_QA_ROOT;
const report = process.env.CUBECROOM_QA_REPORT;
if (!scratch || !report) throw new Error('Use the isolated learning smoke launcher.');
mkdirSync(join(scratch, 'profile'), { recursive: true });
app.setPath('userData', join(scratch, 'profile'));
process.env.CUBECROOM_DEV_HOT_RELOAD = '1';
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
app.getAppPath = () => desktop;
const calls = [];
const material = {
  schemaVersion: 1,
  title: 'رحلة قطرة ماء',
  method: 'retrieval',
  stage: 'الصف الخامس',
  instructions: 'حاول التذكر، ثم راجع تفسير إجابتك.',
  items: [
    {
      id: 'water',
      kind: 'choice',
      objective: 'يفسر التكاثف',
      prompt: 'ماذا يحدث لبخار الماء عندما يبرد؟',
      options: [
        { id: 'drops', text: 'يتحول إلى قطرات ماء' },
        { id: 'hot', text: 'ترتفع حرارته' },
      ],
      targets: [],
      answer: ['drops'],
      explanation: 'عندما يبرد بخار الماء يتكاثف، فيتحول إلى قطرات ماء سائلة.',
      hint: 'تذكر قطرات الماء خارج الكوب البارد.',
      rubric: [],
      example: '',
      next: null,
      alternate: null,
    },
  ],
};
const server = createServer(async (request, response) => {
  response.setHeader('content-type', 'application/json');
  if (request.url === '/v1/models')
    return response.end(JSON.stringify({ data: [{ id: 'learning-fixture' }] }));
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  calls.push(body);
  const toolResults = body.messages.filter((m) => m.role === 'tool');
  const name =
    toolResults.length === 0 ? 'readLesson' : toolResults.length === 1 ? 'saveExperience' : null;
  response.end(
    JSON.stringify({
      id: 'fixture',
      object: 'chat.completion',
      created: 1,
      model: 'learning-fixture',
      choices: [
        {
          index: 0,
          message: name
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: `call-${toolResults.length}`,
                    type: 'function',
                    function: {
                      name,
                      arguments: JSON.stringify(
                        name === 'readLesson' ? {} : { key: 'water', material },
                      ),
                    },
                  },
                ],
              }
            : { role: 'assistant', content: 'حفظت تجربة رحلة قطرة ماء كمسودة جاهزة للمعلم.' },
          finish_reason: name ? 'tool_calls' : 'stop',
        },
      ],
      usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
    }),
  );
});
server.listen(0, '127.0.0.1');
const ready = new Promise((resolveWindow) =>
  app.on('browser-window-created', (_, win) =>
    win.webContents.once('did-finish-load', () => resolveWindow(win)),
  ),
);
createRequire(import.meta.url)(join(desktop, 'dist-app/main.cjs'));
const pause = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));
const until = async (fn) => {
  const end = Date.now() + 90000;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error('UI check timed out');
    await pause(200);
  }
};
const deadline = setTimeout(() => app.exit(1), 600000);
let invoke;
async function run() {
  try {
    if (!server.listening) await once(server, 'listening');
    const win = await ready;
    const evaluate = (code) => win.webContents.executeJavaScript(code);
    invoke = (method, input) =>
      evaluate(`window.cubecroom[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
    await invoke('completeOnboarding', {
      name: 'معلم الاختبار',
      dataDirectory: join(scratch, 'data'),
    });
    const klass = await invoke('classesCreate', { name: 'العلوم · الصف الخامس' });
    const lesson = await invoke('lessonCreate', { classId: klass.id, title: 'الماء وتحولاته' });
    await invoke('lessonUpdate', {
      id: lesson.id,
      blocks: [
        { type: 'paragraph', text: 'يتكاثف بخار الماء عندما يبرد ويتحول إلى قطرات ماء سائلة.' },
      ],
    });
    await invoke('aiSaveKey', {
      provider: 'ollama',
      key: '',
      baseURL: `http://127.0.0.1:${server.address().port}/v1`,
    });
    await invoke('aiSetModel', { provider: 'ollama', model: 'learning-fixture' });
    const task = await invoke('agentStart', {
      requestId: 'smoke-agent',
      agentId: 'assessment',
      classId: klass.id,
      lessonId: lesson.id,
      prompt: 'جهز تجربة استرجاع قصيرة واحفظها مسودة.',
      method: 'retrieval',
    });
    await until(async () =>
      ['completed', 'failed'].includes(
        (await invoke('agentRuns', { classId: klass.id })).find((r) => r.id === task.id)?.status,
      ),
    );
    const finished = (await invoke('agentRuns', { classId: klass.id }))[0];
    assert.equal(finished.status, 'completed', finished.result);
    assert.equal(calls.length, 3, 'Real SDK must complete a multi-step tool loop');
    console.log('Real SDK completed read, save, and final response.');
    let experiences = await invoke('learningList', { classId: klass.id });
    assert.equal(experiences.length, 1);
    assert.equal(experiences[0].published, false);
    await invoke('learningPublish', { id: experiences[0].id, published: true, expectedVersion: 1 });
    await invoke('agentMemorySave', {
      agentId: 'assessment',
      classId: klass.id,
      content: 'ابدأ بموقف يومي ثم سؤال قصير.',
    });
    win.reload();
    await until(() => evaluate('!!document.querySelector("nav")'));
    const click = async (label) => {
      await until(() =>
        evaluate(
          `Array.from(document.querySelectorAll('button')).some(n => n.textContent.trim() === ${JSON.stringify(label)})`,
        ),
      );
      await evaluate(
        `Array.from(document.querySelectorAll('button')).find(n => n.textContent.trim() === ${JSON.stringify(label)}).click()`,
      );
    };
    await click('تجارب التعلّم');
    await until(() => evaluate('document.body.innerText.includes("رحلة قطرة ماء")'));
    await evaluate(
      `Array.from(document.querySelectorAll('button')).find(n => n.querySelector('h2')?.textContent === 'رحلة قطرة ماء').click()`,
    );
    await until(() => evaluate('document.body.innerText.includes("حفظ التجربة")'));
    writeFileSync(
      join(report, 'teacher-learning.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    // Regression: a new text question must save without invisible empty options,
    // and a new experience must leave the previous experience's preview mode.
    await click('معاينة الطالب');
    await click('تجربة جديدة');
    await until(() => evaluate(`!!Array.from(document.querySelectorAll('label')).find(n => n.textContent.includes('هدف التعلم'))`));
    const fill = async (label, value) => {
      await evaluate(`(() => {
        const n=Array.from(document.querySelectorAll('input,textarea,select')).find(n =>
          n.getAttribute('aria-label')===${JSON.stringify(label)} || n.closest('label')?.textContent.includes(${JSON.stringify(label)}));
        if(!n)throw new Error('Missing field '+${JSON.stringify(label)});
        const proto=n.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:n.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto,'value').set.call(n,${JSON.stringify(value)});
        n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      await pause(50);
    };
    await fill('عنوان التجربة', 'استرجاع من المحرر');
    await fill('هدف التعلم', 'يسمي التكاثف');
    await fill('السؤال أو الموقف', 'ما اسم تحول البخار إلى قطرات عند تبريده؟');
    await fill('مفتاح الإجابة', 'التكاثف');
    await fill('التفسير الذي', 'يتكاثف بخار الماء عندما يبرد.');
    await click('حفظ التجربة');
    await until(async () => (await invoke('learningList', { classId: klass.id })).length === 2);
    let edited = (await invoke('learningList', { classId: klass.id })).find(e => e.material.title === 'استرجاع من المحرر');
    assert.deepEqual(edited.material.items[0].options, []);
    await fill('طريقة الإجابة', 'choice');
    await fill('الخيار 1', 'التكاثف');
    await fill('الخيار 2', 'التبخر');
    await evaluate(`document.querySelector('input[type=radio][name^="key-"]').click()`);
    await pause(50);
    await click('حفظ التجربة');
    await until(async () => (await invoke('learningGet', { id: edited.id })).version === 2);
    assert.equal((await invoke('learningGet', { id: edited.id })).material.items[0].options.length, 2);
    await fill('طريقة الإجابة', 'explain');
    await fill('مفتاح الإجابة', 'يبرد البخار فيتكاثف إلى قطرات.');
    await click('حفظ التجربة');
    await until(async () => (await invoke('learningGet', { id: edited.id })).version === 3);
    assert.deepEqual((await invoke('learningGet', { id: edited.id })).material.items[0].options, []);
    console.log('Editor regression passed: preview reset, text save and question-kind transitions.');
    await click('فريق المساعدين');
    await until(() => evaluate('document.body.innerText.includes("حفظت تجربة")'));
    assert.equal(await evaluate('document.body.innerText.includes("شخصية منسق المعلم")'), false);
    assert.equal(await evaluate('document.body.innerText.includes("تخصيص الفريق (اختياري)")'), true);
    await click('جهّز تجربة للدرس');
    await click('ابدأ المهمة');
    await until(async () => {
      const runs = await invoke('agentRuns', { classId: klass.id });
      return runs.length === 2 && runs.every(r => r.status === 'completed');
    });
    const simple = (await invoke('agentRuns', { classId: klass.id })).find(r => r.input.agentId === 'coordinator');
    assert.equal(simple.input.method, 'auto');
    assert.equal(simple.input.delivery, 'draft');
    assert.equal((await invoke('learningList', { classId: klass.id })).length, 3);
    console.log('Simple teacher flow passed: one preset, automatic coordinator/method, persisted draft.');
    writeFileSync(
      join(report, 'teacher-agents.png'),
      (await win.webContents.capturePage()).toPNG(),
    );
    if (process.env.CUBECROOM_QA_SKIP_PORTAL === '1') {
      clearTimeout(deadline);
      server.close();
      app.quit();
      return;
    }
    await invoke('portalStart', { classId: klass.id });
    await until(async () => (await invoke('portalStatus')).state !== 'starting');
    const portal = await invoke('portalStatus');
    assert.equal(portal.state, 'running', JSON.stringify(portal));
    writeFileSync(
      join(report, 'browser-check.json'),
      JSON.stringify({ portal, experienceId: experiences[0].id, scratch, doneFile: join(scratch, 'browser-done') }, null, 2),
    );
    console.log(
      'Teacher UI and real SDK tool loop passed. Student browser fixture ready:',
      JSON.stringify(portal),
    );
    if (process.env.CUBECROOM_QA_BROWSER === '1') {
      while (!existsSync(join(scratch, 'browser-done'))) await pause(500);
    }
    await invoke('portalStop');
    clearTimeout(deadline);
    server.close();
    app.quit();
  } catch (error) {
    console.error(error);
    if (invoke) await invoke('portalStop').catch(() => undefined);
    clearTimeout(deadline);
    server.close();
    app.exit(1);
  }
}
void run();
