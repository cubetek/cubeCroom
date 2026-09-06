import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertNoUnusedImageLibraries, assertNotices, collectPackageNotices } from '../notices.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-notices-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('retains full original license, nested vendored notices and inline copyright without rewriting', async (t) => {
  const directory = await fixture(t);
  await mkdir(join(directory, 'dist', 'compiled', 'vendor'), { recursive: true });
  await mkdir(join(directory, 'LICENSES'), { recursive: true });
  const original = Buffer.from('Copyright 2026 The original authors\r\nOriginal license conditions\r\n');
  const notice = 'A vendor attribution that is absent from its package metadata.\n';
  await writeFile(join(directory, 'LICENSE'), original);
  await writeFile(join(directory, 'dist', 'compiled', 'vendor', 'NOTICE'), notice);
  await writeFile(join(directory, 'LICENSES', 'BSD-3-Clause.txt'), 'A license in a directory of legal texts.');
  await writeFile(join(directory, 'dist', 'compiled', 'vendor', 'index.js'), '/*! Copyright 2026 Vendor; preserve this comment. */\nmodule.exports = 1;');
  const found = await collectPackageNotices(directory, { name: 'example' });
  assert.deepEqual(found.files.find((file) => file.path === 'LICENSE').bytes, original);
  assert.equal(found.files.find((file) => file.path.endsWith('/NOTICE')).bytes.toString(), notice);
  assert.ok(found.files.some((file) => file.path === 'LICENSES/BSD-3-Clause.txt'));
  assert.ok(found.files.some((file) => file.path.startsWith('Inline notices') && file.bytes.includes(Buffer.from('Copyright 2026 Vendor'))));
});

test('keeps README license and supplied metadata when a package lacks LICENSE', async (t) => {
  const directory = await fixture(t);
  const metadata = { name: 'example', version: '1.0.0', license: 'MIT' };
  await writeFile(join(directory, 'package.json'), JSON.stringify(metadata));
  await writeFile(join(directory, 'README.md'), 'Copyright Example Authors\nPermission is hereby granted...\n');
  const found = await collectPackageNotices(directory, metadata);
  assert.equal(found.rootLegal, false);
  assert.ok(found.files.some((file) => file.path === 'README.md'));
  assert.deepEqual(JSON.parse(found.files.find((file) => file.path === 'package.json').bytes), metadata);
});

test('packaging rejects missing or altered generated notice text', async (t) => {
  const directory = await fixture(t);
  const text = 'The complete retained notices';
  const inventory = {
    schemaVersion: 1, noticeFile: 'THIRD-PARTY-NOTICES.txt',
    noticeSha256: createHash('sha256').update(text).digest('hex'),
    components: [{ name: 'example', version: '1.0.0', notices: [{ source: 'LICENSE' }] }],
  };
  await writeFile(join(directory, 'inventory.json'), JSON.stringify(inventory));
  await assert.rejects(assertNotices(directory), /ENOENT/);
  await writeFile(join(directory, inventory.noticeFile), text);
  await assertNotices(directory);
  await writeFile(join(directory, inventory.noticeFile), `${await readFile(join(directory, inventory.noticeFile))}\nchanged`);
  await assert.rejects(assertNotices(directory), /missing or changed/);
});

test('packaging rejects an unused Sharp binary even in a nested module location', async (t) => {
  const directory = await fixture(t);
  await mkdir(join(directory, 'standalone'), { recursive: true });
  await assertNoUnusedImageLibraries(directory);
  await mkdir(join(directory, 'standalone', 'node_modules', 'next', 'node_modules', '@img', 'sharp-linux-x64'), { recursive: true });
  await assert.rejects(assertNoUnusedImageLibraries(directory), /Unused Sharp/);
});
