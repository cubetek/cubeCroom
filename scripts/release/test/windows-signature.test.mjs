import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';

// Exercise the installed, pinned verifier, including our pnpm patch. Never launch a shell.
const require = createRequire(import.meta.url);
const childProcess = require('node:child_process');
const os = require('node:os');
const { verifySignature } = require('electron-updater/out/windowsExecutableCodeSignatureVerifier.js');
const installer = join(os.tmpdir(), 'CubeCroom-signature-test.exe');
const logger = { info() {}, warn() {}, error() {} };

function verifierResponse(t, { data, error = null, stderr = '', probeError = null, windowsVersion = '10.0.26100' }) {
  t.mock.method(os, 'release', () => windowsVersion);
  t.mock.method(childProcess, 'execFile', (...args) => {
    assert.ok(args[1].some(value => value.includes('Get-AuthenticodeSignature')));
    queueMicrotask(() => args.at(-1)(error, JSON.stringify(data), stderr));
  });
  t.mock.method(childProcess, 'execFileSync', () => {
    if (probeError) throw probeError;
    return '"test"';
  });
}

test('blocked PowerShell cannot be treated as a successfully verified installer', async t => {
  verifierResponse(t, { error: new Error('Signature query blocked'), probeError: new Error('PowerShell unavailable') });
  await assert.rejects(verifySignature(['CubeCroom Test'], installer, logger), /PowerShell unavailable/);
});

test('legacy Windows fallback rejects signature failures', async t => {
  verifierResponse(t, { error: new Error('Unsupported signature query'), windowsVersion: '6.1.7601' });
  await assert.rejects(verifySignature(['CubeCroom Test'], installer, logger), /Unsupported signature query/);
});

for (const path of [undefined, null, 42, join(os.tmpdir(), 'different-installer.exe')]) {
  test(`valid status cannot bypass missing or mismatched signed file path: ${JSON.stringify(path)}`, async t => {
    verifierResponse(t, { data: { Status: 0, Path: path, SignerCertificate: { Subject: 'CN=CubeCroom Test' } } });
    await assert.rejects(verifySignature(['CubeCroom Test'], installer, logger));
  });
}

test('matching file and publisher still pass the upstream CN and full DN checks', async t => {
  verifierResponse(t, { data: { Status: 0, Path: installer, SignerCertificate: { Subject: 'CN=CubeCroom Test,O=Testing Organization' } } });
  assert.equal(await verifySignature(['CubeCroom Test'], installer, logger), null);
  assert.equal(await verifySignature(['CN=CubeCroom Test,O=Testing Organization'], installer, logger), null);
  assert.match(await verifySignature(['Another Publisher'], installer, logger), /publisherNames: Another Publisher/);
});

test('invalid signature status still fails even when path and publisher match', async t => {
  verifierResponse(t, { data: { Status: 2, Path: installer, SignerCertificate: { Subject: 'CN=CubeCroom Test' } } });
  assert.match(await verifySignature(['CubeCroom Test'], installer, logger), /publisherNames: CubeCroom Test/);
});

test('verifier stderr rejects the download', async t => {
  verifierResponse(t, { data: null, stderr: 'Signature check failed' });
  await assert.rejects(verifySignature(['CubeCroom Test'], installer, logger), /Signature check failed/);
});

test('malformed verifier output rejects the download even without process errors', async t => {
  verifierResponse(t, { data: null });
  await assert.rejects(verifySignature(['CubeCroom Test'], installer, logger));
});
