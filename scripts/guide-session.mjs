import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

// Visible, isolated teacher session for an interactive documentation walkthrough.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lab = join(root, '.cubeflow', 'learning-guide-lab');
mkdirSync(lab, { recursive: true });
const env = { ...process.env, CUBECROOM_GUIDE_LAB: lab };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [join(root, 'apps/desktop/e2e/guide-session.mjs')], {
  cwd: root, env, windowsHide: false, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
});
child.on('message', message => { writeFileSync(join(lab, 'latest.json'), JSON.stringify(message, null, 2)); console.log(JSON.stringify(message.ready ? message : { done: true, error: message.error })); });
const inbox = join(lab, 'command.json');
setInterval(() => { if (existsSync(inbox)) { const command = JSON.parse(readFileSync(inbox, 'utf8')); unlinkSync(inbox); child.send(command); } }, 150);
const input = createInterface({ input: process.stdin });
input.on('line', line => { try { child.send(JSON.parse(line)); } catch (error) { console.log(JSON.stringify({ error: error.message })); } });
child.once('exit', code => { input.close(); process.exit(code ?? 1); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { if (child.connected) child.send({ action: 'quit' }); });
