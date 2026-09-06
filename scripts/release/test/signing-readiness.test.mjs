import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, generateKeyPairSync, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { parse } from 'yaml';
import { releaseEnvelopeSchema } from '../../../packages/contracts/dist/index.js';
import { signingReadinessProof } from '../signing-readiness.mjs';
import { trustedSigningKey } from '../signing-key.mjs';

function fixture() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  return {
    publicKey, privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }), keyId: 'test-only',
    trust: { schemaVersion: 1, keys: [{ id: 'test-only', publicKey: publicKey.export({ format: 'pem', type: 'spki' }) }] },
    commit: 'a'.repeat(40), runId: '12345',
  };
}

test('readiness proves possession of the trusted key without producing an OTA release envelope', () => {
  const setup = fixture();
  const first = signingReadinessProof(setup);
  const next = signingReadinessProof(setup);
  assert.equal(first.challenge.purpose, 'cubecroom-ota-signing-readiness');
  assert.equal(first.challenge.sourceCommit, setup.commit);
  assert.equal(first.challenge.runId, setup.runId);
  assert.notEqual(first.challenge.nonce, next.challenge.nonce);
  assert.equal(first.challenge.fingerprint, createHash('sha256').update(setup.publicKey.export({ format: 'der', type: 'spki' })).digest('hex'));
  const bytes = Buffer.from(JSON.stringify(first.challenge));
  assert.equal(verify(null, bytes, setup.publicKey, Buffer.from(first.signature, 'base64')), true);
  assert.equal(verify(null, Buffer.from(JSON.stringify({ ...first.challenge, sourceCommit: 'b'.repeat(40) })), setup.publicKey, Buffer.from(first.signature, 'base64')), false);
  assert.equal(releaseEnvelopeSchema.safeParse(first).success, false);
  assert.equal(JSON.stringify(first).includes('PRIVATE KEY'), false);
});

test('shared signing key check rejects missing, mismatched, duplicate and non-Ed25519 keys', () => {
  const setup = fixture();
  assert.throws(() => signingReadinessProof({ ...setup, keyId: 'unknown' }), /Unknown release signing key/);
  assert.throws(() => signingReadinessProof({ ...setup, privatePem: fixture().privatePem }), /does not match/);
  assert.throws(() => signingReadinessProof({ ...setup, trust: { schemaVersion: 1, keys: [] } }), /Unknown release signing key/);
  assert.throws(() => signingReadinessProof({ ...setup, trust: { ...setup.trust, keys: [...setup.trust.keys, ...setup.trust.keys] } }), /Duplicate trust key/);
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => trustedSigningKey('rsa', rsa.privateKey.export({ format: 'pem', type: 'pkcs8' }), {
    schemaVersion: 1, keys: [{ id: 'rsa', publicKey: rsa.publicKey.export({ format: 'pem', type: 'spki' }) }],
  }), /must be Ed25519/);
  assert.throws(() => signingReadinessProof({ ...setup, commit: 'main' }), /full lowercase source commit/);
  assert.throws(() => signingReadinessProof({ ...setup, runId: 'bad\n123' }), /run ID/);
});

test('readiness CLI rejects non-main, fork and PR contexts before reading the signing secret', () => {
  const script = fileURLToPath(new URL('../signing-readiness.mjs', import.meta.url));
  for (const override of [
    { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_REPOSITORY: 'fork/cubeCroom' }, { GITHUB_EVENT_NAME: 'pull_request' },
  ]) {
    assert.throws(() => execFileSync(process.execPath, [script], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      env: { ...process.env, GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'cubetek/cubeCroom', GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', RELEASE_SIGNING_PRIVATE_KEY: 'test-secret-never-output', ...override },
    }), (error) => {
      assert.match(error.stderr, /only through an official main workflow dispatch/);
      assert.equal(`${error.stdout}${error.stderr}`.includes('test-secret-never-output'), false);
      return true;
    });
  }
});

test('manual readiness has read-only permissions and secret access only in the final challenge step', async () => {
  const workflow = parse(await readFile(new URL('../../../.github/workflows/ota-signing-readiness.yml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  const job = workflow.jobs.challenge;
  assert.equal(job.if, "github.repository == 'cubetek/cubeCroom' && github.ref == 'refs/heads/main' && github.event_name == 'workflow_dispatch'");
  assert.equal(job.environment, 'release-publish');
  assert.equal(job.permissions, undefined);
  assert.equal(job.steps[0].with.ref, '${{ github.sha }}');
  assert.equal(job.steps[0].with['persist-credentials'], false);
  const last = job.steps.at(-1);
  assert.equal(last.run, 'node scripts/release/signing-readiness.mjs');
  assert.equal(last.env.RELEASE_SIGNING_PRIVATE_KEY, '${{ secrets.RELEASE_SIGNING_PRIVATE_KEY }}');
  assert.equal(JSON.stringify(job.steps.slice(0, -1)).includes('secrets.'), false);
  for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /^[\w.-]+\/[\w.-]+@[a-f0-9]{40}$/);
    assert.equal(step.uses?.includes('upload-artifact') ?? false, false);
  }
});

test('manual release is independent of automatic App setup while incomplete automatic setup is skipped', async () => {
  const workflow = parse(await readFile(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8'));
  const prepare = workflow.jobs.prepare;
  assert.equal(prepare.if, "github.repository == 'cubetek/cubeCroom' && github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || vars.RELEASE_AUTOMATION_ENABLED == 'true')");
  const setup = prepare.steps.find((step) => step.id === 'automation');
  assert.equal(setup.if, "github.event_name == 'push'");
  assert.equal(setup.env.RELEASE_APP_CONFIGURED, "${{ vars.RELEASE_APP_ID != '' && secrets.RELEASE_APP_PRIVATE_KEY != '' }}");
  for (const id of ['draft', 'app-token', 'please']) assert.ok(prepare.steps.find((step) => step.id === id).if.includes("steps.automation.outputs.configured == 'true'"));
  assert.equal(prepare.steps.find((step) => step.id === 'resolve').if, "github.event_name == 'workflow_dispatch' || steps.please.outputs.release_created == 'true'");
  assert.deepEqual(workflow.jobs.publish.needs, ['prepare', 'build']);
  assert.equal(workflow.jobs.build.steps.find((step) => step.run?.includes('node scripts/package-app.mjs make')).env.CUBECROOM_REQUIRE_SIGNING, '1');
});
