export { DATABASE_FILE_NAME, hasExistingData } from './data-layout.js';
export { createFileStore, filesDirectory } from './files/store.js';
export type { AddedFile, AddOptions, CopyProgress, FileStore } from './files/store.js';
export { classify, extensionOf } from './files/classify.js';
export type { FileCategory, FileClassification } from './files/classify.js';

export { createBackup, deleteBackup, defaultBackupsDirectory } from './backup/create.js';
export type {
  BackupProgress,
  BackupSummary,
  CreateBackupOptions,
  DatabaseSource,
} from './backup/create.js';
export { verifyBackup, listBackups } from './backup/verify.js';
export { restoreBackup, describeLoss } from './backup/restore.js';
export { quarantineData, listQuarantined, QUARANTINE_PREFIX } from './backup/quarantine.js';
export type { QuarantineResult } from './backup/quarantine.js';
export {
  appendCrashEntry,
  formatCrashEntry,
  readCrashLog,
  clearCrashLog,
  CRASH_LOG_NAME,
} from './crash-log.js';
export type { CrashEntry } from './crash-log.js';
export { isInsideDirectory, PathOutsideError } from './security/paths.js';
export type { RestoreOptions, RestoreResult, RestoreStep } from './backup/restore.js';
export type { BackupReport, BackupStatus, VerifyOptions } from './backup/verify.js';
export {
  parseManifest,
  BACKUP_FORMAT_VERSION,
  MANIFEST_NAME,
  DATABASE_NAME,
  FILES_DIR,
} from './backup/manifest.js';
export type { BackupContents, BackupEntry, BackupManifest } from './backup/manifest.js';

export { createStudentToken, hashStudentToken, sameToken } from './security/tokens.js';
export { maskKey, looksLikeSecret, redactSecrets } from './security/secrets.js';
export { createRateLimiter } from './security/rate-limit.js';
export type { RateLimiter, RateLimitOptions, RateLimitResult } from './security/rate-limit.js';
export { isOnline, PRESENCE_WINDOW_MS } from './presence.js';
export { studentAiAllowed, STUDENT_AI_NOTICE } from './student-ai.js';
export { createStudentAiAdmission } from './student-ai-admission.js';
export { readBoundedJson, JsonBodyTooLargeError } from './network/json-body.js';
export type { StudentAiGates } from './student-ai.js';
export { normalizeArabic, similarNames } from './text/arabic.js';
export { normalizeAnswer, answerTokens, answerSimilarity, groupAnswers, countNegations, negationParity, NEGATION_PARTICLES, ANSWER_MATCH_THRESHOLD } from './text/answers.js';
export type { AnswerCluster, AnswerEntry, GroupAnswersOptions } from './text/answers.js';
export { lanAddress, pickLanAddress } from './network/lan.js';
export type { InterfaceEntry, InterfaceMap, NetworkAddress } from './network/lan.js';
export { findAvailablePort, isPortAvailable, DEFAULT_PORT } from './network/port.js';
export {
  awaitHttpReady,
  median,
  READY_BUDGET_MS,
  READY_POLL_MS,
  READY_TIMEOUT_MS,
} from './network/readiness.js';
export type { ReadyOptions } from './network/readiness.js';
export { primeFirewallPrompt, FIREWALL_PRIMED_FILE } from './network/firewall.js';
export { startHostnameResponder, LOCAL_HOSTNAME } from './network/mdns.js';
export type { MdnsResponder } from './network/mdns.js';
export { createJoinCode } from './security/join-code.js';
export {
  buildResultsCsv,
  resultsCsvFileName,
  csvCell,
  CSV_BOM,
  RESULTS_CSV_COLUMNS,
} from './export/results.js';
export type { ResultsCsvInput, ResultsCsvQuestion, ResultsCsvRow } from './export/results.js';
export type { PrimeResult } from './network/firewall.js';
export { validateReleasePayload, verifyReleaseManifest, verifyReleaseFile } from './updates/release-manifest.js';
export type { ReleaseValidationOptions } from './updates/release-manifest.js';
export { createUpdateFence } from './updates/quiescence.js';

export { moveData, databaseFileIn } from './backup/move.js';
export type { MoveDataOptions, MoveDataResult } from './backup/move.js';

export {
  BackupFailedError,
  PortUnavailableError,
  FileCopyFailedError,
  FileDataMissingError,
  UnsafeStorageNameError,
  ResultsRowError,
} from './errors.js';
export * from './learning.js';
