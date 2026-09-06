import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, releaseIdentity, root } from './common.mjs';

export function validateProductVersion(product, desktop, manifest) {
  const version = product?.version;
  releaseIdentity(`v${version}`, '0'.repeat(40));
  if (desktop?.version !== version || manifest?.['.'] !== version) {
    throw new Error('Root package, desktop package and Release Please manifest versions must match.');
  }
  return version;
}

export function publicationMode(policy) {
  if (policy?.mode !== 'preview' && policy?.mode !== 'signed') throw new Error('Release policy mode must be preview or signed.');
  return policy.mode;
}

async function main() {
  const version = validateProductVersion(...await Promise.all([
    readJson(resolve(root, 'package.json')), readJson(resolve(root, 'apps/desktop/package.json')),
    readJson(resolve(root, '.github/.release-please-manifest.json')),
  ]));
  const notes = await readFile(resolve(root, 'CHANGELOG.md'), 'utf8');
  if (!notes.split('\n').some((line) => line.startsWith(`## [${version}]`) || line.startsWith(`## ${version} `))) {
    throw new Error('CHANGELOG.md must contain the current product version.');
  }
  console.log(`Product version ${version}; publication mode ${publicationMode(await readJson(resolve(root, '.github/release-policy.json')))}.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
