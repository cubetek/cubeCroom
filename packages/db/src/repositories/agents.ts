import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import {
  AGENT_SPECIALISTS,
  agentProfileSchema,
  agentMemorySchema,
  agentRunSchema,
  type AgentProfile,
  type AgentId,
  type AgentMemory,
  type AgentRun,
  type AgentRunInput,
} from '@cubecroom/contracts';
import type { Db, OpenResult } from '../open.js';
import {
  agentProfiles,
  agentMemories,
  agentRuns,
  agentEffects,
  classes,
  lessons,
} from '../schema.js';

export function agentsRepository(db: Db, transaction: OpenResult['transaction']) {
  const profiles = (): AgentProfile[] =>
    AGENT_SPECIALISTS.map(
      (def) =>
        db.select().from(agentProfiles).where(eq(agentProfiles.id, def.id)).get()?.profile ?? {
          id: def.id,
          soul: def.soul,
          instructions: '',
          publishClassIds: [],
          enabled: true,
        },
    );
  const get = (id: string): AgentRun => {
    const r = db.select().from(agentRuns).where(eq(agentRuns.id, id)).get();
    if (!r) throw new Error('المهمة غير موجودة.');
    return {
      id: r.id,
      input: r.input,
      status: r.status,
      result: r.result,
      events: r.events,
      updatedAt: r.updatedAt.toISOString(),
    };
  };
  const requireClass = (classId: string) => {
    if (!db.select().from(classes).where(eq(classes.id, classId)).get())
      throw new Error('الفصل غير موجود.');
  };
  return {
    profiles,
    get,
    saveProfile(raw: AgentProfile) {
      const profile = agentProfileSchema.parse(raw);
      db.insert(agentProfiles)
        .values({ id: profile.id, profile })
        .onConflictDoUpdate({ target: agentProfiles.id, set: { profile } })
        .run();
      return profile;
    },
    memories(classId: string): AgentMemory[] {
      requireClass(classId);
      return db
        .select()
        .from(agentMemories)
        .where(eq(agentMemories.classId, classId))
        .orderBy(desc(agentMemories.updatedAt))
        .limit(100)
        .all()
        .map((r) => ({
          ...r,
          agentId: r.agentId as AgentId,
          updatedAt: r.updatedAt.toISOString(),
        }));
    },
    saveMemory(
      raw: { id?: string | undefined; agentId: AgentId; classId: string; content: string },
      source = 'تعليمات المعلم',
    ): AgentMemory {
      const input = agentMemorySchema.parse(raw);
      requireClass(input.classId);
      if (input.id) {
        const existing = db
          .select()
          .from(agentMemories)
          .where(eq(agentMemories.id, input.id))
          .get();
        if (!existing || existing.classId !== input.classId || existing.agentId !== input.agentId)
          throw new Error('الذكرى ليست في هذا النطاق.');
      }
      const row = { ...input, id: input.id ?? randomUUID(), source, updatedAt: new Date() };
      db.insert(agentMemories)
        .values(row)
        .onConflictDoUpdate({ target: agentMemories.id, set: row })
        .run();
      return { ...row, updatedAt: row.updatedAt.toISOString() };
    },
    deleteMemory(id: string) {
      db.delete(agentMemories).where(eq(agentMemories.id, id)).run();
    },
    runs(classId: string) {
      requireClass(classId);
      return db
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(eq(agentRuns.classId, classId))
        .orderBy(desc(agentRuns.updatedAt))
        .limit(50)
        .all()
        .map((r) => get(r.id));
    },
    enqueue(raw: AgentRunInput) {
      const input = agentRunSchema.parse(raw);
      requireClass(input.classId);
      if (
        !db
          .select()
          .from(lessons)
          .where(and(eq(lessons.id, input.lessonId), eq(lessons.classId, input.classId)))
          .get()
      )
        throw new Error('الدرس ليس في هذا الفصل.');
      const existing = db.select().from(agentRuns).where(eq(agentRuns.id, input.requestId)).get();
      if (existing) {
        if (JSON.stringify(existing.input) !== JSON.stringify(input))
          throw new Error('معرّف المهمة مستخدم.');
        return get(input.requestId);
      }
      db.insert(agentRuns)
        .values({
          id: input.requestId,
          classId: input.classId,
          input,
          status: 'queued',
          events: [],
        })
        .run();
      return get(input.requestId);
    },
    pending() {
      return db
        .select({ id: agentRuns.id })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.status, 'queued'),
            sql`(json_extract(${agentRuns.input}, '$.runAt') IS NULL OR json_extract(${agentRuns.input}, '$.runAt') <= ${new Date().toISOString()})`,
          ),
        )
        .limit(20)
        .all()
        .map((r) => get(r.id));
    },
    recover() {
      db.update(agentRuns)
        .set({
          status: 'interrupted',
          result: 'توقف التطبيق أثناء المهمة. يمكن استئنافها مع الاحتفاظ بالأعمال المحفوظة.',
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.status, 'running'))
        .run();
    },
    update(id: string, status: AgentRun['status'], result = '') {
      db.update(agentRuns)
        .set({ status, result, updatedAt: new Date() })
        .where(eq(agentRuns.id, id))
        .run();
      return get(id);
    },
    event(id: string, tool: string, message: string) {
      const r = get(id);
      db.update(agentRuns)
        .set({
          events: [
            ...r.events,
            { tool, message: message.slice(0, 500), at: new Date().toISOString() },
          ].slice(-100),
          updatedAt: new Date(),
        })
        .where(eq(agentRuns.id, id))
        .run();
    },
    effect<T>(runId: string, key: string, action: () => T): T {
      return transaction(() => {
        const id = JSON.stringify([runId, key]);
        const existing = db.select().from(agentEffects).where(eq(agentEffects.id, id)).get();
        if (existing) return existing.result as T;
        const result = action();
        db.insert(agentEffects).values({ id, runId, result }).run();
        return result;
      });
    },
    effects(runId: string) {
      return db
        .select({ result: agentEffects.result })
        .from(agentEffects)
        .where(eq(agentEffects.runId, runId))
        .all();
    },
  };
}
