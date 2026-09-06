import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RELEASE_CONFIG } from './config.mjs';
import { distributionDocuments } from './manifest.mjs';
import { readJson, releaseIdentity, root } from './common.mjs';
import { publishAssets, requirePublicPublisher } from './publish-assets.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
await requirePublicPublisher();
const directory = resolve(root, process.env.RELEASE_ASSEMBLED_DIR ?? 'dist/release-assembled');
const envelope = await readJson(resolve(directory, 'cubecroom-release.json'));
const { verifyReleaseManifest, verifyReleaseFile } = await import('@cubecroom/core');
const payload = verifyReleaseManifest(envelope, await readJson(resolve(root, 'scripts/release/trust.json')), { repository: RELEASE_CONFIG.repository, version: identity.version, channel: identity.channel });
if (payload.commit !== identity.commit) throw new Error('Signed manifest commit mismatch.');
for (const file of payload.files) await verifyReleaseFile(resolve(directory, file.name), file);
for (const [name, expectedText] of Object.entries(distributionDocuments(payload))) {
  if (await readFile(resolve(directory, name), 'utf8') !== expectedText) throw new Error(`Download documentation does not match the signed manifest: ${name}`);
}
const expected = [...payload.files.map((file) => file.name), 'cubecroom-release.json', 'downloads.json', 'SHA512SUMS'].sort();
if (JSON.stringify((await readdir(directory)).sort()) !== JSON.stringify(expected)) throw new Error('Assembled assets contain unexpected/missing files.');
await publishAssets({ directory, expected, identity,
  releaseFields: { prerelease: identity.channel === 'beta', make_latest: identity.channel === 'stable' ? 'true' : 'false' } });
