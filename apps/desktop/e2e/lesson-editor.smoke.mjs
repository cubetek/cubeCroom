import electron from 'electron';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { app } = electron;
const scratch = process.env.CUBECROOM_QA_ROOT;
const report = process.env.CUBECROOM_QA_REPORT;
if (!scratch || !report) throw new Error('Use pnpm test:lesson-editor for an isolated profile.');
mkdirSync(join(scratch, 'profile'), { recursive: true });
app.setPath('userData', join(scratch, 'profile'));
process.env.CUBECROOM_DATA_DIR = join(scratch, 'data');
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
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
createRequire(import.meta.url)(join(desktop, 'dist-app', 'main.cjs'));
const deadline = setTimeout(() => {
  console.error('Lesson editor check timed out.');
  app.exit(1);
}, 150_000);

async function run() {
  let window;
  try {
    window = await windowReady;
    const evaluate = async (code) => {
      try {
        return await window.webContents.executeJavaScript(code);
      } catch (error) {
        throw new Error(`Renderer evaluation failed: ${code}`, { cause: error });
      }
    };
    const invoke = (method, input) =>
      evaluate(`window.cubecroom[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
    const capture = async (name) => {
      await evaluate(
        'document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))',
      );
      window.webContents.invalidate();
      await new Promise((done) => setTimeout(done, 300));
      writeFileSync(join(report, name), (await window.webContents.capturePage()).toPNG());
    };
    const waitFor = async (code) => {
      const end = Date.now() + 25_000;
      while (!(await evaluate(code))) {
        if (Date.now() > end)
          throw new Error(
            `UI did not become ready: ${code}\n${await evaluate('document.body.innerText')}`,
          );
        await new Promise((done) => setTimeout(done, 100));
      }
    };
    const click = async (text) => {
      const code = `Array.from(document.querySelectorAll('button,[role="tab"]')).find(n => n.getClientRects().length && (n.innerText.trim() === ${JSON.stringify(text)} || n.getAttribute('aria-label') === ${JSON.stringify(text)}))`;
      await waitFor(`Boolean(${code})`);
      await evaluate(
        `(() => { const node = ${code}; node.scrollIntoView({ block: 'center' }); if (node.getAttribute('role') === 'tab') node.focus(); node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })); node.click(); })()`,
      );
      await new Promise((done) => setTimeout(done, 100));
    };
    const insert = async (section, text) => {
      const selector = `[contenteditable="true"][aria-label="${section}"]`;
      await waitFor(`Boolean(document.querySelector(${JSON.stringify(selector)}))`);
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await window.webContents.insertText(text);
    };
    const boot = await invoke('completeOnboarding', {
      name: 'سارة العتيبي',
      dataDirectory: join(scratch, 'data'),
    });
    assert.equal(boot.status, 'ready', JSON.stringify(boot));
    const classroom = await invoke('classesCreate', { name: 'الصف السادس — علوم' });
    const lesson = await invoke('lessonCreate', {
      classId: classroom.id,
      title: 'دورة الماء في الطبيعة',
    });
    const legacy = [
      { type: 'heading', text: 'كيف تبدأ دورة الماء؟' },
      { type: 'paragraph', text: 'تسخّن الشمس الماء فيتبخّر، ثم يتكاثف ويعود إلى الأرض مطرًا.' },
    ];
    await invoke('lessonUpdate', { id: lesson.id, blocks: legacy });
    window.reload();
    await click('الفصول');
    await click('فتح الفصل');
    await click('الدروس والمحتوى');
    await click('متابعة التحرير');
    await click('تحرير يدوي');
    await waitFor('Boolean(document.querySelector("[contenteditable=true]"))');
    assert.deepEqual(
      (await invoke('lessonGet', { id: lesson.id })).blocks,
      legacy,
      'opening a legacy lesson must not rewrite it',
    );
    assert.equal(
      await evaluate(
        'getComputedStyle(document.querySelector("[data-desktop-titlebar]")).webkitAppRegion',
      ),
      'drag',
    );
    assert.equal(
      await evaluate(
        'document.querySelector("[data-desktop-titlebar]").getBoundingClientRect().height',
      ),
      40,
    );

    await click('مخرجات التعلّم');
    await click('عريض');
    await insert('مخرجات التعلّم', 'يفسّر الطالب مراحل دورة الماء.');
    await click('الخلاصة');
    await insert('الخلاصة', 'دورة الماء مستمرة بفضل طاقة الشمس.');
    await click('محتوى الدرس');
    // Cmd/Ctrl+B in the editor must format text without collapsing the shell.
    await evaluate(
      `document.querySelector('[contenteditable=true][aria-label="محتوى الدرس"]').focus()`,
    );
    const sidebarWidth = await evaluate(
      'document.querySelector("nav").getBoundingClientRect().width',
    );
    window.webContents.sendInputEvent({
      type: 'keyDown',
      keyCode: 'B',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    });
    window.webContents.sendInputEvent({
      type: 'keyUp',
      keyCode: 'B',
      modifiers: [process.platform === 'darwin' ? 'meta' : 'control'],
    });
    assert.equal(
      await evaluate('document.querySelector("nav").getBoundingClientRect().width'),
      sidebarWidth,
    );
    await click('نشر للطلاب');
    await waitFor('document.body.innerText.includes("منشور للطلاب")');
    const saved = await invoke('lessonGet', { id: lesson.id });
    assert.equal(saved.status, 'published');
    const outcomes = saved.blocks.find((block) => block.section === 'outcomes');
    assert.match(JSON.stringify(outcomes), /يفسّر الطالب/);
    assert.match(JSON.stringify(outcomes), /"bold"/);
    assert.match(
      JSON.stringify(saved.blocks.find((block) => block.section === 'summary')),
      /طاقة الشمس/,
    );
    await click('صفحة الطالب');
    await waitFor(`Boolean(document.querySelector('section[aria-label="مخرجات التعلّم"] strong'))`);
    assert.match(await evaluate('document.body.innerText'), /دورة الماء مستمرة/);
    await click('تحرير يدوي');
    await click('مخرجات التعلّم');
    assert.match(
      await evaluate(
        `document.querySelector('[contenteditable=true][aria-label="مخرجات التعلّم"]').innerHTML`,
      ),
      /strong/,
    );
    await click('محتوى الدرس');
    await new Promise((done) => setTimeout(done, 200));
    await evaluate('document.querySelector("main").scrollTop = 0');
    await capture('lesson-editor.png');
    await click('المرفقات');
    await waitFor('document.body.innerText.includes("مرفقات الدرس")');
    await capture('lesson-attachments.png');
    await click('تحرير يدوي');
    await click('الخلاصة');
    await capture('lesson-summary.png');
    window.setSize(1024, 768);
    await new Promise((done) => setTimeout(done, 250));
    assert.equal(
      await evaluate('document.documentElement.scrollWidth <= innerWidth'),
      true,
      'no horizontal page overflow at minimum window size',
    );
    await click('داكن');
    await waitFor('document.documentElement.dataset.theme === "dark"');
    await capture('lesson-editor-dark-1024.png');
    await click('جهّز الدرس كاملاً');
    await waitFor('document.body.innerText.includes("اختر المزوّد والنموذج لبدء تجهيز الدرس")');
    assert.equal(
      await evaluate(
        'document.querySelector("main").scrollWidth <= document.querySelector("main").clientWidth',
      ),
      true,
      'AI panel must fit at minimum width',
    );

    // Closing and reopening the lesson restores the persisted section, not the last editor's state.
    await click('الصف السادس — علوم · الدروس');
    await click('متابعة التحرير');
    await click('تحرير يدوي');
    await click('الخلاصة');
    await waitFor(
      `document.querySelector('[contenteditable=true][aria-label="الخلاصة"]')?.innerText.includes('طاقة الشمس')`,
    );
    assert.deepEqual(errors, []);
    writeFileSync(
      join(report, 'result.json'),
      JSON.stringify(
        {
          passed: true,
          platform: process.platform,
          checks: [
            'legacy compatibility',
            'rich formatting',
            'independent sections',
            'save before publish',
            'shared student preview',
            'reopen',
            'native title bar',
            '1024 layout',
            'dark theme',
            'clean renderer log',
          ],
        },
        null,
        2,
      ),
    );
    console.log('Lesson editor Electron checks passed.');
    clearTimeout(deadline);
    app.quit();
  } catch (error) {
    console.error(error);
    if (window)
      writeFileSync(join(report, 'failure.png'), (await window.webContents.capturePage()).toPNG());
    writeFileSync(join(report, 'errors.json'), JSON.stringify(errors, null, 2));
    app.exit(1);
  }
}
void run();
