export {
  parseModelId,
  formatModelId,
  isValidModelId,
  MalformedModelIdError,
  UnknownProviderError,
} from './model-id.js';
export type { ModelId, ParsedModelId } from './model-id.js';

export {
  createRegistry,
  ProviderNotConfiguredError,
  ProviderUnavailableError,
} from './registry.js';
export type {
  AiMessage,
  CompleteRequest,
  CompleteResult,
  ProviderAdapter,
  Registry,
  RegistryOptions,
} from './registry.js';

export { createAdapter, createAllAdapters } from './adapters.js';
export type { AdapterOptions } from './adapters.js';
export { AiFailure, reasonForStatus, reasonForThrown } from './errors.js';
export type { AiFailureReason } from './errors.js';
export { tool } from 'ai';
export type { ToolSet } from 'ai';

export { buildMessages } from './prompts.js';
export type { PromptInput } from './prompts.js';
export { buildStudentTutorMessages } from './tutor.js';
export type { StudentTutorPromptInput } from './tutor.js';
export { runLessonPageAgent, LessonPageAgentOutputError } from './lesson-agent.js';

export { buildQuestionMessages, parseQuestions } from './questions.js';
export type {
  DraftOption,
  DraftQuestion,
  GenerateQuestionsInput,
  ParsedQuestions,
} from './questions.js';

export { buildReviewMessages, parseReviewSuggestion, MAX_GRADE } from './review.js';
export type { ReviewSuggestion, ReviewSuggestionInput } from './review.js';
