import { contextBridge, ipcRenderer } from 'electron';
import { UPDATE_IPC, type UpdateBridge, type UpdateState } from '@cubecroom/contracts';
import type {
  WindowAppearance,
  ApproveAllInput,
  ActiveModel,
  AiResult,
  AiSettings,
  CancelAiInput,
  RunAiInput,
  LessonAgentRunInput,
  LessonAgentUndoInput,
  LessonAgentResult,
  ArchiveClassInput,
  ProviderKeyInput,
  SaveKeyInput,
  SaveKeyResult,
  SetModelInput,
  AttachToLessonInput,
  FileProgress,
  RemoveFileInput,
  RemoveFileResult,
  StoredFile,
  DecideRequestInput,
  BootState,
  ClassInput,
  ClassStudentAiInput,
  ClassSummary,
  ListClassesInput,
  UpdateClassInput,
  ChooseDirectoryResult,
  CompleteOnboardingInput,
  OpenPathResult,
  CopyTextInput,
  CreateLessonInput,
  CreateActivityInput,
  UpdateActivityInput,
  PublishActivityInput,
  ActivityStudentAiInput,
  GenerateQuestionsInput,
  GeneratedQuestions,
  SuggestReviewInput,
  ReviewSuggestionResult,
  ChoiceBreakdownResult,
  UnreadStudents,
  CopyActivityInput,
  ExportedResults,
  StudentPortState,
  StudentPortInput,
  MoveDataInput,
  MoveDataResult,
  ActivitySubmissions,
  SubmissionDetail,
  ReviewSubmissionInput,
  TeacherActivityDetail,
  TeacherActivitySummary,
  HomeState,
  PortalStatus,
  PublishLessonInput,
  RenameStudentInput,
  RequestRow,
  RequestsState,
  RosterRow,
  RosterState,
  StudentActionInput,
  StartPortalInput,
  TeacherLessonDetail,
  TeacherLessonSummary,
  UpdateLessonInput,
  SettingsState,
  Diagnostics,
  BackupState,
  BackupRow,
  BackupPathInput,
  RestorePreview,
  RestoreResultView,
  WriteSettingInput,
} from '@cubecroom/contracts';

/**
 * الجسر الوحيد بين الواجهة وعمليات النظام.
 *
 * هذا الملف بامتداد ‎.cts فيُصدَّر CommonJS — شرط تشغيل preload داخل sandbox
 * (SEC-001). صياغة ESM هنا لا تعمل، فلا يُحوَّل الامتداد.
 *
 * `ipcRenderer` لا يُمرَّر خاماً: كل قدرة دالة مسمّاة بتوقيع معروف، فتبقى
 * مساحة ما تستطيعه الواجهة محدودة ومقروءة في ملف واحد (SEC-004).
 */
const updateApi: UpdateBridge = {
  updateState: () => ipcRenderer.invoke(UPDATE_IPC.state),
  updateCheck: () => ipcRenderer.invoke(UPDATE_IPC.check),
  updateDownload: () => ipcRenderer.invoke(UPDATE_IPC.download),
  updateInstall: () => ipcRenderer.invoke(UPDATE_IPC.install),
  updateChannel: (channel) => ipcRenderer.invoke(UPDATE_IPC.channel, channel),
  updatePrepared: (input) => ipcRenderer.invoke(UPDATE_IPC.prepared, input),
  onUpdateState: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, state: UpdateState) => listener(state);
    ipcRenderer.on(UPDATE_IPC.changed, receive);
    return () => { ipcRenderer.removeListener(UPDATE_IPC.changed, receive); };
  },
  onUpdatePrepare: (listener) => {
    const receive = (_event: Electron.IpcRendererEvent, input: { token: string }) => listener(input);
    ipcRenderer.on(UPDATE_IPC.prepare, receive);
    return () => { ipcRenderer.removeListener(UPDATE_IPC.prepare, receive); };
  },
};
const api = {
  ...updateApi,
  lessonAgentRun: (input: LessonAgentRunInput): Promise<LessonAgentResult> =>
    ipcRenderer.invoke('lessons:agent-run', input),
  lessonAgentUndo: (input: LessonAgentUndoInput): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:agent-undo', input),
  platform: process.platform,
  windowAppearance: (input: WindowAppearance): Promise<{ updated: true }> => ipcRenderer.invoke('app:window-appearance', input),

  /** حالة الإقلاع: أول تشغيل · جاهز · مرفوض. */
  bootState: (): Promise<BootState> => ipcRenderer.invoke('app:boot-state'),

  /** يفتح منتقي المجلدات ويتحقق أن المكان صالح للكتابة قبل إعادته. */
  chooseDataDirectory: (): Promise<ChooseDirectoryResult> =>
    ipcRenderer.invoke('app:choose-data-directory'),

  /** يُتمّ أول تشغيل دفعةً واحدة ويعيد الحالة الجديدة. */
  completeOnboarding: (input: CompleteOnboardingInput): Promise<BootState> =>
    ipcRenderer.invoke('app:complete-onboarding', input),

  /** الفصول — T06 · T07. */
  classesList: (input: ListClassesInput): Promise<ClassSummary[]> =>
    ipcRenderer.invoke('classes:list', input),
  classesCreate: (input: ClassInput): Promise<ClassSummary> =>
    ipcRenderer.invoke('classes:create', input),
  classesUpdate: (input: UpdateClassInput): Promise<ClassSummary> =>
    ipcRenderer.invoke('classes:update', input),
  classesStudentAi: (input: ClassStudentAiInput): Promise<ClassSummary> =>
    ipcRenderer.invoke('classes:student-ai', input),
  classesArchive: (input: ArchiveClassInput): Promise<ClassSummary> =>
    ipcRenderer.invoke('classes:archive', input),

  /** الذكاء الاصطناعي — SEC-005. لا مفتاح يعبر هذا الجسر في الاتجاهين. */
  aiSettings: (): Promise<AiSettings> => ipcRenderer.invoke('ai:settings'),
  aiSaveKey: (input: SaveKeyInput): Promise<SaveKeyResult> =>
    ipcRenderer.invoke('ai:save-key', input),
  aiActiveModel: (): Promise<ActiveModel> => ipcRenderer.invoke('ai:active-model'),
  aiRun: (input: RunAiInput): Promise<AiResult> => ipcRenderer.invoke('ai:run', input),
  aiCancel: (input: CancelAiInput): Promise<{ cancelled: boolean }> =>
    ipcRenderer.invoke('ai:cancel', input),
  aiSetModel: (input: SetModelInput): Promise<AiSettings> =>
    ipcRenderer.invoke('ai:set-model', input),
  aiDeleteKey: (input: ProviderKeyInput): Promise<AiSettings> =>
    ipcRenderer.invoke('ai:delete-key', input),

  /** الملفات والمرفقات — T13Upload · T18. */
  filesList: (): Promise<StoredFile[]> => ipcRenderer.invoke('files:list'),
  filesPick: (): Promise<StoredFile[]> => ipcRenderer.invoke('files:pick'),
  filesRemove: (input: RemoveFileInput): Promise<RemoveFileResult> =>
    ipcRenderer.invoke('files:remove', input),
  filesOpenFolder: (): Promise<OpenPathResult> => ipcRenderer.invoke('files:open-folder'),
  lessonAttachments: (input: { id: string }): Promise<StoredFile[]> =>
    ipcRenderer.invoke('lessons:attachments', input),
  lessonAttach: (input: AttachToLessonInput): Promise<StoredFile[]> =>
    ipcRenderer.invoke('lessons:attach', input),

  /**
   * تقدّم نسخ المرفقات — القناة الوحيدة باتجاه معاكس.
   * تُعيد دالة إلغاء الاشتراك: مستمع باقٍ بعد إغلاق الشاشة يُبقيها حيّة في
   * الذاكرة ويحدّث ما لم يعد معروضاً.
   */
  onFileProgress: (handler: (progress: FileProgress) => void): (() => void) => {
    const listener = (_event: unknown, progress: FileProgress) => handler(progress);
    ipcRenderer.on('files:progress', listener);
    return () => ipcRenderer.removeListener('files:progress', listener);
  },

  /** الرئيسية والشريط العلوي — T05. */
  homeState: (): Promise<HomeState> => ipcRenderer.invoke('app:home-state'),

  /** الطلاب — T11. */
  rosterList: (input: { classId: string }): Promise<RosterState> =>
    ipcRenderer.invoke('roster:list', input),
  rosterRename: (input: RenameStudentInput): Promise<RosterRow> =>
    ipcRenderer.invoke('roster:rename', input),
  rosterAction: (input: StudentActionInput): Promise<RosterState> =>
    ipcRenderer.invoke('roster:action', input),

  /** طلبات الدخول — T10. */
  requestsList: (input: { classId: string }): Promise<RequestsState> =>
    ipcRenderer.invoke('requests:list', input),
  requestDecide: (input: DecideRequestInput): Promise<RequestRow> =>
    ipcRenderer.invoke('requests:decide', input),
  requestsApproveAll: (input: ApproveAllInput): Promise<RequestsState> =>
    ipcRenderer.invoke('requests:approve-all', input),

  /** الدروس — T12 · T13. */
  lessonsList: (input: { classId: string }): Promise<TeacherLessonSummary[]> =>
    ipcRenderer.invoke('lessons:list', input),
  lessonGet: (input: { id: string }): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:get', input),
  lessonCreate: (input: CreateLessonInput): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:create', input),
  lessonUpdate: (input: UpdateLessonInput): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:update', input),
  lessonPublish: (input: PublishLessonInput): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:publish', input),
  lessonDuplicate: (input: { id: string }): Promise<TeacherLessonDetail> =>
    ipcRenderer.invoke('lessons:duplicate', input),
  lessonDelete: (input: { id: string }): Promise<{ removed: string }> =>
    ipcRenderer.invoke('lessons:delete', input),

  /** الأنشطة — T15 · T16. مفتاح الإجابة يعبر هذا الجسر نحو المعلم وحده. */
  activitiesList: (input: { classId: string }): Promise<TeacherActivitySummary[]> =>
    ipcRenderer.invoke('activities:list', input),
  activityGet: (input: { id: string }): Promise<TeacherActivityDetail> =>
    ipcRenderer.invoke('activities:get', input),
  activityCreate: (input: CreateActivityInput): Promise<TeacherActivityDetail> =>
    ipcRenderer.invoke('activities:create', input),
  activityUpdate: (input: UpdateActivityInput): Promise<TeacherActivityDetail> =>
    ipcRenderer.invoke('activities:update', input),
  activityPublish: (input: PublishActivityInput): Promise<TeacherActivityDetail> =>
    ipcRenderer.invoke('activities:publish', input),
  activityStudentAi: (input: ActivityStudentAiInput): Promise<TeacherActivityDetail> =>
    ipcRenderer.invoke('activities:student-ai', input),
  activityDelete: (input: { id: string }): Promise<{ removed: string }> =>
    ipcRenderer.invoke('activities:delete', input),
  /** توليد أسئلة — يقرأ ويقترح، ولا يكتب في القاعدة شيئاً. */
  activityGenerate: (input: GenerateQuestionsInput): Promise<GeneratedQuestions> =>
    ipcRenderer.invoke('activities:generate', input),
  /** اقتراح تقييم لإجابة نصّية — مسوّدة تُعرض، ولا يُكتب في القاعدة شيء. */
  activitySuggestReview: (input: SuggestReviewInput): Promise<ReviewSuggestionResult> =>
    ipcRenderer.invoke('activities:suggest-review', input),
  /** توزيع إجابات الاختيار — محلّيّ بالكامل، بلا مزوّد. */
  activityChoiceBreakdown: (input: { id: string }): Promise<ChoiceBreakdownResult> =>
    ipcRenderer.invoke('activities:choice-breakdown', input),
  /** من لم يقرأ الدرس — أسماء، ومسودةٌ تُردّ حالةً لا قائمة. */
  lessonUnread: (input: { id: string }): Promise<UnreadStudents> =>
    ipcRenderer.invoke('lessons:unread', input),
  /** نسخ نشاط إلى فصل آخر — تصل النسخة مسودةً دائماً. */
  activityCopy: (input: CopyActivityInput): Promise<TeacherActivitySummary> =>
    ipcRenderer.invoke('activities:copy', input),
  /** تصدير النتائج ملفَّ CSV بجانب النسخ الاحتياطية. */
  activityExportResults: (input: { id: string }): Promise<ExportedResults> =>
    ipcRenderer.invoke('activities:export-results', input),
  activityOpenExports: (): Promise<OpenPathResult> =>
    ipcRenderer.invoke('activities:open-exports'),
  /** تصدير سجلّ التشخيص — منقّىً من الأسرار قبل أن يُكتب. */
  diagnosticsExport: (): Promise<ExportedResults> =>
    ipcRenderer.invoke('app:diagnostics-export'),
  /** منفذ بوابة الطالب — يسري عند التشغيل التالي لا على حصة قائمة. */
  studentPortGet: (): Promise<StudentPortState> => ipcRenderer.invoke('app:student-port'),
  studentPortSet: (input: StudentPortInput): Promise<StudentPortState> =>
    ipcRenderer.invoke('app:student-port-set', input),
  /** نقل البيانات — نسخٌ ثم تحويلُ الإشارة، والقديم يبقى. */
  dataMove: (input: MoveDataInput): Promise<MoveDataResult> =>
    ipcRenderer.invoke('app:data-move', input),

  /** المراجعة والتصحيح — T17. */
  activitySubmissions: (input: { id: string }): Promise<ActivitySubmissions> =>
    ipcRenderer.invoke('activities:submissions', input),
  submissionGet: (input: { id: string }): Promise<SubmissionDetail> =>
    ipcRenderer.invoke('activities:submission', input),
  submissionReview: (input: ReviewSubmissionInput): Promise<SubmissionDetail> =>
    ipcRenderer.invoke('activities:review', input),

  /** «نسخ الرابط» — يمرّ بالعملية الرئيسية لا بحافظة المتصفح. */
  copyText: (input: CopyTextInput): Promise<{ copied: true }> =>
    ipcRenderer.invoke('app:copy-text', input),

  /** بوابة الطالب — T09. */
  portalStatus: (): Promise<PortalStatus> => ipcRenderer.invoke('portal:status'),
  portalStart: (input: StartPortalInput): Promise<PortalStatus> =>
    ipcRenderer.invoke('portal:start', input),
  portalStop: (): Promise<PortalStatus> => ipcRenderer.invoke('portal:stop'),

  /** «تحديد مكان البيانات» — مخرج الاسترجاع حين يتعذّر فتح البيانات. */
  relocateDataDirectory: (): Promise<BootState> =>
    ipcRenderer.invoke('app:relocate-data-directory'),

  /** شاشة T22 كاملة: القيم ومكان البيانات وإصدار التطبيق. */
  readSettings: (): Promise<SettingsState> => ipcRenderer.invoke('settings:read'),

  /** يكتب إعداداً واحداً ويعيد الحالة بعد الكتابة. */
  writeSetting: (input: WriteSettingInput): Promise<SettingsState> =>
    ipcRenderer.invoke('settings:write', input),

  /** تشخيص الاتصال — T21. يجمع وقائع ولا يغيّر شيئاً. */
  diagnostics: (): Promise<Diagnostics> => ipcRenderer.invoke('app:diagnostics'),

  /** يفتح شاشة جدار الحماية في النظام — ولا يعدّل قاعدةً بنفسه (§22). */
  openFirewallSettings: (): Promise<OpenPathResult> =>
    ipcRenderer.invoke('app:open-firewall-settings'),

  /** النسخ الاحتياطي والاستعادة — T20. */
  backupState: (): Promise<BackupState> => ipcRenderer.invoke('backup:state'),
  backupCreate: (): Promise<BackupState> => ipcRenderer.invoke('backup:create'),
  backupDelete: (input: BackupPathInput): Promise<BackupState> =>
    ipcRenderer.invoke('backup:delete', input),
  backupOpenFolder: (): Promise<OpenPathResult> => ipcRenderer.invoke('backup:open-folder'),
  restorePreview: (input: BackupPathInput): Promise<RestorePreview> =>
    ipcRenderer.invoke('backup:restore-preview', input),
  restoreRun: (input: BackupPathInput): Promise<RestoreResultView> =>
    ipcRenderer.invoke('backup:restore', input),

  /** الاسترجاع حين لا تُفتح القاعدة — T01States/٣. */
  recoveryList: (): Promise<BackupRow[]> => ipcRenderer.invoke('recovery:list'),
  recoveryRestore: (input: BackupPathInput): Promise<RestoreResultView> =>
    ipcRenderer.invoke('recovery:restore', input),

  /** «فتح المجلد» — يفتح مجلد البيانات في مستكشف النظام. */
  openDataDirectory: (): Promise<OpenPathResult> =>
    ipcRenderer.invoke('app:open-data-directory'),
} as const;

export type CubeCroomApi = typeof api;

contextBridge.exposeInMainWorld('cubecroom', api);
