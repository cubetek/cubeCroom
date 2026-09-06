import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readdir, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { moveData } from '../dist/index.js';

/*
 * نقل بيانات معلم — والقاعدة الوحيدة التي لا تُكسر: **القديم لا يُحذف**.
 *
 * هذه بيانات لا نسخة لها عند أحد. فكل فحص هنا يسأل سؤالاً واحداً في صيغ
 * مختلفة: هل بقي ما كان؟
 */

let root;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cubecroom-move-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function seedSource() {
  const from = join(root, 'old');
  await mkdir(join(from, 'files'), { recursive: true });
  await writeFile(join(from, 'cubecroom.sqlite'), 'قاعدة', 'utf8');
  await writeFile(join(from, 'files', 'a.pdf'), 'مرفق', 'utf8');
  return from;
}

describe('نقل البيانات', () => {
  test('ينسخ كل شيء ويُبقي القديم كما هو', async () => {
    const from = await seedSource();
    const to = join(root, 'new');

    const result = await moveData({ from, to });

    assert.equal(result.status, 'moved');
    assert.equal(await readFile(join(to, 'cubecroom.sqlite'), 'utf8'), 'قاعدة');
    assert.equal(await readFile(join(to, 'files', 'a.pdf'), 'utf8'), 'مرفق');

    // القاعدة التي لا تُكسر.
    assert.equal(await readFile(join(from, 'cubecroom.sqlite'), 'utf8'), 'قاعدة');
    assert.equal(result.oldPath, from);
  });

  test('ويرفض مجلداً غير فارغ — لئلّا تختلط بياناتٌ ببيانات', async () => {
    const from = await seedSource();
    const to = join(root, 'busy');
    await mkdir(to, { recursive: true });
    await writeFile(join(to, 'شيء.txt'), 'موجود', 'utf8');

    const result = await moveData({ from, to });

    assert.equal(result.status, 'refused');
    assert.match(result.message, /ليس فارغاً/);
    // ولم يُكتب شيء: الرفض قبل أول بايت.
    assert.deepEqual(await readdir(to), ['شيء.txt']);
  });

  test('ويرفض النقل إلى مجلد داخل المصدر — نسخٌ لا ينتهي', async () => {
    const from = await seedSource();
    const result = await moveData({ from, to: join(from, 'inside') });
    assert.equal(result.status, 'refused');
    assert.match(result.message, /داخل مجلد بياناتك/);
  });

  test('ويرفض النقل إلى مجلد يحوي المصدر', async () => {
    const from = await seedSource();
    const result = await moveData({ from, to: root });
    assert.equal(result.status, 'refused');
  });

  test('ويرفض المكان نفسه بلا عمل', async () => {
    const from = await seedSource();
    const result = await moveData({ from, to: from });
    assert.equal(result.status, 'refused');
    assert.match(result.message, /مكان بياناتك الحالي/);
  });
});
