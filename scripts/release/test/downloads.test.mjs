import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { RELEASE_CONFIG } from '../config.mjs';

const { code } = await transform(await readFile(new URL('../../../apps/docs/components/landing/downloads-data.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm', platform: 'browser' });
const { parsePublishedDownloads } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const repositoryUrl = `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}`;
const source = { repositoryUrl, apiUrl: 'unused in pure parser test', targets: [{ id: 'win-x64', platform: 'win32', arch: 'x64', label: 'Windows', architecture: 'x64', filePattern: 'CubeCroom-${version}-win-x64.exe' }] };
const valid = () => ({ tag_name: 'v1.2.3', draft: false, prerelease: false, published_at: '2026-09-06T00:00:00Z', html_url: `${repositoryUrl}/releases/tag/v1.2.3`, assets: [{ name: 'CubeCroom-1.2.3-win-x64.exe', state: 'uploaded', size: 1500, browser_download_url: `${repositoryUrl}/releases/download/v1.2.3/CubeCroom-1.2.3-win-x64.exe` }] });

test('download links are derived from the published version, not the docs build version', () => {
  const release = parsePublishedDownloads(valid(), source);
  assert.equal(release.version, '1.2.3');
  assert.equal(release.files[0].url, valid().assets[0].browser_download_url);
});

test('downloads reject drafts, prereleases, missing targets, duplicate assets, and hostile URLs', () => {
  for (const patch of [{ draft: true }, { prerelease: true }, { tag_name: 'v1.2.3\n' }, { published_at: 'invalid' }, { assets: [] }, { html_url: 'https://attacker.invalid/' }]) assert.throws(() => parsePublishedDownloads({ ...valid(), ...patch }, source));
  assert.throws(() => parsePublishedDownloads({ ...valid(), assets: [valid().assets[0], valid().assets[0]] }, source));
  for (const patch of [{ browser_download_url: 'https://attacker.invalid/app.exe' }, { size: -1 }, { size: 0 }, { state: 'open' }]) assert.throws(() => parsePublishedDownloads({ ...valid(), assets: [{ ...valid().assets[0], ...patch }] }, source));
});
