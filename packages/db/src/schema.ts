import { sql } from 'drizzle-orm';
import type { LearningMaterial, LearningResponse, LearningFeedback, AgentProfile, AgentRunInput, AgentRun } from '@cubecroom/contracts';
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * مخطط قاعدة البيانات المحلية — ملف SQLite واحد داخل مجلد بيانات التطبيق.
 *
 * المرجع: PRD §10 (المتطلبات الوظيفية) و §16 (التخزين)، والشاشات في
 * docs/design/screens.index.json.
 *
 * قواعد عامة:
 *   • المعرّفات نصّية (UUID) لا أرقاماً متسلسلة — أسلم عند الاستعادة والدمج.
 *   • الأوقات epoch بالمللي ثانية — تُرتَّب وتُقارَن بلا اعتماد على منطقة زمنية.
 *   • لا مفتاح BYOK هنا إطلاقاً (SEC-005): safeStorage يحفظه خارج القاعدة.
 */

const id = () => text('id').primaryKey();
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);
const updatedAt = () =>
  integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

export const learningExperiences = sqliteTable('learning_experiences', {
  id: id(), classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  lessonId: text('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
  version: integer('version').notNull(), published: integer('published', { mode: 'boolean' }).notNull().default(false),
  material: text('material', { mode: 'json' }).$type<LearningMaterial>().notNull(), updatedAt: updatedAt(),
}, t => [index('learning_class_idx').on(t.classId)]);
export const learningVersions = sqliteTable('learning_versions', {
  id: id(), experienceId: text('experience_id').notNull().references(() => learningExperiences.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(), material: text('material', { mode: 'json' }).$type<LearningMaterial>().notNull(),
}, t => [unique('learning_version_unique').on(t.experienceId, t.version)]);
export const practiceSessions = sqliteTable('practice_sessions', {
  id: id(), experienceId: text('experience_id').notNull().references(() => learningExperiences.id, { onDelete: 'cascade' }),
  studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(), completed: integer('completed', { mode: 'boolean' }).notNull().default(false), createdAt: createdAt(),
}, t => [index('practice_student_experience').on(t.studentId, t.experienceId)]);
export const practiceAttempts = sqliteTable('practice_attempts', {
  id: id(), sessionId: text('session_id').notNull().references(() => practiceSessions.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull(), response: text('response', { mode: 'json' }).$type<LearningResponse>().notNull(),
  feedback: text('feedback', { mode: 'json' }).$type<LearningFeedback>().notNull(), createdAt: createdAt(),
}, t => [unique('practice_session_item').on(t.sessionId, t.itemId)]);
export const agentProfiles = sqliteTable('agent_profiles', {
  id: id(), profile: text('profile', { mode: 'json' }).$type<AgentProfile>().notNull(),
});
export const agentMemories = sqliteTable('agent_memories', {
  id: id(), agentId: text('agent_id').notNull(), classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  content: text('content').notNull(), source: text('source').notNull(), updatedAt: updatedAt(),
}, t => [index('agent_memory_scope').on(t.classId, t.agentId)]);
export const agentRuns = sqliteTable('agent_runs', {
  id: id(), classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  input: text('input', { mode: 'json' }).$type<AgentRunInput>().notNull(),
  status: text('status').$type<AgentRun['status']>().notNull(), result: text('result').notNull().default(''),
  events: text('events', { mode: 'json' }).$type<AgentRun['events']>().notNull(), updatedAt: updatedAt(),
}, t => [index('agent_run_scope').on(t.classId, t.status)]);
export const agentEffects = sqliteTable('agent_effects', {
  id: id(), runId: text('run_id').notNull().references(() => agentRuns.id, { onDelete: 'cascade' }),
  result: text('result', { mode: 'json' }).$type<unknown>().notNull(),
});

/* ── المعلم والإعدادات ───────────────────────────────── */

/** صفّ واحد فقط — التطبيق لمعلم واحد على جهازه (PRD §4.1). */
export const teacher = sqliteTable('teacher', {
  id: id(),
  name: text('name').notNull(),
  institution: text('institution'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** إعدادات T22 — مفتاح/قيمة حتى لا يفرض كل إعداد جديد ترحيلاً. */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: updatedAt(),
});

/* ── الفصول والطلاب ─────────────────────────────────── */

export const classes = sqliteTable(
  'classes',
  {
    id: id(),
    name: text('name').notNull(),
    subject: text('subject'),
    level: text('level'),
    description: text('description'),
    /** FR-003: «إنشاء/تعديل/أرشفة». الأرشفة ليست حذفاً — الصفّ يبقى. */
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
    /** PRD §23: AI للطالب يحتاج تفعيلاً صريحاً لكل فصل. */
    studentAiEnabled: integer('student_ai_enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('classes_archived_idx').on(t.archivedAt)],
);

/**
 * الطالب المقبول في فصل. «مقبول» حالة دائمة تبقى بين الحصص —
 * و«متصل الآن» حالة لحظية تُشتق من student_sessions لا تُخزَّن هنا (T11).
 */
export const students = sqliteTable(
  'students',
  {
    id: id(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    identifier: text('identifier'),
    approvedAt: integer('approved_at', { mode: 'timestamp_ms' }).notNull(),
    /** إزالة من الفصل — لا حذف صفّ، حتى تبقى إجاباته السابقة مفهومة. */
    removedAt: integer('removed_at', { mode: 'timestamp_ms' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('students_class_idx').on(t.classId)],
);

/* ── الجلسات ودخول الطلاب ───────────────────────────── */

/** حصة واحدة: تشغيل دخول الطلاب حتى إنهائه (FR-004 · §9). */
export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    inviteToken: text('invite_token').notNull().unique(),
    /**
     * رمز الحصة القصير — §22.
     *
     * ستّ خانات يكتبها المعلم على السبورة ويكتبها الطالب. حارسٌ يمنع طلبات
     * من أجهزة على الشبكة لم ترَ السبورة، ولا يُغني عن موافقة المعلم.
     *
     * ويقبل `null`: حصصٌ بُدئت قبل هذا الترحيل لا رمز لها، والقراءة تتعامل
     * مع غيابه بأن تتخطّى الفحص لا بأن تُسقط الحصة.
     */
    joinCode: text('join_code'),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_class_idx').on(t.classId), index('sessions_ended_idx').on(t.endedAt)],
);

/**
 * طلب دخول — FR-005: «الطلب لا يمنح وصولاً تلقائياً».
 * يبقى pending حتى يبتّ المعلم، ولا يُنشئ عضوية إلا عند القبول.
 */
export const joinRequests = sqliteTable(
  'join_requests',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    identifier: text('identifier'),
    /** pending · approved · rejected · expired */
    status: text('status').notNull().default('pending'),
    /** يُملأ عند القبول فقط. */
    studentId: text('student_id').references(() => students.id, { onDelete: 'set null' }),
    decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('join_requests_session_idx').on(t.sessionId),
    index('join_requests_status_idx').on(t.status),
  ],
);

/**
 * جلسة وصول الطالب — SEC-007: «tokens عشوائية قوية وقابلة للإبطال».
 * يُخزَّن الهاش لا الرمز نفسه: تسريب القاعدة لا يمنح دخولاً.
 */
export const studentSessions = sqliteTable(
  'student_sessions',
  {
    id: id(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    issuedAt: integer('issued_at', { mode: 'timestamp_ms' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
    lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('student_sessions_session_idx').on(t.sessionId),
    index('student_sessions_student_idx').on(t.studentId),
  ],
);

/* ── الملفات والدروس ────────────────────────────────── */

/** بيانات المرفق؛ الملف نفسه على القرص باسم storageName (SEC-006). */
export const files = sqliteTable('files', {
  id: id(),
  name: text('name').notNull(),
  /** نوع مقروء للإنسان: «مستند PDF» · «صورة» · «مقطع فيديو». */
  kind: text('kind').notNull(),
  mimeType: text('mime_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  storageName: text('storage_name').notNull().unique(),
  sha256: text('sha256'),
  createdAt: createdAt(),
});

export const lessons = sqliteTable(
  'lessons',
  {
    id: id(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** كتل المحتوى JSON — لا HTML خام (انظر lessonDetailSchema في contracts). */
    blocks: text('blocks', { mode: 'json' }).notNull().default(sql`'[]'`),
    /** draft · published — FR-009: لا يرى الطالب إلا published. */
    status: text('status').notNull().default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('lessons_class_status_idx').on(t.classId, t.status)],
);

export const lessonFiles = sqliteTable(
  'lesson_files',
  {
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [unique('lesson_files_pk').on(t.lessonId, t.fileId)],
);

/** «قرأه الطلاب» في T12 و«مقروء» في S05 — أثر قراءة لا أكثر. */
export const lessonReads = sqliteTable(
  'lesson_reads',
  {
    lessonId: text('lesson_id')
      .notNull()
      .references(() => lessons.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [unique('lesson_reads_pk').on(t.lessonId, t.studentId)],
);

/* ── الأنشطة والإجابات ──────────────────────────────── */

export const activities = sqliteTable(
  'activities',
  {
    id: id(),
    classId: text('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    lessonId: text('lesson_id').references(() => lessons.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    status: text('status').notNull().default('draft'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    /** PRD §23: التفعيل صريح لكل نشاط أيضاً، لا للفصل وحده. */
    studentAiEnabled: integer('student_ai_enabled', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('activities_class_status_idx').on(t.classId, t.status)],
);

/** Private preparation and one reversible agent revision; never part of student lesson blocks. */
export const lessonWorkspaces = sqliteTable('lesson_workspaces', {
  lessonId: text('lesson_id').primaryKey().references(() => lessons.id, { onDelete: 'cascade' }),
  preparation: text('preparation', { mode: 'json' }).notNull(),
  activityId: text('activity_id').references(() => activities.id, { onDelete: 'set null' }),
  undoToken: text('undo_token'),
  undoSnapshot: text('undo_snapshot', { mode: 'json' }),
  appliedFingerprint: text('applied_fingerprint'),
});

/**
 * مرفقات النشاط.
 *
 * أُضيف بعد مراجعة لوح `T18DeleteWarn`: التحذير يعدّد مواضع استعمال الملف
 * باسمها — درساً **ونشاطاً**. بلا هذا الجدول يستحيل تنفيذ التحذير كما صُمِّم.
 */
export const activityFiles = sqliteTable(
  'activity_files',
  {
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'restrict' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [unique('activity_files_pk').on(t.activityId, t.fileId)],
);

export const questions = sqliteTable(
  'questions',
  {
    id: id(),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    /** choice · text — نوع السؤال لا نوع النشاط: كل سؤال قد يختلف (T16). */
    type: text('type').notNull(),
    prompt: text('prompt').notNull(),
    /** «الإجابة المتوقَّعة» في T17Review — للمقارنة عند التصحيح اليدوي. */
    expectedAnswer: text('expected_answer'),
    points: integer('points').notNull().default(1),
  },
  (t) => [index('questions_activity_idx').on(t.activityId)],
);

export const questionOptions = sqliteTable(
  'question_options',
  {
    id: id(),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    text: text('text').notNull(),
    /** مفتاح الإجابة — لا يُرسل إلى الطالب أبداً (معاينة T16 تخفيه). */
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('question_options_question_idx').on(t.questionId)],
);

export const submissions = sqliteTable(
  'submissions',
  {
    id: id(),
    activityId: text('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    studentId: text('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
    /** submitted · reviewed */
    status: text('status').notNull().default('submitted'),
    /** الدرجة رقمية من ٥ — قرار D5. */
    score: integer('score'),
    comment: text('comment'),
    reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    // «يمنع submit المكرر غير المقصود» (S08) — يُفرض هنا لا في الواجهة وحدها.
    unique('submissions_activity_student').on(t.activityId, t.studentId),
    index('submissions_status_idx').on(t.status),
  ],
);

export const answers = sqliteTable(
  'answers',
  {
    id: id(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => submissions.id, { onDelete: 'cascade' }),
    questionId: text('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    optionId: text('option_id').references(() => questionOptions.id, { onDelete: 'set null' }),
    text: text('text'),
  },
  (t) => [unique('answers_submission_question').on(t.submissionId, t.questionId)],
);

/* ── الذكاء الاصطناعي ───────────────────────────────── */

/**
 * بيانات المزوّد فقط — «SQLite يحتفظ فقط ببيانات المزود والاسم والحالة»
 * (PRD §11). المفتاح نفسه في safeStorage خارج القاعدة (SEC-005).
 */
export const aiProviders = sqliteTable('ai_providers', {
  id: id(),
  /** openai · anthropic · google — PRD §11 لمرحلة MVP. */
  provider: text('provider').notNull().unique(),
  label: text('label').notNull(),
  defaultModel: text('default_model'),
  /** connected · error · disconnected */
  status: text('status').notNull().default('disconnected'),
  connectedAt: integer('connected_at', { mode: 'timestamp_ms' }),
  lastCheckedAt: integer('last_checked_at', { mode: 'timestamp_ms' }),
});

/** US-T13: «عرض provider/model/requests/tokens إن توفرت». */
export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: id(),
    provider: text('provider').notNull(),
    model: text('model'),
    requests: integer('requests').notNull().default(0),
    tokens: integer('tokens'),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('ai_usage_occurred_idx').on(t.occurredAt)],
);

/* ── سجلّ الأحداث الحسّاسة ──────────────────────────── */

/** SEC-009: «Audit log للأحداث الحساسة محلياً». */
export const auditLog = sqliteTable(
  'audit_log',
  {
    id: id(),
    event: text('event').notNull(),
    detail: text('detail', { mode: 'json' }),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('audit_log_occurred_idx').on(t.occurredAt)],
);
