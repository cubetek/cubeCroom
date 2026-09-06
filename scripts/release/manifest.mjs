import { createPrivateKey, sign } from 'node:crypto';
import { verifyReleaseManifest } from '@cubecroom/core';
import { RELEASE_CONFIG } from './config.mjs';
import { repository } from './common.mjs';

export function signReleaseManifest(payload, keyId, privatePem, trust) {
  const privateKey = createPrivateKey(privatePem);
  if (privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The release key must be Ed25519.');
  const bytes = Buffer.from(JSON.stringify(payload), 'utf8');
  const envelope = { schemaVersion: 1, keyId, algorithm: 'Ed25519', payload: bytes.toString('base64'), signature: sign(null, bytes, privateKey).toString('base64') };
  verifyReleaseManifest(envelope, trust, { repository: RELEASE_CONFIG.repository, version: payload.version, channel: payload.channel });
  return envelope;
}

export function distributionDocuments(payload) {
  const { version, channel, createdAt, tag, files } = payload;
  return {
    'downloads.json': `${JSON.stringify({ schemaVersion: 1, version, channel, createdAt, releaseUrl: `https://github.com/${repository}/releases/tag/${tag}`, downloads: files.filter((file) => file.kind === 'installer').map(({ platform, arch, name, size, url, sha512 }) => ({ platform, arch, name, size, url, sha512 })) }, null, 2)}\n`,
    SHA512SUMS: `${files.map((file) => `${Buffer.from(file.sha512, 'base64').toString('hex')}  ${file.name}`).join('\n')}\n`,
  };
}
