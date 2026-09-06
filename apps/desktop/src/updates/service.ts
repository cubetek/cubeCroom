import { app, BrowserWindow, net } from 'electron';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  UPDATE_IPC, releaseTrustSchema, type ReleaseFile, type ReleasePayload,
  type ReleaseTrust, type UpdateChannel, type UpdatePreparation, type UpdateState,
} from '@cubecroom/contracts';
import { createUpdateFence, defaultBackupsDirectory, verifyReleaseFile, verifyReleaseManifest } from '@cubecroom/core';
import { autoUpdater } from 'electron-updater';
import { takeBackup } from '../backup.js';
import { portalStatus, stopPortal } from '../portal.js';
import { closeStore, openStore, storeState } from '../store.js';
import { logUpdate } from './log.js';

export const updateFence = createUpdateFence();
let state: UpdateState = {
  phase: 'unavailable', currentVersion: app.getVersion(), channel: 'stable',
  availableVersion: null, progress: 0, checkedAt: null,
  message: 'التحديث متاح من النسخة المثبتة بعد تجهيز إصدار موثّق.',
};
let trust: ReleaseTrust = { schemaVersion: 1, keys: [] };
let repository: { owner: string; repo: string } | null = null;
let candidate: { payload: ReleasePayload; file: ReleaseFile; path: string | null } | null = null;
let busy = false;
let enabled = false;
let closedDataDirectory: string | null = null;
let nextCheck = Date.now() + 30_000;
let failures = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const preparations = new Map<number, { token: string; finish: (saved: boolean) => void }>();

function publish(patch: Partial<UpdateState>): UpdateState {
  const oldPhase = state.phase;
  state = { ...state, ...patch };
  if (oldPhase !== state.phase) logUpdate(state);
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(UPDATE_IPC.changed, state);
  }
  return state;
}

export function updateState(): UpdateState {
  const store = storeState();
  if (!busy && (state.phase === 'idle' || state.phase === 'unavailable') && store.status === 'open') {
    state.channel = store.repositories.settings.get('updateChannel') === 'beta' ? 'beta' : 'stable';
  }
  return { ...state };
}

function classIsActive(): boolean {
  const portal = portalStatus().state;
  const store = storeState();
  return portal === 'running' || portal === 'starting' || portal === 'unreachable' ||
    (store.status === 'open' && store.repositories.sessions.active() !== undefined);
}

function recoverPreparation(): void {
  if (closedDataDirectory !== null) {
    openStore(closedDataDirectory);
    closedDataDirectory = null;
  }
  updateFence.release();
}

export function initializeUpdates(): void {
  if (!app.isPackaged) return;
  try {
    const config = JSON.parse(readFileSync(join(process.resourcesPath, 'release-config.json'), 'utf8')) as { repository: { owner: string; repo: string } };
    if (!/^[\w.-]+$/.test(config.repository.owner) || !/^[\w.-]+$/.test(config.repository.repo)) throw new Error('Invalid repository');
    repository = config.repository;
    trust = releaseTrustSchema.parse(JSON.parse(readFileSync(join(process.resourcesPath, 'release-trust.json'), 'utf8')));
    if (trust.keys.length === 0) return;
    if (!['win32', 'darwin', 'linux'].includes(process.platform) || !['x64', 'arm64'].includes(process.arch)) return;
    if (process.platform === 'linux' && !process.env['APPIMAGE']) {
      publish({ message: 'شغّل نسخة AppImage للحصول على التحديثات.' });
      return;
    }
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoRunAppAfterInstall = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.disableWebInstaller = true;
    // Library log messages may contain redirected URLs; only our structured allowlist is stored.
    autoUpdater.logger = null;
    autoUpdater.on('error', () => {
      if (state.phase === 'installing') {
        recoverPreparation();
        busy = false;
        publish({ phase: 'error', message: 'تعذّر بدء المثبّت. بياناتك محفوظة؛ أعد الفحص وحاول مجدداً.' });
      }
    });
    let lastProgress = 0;
    autoUpdater.on('download-progress', (progress) => {
      if (state.phase === 'downloading' && Date.now() - lastProgress > 500) {
        lastProgress = Date.now();
        publish({ progress: Math.min(100, Math.max(0, progress.percent)) });
      }
    });
    enabled = true;
    publish({ phase: 'idle', message: 'يمكنك التحقق من وجود إصدار جديد.' });
    timer = setInterval(() => {
      const store = storeState();
      if (Date.now() < nextCheck || busy || !['idle', 'error'].includes(state.phase) || store.status !== 'open' || !store.repositories.settings.getBoolean('checkUpdatesAutomatically')) return;
      void checkForUpdates();
    }, 30_000);
    timer.unref();
    app.on('before-quit', () => { if (state.phase !== 'preparing' && timer) clearInterval(timer); });
  } catch {
    publish({ message: 'إعداد التحديث غير مكتمل في هذه الحزمة.' });
  }
}

function configureChannel(): void {
  if (!repository) throw new Error('Missing update configuration');
  const store = storeState();
  const channel = store.status === 'open' && store.repositories.settings.get('updateChannel') === 'beta' ? 'beta' : 'stable';
  autoUpdater.setFeedURL({ provider: 'github', ...repository, private: false });
  autoUpdater.channel = channel === 'stable' ? 'latest' : 'beta';
  autoUpdater.allowPrerelease = channel === 'beta';
  autoUpdater.allowDowngrade = false; // Setting channel otherwise enables downgrade in updater 6.8.9.
  publish({ channel });
}

async function readManifest(version: string): Promise<ReleasePayload> {
  if (!repository) throw new Error('Missing update configuration');
  // The version is checked by the signed-payload contract before being used for installation.
  if (!/^\d+\.\d+\.\d+(?:-beta\.\d+)?$/.test(version)) throw new Error('Invalid release version');
  const url = `https://github.com/${repository.owner}/${repository.repo}/releases/download/v${version}/cubecroom-release.json`;
  const response = await net.fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok || !response.body) throw new Error('Release manifest unavailable');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 1_500_000) throw new Error('Release manifest too large');
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const raw: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  return verifyReleaseManifest(raw, trust, { repository, version, channel: state.channel });
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!enabled || busy) return updateState();
  busy = true;
  candidate = null;
  publish({ phase: 'checking', availableVersion: null, progress: 0, message: 'نتحقق من الإصدارات…' });
  try {
    configureChannel();
    const result = await autoUpdater.checkForUpdates();
    const checkedAt = new Date().toISOString();
    if (!result?.isUpdateAvailable) return publish({ phase: 'idle', checkedAt, message: 'أنت تستخدم أحدث إصدار متاح لهذه القناة.' });
    const payload = await readManifest(result.updateInfo.version);
    const suffix = process.platform === 'win32' ? '.exe' : process.platform === 'darwin' ? '.zip' : '.AppImage';
    const targetArch = process.platform === 'darwin' && app.runningUnderARM64Translation ? 'arm64' : process.arch;
    const matches = payload.files.filter((file) => file.platform === process.platform && file.arch === targetArch && file.name.endsWith(suffix));
    if (matches.length !== 1) throw new Error('Missing or ambiguous release target');
    const file = matches[0]!;
    const info = result.updateInfo.files.find((entry) => {
      const url = new URL(entry.url, `https://github.com/${repository!.owner}/${repository!.repo}/releases/download/${payload.tag}/`);
      return url.href === file.url && entry.sha512 === file.sha512 && entry.size === file.size;
    });
    if (!info) throw new Error('Unsigned update metadata');
    candidate = { payload, file, path: null };
    failures = 0;
    return publish({ phase: 'available', checkedAt, availableVersion: payload.version, message: 'يتوفر إصدار موثّق. يمكنك تنزيله الآن والتثبيت بعد انتهاء الحصة.' });
  } catch {
    failures += 1;
    return publish({ phase: 'error', message: 'تعذّر التحقق من إصدار موثّق. يمكنك متابعة العمل وإعادة المحاولة لاحقاً.' });
  } finally {
    busy = false;
    nextCheck = Date.now() + (failures ? Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(failures, 8)) : 6 * 60 * 60_000) + Math.random() * 30_000;
  }
}

export async function downloadUpdate(): Promise<UpdateState> {
  if (!enabled || busy || state.phase !== 'available' || !candidate) return updateState();
  busy = true;
  const selected = candidate;
  publish({ phase: 'downloading', progress: 0, message: 'ننزل التحديث ونتحقق من سلامته…' });
  try {
    const paths = await autoUpdater.downloadUpdate();
    if (paths.length !== 1 || !paths[0]) throw new Error('Unexpected installer files');
    await verifyReleaseFile(paths[0], selected.file);
    selected.path = paths[0];
    return publish({ phase: 'ready', progress: 100, message: 'التحديث جاهز. أنهِ الحصة ثم أعد التشغيل لتثبيته؛ سنحفظ عملك وننشئ نسخة احتياطية أولاً.' });
  } catch {
    candidate = null;
    return publish({ phase: 'error', progress: 0, message: 'لم يكتمل تنزيل تحديث موثّق. أعد الفحص والمحاولة؛ لم تتغير بياناتك.' });
  } finally { busy = false; }
}

export function acknowledgeUpdatePreparation(senderId: number, input: UpdatePreparation): void {
  const pending = preparations.get(senderId);
  if (pending?.token === input.token) pending.finish(input.saved);
}

async function flushWindows(): Promise<void> {
  const windows = BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  if (windows.length === 0) throw new Error('لم نجد نافذة لحفظ العمل.');
  const results = await Promise.allSettled(windows.map((win) => new Promise<void>((resolve, reject) => {
    const token = randomUUID();
    const id = win.webContents.id;
    const timeout = setTimeout(() => finish(false), 30_000);
    const finish = (saved: boolean) => {
      clearTimeout(timeout);
      preparations.delete(id);
      if (saved) resolve(); else reject(new Error('تعذّر تأكيد حفظ كل التعديلات. راجع الصفحات المفتوحة ثم حاول مجدداً.'));
    };
    preparations.set(id, { token, finish });
    win.webContents.send(UPDATE_IPC.prepare, { token });
  })));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}

export async function installUpdate(): Promise<UpdateState> {
  if (!enabled || busy || state.phase !== 'ready' || !candidate?.path) return updateState();
  if (classIsActive()) return publish({ message: 'أنه الحصة وأوقف دخول الطلاب قبل تثبيت التحديث.' });
  busy = true;
  try {
    updateFence.begin();
    publish({ phase: 'preparing', message: 'نحفظ العمل ونجهّز نسخة احتياطية قبل التحديث…' });
    await flushWindows();
    updateFence.seal();
    await updateFence.waitForIdle();
    if (classIsActive()) throw new Error('أنه الحصة قبل التحديث.');
    await verifyReleaseFile(candidate.path, candidate.file);
    const store = storeState();
    if (store.status === 'blocked') throw new Error('استعد بياناتك أولاً قبل تثبيت تحديث من التطبيق.');
    await stopPortal();
    if (store.status === 'open') {
      await takeBackup(defaultBackupsDirectory(store.dataDirectory));
      closedDataDirectory = store.dataDirectory;
      closeStore();
    }
    // Backup can take minutes: verify the cached file again immediately before handing it to the installer.
    await verifyReleaseFile(candidate.path, candidate.file);
    publish({ phase: 'installing', message: 'اكتمل الحفظ. نبدأ تثبيت التحديث…' });
    autoUpdater.quitAndInstall(false, true);
    return updateState();
  } catch (error) {
    recoverPreparation();
    busy = false;
    return publish({ phase: 'ready', message: error instanceof Error && /[\u0600-\u06ff]/.test(error.message) ? error.message : 'تعذّر تجهيز التحديث. بقيت النسخة الحالية؛ أعد المحاولة بعد التحقق من المساحة والحفظ.' });
  }
}

export function changeUpdateChannel(channel: UpdateChannel): UpdateState {
  if (busy || updateFence.phase !== 'open') throw new Error('انتظر اكتمال عملية التحديث الحالية.');
  const store = storeState();
  if (store.status !== 'open') throw new Error('افتح بياناتك أولاً.');
  store.repositories.settings.set('updateChannel', channel);
  candidate = null;
  publish({ channel, phase: enabled ? 'idle' : 'unavailable', availableVersion: null, progress: 0, message: enabled ? 'حُفظت قناة التحديث. تحقق من الإصدارات المتاحة.' : state.message });
  return updateState();
}
