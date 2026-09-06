import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { RELEASE_CONFIG } from '../config.mjs';

async function browserModule(path) {
  const result = await build({ entryPoints: [fileURLToPath(new URL(path, import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'browser' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { parsePublishedRelease, parseReleaseCatalog, safeReleaseNoteUrl } = await browserModule('../../../apps/docs/lib/releases/data.ts');
const { createReleaseStore } = await browserModule('../../../apps/docs/lib/releases/client.ts');
const repositoryUrl = `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}`;
const source = { repositoryUrl, apiUrl: repositoryUrl.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases', targets: [{ id: 'win-x64', platform: 'win32', arch: 'x64', label: 'Windows', architecture: 'x64', filePattern: 'CubeCroom-${version}-win-x64.exe' }] };
const valid = (version = '1.2.3', preview = false, publishedAt = '2026-09-06T00:00:00Z') => ({
  tag_name: `v${version}`, name: `CubeCroom ${version}`, body: '## Changes\n\n- A published improvement', draft: false, prerelease: preview,
  published_at: publishedAt, html_url: `${repositoryUrl}/releases/tag/v${version}`,
  assets: [{ name: `CubeCroom-${version}-win-x64.exe`, state: 'uploaded', size: 1500, browser_download_url: `${repositoryUrl}/releases/download/v${version}/CubeCroom-${version}-win-x64.exe` }],
});
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('version, date, release notes, and installers come from the published release', () => {
  const release = parsePublishedRelease(valid(), source);
  assert.equal(release.version, '1.2.3');
  assert.equal(release.publishedAt, valid().published_at);
  assert.equal(release.body, valid().body);
  assert.equal(release.files[0].url, valid().assets[0].browser_download_url);
});

test('published previews with ordinary or prerelease tags are available without implying OS signing or OTA', () => {
  for (const version of ['1.2.3', '1.2.4-beta.1']) {
    const release = parsePublishedRelease(valid(version, true), source);
    assert.equal(release.preview, true);
    assert.equal(release.version, version);
    assert.equal(release.ota, undefined);
    assert.equal(release.osSigning, undefined);
  }
});

test('stable remains the current download even when newer previews fill the visible history', () => {
  const stable = valid();
  const preview = valid('2.0.0-beta.1', true, '2026-09-07T00:00:00Z');
  const catalog = parseReleaseCatalog([preview], stable, source);
  assert.equal(catalog.current.version, '1.2.3');
  assert.equal(catalog.history[0].version, '2.0.0-beta.1');
  assert.equal(catalog.history.length, 2);
  assert.equal(parseReleaseCatalog([preview], null, source).current.preview, true);
  assert.equal(parseReleaseCatalog([], null, source).current, null);
  assert.equal(parseReleaseCatalog([{ ...valid(), draft: true }], null, source).history.length, 0);
});

test('downloads reject drafts, malformed versions, duplicate assets, and hostile or incomplete asset URLs', () => {
  for (const patch of [{ draft: true }, { tag_name: 'v1.2.3\n' }, { published_at: 'invalid' }, { html_url: 'https://attacker.invalid/' }]) assert.throws(() => parsePublishedRelease({ ...valid(), ...patch }, source));
  assert.throws(() => parsePublishedRelease({ ...valid(), assets: [valid().assets[0], valid().assets[0]] }, source));
  for (const patch of [{ browser_download_url: 'https://attacker.invalid/app.exe' }, { browser_download_url: valid().assets[0].browser_download_url + '?redirect=1' }, { size: -1 }, { size: 0 }, { state: 'open' }]) assert.throws(() => parsePublishedRelease({ ...valid(), assets: [{ ...valid().assets[0], ...patch }] }, source));
  assert.throws(() => parsePublishedRelease(valid(), { ...source, apiUrl: 'https://attacker.invalid/releases' }));
});

test('missing platform files remain explicit and verification links only use exact official assets', () => {
  const missing = parsePublishedRelease({ ...valid(), assets: [] }, source);
  assert.equal(missing.files.length, 0);
  assert.equal(missing.missingTargets[0].id, 'win-x64');
  const names = ['SHA512SUMS', 'release-metadata.json', 'attestation.json'];
  const release = valid();
  release.assets.push(...names.map(name => ({ name, state: 'uploaded', size: 42, browser_download_url: `${repositoryUrl}/releases/download/v1.2.3/${name}` })));
  assert.deepEqual(parsePublishedRelease(release, source).verification.map(file => file.name), names);
  release.assets[1].browser_download_url = 'https://attacker.invalid/SHA512SUMS';
  assert.throws(() => parsePublishedRelease(release, source));
});

test('release notes reject executable URL protocols and credential-bearing links', () => {
  for (const url of ['javascript:alert(1)', 'java\nscript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc/passwd', 'https://user:secret@example.com']) assert.equal(safeReleaseNoteUrl(url, repositoryUrl), undefined);
  assert.equal(safeReleaseNoteUrl('https://example.com/guide', repositoryUrl), 'https://example.com/guide');
  assert.equal(safeReleaseNoteUrl('/cubetek/cubeCroom/releases', repositoryUrl), `${repositoryUrl}/releases`);
});

test('concurrent consumers share requests, then cached data, and explicit retry refreshes an empty catalog', async () => {
  let calls = 0;
  let published = false;
  const store = createReleaseStore(source, { fetch: async url => {
    calls++;
    await new Promise(resolve => setTimeout(resolve, 2));
    return url.endsWith('/latest') ? response({}, 404) : response(published ? [valid('1.2.3', true)] : []);
  } });
  const first = store.refresh();
  assert.equal(store.refresh(), first);
  await first;
  assert.equal(calls, 2);
  assert.equal(store.getSnapshot().catalog.current, null);
  await store.refresh();
  assert.equal(calls, 2);
  published = true;
  await store.refresh(true);
  assert.equal(calls, 4);
  assert.equal(store.getSnapshot().catalog.current.version, '1.2.3');
});

test('a failed refresh retains validated cached downloads with an explicit stale state', async () => {
  let unavailable = false;
  const store = createReleaseStore(source, { fetch: async url => unavailable ? response({}, 429) : url.endsWith('/latest') ? response(valid()) : response([valid()]) });
  await store.refresh();
  unavailable = true;
  await store.refresh(true);
  assert.equal(store.getSnapshot().status, 'ready');
  assert.equal(store.getSnapshot().stale, true);
  assert.equal(store.getSnapshot().catalog.current.version, '1.2.3');
  const limited = createReleaseStore(source, { fetch: async () => response({}, 403) });
  await limited.refresh();
  assert.deepEqual(limited.getSnapshot(), { status: 'error', failure: 'rate-limit' });
});

test('fresh session cache is validated and expired or forged cache does not supply links', async () => {
  let stored;
  let now = 1_000_000;
  const storage = { getItem: () => stored ?? null, setItem: (_, value) => { stored = value; } };
  let calls = 0;
  const options = { storage, now: () => now, fetch: async url => { calls++; return url.endsWith('/latest') ? response(valid()) : response([valid()]); } };
  await createReleaseStore(source, options).refresh();
  const cached = createReleaseStore(source, options);
  await cached.refresh();
  assert.equal(calls, 2);
  now += 5 * 60_000 + 1;
  await createReleaseStore(source, options).refresh();
  assert.equal(calls, 4);
  const forged = JSON.parse(stored);
  forged.stable.assets[0].browser_download_url = 'https://attacker.invalid/app.exe';
  stored = JSON.stringify(forged);
  assert.equal(createReleaseStore(source, options).getSnapshot().status, 'loading');
});

test('a bounded timeout aborts both lookups and allows a later attempt', async () => {
  let aborted = 0;
  const store = createReleaseStore(source, { timeoutMs: 5, fetch: (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { aborted++; reject(new Error('aborted')); }, { once: true });
  }) });
  await store.refresh();
  assert.equal(aborted, 2);
  assert.equal(store.getSnapshot().status, 'error');
  await store.refresh(true);
  assert.equal(aborted, 4);
});
