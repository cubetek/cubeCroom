import { randomUUID } from 'node:crypto';
import {
  lessonContentText,
  lessonPageBlocks,
  readLessonBlocks,
  MAX_TEACHER_AI_CONTENT,
  type LessonAgentRunInput,
  type TeacherQuestion,
} from '@cubecroom/contracts';
import {
  AiFailure,
  formatModelId,
  runLessonPageAgent,
  LessonPageAgentOutputError,
} from '@cubecroom/ai';
import { LessonWorkspaceError } from '@cubecroom/db';
import { aiRegistry } from './ai.js';
import { activeModel } from './active-model.js';
import { repositories, storeState } from './store.js';

const activeLessons = new Set<string>();

/** Controlled workflow: understand → compose → validate/repair → atomically save a complete page. */
export async function composeLessonPage(input: LessonAgentRunInput, signal: AbortSignal) {
  const model = activeModel();
  if (!model) return { status: 'no_provider' } as const;
  if (activeLessons.has(input.id) || activeLessons.size >= 2) {
    return {
      status: 'failed',
      message: 'يوجد تجهيز جارٍ الآن. انتظر اكتماله أو ألغِه أولاً.',
    } as const;
  }
  const store = storeState();
  if (store.status !== 'open') return { status: 'failed', message: 'افتح بياناتك أولاً.' } as const;
  const repo = repositories();
  const lesson = repo.lessons.get(input.id);
  const content = lessonContentText(lesson.title, readLessonBlocks(lesson.blocks));
  if (content.length > MAX_TEACHER_AI_CONTENT) {
    return {
      status: 'failed',
      message: 'الدرس طويل للتجهيز في طلب واحد. قسّمه إلى دروس أقصر ثم أعد المحاولة.',
    } as const;
  }
  const expected = repo.lessonWorkspaces.fingerprint(input.id);
  activeLessons.add(input.id);
  try {
    const result = await runLessonPageAgent({
      registry: aiRegistry(),
      modelId: formatModelId(model.provider, model.model),
      signal,
      input: {
        title: lesson.title,
        content,
        instructions: input.instructions,
        context: input.context,
      },
    });
    signal.throwIfAborted();
    if (storeState() !== store) {
      return {
        status: 'failed',
        message: 'تغيّر مجلد البيانات أثناء التجهيز. افتح الدرس من جديد.',
      } as const;
    }
    const questions: TeacherQuestion[] = result.plan.activity.questions.map((question) =>
      question.type === 'choice'
        ? {
            id: randomUUID(),
            type: 'choice',
            prompt: question.prompt,
            points: 1,
            options: question.options.map((option) => ({ id: randomUUID(), ...option })),
          }
        : {
            id: randomUUID(),
            type: 'text',
            prompt: question.prompt,
            points: 1,
            expectedAnswer: question.expectedAnswer,
          },
    );
    const saved = repo.transaction(() => {
      const applied = repo.lessonWorkspaces.apply(input.id, expected, {
        title: result.plan.title,
        blocks: lessonPageBlocks(result.plan),
        preparation: result.plan.preparation,
        activity: { title: result.plan.activity.title, questions },
      });
      // Counts commit with the page, so a failed usage write cannot masquerade as a failed run.
      repo.ai.recordUsage({
        provider: model.provider,
        model: model.model,
        tokens: result.tokens ?? null,
      });
      return applied;
    });
    return { status: 'ok', activityId: saved.activityId, undoToken: saved.undoToken } as const;
  } catch (error) {
    if (signal.aborted) return { status: 'cancelled' } as const;
    const message =
      error instanceof AiFailure ||
      error instanceof LessonPageAgentOutputError ||
      error instanceof LessonWorkspaceError
        ? error.message
        : error instanceof Error && error.name === 'TimeoutError'
          ? 'استغرق التجهيز وقتاً أطول من المتاح. حاول مرة أخرى؛ بقي الدرس كما كان.'
          : 'تعذّر تجهيز الدرس. أعد المحاولة؛ لم يتغيّر محتواه.';
    return { status: 'failed', message } as const;
  } finally {
    activeLessons.delete(input.id);
  }
}
