// WebUI 状态接口 / WebUI status interface
export interface WebUIStatus {
  running: boolean;
  port: number;
  allowRemote: boolean;
  localUrl: string;
  networkUrl?: string;
  lanIP?: string;
  adminUsername: string;
  initialPassword?: string;
}

export interface ElectronBridgeAPI {
  emit: (name: string, data: unknown) => Promise<unknown> | void;
  on: (callback: (event: { value: string }) => void) => void;
  // 获取拖拽文件/目录的绝对路径 / Get absolute path for dragged file/directory
  getPathForFile?: (file: File) => string;
  // Feedback log collection / 收集反馈日志
  collectFeedbackLogs?: () => Promise<{ filename: string; data: number[] } | null>;
  // Feedback screenshot capture / 反馈截图
  captureFeedbackScreenshot?: () => Promise<{ filename: string; data: number[] } | null>;
  // Forward feedback diagnostics logs to the main process console / 转发反馈诊断日志到主进程控制台
  logFeedbackEvent?: (payload: { details?: unknown; level: 'info' | 'warn' | 'error'; message: string }) => void;
  recoverCorruptedDatabase?: () => Promise<void>;
  // Browser automation commands
  browserNavigate?: (url: string) => Promise<{ error?: string; success: boolean; url?: string }>;
  browserClick?: (selector: string) => Promise<{ error?: string; success: boolean }>;
  browserType?: (selector: string, text: string) => Promise<{ error?: string; success: boolean }>;
  browserScroll?: (
    x: number,
    y: number
  ) => Promise<{ error?: string; scrollX?: number; scrollY?: number; success: boolean }>;
  browserScreenshot?: () => Promise<{ data?: string; error?: string; success: boolean }>;
  browserGetProfiles?: () => Promise<{
    error?: string;
    success: boolean;
    data?: import('../../browser').BrowserProfile[];
  }>;
  browserGetActiveProfile?: () => Promise<{
    error?: string;
    success: boolean;
    data?: import('../../browser').BrowserProfile;
  }>;
  browserSetActiveProfile?: (
    id: string
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').BrowserProfile }>;
  browserCreateProfile?: (
    input: import('../../browser').CreateProfileInput
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').BrowserProfile }>;
  browserUpdateProfile?: (
    input: import('../../browser').UpdateProfileInput
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').BrowserProfile }>;
  browserDeleteProfile?: (id: string) => Promise<{ error?: string; success: boolean; data?: boolean }>;
  browserClearProfileData?: (id: string) => Promise<import('../../browser').ClearProfileDataResult>;
  browserProbeExternalChrome?: (
    port?: number
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').ExternalChromeStatus }>;
  browserLaunchExternalChrome?: (
    config: import('../../browser').ExternalChromeConfig
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').ExternalChromeStatus }>;
  browserExecuteAction?: (
    request: import('../../browser').BrowserActionRequest
  ) => Promise<import('../../browser').ActionResult>;
  browserGetSnapshot?: (options?: import('../../browser').SnapshotOptions) => Promise<{
    error?: string;
    success: boolean;
    data?: { url: string; title: string; tree: import('../../browser').AccessibilitySnapshotNode[] };
  }>;
  browserTakeScreenshot?: (
    options?: import('../../browser').ScreenshotOptions
  ) => Promise<{ error?: string; success: boolean; data?: string }>;
  browserWaitForDownload?: (
    options?: import('../../browser').DownloadOptions
  ) => Promise<{ error?: string; success: boolean; data?: import('../../browser').DownloadRecord }>;
  browserGetDownloads?: () => Promise<{
    error?: string;
    success: boolean;
    data?: import('../../browser').DownloadRecord[];
  }>;
  // Teamwork Multi-Agent Orchestration APIs
  teamworkInitiate?: (
    params: import('../teamwork').InitiateTeamworkRequest
  ) => Promise<import('../teamwork').InitiateTeamworkResponse>;
  teamworkSubmitInterview?: (
    params: import('../teamwork').SubmitInterviewRequest
  ) => Promise<import('../teamwork').SubmitInterviewResponse>;
  teamworkConfirmPlan?: (
    params: import('../teamwork').ConfirmPlanRequest
  ) => Promise<import('../teamwork').ConfirmPlanResponse>;
  teamworkAbort?: (
    params: import('../teamwork').AbortTeamworkRequest
  ) => Promise<import('../teamwork').AbortTeamworkResponse>;
  teamworkGetState?: (
    params: import('../teamwork').GetTeamworkStateRequest
  ) => Promise<import('../teamwork').GetTeamworkStateResponse>;
  onTeamworkStatusUpdate?: (callback: (state: import('../teamwork').TeamworkSessionState) => void) => () => void;
  // Team Scoping & Verification APIs
  teamInitiateScoping?: (
    params: import('../teamwork').InitiateTeamScopingParams
  ) => Promise<import('../teamwork').InitiateTeamScopingResponse>;
  teamSubmitInterviewAnswers?: (
    params: import('../teamwork').SubmitTeamInterviewAnswersParams
  ) => Promise<import('../teamwork').SubmitTeamInterviewAnswersResponse>;
  teamApprovePlan?: (
    params: import('../teamwork').ApproveTeamPlanParams
  ) => Promise<import('../teamwork').ApproveTeamPlanResponse>;
  teamRejectPlan?: (
    params: import('../teamwork').RejectTeamPlanParams
  ) => Promise<import('../teamwork').RejectTeamPlanResponse>;
  teamGetScopingState?: (
    params: import('../teamwork').GetTeamScopingStateParams
  ) => Promise<import('../teamwork').GetTeamScopingStateResponse>;
  onTeamScopingStatusChanged?: (
    callback: (event: import('../teamwork').ITeamScopingStatusChangedEvent) => void
  ) => () => void;
  // Knowledge Repos APIs
  knowledgeRepoList?: () => Promise<import('../knowledgeRepo').KnowledgeRepo[]>;
  knowledgeRepoGet?: (id: string) => Promise<import('../knowledgeRepo').KnowledgeRepo | undefined>;
  knowledgeRepoAdd?: (params: {
    name: string;
    gitUrl: string;
    ref?: string;
    subpath?: string;
    authToken?: string;
  }) => Promise<import('../knowledgeRepo').KnowledgeRepo>;
  knowledgeRepoUpdate?: (id: string) => Promise<import('../knowledgeRepo').KnowledgeRepo>;
  knowledgeRepoRollback?: (id: string) => Promise<import('../knowledgeRepo').KnowledgeRepo>;
  knowledgeRepoPin?: (params: { id: string; pin: boolean }) => Promise<import('../knowledgeRepo').KnowledgeRepo>;
  knowledgeRepoSetTrust?: (params: {
    id: string;
    trustStatus: import('../knowledgeRepo').KnowledgeRepoTrustStatus;
  }) => Promise<import('../knowledgeRepo').KnowledgeRepo>;
  knowledgeRepoRemove?: (id: string) => Promise<void>;
  knowledgeRepoBuildInstructions?: (params: {
    memberName: string;
    rolePrompt?: string;
    repoIds: string[];
    whenToUseHint?: string;
    tokenBudget?: number;
  }) => Promise<import('../knowledgeRepo').EffectiveInstructionResult>;
  knowledgeRepoBuildTeamCapabilityCards?: (
    members: Array<{
      slot_id: string;
      assistant_name: string;
      knowledgeRepoIds?: string[];
      whenToUseHint?: string;
    }>
  ) => Promise<import('../knowledgeRepo').TeammateCapabilityCard[]>;
  knowledgeRepoSetTaskRunning?: (params: { repoIds: string[]; isRunning: boolean }) => Promise<void>;
}

export type BackendStartupFailureReason =
  | 'backend_incompatible_runtime'
  | 'backend_incomplete_installation'
  | 'backend_package_architecture_mismatch'
  | 'backend_data_migration_failed'
  // The local database was created by a newer AionUi version (downgrade).
  // The data is intact; the fix is updating AionUi, not reinstalling or
  // inspecting migrations (Sentry ELECTRON-31Z).
  | 'backend_database_newer_than_app'
  | 'backend_local_data_repair_failed'
  | 'backend_recoverable_database_corruption'
  | 'backend_transient_concurrent_startup'
  | 'backend_startup_directory_unavailable'
  // Backend process spawned and was observed listening but /health did not pass
  // within the timeout, while the process stayed alive (kept pending). Recoverable
  // "slow startup" — must NOT be surfaced as an "incomplete installation".
  | 'backend_startup_pending_slow'
  // Backend process spawned and was observed listening but then exited before
  // becoming ready (either within the health window or after the pending timeout).
  // Honest startup failure — surfaced without reinstall/antivirus guidance.
  | 'backend_startup_exited'
  // Backend process spawned but never reported its listening port within the
  // port-report window (stage `listen_timeout`). The process has been killed,
  // so this is a fatal-but-honest "startup timed out" — never an "incomplete
  // installation" (Sentry 136646113).
  | 'backend_startup_port_report_timeout'
  | 'backend_startup_failed';

export type BackendIncompleteInstallationKind = 'missing_backend_binary' | 'missing_directory_resources';
export type BackendLocalDataIssueKind = 'agent_metadata_invalid_utf8' | 'assistant_storage_bootstrap_failed';
export type BackendStartupDirectoryIssueKind = 'missing_or_unavailable_directory' | 'permission_denied';

export interface BackendStartupFailureInfo {
  incompleteInstallationKind?: BackendIncompleteInstallationKind;
  localDataIssueKind?: BackendLocalDataIssueKind;
  startupDirectoryIssueKind?: BackendStartupDirectoryIssueKind;
  missingBackendBinary?: boolean;
  missingBundledAioncoreDir?: boolean;
  missingHubDir?: boolean;
  missingPetStatesDir?: boolean;
  missingPwaDir?: boolean;
  reason: BackendStartupFailureReason;
  backendBoundaryCode?: string;
  backendBoundaryStage?: string;
  runtime?: 'glibc';
  requiredVersions?: string[];
  missingResources?: string[];
  missingRuntimeDir?: boolean;
  packageArch?: string;
  deviceArch?: string;
  expectedDownloadArch?: string;
  isRosettaTranslated?: boolean;
  /** Currently installed AionUi version, stamped by the main process when a
   * startup failure is recorded. Lets dialogs reference the user's version
   * (e.g. the downgrade dialog: "data needs something newer than vX.Y.Z"). */
  appVersion?: string;
}

declare global {
  interface Window {
    electronAPI?: ElectronBridgeAPI;
    __initialLanguage?: string | null;
    __aionuiE2ETest?: boolean;
    __backendStartupFailed?: boolean;
    __backendStartupFailure?: BackendStartupFailureInfo | null;
    __backendStartupBridge?: {
      getState: () => BackendStartupFailureInfo | null;
      subscribe: (callback: (state: BackendStartupFailureInfo | null) => void) => () => void;
    };
    __installationIntegrityReportCount?: number;
    __lastInstallationIntegrityReportMessage?: string;
  }
}
