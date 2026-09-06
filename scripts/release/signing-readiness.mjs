import { randomBytes, sign, verify } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readJson, repository, requireValue, root } from './common.mjs';
import { trustedSigningKey } from './signing-key.mjs';

/** Deliberately not a release envelope: this signature cannot authorize an OTA payload. */
export function signingReadinessProof({ keyId, privatePem, trust, commit, runId }) {
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw new Error('A full lowercase source commit SHA is required.');
  if (!/^[1-9][0-9]*$/.test(runId ?? '')) throw new Error('A GitHub Actions run ID is required.');
  const { privateKey, publicKey, fingerprint } = trustedSigningKey(keyId, privatePem, trust);
  const challenge = {
    schemaVersion: 1, purpose: 'cubecroom-ota-signing-readiness', repository,
    sourceCommit: commit, runId, keyId, fingerprint,
    createdAt: new Date().toISOString(), nonce: randomBytes(32).toString('hex'),
  };
  const bytes = Buffer.from(JSON.stringify(challenge), 'utf8');
  const signature = sign(null, bytes, privateKey);
  if (!verify(null, bytes, publicKey, signature)) throw new Error('Signing readiness challenge verification failed.');
  return { challenge, signature: signature.toString('base64') };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || process.env.GITHUB_REPOSITORY !== repository || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('The signing readiness challenge runs only through an official main workflow dispatch.');
  }
  const proof = signingReadinessProof({
    keyId: requireValue(process.env.RELEASE_SIGNING_KEY_ID, 'RELEASE_SIGNING_KEY_ID'),
    privatePem: requireValue(process.env.RELEASE_SIGNING_PRIVATE_KEY, 'RELEASE_SIGNING_PRIVATE_KEY'),
    trust: await readJson(resolve(root, 'scripts/release/trust.json')),
    commit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID,
  });
  // Only public proof is emitted. No release/asset is created, uploaded, or modified.
  console.log(JSON.stringify(proof, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `Ed25519 signing challenge verified against the committed trust file.\n\nKey: \`${proof.challenge.keyId}\`\n\nPublic SPKI SHA-256: \`${proof.challenge.fingerprint}\`\n\nSource: \`${proof.challenge.sourceCommit}\`\n\nThis verifies the OTA manifest key only. It does not verify native certificates, publish a release, or establish an installed A-to-B update.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
