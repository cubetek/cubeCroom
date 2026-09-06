#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/**
 * better-sqlite3 13 ships Node-API prebuilds. Verify them in the actual runtime;
 * downloading an Electron-specific ABI build would break this release format.
 * The old command names remain available for development scripts.
 */
export function verifyNative({
  runtime = 'node',
  modulePath = join(root, 'node_modules', 'better-sqlite3'),
  executable = runtime === 'electron' ? require('electron') : process.execPath,
} = {}) {
  const program = String.raw`
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const Database = require(process.argv[1]);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cubecroom-native-'));
    (async () => {
      let database;
      let restored;
      try {
        database = new Database(path.join(temporary, 'source.db'));
        database.pragma('journal_mode = WAL');
        database.exec('CREATE TABLE samples (id INTEGER PRIMARY KEY, value TEXT NOT NULL)');
        const insert = database.prepare('INSERT INTO samples (value) VALUES (?)');
        database.transaction(() => { insert.run('teacher'); insert.run('student'); })();
        assert.throws(database.transaction(() => { insert.run('discard'); throw Error('rollback'); }));
        assert.equal(database.prepare('SELECT count(*) AS total FROM samples').get().total, 2);
        await database.backup(path.join(temporary, 'snapshot.db'));
        restored = new Database(path.join(temporary, 'snapshot.db'), { readonly: true });
        assert.equal(restored.prepare('SELECT count(*) AS total FROM samples').get().total, 2);
        assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
        console.log(JSON.stringify({
          node: process.versions.node,
          electron: process.versions.electron ?? null,
          napi: process.versions.napi,
          sqlite: database.prepare('SELECT sqlite_version() AS version').get().version,
          platform: process.platform,
          arch: process.arch,
          transactionAndBackup: true,
        }));
      } finally {
        restored?.close();
        database?.close();
        // mkdtemp creates this exact child; never accept a user-controlled cleanup path.
        const relative = path.relative(os.tmpdir(), temporary);
        if (!relative.startsWith('cubecroom-native-') || relative.includes(path.sep)) {
          throw Error('Refusing to remove an unexpected native-check directory');
        }
        fs.rmSync(temporary, { recursive: true, force: true });
      }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(executable, ['-e', program, modulePath], {
    encoding: 'utf8',
    env: { ...process.env, ...(runtime === 'electron' ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
    windowsHide: true,
    timeout: 30_000,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`SQLite verification failed in ${runtime}: ${result.error?.message ?? result.stderr ?? result.status}`);
  }
  const line = result.stdout.trim().split(/\r?\n/).findLast((entry) => entry.startsWith('{'));
  if (!line) throw new Error(`SQLite verification returned no result in ${runtime}`);
  return JSON.parse(line);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = process.argv[2] ?? 'node';
  if (!['node', 'electron'].includes(runtime)) throw new Error('Expected node or electron');
  console.log(JSON.stringify(verifyNative({ runtime }), null, 2));
}
