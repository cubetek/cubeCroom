import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SETTING_KEYS } from '@cubecroom/contracts';
import {
  openDatabase,
  createRepositories,
  FileInUseError,
  InvalidAnswerError,
  NotFoundError,
} from '../dist/index.js';

/** معيار إنجاز P1-2: المستودعات تعمل، و«كتابة حرجة واحدة transactional» (NFR-005). */

let handle;
let repos;
let dir;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cubecroom-repo-'));
  handle = openDatabase({ file: join(dir, 'test.sqlite') });
  repos = createRepositories(handle);
});

afterEach(async () => {
  handle.close();
  // إعادة المحاولة ليست تزيّناً: ويندوز يحرّر مقابض ملفات SQLite المصاحبة
  // (-wal و -shm) بعد الإغلاق بلحظة، فيفشل الحذف بـ ENOTEMPTY تحت الحمل.
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const file = (name, storageName) =>
  repos.files.register({
    name,
    kind: 'مستند PDF',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    storageName,
  });

test('AI published lookups never expose another class or a draft', () => {
  const klass = repos.classes.create({ name: 'العلوم' });
  const other = repos.classes.create({ name: 'الرياضيات' });
  const lesson = repos.lessons.create({ classId: klass.id, title: 'الماء' });
  const activity = repos.activities.create({ classId: klass.id, title: 'تحقق', lessonId: lesson.id });
  for (const [repository, row] of [[repos.lessons, lesson], [repos.activities, activity]]) {
    assert.equal(repository.findPublished(row.id, klass.id), undefined);
    repository.setPublished(row.id, true);
    assert.equal(repository.findPublished(row.id, klass.id).id, row.id);
    assert.equal(repository.findPublished(row.id, other.id), undefined);
    assert.equal(repository.findPublished('missing', klass.id), undefined);
    repository.setPublished(row.id, false);
    assert.equal(repository.findPublished(row.id, klass.id), undefined);
  }
});

describe('المعلم', () => {
  test('الحفظ يُنشئ صفّاً واحداً ثم يعدّله', () => {
    assert.equal(repos.teacher.get(), undefined);

    const created = repos.teacher.save({ name: 'أ. سارة العتيبي' });
    assert.equal(created.name, 'أ. سارة العتيبي');
    assert.equal(created.institution, null);

    const updated = repos.teacher.save({ name: 'أ. سارة العتيبي', institution: 'مدرسة النور' });
    assert.equal(updated.id, created.id, 'لا يُنشأ معلم ثانٍ');
    assert.equal(updated.institution, 'مدرسة النور');
    assert.equal(repos.teacher.get().id, created.id);
  });
});

describe('الإعدادات', () => {
  test('القيم الافتراضية تُعاد قبل أي كتابة', () => {
    assert.equal(repos.settings.get('language'), 'ar');
    assert.equal(repos.settings.getBoolean('studentAiMasterEnabled'), false);
    assert.equal(Object.keys(repos.settings.all()).length, SETTING_KEYS.length);
    assert.equal(repos.settings.get('activeAiProvider'), '');
  });

  test('الكتابة تُحفظ وتُقرأ', () => {
    repos.settings.set('launchOnSystemStart', 'true');
    assert.equal(repos.settings.getBoolean('launchOnSystemStart'), true);
    repos.settings.set('launchOnSystemStart', 'false');
    assert.equal(repos.settings.getBoolean('launchOnSystemStart'), false);
  });
});

describe('الفصول', () => {
  test('الأرشفة تُخفي من القائمة ولا تحذف', () => {
    const a = repos.classes.create({ name: 'الصف السادس — علوم' });
    repos.classes.create({ name: 'الصف الخامس — علوم' });

    assert.equal(repos.classes.list().length, 2);

    repos.classes.setArchived(a.id, true);
    assert.equal(repos.classes.list().length, 1, 'المؤرشف يخرج من الافتراضي');
    assert.equal(repos.classes.list({ includeArchived: true }).length, 2, 'ولا يُحذف');
    assert.ok(repos.classes.get(a.id).archivedAt, 'archivedAt مضبوط');

    repos.classes.setArchived(a.id, false);
    assert.equal(repos.classes.list().length, 2, 'يعود بإلغاء الأرشفة');
  });

  test('فصل غير موجود يرمي NotFoundError برسالة عربية', () => {
    assert.throws(
      () => repos.classes.get('لا-وجود-له'),
      (error) => {
        assert.ok(error instanceof NotFoundError);
        assert.match(error.message, /لم نعثر على الفصل/);
        return true;
      },
    );
  });
});

describe('الطلاب', () => {
  test('الإزالة علامة لا حذف — الصفّ يبقى', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const student = repos.students.add({ classId: cls.id, name: 'ريم عبدالله' });

    assert.equal(repos.students.listByClass(cls.id).length, 1);

    repos.students.remove(student.id);
    assert.equal(repos.students.listByClass(cls.id).length, 0, 'يخرج من القائمة');
    assert.equal(
      repos.students.listByClass(cls.id, { includeRemoved: true }).length,
      1,
      'لكنه لا يُحذف — إجاباته تبقى مفهومة',
    );
  });
});

describe('الدروس', () => {
  test('المسودة لا تظهر للطالب', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const draft = repos.lessons.create({ classId: cls.id, title: 'الكسور العشرية' });
    const published = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });
    repos.lessons.setPublished(published.id, true);

    const forStudent = repos.lessons.listPublished(cls.id);
    assert.equal(forStudent.length, 1);
    assert.equal(forStudent[0].title, 'دورة الماء');
    assert.ok(!forStudent.some((l) => l.id === draft.id), 'المسودة لا تُعاد إطلاقاً');

    assert.equal(repos.lessons.listByClass(cls.id).length, 2, 'والمعلم يرى الاثنين');
  });

  test('إلغاء النشر يمحو تاريخه', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });

    const on = repos.lessons.setPublished(lesson.id, true);
    assert.ok(on.publishedAt);

    const off = repos.lessons.setPublished(lesson.id, false);
    assert.equal(off.status, 'draft');
    assert.equal(off.publishedAt, null);
    assert.equal(repos.lessons.listPublished(cls.id).length, 0);
  });

  test('نسخة الدرس المنشور تبدأ مسودة ولا تصل الطلاب', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });
    const f = repos.files.register({
      name: 'ورقة عمل',
      kind: 'مستند PDF',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      storageName: 'dup-1',
    });
    repos.lessons.replaceAttachments(lesson.id, [f.id]);
    repos.lessons.setPublished(lesson.id, true);

    const copy = repos.lessons.duplicate(lesson.id);

    assert.equal(copy.status, 'draft', 'النسخة مسودة ولو كان الأصل منشوراً');
    assert.equal(copy.publishedAt, null);
    assert.match(copy.title, /نسخة/);
    // الأصل وحده يصل الطالب.
    assert.deepEqual(
      repos.lessons.listPublished(cls.id).map((row) => row.id),
      [lesson.id],
    );
    // نسخة بلا مرفقاتها ليست نسخة.
    assert.deepEqual(
      repos.lessons.listAttachments(copy.id).map((row) => row.id),
      [f.id],
    );
  });

  test('أعداد T12: المرفقات لكل درس على حدة', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const withFile = repos.lessons.create({ classId: cls.id, title: 'مع مرفق' });
    const without = repos.lessons.create({ classId: cls.id, title: 'بلا مرفق' });
    const f = repos.files.register({
      name: 'مخطط',
      kind: 'صورة',
      mimeType: 'image/png',
      sizeBytes: 512,
      storageName: 'stats-1',
    });
    repos.lessons.replaceAttachments(withFile.id, [f.id]);

    const stats = repos.lessons.stats(cls.id);
    assert.equal(stats.get(withFile.id).attachments, 1);
    assert.equal(stats.get(without.id).attachments, 0);
    assert.equal(stats.get(withFile.id).reads, 0);
  });
});

describe('طلبات الدخول', () => {
  test('القبول ينشئ الطالب ويربطه بالطلب في خطوة واحدة', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    repos.sessions.start(cls.id, 'token-1');
    const session = repos.sessions.active();
    const request = repos.sessions.createRequest({
      sessionId: session.id,
      name: 'ريم عبدالله المطيري',
      identifier: '٤٤٢١٠٧',
    });

    // قبل القبول: طلب معلّق بلا طالب — FR-005.
    assert.equal(request.status, 'pending');
    assert.equal(request.studentId, null);
    assert.equal(repos.students.listByClass(cls.id).length, 0);

    const { studentId } = repos.sessions.approveRequest(request.id);

    const students = repos.students.listByClass(cls.id);
    assert.equal(students.length, 1);
    assert.equal(students[0].id, studentId);
    assert.equal(students[0].name, 'ريم عبدالله المطيري');
    assert.equal(students[0].identifier, '٤٤٢١٠٧');
    assert.equal(repos.sessions.getRequest(request.id).status, 'approved');
    assert.equal(repos.sessions.getRequest(request.id).studentId, studentId);
  });

  test('الرفض لا ينشئ طالباً، والتراجع يعيد الطلب معلّقاً', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    repos.sessions.start(cls.id, 'token-2');
    const request = repos.sessions.createRequest({
      sessionId: repos.sessions.active().id,
      name: 'زائر',
    });

    repos.sessions.setRequestStatus(request.id, 'rejected');
    assert.equal(repos.students.listByClass(cls.id).length, 0);

    repos.sessions.setRequestStatus(request.id, 'pending');
    assert.equal(repos.sessions.getRequest(request.id).status, 'pending');
    assert.equal(repos.students.listByClass(cls.id).length, 0);
  });

  test('بدء حصة يُنهي التي قبلها — حصة واحدة مفتوحة لا أكثر', () => {
    const first = repos.classes.create({ name: 'الصف السادس — علوم' });
    const second = repos.classes.create({ name: 'الصف الخامس — علوم' });

    repos.sessions.start(first.id, 'token-3');
    repos.sessions.start(second.id, 'token-4');

    const active = repos.sessions.active();
    assert.equal(active.classId, second.id);
    assert.equal(repos.sessions.activeContext().className, 'الصف الخامس — علوم');
  });
});

describe('مزوّدو الذكاء الاصطناعي — SEC-005', () => {
  test('الجدول لا يقبل مفتاحاً أصلاً: لا عمود له', () => {
    const columns = handle.sqlite.prepare('PRAGMA table_info(ai_providers)').all();
    const names = columns.map((column) => column.name);

    assert.ok(names.includes('provider'), 'الجدول موجود');
    for (const forbidden of ['api_key', 'key', 'secret', 'token']) {
      assert.ok(!names.includes(forbidden), `عمود ممنوع: ${forbidden}`);
    }
  });

  test('الوحدات تبقى null حين لا يوفّرها المزوّد — لا صفراً', () => {
    repos.ai.recordUsage({ provider: 'anthropic', model: 'claude', tokens: null });
    repos.ai.recordUsage({ provider: 'anthropic', model: 'claude', tokens: null });

    const usage = repos.ai.usage('anthropic');
    assert.equal(usage.requests, 2, 'الطلبات نعدّها نحن فتُعرض دائماً');
    assert.equal(usage.tokens, null, 'الوحدات مجهولة لا صفر');
    assert.ok(usage.lastUsedAt instanceof Date);
  });

  test('نداء واحد يعيد وحدات يكفي لجمعها، ولا يُحسب من لم يعدها صفراً', () => {
    repos.ai.recordUsage({ provider: 'google', tokens: null });
    repos.ai.recordUsage({ provider: 'google', tokens: 120 });
    repos.ai.recordUsage({ provider: 'google', tokens: 80 });

    const usage = repos.ai.usage('google');
    assert.equal(usage.requests, 3);
    assert.equal(usage.tokens, 200);
  });

  test('مزوّد لم يُستعمل: لا طلبات ولا وحدات ولا وقت', () => {
    assert.deepEqual(repos.ai.usage('openai'), { requests: 0, tokens: null, lastUsedAt: null });
  });

  test('السجلّ لا يحمل نصّ الطلب ولا نتيجته', () => {
    repos.ai.recordUsage({ provider: 'openai', model: 'gpt-4o-mini', tokens: 10 });
    const columns = handle.sqlite.prepare('PRAGMA table_info(ai_usage)').all();
    const names = columns.map((column) => column.name);

    for (const forbidden of ['prompt', 'content', 'text', 'response', 'result']) {
      assert.ok(!names.includes(forbidden), `عمود ممنوع: ${forbidden}`);
    }
  });

  test('الربط يسجّل الحالة والنموذج، وحذف المفتاح يُبقي الصفّ', () => {
    repos.ai.upsert({ provider: 'openai', label: 'OpenAI', status: 'connected', defaultModel: 'gpt-4o-mini' });
    const connected = repos.ai.find('openai');
    assert.equal(connected.status, 'connected');
    assert.ok(connected.connectedAt);

    repos.ai.disconnect('openai');
    const after = repos.ai.find('openai');
    // الصفّ باقٍ بنموذجه: حذفه كان سيُنسي المعلم اختياره بلا سبب.
    assert.equal(after.status, 'disconnected');
    assert.equal(after.defaultModel, 'gpt-4o-mini');
    assert.equal(after.connectedAt, null);
  });
});

describe('الملفات', () => {
  test('«مستخدَم في» يعيد المواضع بأسمائها', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء في الطبيعة' });
    const f = file('ورقة عمل — دورة الماء', 'uuid-1');

    assert.deepEqual(repos.files.usage(f.id), []);

    repos.lessons.replaceAttachments(lesson.id, [f.id]);
    const usage = repos.files.usage(f.id);
    assert.equal(usage.length, 1);
    assert.equal(usage[0].kind, 'lesson');
    assert.equal(usage[0].title, 'دورة الماء في الطبيعة');
    assert.equal(usage[0].published, false);
  });

  test('حذف ملف مستخدَم يُرفض ويعيد مواضعه في الخطأ', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء في الطبيعة' });
    const f = file('ورقة عمل', 'uuid-2');
    repos.lessons.replaceAttachments(lesson.id, [f.id]);

    assert.throws(
      () => repos.files.remove(f.id),
      (error) => {
        assert.ok(error instanceof FileInUseError);
        assert.equal(error.usedBy.length, 1);
        assert.equal(error.usedBy[0].title, 'دورة الماء في الطبيعة');
        return true;
      },
    );

    assert.equal(repos.files.list().length, 1, 'الملف باقٍ بعد الرفض');
  });

  test('الحذف مع فكّ الارتباط ينجح ولا يترك مرجعاً معلّقاً', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });
    const f = file('ورقة عمل', 'uuid-3');
    repos.lessons.replaceAttachments(lesson.id, [f.id]);

    repos.files.removeWithLinks(f.id);

    assert.equal(repos.files.list().length, 0);
    assert.deepEqual(repos.lessons.listAttachments(lesson.id), []);
  });
});

describe('المعاملات — NFR-005', () => {
  test('فشل استبدال المرفقات يُرجع الحالة كما كانت', () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء' });
    const good = file('مخطط الدورة', 'uuid-4');

    repos.lessons.replaceAttachments(lesson.id, [good.id]);
    assert.equal(repos.lessons.listAttachments(lesson.id).length, 1);

    // الملف الثاني غير موجود: الإدراج يفشل بعد أن يكون الحذف قد نُفِّذ.
    assert.throws(
      () => repos.lessons.replaceAttachments(lesson.id, [good.id, 'ملف-غير-موجود']),
      /FOREIGN KEY/i,
    );

    const after = repos.lessons.listAttachments(lesson.id);
    assert.equal(after.length, 1, 'المعاملة تراجعت: الدرس لم يفقد مرفقه');
    assert.equal(after[0].id, good.id);
  });
});

describe('الأنشطة — FR-012', () => {
  const build = () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const lesson = repos.lessons.create({ classId: cls.id, title: 'دورة الماء في الطبيعة' });
    const activity = repos.activities.create({
      classId: cls.id,
      title: 'سؤال قصير: مراحل دورة الماء',
      lessonId: lesson.id,
    });
    return { cls, lesson, activity };
  };

  const choice = (id, correctAt) => ({
    id,
    type: 'choice',
    prompt: 'أيّ المراحل تأتي بعد التبخّر؟',
    points: 1,
    expectedAnswer: null,
    options: [
      { id: `${id}-a`, text: 'الجريان السطحي', isCorrect: correctAt === 0 },
      { id: `${id}-b`, text: 'التكاثف', isCorrect: correctAt === 1 },
    ],
  });

  test('النشاط يبدأ مسودة ومساعدته مطفأة — قرار D10', () => {
    const { activity } = build();
    assert.equal(activity.status, 'draft');
    assert.equal(activity.publishedAt, null);
    assert.equal(activity.studentAiEnabled, false, 'البوّابة الثالثة تبدأ مغلقة');
  });

  test('المسودة لا تصل الطالب — التصفية في الاستعلام', () => {
    const { cls, activity } = build();
    assert.equal(repos.activities.listPublished(cls.id).length, 0);

    repos.activities.setPublished(activity.id, true);
    assert.equal(repos.activities.listPublished(cls.id).length, 1);

    repos.activities.setPublished(activity.id, false);
    assert.equal(repos.activities.listPublished(cls.id).length, 0, 'إلغاء النشر يسحبه فوراً');
  });

  test('استبدال الأسئلة يحفظ الخيارات بترتيبها ومفتاحها', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1)]);

    const [stored] = repos.activities.questions(activity.id);
    assert.equal(stored.prompt, 'أيّ المراحل تأتي بعد التبخّر؟');
    assert.equal(stored.options.length, 2);
    assert.equal(stored.options[0].text, 'الجريان السطحي');
    assert.equal(stored.options[1].isCorrect, true);
  });

  /**
   * هذا هو ما يجعل التصحيح ممكناً بعد كل حفظ: المعرّف يبقى، فتبقى إجابة
   * الطالب مرتبطة بسؤالها. توليدُ معرّف جديد عند كل حفظ كان سيقطع الصلة صمتاً.
   */
  test('السؤال الذي لم يُمسّ يبقى معرّفه بعد الحفظ', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1), choice('q2', 0)]);
    repos.activities.replaceQuestions(activity.id, [
      { ...choice('q1', 1), prompt: 'نصّ معدّل' },
      choice('q2', 0),
    ]);

    const stored = repos.activities.questions(activity.id);
    assert.deepEqual(
      stored.map((question) => question.id),
      ['q1', 'q2'],
    );
    assert.equal(stored[0].prompt, 'نصّ معدّل');
  });

  test('السؤال المحذوف يذهب بخياراته', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1), choice('q2', 0)]);
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1)]);

    assert.equal(repos.activities.questions(activity.id).length, 1);
  });

  test('تبديل النوع إلى قصير يمحو الخيارات ولا يُبقيها معلّقة', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1)]);
    repos.activities.replaceQuestions(activity.id, [
      {
        id: 'q1',
        type: 'text',
        prompt: 'اذكر مرحلتين.',
        points: 2,
        expectedAnswer: 'التبخّر ثم التكاثف',
        options: [],
      },
    ]);

    const [stored] = repos.activities.questions(activity.id);
    assert.equal(stored.type, 'text');
    assert.deepEqual(stored.options, []);
    assert.equal(stored.expectedAnswer, 'التبخّر ثم التكاثف');
  });

  test('العدّ يفصل نوعَي الأسئلة — وعمود «النوع» يُبنى عليه', () => {
    const { cls, activity } = build();
    repos.activities.replaceQuestions(activity.id, [
      choice('q1', 1),
      { id: 'q2', type: 'text', prompt: 'س', points: 1, expectedAnswer: null, options: [] },
    ]);

    const tally = repos.activities.tally(cls.id).get(activity.id);
    assert.equal(tally.questions, 2);
    assert.equal(tally.choiceQuestions, 1);
    assert.equal(tally.textQuestions, 1);
  });

  test('المُخرَج من الفصل لا يُحتسب في مقام «من ٢١»', () => {
    const { cls } = build();
    const stay = repos.students.add({ classId: cls.id, name: 'سارة' });
    const gone = repos.students.add({ classId: cls.id, name: 'ريان' });
    assert.equal(repos.activities.rosterSize(cls.id), 2);

    repos.students.remove(gone.id);
    assert.equal(repos.activities.rosterSize(cls.id), 1, 'المُخرَج لا يُنتظر منه تسليم');
    assert.ok(stay.id);
  });

  test('حذف النشاط يذهب بأسئلته وخياراتها — لا صفوف يتيمة', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1)]);
    repos.activities.remove(activity.id);

    assert.equal(handle.db.$client.prepare('SELECT COUNT(*) AS n FROM questions').get().n, 0);
    assert.equal(handle.db.$client.prepare('SELECT COUNT(*) AS n FROM question_options').get().n, 0);
  });

  test('فشل استبدال الأسئلة يُرجع الحالة كما كانت — NFR-005', () => {
    const { activity } = build();
    repos.activities.replaceQuestions(activity.id, [choice('q1', 1)]);

    // خيارٌ بمعرّف مكرَّر داخل نفس الدفعة: الإدراج يفشل بعد أن يكون الحذف نُفِّذ.
    assert.throws(() =>
      repos.activities.replaceQuestions(activity.id, [
        choice('q1', 1),
        { ...choice('q2', 0), options: [{ id: 'q1-a', text: 'مكرَّر', isCorrect: true }] },
      ]),
    );

    const after = repos.activities.questions(activity.id);
    assert.equal(after.length, 1, 'المعاملة تراجعت: النشاط لم يفقد أسئلته');
    assert.equal(after[0].id, 'q1');
  });
});

describe('إجابات الطلاب — FR-013', () => {
  const build = () => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const student = repos.students.add({ classId: cls.id, name: 'سارة' });
    const activity = repos.activities.create({ classId: cls.id, title: 'اختبار قصير' });
    repos.activities.replaceQuestions(activity.id, [
      {
        id: 'q1',
        type: 'choice',
        prompt: 'أيّ المراحل تأتي بعد التبخّر؟',
        points: 1,
        expectedAnswer: null,
        options: [
          { id: 'q1-a', text: 'الجريان', isCorrect: false },
          { id: 'q1-b', text: 'التكاثف', isCorrect: true },
        ],
      },
      { id: 'q2', type: 'text', prompt: 'اذكر مرحلتين.', points: 2, expectedAnswer: null, options: [] },
    ]);
    return { cls, student, activity };
  };

  const answers = [
    { type: 'choice', questionId: 'q1', optionId: 'q1-b' },
    { type: 'text', questionId: 'q2', text: 'التبخّر ثم التكاثف' },
  ];

  test('الإرسال يحفظ التسليم وإجاباته معاً', () => {
    const { student, activity } = build();
    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers,
    });

    assert.equal(result.status, 'created');
    assert.equal(result.answered, 2);
    assert.equal(result.total, 2);
    assert.ok(result.submission.submittedAt instanceof Date, 'ختم الوقت يُكتب عند الحفظ');
    assert.equal(result.submission.status, 'submitted');
    assert.equal(repos.submissions.answersFor(result.submission.id).length, 2);
  });

  /**
   * الزرّ المعطَّل يمنع الضغطة المزدوجة ولا يمنع تبويباً ثانياً ولا صفحةً
   * أُعيد تحميلها — والقيد في المخطط يمنعهما.
   */
  test('الإرسال الثاني يعيد الإيصال الأول ولا يُنشئ تسليماً ثانياً', () => {
    const { student, activity } = build();
    const first = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers,
    });
    const second = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q2', text: 'إجابة أخرى تماماً' }],
    });

    assert.equal(second.status, 'duplicate');
    assert.equal(second.submission.id, first.submission.id);
    assert.deepEqual(second.submission.submittedAt, first.submission.submittedAt, 'الوقت الأول يبقى');
    assert.equal(repos.submissions.listByActivity(activity.id).length, 1);
  });

  test('الإجابة الأولى لا تُستبدل بإرسال ثانٍ — عليها بنى المعلم تصحيحه', () => {
    const { student, activity } = build();
    const first = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers,
    });
    repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q2', text: 'إجابة أخرى تماماً' }],
    });

    const stored = repos.submissions.answersFor(first.submission.id);
    assert.equal(stored.length, 2);
    assert.equal(
      stored.find((row) => row.questionId === 'q2').text,
      'التبخّر ثم التكاثف',
    );
  });

  test('طالبان مختلفان يسلّمان النشاط نفسه — القيد على الاثنين معاً', () => {
    const { cls, student, activity } = build();
    const other = repos.students.add({ classId: cls.id, name: 'ريان' });

    repos.submissions.submit({ activityId: activity.id, studentId: student.id, answers });
    const second = repos.submissions.submit({
      activityId: activity.id,
      studentId: other.id,
      answers,
    });

    assert.equal(second.status, 'created');
    assert.equal(repos.submissions.listByActivity(activity.id).length, 2);
  });

  /**
   * المفاتيح الأجنبية وحدها تقبل خيار سؤالٍ في نشاط آخر: كلاهما صفّ موجود.
   * الفحص هنا هو ما يمنع إجابةً لا معنى لها من الوصول إلى جدول التصحيح.
   */
  test('خيار من نشاط آخر يُرفض ولا يُحفظ', () => {
    const { cls, student, activity } = build();
    const other = repos.activities.create({ classId: cls.id, title: 'نشاط آخر' });
    repos.activities.replaceQuestions(other.id, [
      {
        id: 'x1',
        type: 'choice',
        prompt: 'سؤال آخر',
        points: 1,
        expectedAnswer: null,
        options: [
          { id: 'x1-a', text: 'أ', isCorrect: true },
          { id: 'x1-b', text: 'ب', isCorrect: false },
        ],
      },
    ]);

    assert.throws(
      () =>
        repos.submissions.submit({
          activityId: activity.id,
          studentId: student.id,
          answers: [{ type: 'choice', questionId: 'q1', optionId: 'x1-a' }],
        }),
      InvalidAnswerError,
    );
    assert.equal(repos.submissions.listByActivity(activity.id).length, 0);
  });

  test('سؤال ليس في هذا النشاط يُرفض', () => {
    const { student, activity } = build();
    assert.throws(
      () =>
        repos.submissions.submit({
          activityId: activity.id,
          studentId: student.id,
          answers: [{ type: 'text', questionId: 'سؤال-مخترَع', text: 'إجابة' }],
        }),
      InvalidAnswerError,
    );
  });

  test('الأنشطة المسلَّمة تُقرأ دفعةً واحدة — علامة «أُرسلت» في S04', () => {
    const { cls, student, activity } = build();
    const untouched = repos.activities.create({ classId: cls.id, title: 'لم يُسلَّم' });

    repos.submissions.submit({ activityId: activity.id, studentId: student.id, answers });
    const map = repos.submissions.submittedBy(student.id, [activity.id, untouched.id]);

    assert.ok(map.get(activity.id) instanceof Date);
    assert.equal(map.has(untouched.id), false);
  });

  test('حذف النشاط يذهب بتسليماته وإجاباتها — لا صفوف يتيمة', () => {
    const { student, activity } = build();
    repos.submissions.submit({ activityId: activity.id, studentId: student.id, answers });
    repos.activities.remove(activity.id);

    assert.equal(handle.sqlite.prepare('SELECT COUNT(*) AS n FROM submissions').get().n, 0);
    assert.equal(handle.sqlite.prepare('SELECT COUNT(*) AS n FROM answers').get().n, 0);
  });
});

describe('المراجعة والتصحيح — T17', () => {
  const choiceQuestion = (id, correctId) => ({
    id,
    type: 'choice',
    prompt: `سؤال ${id}`,
    points: 1,
    expectedAnswer: null,
    options: [
      { id: `${id}-a`, text: 'أ', isCorrect: correctId === 'a' },
      { id: `${id}-b`, text: 'ب', isCorrect: correctId === 'b' },
    ],
  });

  const build = (questions) => {
    const cls = repos.classes.create({ name: 'الصف السادس — علوم' });
    const student = repos.students.add({ classId: cls.id, name: 'سارة' });
    const activity = repos.activities.create({ classId: cls.id, title: 'نشاط' });
    repos.activities.replaceQuestions(activity.id, questions);
    return { cls, student, activity };
  };

  /* ── التصحيح الآليّ ────────────────────────────── */

  test('نشاط كلّه اختيار يُصحَّح آلياً — «صُحّحت تلقائياً» في T15', () => {
    const { student, activity } = build([choiceQuestion('q1', 'b'), choiceQuestion('q2', 'a')]);

    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [
        { type: 'choice', questionId: 'q1', optionId: 'q1-b' },
        { type: 'choice', questionId: 'q2', optionId: 'q2-a' },
      ],
    });

    assert.equal(result.submission.status, 'reviewed');
    assert.equal(result.submission.score, 5, 'إجابتان صحيحتان من اثنتين = ٥/٥');
    assert.ok(result.submission.reviewedAt instanceof Date);
    assert.equal(result.submission.comment, null, 'الآلة تعطي رقماً ولا تكتب باسم المعلم');
  });

  test('النسبة تُقرَّب إلى درجة من ٥ — قرار D5', () => {
    const { student, activity } = build([choiceQuestion('q1', 'b'), choiceQuestion('q2', 'a')]);

    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [
        { type: 'choice', questionId: 'q1', optionId: 'q1-b' },
        { type: 'choice', questionId: 'q2', optionId: 'q2-b' },
      ],
    });

    assert.equal(result.submission.score, 3, 'واحدة من اثنتين تُقرَّب إلى ٣');
  });

  test('كلّها خطأ تعطي صفراً — والصفر لا تعرضه لوحة المعلم', () => {
    const { student, activity } = build([choiceQuestion('q1', 'b')]);
    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'choice', questionId: 'q1', optionId: 'q1-a' }],
    });

    assert.equal(result.submission.score, 0);
    assert.equal(result.submission.status, 'reviewed');
  });

  /**
   * القاعدة التي تحمي الطالب: لا يُختم تسليمٌ «صُحّح» وفيه فقرة لم يقرأها أحد.
   */
  test('سؤال نصّيّ واحد يُبقي النشاط كلّه بانتظار المعلم', () => {
    const { student, activity } = build([
      choiceQuestion('q1', 'b'),
      { id: 'q2', type: 'text', prompt: 'اشرح', points: 1, expectedAnswer: null, options: [] },
    ]);

    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [
        { type: 'choice', questionId: 'q1', optionId: 'q1-b' },
        { type: 'text', questionId: 'q2', text: 'شرح الطالب' },
      ],
    });

    assert.equal(result.submission.status, 'submitted');
    assert.equal(result.submission.score, null);
    assert.equal(result.submission.reviewedAt, null);
  });

  test('السؤال المتروك يُحتسب خطأً في التصحيح الآليّ — لا يُتجاهل', () => {
    const { student, activity } = build([choiceQuestion('q1', 'b'), choiceQuestion('q2', 'a')]);

    const result = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'choice', questionId: 'q1', optionId: 'q1-b' }],
    });

    assert.equal(result.submission.score, 3, 'صحيحة من سؤالين لا من سؤال واحد');
  });

  /* ── التصحيح اليدوي ────────────────────────────── */

  test('الحفظ يكتب الدرجة والتعليق ويختم وقت المراجعة', () => {
    const { student, activity } = build([
      { id: 'q1', type: 'text', prompt: 'اشرح', points: 1, expectedAnswer: 'التكاثف', options: [] },
    ]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q1', text: 'يتحول البخار إلى قطرات' }],
    });

    const reviewed = repos.submissions.review(submitted.submission.id, {
      score: 4,
      comment: 'شرح واضح.',
    });

    assert.equal(reviewed.status, 'reviewed');
    assert.equal(reviewed.score, 4);
    assert.equal(reviewed.comment, 'شرح واضح.');
    assert.ok(reviewed.reviewedAt instanceof Date, 'المعلم يترك المراجعة ويعود فيعرف أين وقف');
  });

  test('المراجعة لا تمسّ إجابة الطالب', () => {
    const { student, activity } = build([
      { id: 'q1', type: 'text', prompt: 'اشرح', points: 1, expectedAnswer: null, options: [] },
    ]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q1', text: 'نصّ الطالب' }],
    });

    repos.submissions.review(submitted.submission.id, { score: 3, comment: null });
    const stored = repos.submissions.answersFor(submitted.submission.id);
    assert.equal(stored[0].text, 'نصّ الطالب');
  });

  /* ── ورقة المراجعة ─────────────────────────────── */

  test('التفصيل يعيد الخيار بنصّه وبصوابه — المعلم يصحّح لا يفكّ معرّفات', () => {
    const { student, activity } = build([choiceQuestion('q1', 'b')]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'choice', questionId: 'q1', optionId: 'q1-a' }],
    });

    const detail = repos.submissions.detail(submitted.submission.id);
    assert.equal(detail.studentName, 'سارة');
    assert.equal(detail.answers[0].studentAnswer, 'أ');
    assert.equal(detail.answers[0].correct, false);
  });

  test('السؤال النصّيّ بلا حكم آليّ — correct عنده null لا false', () => {
    const { student, activity } = build([
      { id: 'q1', type: 'text', prompt: 'اشرح', points: 1, expectedAnswer: 'مرجع', options: [] },
    ]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'text', questionId: 'q1', text: 'إجابة' }],
    });

    const detail = repos.submissions.detail(submitted.submission.id);
    assert.equal(detail.answers[0].correct, null, 'وإلا لُوّنت كل إجابة نصّية خطأً قبل أن تُقرأ');
    assert.equal(detail.answers[0].expectedAnswer, 'مرجع');
  });

  test('السؤال المتروك يُعرض على المعلم بإجابة فارغة — «لم يجب» معلومة', () => {
    const { student, activity } = build([
      choiceQuestion('q1', 'b'),
      { id: 'q2', type: 'text', prompt: 'اشرح', points: 1, expectedAnswer: null, options: [] },
    ]);
    const submitted = repos.submissions.submit({
      activityId: activity.id,
      studentId: student.id,
      answers: [{ type: 'choice', questionId: 'q1', optionId: 'q1-b' }],
    });

    const detail = repos.submissions.detail(submitted.submission.id);
    assert.equal(detail.answers.length, 2, 'السؤالان معاً لا المُجاب وحده');
    assert.equal(detail.answers[1].studentAnswer, '');
  });
});

/*
 * حصر المسح بدروس الفصل — لا ترشيح في JavaScript بعد قراءة الجدول كاملاً.
 *
 * `lesson_reads` ينمو حاصلَ ضرب الطلاب في الدروس، و`stats` تُنادى في مسار
 * الطالب مرةً لكل فتح صفحة. فما يُفحص هنا أن أثر فصلٍ آخر **لا يُقرأ أصلاً**،
 * لا أنه يُقرأ ثم يُسقَط — والفرق بينهما هو الفرق بين مسحٍ كامل ومسحٍ مفهرس.
 */
describe('إحصاء الدروس محصورٌ بفصله', () => {
  test('أثر القراءة في فصل آخر لا يظهر ولا يُحسب', () => {
    const here = repos.classes.create({ name: 'الصف السادس' });
    const there = repos.classes.create({ name: 'الصف الخامس' });

    const mine = repos.lessons.create({ classId: here.id, title: 'دورة الماء' });
    const other = repos.lessons.create({ classId: there.id, title: 'الكسور' });

    const a = repos.students.add({ classId: here.id, name: 'ريم' });
    const b = repos.students.add({ classId: there.id, name: 'سارة' });

    repos.lessons.markRead(mine.id, a.id);
    repos.lessons.markRead(other.id, b.id);

    const stats = repos.lessons.stats(here.id);
    assert.equal(stats.size, 1, 'دروس الفصل وحدها');
    assert.equal(stats.get(mine.id).reads, 1);
    assert.equal(stats.get(other.id), undefined, 'درس فصل آخر لا يظهر');
  });

  test('وفصلٌ بلا دروس لا يقرأ جدولاً أصلاً', () => {
    const empty = repos.classes.create({ name: 'فصل جديد' });
    assert.equal(repos.lessons.stats(empty.id).size, 0);
  });
});
