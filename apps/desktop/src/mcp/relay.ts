import { readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';

/**
 * CubeCroom's MCP relay (D36).
 *
 * An AI app starts it with CubeCroom's own executable in Node mode (`ELECTRON_RUN_AS_NODE`). It
 * forwards MCP messages between that app's stdio and the running CubeCroom. Stdout carries only
 * MCP messages; diagnostics go to stderr.
 */

type Connection = { readonly path: string; readonly token: string };

const UNAVAILABLE =
  'CubeCroom is not open, or reading by AI apps is turned off in its AI settings. ' +
  'CubeCroom غير مفتوح، أو أن السماح لتطبيقات الذكاء الاصطناعي بالقراءة مطفأ في إعدادات الذكاء الاصطناعي.';

/** The app writes connection.json beside this file only while its server is listening. */
function readConnection(): Connection | null {
  const script = process.argv[1];
  if (script === undefined) return null;
  try {
    const value: unknown = JSON.parse(readFileSync(join(dirname(script), 'connection.json'), 'utf8'));
    if (typeof value !== 'object' || value === null) return null;
    const { path, token } = value as Record<string, unknown>;
    return typeof path === 'string' && typeof token === 'string' ? { path, token } : null;
  } catch {
    return null;
  }
}

/** Answer the first request with the reason, so the AI app shows it instead of a silent exit. */
function refuse(): void {
  process.stderr.write(`[cubecroom-mcp] ${UNAVAILABLE}\n`);
  let pending = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    pending += chunk;
    for (let end = pending.indexOf('\n'); end !== -1; end = pending.indexOf('\n')) {
      const line = pending.slice(0, end).trim();
      pending = pending.slice(end + 1);
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      const { id, method } = (message ?? {}) as Record<string, unknown>;
      // Notifications carry no id and receive no reply.
      if (id === undefined || typeof method !== 'string') continue;
      const reply = { jsonrpc: '2.0', id, error: { code: -32000, message: UNAVAILABLE } };
      process.stdout.write(`${JSON.stringify(reply)}\n`, () => process.exit(1));
    }
  });
  process.stdin.once('end', () => process.exit(1));
}

const connection = readConnection();
if (connection === null) {
  refuse();
} else {
  const socket = connect(connection.path);
  let open = false;
  socket.once('connect', () => {
    open = true;
    socket.write(`${connection.token}\n`);
    process.stdin.pipe(socket);
    socket.pipe(process.stdout);
  });
  socket.on('error', (error) => {
    if (!open) {
      refuse();
      return;
    }
    process.stderr.write(`[cubecroom-mcp] connection to CubeCroom closed: ${error.message}\n`);
  });
  // Turning the switch off or quitting CubeCroom closes the socket and ends this relay.
  socket.once('close', () => {
    if (open) process.exit(0);
  });
}
