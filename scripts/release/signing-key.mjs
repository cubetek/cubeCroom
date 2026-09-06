import { createHash, createPrivateKey, createPublicKey } from 'node:crypto';
import { releaseTrustSchema } from '../../packages/contracts/dist/index.js';

/** One key-pair check for release signing and the non-release readiness challenge. */
export function trustedSigningKey(keyId, privatePem, rawTrust) {
  const trust = releaseTrustSchema.parse(rawTrust);
  if (new Set(trust.keys.map((key) => key.id)).size !== trust.keys.length) throw new Error('Duplicate trust key');
  const trusted = trust.keys.find((key) => key.id === keyId);
  if (!trusted) throw new Error('Unknown release signing key');
  const publicKey = createPublicKey(trusted.publicKey);
  const privateKey = createPrivateKey(privatePem);
  if (publicKey.asymmetricKeyType !== 'ed25519' || privateKey.asymmetricKeyType !== 'ed25519') throw new Error('The release key must be Ed25519.');
  const publicDer = publicKey.export({ type: 'spki', format: 'der' });
  if (!createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).equals(publicDer)) {
    throw new Error('Release signing key does not match the configured public trust.');
  }
  return { keyId, privateKey, publicKey, fingerprint: createHash('sha256').update(publicDer).digest('hex') };
}
