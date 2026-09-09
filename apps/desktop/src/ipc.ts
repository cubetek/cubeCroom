import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  shell,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type OpenDialogReturnValue,
} from 'electron';
import {
  IPC,
  SETTING_KEYS,
  PROVIDER_LABELS,
  PROVIDERS,
  isLocalProvider,
  LOCAL_PROVIDER_URLS,
  approveAllSchema,
  providerKeySchema,
  cancelAiSchema,
  runAiSchema,
  lessonAgentRunSchema,
  lessonAgentUndoSchema,
  type LessonAgentResult,
  saveKeySchema,
  setModelSchema,
  attachToLessonSchema,
  removeFileSchema,
  archiveClassSchema,
  classStudentAiSchema,
  decideRequestSchema,
  classInputSchema,
  classIdSchema,
  copyTextSchema,
  createLessonSchema,
  createActivitySchema,
  updateActivitySchema,
  publishActivitySchema,
  activityStudentAiSchema,
  activityIdSchema,
  submissionIdSchema,
  generateQuestionsSchema,
  suggestReviewSchema,
  copyActivitySchema,
  studentPortSchema,
  moveDataSchema,
  type MoveDataResult,
  type ExportedResults,
  type StudentPortState,
  reviewSubmissionSchema,
  publishBlockers,
  activityKind,
  buildDiagnostics,
  backupPathSchema,
  teacherQuestionsSchema,
  lessonBlocksSchema,
  lessonContentText,
  windowAppearanceSchema,
  lessonIdSchema,
  listClassesSchema,
  publishLessonSchema,
  renameStudentSchema,
  studentActionSchema,
  startPortalSchema,
  updateLessonSchema,
  updateClassSchema,
  completeOnboardingSchema,
  validate,
  writeSettingSchema,
  type BootState,
  type ActiveModel,
  type AiResult,
  type AiSettings,
  type ChooseDirectoryResult,
  type SaveKeyResult,
  type ClassSummary,
  type HomeState,
  type Contract,
  type OpenPathResult,
  type PortalStatus,
  type FileProgress,
  type RemoveFileResult,
  type RequestRow,
  type StoredFile as StoredFileRow,
  type RequestsState,
  type RosterRow,
  type RosterState,
  type TeacherLessonDetail,
  type TeacherLessonSummary,
  type TeacherActivityDetail,
  type TeacherActivitySummary,
  type TeacherQuestion,
  type GeneratedQuestions,
  type ReviewSuggestionResult,
  type ChoiceBreakdownResult,
  type UnreadStudents,
  type ActivitySubmissions,
  type Diagnostics,
  type DiagnosticFacts,
  type BackupState,
  type BackupRow,
  type RestorePreview,
  type RestoreResultView,
  type SubmissionDetail,
  type SettingsState,
} from '@cubecroom/contracts';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { networkInterfaces } from 'node:os';
import {
  classify,
  maskKey,
  isOnline,
  pickLanAddress,
  primeFirewallPrompt,
  DEFAULT_PORT,
  deleteBackup,
  quarantineData,
  describeLoss,
  restoreBackup,
  verifyBackup,
  defaultBackupsDirectory,
  isInsideDirectory,
  PathOutsideError,
  hasExistingData,
  listBackups,
  moveData,
  readCrashLog,
  redactSecrets,
  similarNames,
  buildResultsCsv,
  resultsCsvFileName,
  type ResultsCsvRow,
} from '@cubecroom/core';
import { FileInUseError, SCHEMA_VERSION } from '@cubecroom/db';
import type {
  ClassSummary as StoredClassSummary,
  StoredFile as StoredFileRecord,
  JoinRequest as StoredJoinRequest,
  Activity as StoredActivity,
  ActivityTally,
  StoredQuestion,
  Lesson as StoredLesson,
  Student as StoredStudent,
} from '@cubecroom/db';
import {
  defaultDataDirectory,
  ensureWritableDirectory,
  readConfig,
  updateConfig,
} from './config.js';
import {
  AiFailure,
  buildMessages,
  buildQuestionMessages,
  buildReviewMessages,
  formatModelId,
  parseQuestions,
  parseReviewSuggestion,
  reasonForThrown,
  type DraftQuestion,
} from '@cubecroom/ai';
import { randomUUID } from 'node:crypto';
import { activeModel } from './active-model.js';
import { aiRegistry } from './ai.js';
import { composeLessonPage } from './lesson-agent.js';
import { UPDATE_IPC, updateChannelSchema, updatePreparationSchema } from '@cubecroom/contracts';
import { takeBackup } from './backup.js';
import {
  updateFence, updateState, checkForUpdates, downloadUpdate, installUpdate,
  changeUpdateChannel, acknowledgeUpdatePreparation,
} from './updates/service.js';
import { portalStatus, startPortal, stopPortal } from './portal.js';
import {
  deleteKey,
  encryptionAvailable,
  readKey,
  saveKey,
  NO_ENCRYPTION_MESSAGE,
} from './secrets.js';
import {
  closeStore,
  fileStore,
  openStore,
  prepareFileStore,
  repositories,
  storeState,
  type StoreState,
} from './store.js';

/**
 * تسجيل قنوات IPC.
 *
 * كل معالِج يمرّ بحارسين قبل أن يعمل:
 *   ١. `assertTrustedSender` — SEC-004: «التحقق من sender لكل IPC privileged
 *      operation». إطار غير أصلنا لا يُنادي شيئاً مهما بلغ.
 *   ٢. `validate` من العقود — لا مدخل يصل إلى القاعدة بلا تحقّق.
 */

let allowedOrigin = '';
const updateChannels = new Set<string>(Object.values(UPDATE_IPC));

/** يُضبط عند الإقلاع بأصل الواجهة الوحيد المسموح (dev أو app://). */
export function setAllowedOrigin(origin: string): void {
  allowedOrigin = origin;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const source = event.senderFrame?.url ?? '';
  let trusted = false;
  try {
    const actual = new URL(source);
    const expected = new URL(allowedOrigin);
    trusted = actual.protocol === expected.protocol && actual.host === expected.host && event.senderFrame === event.sender.mainFrame;
  } catch { /* An absent or malformed sender is never privileged. */ }
  if (!trusted) {
    throw new Error('نداء مرفوض: مصدر غير موثوق.');
  }
}

/**
 * حوار اختيارٍ معلَّقاً على نافذة مُرسِله.
 *
 * ثلاث قنوات تفتح حواراً، وكانت كلّها تعيد الالتفاتة نفسها: نافذةُ المُرسِل إن
 * عُرفت وإلا حوارٌ بلا أب. والفرق ليس تجميلياً — حوارٌ بلا نافذة أب يظهر على
 * ماك مستقلاً عن التطبيق في شريط المهام، ولا يمنع على ويندوز العبث بالنافذة
 * خلفه. فتعريفٌ واحد يضمن أن القناة الرابعة ترثه بلا أن ينتبه كاتبها.
 *
 * والخيارات تُمرَّر كما هي في الحالتين: كانت نسخة «بلا نافذة» تُسقط العنوان،
 * فيقرأ المعلم حواراً بلا سؤال في الحالة التي يحتاج فيها السؤال أكثر.
 */
function showPicker(
  event: IpcMainInvokeEvent,
  options: OpenDialogOptions,
): Promise<OpenDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options);
}

/** يلفّ المعالِج بالحارسين، فلا يُنسى أحدهما في قناة جديدة. */
function handle<TInput, TResult>(
  channel: string,
  schema: Contract<TInput> | null,
  fn: (input: TInput, event: IpcMainInvokeEvent) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, raw: unknown) => {
    assertTrustedSender(event);
    const parsed = schema === null ? { ok: true as const, value: undefined as TInput } : validate(schema, raw);
    if (!parsed.ok) {
      // الخطأ يعبر إلى الواجهة برسالته العربية وحقله — لا نصّ تقني.
      throw Object.assign(new Error(parsed.error.message), { cubecroom: parsed.error });
    }
    if (updateChannels.has(channel)) return fn(parsed.value, event);
    const leave = updateFence.enter(channel === IPC.lessonUpdate || channel === IPC.activityUpdate);
    try { return await fn(parsed.value, event); } finally { leave(); }
  });
}

/* ── الحالة عند الإقلاع ─────────────────────────────── */

async function computeBootState(): Promise<BootState> {
  const config = await readConfig();

  // لا ملف إعداد ⇦ أول تشغيل. لا تُفتح قاعدة قبل أن يختار المعلم مكانها.
  if (!config) {
    return { status: 'onboarding', defaultDataDirectory: defaultDataDirectory() };
  }

  const state = storeState().status === 'open' ? storeState() : openStore(config.dataDirectory);
  if (state.status === 'blocked') {
    return { status: 'blocked', message: state.message, canRetry: state.canRetry };
  }
  if (state.status !== 'open') {
    return { status: 'onboarding', defaultDataDirectory: defaultDataDirectory() };
  }

  await prepareFileStore();

  const teacher = state.repositories.teacher.get();
  // مكان محفوظ بلا معلم: إعداد توقّف في منتصفه — يُستأنف من البداية.
  if (!teacher) {
    return { status: 'onboarding', defaultDataDirectory: config.dataDirectory };
  }

  return {
    status: 'ready',
    teacher: { name: teacher.name, institution: teacher.institution },
    dataDirectory: state.dataDirectory,
  };
}

export function registerIpc(): void {
  handle<undefined, unknown>(AGENT_IPC.profiles, null, () => repositories().agents.profiles());
  handle(AGENT_IPC.profileSave, agentProfileSchema, input => repositories().agents.saveProfile(input));
  handle(AGENT_IPC.memories, agentScopeSchema, input => repositories().agents.memories(input.classId));
  handle(AGENT_IPC.memorySave, agentMemorySchema, input => repositories().agents.saveMemory(input));
  handle(AGENT_IPC.memoryDelete, learningIdSchema, input => repositories().agents.deleteMemory(input.id));
  handle(AGENT_IPC.runs, agentScopeSchema, input => repositories().agents.runs(input.classId));
  handle(AGENT_IPC.start, agentRunSchema, input => queueAgent(input));
  handle(AGENT_IPC.control, agentControlSchema, input => controlAgent(input.id, input.action));
  handle(LEARNING_IPC.list, learningListSchema, input => repositories().learning.list(input.classId));
  handle(LEARNING_IPC.get, learningIdSchema, input => repositories().learning.get(input.id));
  handle(LEARNING_IPC.save, learningSaveSchema, input => repositories().learning.save(input));
  handle(LEARNING_IPC.publish, learningPublishSchema, input => repositories().learning.publish(input.id, input.published, input.expectedVersion));
  handle(LEARNING_IPC.progress, learningIdSchema, input => repositories().learning.progress(input.id));
  handle(LEARNING_IPC.review, learningIdSchema, input => repositories().learning.review(input.id));
  handle(LEARNING_IPC.grade, learningGradeSchema, input => repositories().learning.grade(input.attemptId, input.score, input.comment));
  handle(UPDATE_IPC.state, null, () => updateState());
  handle(UPDATE_IPC.check, null, () => checkForUpdates());
  handle(UPDATE_IPC.download, null, () => downloadUpdate());
  handle(UPDATE_IPC.install, null, () => installUpdate());
  handle(UPDATE_IPC.channel, updateChannelSchema, (channel) => changeUpdateChannel(channel));
  handle(UPDATE_IPC.prepared, updatePreparationSchema, (input, event) => {
    acknowledgeUpdatePreparation(event.sender.id, input);
    return { accepted: true };
  });
  handle(IPC.windowAppearance, windowAppearanceSchema, (input, event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && process.platform !== 'darwin') {
      window.setTitleBarOverlay({ color: input.background, symbolColor: input.foreground });
    }
    return { updated: true };
  });
  handle<undefined, BootState>(IPC.bootState, null, () => computeBootState());

  handle<undefined, ChooseDirectoryResult>(IPC.chooseDataDirectory, null, async (_input, event) => {
    const result = await showPicker(event, {
      title: 'اختر مكان حفظ بياناتك',
      properties: ['openDirectory', 'createDirectory'],
    });

    const chosen = result.filePaths[0];
    if (result.canceled || chosen === undefined) return { status: 'cancelled' };

    const writable = await ensureWritableDirectory(chosen);
    if (!writable.ok) return { status: 'unusable', message: writable.message };

    return { status: 'chosen', path: chosen };
  });

  /**
   * إتمام أول تشغيل — عملية واحدة لا ثلاث.
   *
   * الاسم يُجمع في الخطوة ٢ والمكان في الخطوة ٣، ولا يُكتب شيء حتى تكتملا:
   * لا يمكن حفظ المعلم قبل معرفة مكان القاعدة. فإن فشلت أي خطوة لا يبقى
   * إعداد نصفيّ يربك الإقلاع التالي.
   */
  handle(IPC.completeOnboarding, completeOnboardingSchema, async (input): Promise<BootState> => {
    const writable = await ensureWritableDirectory(input.dataDirectory);
    if (!writable.ok) return { status: 'blocked', message: writable.message, canRetry: true };

    const state = openStore(input.dataDirectory);
    if (state.status !== 'open') {
      return {
        status: 'blocked',
        message: state.status === 'blocked' ? state.message : 'تعذّر تجهيز بياناتك.',
        canRetry: state.status === 'blocked' ? state.canRetry : true,
      };
    }

    await prepareFileStore();

    const teacher = repositories().teacher.save({
      name: input.name,
      institution: input.institution === undefined || input.institution === '' ? null : input.institution,
    });

    /*
     * §22: نجعل النظام يسأل سؤاله الآن — في لحظة هادئة أمام معلم وحده — لا
     * أول مرة يشغّل فيها حصةً وأمامه صفٌّ ينتظر. الاستماع لحظةً على الشبكة ثم
     * الإغلاق كافٍ لاستدعاء نافذة «السماح بالوصول؟» في ويندوز.
     *
     * وفشلُه لا يوقف أول تشغيل: هو تحسينٌ لتوقيت سؤالٍ يسأله النظام على أي حال.
     */
    await primeFirewallPrompt(DEFAULT_PORT).catch(() => undefined);

    // ملف الإعداد آخر ما يُكتب: وجوده يعني أن الإعداد اكتمل فعلاً.
    // و`updateConfig` يحفظ ما سواه — إعدادُ جهازٍ سابق لا يضيع بأول تشغيل.
    await updateConfig({ dataDirectory: input.dataDirectory });

    return {
      status: 'ready',
      teacher: { name: teacher.name, institution: teacher.institution },
      dataDirectory: input.dataDirectory,
    };
  });

  /**
   * «تحديد مكان البيانات» — المخرج الثاني في T01States/٣.
   *
   * المعلم هنا يبحث عن بياناته لا يبدأ من جديد، فالمجلد الخالي يُرفض قبل أن
   * يُفتح: فتحُه ينشئ قاعدة فارغة، فيرى تطبيقاً يعمل بلا فصوله ويظنّ أن كل
   * شيء ضاع. وملف الإعداد يُكتب بعد نجاح الفتح لا قبله.
   */
  handle<undefined, BootState>(IPC.relocateDataDirectory, null, async (_input, event) => {
    const result = await showPicker(event, {
      title: 'أين مجلد بياناتك؟',
      properties: ['openDirectory'],
    });

    const chosen = result.filePaths[0];
    // الإلغاء يعيد الحالة كما هي — لا يُعدّ فشلاً ولا يمسح ما على الشاشة.
    if (result.canceled || chosen === undefined) return computeBootState();

    if (!(await hasExistingData(chosen))) {
      return {
        status: 'blocked',
        message:
          'لا نجد بيانات CubeCroom في هذا المجلد. اختر المجلد الذي حفظت بياناتك فيه، ' +
          'أو استعد نسخة احتياطية.',
        canRetry: true,
      };
    }

    const writable = await ensureWritableDirectory(chosen);
    if (!writable.ok) return { status: 'blocked', message: writable.message, canRetry: true };

    const state = openStore(chosen);
    if (state.status !== 'open') {
      return {
        status: 'blocked',
        message: state.status === 'blocked' ? state.message : 'تعذّر فتح بياناتك من هذا المجلد.',
        canRetry: state.status === 'blocked' ? state.canRetry : true,
      };
    }

    await prepareFileStore();
    // المنفذ المختار يبقى: هذا المسار يغيّر مكان البيانات لا إعدادات الجهاز.
    await updateConfig({ dataDirectory: chosen });
    return computeBootState();
  });

  /* ── الفصول — T06 · T07 ───────────────────────────── */

  handle(IPC.classesList, listClassesSchema, (input): ClassSummary[] =>
    repositories()
      .classes.listSummaries({ includeArchived: input.includeArchived })
      .map(toSummary),
  );

  /**
   * الإنشاء يعيد البطاقة كاملة بأعدادها لا الصفّ الخام:
   * «الفصل يظهر في القائمة فور إنشائه» (US-T02) يعني أن ما يُعاد يُضاف إلى
   * القائمة كما هو، بلا نداء ثانٍ يُظهر البطاقة متأخرة عن الرسالة.
   */
  handle(IPC.classesCreate, classInputSchema, (input): ClassSummary => {
    const created = repositories().classes.create(input);
    return toSummary({ ...created, students: 0, lessons: 0, activities: 0, hasDraft: false });
  });

  handle(IPC.classesUpdate, updateClassSchema, (input): ClassSummary => {
    repositories().classes.update(input.id, input.patch);
    return summaryOf(input.id);
  });

  /** الأرشفة إخفاء من المسار اليومي لا حذف — FR-003، وتُعكس بالنداء نفسه. */
  handle(IPC.classesArchive, archiveClassSchema, (input): ClassSummary => {
    repositories().classes.setArchived(input.id, input.archived);
    return summaryOf(input.id);
  });

  /* ── الذكاء الاصطناعي — SEC-005 ───────────────────── */

  handle<undefined, AiSettings>(IPC.aiSettings, null, () => aiSettings());

  /**
   * حفظ مفتاح مزوّد.
   *
   * المفتاح يدخل هنا ولا يخرج: يُشفَّر ويُكتب في خزنة النظام، ولا يُعاد في
   * الردّ ولا يُسجَّل ولا يمرّ بالقاعدة. وما يعود إلى الشاشة هو الحالة
   * المقنَّعة وحدها.
   *
   * وحين تعجز خزنة النظام يُرفض الحفظ ويُقال السبب — لا يُكتب المفتاح نصّاً.
   */
  handle(IPC.aiSaveKey, saveKeySchema, async (input): Promise<SaveKeyResult> => {
    const local = isLocalProvider(input.provider);
    const baseURL = isLocalProvider(input.provider)
      ? input.baseURL ?? LOCAL_PROVIDER_URLS[input.provider] : undefined;
    if (input.key !== '' && !encryptionAvailable()) {
      return { status: 'unavailable', message: NO_ENCRYPTION_MESSAGE };
    }

    /**
     * **الاختبار قبل الحفظ — لا بعده ولا بجانبه.**
     *
     * هذا هو معيار إنجاز P4-3 حرفياً: «المفتاح لا يُحفظ إذا فشل الاختبار».
     * وموضعه هنا لا في الشاشة: واجهةٌ تختبر ثم تحفظ بنداءين تترك ثغرةً بينهما،
     * ويكفي أن ينادي أحد قناة الحفظ مباشرةً ليبقى في الجهاز مفتاح لا يعمل.
     */
    let models: string[];
    try {
      models = await aiRegistry().listModels(input.provider, input.key, undefined, baseURL);
    } catch (error) {
      const reason = error instanceof AiFailure ? error.reason : reasonForThrown(error);
      // ولا يُسجَّل المفتاح ولا جزء منه مع الفشل — SEC-005.
      if (repositories().ai.find(input.provider)?.status !== 'connected') {
        repositories().ai.upsert({
          provider: input.provider,
          label: PROVIDER_LABELS[input.provider],
          status: 'error',
        });
      }
      return { status: 'rejected', reason, message: error instanceof AiFailure ? error.message : new AiFailure(reason).message };
    }

    if (input.key !== '') {
      if (!await saveKey(input.provider, input.key)) return { status: 'unavailable', message: NO_ENCRYPTION_MESSAGE };
    } else if (local) {
      await deleteKey(input.provider);
    }
    if (isLocalProvider(input.provider) && baseURL !== undefined) {
      await updateConfig({ aiEndpoints: { [input.provider]: baseURL } });
    }
    const previousModel = repositories().ai.find(input.provider)?.defaultModel;
    repositories().ai.upsert({
      provider: input.provider,
      label: PROVIDER_LABELS[input.provider],
      status: 'connected',
      defaultModel: previousModel && models.includes(previousModel) ? previousModel : null,
    });

    return { status: 'connected', models, settings: await aiSettings() };
  });

  /** اختيار النموذج الافتراضي — يُحفظ بصيغة اسمه، والمزوّد عمود الصفّ. */
  handle(IPC.aiSetModel, setModelSchema, async (input): Promise<AiSettings> => {
    if (repositories().ai.find(input.provider)?.status !== 'connected') {
      throw new Error('اختبر الاتصال بالمزوّد قبل اختيار النموذج.');
    }
    repositories().ai.upsert({
      provider: input.provider,
      label: PROVIDER_LABELS[input.provider],
      status: 'connected',
      defaultModel: input.model,
    });
    repositories().settings.set('activeAiProvider', input.provider);
    return aiSettings();
  });

  handle(IPC.aiDeleteKey, providerKeySchema, async (input): Promise<AiSettings> => {
    await deleteKey(input.provider);
    repositories().ai.disconnect(input.provider);
    return aiSettings();
  });

  handle<undefined, ActiveModel>(IPC.aiActiveModel, null, () => activeModel());

  /**
   * تشغيل إجراء من لوحة T14.
   *
   * **النتيجة تُعاد ولا تُكتب.** لا يلمس هذا المعالِج جدول الدروس إطلاقاً —
   * وهو معيار الإنجاز: «النتيجة معاينة، لا تُعدَّل الدرس تلقائياً». الكتابة
   * تحدث في قناة تحديث الدرس وحدها، بضغط المعلم على «إدراج».
   *
   * وغياب المزوّد ليس خطأً بل حالة: المصدر يشترط دعوةً إلى الإعداد بدل رسالة
   * عطل، فلا يظنّ المعلم أن شيئاً انكسر.
   */
  handle(IPC.aiRun, runAiSchema, async (input): Promise<AiResult> => {
    const active = activeModel();
    if (active === null) return { status: 'no_provider' };

    const entry = { controller: new AbortController(), timedOut: false };
    running.set(input.requestId, entry);
    const timer = setTimeout(() => {
      entry.timedOut = true;
      entry.controller.abort();
    }, AI_TIMEOUT_MS);

    try {
      const result = await aiRegistry().complete({
        modelId: formatModelId(active.provider, active.model),
        messages: buildMessages({
          action: input.action,
          content: input.content,
          ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
          ...(input.context === undefined ? {} : { context: input.context }),
        }),
        signal: entry.controller.signal,
      });

      // النداء نجح فيُسجَّل — والوحدات كما أعادها المزوّد أو `null` إن لم يعدها.
      repositories().ai.recordUsage({
        provider: active.provider,
        model: active.model,
        tokens: result.tokens ?? null,
      });

      return {
        status: 'ok',
        text: result.text,
        provider: active.provider,
        model: active.model,
        ...(result.tokens === undefined ? {} : { tokens: result.tokens }),
      };
    } catch (error) {
      // الإيقاف التلقائي عطلٌ له إجراؤه؛ وإلغاء المعلم ليس عطلاً أصلاً.
      if (entry.timedOut) {
        return {
          status: 'failed',
          reason: 'timeout',
          message: new AiFailure('timeout').message,
          action: 'retry',
        };
      }
      if (entry.controller.signal.aborted) return { status: 'cancelled' };

      const reason = error instanceof AiFailure ? error.reason : reasonForThrown(error);
      if (reason === 'rejected_key') {
        repositories().ai.upsert({
          provider: active.provider,
          label: PROVIDER_LABELS[active.provider],
          status: 'error',
        });
      }

      return {
        status: 'failed',
        reason,
        message: new AiFailure(reason).message,
        // مفتاح مرفوض يُصلَح في الإعدادات؛ وما عداه يُعاد بعد قليل.
        action: reason === 'rejected_key' ? 'open_settings' : 'retry',
      };
    } finally {
      clearTimeout(timer);
      running.delete(input.requestId);
    }
  });

  handle(IPC.lessonAgentRun, lessonAgentRunSchema, async (input): Promise<LessonAgentResult> => {
    if (running.has(input.requestId)) return { status: 'failed', message: 'هذا الطلب جارٍ بالفعل.' };
    const entry = { controller: new AbortController(), timedOut: false };
    running.set(input.requestId, entry);
    try {
      const result = await composeLessonPage(input, entry.controller.signal);
      return result.status === 'ok' ? { ...result, lesson: lessonDetail(input.id) } : result;
    } finally {
      running.delete(input.requestId);
    }
  });
  handle(IPC.lessonAgentUndo, lessonAgentUndoSchema, (input): TeacherLessonDetail => {
    repositories().lessonWorkspaces.undo(input.id, input.token);
    return lessonDetail(input.id);
  });

  /** «إلغاء» في `T14Generating` — NFR-006: مهلة قابلة للإلغاء. */
  handle(IPC.aiCancel, cancelAiSchema, (input): { cancelled: boolean } => {
    const entry = running.get(input.requestId);
    entry?.controller.abort();
    return { cancelled: entry !== undefined };
  });

  /* ── الملفات والمرفقات — T13Upload · T18 ──────────── */

  handle<undefined, StoredFileRow[]>(IPC.filesList, null, () => listFiles());

  /**
   * «اختر من جهازك» — ينسخ ثم يسجّل، ملفاً ملفاً.
   *
   * الترتيب مقصود: النسخ أولاً والتسجيل بعده. صفٌّ في القاعدة يشير إلى نسخة
   * لم تكتمل يجعل المكتبة تعرض ملفاً لا يُفتح؛ أما نسخةٌ بلا صفّ فتشغل مساحة
   * ويكنسها `sweepPartials` — والثاني أهون.
   *
   * وملفٌ يفشل لا يُسقط البقية: المعلم يختار خمسة، فيصل أربعة ويُخبَر عن
   * الخامس بالاسم.
   */
  handle<undefined, StoredFileRow[]>(IPC.filesPick, null, async (_input, event) => {
    const result = await showPicker(event, {
      title: 'اختر ملفات لإضافتها إلى مكتبتك',
      properties: ['openFile', 'multiSelections'],
    });

    if (result.canceled) return [];

    // يُعاد المُضاف في هذه المرة وحده لا المكتبة كلها: الاستدعاء يُتبع بربطٍ
    // بالدرس، وإعادة المكتبة كاملة كانت ستُرفق كل ملف سابق بلا أن يطلبه أحد.
    const added: StoredFileRow[] = [];
    for (const path of result.filePaths) {
      const name = path.split(/[\\/]/).pop() ?? path;
      try {
        const copied = await fileStore().add(path, {
          onProgress: (progress) => {
            send(event, { name, copied: progress.copied, total: progress.total, done: false, failed: false });
          },
        });
        const row = repositories().files.register({
          name: copied.name,
          kind: copied.kind,
          mimeType: copied.mimeType,
          sizeBytes: copied.sizeBytes,
          storageName: copied.storageName,
          sha256: copied.sha256,
        });
        added.push(toStoredFile(row));
        send(event, { name, copied: copied.sizeBytes, total: copied.sizeBytes, done: true, failed: false });
      } catch {
        send(event, { name, copied: 0, total: 0, done: true, failed: true });
      }
    }

    return added;
  });

  /**
   * الحذف — حوار `T18DeleteWarn` بمخرجيه.
   * `guarded` يرفض ويعيد المواضع بأسمائها، و`cascade` يحذف ويفكّ الارتباط.
   * وحذف النسخة من القرص بعد نجاح حذف الصفّ لا قبله.
   */
  handle(IPC.filesRemove, removeFileSchema, async (input): Promise<RemoveFileResult> => {
    try {
      const removed =
        input.mode === 'cascade'
          ? repositories().files.removeWithLinks(input.id)
          : repositories().files.remove(input.id);
      await fileStore().remove(removed.storageName);
      return { status: 'removed' };
    } catch (error) {
      if (error instanceof FileInUseError) {
        return {
          status: 'in_use',
          message: error.message,
          usedBy: repositories().files.usage(input.id),
        };
      }
      throw error;
    }
  });

  handle<undefined, OpenPathResult>(IPC.filesOpenFolder, null, async () => {
    const error = await shell.openPath(fileStore().directory);
    return error === ''
      ? { status: 'opened' }
      : { status: 'failed', message: 'تعذّر فتح المجلد على هذا الجهاز.' };
  });

  handle(IPC.lessonAttachments, lessonIdSchema, (input): StoredFileRow[] => {
    const attached = repositories().lessons.listAttachments(input.id);
    return attached.map(toStoredFile);
  });

  handle(IPC.lessonAttach, attachToLessonSchema, (input): StoredFileRow[] => {
    repositories().lessons.replaceAttachments(input.lessonId, input.fileIds);
    return repositories().lessons.listAttachments(input.lessonId).map(toStoredFile);
  });

  /* ── الرئيسية — T05 ───────────────────────────────── */

  handle<undefined, HomeState>(IPC.homeState, null, () => homeState());

  /* ── الطلاب — T11 ─────────────────────────────────── */

  handle(IPC.rosterList, classIdSchema, (input): RosterState => rosterState(input.classId));

  handle(IPC.rosterRename, renameStudentSchema, (input): RosterRow => {
    const identifier = input.identifier === undefined || input.identifier === '' ? null : input.identifier;
    const updated = repositories().students.rename(input.id, input.name, identifier);
    return toRosterRow(updated, null);
  });

  /**
   * إجراءان لا واحد: «إخراجه من الحصة» يُبطل رمزه ويبقيه في الفصل، و«إزالته
   * من الفصل» علامةٌ لا حذف — حذفه يجرّ إجاباته فتصير نتائج الفصل ناقصة بلا
   * تفسير.
   */
  handle(IPC.rosterAction, studentActionSchema, (input): RosterState => {
    const student = repositories().students.get(input.id);
    const active = repositories().sessions.active();

    if (input.action === 'kick') {
      if (active !== undefined) repositories().sessions.revokeStudent(active.id, input.id);
    } else {
      if (active !== undefined) repositories().sessions.revokeStudent(active.id, input.id);
      repositories().students.remove(input.id);
    }

    return rosterState(student.classId);
  });

  /* ── طلبات الدخول — T10 ───────────────────────────── */

  handle(IPC.requestsList, classIdSchema, (input): RequestsState => requestsState(input.classId));

  /**
   * القرار نقرة واحدة بلا حوار تأكيد — مقياس §3: «الموافقة سريعة جداً».
   * القبول ينشئ الطالب داخل معاملة، والتراجع متاح على الرفض وحده.
   */
  handle(IPC.requestDecide, decideRequestSchema, (input): RequestRow => {
    const sessions = repositories().sessions;
    if (input.decision === 'approve') sessions.approveRequest(input.id);
    else if (input.decision === 'reject') sessions.setRequestStatus(input.id, 'rejected');
    else sessions.setRequestStatus(input.id, 'pending');

    return toRequestRow(sessions.getRequest(input.id), false);
  });

  /**
   * «قبول الكل» — حصة من ٢٥ طالباً بلا هذا الزر تعني ٢٥ نقرة.
   *
   * العدد المتوقَّع يصل من الشاشة: طلبٌ جديد وصل بين رسم الزر والنقر عليه كان
   * سيُقبل بلا أن يراه المعلم، وهو قبولٌ لم يقرّره.
   */
  handle(IPC.requestsApproveAll, approveAllSchema, (input): RequestsState => {
    const state = requestsState(input.classId);
    if (state.state !== 'open' || state.pending.length !== input.expected) return state;

    // معاملة واحدة للدفعة كلها — لا معاملةٌ لكل طالب في مسار بداية الحصة.
    repositories().sessions.approveMany(state.pending.map((row) => row.id));
    return requestsState(input.classId);
  });

  /**
   * مفتاح مساعدة الطالب لهذا الفصل — قرار D10.
   * القاطع العام في T19 يبقى فوقه: فتحُ الفصل لا يفتح شيئاً وهو مطفأ.
   */
  handle(IPC.classesStudentAi, classStudentAiSchema, (input): ClassSummary => {
    repositories().classes.setStudentAiEnabled(input.id, input.enabled);
    return summaryOf(input.id);
  });

  /* ── الدروس — T12 · T13 ───────────────────────────── */

  handle(IPC.lessonsList, classIdSchema, (input): TeacherLessonSummary[] => {
    const stats = repositories().lessons.stats(input.classId);
    return repositories()
      .lessons.listByClass(input.classId)
      .map((row) => toLessonSummary(row, stats.get(row.id)));
  });

  handle(IPC.lessonGet, lessonIdSchema, (input): TeacherLessonDetail => lessonDetail(input.id));

  /**
   * من لم يقرأ الدرس — أسماءٌ لا عدد.
   *
   * والمسودة تُردّ حالةً لا قائمةً فارغة: درسٌ لم يُنشر لم يره أحد بحكم
   * `FR-009`، فقائمةٌ بكل الفصل تحته تتّهم الطلاب بما لم يفعلوه.
   */
  handle(IPC.lessonUnread, lessonIdSchema, (input): UnreadStudents => {
    const lesson = repositories().lessons.get(input.id);
    if (lesson.status !== 'published') return { status: 'draft' };

    return {
      status: 'published',
      roster: repositories().students.listByClass(lesson.classId).length,
      students: repositories()
        .lessons.unreadStudents(lesson.id)
        .map((student) => ({ id: student.id, name: student.name })),
    };
  });

  handle(IPC.lessonCreate, createLessonSchema, (input): TeacherLessonDetail => {
    const created = repositories().lessons.create({ classId: input.classId, title: input.title });
    return lessonDetail(created.id);
  });

  handle(IPC.lessonUpdate, updateLessonSchema, (input): TeacherLessonDetail => {
    repositories().lessons.update(input.id, {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.blocks === undefined ? {} : { blocks: input.blocks }),
    });
    return lessonDetail(input.id);
  });

  /**
   * النشر وإلغاؤه — FR-009.
   * التصفية التي تحمي المسودة تعيش في استعلام `listPublished` لا هنا: هذه
   * القناة تغيّر الحالة فقط، وما يراه الطالب يُقرَّر في القاعدة.
   */
  handle(IPC.lessonPublish, publishLessonSchema, (input): TeacherLessonDetail => {
    repositories().lessonWorkspaces.setPublished(input.id, input.published);
    return lessonDetail(input.id);
  });

  handle(IPC.lessonDuplicate, lessonIdSchema, (input): TeacherLessonDetail => {
    const copy = repositories().lessons.duplicate(input.id);
    return lessonDetail(copy.id);
  });

  handle(IPC.lessonDelete, lessonIdSchema, (input): { removed: string } => {
    repositories().lessons.remove(input.id);
    return { removed: input.id };
  });

  /* ── الأنشطة — T15 · T16 ──────────────────────────── */

  handle(IPC.activitiesList, classIdSchema, (input): TeacherActivitySummary[] => {
    const tally = repositories().activities.tally(input.classId);
    const roster = repositories().activities.rosterSize(input.classId);
    return repositories()
      .activities.listByClass(input.classId)
      .map((row) => toActivitySummary(row, tally.get(row.id), roster));
  });

  handle(IPC.activityGet, activityIdSchema, (input): TeacherActivityDetail =>
    activityDetail(input.id),
  );

  handle(IPC.activityCreate, createActivitySchema, (input): TeacherActivityDetail => {
    const created = repositories().activities.create({
      classId: input.classId,
      title: input.title,
      lessonId: input.lessonId ?? null,
    });
    return activityDetail(created.id);
  });

  /**
   * حفظ النشاط — العنوان والدرس المرتبط والأسئلة في نداء واحد.
   *
   * الأسئلة تُستبدل داخل معاملة واحدة في المستودع، فحفظٌ يفشل في منتصفه لا
   * يترك النشاط بنصف أسئلته.
   */
  handle(IPC.activityUpdate, updateActivitySchema, (input): TeacherActivityDetail => {
    repositories().activities.update(input.id, {
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.lessonId === undefined ? {} : { lessonId: input.lessonId }),
    });
    if (input.questions !== undefined) {
      repositories().activities.replaceQuestions(input.id, input.questions.map(toStoredQuestion));
    }
    return activityDetail(input.id);
  });

  /**
   * النشر وإلغاؤه — FR-012.
   *
   * المنع هنا لا في الشاشة وحدها: نشاطٌ بسؤال بلا نصّ أو بسؤال اختيار بلا
   * إجابة معلَّمة يصل الطالب سؤالاً لا جواب له. و`publishBlockers` هي القاعدة
   * نفسها التي ترسمها `T16`، فلا تختلف الرسالتان.
   */
  handle(IPC.activityPublish, publishActivitySchema, (input): TeacherActivityDetail => {
    if (input.published) {
      const draft = activityDetail(input.id);
      const problems = publishBlockers(draft);
      if (problems.length > 0) throw new Error(`لا يمكن نشر النشاط بعد. ${problems[0] ?? ''}`);
    }
    repositories().activities.setPublished(input.id, input.published);
    return activityDetail(input.id);
  });

  /** البوّابة الثالثة في قرار D10 — مفتاح النشاط، فوقه مفتاح الفصل والقاطع العام. */
  handle(IPC.activityStudentAi, activityStudentAiSchema, (input): TeacherActivityDetail => {
    repositories().activities.setStudentAiEnabled(input.id, input.enabled);
    return activityDetail(input.id);
  });

  handle(IPC.activityDelete, activityIdSchema, (input): { removed: string } => {
    repositories().activities.remove(input.id);
    return { removed: input.id };
  });

  /**
   * توليد أسئلة من درس — FR-012 · `T16AiGenerate`.
   *
   * **هذه القناة لا تكتب في القاعدة.** تقرأ الدرس، وتنادي المزوّد، وتعيد
   * اقتراحات بمعرّفات جديدة. الإدراج يمرّ بـ`activities:update` كأي تعديل
   * يكتبه المعلم بيده — فـ«إدراج ما يُحدَّد فقط» ليس شرطاً في الشاشة، بل أن
   * لا مسار هنا يكتب شيئاً أصلاً.
   *
   * والدرس يُقرأ من فصل النشاط نفسه: معرّفٌ مبدَّل في المدخل لا يقرأ درس فصل
   * آخر.
   */
  handle(IPC.activityGenerate, generateQuestionsSchema, async (input): Promise<GeneratedQuestions> => {
    const active = activeModel();
    if (active === null) return { status: 'no_provider' };

    const activity = repositories().activities.get(input.activityId);
    const lesson = repositories().lessons.get(input.lessonId);
    if (lesson.classId !== activity.classId) {
      throw new Error('هذا الدرس ليس في فصل هذا النشاط.');
    }

    const content = lessonPlainText(lesson);
    if (content.trim() === '') {
      return {
        status: 'empty',
        message: 'هذا الدرس بلا محتوى بعد — اكتب فيه شيئاً ثم ولّد منه أسئلة.',
      };
    }

    const entry = { controller: new AbortController(), timedOut: false };
    running.set(input.requestId, entry);
    const timer = setTimeout(() => {
      entry.timedOut = true;
      entry.controller.abort();
    }, AI_TIMEOUT_MS);

    try {
      const result = await aiRegistry().complete({
        modelId: formatModelId(active.provider, active.model),
        messages: buildQuestionMessages({ content, count: input.count, type: input.type }),
        signal: entry.controller.signal,
      });

      repositories().ai.recordUsage({
        provider: active.provider,
        model: active.model,
        tokens: result.tokens ?? null,
      });

      const parsed = parseQuestions(result.text, { type: input.type, limit: input.count });
      const questions = parsed.questions.map(toDraftQuestion);
      if (questions.length === 0) {
        return {
          status: 'empty',
          message: 'لم يعد مزوّدك أسئلة يمكن قراءتها. أعد المحاولة، أو اكتب السؤال بنفسك.',
        };
      }

      return {
        status: 'ok',
        questions,
        provider: active.provider,
        model: active.model,
        ...(result.tokens === undefined ? {} : { tokens: result.tokens }),
        // ما وصل وسقط — لا ما طُلب ولم يصل. والفرق بينهما يقرؤه المعلم حكماً
        // على درسه، فلا يُخلطان.
        dropped: parsed.dropped,
      };
    } catch (error) {
      if (entry.timedOut) {
        return {
          status: 'failed',
          reason: 'timeout',
          message: new AiFailure('timeout').message,
          action: 'retry',
        };
      }
      if (entry.controller.signal.aborted) return { status: 'cancelled' };

      const reason = error instanceof AiFailure ? error.reason : reasonForThrown(error);
      if (reason === 'rejected_key') {
        repositories().ai.upsert({
          provider: active.provider,
          label: PROVIDER_LABELS[active.provider],
          status: 'error',
        });
      }
      return {
        status: 'failed',
        reason,
        message: new AiFailure(reason).message,
        action: reason === 'rejected_key' ? 'open_settings' : 'retry',
      };
    } finally {
      clearTimeout(timer);
      running.delete(input.requestId);
    }
  });


  /**
   * اقتراح تقييم لإجابة نصّية — `T17Review`.
   *
   * **مسوّدة تُعرض، لا درجة تُحفظ.** لا يكتب هذا المسار في القاعدة شيئاً:
   * يقرأ، ويسأل المزوّد، ويعيد. والحفظ يبقى على زرّ المعلم نفسه — فالدرجة
   * التي تصل الطالب يكتبها معلمه لا آلة.
   *
   * والمفتاح والسؤال وإجابة الطالب تُقرأ **من القاعدة** لا من الطلب: واجهةٌ
   * تُرسل مفتاح الإجابة تعني مساراً يستطيع أن يزوّره.
   */
  handle(
    IPC.activitySuggestReview,
    suggestReviewSchema,
    async (input): Promise<ReviewSuggestionResult> => {
      const active = activeModel();
      if (active === null) return { status: 'no_provider' };

      const detail = repositories().submissions.detail(input.submissionId);
      const answer = detail.answers.find((one) => one.questionId === input.questionId);
      if (answer === undefined || answer.type !== 'text') {
        return {
          status: 'unreadable',
          message: 'هذا السؤال ليس نصّياً — أسئلة الاختيار تُصحَّح بمفتاحها.',
        };
      }
      if (answer.studentAnswer.trim() === '') {
        return {
          status: 'unreadable',
          message: 'لم يكتب الطالب إجابة عن هذا السؤال.',
        };
      }

      const entry = { controller: new AbortController(), timedOut: false };
      running.set(input.requestId, entry);
      const timer = setTimeout(() => {
        entry.timedOut = true;
        entry.controller.abort();
      }, AI_TIMEOUT_MS);

      try {
        const result = await aiRegistry().complete({
          modelId: formatModelId(active.provider, active.model),
          messages: buildReviewMessages({
            question: answer.prompt,
            expectedAnswer: answer.expectedAnswer,
            studentAnswer: answer.studentAnswer,
          }),
          signal: entry.controller.signal,
        });

        repositories().ai.recordUsage({
          provider: active.provider,
          model: active.model,
          tokens: result.tokens ?? null,
        });

        const parsed = parseReviewSuggestion(result.text);
        if (parsed.grade === null && parsed.comment === null) {
          return {
            status: 'unreadable',
            message: 'لم يعد مزوّدك تقييماً يمكن قراءته. أعد المحاولة، أو صحّح بنفسك.',
          };
        }

        return {
          status: 'ok',
          grade: parsed.grade,
          comment: parsed.comment,
          provider: active.provider,
          model: active.model,
          ...(result.tokens === undefined ? {} : { tokens: result.tokens }),
        };
      } catch (error) {
        if (entry.timedOut) {
          return {
            status: 'failed',
            reason: 'timeout',
            message: new AiFailure('timeout').message,
            action: 'retry',
          };
        }
        if (entry.controller.signal.aborted) return { status: 'cancelled' };

        const reason = error instanceof AiFailure ? error.reason : reasonForThrown(error);
        if (reason === 'rejected_key') {
          repositories().ai.upsert({
            provider: active.provider,
            label: PROVIDER_LABELS[active.provider],
            status: 'error',
          });
        }
        return {
          status: 'failed',
          reason,
          message: new AiFailure(reason).message,
          action: reason === 'rejected_key' ? 'open_settings' : 'retry',
        };
      } finally {
        clearTimeout(timer);
        running.delete(input.requestId);
      }
    },
  );


  /**
   * توزيع إجابات نشاط الاختيار — قراءةٌ محضة، ولا مزوّد فيها.
   *
   * لا مفتاح ولا شبكة: عدٌّ على بيانات المعلم عنده. فالمعلم الذي لم يضبط
   * مفتاحاً يرى هذا كاملاً — بخلاف اقتراح التقييم.
   */
  handle(IPC.activityChoiceBreakdown, activityIdSchema, (input): ChoiceBreakdownResult => {
    const breakdown = repositories().submissions.choiceBreakdown(input.id);
    // القراءة تعود بمصفوفات `readonly`، والعقد يطلبها قابلة للنقل عبر IPC.
    return {
      submitted: breakdown.submitted,
      staleAnswers: breakdown.staleAnswers,
      questions: breakdown.questions.map((question) => ({
        ...question,
        topWrong: question.topWrong === null ? null : { ...question.topWrong },
        options: question.options.map((option) => ({ ...option })),
      })),
    };
  });


  /**
   * نسخ نشاط إلى فصل آخر.
   *
   * الفصل الهدف يُتحقَّق من وجوده هنا لا في القاعدة: معرّفٌ لا فصل له يُنشئ
   * نشاطاً يتيماً لا يظهر في أي شاشة — وهو أسوأ من رفضٍ صريح.
   */
  handle(IPC.activityCopy, copyActivitySchema, (input): TeacherActivitySummary => {
    repositories().classes.get(input.targetClassId);
    const copy = repositories().activities.copyToClass(input.id, input.targetClassId);
    const tally = repositories().activities.tally(copy.classId);
    const roster = repositories().students.listByClass(copy.classId).length;
    return toActivitySummary(copy, tally.get(copy.id), roster);
  });


  /**
   * تصدير نتائج نشاط إلى ملفّ CSV بجانب النسخ الاحتياطية.
   *
   * الصفوف من `activitySubmissions` نفسه الذي يراه المعلم على الشاشة، فما
   * يُصدَّر هو ما يقرأ — لا استعلامٌ ثانٍ قد يختلف عنه.
   */
  handle(IPC.activityExportResults, activityIdSchema, async (input): Promise<ExportedResults> => {
    const state = openData('افتح بياناتك أولاً قبل التصدير.');

    const activity = repositories().activities.get(input.id);
    const detail = activityDetail(input.id);

    /*
     * خريطة الخيارات مرة واحدة لكل النشاط — لا استعلامٌ لكل إجابة.
     * فالتصدير يقرأ الفصل كلّه، والبحث عن نصّ كل خيار على حدة يجعل الكلفة
     * حاصلَ ضرب الطلاب في الأسئلة.
     */
    const optionText = new Map<string, string>();
    for (const question of detail.questions) {
      if (question.type !== 'choice') continue;
      for (const option of question.options) optionText.set(option.id, option.text);
    }

    const roster = repositories().students.listByClass(activity.classId);
    const submitted = new Map(
      repositories()
        .submissions.listByActivity(activity.id)
        .map((row) => [row.submission.studentId, row]),
    );
    /*
     * وإجابات الفصل كلّه مرة واحدة كذلك.
     *
     * كانت تُقرأ بنداءٍ لكل طالب داخل الحلقة أدناه — وهو ما تنفيه الملاحظة
     * فوق خريطة الخيارات عن الخيارات ثم يقع في الإجابات. والتصدير هو المسار
     * الوحيد الذي يقرأ الفصل كلّه، فهو الموضع الذي تظهر فيه الكلفة.
     */
    const answersBySubmission = repositories().submissions.answersByActivity(activity.id);

    // الفصل كلّه لا المسلِّمون وحدهم: «لم يرسل» صفٌّ يحتاجه المعلم في ملفّه.
    const rows = roster.map((student) => {
      const found = submitted.get(student.id);
      if (found === undefined) {
        return {
          studentName: student.name,
          status: 'missing' as const,
          submittedAt: null,
          score: null,
        };
      }

      const answers: Record<string, string> = {};
      for (const answer of answersBySubmission.get(found.submission.id) ?? []) {
        const text = answer.text ?? (answer.optionId === null ? null : optionText.get(answer.optionId));
        // خيارٌ حذفه المعلم بعد التسليم: يُقال ولا يُترك فراغاً يُقرأ إهمالاً.
        answers[answer.questionId] = text ?? '(خيار محذوف)';
      }

      return {
        studentName: student.name,
        status: found.submission.status as ResultsCsvRow['status'],
        // التاريخ نصّاً: العقد يعبر IPC، و`Date` لا تنجو من التسلسل.
        submittedAt: found.submission.submittedAt.toISOString(),
        score: found.submission.score,
        answers,
      };
    });

    const body = buildResultsCsv({
      questions: detail.questions.map((question) => ({ id: question.id, prompt: question.prompt })),
      rows,
    });

    const directory = await exportsDirectory(state.dataDirectory);
    const fileName = resultsCsvFileName({ activityTitle: activity.title, at: new Date().toISOString() });
    const path = join(directory, fileName);
    await writeFile(path, body, 'utf8');

    return { path, fileName, rows: rows.length };
  });

  /** يفتح مجلد الصادرات — المعلم يجد ملفّه بلا أن يُملى عليه مسار. */
  handle<undefined, OpenPathResult>(IPC.activityOpenExports, null, async () => {
    const state = storeState();
    if (state.status !== 'open') {
      return { status: 'failed', message: 'افتح بياناتك أولاً.' };
    }
    const directory = await exportsDirectory(state.dataDirectory);
    const error = await shell.openPath(directory);
    return error === ''
      ? { status: 'opened' }
      : { status: 'failed', message: 'تعذّر فتح المجلد على هذا الجهاز.' };
  });

/* ── المراجعة والتصحيح — T17 ──────────────────────── */

  /**
   * جدول `T17Submissions` — الفصل كلّه لا المسلِّمون وحدهم.
   *
   * الطالب المُخرَج من الفصل لا يُعدّ ولا يُعرض: معلمٌ يرى «لم يرسل بعد» أمام
   * اسم أخرجه بنفسه ينتظر إجابةً لن تأتي.
   */
  handle(IPC.activitySubmissions, activityIdSchema, (input): ActivitySubmissions => {
    const activity = repositories().activities.get(input.id);
    const roster = repositories().students.listByClass(activity.classId);
    const submitted = new Map(
      repositories()
        .submissions.listByActivity(activity.id)
        .map((row) => [row.submission.studentId, row.submission]),
    );

    const rows = roster.map((student) => {
      const found = submitted.get(student.id);
      if (found === undefined) {
        return {
          studentId: student.id,
          studentName: student.name,
          submissionId: null,
          submittedAt: null,
          status: 'missing' as const,
          score: null,
        };
      }
      return {
        studentId: student.id,
        studentName: student.name,
        submissionId: found.id,
        submittedAt: found.submittedAt.toISOString(),
        status: found.status === 'reviewed' ? ('reviewed' as const) : ('submitted' as const),
        score: found.score,
      };
    });

    return {
      activityId: activity.id,
      title: activity.title,
      status: activity.status === 'published' ? 'published' : 'draft',
      submitted: rows.filter((row) => row.status !== 'missing').length,
      roster: rows.length,
      pending: rows.filter((row) => row.status === 'submitted').length,
      reviewed: rows.filter((row) => row.status === 'reviewed').length,
      missing: rows.filter((row) => row.status === 'missing').length,
      rows,
    };
  });

  handle(IPC.submissionGet, submissionIdSchema, (input): SubmissionDetail => {
    const detail = repositories().submissions.detail(input.id);
    const activity = repositories().activities.get(detail.submission.activityId);
    return {
      submissionId: detail.submission.id,
      activityId: activity.id,
      activityTitle: activity.title,
      studentName: detail.studentName,
      submittedAt: detail.submission.submittedAt.toISOString(),
      status: detail.submission.status === 'reviewed' ? 'reviewed' : 'submitted',
      score: detail.submission.score,
      comment: detail.submission.comment,
      answers: detail.answers,
    };
  });

  /**
   * حفظ التصحيح — «حفظ والانتقال للتالي» و«حفظ والبقاء هنا» في `T17Review`.
   * الفرق بين الزرّين في الواجهة وحدها: كلاهما هذه الكتابة نفسها.
   */
  handle(IPC.submissionReview, reviewSubmissionSchema, (input): SubmissionDetail => {
    repositories().submissions.review(input.submissionId, {
      score: input.score,
      comment: input.comment ?? null,
    });
    const detail = repositories().submissions.detail(input.submissionId);
    const activity = repositories().activities.get(detail.submission.activityId);
    return {
      submissionId: detail.submission.id,
      activityId: activity.id,
      activityTitle: activity.title,
      studentName: detail.studentName,
      submittedAt: detail.submission.submittedAt.toISOString(),
      status: detail.submission.status === 'reviewed' ? 'reviewed' : 'submitted',
      score: detail.submission.score,
      comment: detail.submission.comment,
      answers: detail.answers,
    };
  });

  /* ── بوابة الطالب — T09 ───────────────────────────── */

  handle(IPC.copyText, copyTextSchema, (input): { copied: true } => {
    clipboard.writeText(input.text);
    return { copied: true };
  });

  handle<undefined, PortalStatus>(IPC.portalStatus, null, () => portalStatus());
  handle(IPC.portalStart, startPortalSchema, (input): Promise<PortalStatus> =>
    startPortal(input.classId),
  );
  handle<undefined, PortalStatus>(IPC.portalStop, null, () => stopPortal());

  /* ── جدار الحماية — §22 · T21 · T09NoLan ──────────── */

  /**
   * «فتح إعدادات جدار الحماية».
   *
   * يفتح شاشة النظام ولا يعدّل قاعدةً بنفسه: تعديل إعدادات أمان الجهاز يحتاج
   * صلاحية مسؤول، وطلبُ رفع الصلاحيات من معلم وسط حصة أسوأ من المشكلة نفسها.
   * القرار يبقى عنده، في شاشة نظامه، بلغة نظامه.
   */
  handle<undefined, OpenPathResult>(IPC.openFirewallSettings, null, async () => {
    try {
      if (process.platform === 'win32') {
        // شاشة «الشبكة وجدار الحماية» في أمن ويندوز.
        await shell.openExternal('windowsdefender://network');
        return { status: 'opened' };
      }
      if (process.platform === 'darwin') {
        await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Firewall');
        return { status: 'opened' };
      }
      return {
        status: 'failed',
        message: 'افتح إعدادات جدار الحماية في نظامك ثم اسمح لـ CubeCroom.',
      };
    } catch {
      return {
        status: 'failed',
        message: 'تعذّر فتح شاشة جدار الحماية. افتحها من إعدادات نظامك ثم اسمح لـ CubeCroom.',
      };
    }
  });

/* ── النسخ الاحتياطي والاستعادة — T20 · FR-015 ────── */

  handle<undefined, BackupState>(IPC.backupState, null, () => backupState());

  /** «إنشاء نسخة احتياطية الآن». */
  handle<undefined, BackupState>(IPC.backupCreate, null, async () => {
    const state = openData('النسخ الاحتياطي غير متاح قبل فتح البيانات.');

    await takeBackup(defaultBackupsDirectory(state.dataDirectory));
    return backupState();
  });

  handle(IPC.backupDelete, backupPathSchema, async (input): Promise<BackupState> => {
    await deleteBackup(insideBackups(input.path));
    return backupState();
  });

  handle<undefined, OpenPathResult>(IPC.backupOpenFolder, null, async () => {
    const state = storeState();
    if (state.status !== 'open') return { status: 'failed', message: 'لم تُفتح بياناتك بعد.' };
    const directory = defaultBackupsDirectory(state.dataDirectory);
    await mkdir(directory, { recursive: true });
    const error = await shell.openPath(directory);
    return error === '' ? { status: 'opened' } : { status: 'failed', message: error };
  });

  /**
   * معاينة الاستعادة — «سيُفقد كل ما أُنشئ بعد ذلك الوقت».
   *
   * تُحسب **قبل** أن يُعرض زرّ الاستعادة: معلمٌ يقرأ «٣ دروس · ١٢ إجابة» يقرّر
   * قراراً؛ ومعلمٌ يقرأ «ستُستبدل بياناتك» يقامر.
   */
  handle(IPC.restorePreview, backupPathSchema, async (input): Promise<RestorePreview> => {
    const report = await verifyBackup(insideBackups(input.path), { deep: true });
    if (report.status === 'damaged' || report.manifest === undefined) {
      return { status: 'refused', message: report.reason ?? 'هذه النسخة لا تصلح للاستعادة.' };
    }
    if (report.manifest.schemaVersion > SCHEMA_VERSION) {
      return {
        status: 'refused',
        message: 'هذه النسخة أُخذت بإصدار أحدث من CubeCroom. حدِّث التطبيق أولاً ثم أعد المحاولة.',
      };
    }

    const state = storeState();
    const current =
      state.status === 'open'
        ? repositories().stats.contents()
        : { classes: 0, lessons: 0, activities: 0, submissions: 0, files: 0, fileBytes: 0 };

    return {
      status: 'ready',
      createdAt: (report.createdAt ?? new Date()).toISOString(),
      loss: describeLoss(current, report.manifest.contents),
    };
  });

  /**
   * الاستعادة — FR-015.
   *
   * القاعدة تُغلق قبل استبدال ملفها: SQLite مفتوحة على ملف يُستبدل تحتها تعطي
   * قاعدةً نصفَ محمّلة لا خطأً واضحاً. وبعد النجاح **يُعاد تشغيل التطبيق**، لا
   * لأن ذلك أسهل، بل لأن كل ما في الذاكرة — الحصة والمستودعات والشاشات —
   * يخصّ بياناتٍ لم تعد موجودة.
   */
  handle(IPC.restoreRun, backupPathSchema, async (input): Promise<RestoreResultView> => {
    const state = openData('الاستعادة غير متاحة قبل فتح البيانات.');

    const dataDirectory = state.dataDirectory;
    const backupsRoot = defaultBackupsDirectory(dataDirectory);
    const archivePath = insideBackups(input.path);
    const liveStore = fileStore();

    // الحصة تُنهى أولاً: خادمٌ يقرأ قاعدةً تُستبدل تحته يخدم الطلاب بياناتٍ
    // نصفَ مكتوبة — واللوح يقول للمعلم «أنهِ أي جلسة دخول مفتوحة أولاً».
    await stopPortal();

    const result = await restoreBackup({
      archivePath,
      dataDirectory,
      appSchemaVersion: SCHEMA_VERSION,
      safetyBackup: async () => {
        const summary = await takeBackup(backupsRoot, liveStore);
        // القاعدة تُغلق بعد أخذ النسخة الوقائية مباشرةً وقبل أي استبدال.
        closeStore();
        return { path: summary.path };
      },
    });

    if (result.status === 'refused') return { status: 'refused', message: result.message };

    // ما في الذاكرة يخصّ بياناتٍ لم تعد موجودة — فيُعاد التشغيل لا يُحدَّث.
    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1200);

    return { status: 'restored', safetyBackupPath: result.safetyBackupPath };
  });

/* ── التعافي من قاعدة لا تُفتح — §22 · T01States/٣ ── */

  /**
   * النسخ المتاحة للاسترجاع **قبل فتح البيانات**.
   *
   * شاشة `T20` تحتاج قاعدةً مفتوحة، وهذا المسار لا يملكها: القاعدة هي العطل.
   * فالقائمة تُقرأ من القرص مباشرةً — مجلد النسخ بجانب مجلد البيانات، ولا
   * علاقة له بالقاعدة أصلاً.
   */
  handle<undefined, BackupRow[]>(IPC.recoveryList, null, async () => {
    const config = await readConfig();
    if (!config) return [];

    const reports = await listBackups(defaultBackupsDirectory(config.dataDirectory));
    return reports.map((row) => ({
      path: row.path,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt?.toISOString() ?? null,
      sizeBytes: row.sizeBytes,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      ...(row.manifest === undefined ? {} : { contents: row.manifest.contents }),
    }));
  });

  /**
   * الاسترجاع من قاعدة لا تُفتح.
   *
   * **الأمان هنا يأخذ شكلاً آخر ولا يسقط:** `createBackup` يقرأ من القاعدة،
   * والقاعدة تالفة — فبدل نسخةٍ منها تُعزَل ملفات المعلم إلى مجلد مؤرَّخ
   * بجانبها **ولا تُحذف**. فإن تبيّن أن التلف في مكان آخر، أو أن النسخة
   * المستعادة أسوأ، فعمله كله باقٍ حيث يستطيع أن يريه لمن يفهم.
   */
  handle(IPC.recoveryRestore, backupPathSchema, async (input): Promise<RestoreResultView> => {
    const config = await readConfig();
    if (!config) {
      return { status: 'refused', message: 'لم نعثر على مكان بياناتك. أعد الإعداد من البداية.' };
    }

    const root = defaultBackupsDirectory(config.dataDirectory);
    if (!isInsideDirectory(root, input.path)) {
      return { status: 'refused', message: new PathOutsideError('النسخ الاحتياطية').message };
    }

    // القاعدة قد تكون مفتوحةً جزئياً من محاولة الإقلاع — تُغلق قبل أي نقل.
    closeStore();

    let quarantined: string | null = null;
    const result = await restoreBackup({
      archivePath: input.path,
      dataDirectory: config.dataDirectory,
      appSchemaVersion: SCHEMA_VERSION,
      safetyBackup: async () => {
        const moved = await quarantineData(config.dataDirectory);
        quarantined = moved.path;
        return { path: moved.path };
      },
    });

    if (result.status === 'refused') return { status: 'refused', message: result.message };

    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 1200);

    return { status: 'restored', safetyBackupPath: quarantined ?? result.safetyBackupPath };
  });

  /* ── تشخيص الاتصال — T21 ──────────────────────────── */

  /**
   * FR-016 — «إجراء بجانب كل مشكلة، وبلغة غير تقنية».
   *
   * هنا تُجمع الوقائع وحدها؛ والحكم عليها في `buildDiagnostics` وهي دالة
   * صافية مفحوصة. الفصل مقصود: شاشة التشخيص هي الشاشة التي يتّبعها المعلم حين
   * يفشل كل شيء آخر، فلا يجوز أن يكون منطقها هو الوحيد غير المفحوص.
   *
   * ولا يُدّعى فحصٌ لم يجرِ: جهاز المعلم لا يستطيع أن يفحص جدار حمايته على
   * نفسه — الاتصال بعنوانه من داخله لا يمرّ بالجدار أصلاً. فالدليل الوحيد
   * المتاح هو **مرور طلبٍ حقيقي من الشبكة**، وهو ما يُقرأ هنا.
   */
  /**
   * تصدير سجلّ التشخيص ملفَّ نصٍّ يرسله المعلم لمن يدعمه.
   *
   * **ولماذا ملفّ لا شاشة تُصوَّر:** المعلم غير التقنيّ يُطلب منه اليوم أن
   * يصف عطلاً لا يفهمه. وصورةُ شاشةٍ تُظهر الخلاصة وتُخفي ما تحتها.
   *
   * **وكل سطر يمرّ بـ`redactSecrets` قبل أن يُكتب** — الملفّ يُرسل بالبريد أو
   * بالواتساب إلى من لا نعرفه، ومفتاح المزوّد لا يجوز أن يسافر معه
   * (`SEC-005`). وسجلّ الأعطال مكتوبٌ منقّىً أصلاً، والتنقية هنا تكرارٌ
   * مقصود: طبقتان أرخص من تسريبٍ واحد.
   */
  handle<undefined, ExportedResults>(IPC.diagnosticsExport, null, async () => {
    const state = openData('افتح بياناتك أولاً.');

    const facts = await diagnosticsNow();
    const crash = await readCrashLog(state.dataDirectory);

    const lines = [
      'تشخيص CubeCroom',
      `وقت التصدير: ${new Date().toISOString()}`,
      `الخلاصة: ${facts.headline}`,
      `سليم: ${facts.ok} · مشكلات: ${facts.problems} · لم يُفحص: ${facts.unresolved}`,
      '',
      '— الفحوص —',
      ...facts.checks.map((check) => `[${check.state}] ${check.title}: ${check.detail}`),
      '',
      '— سجلّ الأعطال —',
      crash === null || crash.trim() === '' ? 'لا أعطال مسجّلة.' : crash,
    ];

    const body = redactSecrets(lines.join('\n'));

    const directory = await exportsDirectory(state.dataDirectory);
    const fileName = `تشخيص-${new Date().toISOString().slice(0, 10)}.txt`;
    const path = join(directory, fileName);
    await writeFile(path, body, 'utf8');

    return { path, fileName, rows: facts.checks.length };
  });

  /**
   * منفذ بوابة الطالب — يُقرأ ويُكتب في إعدادات الجهاز.
   *
   * ولا يمسّ حصةً قائمة: تغييره يسري عند التشغيل التالي. وقطعُ حصةٍ على
   * ثلاثين طالباً لأن المعلم فتح الإعدادات ليس ما يتوقّعه أحد.
   */
  handle<undefined, StudentPortState>(IPC.studentPortGet, null, async () => {
    const config = await readConfig();
    const status = portalStatus();
    return {
      chosen: config?.studentPort ?? null,
      fallback: DEFAULT_PORT,
      active: status.state === 'running' || status.state === 'unreachable' ? status.port : null,
    };
  });

  handle(IPC.studentPortSet, studentPortSchema, async (input): Promise<StudentPortState> => {
    const config = await readConfig();
    if (config === null) throw new Error('لم تُضبط بيانات التطبيق بعد.');

    // `null` هنا تعني «أعده إلى الافتراضي» — ومكان البيانات لا يُمسّ.
    await updateConfig({ studentPort: input.port });

    const status = portalStatus();
    return {
      chosen: input.port,
      fallback: DEFAULT_PORT,
      active: status.state === 'running' || status.state === 'unreachable' ? status.port : null,
    };
  });

  /**
   * نقل بيانات المعلم إلى مجلد آخر.
   *
   * الترتيب هو الميزة، كما في الاستعادة:
   *   ١. تُنهى الحصة — خادمٌ يقرأ قاعدةً تُنسخ تحته يخدم بياناتٍ نصفَ مكتوبة.
   *   ٢. تُغلق القاعدة — نسخُ ملفّ SQLite مفتوح ينسخ حالةً وسطى.
   *   ٣. يُنسخ كل شيء، ولا يُحذف القديم.
   *   ٤. تُفتح القاعدة من المكان الجديد — فإن لم تُفتح عدنا إلى القديم.
   *
   * والرجوع ممكن دائماً لأن القديم لم يُمسّ. وهذا وحده ما يجعل هذا المسار
   * آمناً على بياناتٍ لا نسخة لها عند أحد.
   */
  handle(IPC.dataMove, moveDataSchema, async (input): Promise<MoveDataResult> => {
    const state = openData('افتح بياناتك أولاً.');

    const from = state.dataDirectory;
    await stopPortal();
    closeStore();

    const result = await moveData({ from, to: input.directory });
    if (result.status === 'refused') {
      // القاعدة تُفتح من مكانها القديم: الرفض لا يترك المعلم بلا بيانات.
      openStore(from);
      await prepareFileStore();
      return result;
    }

    const opened = openStore(result.to);
    if (opened.status !== 'open') {
      // النسخة الجديدة لا تُفتح — نعود إلى القديم الذي لم يُمسّ.
      openStore(from);
      await prepareFileStore();
      return {
        status: 'refused',
        message: 'نُسخت بياناتك لكنها لم تُفتح من المكان الجديد. ما زلت تعمل على القديم.',
      };
    }

    await prepareFileStore();
    await updateConfig({ dataDirectory: result.to });

    return result;
  });

  handle<undefined, Diagnostics>(IPC.diagnostics, null, diagnosticsNow);

  /* ── الإعدادات — T22 ──────────────────────────────── */

  handle<undefined, SettingsState>(IPC.readSettings, null, () => settingsState());

  /**
   * كتابة إعداد واحد ثم إعادة الحالة كاملة.
   *
   * إعادة الحالة لا `void`: الواجهة لا تفترض أن ما أرسلته صار محفوظاً، بل
   * ترسم ما في القاعدة فعلاً. فإن رفض العقد قيمةً أو تغيّر شيء آخر معها،
   * ظهر ذلك بدل أن تعرض الواجهة حالة لا وجود لها.
   */
  handle(IPC.writeSetting, writeSettingSchema, (input): SettingsState => {
    if (input.key === 'updateChannel') {
      changeUpdateChannel(updateChannelSchema.parse(input.value));
      return settingsState();
    }
    repositories().settings.set(input.key, input.value);
    return settingsState();
  });

  handle<undefined, OpenPathResult>(IPC.openDataDirectory, null, async () => {
    const state = storeState();
    if (state.status !== 'open') {
      return { status: 'failed', message: 'مجلد البيانات غير مفتوح بعد.' };
    }
    // النظام يعيد نصّ خطأ فارغاً عند النجاح — هذا عقده لا اختيارنا.
    const error = await shell.openPath(state.dataDirectory);
    return error === ''
      ? { status: 'opened' }
      : { status: 'failed', message: 'تعذّر فتح المجلد على هذا الجهاز.' };
  });
}

/** التواريخ تعبر الجسر نصّاً ISO: `Date` لا ينجو من التسلسل بين العمليتين. */
function toSummary(row: StoredClassSummary): ClassSummary {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    level: row.level,
    description: row.description,
    archivedAt: row.archivedAt === null ? null : row.archivedAt.toISOString(),
    students: row.students,
    lessons: row.lessons,
    activities: row.activities,
    hasDraft: row.hasDraft,
    studentAiEnabled: row.studentAiEnabled,
  };
}

function summaryOf(id: string): ClassSummary {
  const found = repositories()
    .classes.listSummaries({ includeArchived: true })
    .find((row) => row.id === id);
  if (!found) throw new Error('لم نعثر على الفصل بعد حفظه.');
  return toSummary(found);
}

/**
 * حالة مزوّدي الذكاء الاصطناعي كما تراها الشاشة.
 *
 * المفتاح يُقرأ هنا لحظةً واحدة لبناء صورته المقنَّعة ثم يُنسى: لا يُخزَّن في
 * متغيّر ولا يُعاد في الردّ. والقائمة تشمل المزوّدين كلهم لا المربوطين
 * وحدهم — الشاشة تعرض ما يمكن ربطه لا ما رُبط.
 */
async function aiSettings(): Promise<AiSettings> {
  const rows = storeState().status === 'open' ? repositories().ai.list() : [];
  const config = await readConfig();

  const providers: AiSettings['providers'] = await Promise.all(
    PROVIDERS.map(async (provider) => {
      const row = rows.find((one) => one.provider === provider);
      const key = await readKey(provider);
      const status = row?.status;
      const usage =
        storeState().status === 'open'
          ? repositories().ai.usage(provider)
          : { requests: 0, tokens: null, lastUsedAt: null };

      return {
        provider,
        label: PROVIDER_LABELS[provider],
        status:
          status === 'connected' || status === 'error' ? status : ('disconnected' as const),
        defaultModel: row?.defaultModel ?? null,
        baseURL: isLocalProvider(provider) ? config?.aiEndpoints?.[provider] ?? LOCAL_PROVIDER_URLS[provider] : null,
        hasKey: key !== null,
        maskedKey: key === null ? null : maskKey(key),
        connectedAt: row?.connectedAt?.toISOString() ?? null,
        usage: {
          requests: usage.requests,
          tokens: usage.tokens,
          lastUsedAt: usage.lastUsedAt?.toISOString() ?? null,
        },
      };
    }),
  );

  return { encryptionAvailable: encryptionAvailable(), activeProvider: activeModel()?.provider ?? null, providers };
}

/**
 * النداءات الجارية — مفتاحها معرّف يولّده الطالب ليستطيع إلغاء نداءه هو.
 * و`timedOut` تفصل الإيقاف التلقائي عن إلغاء المعلم: كلاهما `abort`، لكن
 * الأول عطل يُبلَّغ والثاني قرارٌ لا يُعرض بوصفه خطأ.
 */
const running = new Map<string, { controller: AbortController; timedOut: boolean }>();

/**
 * سقف انتظار الردّ — NFR-006: «مهلة قابلة للإلغاء».
 * دقيقة تكفي لأطول درس، وما بعدها انتظارٌ لا ينتهي أمام معلم في حصة.
 */
const AI_TIMEOUT_MS = 60_000;


/** حدث تقدّم النسخ — اتجاه واحد من العملية الرئيسية إلى النافذة الطالبة. */
function send(event: IpcMainInvokeEvent, progress: FileProgress): void {
  if (!event.sender.isDestroyed()) event.sender.send(IPC.fileProgress, progress);
}

/**
 * صفّ الملف كما تعرضه T18 — بنوعه المقروء وشارته ومواضع استعماله.
 * التصنيف يُشتق من الاسم لا يُخزَّن مرتين: `kind` في القاعدة للعرض، والشارة
 * والفئة تُحسبان عند القراءة فيبقى مصدرهما واحداً.
 */
function toStoredFile(row: StoredFileRecord): StoredFileRow {
  const classification = classify(row.name);
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    badge: classification.badge,
    category: classification.category,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
    usedBy: repositories().files.usage(row.id),
  };
}

function listFiles(): StoredFileRow[] {
  return repositories().files.list().map(toStoredFile);
}

/**
 * حالة الرئيسية — مصدر واحد للبطاقة وللشريط العلوي معاً.
 *
 * حالة الحصة تُقرأ من `portalStatus` لا من جدول الحصص وحده: الحصة قد تكون
 * مفتوحة في القاعدة والخادم ساقطاً، وما يهمّ المعلم هو أن طلابه يصلون فعلاً.
 *
 * وآخر نسخة احتياطية تُقرأ فحصاً سطحياً: قراءة بصمات ٣١٤ م.ب في كل تحديث
 * للرئيسية تُثقل الجهاز بلا سبب — والفحص العميق مكانه قبل الاستعادة.
 */
async function homeState(): Promise<HomeState> {
  const state = storeState();
  if (state.status !== 'open') {
    return { session: null, requests: [], classes: [], lastBackupAt: null };
  }

  const portal = portalStatus();
  const active = state.repositories.sessions.active();

  let session: HomeState['session'] = null;
  if ((portal.state === 'running' || portal.state === 'unreachable') && active !== undefined) {
    session = {
      classId: portal.classId,
      className: portal.className,
      startedAt: active.startedAt.toISOString(),
      connected: portal.admitted,
      pending: portal.waiting,
      reachable: portal.state === 'running',
    };
  }

  const requests =
    active === undefined
      ? []
      : state.repositories.sessions
          .listRequests(active.id, 'pending')
          .map((row) => toRequestRow(row, false));

  const backups = await listBackups(defaultBackupsDirectory(state.dataDirectory));
  const newest = backups.find((row) => row.status === 'complete');

  return {
    session,
    requests,
    classes: state.repositories.classes.listSummaries().map(toSummary),
    lastBackupAt: newest?.createdAt?.toISOString() ?? null,
  };
}

function toRosterRow(row: StoredStudent, lastSeenAt: Date | null): RosterRow {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    lastSeenAt: lastSeenAt === null ? null : lastSeenAt.toISOString(),
    online: isOnline(lastSeenAt),
  };
}

/**
 * قائمة T11.
 *
 * «متصل الآن» يُحسب من آخر نبضة، والحصة المغلقة تعني الجميع خارج الشبكة —
 * فلا يبقى على الشاشة اتصالٌ انتهى قبل دقائق.
 */
function rosterState(classId: string): RosterState {
  const active = repositories().sessions.active();
  const sessionOpen = active !== undefined && active.classId === classId;
  const lastSeen = sessionOpen && active !== undefined
    ? repositories().sessions.lastSeenByStudent(active.id)
    : new Map<string, Date | null>();

  const students = repositories()
    .students.listByClass(classId)
    .map((row) => toRosterRow(row, lastSeen.get(row.id) ?? null));

  return {
    sessionOpen,
    students,
    online: students.filter((row) => row.online).length,
  };
}

function toRequestRow(row: StoredJoinRequest, similarToAccepted: boolean): RequestRow {
  return {
    id: row.id,
    name: row.name,
    identifier: row.identifier,
    createdAt: row.createdAt.toISOString(),
    status:
      row.status === 'approved' || row.status === 'rejected' || row.status === 'expired'
        ? row.status
        : 'pending',
    similarToAccepted,
  };
}

/**
 * حالة لوحة T10 لفصل بعينه.
 *
 * تنبيه «اسم مشابه لطالب مقبول» يُحسب هنا لا في الواجهة: المقارنة تحتاج
 * تطبيعاً عربياً وقائمةَ طلاب الفصل، وكلاهما في هذه الطبقة.
 */
function requestsState(classId: string): RequestsState {
  const sessions = repositories().sessions;
  const context = sessions.activeContext();
  if (context === undefined) return { state: 'closed' };
  if (context.session.classId !== classId) {
    return { state: 'other_class', className: context.className };
  }

  const rows = sessions.listRequests(context.session.id);
  const accepted = repositories().students.listByClass(classId);

  return {
    state: 'open',
    pending: rows
      .filter((row) => row.status === 'pending')
      .map((row) =>
        toRequestRow(
          row,
          accepted.some((student) => similarNames(student.name, row.name)),
        ),
      ),
    decided: rows.filter((row) => row.status !== 'pending').map((row) => toRequestRow(row, false)),
    accepted: rows.filter((row) => row.status === 'approved').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
  };
}

function toLessonSummary(
  row: StoredLesson,
  stats: { attachments: number; reads: number } | undefined,
): TeacherLessonSummary {
  return {
    id: row.id,
    classId: row.classId,
    title: row.title,
    status: row.status === 'published' ? 'published' : 'draft',
    publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    attachments: stats?.attachments ?? 0,
    reads: stats?.reads ?? 0,
  };
}

/**
 * الكتل تُقرأ من القاعدة بمخططها قبل أن تصل إلى المحرر.
 * ما في القاعدة كُتب بإصدار سابق ربما، أو عُدِّل من خارج التطبيق — فيُقرأ
 * كمدخل غير موثوق، وكتلة لا نفهمها تُسقَط بدل أن تُعطّل الشاشة كلها.
 */
function lessonDetail(id: string): TeacherLessonDetail {
  const row = repositories().lessons.get(id);
  const stats = repositories().lessons.stats(row.classId);
  const parsed = validate(lessonBlocksSchema, row.blocks);
  const workspace = repositories().lessonWorkspaces.get(id);
  return {
    ...toLessonSummary(row, stats.get(row.id)),
    blocks: parsed.ok ? parsed.value : [],
    preparation: workspace?.preparation ?? null,
    generatedActivityId: workspace?.activityId ?? null,
    agentUndoToken: repositories().lessonWorkspaces.undoToken(id),
  };
}

/**
 * صفّ جدول T15 — بلا الأسئلة نفسها.
 *
 * الملخّص يحمل عددها لا نصوصها: جدولٌ من عشرين نشاطاً لا يحتاج أن يحمل
 * أسئلتها كلها إلى الشاشة، ولا أن يحمل مفاتيح إجاباتها إليها.
 */
function toActivitySummary(
  row: StoredActivity,
  tally: ActivityTally | undefined,
  roster: number,
): TeacherActivitySummary {
  return {
    id: row.id,
    classId: row.classId,
    title: row.title,
    status: row.status === 'published' ? 'published' : 'draft',
    lessonId: row.lessonId,
    lessonTitle: repositories().activities.lessonTitle(row.lessonId),
    studentAiEnabled: row.studentAiEnabled,
    publishedAt: row.publishedAt === null ? null : row.publishedAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    questionCount: tally?.questions ?? 0,
    kind: activityKind({
      choice: tally?.choiceQuestions ?? 0,
      text: tally?.textQuestions ?? 0,
    }),
    submissions: tally?.submissions ?? 0,
    roster,
    pendingReview: tally?.pendingReview ?? 0,
  };
}

/**
 * صفّ القاعدة يحمل الحقلين معاً؛ عقد الواجهة يحمل واحداً حسب النوع.
 *
 * التحويل هنا هو ما يجعل «إجابة متوقَّعة» على سؤال اختيار مستحيلة في الواجهة:
 * سطرٌ قديم في القاعدة كُتب بإصدار سابق يمرّ من هنا فيُقصّ على نوعه.
 */
function toContractQuestion(question: StoredQuestion): TeacherQuestion {
  return question.type === 'choice'
    ? {
        type: 'choice',
        id: question.id,
        prompt: question.prompt,
        points: question.points,
        options: question.options.map((option) => ({ ...option })),
      }
    : {
        type: 'text',
        id: question.id,
        prompt: question.prompt,
        points: question.points,
        expectedAnswer: question.expectedAnswer,
      };
}

/** والعكس — نحو صفّ القاعدة. سؤال الاختيار لا إجابة متوقَّعة له، فتُكتب `null`. */
function toStoredQuestion(question: TeacherQuestion): StoredQuestion {
  return question.type === 'choice'
    ? {
        id: question.id,
        type: 'choice',
        prompt: question.prompt,
        points: question.points,
        expectedAnswer: null,
        options: question.options.map((option) => ({ ...option })),
      }
    : {
        id: question.id,
        type: 'text',
        prompt: question.prompt,
        points: question.points,
        expectedAnswer: question.expectedAnswer,
        options: [],
      };
}

/**
 * النشاط كاملاً بأسئلته — لمحرر T16 وحده.
 *
 * الأسئلة تمرّ بمخططها كما تمرّ كتل الدرس: ما في القاعدة قد يكون كُتب بإصدار
 * آخر، وسؤالٌ لا نفهمه يُسقَط بدل أن يُعطّل المحرر كله.
 */
/** مجلد الصادرات بجانب النسخ الاحتياطية — مكانٌ واحد يعرفه المعلم. */
/**
 * تقرير التشخيص الآن — دالّة واحدة يستعملها العرض والتصدير معاً.
 *
 * كانت في جسد المعالج، فتصديرُها إلى ملفّ كان سيعني نسخةً ثانية من منطق
 * الفحوص — ونسختان تتباعدان، فيرسل المعلم ملفّاً يقول غير ما تقوله شاشته.
 */
async function diagnosticsNow(): Promise<Diagnostics> {
  const status = portalStatus();
  const state = storeState();

  let reachedByDevice = false;
  let studentsOnline = 0;
  if (state.status === 'open') {
    const context = state.repositories.sessions.activeContext();
    if (context !== undefined) {
      const requests = state.repositories.sessions.listRequests(context.session.id);
      const seen = state.repositories.sessions.lastSeenByStudent(context.session.id);
      studentsOnline = [...seen.values()].filter((at) => isOnline(at)).length;
      // طلبُ دخولٍ واحدٌ يكفي دليلاً: لا يصل إلى الخادم إلا عبر الشبكة.
      reachedByDevice = requests.length > 0 || studentsOnline > 0;
    }
  }

  // العنوان يُقرأ من النظام في كل فحص لا من حالة البوابة: المعلم قد ينتقل
  // بين شبكتين وحصته قائمة، فيصير الرابط المعروض على شاشته رابطاً ميتاً.
  const lan = pickLanAddress(networkInterfaces());

  const facts: DiagnosticFacts = {
    lan: lan === null ? null : { address: lan.address, adapter: lan.adapter },
    portal:
      status.state === 'running'
        ? { state: 'running', port: status.port, url: status.url }
        : status.state === 'unreachable'
          ? { state: 'unreachable', port: status.port }
          : { state: 'stopped' },
    reachedByDevice,
    studentsOnline,
  };

  const result = buildDiagnostics(facts, new Date());

  /*
   * «تفاصيل تقنية» — مطويّة، وتُنسخ عند طلب الدعم الفني فقط.
   * لا مفاتيح ولا رموز ولا أسماء طلاب: هذا نصٌّ يُلصق في محادثة دعم، وما
   * يدخله يخرج من جهاز المعلم (SEC-005).
   */
  return {
    ...result,
    technical: [
      { label: 'إصدار التطبيق', value: app.getVersion() },
      { label: 'النظام', value: `${process.platform} ${process.arch}` },
      { label: 'Electron', value: process.versions.electron ?? '—' },
      { label: 'العنوان المحلي', value: lan === null ? 'لا يوجد' : lan.address },
      { label: 'البطاقة', value: lan === null ? '—' : lan.adapter },
      {
        label: 'المنفذ',
        value:
          status.state === 'running' || status.state === 'unreachable'
            ? String(status.port)
            : `${DEFAULT_PORT} (غير مشغّل)`,
      },
      { label: 'حالة البوابة', value: status.state },
      { label: 'طلاب على الشبكة', value: String(studentsOnline) },
    ],
  };
}
const EXPORTS_FOLDER = 'Exports';

function activityDetail(id: string): TeacherActivityDetail {
  const row = repositories().activities.get(id);
  const tally = repositories().activities.tally(row.classId);
  const roster = repositories().activities.rosterSize(row.classId);
  const stored = repositories().activities.questions(row.id).map(toContractQuestion);
  const parsed = validate(teacherQuestionsSchema, stored);
  return {
    ...toActivitySummary(row, tally.get(row.id), roster),
    questions: parsed.ok ? parsed.value : [],
  };
}

/**
 * نصّ الدرس كما يقرؤه الإنسان — هو ما يُرسل للنموذج لا كتل JSON.
 * الكتل تمرّ بمخططها أولاً: القاعدة قد تحمل ما كُتب بإصدار آخر.
 */
function lessonPlainText(lesson: StoredLesson): string {
  const parsed = validate(lessonBlocksSchema, lesson.blocks);
  return lessonContentText(lesson.title, parsed.ok ? parsed.value : []);
}

/**
 * الاقتراح يصير سؤالاً بمعرّف — والمعرّف يُولَّد هنا.
 *
 * لا يُطلب من النموذج أن يعطي معرّفات: معرّفٌ يأتي من ردّه قد يصطدم بمعرّف
 * سؤال قائم فيستبدله عند الحفظ. التوليد هنا يجعل الاصطدام مستحيلاً.
 */
function toDraftQuestion(draft: DraftQuestion): TeacherQuestion {
  return draft.type === 'choice'
    ? {
        type: 'choice',
        id: randomUUID(),
        prompt: draft.prompt,
        points: 1,
        options: draft.options.map((option) => ({
          id: randomUUID(),
          text: option.text,
          isCorrect: option.isCorrect,
        })),
      }
    : {
        type: 'text',
        id: randomUUID(),
        prompt: draft.prompt,
        points: 1,
        expectedAnswer: draft.expectedAnswer,
      };
}

/**
 * البيانات مفتوحةً، أو خطأٌ بنصّ القناة.
 *
 * ثمانية معالِجات كانت تكتب الحارس نفسه في ثلاثة أسطر. والرسائل تختلف عمداً —
 * «الاستعادة غير متاحة» ليست «افتح بياناتك أولاً قبل التصدير» — فالنصّ يبقى
 * وسيطاً، والشكل وحده هو ما يُجمَع.
 *
 * وقيمته أنه **اسمٌ للشرط**: من يكتب قناةً جديدة تلمس بيانات المعلم يجدها
 * مكتوبة، فلا يصل إلى `repositories()` بلا حارس فيسمع المعلم رسالةً داخلية
 * («القاعدة غير مفتوحة») مكان رسالته.
 */
function openData(message: string): Extract<StoreState, { status: 'open' }> {
  const state = storeState();
  if (state.status !== 'open') throw new Error(message);
  return state;
}

/**
 * مجلد الصادرات — اسمه ومكانه وإنشاؤه في موضع واحد.
 *
 * ويُنشأ عند أول تصدير لا عند الإقلاع: مجلدٌ فارغ في بيانات معلمٍ لا يصدّر
 * سؤالٌ يطرحه ولا جواب له.
 */
async function exportsDirectory(dataDirectory: string): Promise<string> {
  const directory = join(dataDirectory, EXPORTS_FOLDER);
  await mkdir(directory, { recursive: true });
  return directory;
}

/**
 * نسخة احتياطية من الحالة الحيّة — تعريفٌ واحد لموضعَين.
 *
 * «ما الذي يدخل النسخة؟» سؤالٌ له جواب واحد: القاعدة، والمرفقات، والجرد،
 * وإصدارا التطبيق والمخطط. وكان مكتوباً مرتين — في «انسخ الآن» وفي النسخة
 * الوقائية قبل الاستعادة — فحقلٌ يُضاف إلى أحدهما يجعل النسختين تفترقان،
 * **وأخطرهما هي الوقائية**: تلك التي يُرجَع إليها حين تسوء الاستعادة.
 *
 * و`store` وسيطٌ لا يُقرأ من `fileStore()` دائماً: مسار الاستعادة يمسك المخزن
 * الحيّ قبل أن يُغلق، ثم يأخذ نسخته الوقائية بعده.
 */

/**
 * الحارس الذي يجعل مسار الواجهة مسارَنا — SEC-004.
 *
 * القنوات الثلاث التي تأخذ مساراً تمرّ من هنا. والمقارنة على مجلد النسخ لا
 * على مجلد البيانات كله: لا داعي لأن تستطيع قناةُ حذفٍ أن تلمس القاعدة.
 */
function insideBackups(path: string): string {
  const state = openData('لم تُفتح بياناتك بعد.');

  const root = defaultBackupsDirectory(state.dataDirectory);
  if (!isInsideDirectory(root, path)) throw new PathOutsideError('النسخ الاحتياطية');
  return path;
}

/**
 * حالة شاشة T20 كاملة في نداء واحد.
 *
 * الفحص هنا **سطحيّ لا عميق**: القائمة قد تحوي عشرين نسخة، وحساب بصمة كل ملف
 * فيها يجمّد الشاشة دقائق. والعميق يجري عند الاستعادة وحدها — حيث يهمّ فعلاً.
 */
async function backupState(): Promise<BackupState> {
  const state = openData('النسخ الاحتياطي غير متاح قبل فتح البيانات.');

  const directory = defaultBackupsDirectory(state.dataDirectory);
  const backups = await listBackups(directory);
  const newest = backups.find((row) => row.status === 'complete');

  return {
    directory,
    backups: backups.map((row) => ({
      path: row.path,
      name: row.name,
      status: row.status,
      createdAt: row.createdAt?.toISOString() ?? null,
      sizeBytes: row.sizeBytes,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      ...(row.manifest === undefined ? {} : { contents: row.manifest.contents }),
    })),
    current: state.repositories.stats.contents(),
    lastBackupAt: newest?.createdAt?.toISOString() ?? null,
  };
}

function settingsState(): SettingsState {
  const state = openData('الإعدادات غير متاحة قبل فتح البيانات.');

  const stored = state.repositories.settings.all();
  const values: Record<string, string> = {};
  for (const key of SETTING_KEYS) values[key] = stored[key];

  return {
    values,
    dataDirectory: state.dataDirectory,
    appVersion: app.getVersion(),
  };
}
import { LEARNING_IPC, learningListSchema, learningIdSchema, learningSaveSchema, learningPublishSchema, learningGradeSchema } from '@cubecroom/contracts';
import { AGENT_IPC, agentProfileSchema, agentScopeSchema, agentMemorySchema, agentRunSchema, agentControlSchema } from '@cubecroom/contracts';
import { queueAgent, controlAgent } from './specialist-agents.js';
