import type { LearningItem, LearningResponse } from '@cubecroom/contracts';

function normalizeAnswer(text: string): string {
  return text
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('ar')
    .replace(/[\u064B-\u065F\u0670\u0640]/gu, '')
    .replace(/\s+/gu, ' ');
}

/** Deterministic grading; free explanations remain available for teacher review. */
export function gradeLearningItem(
  item: LearningItem,
  response: LearningResponse,
): { correct: boolean | null; score: number | null } {
  if (item.kind === 'explain') return { correct: null, score: null };
  if (item.kind === 'recall') {
    const correct =
      response.answer.length === 1 &&
      item.answer.some((a) => normalizeAnswer(a) === normalizeAnswer(response.answer[0]!));
    return { correct, score: correct ? 1 : 0 };
  }
  if (response.answer.length !== item.answer.length) return { correct: false, score: 0 };
  const matches = response.answer.filter((answer, i) => answer === item.answer[i]).length;
  return { correct: matches === item.answer.length, score: matches / item.answer.length };
}

/** Initial schedule, not a claim of a fitted memory model. Hinted answers do not advance it. */
export function nextLearningReview(
  now: number,
  previousSuccesses: number,
  correct: boolean | null,
  usedHint: boolean,
): string | null {
  if (correct === null) return null;
  const days = correct && !usedHint ? [1, 3, 7, 14][Math.min(previousSuccesses, 3)]! : 1;
  return new Date(now + days * 86_400_000).toISOString();
}
