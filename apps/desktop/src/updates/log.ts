import { app } from 'electron';
import { appendFile, mkdir, rename, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { UpdateState } from '@cubecroom/contracts';
import { storeState } from '../store.js';

let pending = Promise.resolve();
/** Deliberately log an allowlist, never provider messages, URLs, tokens, or lesson content. */
export function logUpdate(state: UpdateState): void {
  const store = storeState();
  if (store.status !== 'open' || !store.repositories.settings.getBoolean('keepLocalCrashLog')) return;
  const record = JSON.stringify({
    at: new Date().toISOString(), phase: state.phase, version: state.currentVersion,
    target: state.availableVersion, channel: state.channel, platform: process.platform, arch: process.arch,
  });
  pending = pending.then(async () => {
    const directory = join(app.getPath('userData'), 'logs');
    const file = join(directory, 'updates.log');
    await mkdir(directory, { recursive: true });
    if ((await stat(file).catch(() => null))?.size && (await stat(file)).size > 512 * 1024) {
      await rm(`${file}.1`, { force: true });
      await rename(file, `${file}.1`);
    }
    await appendFile(file, `${record}\n`, { mode: 0o600 });
  }).catch(() => undefined);
}
