/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

// configureChromium sets app name (dev isolation) and Chromium flags — must run before
// ANY module that calls app.getPath('userData'), because Electron caches the path on first call.
import './process/utils/configureChromium';
import { installGpuCrashHandler } from './process/utils/gpuRecovery';
import { initSentry, scheduleStartupLogReport, setSentryDeviceId } from './sentry';
import {
  isTelemetryAllowed,
  readConsent,
  setConsent,
  TELEMETRY_CONSENT_GET_CHANNEL,
  TELEMETRY_CONSENT_SET_CHANNEL,
  type TelemetryConsentBridgeResult,
} from './process/commandEve/telemetryConsentCore';
import { bridge } from '@office-ai/platform';

// Telemetry is opt-in (default OFF). Sentry is only ever initialized when the
// user has explicitly consented in the privacy settings — fail CLOSED.
if (isTelemetryAllowed()) {
  initSentry();
}

import './process/utils/configureConsoleLog';
import { app, BrowserWindow, ipcMain, nativeImage, powerMonitor } from 'electron';
import fixPath from 'fix-path';
import * as fs from 'fs';
import * as path from 'path';
import { initMainAdapterWithWindow } from './common/adapter/main';
import { ipcBridge } from './common';
import { initializeProcess } from './process';
import { ProcessConfig } from './process/utils/initStorage';
import {
  EVE_INFERENCE_FUNCTION_URL,
  findEveInferenceTier,
  isEveInferenceSelection,
  parseEveTierIdFromSelection,
} from './common/config/eveInferenceCore';
import { readLicenseWire } from './common/config/licenseWireAtRest';
import { buildEveCloudRoute, type CommandEveEveCloudRoute } from './process/commandEve/ollamaOpenAiShim';
import { getDataPath } from '@process/utils/utils';
import { registerWindowMaximizeListeners } from '@process/bridge';
import { BackendLifecycleManager } from '@aionui/web-host';
import { resolveBinaryPath } from '@process/backend';
import './process/bridge/feedbackBridge';
import { wasLaunchedAtLogin } from '@process/bridge/applicationBridge';
import { onLanguageChanged } from './process/bridge/systemSettingsBridge';
import { setInitialLanguage } from '@process/services/i18n';
import { setupApplicationMenu } from './process/utils/appMenu';
import { startWebHost } from '@aionui/web-host';
import { initializeZoomFactor, setupZoomForWindow } from './process/utils/zoom';
import {
  MIN_WINDOW_WIDTH,
  MIN_WINDOW_HEIGHT,
  attachWindowBoundsPersistence,
  loadSavedWindowBounds,
  resolveInitialBounds,
} from './process/utils/windowBounds';
import {
  clearPendingDeepLinkUrl,
  getPendingDeepLinkUrl,
  handleDeepLinkUrl,
  PROTOCOL_SCHEME,
} from './process/utils/deepLink';
import {
  bindMainWindowReferences,
  showAndFocusMainWindow,
  showOrCreateMainWindow,
} from './process/utils/mainWindowLifecycle';
import {
  loadUserWebUIConfig,
  resolveRemoteAccess,
  resolveWebUIPort,
  restoreDesktopWebUIFromPreferences,
} from './process/utils/webuiConfig';
import {
  createOrUpdateTray,
  destroyTray,
  getCloseToTrayEnabled,
  getIsQuitting,
  refreshTrayMenu,
  setCloseToTrayEnabled,
  setIsQuitting,
} from './process/utils/tray';
// @ts-expect-error - electron-squirrel-startup doesn't have types
import electronSquirrelStartup from 'electron-squirrel-startup';

// ============ Command EVE license-key resolution (COMPA-593) ============
// In the packaged app, electron-builder `extraResources: { from: public, to: . }`
// copies public/ — including the founder AND server license public keys — into
// Contents/Resources. entitlementCore's resolver already documents
// COMMAND_EVE_RESOURCES_PATH as the packaged-app key location, but nothing ever
// set it, so resolution fell through to `process.cwd()/public` — which is '/'
// for a Finder launch, where no key exists. Point the resolver at the real
// resources root so BOTH trusted keys load and server-minted (SaaS) CEVE.v1
// codes verify offline. Dev (app.isPackaged === false) keeps the cwd/public path.
if (app.isPackaged && !process.env.COMMAND_EVE_RESOURCES_PATH) {
  process.env.COMMAND_EVE_RESOURCES_PATH = process.resourcesPath;
}

// ============ Single Instance Lock ============
// Acquire lock early so the second instance quits before doing unnecessary work.
// When a second instance starts (e.g. from protocol URL), it sends its data
// to the first instance via second-instance event, then quits.
const isE2ETestMode = process.env.AIONUI_E2E_TEST === '1';
const skipSingleInstanceLock = isE2ETestMode || process.env.AIONUI_MULTI_INSTANCE === '1';
const shouldBlockStartupForCommandEveRuntimeBootstrap =
  process.env.COMMAND_EVE_RUNTIME_BOOTSTRAP_WAIT === '1' &&
  process.env.COMMAND_EVE_ALLOW_STARTUP_BLOCKING === '1' &&
  !isE2ETestMode;
const deepLinkFromArgv = process.argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
const gotTheLock = skipSingleInstanceLock ? true : app.requestSingleInstanceLock({ deepLinkUrl: deepLinkFromArgv });
if (!gotTheLock) {
  console.warn('[CommandEVE] Another instance is already running; current process will exit.');
  app.quit();
} else {
  app.on('second-instance', (_event, argv, _workingDirectory, additionalData) => {
    // Prefer additionalData (reliable on all platforms), fallback to argv scan
    const deepLinkUrl =
      (additionalData as { deepLinkUrl?: string })?.deepLinkUrl ||
      argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
    if (deepLinkUrl) {
      handleDeepLinkUrl(deepLinkUrl);
    }
    // Focus existing window or recreate one if needed.
    if (isWebUIMode || isResetPasswordMode) {
      return;
    }

    // Skip window creation if app hasn't finished initializing
    if (!appReadyDone) return;

    if (app.isReady()) {
      showOrCreateMainWindow({
        mainWindow,
        createWindow: () => {
          console.log('[CommandEVE] second-instance received with no active main window, recreating main window');
          createWindow();
        },
      });
    }
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
// 修复 macOS 和 Linux 下 GUI 应用的 PATH 环境变量,使其与命令行一致
if (process.platform === 'darwin' || process.platform === 'linux') {
  fixPath();

  // Supplement nvm paths that fix-path might miss (nvm is often only in .zshrc, not .zshenv)
  const nvmDir = process.env.NVM_DIR || path.join(process.env.HOME || '', '.nvm');
  const nvmVersionsDir = path.join(nvmDir, 'versions', 'node');
  if (fs.existsSync(nvmVersionsDir)) {
    try {
      const versions = fs.readdirSync(nvmVersionsDir);
      const nvmPaths = versions.map((v) => path.join(nvmVersionsDir, v, 'bin')).filter((p) => fs.existsSync(p));
      if (nvmPaths.length > 0) {
        const currentPath = process.env.PATH || '';
        const missingPaths = nvmPaths.filter((p) => !currentPath.includes(p));
        if (missingPaths.length > 0) {
          process.env.PATH = [...missingPaths, currentPath].join(path.delimiter);
        }
      }
    } catch {
      // Ignore errors when reading nvm directory
    }
  }
}

// Handle Squirrel startup events (Windows installer)
if (electronSquirrelStartup) {
  app.quit();
}

// Global error handlers for main process
// Sentry automatically captures these, but we keep the handlers to prevent Electron's default error dialog
process.on('uncaughtException', (_error) => {
  // Sentry captures this automatically
});

process.on('unhandledRejection', (_reason, _promise) => {
  // Sentry captures this automatically
});

const hasSwitch = (flag: string) => process.argv.includes(`--${flag}`) || app.commandLine.hasSwitch(flag);
const getSwitchValue = (flag: string): string | undefined => {
  const withEqualsPrefix = `--${flag}=`;
  const equalsArg = process.argv.find((arg) => arg.startsWith(withEqualsPrefix));
  if (equalsArg) {
    return equalsArg.slice(withEqualsPrefix.length);
  }

  const argIndex = process.argv.indexOf(`--${flag}`);
  if (argIndex !== -1) {
    const nextArg = process.argv[argIndex + 1];
    if (nextArg && !nextArg.startsWith('--')) {
      return nextArg;
    }
  }

  const cliValue = app.commandLine.getSwitchValue(flag);
  return cliValue || undefined;
};
const hasCommand = (cmd: string) => process.argv.includes(cmd);

const isWebUIMode = hasSwitch('webui');
const isRemoteMode = hasSwitch('remote');
const isResetPasswordMode = hasCommand('--resetpass');
const isVersionMode = hasCommand('--version') || hasCommand('-v');

// Flag to distinguish intentional quit from unexpected exit in WebUI mode
let isExplicitQuit = false;

// Guard against premature window creation (e.g. macOS 'activate' firing during init).
// The activate event fires on first launch before handleAppReady finishes initializeProcess(),
// causing the renderer to load and compete with initStorage on the serial configFile queue,
// which blocks startup for 100-265 seconds.
let appReadyDone = false;

let mainWindow: BrowserWindow;
const backendManager = new BackendLifecycleManager(
  {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
  },
  resolveBinaryPath
);
let disposeCronResumeListener: (() => void) | null = null;

// Flag tracking whether the backend subprocess started successfully. Read by
// the deferred runBackendMigrations trigger in createWindow().
let backendStartedOk = false;
let rendererInitialLanguage: string | null = null;
let backendStartupFailed = false;
let backendStartupFailureInfo: unknown = null;
let backendMigrationsScheduled = false;

ipcMain.on('get-backend-port', (event) => {
  const bootBackendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  event.returnValue = backendManager.port > 0 ? backendManager.port : (bootBackendPort ?? 0);
});

ipcMain.on('get-initial-language', (event) => {
  event.returnValue = rendererInitialLanguage;
});

ipcMain.on('get-backend-startup-failed', (event) => {
  event.returnValue = backendStartupFailed;
});

ipcMain.on('get-backend-startup-failure', (event) => {
  event.returnValue = backendStartupFailureInfo;
});

type CommandEveWarmupReceipt = {
  status?: string;
  default_model?: string;
  runtime_root?: string;
};

type CommandEveRuntimeStatusPayload = {
  status: string;
  default_model?: string;
  base_model?: string;
  provider?: string;
  execution_mode?: string;
  next_action?: string;
  receipt_path?: string;
  gate_audit_path?: string;
  prompt_proof?: {
    ok: boolean;
    observed_at?: string;
    model?: string;
    message_count?: number;
    system_message_count?: number;
    marker?: string;
    prompt_sha256?: string;
    receipt_path?: string;
  };
  egress_boundary?: {
    receipt_path: string;
    decision?: string;
    observed_at?: string;
    finding_count?: number;
    policy_action?: string;
  };
  model_warmup?: CommandEveModelWarmupReceipt & {
    receipt_path: string;
  };
  stages?: Array<{
    id: string;
    status: string;
    code?: string;
    detail?: string;
    duration_ms?: number;
  }>;
};

type CommandEveModelWarmupReceipt = {
  version: 'command-eve-model-warmup/v0';
  status: 'running' | 'ready' | 'failed' | 'skipped';
  model: string;
  base_url: string;
  started_at: string;
  completed_at?: string;
  elapsed_ms: number;
  error?: string;
};

type CommandEveGateAction =
  | 'edit_code'
  | 'prepare_pr'
  | 'run_local_tests'
  | 'merge_main'
  | 'prod_write'
  | 'money'
  | 'external_send'
  | 'schema_auth_secret'
  | 'truth_gate';

type CommandEveAssistantEnsureResult = {
  status: 'ready';
  assistant_id: string;
  preset_agent_type: string;
  enabled_skills: string[];
  custom_skill_names: string[];
  skill_count: number;
};

const COMMAND_EVE_GATE_ACTIONS = new Set<CommandEveGateAction>([
  'edit_code',
  'prepare_pr',
  'run_local_tests',
  'merge_main',
  'prod_write',
  'money',
  'external_send',
  'schema_auth_secret',
  'truth_gate',
]);

type CommandEveWarmup = (options: {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  maxTokens?: number;
}) => Promise<{ ok: boolean; elapsedMs: number; model: string; error?: string }>;

let commandEveRuntimeBridgeRegistered = false;
let commandEveOllamaShimUrl = '';
let commandEveWarmupInFlight: Promise<CommandEveModelWarmupReceipt> | undefined;
let commandEveAssistantBootstrapInFlight: Promise<CommandEveAssistantEnsureResult> | undefined;

function readJsonFile<T>(filePath: string): T | undefined {
  try {
    if (!fs.existsSync(filePath)) return undefined;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch (error) {
    console.warn(`[Command EVE] Failed to read ${filePath}:`, error);
    return undefined;
  }
}

function commandEvePromptProofPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, 'last-prompt-proof.json');
}

function commandEveEgressBoundaryReceiptPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, 'last-egress-boundary-receipt.json');
}

function commandEveGateAuditPath(runtimeRoot: string): string {
  return path.join(runtimeRoot, 'audit', 'gate-decisions.jsonl');
}

/**
 * Build the EVE cloud routing resolver passed to the Ollama OpenAI shim. The
 * resolver runs PER request (sync) so it always reflects the live picker
 * selection and the keychain-at-rest CEVE license:
 *
 *   - reads `commandEve.inferenceSelection` from the in-memory config cache,
 *   - returns `{ active: false }` for any local (Privat lokal) selection,
 *   - for an EVE tier, parses the wire tier and reads the license, returning a
 *     route the shim POSTs to the eve-inference Edge Function (bearer = license).
 *
 * Fail-soft: any read error keeps the request on the local lane (returns
 * undefined), never throwing inside the HTTP handler. The shim itself
 * fail-closes (401/500) if an EVE route is active but the license/URL is
 * missing, so a dropped license never becomes a silent unauthenticated call.
 */
function buildCommandEveShimRoutingResolver(): () => CommandEveEveCloudRoute | undefined {
  return () => {
    try {
      const selection = ProcessConfig.getSync('commandEve.inferenceSelection');
      if (!isEveInferenceSelection(selection)) {
        return { active: false };
      }
      const tierId = parseEveTierIdFromSelection(selection);
      const tier = tierId ? findEveInferenceTier(tierId)?.tier : undefined;
      const wireResult = readLicenseWire(getDataPath());
      return buildEveCloudRoute({
        isEveSelection: true,
        tier,
        functionUrl: EVE_INFERENCE_FUNCTION_URL,
        license: wireResult.ok ? wireResult.wire : undefined,
      });
    } catch (error) {
      console.warn('[Command EVE] EVE shim routing resolver failed; staying local:', error);
      return undefined;
    }
  };
}

function writeCommandEveModelWarmupReceipt(runtimeRoot: string, receipt: CommandEveModelWarmupReceipt): void {
  try {
    if (!runtimeRoot) return;
    const receiptPath = path.join(runtimeRoot, 'model-warmup-receipt.json');
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    const tempFile = `${receiptPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tempFile, receiptPath);
  } catch (error) {
    console.warn('[Command EVE] Failed to write model warm-up receipt:', error);
  }
}

function commandEveWarmupReceiptReadyForModel(
  receipt: CommandEveModelWarmupReceipt | undefined,
  model: string
): boolean {
  return Boolean(receipt?.status === 'ready' && receipt.model === model);
}

async function runCommandEveLocalModelWarmup(
  receipt: CommandEveWarmupReceipt,
  shimUrl: string,
  warmup: CommandEveWarmup,
  mark?: (label: string) => void
): Promise<CommandEveModelWarmupReceipt> {
  const model = receipt.default_model || '';
  const runtimeRoot = receipt.runtime_root || '';
  const disabledNow = new Date().toISOString();

  if (receipt.status !== 'ready' || !model) {
    const skipped: CommandEveModelWarmupReceipt = {
      version: 'command-eve-model-warmup/v0',
      status: 'skipped',
      model,
      base_url: shimUrl,
      started_at: disabledNow,
      completed_at: disabledNow,
      elapsed_ms: 0,
      error: 'runtime not ready',
    };
    writeCommandEveModelWarmupReceipt(runtimeRoot, skipped);
    return skipped;
  }

  if (process.env.COMMAND_EVE_DISABLE_MODEL_WARMUP === '1') {
    const skipped: CommandEveModelWarmupReceipt = {
      version: 'command-eve-model-warmup/v0',
      status: 'skipped',
      model,
      base_url: shimUrl,
      started_at: disabledNow,
      completed_at: disabledNow,
      elapsed_ms: 0,
      error: 'disabled by COMMAND_EVE_DISABLE_MODEL_WARMUP',
    };
    writeCommandEveModelWarmupReceipt(runtimeRoot, skipped);
    return skipped;
  }

  const enabled = (await ProcessConfig.get('commandEve.modelWarmupEnabled').catch((): undefined => undefined)) ?? true;
  if (!enabled) {
    console.info('[Command EVE] Local model warm-up skipped by user preference.');
    const skipped: CommandEveModelWarmupReceipt = {
      version: 'command-eve-model-warmup/v0',
      status: 'skipped',
      model,
      base_url: shimUrl,
      started_at: disabledNow,
      completed_at: disabledNow,
      elapsed_ms: 0,
      error: 'disabled by user preference',
    };
    writeCommandEveModelWarmupReceipt(runtimeRoot, skipped);
    return skipped;
  }

  const startedAt = new Date().toISOString();
  writeCommandEveModelWarmupReceipt(runtimeRoot, {
    version: 'command-eve-model-warmup/v0',
    status: 'running',
    model,
    base_url: shimUrl,
    started_at: startedAt,
    elapsed_ms: 0,
  });

  const result = await warmup({
    baseUrl: shimUrl,
    model,
    timeoutMs: 90_000,
    maxTokens: 1,
  });
  const completed: CommandEveModelWarmupReceipt = {
    version: 'command-eve-model-warmup/v0',
    status: result.ok ? 'ready' : 'failed',
    model: result.model,
    base_url: shimUrl,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    elapsed_ms: result.elapsedMs,
    ...(result.error ? { error: result.error } : {}),
  };
  writeCommandEveModelWarmupReceipt(runtimeRoot, completed);
  if (result.ok) {
    console.info(`[Command EVE] Local model warm-up ready: ${result.model} (${result.elapsedMs}ms)`);
    mark?.(`commandEveModelWarmup (${result.elapsedMs}ms)`);
  } else {
    console.warn(`[Command EVE] Local model warm-up failed: ${result.error || 'unknown error'}`);
  }
  return completed;
}

function ensureCommandEveLocalModelWarmup(
  receipt: CommandEveWarmupReceipt,
  shimUrl: string,
  warmup: CommandEveWarmup,
  mark?: (label: string) => void
): Promise<CommandEveModelWarmupReceipt> {
  if (commandEveWarmupInFlight) return commandEveWarmupInFlight;
  commandEveWarmupInFlight = runCommandEveLocalModelWarmup(receipt, shimUrl, warmup, mark).finally(() => {
    commandEveWarmupInFlight = undefined;
  });
  return commandEveWarmupInFlight;
}

async function waitForCommandEveBackendPort(timeoutMs = 90_000): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const bootBackendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
    const port = backendManager.port > 0 ? backendManager.port : (bootBackendPort ?? 0);
    if (port > 0) return port;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Command EVE assistant readiness blocked: backend port not available after ${timeoutMs}ms.`);
}

function ensureCommandEveAssistantReadiness(): Promise<CommandEveAssistantEnsureResult> {
  if (commandEveAssistantBootstrapInFlight) return commandEveAssistantBootstrapInFlight;
  commandEveAssistantBootstrapInFlight = (async () => {
    const bootBackendPort = await waitForCommandEveBackendPort();
    const { getDataPath } = await import('./process/utils/utils');
    const { ensureCommandEveAssistant } = await import('./process/commandEve/assistantBootstrap');
    return ensureCommandEveAssistant(bootBackendPort, app.getVersion(), { userDataPath: getDataPath() });
  })().finally(() => {
    commandEveAssistantBootstrapInFlight = undefined;
  });
  return commandEveAssistantBootstrapInFlight;
}

async function getCommandEveRuntimeStatusPayload(): Promise<CommandEveRuntimeStatusPayload> {
  const { getDataPath } = await import('./process/utils/utils');
  const { resolveCommandEveRuntimeBootstrapPaths } = await import('./process/commandEve/runtimeBootstrapCore');
  const { normalizeCommandEveExecutionMode } = await import('./process/commandEve/executionModeCore');
  const paths = resolveCommandEveRuntimeBootstrapPaths(getDataPath());
  const receipt = readJsonFile<Record<string, unknown>>(paths.receiptPath);
  const promptProofFile = commandEvePromptProofPath(paths.runtimeRoot);
  const promptProof = readJsonFile<CommandEveRuntimeStatusPayload['prompt_proof']>(promptProofFile);
  const egressBoundaryFile = commandEveEgressBoundaryReceiptPath(paths.runtimeRoot);
  const egressBoundary = readJsonFile<Record<string, unknown>>(egressBoundaryFile);
  const modelWarmup = readJsonFile<CommandEveModelWarmupReceipt>(paths.modelWarmupReceiptPath);
  const executionMode = normalizeCommandEveExecutionMode(
    await ProcessConfig.get('commandEve.executionMode').catch((): undefined => undefined)
  );
  const gateAuditPath = commandEveGateAuditPath(paths.runtimeRoot);
  if (!receipt) {
    return {
      status: 'missing',
      execution_mode: executionMode,
      receipt_path: paths.receiptPath,
      gate_audit_path: gateAuditPath,
      next_action: 'Command EVE runtime receipt has not been written yet.',
      ...(modelWarmup ? { model_warmup: { ...modelWarmup, receipt_path: paths.modelWarmupReceiptPath } } : {}),
      ...(promptProof ? { prompt_proof: { ...promptProof, receipt_path: promptProofFile } } : {}),
      ...(egressBoundary
        ? {
            egress_boundary: {
              receipt_path: egressBoundaryFile,
              decision: typeof egressBoundary.decision === 'string' ? egressBoundary.decision : undefined,
              observed_at: typeof egressBoundary.observed_at === 'string' ? egressBoundary.observed_at : undefined,
              finding_count:
                typeof egressBoundary.finding_count === 'number' ? egressBoundary.finding_count : undefined,
              policy_action:
                typeof egressBoundary.policy_action === 'string' ? egressBoundary.policy_action : undefined,
            },
          }
        : {}),
    };
  }
  return {
    status: String(receipt.status || 'unknown'),
    default_model: typeof receipt.default_model === 'string' ? receipt.default_model : undefined,
    base_model: typeof receipt.base_model === 'string' ? receipt.base_model : undefined,
    provider: typeof receipt.provider === 'string' ? receipt.provider : undefined,
    execution_mode: executionMode,
    next_action: typeof receipt.next_action === 'string' ? receipt.next_action : undefined,
    receipt_path: paths.receiptPath,
    gate_audit_path: gateAuditPath,
    prompt_proof: promptProof ? { ...promptProof, receipt_path: promptProofFile } : undefined,
    model_warmup: modelWarmup ? { ...modelWarmup, receipt_path: paths.modelWarmupReceiptPath } : undefined,
    egress_boundary: egressBoundary
      ? {
          receipt_path: egressBoundaryFile,
          decision: typeof egressBoundary.decision === 'string' ? egressBoundary.decision : undefined,
          observed_at: typeof egressBoundary.observed_at === 'string' ? egressBoundary.observed_at : undefined,
          finding_count: typeof egressBoundary.finding_count === 'number' ? egressBoundary.finding_count : undefined,
          policy_action: typeof egressBoundary.policy_action === 'string' ? egressBoundary.policy_action : undefined,
        }
      : undefined,
    stages: Array.isArray(receipt.stages) ? (receipt.stages as CommandEveRuntimeStatusPayload['stages']) : undefined,
  };
}

function registerCommandEveRuntimeBridge(): void {
  if (commandEveRuntimeBridgeRegistered) return;
  commandEveRuntimeBridgeRegistered = true;

  ipcBridge.commandEve.runtimeStatus.provider(async () => {
    try {
      return { success: true, data: await getCommandEveRuntimeStatusPayload() };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.commandEve.ensureAssistant.provider(async () => {
    try {
      return { success: true, data: await ensureCommandEveAssistantReadiness() };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.commandEve.ensureLocalModelTier.provider(async (request) => {
    try {
      const { getDataPath } = await import('./process/utils/utils');
      const { ensureCommandEveRuntimeBootstrap, resolveCommandEveRuntimeBootstrapPaths } =
        await import('./process/commandEve/runtimeBootstrapCore');
      const { startCommandEveOllamaOpenAiShim, warmCommandEveLocalModel } =
        await import('./process/commandEve/ollamaOpenAiShim');
      const tierId = typeof request?.tierId === 'string' ? request.tierId : '';
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: getDataPath(),
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        mode: 'auto',
        env: tierId ? { COMMAND_EVE_LOCAL_MODEL_TIER: tierId } : undefined,
      });
      const paths = resolveCommandEveRuntimeBootstrapPaths(getDataPath());
      const existingWarmup = readJsonFile<CommandEveModelWarmupReceipt>(paths.modelWarmupReceiptPath);
      const shouldWarm = !commandEveWarmupReceiptReadyForModel(existingWarmup, receipt.default_model || '');
      const shimUrl =
        commandEveOllamaShimUrl ||
        (await startCommandEveOllamaOpenAiShim({
          promptProofPath: commandEvePromptProofPath(paths.runtimeRoot),
          egressReceiptPath: commandEveEgressBoundaryReceiptPath(paths.runtimeRoot),
          eveRouting: buildCommandEveShimRoutingResolver(),
        }));
      commandEveOllamaShimUrl = shimUrl;
      const warmupReceipt = shouldWarm
        ? await ensureCommandEveLocalModelWarmup(receipt, shimUrl, warmCommandEveLocalModel)
        : existingWarmup;
      const status = await getCommandEveRuntimeStatusPayload();
      const warmupOk = ['ready', 'skipped'].includes(warmupReceipt?.status || '');
      return {
        success: receipt.status === 'ready' && warmupOk,
        data: status,
        msg:
          receipt.status !== 'ready'
            ? receipt.next_action
            : warmupOk
              ? undefined
              : warmupReceipt?.error || 'local model warm-up failed',
      };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.commandEve.warmLocalModel.provider(async (request) => {
    try {
      const { getDataPath } = await import('./process/utils/utils');
      const { ensureCommandEveRuntimeBootstrap, resolveCommandEveRuntimeBootstrapPaths } =
        await import('./process/commandEve/runtimeBootstrapCore');
      const { startCommandEveOllamaOpenAiShim, warmCommandEveLocalModel } =
        await import('./process/commandEve/ollamaOpenAiShim');
      const tierId = typeof request?.tierId === 'string' ? request.tierId : '';
      const receipt = await ensureCommandEveRuntimeBootstrap({
        userDataPath: getDataPath(),
        appPath: app.getAppPath(),
        resourcesPath: process.resourcesPath,
        mode: 'auto',
        env: tierId ? { COMMAND_EVE_LOCAL_MODEL_TIER: tierId } : undefined,
      });
      const paths = resolveCommandEveRuntimeBootstrapPaths(getDataPath());
      const existingWarmup = readJsonFile<CommandEveModelWarmupReceipt>(paths.modelWarmupReceiptPath);
      if (commandEveWarmupReceiptReadyForModel(existingWarmup, receipt.default_model || '')) {
        return {
          success: true,
          data: await getCommandEveRuntimeStatusPayload(),
        };
      }

      const shimUrl =
        commandEveOllamaShimUrl ||
        (await startCommandEveOllamaOpenAiShim({
          promptProofPath: commandEvePromptProofPath(paths.runtimeRoot),
          egressReceiptPath: commandEveEgressBoundaryReceiptPath(paths.runtimeRoot),
          eveRouting: buildCommandEveShimRoutingResolver(),
        }));
      commandEveOllamaShimUrl = shimUrl;
      const warmupReceipt = await ensureCommandEveLocalModelWarmup(receipt, shimUrl, warmCommandEveLocalModel);
      const warmupOk = ['ready', 'skipped'].includes(warmupReceipt.status);
      return {
        success: receipt.status === 'ready' && warmupOk,
        data: await getCommandEveRuntimeStatusPayload(),
        msg:
          receipt.status !== 'ready'
            ? receipt.next_action
            : warmupOk
              ? undefined
              : warmupReceipt.error || 'local model warm-up failed',
      };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcBridge.commandEve.evaluateGateDecision.provider(async (request) => {
    try {
      const { getDataPath } = await import('./process/utils/utils');
      const { resolveCommandEveRuntimeBootstrapPaths } = await import('./process/commandEve/runtimeBootstrapCore');
      const { appendCommandEveGateDecision, evaluateCommandEveGateDecision } =
        await import('./process/commandEve/executionModeCore');
      const action = request?.action;
      if (typeof action !== 'string' || !COMMAND_EVE_GATE_ACTIONS.has(action as CommandEveGateAction)) {
        return { success: false, msg: 'Invalid or missing Command EVE gate action.' };
      }
      const paths = resolveCommandEveRuntimeBootstrapPaths(getDataPath());
      const mode = await ProcessConfig.get('commandEve.executionMode').catch((): undefined => undefined);
      const decision = evaluateCommandEveGateDecision({ mode, action: action as CommandEveGateAction });
      appendCommandEveGateDecision(commandEveGateAuditPath(paths.runtimeRoot), decision);
      return { success: true, data: decision };
    } catch (error) {
      return { success: false, msg: error instanceof Error ? error.message : String(error) };
    }
  });

  // Telemetry consent (opt-in). The renderer privacy toggle reads/writes the
  // consent store through these bridge channels. Sentry stays gated on the
  // persisted value via isTelemetryAllowed() — fail CLOSED on any error.
  bridge.buildProvider<TelemetryConsentBridgeResult, void>(TELEMETRY_CONSENT_GET_CHANNEL).provider(async () => {
    const state = readConsent();
    return { consent: state.consent === true, updatedAt: state.updatedAt };
  });

  bridge
    .buildProvider<TelemetryConsentBridgeResult, { consent: boolean }>(TELEMETRY_CONSENT_SET_CHANNEL)
    .provider(async (request) => {
      const state = setConsent(request?.consent === true);
      return { consent: state.consent === true, updatedAt: state.updatedAt };
    });
}

function scheduleCommandEveLocalModelWarmup(
  receipt: CommandEveWarmupReceipt,
  shimUrl: string,
  warmup: CommandEveWarmup,
  mark?: (label: string) => void
): void {
  if (receipt.status !== 'ready' || !receipt.default_model) return;
  void ensureCommandEveLocalModelWarmup(receipt, shimUrl, warmup, mark);
}

function registerCronResumeBridge(backendPort: number): void {
  disposeCronResumeListener?.();

  const onResume = () => {
    void fetch(`http://127.0.0.1:${backendPort}/api/cron/internal/system-resume`, {
      method: 'POST',
      headers: {
        'x-aionui-internal': '1',
      },
    }).catch((error) => {
      console.error('[CommandEVE] Failed to notify backend about system resume:', error);
    });
  };

  powerMonitor.on('resume', onResume);
  disposeCronResumeListener = () => {
    powerMonitor.removeListener('resume', onResume);
  };
}

/**
 * Run one-shot backend migrations after the renderer has loaded. Some steps
 * (ConfigStorage.get, ipcBridge.listProviders) route through the renderer via
 * BroadcastChannel, so invoking them before the renderer exists deadlocks the
 * main process. Called from did-finish-load.
 */
const scheduleBackendMigrations = (): void => {
  if (backendMigrationsScheduled || !backendStartedOk) return;
  backendMigrationsScheduled = true;
  void (async () => {
    try {
      const { runBackendMigrations } = await import('./process/utils/runBackendMigrations');
      await runBackendMigrations(ProcessConfig);
      console.info('[CommandEVE] runBackendMigrations completed');
    } catch (error) {
      console.error('[CommandEVE] Backend migration hook threw:', error);
    }
  })();
};

const createWindow = ({ showOnReady = true }: { showOnReady?: boolean } = {}): void => {
  console.log('[CommandEVE] Creating main window...');
  const { x: windowX, y: windowY, width: windowWidth, height: windowHeight } = resolveInitialBounds();

  // Get app icon for development mode (Windows/Linux need icon in BrowserWindow)
  // In production, icons are set via forge.config.ts packagerConfig
  let devIcon: Electron.NativeImage | undefined;
  if (!app.isPackaged) {
    try {
      // Windows: app.ico (no dev version), Linux: app_dev.png (with padding)
      const iconFile = process.platform === 'win32' ? 'app.ico' : 'app_dev.png';
      const iconPath = path.join(process.cwd(), 'resources', iconFile);
      if (fs.existsSync(iconPath)) {
        devIcon = nativeImage.createFromPath(iconPath);
        if (devIcon.isEmpty()) devIcon = undefined;
      }
    } catch {
      // Ignore icon loading errors in development
    }
  }

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    ...(windowX !== undefined && windowY !== undefined ? { x: windowX, y: windowY } : {}),
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false, // Hide until CSS is loaded to prevent FOUC
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    // Set icon for Windows/Linux in development mode
    ...(devIcon && process.platform !== 'darwin' ? { icon: devIcon } : {}),
    // Custom titlebar configuration / 自定义标题栏配置
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hidden',
          // Align traffic-light vertical center with the titlebar button centers.
          // Titlebar is 45px; buttons are 36px flex-centered → button center y≈22.5.
          // Empirically y=13 places the traffic lights on the same horizontal line
          // as the sidebar / back / forward icons.
          // NOTE: requires a full app restart to take effect (BrowserWindow option).
          trafficLightPosition: { x: 10, y: 13 },
        }
      : { frame: false }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      webviewTag: true, // 启用 webview 标签用于 HTML 预览 / Enable webview tag for HTML preview
    },
  });
  console.log(`[CommandEVE] Main window created (id=${mainWindow.id})`);

  if (isTelemetryAllowed()) {
    scheduleStartupLogReport(mainWindow);
  }

  // Show window after content is ready to prevent FOUC (Flash of Unstyled Content)
  // Use 'ready-to-show' which fires when renderer has painted first frame,
  // combined with 'did-finish-load' as belt-and-suspenders approach.
  if (showOnReady) {
    const showWindow = () => {
      if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        console.log('[CommandEVE] Showing main window');
        mainWindow.show();
        mainWindow.focus();
      }
    };
    mainWindow.once('ready-to-show', () => {
      console.log('[CommandEVE] Window ready-to-show');
      showWindow();
    });
    // Belt-and-suspenders: also show on did-finish-load in case ready-to-show already fired
    mainWindow.webContents.once('did-finish-load', () => {
      console.log('[CommandEVE] Renderer did-finish-load');
      showWindow();
      scheduleBackendMigrations();
    });
    // Fallback: show window after 5s even if events don't fire (e.g. loadURL failure)
    setTimeout(showWindow, 5000);
  } else if (process.platform === 'darwin' && app.dock) {
    void app.dock.hide();
  }

  initMainAdapterWithWindow(mainWindow);
  bindMainWindowReferences(mainWindow);

  setupApplicationMenu();

  setupZoomForWindow(mainWindow);
  registerWindowMaximizeListeners(mainWindow);
  attachWindowBoundsPersistence(mainWindow, (bounds) => ProcessConfig.set('window.bounds', bounds));

  // Initialize auto-updater service (skip when disabled via env, e.g. E2E / CI)
  // 初始化自动更新服务（通过环境变量禁用时跳过，例如 E2E / CI 场景）
  const isCiRuntime = process.env.CI === 'true' || process.env.CI === '1' || process.env.GITHUB_ACTIONS === 'true';
  const disableAutoUpdater =
    process.env.AIONUI_DISABLE_AUTO_UPDATE === '1' || process.env.AIONUI_E2E_TEST === '1' || isCiRuntime;
  if (!disableAutoUpdater) {
    Promise.all([import('./process/services/autoUpdaterService'), import('./process/bridge/updateBridge')])
      .then(([{ autoUpdaterService }, { createAutoUpdateStatusBroadcast }]) => {
        // Create status broadcast callback that emits via ipcBridge (pure emitter, no window binding)
        const statusBroadcast = createAutoUpdateStatusBroadcast();
        autoUpdaterService.initialize(statusBroadcast);
        // Check for updates after 3 seconds delay
        // 3秒后检查更新
        setTimeout(() => {
          void autoUpdaterService.checkForUpdatesAndNotify();
        }, 3000);
      })
      .catch((error) => {
        console.error('[App] Failed to initialize autoUpdaterService:', error);
      });
  } else {
    console.log('[CommandEVE] Auto-updater disabled via env/CI guard');
  }

  // Load the renderer: dev server URL in development, built HTML file in production
  const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
  const fallbackFile = path.join(__dirname, '../renderer/index.html');

  if (!app.isPackaged && rendererUrl) {
    console.log(`[CommandEVE] Loading renderer URL: ${rendererUrl}`);
    mainWindow.loadURL(rendererUrl).catch((error) => {
      console.error('[CommandEVE] loadURL failed, falling back to file:', error.message || error);
      mainWindow.loadFile(fallbackFile).catch((e2) => {
        console.error('[CommandEVE] loadFile fallback also failed:', e2.message || e2);
      });
    });
  } else {
    console.log(`[CommandEVE] Loading renderer file: ${fallbackFile}`);
    mainWindow.loadFile(fallbackFile).catch((error) => {
      console.error('[CommandEVE] loadFile failed:', error.message || error);
    });
  }

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error('[CommandEVE] did-fail-load:', { errorCode, errorDescription, validatedURL, isMainFrame });
  });

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[CommandEVE] render-process-gone:', details);

    // Reload the renderer to recover from the crash.
    // The isDestroyed() guard in adapter/main.ts prevents further sends
    // to the dead webContents while the reload is in progress.
    if (!mainWindow.isDestroyed()) {
      console.log('[CommandEVE] Attempting to recover from renderer crash by reloading...');

      if (!app.isPackaged && rendererUrl) {
        mainWindow.loadURL(rendererUrl).catch((error) => {
          console.error('[CommandEVE] Recovery loadURL failed:', error.message || error);
        });
      } else {
        mainWindow.loadFile(fallbackFile).catch((error) => {
          console.error('[CommandEVE] Recovery loadFile failed:', error.message || error);
        });
      }
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.warn('[CommandEVE] Renderer became unresponsive');
  });

  mainWindow.on('closed', () => {
    console.log('[CommandEVE] Main window closed');
  });

  // DevTools is no longer auto-opened at startup.
  // Use the DevTools toggle in Settings > System (dev mode only) to open it.

  // Listen to DevTools state changes and notify Renderer
  mainWindow.webContents.on('devtools-opened', () => {
    ipcBridge.application.devToolsStateChanged.emit({ isOpen: true });
  });

  mainWindow.webContents.on('devtools-closed', () => {
    ipcBridge.application.devToolsStateChanged.emit({ isOpen: false });
  });

  // 关闭拦截：当启用"关闭到托盘"时，隐藏窗口而非关闭
  // Close interception: hide window instead of closing when "close to tray" is enabled
  mainWindow.on('close', (event) => {
    if (mainWindow.isDestroyed()) return;
    if (getCloseToTrayEnabled() && !getIsQuitting()) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
};

const handleAppReady = async (): Promise<void> => {
  const t0 = performance.now();
  const mark = (label: string) => console.log(`[CommandEVE:ready] ${label} +${Math.round(performance.now() - t0)}ms`);
  mark('start');

  if (!app.isPackaged) {
    try {
      const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import('electron-devtools-installer');
      await installExtension(REACT_DEVELOPER_TOOLS);
      console.log('[DevTools] React Developer Tools installed');
    } catch (e) {
      console.warn('[DevTools] Failed to install React DevTools:', e);
    }
  }

  // CLI mode: print app version and exit immediately (used by CI smoke tests)
  if (isVersionMode) {
    console.log(app.getVersion());
    app.exit(0);
    return;
  }

  // Set dock icon in development mode on macOS
  // In production, the icon is set via forge.config.ts packagerConfig.icon
  if (process.platform === 'darwin' && !app.isPackaged && app.dock) {
    try {
      const iconPath = path.join(process.cwd(), 'resources', 'app_dev.png');
      if (fs.existsSync(iconPath)) {
        const icon = nativeImage.createFromPath(iconPath);
        if (!icon.isEmpty()) {
          app.dock.setIcon(icon);
        }
      }
    } catch {
      // Ignore dock icon errors in development
    }
  }

  if (isTelemetryAllowed()) {
    setSentryDeviceId();
  }

  try {
    await initializeProcess();
    mark('initializeProcess');
    registerCommandEveRuntimeBridge();
  } catch (error) {
    console.error('Failed to initialize process:', error);
    app.exit(1);
    return;
  }

  try {
    const { getDataPath } = await import('./process/utils/utils');
    const { startCommandEveOllamaOpenAiShim, warmCommandEveLocalModel } =
      await import('./process/commandEve/ollamaOpenAiShim');
    const {
      ensureCommandEveRuntimeBootstrap,
      prepareCommandEveRuntimeProcessEnv,
      resolveCommandEveRuntimeBootstrapPaths,
    } = await import('./process/commandEve/runtimeBootstrapCore');
    const runtimePaths = resolveCommandEveRuntimeBootstrapPaths(getDataPath());
    const shimUrl = await startCommandEveOllamaOpenAiShim({
      promptProofPath: commandEvePromptProofPath(runtimePaths.runtimeRoot),
      egressReceiptPath: commandEveEgressBoundaryReceiptPath(runtimePaths.runtimeRoot),
      eveRouting: buildCommandEveShimRoutingResolver(),
    });
    commandEveOllamaShimUrl = shimUrl;
    mark(`commandEveOllamaShim (${shimUrl})`);
    prepareCommandEveRuntimeProcessEnv(getDataPath());
    const localModelTierId = await ProcessConfig.get('commandEve.localModelTierId').catch((): undefined => undefined);
    const bootstrap = ensureCommandEveRuntimeBootstrap({
      userDataPath: getDataPath(),
      appPath: app.getAppPath(),
      resourcesPath: process.resourcesPath,
      mode: 'auto',
      env: localModelTierId ? { COMMAND_EVE_LOCAL_MODEL_TIER: localModelTierId } : undefined,
    });
    if (shouldBlockStartupForCommandEveRuntimeBootstrap) {
      const receipt = await bootstrap;
      mark(`commandEveRuntimeBootstrap (${receipt.status})`);
      scheduleCommandEveLocalModelWarmup(receipt, shimUrl, warmCommandEveLocalModel, mark);
    } else {
      void bootstrap
        .then((receipt) => {
          console.info(`[Command EVE] Runtime bootstrap ${receipt.status}: ${receipt.next_action}`);
          scheduleCommandEveLocalModelWarmup(receipt, shimUrl, warmCommandEveLocalModel, mark);
        })
        .catch((error) => {
          console.error('[Command EVE] Runtime bootstrap failed:', error);
        });
      mark('commandEveRuntimeBootstrap scheduled');
    }
  } catch (error) {
    console.error('[Command EVE] Runtime bootstrap could not be scheduled:', error);
  }

  // Start aioncore only after initializeProcess(). initStorage may open
  // the legacy Electron SQLite catalog for a one-shot v26 migration and must
  // close it before the backend touches the same file.
  try {
    const { getDataPath } = await import('./process/utils/utils');
    const { getSystemDir } = await import('./process/utils/initStorage');
    const sysDir = getSystemDir();
    const backendPort = await backendManager.start(getDataPath(), sysDir.logDir, {
      cacheDir: sysDir.cacheDir,
      workDir: sysDir.workDir,
      logDir: sysDir.logDir,
    });
    mark(`backendManager.start (port=${backendPort})`);
    // Expose the backend port to main-process callers of httpBridge (e.g. the
    // one-shot assistant migration hook below). Must land BEFORE any
    // ipcBridge.* invoke from the main process — the renderer side reads
    // window.__backendPort via preload, but main has no `window`.
    (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort = backendPort;
    registerCronResumeBridge(backendPort);
    backendStartedOk = true;
  } catch (error) {
    console.error('[CommandEVE] Failed to start aioncore:', error);
    backendStartupFailed = true;
    backendStartupFailureInfo = {
      reason: 'backend_startup_failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  // One-shot WebUI admin credential migration. Must run after the backend is
  // up (__backendPort set) and before any mode branch below that might log the
  // user in. Swallows its own errors; the next boot retries.
  const bootBackendPort = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
  if (bootBackendPort) {
    try {
      const { ensureAdminUser } = await import('./process/utils/ensureAdminUser');
      await ensureAdminUser(bootBackendPort);
    } catch (err) {
      console.error('[WebUI] ensureAdminUser failed:', err);
    }

    try {
      await ensureCommandEveAssistantReadiness();
      mark('commandEveAssistantBootstrap');
    } catch (err) {
      console.error('[Command EVE] Assistant bootstrap failed:', err);
    }
  }

  // One-shot backend migrations are deferred until after the renderer finishes
  // loading. Some migration steps (ConfigStorage.get, ipcBridge.listProviders)
  // route through the renderer via BroadcastChannel; running them here would
  // deadlock because the renderer does not exist yet. See scheduleBackendMigrations().

  try {
    initializeZoomFactor(await ProcessConfig.get('ui.zoomFactor'));
    mark('initializeZoomFactor');
  } catch (error) {
    console.error('[CommandEVE] Failed to restore zoom factor:', error);
    initializeZoomFactor(undefined);
  }

  try {
    loadSavedWindowBounds(await ProcessConfig.get('window.bounds'));
    mark('restoreWindowBounds');
  } catch (error) {
    console.error('[CommandEVE] Failed to restore window bounds:', error);
    loadSavedWindowBounds(undefined);
  }

  if (isResetPasswordMode) {
    // Handle password reset without creating window
    try {
      const { resetPasswordCLI, resolveResetPasswordUsername } = await import('./process/utils/resetPasswordCLI');
      const username = resolveResetPasswordUsername(process.argv);

      await resetPasswordCLI(username);

      app.quit();
    } catch {
      app.exit(1);
    }
  } else if (isWebUIMode) {
    const userConfigInfo = loadUserWebUIConfig();
    if (userConfigInfo.exists && userConfigInfo.path) {
      // Config file loaded from user directory
    }
    const resolvedPort = resolveWebUIPort(userConfigInfo.config, getSwitchValue);
    const allowRemote = resolveRemoteAccess(userConfigInfo.config, isRemoteMode);
    try {
      // Inside Electron (`AionUi --webui` or packaged `aionui-web` mode that
      // launches via the Electron shell), reuse the desktop app's data-dir so
      // that conversations / cron jobs created in any path show up everywhere.
      // Matches the desktop IPC path at line 493 above.
      const { getDataPath } = await import('./process/utils/utils');
      const { getSystemDir } = await import('./process/utils/initStorage');
      const sysDirWebUI = getSystemDir();
      // M6: Switch to @aionui/web-host
      const handle = await startWebHost({
        app: {
          version: app.getVersion(),
          isPackaged: app.isPackaged,
          resourcesPath: app.getAppPath(),
          // Same reason as dataDir below: webui.config.json must live next to
          // the DB under the CLI-safe symlink path, so every password-change
          // entry point (CLI --resetpass, settings-toggle IPC, browser login)
          // reads the same file.
          userDataPath: getDataPath(),
        },
        staticDir: path.join(__dirname, '../renderer'),
        port: resolvedPort,
        allowRemote,
        dataDir: getDataPath(),
        logDir: sysDirWebUI.logDir,
        // Expose the same AIONUI_{CACHE,WORK,LOG}_DIR env the desktop IPC path
        // passes at line 493, so /api/system/info reports the symlink workDir
        // instead of the path-with-spaces userData root.
        dirs: {
          cacheDir: sysDirWebUI.cacheDir,
          workDir: sysDirWebUI.workDir,
          logDir: sysDirWebUI.logDir,
        },
        backend: {
          kind: 'useExistingBackend',
          port: (() => {
            // Reuse the backend already spawned by backendManager.start() above.
            // Spawning a second backend here would race the first on SQLite.
            const port = (globalThis as typeof globalThis & { __backendPort?: number }).__backendPort;
            if (!port) {
              throw new Error('[WebUI] Cannot start: aioncore is not running (globalThis.__backendPort unset)');
            }
            return port;
          })(),
        },
      });
      console.log(`[WebUI] Headless server started (port=${handle.port}, backendPort=${handle.backendPort})`);
    } catch (err) {
      console.error(`[WebUI] Failed to start server on port ${resolvedPort}:`, err);
      app.exit(1);
      return;
    }

    // Keep the process alive in WebUI mode by preventing default quit behavior.
    // On Linux headless (systemd), Electron may attempt to quit when no windows exist.
    app.on('will-quit', (event) => {
      // Only prevent quit if this is an unexpected exit (server still running).
      // Explicit app.exit() calls bypass will-quit, so they are unaffected.
      if (!isExplicitQuit) {
        event.preventDefault();
        console.warn('[WebUI] Prevented unexpected quit — server is still running');
      }
    });
  } else {
    // 初始化关闭到托盘设置 / Initialize close-to-tray setting
    if (isE2ETestMode) {
      setCloseToTrayEnabled(false);
      destroyTray();
    } else {
      try {
        const savedCloseToTray = await ProcessConfig.get('system.closeToTray');
        setCloseToTrayEnabled(savedCloseToTray ?? false);
        if (getCloseToTrayEnabled()) {
          createOrUpdateTray();
        }
      } catch {
        // Ignore storage read errors, default to false
      }
    }

    const showMainWindowOnReady = !(wasLaunchedAtLogin() && getCloseToTrayEnabled());

    createWindow({ showOnReady: showMainWindowOnReady });
    appReadyDone = true;
    mark('createWindow');

    // Initialize desktop pet (delayed to not block main window)
    setTimeout(() => {
      void (async () => {
        try {
          const petEnabled = await ProcessConfig.get('pet.enabled');
          if (petEnabled === true) {
            // Read pet sub-settings before creating the pet so flags are honored
            // on the first createPetWindow() call (which is sync).
            const confirmEnabled = (await ProcessConfig.get('pet.confirmEnabled')) ?? true;
            const { createPetWindow, setPetConfirmEnabled } = await import('./process/pet/petManager');
            setPetConfirmEnabled(confirmEnabled);
            createPetWindow();
          }
        } catch (error) {
          console.error('[Pet] Failed to initialize:', error);
        }
      })();
    }, 3000);

    // 读取语言设置并初始化主进程 i18n，然后刷新托盘菜单
    // Read language setting and initialize main process i18n, then refresh tray menu
    try {
      const savedLanguage = await ProcessConfig.get('language');
      rendererInitialLanguage = typeof savedLanguage === 'string' ? savedLanguage : null;
      await setInitialLanguage(savedLanguage);
      // After language is set, refresh tray menu if it exists
      await refreshTrayMenu();
    } catch (error) {
      console.error('[index] Failed to initialize i18n language:', error);
    }

    // 监听语言变更，刷新托盘菜单文案 / Listen for language changes to refresh tray menu labels
    onLanguageChanged(() => {
      void refreshTrayMenu();
    });

    if (!isE2ETestMode) {
      // 窗口创建后异步恢复 WebUI，不阻塞 UI / Restore WebUI async after window creation, non-blocking
      restoreDesktopWebUIFromPreferences().catch((error) => {
        console.error('[WebUI] Failed to auto-restore:', error);
      });
    }

    // Flush pending deep-link URL (received before window was ready)
    const pendingUrl = getPendingDeepLinkUrl();
    if (pendingUrl) {
      clearPendingDeepLinkUrl();
      mainWindow.webContents.once('did-finish-load', () => {
        handleDeepLinkUrl(pendingUrl);
      });
    }
  }

  // Verify CDP is ready and log status
  const { cdpPort, verifyCdpReady } = await import('./process/utils/configureChromium');
  if (cdpPort) {
    const cdpReady = await verifyCdpReady(cdpPort);
    if (cdpReady) {
      console.log(`[CDP] Remote debugging server ready at http://127.0.0.1:${cdpPort}`);
      console.log(
        `[CDP] MCP chrome-devtools: npx chrome-devtools-mcp@0.16.0 --browser-url=http://127.0.0.1:${cdpPort}`
      );
    } else {
      console.warn(`[CDP] Warning: Remote debugging port ${cdpPort} not responding`);
    }
  }
};

// ============ Protocol Registration ============
// Register aionui:// as the default protocol client
if (process.defaultApp) {
  // Dev mode: need to pass execPath explicitly
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
} else {
  app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

// macOS: handle aionui:// URLs via the open-url event
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLinkUrl(url);
  if (isWebUIMode || isResetPasswordMode || !app.isReady()) {
    return;
  }
  // Focus existing window so user sees the result
  showOrCreateMainWindow({ mainWindow, createWindow });
});

// 监听 GPU 子进程崩溃，连续多次后下次启动自动关闭硬件加速（参见 ELECTRON-9A / ELECTRON-9D）。
installGpuCrashHandler();

// Ensure we don't miss the ready event when running in CLI/WebUI mode
void app
  .whenReady()
  .then(handleAppReady)
  .catch((error) => {
    // App initialization failed
    console.error('[CommandEVE] App initialization failed:', error);
    app.quit();
  });

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  // 当关闭到托盘启用时，不退出应用 / Don't quit when close-to-tray is enabled
  if (getCloseToTrayEnabled()) {
    return;
  }
  // In WebUI mode, don't quit when windows are closed since we're running a web server
  if (!isWebUIMode && process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  // Skip if handleAppReady hasn't finished — it will create the window itself.
  if (!appReadyDone) return;
  if (!isWebUIMode && app.isReady()) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 从托盘恢复隐藏的窗口 / Restore hidden window from tray
      showAndFocusMainWindow(mainWindow);
      if (process.platform === 'darwin' && app.dock) {
        void app.dock.show();
      }
    } else {
      createWindow();
    }
  }
});

app.on('before-quit', async () => {
  console.log('[CommandEVE] before-quit');
  setIsQuitting(true);
  isExplicitQuit = true;
  destroyTray();

  const cleanup = async () => {
    disposeCronResumeListener?.();
    disposeCronResumeListener = null;

    // Stop aioncore subprocess — backend shutdown kills all agent
    // children transitively (no separate frontend workerTaskManager remains)
    await backendManager.stop().catch((err) => console.error('[App] Failed to stop backend:', err));

    // Destroy desktop pet windows
    try {
      const { destroyPetWindow } = await import('./process/pet/petManager');
      destroyPetWindow();
    } catch {
      /* pet not initialized */
    }

    // Web Server lifecycle is managed by aioncore subprocess
    // Office/PPT preview spawns also live in the backend; frontend no longer owns those sessions.
  };

  // Master timeout: force quit if cleanup hangs
  const timeout = new Promise<void>((resolve) => {
    setTimeout(() => {
      console.warn('[CommandEVE] Cleanup timed out after 10s, forcing quit');
      resolve();
    }, 10000);
  });

  await Promise.race([cleanup(), timeout]);
});

app.on('will-quit', () => {
  console.log('[CommandEVE] will-quit — all cleanup should be complete');
});

app.on('quit', (_event, exitCode) => {
  console.log(`[CommandEVE] quit (exitCode=${exitCode})`);
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
