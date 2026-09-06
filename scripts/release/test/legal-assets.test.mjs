import { strict as assert } from 'node:assert';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertLegalAssets, PUBLIC_LEGAL_DIRECTORIES } from '../legal-assets.mjs';
import { RELEASE_CONFIG } from '../config.mjs';

const commit = 'a'.repeat(40);
const otherCommit = 'b'.repeat(40);

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-legal-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const resources = join(directory, 'resources');
  const projectRoot = join(directory, 'source');
  const pkg = { version: '0.1.0', license: 'AGPL-3.0-only', author: { name: 'Example Company' } };
  const license = 'Original project license text\r\n';
  const repository = `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}`;
  const info = {
    version: pkg.version, license: pkg.license, licenseText: license, noticesAvailable: true,
    copyright: 'Copyright (c) 2026 Example Company and contributors',
    commit, sourceUrl: `${repository}/tree/${commit}`, sourceArchiveUrl: `${repository}/archive/${commit}.zip`,
  };
  await mkdir(projectRoot, { recursive: true });
  await mkdir(join(resources, 'legal', 'dependencies'), { recursive: true });
  await writeFile(join(projectRoot, 'package.json'), JSON.stringify(pkg));
  await writeFile(join(projectRoot, 'LICENSE'), license);
  await writeFile(join(resources, 'legal', 'LICENSE'), license);
  await writeFile(join(resources, 'legal', 'dependencies', 'THIRD-PARTY-NOTICES.txt'), 'Original third-party notices');
  for (const path of PUBLIC_LEGAL_DIRECTORIES) {
    await mkdir(join(resources, path), { recursive: true });
    await writeFile(join(resources, path, 'info.json'), JSON.stringify(info));
    await writeFile(join(resources, path, 'notices.txt'), 'Original third-party notices');
  }
  return { projectRoot, resources, info, options: { projectRoot, releaseCommit: commit } };
}

test('legal resources match exact source license and release commit', async (t) => {
  const { resources, options } = await fixture(t);
  await assertLegalAssets(resources, options);
});

test('same-version resources from another commit cannot pass release validation', async (t) => {
  const { resources, options } = await fixture(t);
  await assert.rejects(assertLegalAssets(resources, { ...options, releaseCommit: otherCommit }), /stale|RELEASE_COMMIT/);
});

test('changed source license text invalidates a previous package without requiring a version bump', async (t) => {
  const { projectRoot, resources, options } = await fixture(t);
  await writeFile(join(projectRoot, 'LICENSE'), 'New license text\n');
  await assert.rejects(assertLegalAssets(resources, options), /LICENSE differs/);
});

test('student and teacher legal information both require the original text and official source URLs', async (t) => {
  const { resources, options, info } = await fixture(t);
  for (const directory of PUBLIC_LEGAL_DIRECTORIES) {
    const path = join(resources, directory, 'info.json');
    await writeFile(path, JSON.stringify({ ...info, licenseText: 'Stale text' }));
    await assert.rejects(assertLegalAssets(resources, options), /differs from current source/);
    await writeFile(path, JSON.stringify({ ...info, sourceArchiveUrl: `https://example.com/${commit}.zip` }));
    await assert.rejects(assertLegalAssets(resources, options), /source links/);
    await writeFile(path, JSON.stringify(info));
  }
  const metadata = JSON.parse(await readFile(join(options.projectRoot, 'package.json'), 'utf8'));
  await writeFile(join(options.projectRoot, 'package.json'), JSON.stringify({ ...metadata, license: 'MIT' }));
  await assert.rejects(assertLegalAssets(resources, options), /differs from current source/);
});
