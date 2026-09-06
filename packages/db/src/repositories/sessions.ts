import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Db, OpenResult } from '../open.js';
import { classes, joinRequests, sessions, studentSessions, students, teacher } from '../schema.js';
import { newId, now } from '../ids.js';
import { NotFoundError } from '../errors.js';

export type Session = typeof sessions.$inferSelect;
export type JoinRequest = typeof joinRequests.$inferSelect;
export type StudentSession = typeof studentSessions.$inferSelect;
export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'expired';

/** ما تحتاجه شاشة الطالب في ترويسة S01 — اسم الفصل واسم معلمه. */
export type SessionContext = {
  readonly session: Session;
  readonly className: string;
  readonly teacherName: string;
};

/**
 * الحصص وطلبات الدخول — FR-004 و FR-005.
 *
 * حصة واحدة نشطة على الجهاز في كل وقت: خادم الطلاب عملية واحدة ورابط واحد،
 * فحصّتان مفتوحتان تعنيان طالباً يدخل فصلاً غير الذي دُعي إليه.
 *
 * والطلب **لا يمنح وصولاً** (FR-005): يُسجَّل `pending` ولا يُنشئ عضوية ولا
 * رمز جلسة. إصدار الرموز عند القبول يأتي في P2-5.
 */
export function sessionsRepository(db: Db, transaction: OpenResult['transaction']) {
  const activeRow = (): Session | undefined =>
    db
      .select()
      .from(sessions)
      .where(isNull(sessions.endedAt))
      .orderBy(desc(sessions.startedAt))
      .get();

  return {
    active: activeRow,

    isStudentActive(sessionId: string, studentId: string): boolean {
      return db.select({ id: studentSessions.id }).from(studentSessions)
        .innerJoin(sessions, eq(sessions.id, studentSessions.sessionId))
        .where(and(
          eq(studentSessions.sessionId, sessionId), eq(studentSessions.studentId, studentId),
          isNull(studentSessions.revokedAt), isNull(sessions.endedAt),
        )).get() !== undefined;
    },

    /** الحصة النشطة مع اسم فصلها ومعلمها — نداء واحد لبوابة الطالب. */
    activeContext(): SessionContext | undefined {
      const session = activeRow();
      if (!session) return undefined;

      const klass = db.select().from(classes).where(eq(classes.id, session.classId)).get();
      const owner = db.select().from(teacher).get();
      if (!klass) return undefined;

      return {
        session,
        className: klass.name,
        teacherName: owner?.name ?? '',
      };
    },

    /**
     * يبدأ حصة لفصل، ويُنهي أي حصة أخرى مفتوحة في المعاملة نفسها.
     * الإنهاء قبل البدء لا بعده: لحظةٌ بحصّتين مفتوحتين تكفي ليقرأ خادم
     * الطلاب الحصة الخطأ.
     */
    /**
     * بدء حصة — ومعها رمزها القصير.
     *
     * الرمز يُولَّد هنا لا في الواجهة: هو حارسٌ يُقارَن به، ومصدرُه يجب أن
     * يكون واحداً مع مصدر الحصة نفسها.
     */
    start(classId: string, inviteToken: string, joinCode: string | null = null): Session {
      const timestamp = now();
      const row: Session = {
        id: newId(),
        classId,
        inviteToken,
        joinCode,
        startedAt: timestamp,
        endedAt: null,
        createdAt: timestamp,
      };

      transaction(() => {
        db.update(sessions).set({ endedAt: timestamp }).where(isNull(sessions.endedAt)).run();
        db.insert(sessions).values(row).run();
      });

      return row;
    },

    /**
     * «إنهاء دخول الطلاب» — SEC-007.
     *
     * الحصة تُغلق ولا تُحذف: أثرها جزء من تاريخ الفصل. وجلسات الطلاب تُبطَل
     * **في المعاملة نفسها**: حصة منتهية ورموز حيّة تعني طالباً يواصل القراءة
     * بعد أن ظنّ معلمه أنه أغلق الباب. الإبطال هنا لا في القشرة، فلا ينساه
     * مسار آخر يُنهي الحصة.
     */
    endActive(): void {
      const timestamp = now();
      transaction(() => {
        const open = db.select().from(sessions).where(isNull(sessions.endedAt)).all();
        for (const row of open) {
          db.update(studentSessions)
            .set({ revokedAt: timestamp })
            .where(
              and(eq(studentSessions.sessionId, row.id), isNull(studentSessions.revokedAt)),
            )
            .run();
        }
        db.update(sessions).set({ endedAt: timestamp }).where(isNull(sessions.endedAt)).run();
      });
    },

    /**
     * يُصدر رمز دخول لطالب مقبول — مرة واحدة.
     *
     * لا يُخزَّن الرمز بل هاشه، والنصّ يُعاد للنداء الذي أصدره ثم يُنسى.
     * ولو نودي ثانيةً لطالب له رمز حيّ يُعاد `null`: إصدار رمز جديد يُخرج
     * الجهاز الأول بلا أن يفهم الطالب لماذا.
     */
    issueStudentSession(
      sessionId: string,
      studentId: string,
      tokenHash: string,
    ): StudentSession | null {
      const existing = db
        .select()
        .from(studentSessions)
        .where(
          and(
            eq(studentSessions.sessionId, sessionId),
            eq(studentSessions.studentId, studentId),
            isNull(studentSessions.revokedAt),
          ),
        )
        .get();
      if (existing) return null;

      const row: StudentSession = {
        id: newId(),
        sessionId,
        studentId,
        tokenHash,
        issuedAt: now(),
        revokedAt: null,
        lastSeenAt: null,
      };
      db.insert(studentSessions).values(row).run();
      return row;
    },

    /**
     * يجد الطالب صاحب الرمز — إن كان رمزه حيّاً وحصّته مفتوحة.
     *
     * الشرطان معاً في الاستعلام لا في الشيفرة: حصة انتهت ورمزٌ لم يُبطَل
     * بعدُ لسبب ما يجب ألّا يفتح شيئاً.
     */
    findStudentByToken(tokenHash: string): { studentId: string; sessionId: string } | undefined {
      const row = db
        .select({ studentId: studentSessions.studentId, sessionId: studentSessions.sessionId })
        .from(studentSessions)
        .innerJoin(sessions, eq(sessions.id, studentSessions.sessionId))
        .where(
          and(
            eq(studentSessions.tokenHash, tokenHash),
            isNull(studentSessions.revokedAt),
            isNull(sessions.endedAt),
          ),
        )
        .get();
      return row ?? undefined;
    },

    /** أثر الحضور — يُحدَّث مع كل طلب من الطالب (يستعمله عدّاد T09 لاحقاً). */
    touchStudentSession(tokenHash: string): void {
      db.update(studentSessions)
        .set({ lastSeenAt: now() })
        .where(eq(studentSessions.tokenHash, tokenHash))
        .run();
    },

    /** عدد من دخل الحصة فعلاً — رمزٌ حيّ لا مجرد قبول. */
    countAdmitted(sessionId: string): number {
      return db
        .select({ id: studentSessions.id })
        .from(studentSessions)
        .where(
          and(eq(studentSessions.sessionId, sessionId), isNull(studentSessions.revokedAt)),
        )
        .all().length;
    },


    /** «إخراجه من الحصة» في T11 — يُبطل رمزه ويبقيه مقبولاً في الفصل. */
    revokeStudent(sessionId: string, studentId: string): void {
      db.update(studentSessions)
        .set({ revokedAt: now() })
        .where(
          and(
            eq(studentSessions.sessionId, sessionId),
            eq(studentSessions.studentId, studentId),
            isNull(studentSessions.revokedAt),
          ),
        )
        .run();
    },

    /** آخر نشاط لكل طالب في الحصة النشطة — أساس «متصل الآن». */
    lastSeenByStudent(sessionId: string): Map<string, Date | null> {
      const map = new Map<string, Date | null>();
      for (const row of db
        .select({
          studentId: studentSessions.studentId,
          lastSeenAt: studentSessions.lastSeenAt,
          revokedAt: studentSessions.revokedAt,
        })
        .from(studentSessions)
        .where(eq(studentSessions.sessionId, sessionId))
        .all()) {
        if (row.revokedAt !== null) continue;
        map.set(row.studentId, row.lastSeenAt);
      }
      return map;
    },

    createRequest(input: {
      sessionId: string;
      name: string;
      identifier?: string | null | undefined;
    }): JoinRequest {
      const row: JoinRequest = {
        id: newId(),
        sessionId: input.sessionId,
        name: input.name,
        identifier: input.identifier ?? null,
        status: 'pending',
        studentId: null,
        decidedAt: null,
        createdAt: now(),
      };
      db.insert(joinRequests).values(row).run();
      return row;
    },

    getRequest(id: string): JoinRequest {
      const row = db.select().from(joinRequests).where(eq(joinRequests.id, id)).get();
      if (!row) throw new NotFoundError('الطلب');
      return row;
    },

    findRequest(id: string): JoinRequest | undefined {
      return db.select().from(joinRequests).where(eq(joinRequests.id, id)).get();
    },

    listRequests(sessionId: string, status?: JoinRequestStatus): JoinRequest[] {
      const condition =
        status === undefined
          ? eq(joinRequests.sessionId, sessionId)
          : and(eq(joinRequests.sessionId, sessionId), eq(joinRequests.status, status));
      return db
        .select()
        .from(joinRequests)
        .where(condition)
        .orderBy(desc(joinRequests.createdAt))
        .all();
    },

    /**
     * قبول طلب — FR-006.
     *
     * إنشاء الطالب وربطه بالطلب في معاملة واحدة (NFR-005): طلبٌ يُعلَّم
     * «مقبول» بلا صفّ طالب يعني اسماً لا يظهر في الفصل ولا يمكن قبوله ثانية.
     *
     * والطالب يُنشأ هنا لا قبله — هذا ما يجعل «الطلب لا يمنح وصولاً» صحيحاً
     * في القاعدة لا في الواجهة (FR-005).
     */
    approveRequest(id: string): { request: JoinRequest; studentId: string } {
      const existing = db.select().from(joinRequests).where(eq(joinRequests.id, id)).get();
      if (!existing) throw new NotFoundError('الطلب');

      const session = db.select().from(sessions).where(eq(sessions.id, existing.sessionId)).get();
      if (!session) throw new NotFoundError('الحصة');

      const timestamp = now();
      const studentId = newId();

      transaction(() => {
        db.insert(students)
          .values({
            id: studentId,
            classId: session.classId,
            name: existing.name,
            identifier: existing.identifier,
            approvedAt: timestamp,
            removedAt: null,
            lastSeenAt: null,
            createdAt: timestamp,
          })
          .run();
        db.update(joinRequests)
          .set({ status: 'approved', studentId, decidedAt: timestamp })
          .where(eq(joinRequests.id, id))
          .run();
      });

      return {
        request: { ...existing, status: 'approved', studentId, decidedAt: timestamp },
        studentId,
      };
    },

    /**
     * قبول دفعةٍ من الطلبات في **معاملة واحدة**.
     *
     * كان «قبول الكل» يستدعي `approveRequest` في حلقة، فلكل طالب استعلاما
     * قراءةٍ ومعاملةٌ خاصة به. وهذا هو مسار **بداية الحصة بعينه**: ثلاثون
     * طلباً تصل معاً، والمعلم ينقر زرّاً واحداً.
     *
     * ومعاملةٌ واحدة ليست أسرع فحسب — هي **أصحّ**: حلقةٌ من ثلاثين معاملة
     * تنقطع في منتصفها تترك خمسة عشر طالباً مقبولين وخمسة عشر لا، وشاشةَ
     * معلمٍ لا تشبه قاعدته. والدفعة تنجح كلّها أو تفشل كلّها.
     */
    approveMany(ids: readonly string[]): { studentIds: string[] } {
      if (ids.length === 0) return { studentIds: [] };

      // قراءةٌ واحدة للطلبات كلّها بدل قراءةٍ لكل طلب.
      const pending = db
        .select()
        .from(joinRequests)
        .where(inArray(joinRequests.id, [...ids]))
        .all();

      const sessionIds = [...new Set(pending.map((row) => row.sessionId))];
      const classOf = new Map(
        db
          .select()
          .from(sessions)
          .where(inArray(sessions.id, sessionIds))
          .all()
          .map((row) => [row.id, row.classId]),
      );

      const timestamp = now();
      const studentIds: string[] = [];

      transaction(() => {
        for (const request of pending) {
          const classId = classOf.get(request.sessionId);
          // حصةٌ اختفت تحت الطلب: يُترك معلَّقاً ولا يُقبل إلى فصلٍ مجهول.
          if (classId === undefined) continue;

          const studentId = newId();
          db.insert(students)
            .values({
              id: studentId,
              classId,
              name: request.name,
              identifier: request.identifier,
              approvedAt: timestamp,
              removedAt: null,
              lastSeenAt: null,
              createdAt: timestamp,
            })
            .run();
          db.update(joinRequests)
            .set({ status: 'approved', studentId, decidedAt: timestamp })
            .where(eq(joinRequests.id, request.id))
            .run();
          studentIds.push(studentId);
        }
      });

      return { studentIds };
    },

    setRequestStatus(id: string, status: JoinRequestStatus): JoinRequest {
      const existing = db.select().from(joinRequests).where(eq(joinRequests.id, id)).get();
      if (!existing) throw new NotFoundError('الطلب');
      const next = { status, decidedAt: now() };
      db.update(joinRequests).set(next).where(eq(joinRequests.id, id)).run();
      return { ...existing, ...next };
    },
  };
}
