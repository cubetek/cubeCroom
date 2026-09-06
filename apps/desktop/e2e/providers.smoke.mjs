import electron from 'electron';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';

const { app, safeStorage } = electron;
const scratch = process.env.CUBECROOM_QA_ROOT;
const report = process.env.CUBECROOM_QA_REPORT;
if (!scratch || !report) throw new Error('Use pnpm test:providers to isolate this test.');
const profile = join(scratch, 'profile');
mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
process.env.CUBECROOM_DATA_DIR = join(scratch, 'data');
const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const requests = [];
const server = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = raw ? JSON.parse(raw) : null;
  requests.push({ path: request.url, authorization: request.headers.authorization, body });
  response.setHeader('content-type', 'application/json');
  if (
    request.url.endsWith('/key') &&
    request.headers.authorization !== 'Bearer qa-openrouter-key'
  ) {
    response.writeHead(401).end(JSON.stringify({ error: { message: 'test rejection' } }));
  } else if (request.url.endsWith('/key')) {
    response.end(JSON.stringify({ data: { label: 'QA' } }));
  } else if (request.url.endsWith('/models')) {
    response.end(JSON.stringify({ data: [{ id: 'test/model:8b' }, { id: 'test/other:free' }] }));
  } else if (request.url.endsWith('/chat/completions')) {
    response.end(
      JSON.stringify({
        id: 'qa',
        object: 'chat.completion',
        created: 1,
        model: body.model,
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'إجابة اختبار محلي' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 },
      }),
    );
  } else {
    response.writeHead(404).end('{}');
  }
});
server.listen(0, '127.0.0.1');
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const value = String(url);
  return nativeFetch(
    value.startsWith('https://openrouter.ai/api/v1/')
      ? value.replace(
          'https://openrouter.ai/api/v1',
          `http://127.0.0.1:${server.address().port}/openrouter`,
        )
      : url,
    init,
  );
};
const windowReady = new Promise((resolveWindow) => {
  app.once('browser-window-created', (_event, window) => {
    window.show = () => {}; // This test window stays hidden; capturePage still verifies its rendering.
    window.webContents.once('did-finish-load', () => resolveWindow(window));
  });
});
createRequire(import.meta.url)(join(desktop, 'dist-app', 'main.cjs'));
const deadline = setTimeout(() => {
  console.error('Provider smoke check timed out.');
  app.exit(1);
}, 90_000);

async function run() {
  try {
    if (!server.listening) await once(server, 'listening');
    const window = await windowReady;
    const evaluate = (code) => window.webContents.executeJavaScript(code);
    const invoke = (method, input) =>
      evaluate(`window.cubecroom[${JSON.stringify(method)}](${JSON.stringify(input) ?? ''})`);
    const waitFor = async (code) => {
      const end = Date.now() + 15_000;
      while (!(await evaluate(code))) {
        if (Date.now() > end) throw new Error(`UI did not become ready: ${code}`);
        await new Promise((resolveWait) => setTimeout(resolveWait, 100));
      }
    };
    const endpoint = `http://127.0.0.1:${server.address().port}/v1`;
    assert.equal(
      (
        await invoke('completeOnboarding', {
          name: 'معلم الاختبار',
          dataDirectory: join(scratch, 'data'),
        })
      ).status,
      'ready',
    );
    const initial = await invoke('aiSettings');
    assert.equal(initial.providers.length, 6);
    assert.equal(initial.activeProvider, null);

    const originalEncryptionAvailable = safeStorage.isEncryptionAvailable;
    safeStorage.isEncryptionAvailable = () => false;
    const connected = await invoke('aiSaveKey', { provider: 'ollama', key: '', baseURL: endpoint });
    assert.equal(connected.status, 'connected', JSON.stringify(connected));
    assert.equal(
      connected.settings.providers.find((provider) => provider.provider === 'ollama').hasKey,
      false,
    );
    assert.equal(requests.at(-1).authorization, undefined);
    assert.equal(
      (await invoke('aiSaveKey', { provider: 'lmstudio', key: 'qa-token', baseURL: endpoint }))
        .status,
      'unavailable',
    );
    safeStorage.isEncryptionAvailable = originalEncryptionAvailable;

    assert.equal(
      (await invoke('aiSetModel', { provider: 'ollama', model: 'test/model:8b' })).activeProvider,
      'ollama',
    );
    const generated = await invoke('aiRun', {
      requestId: 'provider-qa',
      action: 'simplify',
      content: 'نص للاختبار',
    });
    assert.equal(generated.status, 'ok', JSON.stringify(generated));
    assert.equal(generated.provider, 'ollama');
    assert.equal(generated.text, 'إجابة اختبار محلي');
    assert.equal(requests.at(-1).path, '/v1/chat/completions');

    assert.equal(
      (await invoke('aiSaveKey', { provider: 'lmstudio', key: '', baseURL: endpoint })).status,
      'connected',
    );
    await invoke('aiSetModel', { provider: 'lmstudio', model: 'test/other:free' });
    assert.equal((await invoke('aiActiveModel')).provider, 'lmstudio');
    await invoke('studentPortSet', { port: 12398 });
    let config = JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8'));
    assert.equal(config.aiEndpoints.ollama, endpoint);
    assert.equal(config.aiEndpoints.lmstudio, endpoint);
    assert.equal(config.studentPort, 12398);

    if (initial.encryptionAvailable) {
      assert.equal(
        (await invoke('aiSaveKey', { provider: 'openrouter', key: 'qa-openrouter-key' })).status,
        'connected',
      );
      await invoke('aiSetModel', { provider: 'openrouter', model: 'test/other:free' });
      const failedReplacement = await invoke('aiSaveKey', {
        provider: 'openrouter',
        key: 'qa-invalid-key',
      });
      assert.equal(failedReplacement.status, 'rejected');
      assert.equal(
        (await invoke('aiSettings')).providers.find(
          (provider) => provider.provider === 'openrouter',
        ).status,
        'connected',
      );
      assert.equal(
        (
          await invoke('aiRun', {
            requestId: 'router-qa',
            action: 'simplify',
            content: 'نص تجريبي',
          })
        ).status,
        'ok',
      );
      assert.equal(requests.at(-1).authorization, 'Bearer qa-openrouter-key');
      const vault = readFileSync(join(profile, 'secrets.json'), 'utf8');
      assert.equal(vault.includes('qa-openrouter-key'), false);
    }

    await invoke('aiSetModel', { provider: 'ollama', model: 'test/model:8b' });
    await invoke('aiDeleteKey', { provider: 'ollama' });
    assert.equal(
      await invoke('aiActiveModel'),
      null,
      'disconnecting a chosen local provider must not fall back to cloud',
    );
    await assert.rejects(invoke('aiSetModel', { provider: 'ollama', model: 'test/model:8b' }));
    await invoke('aiSetModel', { provider: 'lmstudio', model: 'test/other:free' });
    await invoke('bootState'); // Closes and reopens SQLite, verifying saved state.
    assert.equal((await invoke('aiActiveModel')).provider, 'lmstudio');
    assert.equal(
      (await invoke('aiSettings')).providers.find((provider) => provider.provider === 'lmstudio')
        .baseURL,
      endpoint,
    );
    config = JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8'));
    assert.equal(JSON.stringify(config).includes('qa-openrouter-key'), false);

    const loaded = once(window.webContents, 'did-finish-load');
    window.reload();
    await loaded;
    await waitFor(
      `!![...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'الذكاء الاصطناعي')`,
    );
    await evaluate(
      `[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'الذكاء الاصطناعي').click()`,
    );
    await waitFor(
      `document.body.innerText.includes('LM Studio') && document.body.innerText.includes('OpenRouter') && document.body.innerText.includes('Ollama')`,
    );
    assert.equal(
      await evaluate(`document.querySelectorAll('[data-slot="card-title"]').length >= 6`),
      true,
    );
    writeFileSync(join(report, 'provider-settings.png'), (await window.capturePage()).toPNG());
    await waitFor(`document.body.innerText.includes('الذكاء الاصطناعي متصل')`);
    await evaluate(
      `[...document.querySelectorAll('[data-slot="card"]')].find(card => card.querySelector('[data-slot="card-title"]')?.textContent === 'LM Studio').querySelector('button').click()`,
    );
    await waitFor(`!!document.querySelector('#provider-url')`);
    assert.equal(await evaluate(`document.querySelector('#provider-url').value`), endpoint);
    assert.equal(await evaluate(`document.querySelector('#provider-key').value`), '');
    writeFileSync(join(report, 'local-provider-dialog.png'), (await window.capturePage()).toPNG());
    await evaluate(
      `[...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === 'اختبار الاتصال').click()`,
    );
    await waitFor(`!!document.querySelector('#provider-model')`);
    assert.equal(
      await evaluate(`document.querySelector('#provider-model').value`),
      'test/other:free',
    );
    writeFileSync(join(report, 'provider-model-picker.png'), (await window.capturePage()).toPNG());
    await evaluate(
      `[...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.trim() === 'حفظ واستخدام').click()`,
    );
    await waitFor(`!document.querySelector('[role="dialog"]')`);
    assert.equal((await invoke('aiActiveModel')).model, 'test/other:free');
    window.setSize(1024, 768);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    assert.equal(
      await evaluate(
        `document.documentElement.scrollWidth <= document.documentElement.clientWidth`,
      ),
      true,
    );
    writeFileSync(join(report, 'provider-settings-1024.png'), (await window.capturePage()).toPNG());
    console.log(
      'PASS: real Electron IPC, isolated storage, local generation, OpenRouter authentication, active selection, persistence and settings UI.',
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    globalThis.fetch = nativeFetch;
    server.closeAllConnections();
    server.close();
    app.once('will-quit', () => app.exit(process.exitCode ?? 0));
    app.quit();
  }
}
void run();
