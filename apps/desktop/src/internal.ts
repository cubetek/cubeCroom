import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  createStudentAiAdmission,
  JsonBodyTooLargeError,
  readBoundedJson,
  studentAiAllowed,
  STUDENT_AI_NOTICE,
} from '@cubecroom/core';
import {
  internalStudentAiRequestSchema,
  lessonContentText,
  readLessonBlocks,
  studentAiResponseSchema,
  STUDENT_AI_POLICY,
  type InternalStudentAiRequest,
} from '@cubecroom/contracts';
import { buildStudentTutorMessages, formatModelId, reasonForThrown } from '@cubecroom/ai';
import { aiRegistry } from './ai.js';
import { activeModel } from './active-model.js';
import { repositories, storeState } from './store.js';

/** Loopback-only authenticated bridge. Provider keys never leave Electron. */
let server: Server | null = null;
let secret = '';
const admission = createStudentAiAdmission();
const running = new Set<AbortController>();

export type InternalEndpoint = { readonly url: string; readonly secret: string };

export async function startInternalChannel(): Promise<InternalEndpoint | null> {
  if (server !== null) return endpoint();
  secret = randomBytes(32).toString('base64url');
  const instance = createServer((request, response) => {
    void handle(request, response).catch(() => {
      // Log a category only, never prompts, identifiers or raw provider errors.
      console.error('[student-ai] internal request failed');
      send(response, 500, { error: 'internal' });
    });
  });
  instance.requestTimeout = 15_000;
  instance.headersTimeout = 10_000;
  return new Promise((resolve) => {
    instance.once('error', () => resolve(null));
    instance.listen(0, '127.0.0.1', () => {
      server = instance;
      resolve(endpoint());
    });
  });
}

export function stopInternalChannel(): void {
  for (const controller of running) controller.abort();
  server?.close();
  server?.closeAllConnections();
  server = null;
  secret = '';
}

function endpoint(): InternalEndpoint | null {
  const address = server?.address();
  if (address === null || address === undefined || typeof address === 'string') return null;
  return { url: `http://127.0.0.1:${address.port}`, secret };
}

function authorized(header: string | undefined): boolean {
  if (header === undefined || secret === '') return false;
  const given = Buffer.from(header, 'utf8');
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

/** Rechecked at delivery so ending a session or disabling AI takes effect. */
function lessonAccess(body: InternalStudentAiRequest) {
  if (storeState().status !== 'open') return { status: 503, error: 'unavailable' } as const;
  const repo = repositories();
  const session = repo.sessions.active();
  if (session?.id !== body.sessionId || session.classId !== body.classId) {
    return { status: 410, error: 'session_ended' } as const;
  }
  if (!repo.sessions.isStudentActive(body.sessionId, body.studentId)) {
    return { status: 410, error: 'session_ended' } as const;
  }
  const lesson = repo.lessons.findPublished(body.lessonId, body.classId);
  if (lesson === undefined) return { status: 404, error: 'not_found' } as const;
  const klass = repo.classes.get(body.classId);
  const master = repo.settings.getBoolean('studentAiMasterEnabled');
  let allowed: boolean;
  if (body.activityId !== undefined) {
    const activity = repo.activities.findPublished(body.activityId, body.classId);
    if (activity === undefined || activity.lessonId !== body.lessonId) {
      return { status: 404, error: 'not_found' } as const;
    }
    allowed = studentAiAllowed({
      context: 'activity',
      master,
      classEnabled: klass.studentAiEnabled,
      activityEnabled: activity.studentAiEnabled,
    });
  } else {
    allowed = studentAiAllowed({ context: 'lesson', master, classEnabled: klass.studentAiEnabled });
  }
  if (!allowed) return { status: 403, error: 'ai_disabled' } as const;
  return { status: 200, lesson } as const;
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  if (request.method !== 'POST' || request.url !== '/ai') {
    return send(response, 404, { error: 'not_found' });
  }
  if (!authorized(request.headers.authorization)) {
    return send(response, 403, { error: 'forbidden' });
  }
  let raw: unknown;
  try {
    // Preserve the socket for a useful 413 response after rejecting oversized input.
    raw = await readBoundedJson(
      request.iterator({ destroyOnReturn: false }) as AsyncIterable<Uint8Array>,
      STUDENT_AI_POLICY.requestBytes,
    );
  } catch (error) {
    request.resume();
    return send(response, error instanceof JsonBodyTooLargeError ? 413 : 400, {
      error: 'bad_request',
    });
  }
  const parsed = internalStudentAiRequestSchema.safeParse(raw);
  if (!parsed.success) return send(response, 400, { error: 'bad_request' });
  const body = parsed.data;
  const access = lessonAccess(body);
  if (access.status !== 200) return send(response, access.status, { error: access.error });
  const model = activeModel();
  if (model === null) return send(response, 503, { error: 'no_provider' });

  const slot = admission.acquire(`${body.sessionId}:${body.studentId}`);
  if (!slot.allowed) {
    response.setHeader('retry-after', slot.retryAfterSeconds);
    return send(response, 429, { error: 'busy' });
  }
  const controller = new AbortController();
  const timeout = AbortSignal.timeout(STUDENT_AI_POLICY.timeoutMs);
  const signal = AbortSignal.any([controller.signal, timeout]);
  const onClose = () => controller.abort();
  response.once('close', onClose);
  running.add(controller);
  try {
    if (response.destroyed) return;
    const result = await aiRegistry().complete({
      modelId: formatModelId(model.provider, model.model),
      messages: buildStudentTutorMessages({
        content: lessonContentText(access.lesson.title, readLessonBlocks(access.lesson.blocks)),
        request: body,
      }),
      signal,
      maxOutputTokens: STUDENT_AI_POLICY.maxOutputTokens,
    });
    if (controller.signal.aborted) return;
    if (timeout.aborted) return send(response, 504, { error: 'provider_error' });
    const latest = lessonAccess(body);
    if (latest.status !== 200) return send(response, latest.status, { error: latest.error });
    if (latest.lesson.updatedAt.getTime() !== access.lesson.updatedAt.getTime()) {
      return send(response, 409, { error: 'lesson_changed' });
    }
    const answer = studentAiResponseSchema.safeParse({
      answer: result.text.trim(),
      groundedIn: `المصدر المستخدم: ${access.lesson.title}`.slice(0, 200),
      notice: STUDENT_AI_NOTICE,
    });
    if (!answer.success) {
      console.warn('[student-ai] invalid_answer');
      return send(response, 502, { error: 'invalid_answer' });
    }
    repositories().ai.recordUsage({
      provider: model.provider,
      model: model.model,
      tokens: result.tokens ?? null,
    });
    return send(response, 200, answer.data);
  } catch (error) {
    if (controller.signal.aborted) return;
    console.warn(`[student-ai] ${timeout.aborted ? 'timeout' : reasonForThrown(error)}`);
    return send(response, timeout.aborted ? 504 : 502, { error: 'provider_error' });
  } finally {
    response.off('close', onClose);
    running.delete(controller);
    slot.release();
  }
}
