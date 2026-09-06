import { STUDENT_AI_POLICY } from '@cubecroom/contracts';
import { createRateLimiter } from './security/rate-limit.js';

/** No queue of pending prompts: overloaded local models fail quickly and can be retried. */
export function createStudentAiAdmission() {
  const active = new Set<string>();
  const rate = createRateLimiter({
    capacity: STUDENT_AI_POLICY.requestsPerMinute,
    windowMs: 60_000,
  });

  return {
    acquire(
      key: string,
      now = Date.now(),
    ): { allowed: true; release: () => void } | { allowed: false; retryAfterSeconds: number } {
      if (active.has(key) || active.size >= STUDENT_AI_POLICY.concurrency) {
        return { allowed: false, retryAfterSeconds: 5 };
      }
      const attempt = rate.check(key, now);
      if (!attempt.allowed) return { allowed: false, retryAfterSeconds: attempt.retryAfterSeconds };
      active.add(key);
      let released = false;
      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          active.delete(key);
        },
      };
    },
  };
}
