import { timingSafeEqual } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { connect, createServer, type Socket } from 'node:net';

/**
 * The relay's way into the running app (D36).
 *
 * It uses a Windows named pipe or a Unix domain socket in a private directory, never a TCP port,
 * so no web page can reach it. The first line must carry the per-start token. A wrong or missing
 * token closes the connection before any MCP message is read.
 */

const TOKEN_LINE_BYTES = 256;
const AUTH_TIMEOUT_MS = 5_000;
const MAX_CONNECTIONS = 8;

export type LocalMcpListener = {
  readonly connections: () => number;
  readonly close: () => Promise<void>;
};

export function tokensMatch(given: string, expected: string): boolean {
  if (expected.length === 0) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A socket file left by a crash is removed; a live one means another instance serves it. */
export async function prepareSocketPath(path: string): Promise<void> {
  if (process.platform === 'win32') return;
  const live = await new Promise<boolean>((resolve) => {
    const probe = connect(path);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
  if (live) throw new Error('Another CubeCroom instance is serving MCP for this profile.');
  await rm(path, { force: true });
}

export async function listenLocalMcp(options: {
  readonly path: string;
  readonly token: string;
  /** Resolves once the MCP transport listens; the socket stays paused until then. */
  readonly onConnection: (socket: Socket) => Promise<void>;
}): Promise<LocalMcpListener> {
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    authenticate(socket, options.token, () => {
      options.onConnection(socket).then(
        () => socket.resume(),
        () => socket.destroy(),
      );
    });
  });
  server.maxConnections = MAX_CONNECTIONS;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.path, () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    connections: () => sockets.size,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

function authenticate(socket: Socket, token: string, accepted: () => void): void {
  let received = Buffer.alloc(0);
  const timer = setTimeout(() => socket.destroy(), AUTH_TIMEOUT_MS);
  socket.once('close', () => clearTimeout(timer));
  const onData = (chunk: Buffer): void => {
    received = Buffer.concat([received, chunk]);
    const end = received.indexOf(0x0a);
    if (end === -1) {
      if (received.length > TOKEN_LINE_BYTES) socket.destroy();
      return;
    }
    // Removing the listener does not pause a flowing stream, and attaching the transport's
    // listener later does not resume an explicitly paused one: `listenLocalMcp` resumes it.
    socket.off('data', onData);
    socket.pause();
    clearTimeout(timer);
    const line = received.subarray(0, end).toString('utf8').replace(/\r$/, '');
    if (end > TOKEN_LINE_BYTES || !tokensMatch(line, token)) {
      socket.destroy();
      return;
    }
    // The relay may send its first MCP message in the same chunk as the token.
    const rest = received.subarray(end + 1);
    if (rest.length > 0) socket.unshift(rest);
    accepted();
  };
  socket.on('data', onData);
}
