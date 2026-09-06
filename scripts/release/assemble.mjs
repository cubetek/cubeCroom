import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { assembleAssets } from './assets.mjs';
import { readJson, releaseIdentity, requireValue, root } from './common.mjs';
import { distributionDocuments, signReleaseManifest } from './manifest.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
const directory = resolve(root, process.env.RELEASE_ASSEMBLED_DIR ?? 'dist/release-assembled');
const files = await assembleAssets(resolve(root, 'dist/release-input'), directory, identity);
const createdAt = requireValue(process.env.RELEASE_CREATED_AT, 'RELEASE_CREATED_AT');
const keyId = requireValue(process.env.RELEASE_SIGNING_KEY_ID, 'RELEASE_SIGNING_KEY_ID');
const payload = { schemaVersion: 1, ...identity, createdAt, files };
const envelope = signReleaseManifest(payload, keyId, requireValue(process.env.RELEASE_SIGNING_PRIVATE_KEY, 'RELEASE_SIGNING_PRIVATE_KEY'), await readJson(resolve(root, 'scripts/release/trust.json')));
await writeFile(resolve(directory, 'cubecroom-release.json'), `${JSON.stringify(envelope, null, 2)}\n`);
for (const [name, content] of Object.entries(distributionDocuments(payload))) await writeFile(resolve(directory, name), content);
console.log(`Assembled and signed ${files.length} assets for ${identity.tag}.`);
