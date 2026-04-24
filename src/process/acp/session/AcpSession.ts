import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  UsageUpdate,
} from '@agentclientprotocol/sdk';
import * as path from 'node:path';
import { AcpError } from '@process/acp/errors/AcpError';
import type { ClientFactory, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import { noopMetrics, type AcpMetrics } from '@process/acp/metrics/AcpMetrics';
import { ConfigTracker } from '@process/acp/session/ConfigTracker';
import { InputPreprocessor } from '@process/acp/session/InputPreprocessor';
import { MessageTranslator } from '@process/acp/session/MessageTranslator';
import { PermissionResolver } from '@process/acp/session/PermissionResolver';
import { PromptExecutor } from '@process/acp/session/PromptExecutor';
import { SessionLifecycle } from '@process/acp/session/SessionLifecycle';
import type {
  AgentConfig,
  InitialDesiredConfig,
  ProtocolHandlers,
  SessionCallbacks,
  SessionStatus,
} from '@process/acp/types';
import * as fs from 'node:fs';

export type SessionOptions = {
  promptTimeoutMs?: number;
  maxStartRetries?: number;
  maxResumeRetries?: number;
  metrics?: AcpMetrics;
  approvalCacheMaxSize?: number;
  /** User selections made before session creation (e.g., from the Guid page). */
  initialDesired?: InitialDesiredConfig;
};

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: ['starting'],
  starting: ['active', 'starting', 'error', 'idle'],
  active: ['prompting', 'suspended', 'idle'],
  prompting: ['active', 'resuming', 'error', 'idle'],
  suspended: ['resuming', 'idle'],
  resuming: ['active', 'resuming', 'error', 'idle'],
  error: ['starting', 'idle'],
};

/**
 * Wrap all SessionCallbacks methods with try/catch to prevent callback
 * implementation bugs from disrupting AcpSession's internal state machine.
 */
function wrapCallbacks(raw: SessionCallbacks): SessionCallbacks {
  const wrapped = {} as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    const fn = raw[key as keyof SessionCallbacks];
    if (typeof fn !== 'function') {
      wrapped[key] = fn;
      continue;
    }
    wrapped[key] = (...args: unknown[]) => {
      try {
        const result = (fn as (...a: unknown[]) => unknown)(...args);
        if (result instanceof Promise) {
          return result.catch((err: unknown) => {
            console.error(`[AcpSession:callback] ${key} rejected:`, err);
          });
        }
        return result;
      } catch (err) {
        console.error(`[AcpSession:callback] ${key} threw:`, err);
      }
    };
  }
  return wrapped as SessionCallbacks;
}

export function buildCrashMessage(info?: DisconnectInfo): string | null {
  if (!info) return null;
  return `process exited unexpectedly (code: ${info.exitCode ?? 'unknown'}, signal: ${info.signal ?? 'none'})`;
}

export class AcpSession {
  private _status: SessionStatus = 'idle';

  // components (exposed as readonly for host interfaces)
  readonly configTracker: ConfigTracker;
  readonly messageTranslator: MessageTranslator;
  readonly callbacks: SessionCallbacks;
  readonly metrics: AcpMetrics;

  private readonly permissionResolver: PermissionResolver;
  private readonly inputPreprocessor: InputPreprocessor;
  private readonly lifecycle: SessionLifecycle;
  private readonly promptExecutor: PromptExecutor;

  constructor(
    private readonly agentConfig: AgentConfig,
    clientFactory: ClientFactory,
    callbacks: SessionCallbacks,
    options?: SessionOptions
  ) {
    this.metrics = options?.metrics ?? noopMetrics;
    this.callbacks = wrapCallbacks(callbacks);

    this.configTracker = new ConfigTracker(options?.initialDesired);
    this.messageTranslator = new MessageTranslator(agentConfig.agentId);
    this.inputPreprocessor = new InputPreprocessor((path) => fs.readFileSync(path, 'utf-8'));
    this.permissionResolver = new PermissionResolver({
      autoApproveAll: agentConfig.yoloMode ?? false,
      cacheMaxSize: options?.approvalCacheMaxSize,
    });

    this.lifecycle = new SessionLifecycle(
      {
        agentConfig: agentConfig,
        configTracker: this.configTracker,
        messageTranslator: this.messageTranslator,
        callbacks: this.callbacks,
        metrics: this.metrics,
        setStatus: (s) => this.setStatus(s),
        enterError: (msg) => this.enterError(msg),
        flushPendingPrompt: () => this.promptExecutor.flush(),
        buildProtocolHandlers: () => this.buildProtocolHandlers(),
        onDisconnect: (info?: DisconnectInfo) => this.onDisconnect(info),
      },
      clientFactory,
      {
        maxStartRetries: options?.maxStartRetries ?? 3,
        maxResumeRetries: options?.maxResumeRetries ?? 2,
      }
    );

    // `self` captured by the getter closure below — must be assigned before PromptExecutor construction.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    this.promptExecutor = new PromptExecutor(
      {
        get status() {
          return self.status;
        },
        lifecycle: this.lifecycle,
        messageTranslator: this.messageTranslator,
        authNegotiator: this.lifecycle.authNegotiator,
        callbacks: this.callbacks,
        metrics: this.metrics,
        agentConfig: agentConfig,
        setStatus: (s) => this.setStatus(s),
        enterError: (msg) => this.enterError(msg),
      },
      options?.promptTimeoutMs ?? 300_000
    );
  }

  // ─── State machine ────────────────────────────────────────────

  get status(): SessionStatus {
    return this._status;
  }

  get sessionId(): string | null {
    return this.lifecycle.sessionId;
  }

  setStatus(newStatus: SessionStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed.includes(newStatus)) {
      console.warn(`[AcpSession] Invalid status transition: ${this._status} → ${newStatus}`);
      return;
    }
    this._status = newStatus;
    this.callbacks.onStatusChange(newStatus);
  }

  // ─── Public API ───────────────────────────────────────────────

  start(): void {
    if (this._status !== 'idle' && this._status !== 'error') return;
    console.log(`[AcpSession] Starting session with backend ${this.agentConfig.agentBackend}`);
    this.lifecycle.start();
  }

  async stop(): Promise<void> {
    this.promptExecutor.stopTimer();
    this.permissionResolver.rejectAll(new Error('Session stopped'));
    this.promptExecutor.clearPending();
    this.lifecycle.clearAuthPending();
    await this.lifecycle.teardown();
    this.setStatus('idle');
  }

  async suspend(): Promise<void> {
    if (this._status !== 'active') return;
    await this.lifecycle.teardown();
    this.setStatus('suspended');
  }

  retryAuth(credentials?: Record<string, string>): void {
    this.lifecycle.retryAuth(credentials);
  }

  async sendMessage(text: string, files?: string[]): Promise<void> {
    const content = this.inputPreprocessor.process(text, files);
    switch (this._status) {
      case 'active':
        await this.promptExecutor.execute(content);
        return;
      case 'suspended':
        this.promptExecutor.setPending(content);
        this.lifecycle.resume();
        return;
      default:
        throw new AcpError('INVALID_STATE', `Cannot send in ${this._status} state`);
    }
  }

  cancelPrompt(): void {
    this.promptExecutor.stopTimer();
    this.permissionResolver.rejectAll(new Error('Prompt cancelled'));
    this.promptExecutor.cancel();
  }

  cancelAll(): void {
    this.promptExecutor.cancelAll();
  }

  setModel(modelId: string): void {
    this.configTracker.setDesiredModel(modelId);
    if (this._status === 'idle' || this._status === 'error') return;
    const { client, sessionId } = this.lifecycle;
    if (this._status === 'active' && client && sessionId) {
      client
        .setModel(sessionId, modelId)
        .then(() => this.configTracker.setCurrentModel(modelId))
        .then(() => this.callbacks.onModelUpdate(this.configTracker.modelSnapshot()))
        .catch((err) => console.warn('[AcpSession] setModel failed:', err));
    }
  }

  setMode(modeId: string): void {
    this.configTracker.setDesiredMode(modeId);
    if (this._status === 'idle' || this._status === 'error') return;
    const { client, sessionId } = this.lifecycle;
    if (this._status === 'active' && client && sessionId) {
      client
        .setMode(sessionId, modeId)
        .then(() => this.configTracker.setCurrentMode(modeId))
        .then(() => this.callbacks.onModeUpdate(this.configTracker.modeSnapshot()))
        .catch((err) => console.warn('[AcpSession] setMode failed:', err));
    }
  }

  setConfigOption(id: string, value: string | boolean): void {
    this.configTracker.setDesiredConfigOption(id, value);
    const { client, sessionId } = this.lifecycle;
    if (this._status === 'active' && client && sessionId) {
      client
        .setConfigOption(sessionId, id, value)
        .then(() => this.configTracker.setCurrentConfigOption(id, value))
        .catch((err) => console.warn('[AcpSession] setConfigOption failed:', err));
    }
  }

  getConfigOptions() {
    return this.configTracker.configSnapshot().configOptions;
  }

  confirmPermission(callId: string, optionId: string): void {
    this.permissionResolver.resolve(callId, optionId);
  }

  // ─── Path validation ────────────────────────────────────────

  /**
   * Verify that an agent-requested file path is within the allowed directories
   * (cwd + additionalDirectories). Prevents path traversal attacks.
   */
  private assertPathAllowed(filePath: string): void {
    const resolved = path.resolve(filePath);
    const allowedRoots = [this.agentConfig.cwd, ...(this.agentConfig.additionalDirectories ?? [])];
    const withinAllowed = allowedRoots.some(
      (root) => resolved.startsWith(path.resolve(root) + path.sep) || resolved === path.resolve(root)
    );
    if (!withinAllowed) {
      throw new Error(`Path not allowed: ${filePath} is outside permitted directories`);
    }
  }

  // ─── Protocol handlers (glue) ─────────────────────────────────

  private buildProtocolHandlers(): ProtocolHandlers {
    return {
      onSessionUpdate: (notification) => this.handleMessage(notification),
      onRequestPermission: (request) => this.handlePermissionRequest(request),
      onReadTextFile: async (req) => {
        this.assertPathAllowed(req.path);
        try {
          const content = fs.readFileSync(req.path, 'utf-8');
          return { content };
        } catch {
          throw new Error(`File not found: ${req.path}`);
        }
      },
      onWriteTextFile: async (req) => {
        this.assertPathAllowed(req.path);
        try {
          fs.writeFileSync(req.path, req.content, 'utf-8');
          return {};
        } catch {
          throw new Error(`Write failed: ${req.path}`);
        }
      },
    };
  }

  private handleMessage(notification: SessionNotification): void {
    const update = notification.update;

    switch (update.sessionUpdate) {
      case 'current_mode_update':
        this.configTracker.setCurrentMode(update.currentModeId);
        this.callbacks.onModeUpdate(this.configTracker.modeSnapshot());
        return;

      case 'config_option_update':
        this.callbacks.onConfigUpdate(this.configTracker.configSnapshot());
        return;

      case 'available_commands_update': {
        const data = update as unknown as {
          availableCommands?: Array<{ name: string; description?: string; input?: { hint?: string } | null }>;
        };
        const commands = (data.availableCommands ?? []).map((cmd) => ({
          name: cmd.name,
          description: cmd.description,
          hint: cmd.input?.hint,
        }));
        this.configTracker.updateAvailableCommands(commands);
        this.callbacks.onConfigUpdate(this.configTracker.configSnapshot());
        return;
      }

      case 'usage_update': {
        const u = update as UsageUpdate & { sessionUpdate: 'usage_update' };
        this.callbacks.onContextUsage({
          used: u.used ?? 0,
          total: u.size ?? 0,
          percentage: u.size > 0 ? Math.round((u.used / u.size) * 100) : 0,
          cost: u.cost ? { amount: u.cost.amount, currency: u.cost.currency } : undefined,
        });
        return;
      }
    }

    this.promptExecutor.resetTimer();
    const messages = this.messageTranslator.translate(notification);
    for (const msg of messages) {
      this.callbacks.onMessage(msg);
    }
  }

  private async handlePermissionRequest(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.promptExecutor.pauseTimer();
    try {
      return await this.permissionResolver.evaluate(request, (data) => {
        this.callbacks.onPermissionRequest(data);
      });
    } finally {
      this.promptExecutor.resumeTimer();
    }
  }

  // ─── Internal helpers ─────────────────────────────────────────

  private onDisconnect(info?: DisconnectInfo): void {
    switch (this._status) {
      case 'idle':
      case 'suspended':
      case 'error':
        return;

      case 'prompting': {
        this.lifecycle.clearClient();
        this.emitCrashSignalIfProcessDied(info);
        this.promptExecutor.stopTimer();
        this.permissionResolver.rejectAll(new Error('Process disconnected'));
        this.lifecycle.resumeFromDisconnect();
        return;
      }

      case 'active': {
        // Process exited while idle (no prompt in flight).  This is a normal
        // lifecycle event — e.g. the agent bridge (codex-acp) may shut down
        // after an inactivity timeout.  Silently transition to "suspended" so
        // the next sendMessage triggers a fresh spawn.  Do NOT emit a crash
        // signal: the user would see a scary "process exited unexpectedly"
        // error even though the conversation completed normally.
        this.lifecycle.clearClient();
        this.setStatus('suspended');
        return;
      }

      default: {
        // starting / resuming — process died during bootstrap, treat as crash
        this.lifecycle.clearClient();
        this.emitCrashSignalIfProcessDied(info);
        this.setStatus('suspended');
      }
    }
  }

  /** Emit error signal with exit info so TeammateManager can detect agent crash. */
  private emitCrashSignalIfProcessDied(info?: DisconnectInfo): void {
    const msg = buildCrashMessage(info);
    if (!msg) return;
    this.callbacks.onSignal({ type: 'error', message: msg, recoverable: true });
  }

  enterError(message: string): void {
    this.promptExecutor.clearPending();
    this.permissionResolver.rejectAll(new Error(message));
    this.promptExecutor.stopTimer();
    this.setStatus('error');
    this.callbacks.onSignal({ type: 'error', message, recoverable: false });
  }
}
