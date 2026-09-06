import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createRepositories } from '../dist/index.js';

/*
 * «قبول الكل» — مسار بداية الحصة.
 *
 * كان حلقةً بمعاملةٍ لكل طالب. والمعاملة الواحدة ليست أسرع فحسب: حلقةٌ
 * تنقطع في منتصفها تترك نصف الصفّ مقبولاً ونصفه لا، وشاشةَ معلمٍ لا تشبه
 * قاعدته.
 */

let dir;
let handle;
let repos;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-approve-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

function classWithRequests(count) {
  const cls = repos.classes.create({ name: 'الصف السادس' });
  repos.sessions.start(cls.id, 'token', '482917');
  const active = repos.sessions.active();
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    ids.push(
      repos.sessions.createRequest({
        sessionId: active.id,
        name: `طالب ${i}`,
        identifier: null,
      }).id,
    );
  }
  return { cls, active, ids };
}

describe('قبول دفعة من الطلبات', () => {
  test('يقبل الجميع ويُنشئ طالباً لكل طلب', () => {
    const { cls, active, ids } = classWithRequests(30);

    const result = repos.sessions.approveMany(ids);

    assert.equal(result.studentIds.length, 30);
    assert.equal(repos.students.listByClass(cls.id).length, 30);
    assert.equal(repos.sessions.listRequests(active.id, 'pending').length, 0);
    assert.equal(repos.sessions.listRequests(active.id, 'approved').length, 30);
  });

  test('ولا يُنشئ طالبين لطلب واحد لو مرّ مرّتين في القائمة', () => {
    const { cls, ids } = classWithRequests(3);

    repos.sessions.approveMany([ids[0], ids[0], ids[1], ids[2]]);

    // القراءة بـ`inArray` تعيد كل صفّ مرة واحدة مهما تكرّر في المدخل.
    assert.equal(repos.students.listByClass(cls.id).length, 3);
  });

  test('وقائمةٌ فارغة لا تفعل شيئاً', () => {
    const { cls } = classWithRequests(2);
    const result = repos.sessions.approveMany([]);
    assert.deepEqual(result.studentIds, []);
    assert.equal(repos.students.listByClass(cls.id).length, 0);
  });

  test('ومعرّفٌ لا وجود له يُتجاهل ولا يُسقط الدفعة', () => {
    const { cls, ids } = classWithRequests(2);
    const result = repos.sessions.approveMany([...ids, 'لا-وجود-له']);
    assert.equal(result.studentIds.length, 2);
    assert.equal(repos.students.listByClass(cls.id).length, 2);
  });
});
