import type { AgentRunInput } from '@cubecroom/contracts';
import { storeState, onStoreClosing } from './store.js';
import { aiRegistry } from './ai.js';
import { activeModel } from './active-model.js';
import { updateFence } from './updates/service.js';
import { executeAgentRun } from './agent-runtime.js';

let active: { id: string; controller: AbortController } | null = null;
let seen: ReturnType<typeof storeState> | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export function startAgentScheduler(): void {
  if (timer) return;
  onStoreClosing(() => {
    active?.controller.abort();
  });
  timer = setInterval(() => {
    void tick();
  }, 2000);
  timer.unref();
}
export function stopAgentScheduler(): void {
  if (timer) clearInterval(timer);
  timer = null;
  active?.controller.abort();
}

export function queueAgent(input: AgentRunInput) {
  const state = storeState();
  if (state.status !== 'open') throw new Error('افتح بياناتك أولاً.');
  if (!activeModel())
    throw new Error('اربط مزود الذكاء الاصطناعي واختر نموذجاً من الإعدادات أولاً.');
  if (!state.repositories.agents.profiles().find((p) => p.id === input.agentId)?.enabled)
    throw new Error('هذا المساعد متوقف.');
  const run = state.repositories.agents.enqueue(input);
  void tick();
  return run;
}
export function controlAgent(id: string, action: 'cancel' | 'resume') {
  const state = storeState();
  if (state.status !== 'open') throw new Error('افتح بياناتك أولاً.');
  const run = state.repositories.agents.get(id);
  if (action === 'cancel' && ['queued', 'running'].includes(run.status)) {
    if (active?.id === id) active.controller.abort();
    return state.repositories.agents.update(
      id,
      'cancelled',
      'أُلغي التنفيذ. تبقى الأعمال التي حُفظت قبل الإلغاء.',
    );
  }
  if (action === 'resume' && ['failed', 'interrupted'].includes(run.status)) {
    const result = state.repositories.agents.update(id, 'queued');
    void tick();
    return result;
  }
  return run;
}
async function tick(): Promise<void> {
  const state = storeState();
  if (state.status !== 'open' || active || updateFence.phase !== 'open') return;
  if (seen !== state) {
    state.repositories.agents.recover();
    seen = state;
  }
  const run = state.repositories.agents.pending()[0];
  if (!run) return;
  const controller = new AbortController();
  active = { id: run.id, controller };
  const release = updateFence.enter();
  const repos = state.repositories;
  const live = () => {
    if (storeState() !== state) throw new Error('تغير مخزن البيانات.');
  };
  try {
    repos.agents.update(run.id, 'running');
    const model = activeModel();
    if (!model) throw new Error('اربط مزود الذكاء الاصطناعي واختر نموذجاً أولاً.');
    const result = await executeAgentRun({
      run,
      repos,
      registry: aiRegistry(),
      modelId: `${model.provider}:${model.model}`,
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(240000)]),
      assertLive: live,
    });
    live();
    controller.signal.throwIfAborted();
    repos.agents.update(run.id, 'completed', result);
  } catch (error) {
    if (storeState() === state && repos.agents.get(run.id).status !== 'cancelled')
      repos.agents.update(
        run.id,
        controller.signal.aborted ? 'interrupted' : 'failed',
        error instanceof Error ? error.message : 'تعذر تنفيذ المهمة.',
      );
  } finally {
    active = null;
    release();
  }
}
