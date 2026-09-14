import { app } from 'electron';
import { randomBytes } from 'node:crypto';
import { rmSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { McpLaunch, McpStatus } from '@cubecroom/contracts';
import { readConfig, updateConfig } from '../config.js';
import { repositories, storeState } from '../store.js';
import { serveMcpSocket } from './server.js';
import { listenLocalMcp, prepareSocketPath, type LocalMcpListener } from './socket.js';

/**
 * Local MCP access for AI apps on this device (D36).
 *
 * The switch is `mcpEnabled` in config.json: a device setting, off by default and outside backups.
 * The server lives in the main process, so reads use the same repositories and store lifecycle,
 * and no second process holds the database open during a restore or a data move.
 */

// Unix socket paths are limited to about 104 bytes on macOS.
const UNIX_SOCKET_PATH_BYTES = 100;

let listener: LocalMcpListener | null = null;
let temporaryDirectory: string | null = null;
let failure: string | null = null;
let queue: Promise<unknown> = Promise.resolve();

const directory = (): string => join(app.getPath('userData'), 'mcp');
const relayFile = (): string => join(directory(), 'cubecroom-mcp.cjs');
const connectionFile = (): string => join(directory(), 'connection.json');

/** Startup and toggles run one at a time, so a quick off and on cannot leave two listeners. */
function serialized<T>(step: () => Promise<T>): Promise<T> {
  const next = queue.then(step, step);
  queue = next.catch(() => undefined);
  return next;
}

export function mcpLaunch(): McpLaunch {
  // An AppImage mounts at a new path on every launch; APPIMAGE names the file that stays put.
  const appImage = process.platform === 'linux' ? process.env['APPIMAGE'] : undefined;
  return {
    command: appImage !== undefined && appImage !== '' ? appImage : process.execPath,
    args: [relayFile()],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}

export function mcpStatus(): McpStatus {
  if (listener !== null) {
    return { state: 'running', connections: listener.connections(), launch: mcpLaunch() };
  }
  if (failure !== null) return { state: 'failed', message: failure };
  return { state: 'off' };
}

async function endpoint(): Promise<string> {
  // A new random pipe name each start, so no other program can claim it first.
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\cubecroom-mcp-${randomBytes(16).toString('hex')}`;
  }
  const beside = join(directory(), 'relay.sock');
  if (Buffer.byteLength(beside) <= UNIX_SOCKET_PATH_BYTES) {
    await prepareSocketPath(beside);
    return beside;
  }
  // A private temporary directory keeps a long profile path within the socket limit.
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'cubecroom-mcp-'));
  return join(temporaryDirectory, 'relay.sock');
}

async function writePrivate(file: string, content: string): Promise<void> {
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, content, { mode: 0o600 });
  await rename(temporary, file);
}

async function start(): Promise<void> {
  if (listener !== null) return;
  failure = null;
  // Gatekeeper runs an app that was never moved from its download location at a random path.
  if (process.platform === 'darwin' && process.execPath.includes('/AppTranslocation/')) {
    failure =
      'انقل CubeCroom إلى مجلد «التطبيقات» ثم افتحه من هناك. يشغّله macOS الآن من مسار مؤقت يتغيّر في كل مرة، فلا يثبت إعداد تطبيق الذكاء الاصطناعي.';
    return;
  }
  try {
    await mkdir(directory(), { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await chmod(directory(), 0o700);
    // Rewritten on every start, so the relay always matches the running version.
    await writeFile(relayFile(), await readFile(join(app.getAppPath(), 'dist-app', 'mcp-relay.cjs')));
    const token = randomBytes(32).toString('base64url');
    const path = await endpoint();
    listener = await listenLocalMcp({
      path,
      token,
      onConnection: (socket: Socket) =>
        serveMcpSocket(socket, {
          version: app.getVersion(),
          repositories: () => (storeState().status === 'open' ? repositories() : null),
        }),
    });
    // Written only after the server listens, so a relay never reads a token that nobody answers.
    await writePrivate(connectionFile(), `${JSON.stringify({ path, token })}\n`);
  } catch {
    await stop();
    failure =
      'تعذّر تشغيل القراءة لتطبيقات الذكاء الاصطناعي على هذا الجهاز. أغلق أي نسخة أخرى من CubeCroom ثم شغّل المفتاح من جديد.';
  }
}

async function stop(): Promise<void> {
  const current = listener;
  const temporary = temporaryDirectory;
  listener = null;
  temporaryDirectory = null;
  failure = null;
  await rm(connectionFile(), { force: true });
  await current?.close();
  if (temporary !== null) await rm(temporary, { recursive: true, force: true });
}

export function setMcpEnabled(enabled: boolean): Promise<McpStatus> {
  return serialized(async () => {
    await updateConfig({ mcpEnabled: enabled });
    if (enabled) await start();
    else await stop();
    return mcpStatus();
  });
}

export function resumeMcpChannel(): Promise<void> {
  return serialized(async () => {
    if ((await readConfig())?.mcpEnabled === true) await start();
  });
}

/** Quit and crash paths: the token file goes first, then every relay connection closes. */
export function stopMcpChannelNow(): void {
  const current = listener;
  listener = null;
  try {
    rmSync(connectionFile(), { force: true });
  } catch {
    // Exiting anyway. A stale file only makes the next relay report CubeCroom as closed.
  }
  void current?.close();
}
