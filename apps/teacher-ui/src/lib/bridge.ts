import type {
  UpdateBridge,
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
  GeneratedQuestions,
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
 * الوصول إلى جسر preload.
 *
 * الواجهة تعمل داخل Electron فقط (PRD §6: «لا تحتاج أن تكون HTTP-accessible»)،
 * لكن `next dev` قد يُفتح في متصفح أثناء التطوير. عندها لا يوجد جسر — فنقول
 * ذلك صراحةً بدل أن تتعطّل الشاشة بلا سبب مفهوم.
 */
export type Bridge = UpdateBridge & {
  readonly platform: string;
  readonly windowAppearance: (input: WindowAppearance) => Promise<{ updated: true }>;
  readonly bootState: () => Promise<BootState>;
  readonly chooseDataDirectory: () => Promise<ChooseDirectoryResult>;
  readonly completeOnboarding: (input: CompleteOnboardingInput) => Promise<BootState>;
  readonly classesList: (input: ListClassesInput) => Promise<ClassSummary[]>;
  readonly classesCreate: (input: ClassInput) => Promise<ClassSummary>;
  readonly classesUpdate: (input: UpdateClassInput) => Promise<ClassSummary>;
  readonly classesArchive: (input: ArchiveClassInput) => Promise<ClassSummary>;
  readonly classesStudentAi: (input: ClassStudentAiInput) => Promise<ClassSummary>;
  readonly aiSettings: () => Promise<AiSettings>;
  readonly aiSaveKey: (input: SaveKeyInput) => Promise<SaveKeyResult>;
  readonly aiActiveModel: () => Promise<ActiveModel>;
  readonly aiRun: (input: RunAiInput) => Promise<AiResult>;
  readonly aiCancel: (input: CancelAiInput) => Promise<{ cancelled: boolean }>;
  readonly aiSetModel: (input: SetModelInput) => Promise<AiSettings>;
  readonly aiDeleteKey: (input: ProviderKeyInput) => Promise<AiSettings>;
  readonly filesList: () => Promise<StoredFile[]>;
  readonly filesPick: () => Promise<StoredFile[]>;
  readonly filesRemove: (input: RemoveFileInput) => Promise<RemoveFileResult>;
  readonly filesOpenFolder: () => Promise<OpenPathResult>;
  readonly lessonAttachments: (input: { id: string }) => Promise<StoredFile[]>;
  readonly lessonAttach: (input: AttachToLessonInput) => Promise<StoredFile[]>;
  readonly onFileProgress: (handler: (progress: FileProgress) => void) => () => void;
  readonly homeState: () => Promise<HomeState>;
  readonly rosterList: (input: { classId: string }) => Promise<RosterState>;
  readonly rosterRename: (input: RenameStudentInput) => Promise<RosterRow>;
  readonly rosterAction: (input: StudentActionInput) => Promise<RosterState>;
  readonly requestsList: (input: { classId: string }) => Promise<RequestsState>;
  readonly requestDecide: (input: DecideRequestInput) => Promise<RequestRow>;
  readonly requestsApproveAll: (input: ApproveAllInput) => Promise<RequestsState>;
  readonly lessonsList: (input: { classId: string }) => Promise<TeacherLessonSummary[]>;
  readonly lessonGet: (input: { id: string }) => Promise<TeacherLessonDetail>;
  readonly lessonAgentRun: (input: LessonAgentRunInput) => Promise<LessonAgentResult>;
  readonly lessonAgentUndo: (input: LessonAgentUndoInput) => Promise<TeacherLessonDetail>;
  readonly lessonCreate: (input: CreateLessonInput) => Promise<TeacherLessonDetail>;
  readonly lessonUpdate: (input: UpdateLessonInput) => Promise<TeacherLessonDetail>;
  readonly lessonPublish: (input: PublishLessonInput) => Promise<TeacherLessonDetail>;
  readonly lessonDuplicate: (input: { id: string }) => Promise<TeacherLessonDetail>;
  readonly lessonDelete: (input: { id: string }) => Promise<{ removed: string }>;
  readonly activitiesList: (input: { classId: string }) => Promise<TeacherActivitySummary[]>;
  readonly activityGet: (input: { id: string }) => Promise<TeacherActivityDetail>;
  readonly activityCreate: (input: CreateActivityInput) => Promise<TeacherActivityDetail>;
  readonly activityUpdate: (input: UpdateActivityInput) => Promise<TeacherActivityDetail>;
  readonly activityPublish: (input: PublishActivityInput) => Promise<TeacherActivityDetail>;
  readonly activityStudentAi: (input: ActivityStudentAiInput) => Promise<TeacherActivityDetail>;
  readonly activityDelete: (input: { id: string }) => Promise<{ removed: string }>;
  readonly activityGenerate: (input: GenerateQuestionsInput) => Promise<GeneratedQuestions>;
  readonly activitySuggestReview: (input: SuggestReviewInput) => Promise<ReviewSuggestionResult>;
  readonly activityChoiceBreakdown: (input: { id: string }) => Promise<ChoiceBreakdownResult>;
  readonly lessonUnread: (input: { id: string }) => Promise<UnreadStudents>;
  readonly activityCopy: (input: CopyActivityInput) => Promise<TeacherActivitySummary>;
  readonly activityExportResults: (input: { id: string }) => Promise<ExportedResults>;
  readonly activityOpenExports: () => Promise<OpenPathResult>;
  readonly diagnosticsExport: () => Promise<ExportedResults>;
  readonly studentPortGet: () => Promise<StudentPortState>;
  readonly studentPortSet: (input: StudentPortInput) => Promise<StudentPortState>;
  readonly dataMove: (input: MoveDataInput) => Promise<MoveDataResult>;
  readonly activitySubmissions: (input: { id: string }) => Promise<ActivitySubmissions>;
  readonly submissionGet: (input: { id: string }) => Promise<SubmissionDetail>;
  readonly submissionReview: (input: ReviewSubmissionInput) => Promise<SubmissionDetail>;
  readonly copyText: (input: CopyTextInput) => Promise<{ copied: true }>;
  readonly portalStatus: () => Promise<PortalStatus>;
  readonly portalStart: (input: StartPortalInput) => Promise<PortalStatus>;
  readonly portalStop: () => Promise<PortalStatus>;
  readonly relocateDataDirectory: () => Promise<BootState>;
  readonly readSettings: () => Promise<SettingsState>;
  readonly writeSetting: (input: WriteSettingInput) => Promise<SettingsState>;
  readonly openDataDirectory: () => Promise<OpenPathResult>;
  readonly diagnostics: () => Promise<Diagnostics>;
  readonly openFirewallSettings: () => Promise<OpenPathResult>;
  readonly backupState: () => Promise<BackupState>;
  readonly backupCreate: () => Promise<BackupState>;
  readonly backupDelete: (input: BackupPathInput) => Promise<BackupState>;
  readonly backupOpenFolder: () => Promise<OpenPathResult>;
  readonly restorePreview: (input: BackupPathInput) => Promise<RestorePreview>;
  readonly restoreRun: (input: BackupPathInput) => Promise<RestoreResultView>;
  readonly recoveryList: () => Promise<BackupRow[]>;
  readonly recoveryRestore: (input: BackupPathInput) => Promise<RestoreResultView>;
};

declare global {
  interface Window {
    readonly cubecroom?: Bridge;
  }
}

export class BridgeUnavailableError extends Error {
  constructor() {
    super('افتح CubeCroom من التطبيق نفسه — هذه الصفحة لا تعمل داخل المتصفح.');
    this.name = 'BridgeUnavailableError';
  }
}

export function bridge(): Bridge {
  const api = typeof window === 'undefined' ? undefined : window.cubecroom;
  if (!api) throw new BridgeUnavailableError();
  return api;
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && window.cubecroom !== undefined;
}
