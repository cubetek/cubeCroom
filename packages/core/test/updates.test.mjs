import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createUpdateFence, verifyReleaseManifest, verifyReleaseFile, validateReleasePayload } from '../dist/index.js';
import { RELEASE_CONFIG } from '../../../scripts/release/config.mjs';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const trust = { schemaVersion: 1, keys: [{ id: 'test-only', publicKey: publicKey.export({ type: 'spki', format: 'pem' }) }] };
const options = { repository: RELEASE_CONFIG.repository, version: '0.1.1', channel: 'stable' };
const bytes = Buffer.from('signed test installer');
const file = { name: 'CubeCroom-0.1.1-linux-x64.AppImage', size: bytes.length, sha512: createHash('sha512').update(bytes).digest('base64'), platform: 'linux', arch: 'x64', kind: 'updater', url: `https://github.com/${RELEASE_CONFIG.repository.owner}/${RELEASE_CONFIG.repository.repo}/releases/download/v0.1.1/CubeCroom-0.1.1-linux-x64.AppImage` };
const payload = { schemaVersion: 1, version: '0.1.1', channel: 'stable', tag: 'v0.1.1', commit: 'a'.repeat(40), createdAt: '2026-09-06T00:00:00.000Z', files: [file] };
function signed(value = payload) {
  const data = Buffer.from(JSON.stringify(value));
  return { schemaVersion: 1, keyId: 'test-only', algorithm: 'Ed25519', payload: data.toString('base64'), signature: sign(null, data, privateKey).toString('base64') };
}

test('an authorized key binds an exact release, channel, and repository', () => {
  assert.deepEqual(verifyReleaseManifest(signed(), trust, options), payload);
  assert.throws(() => verifyReleaseManifest(signed(), trust, { ...options, version: '0.1.0' }), /version/);
  assert.throws(() => verifyReleaseManifest(signed(), trust, { ...options, channel: 'beta' }), /channel/);
  assert.throws(() => verifyReleaseManifest(signed(), trust, { ...options, repository: { ...RELEASE_CONFIG.repository, owner: 'other' } }), /URL/);
});
test('tampering, missing trust, duplicate key IDs, and invalid signatures fail closed', () => {
  const envelope = signed();
  assert.throws(() => verifyReleaseManifest({ ...envelope, payload: Buffer.from(JSON.stringify({ ...payload, commit: 'b'.repeat(40) })).toString('base64') }, trust, options), /signature/);
  assert.throws(() => verifyReleaseManifest(envelope, { schemaVersion: 1, keys: [] }, options), /Unknown/);
  assert.throws(() => verifyReleaseManifest(envelope, { ...trust, keys: [...trust.keys, ...trust.keys] }, options), /Duplicate/);
});
test('a valid signature cannot authorize ambiguous paths or an unrelated download host', () => {
  assert.throws(() => validateReleasePayload({ ...payload, files: [file, file] }, options), /Duplicate/);
  assert.throws(() => verifyReleaseManifest(signed({ ...payload, files: [{ ...file, url: 'https://example.com/installer' }] }), trust, options), /URL/);
  assert.throws(() => validateReleasePayload({ ...payload, files: [{ ...file, name: '../installer' }] }, options));
  assert.throws(() => validateReleasePayload({ ...payload, files: [{ ...file, arch: 'universal' }] }, options), /universal/);
});
test('installer verification rejects same-size corruption and truncation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'cubecroom-update-file-'));
  const path = join(directory, file.name);
  try {
    await writeFile(path, bytes);
    await verifyReleaseFile(path, file);
    await writeFile(path, Buffer.alloc(bytes.length, 42));
    await assert.rejects(verifyReleaseFile(path, file), /checksum/);
    await writeFile(path, Buffer.from('short'));
    await assert.rejects(verifyReleaseFile(path, file), /size/);
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    await rm(directory, { recursive: true, force: true });
  }
});
test('preparation admits editor flushes, then fences all new work and waits for existing work', async () => {
  const fence = createUpdateFence();
  const finishAi = fence.enter();
  fence.begin();
  assert.throws(() => fence.enter(), /نجهّز/);
  const finishSave = fence.enter(true);
  fence.seal();
  assert.throws(() => fence.enter(true), /نجهّز/);
  let idle = false;
  const wait = fence.waitForIdle(1000).then(() => { idle = true; });
  finishAi(); finishAi();
  await Promise.resolve();
  assert.equal(idle, false);
  finishSave(); await wait;
  assert.equal(fence.active, 0);
  fence.release(); fence.enter()();
});
test('a stalled write times out instead of permitting installation', async () => {
  const fence = createUpdateFence();
  const finish = fence.enter();
  fence.begin(); fence.seal();
  await assert.rejects(fence.waitForIdle(10), /انتظر/);
  assert.equal(fence.active, 1);
  finish(); fence.release();
});
