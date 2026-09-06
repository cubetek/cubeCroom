import { z } from 'zod';

export const UPDATE_CHANNELS = ['stable', 'beta'] as const;
export const updateChannelSchema = z.enum(UPDATE_CHANNELS);
export type UpdateChannel = z.infer<typeof updateChannelSchema>;
export const UPDATE_IPC = {
  state: 'updates:state',
  check: 'updates:check',
  download: 'updates:download',
  install: 'updates:install',
  channel: 'updates:channel',
  changed: 'updates:changed',
  prepare: 'updates:prepare',
  prepared: 'updates:prepared',
} as const;
export const updatePreparationSchema = z.object({ token: z.string().uuid(), saved: z.boolean() }).strict();
export const updateStateSchema = z.object({
  phase: z.enum(['unavailable', 'idle', 'checking', 'available', 'downloading', 'ready', 'preparing', 'installing', 'error']),
  currentVersion: z.string(),
  channel: updateChannelSchema,
  availableVersion: z.string().nullable(),
  progress: z.number().min(0).max(100),
  checkedAt: z.string().datetime().nullable(),
  message: z.string(),
});
export type UpdateState = z.infer<typeof updateStateSchema>;
export type UpdatePreparation = z.infer<typeof updatePreparationSchema>;
export type UpdateBridge = {
  updateState: () => Promise<UpdateState>;
  updateCheck: () => Promise<UpdateState>;
  updateDownload: () => Promise<UpdateState>;
  updateInstall: () => Promise<UpdateState>;
  updateChannel: (channel: UpdateChannel) => Promise<UpdateState>;
  updatePrepared: (input: UpdatePreparation) => Promise<{ accepted: true }>;
  onUpdateState: (listener: (state: UpdateState) => void) => () => void;
  onUpdatePrepare: (listener: (input: { token: string }) => void) => () => void;
};

const base64 = z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const releaseVersionSchema = z.string().max(80).regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-beta\.(0|[1-9]\d*))?$/);
export const releaseFileSchema = z.object({
  name: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
  size: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  sha512: base64.refine((value) => value.length === 88),
  platform: z.enum(['win32', 'darwin', 'linux']),
  arch: z.enum(['x64', 'arm64', 'universal']),
  kind: z.enum(['installer', 'updater', 'metadata', 'blockmap']),
  url: z.string().url().max(1000),
}).strict();
export const releasePayloadSchema = z.object({
  schemaVersion: z.literal(1),
  version: releaseVersionSchema,
  channel: updateChannelSchema,
  tag: z.string().max(81),
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  createdAt: z.string().datetime(),
  files: z.array(releaseFileSchema).min(1).max(100),
}).strict();
export const releaseEnvelopeSchema = z.object({
  schemaVersion: z.literal(1),
  keyId: z.string().min(1).max(100),
  algorithm: z.literal('Ed25519'),
  payload: base64.refine((value) => value.length > 0 && value.length <= 1_400_000),
  signature: base64.refine((value) => value.length === 88),
}).strict();
export const releaseTrustSchema = z.object({
  schemaVersion: z.literal(1),
  keys: z.array(z.object({ id: z.string().min(1).max(100), publicKey: z.string().min(1).max(2000) }).strict()).max(10),
}).strict();
export type ReleaseFile = z.infer<typeof releaseFileSchema>;
export type ReleasePayload = z.infer<typeof releasePayloadSchema>;
export type ReleaseEnvelope = z.infer<typeof releaseEnvelopeSchema>;
export type ReleaseTrust = z.infer<typeof releaseTrustSchema>;
