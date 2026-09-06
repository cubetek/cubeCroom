import { createHash, createPublicKey, verify } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat } from 'node:fs/promises';
import {
  releaseEnvelopeSchema, releasePayloadSchema, releaseTrustSchema,
  type ReleaseFile, type ReleasePayload, type UpdateChannel,
} from '@cubecroom/contracts';

export type ReleaseValidationOptions = {
  repository: { owner: string; repo: string };
  version?: string;
  channel?: UpdateChannel;
};

export function validateReleasePayload(raw: unknown, options: ReleaseValidationOptions): ReleasePayload {
  const payload = releasePayloadSchema.parse(raw);
  const { owner, repo } = options.repository;
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error('Invalid release repository');
  if (payload.tag !== `v${payload.version}`) throw new Error('Release tag mismatch');
  if ((payload.channel === 'beta') !== payload.version.includes('-beta.')) throw new Error('Release channel mismatch');
  if (options.version !== undefined && payload.version !== options.version) throw new Error('Release version mismatch');
  if (options.channel !== undefined && payload.channel !== options.channel) throw new Error('Release channel mismatch');
  const names = new Set<string>();
  for (const entry of payload.files) {
    if (names.has(entry.name)) throw new Error('Duplicate release asset');
    names.add(entry.name);
    if (entry.name.includes('..')) throw new Error('Invalid release filename');
    if (entry.arch === 'universal' && entry.kind !== 'metadata') throw new Error('Invalid universal release asset');
    const expected = `https://github.com/${owner}/${repo}/releases/download/${payload.tag}/${entry.name}`;
    if (entry.url !== expected) throw new Error('Untrusted release URL');
    if (Buffer.from(entry.sha512, 'base64').length !== 64) throw new Error('Invalid SHA512');
  }
  return payload;
}

/** Verify the signed bytes before parsing the payload. No JSON canonicalization dependency. */
export function verifyReleaseManifest(raw: unknown, rawTrust: unknown, options: ReleaseValidationOptions): ReleasePayload {
  const envelope = releaseEnvelopeSchema.parse(raw);
  const trust = releaseTrustSchema.parse(rawTrust);
  if (new Set(trust.keys.map((key) => key.id)).size !== trust.keys.length) throw new Error('Duplicate trust key');
  const key = trust.keys.find((one) => one.id === envelope.keyId);
  if (!key) throw new Error('Unknown release signing key');
  const publicKey = createPublicKey(key.publicKey);
  if (publicKey.asymmetricKeyType !== 'ed25519') throw new Error('Unsupported release signing key');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!verify(null, bytes, publicKey, Buffer.from(envelope.signature, 'base64'))) throw new Error('Invalid release signature');
  return validateReleasePayload(JSON.parse(bytes.toString('utf8')) as unknown, options);
}

/** Streaming validation keeps memory bounded for large installers. Reject links and concurrent replacements. */
export async function verifyReleaseFile(filePath: string, entry: ReleaseFile): Promise<void> {
  const before = await lstat(filePath);
  if (!before.isFile() || before.isSymbolicLink() || before.size !== entry.size) throw new Error('Release file size/type mismatch');
  const hash = createHash('sha512');
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) { bytes += chunk.length; hash.update(chunk); }
  const after = await lstat(filePath);
  if (bytes !== entry.size || !after.isFile() || after.isSymbolicLink() || before.ino !== after.ino || before.mtimeMs !== after.mtimeMs || after.size !== entry.size || hash.digest('base64') !== entry.sha512) {
    throw new Error('Release file checksum mismatch');
  }
}
