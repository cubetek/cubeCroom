import { resolve } from 'node:path';
import { RELEASE_CONFIG } from './config.mjs';
import { readJson, releaseIdentity, requireValue, root } from './common.mjs';

const identity = releaseIdentity(process.env.RELEASE_TAG, process.env.RELEASE_COMMIT);
const pkg = await readJson(resolve(root, 'package.json'));
const desktop = await readJson(resolve(root, 'apps/desktop/package.json'));
if (pkg.version !== identity.version || desktop.version !== identity.version) throw new Error('Release versions are not synchronized.');
const trust = await readJson(resolve(root, 'scripts/release/trust.json'));
if (trust.schemaVersion !== 1 || !Array.isArray(trust.keys) || trust.keys.length === 0) throw new Error('Configure reviewed public release signing keys before building an official release.');
const target = RELEASE_CONFIG.targets.find((entry) => entry.id === process.env.RELEASE_TARGET);
if (!target || target.platform !== process.platform || target.arch !== process.arch) throw new Error('The native runner must match the configured release target.');
if (target.platform === 'win32' || target.platform === 'darwin') {
  requireValue(process.env.CSC_LINK, 'CSC_LINK');
  requireValue(process.env.CSC_KEY_PASSWORD, 'CSC_KEY_PASSWORD');
}
if (target.platform === 'win32') requireValue(process.env.CUBECROOM_WINDOWS_PUBLISHER_NAME, 'CUBECROOM_WINDOWS_PUBLISHER_NAME');
if (target.platform === 'darwin') {
  for (const name of ['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']) requireValue(process.env[name], name);
}
console.log(`Release preflight passed for ${target.id} ${identity.tag}; installed-update acceptance remains a separate publish gate.`);
