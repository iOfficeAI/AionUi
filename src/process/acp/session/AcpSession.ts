import type {
  AuthMethod,
  LoadSessionResponse,
  McpServer,
  NewSessionResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  UsageUpdate,
} from '@agentclientprotocol/sdk';
import { AcpError } from '@process/acp/errors/AcpError';
import { normalizeError } from '@process/acp/errors/errorNormalize';
import type { AcpClient, ClientFactory, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import { ProcessAcpClient } from '@process/acp/infra/ProcessAcpClient';
import { noopMetrics, type AcpMetrics } from '@process/acp/metrics/AcpMetrics';
import { AuthNegotiator } from '@process/acp/session/AuthNegotiator';
import { ConfigTracker } from '@process/acp/session/ConfigTracker';
import { InputPreprocessor } from '@process/acp/session/InputPreprocessor';
import { McpConfig } from '@process/acp/session/McpConfig';
import { MessageTranslator } from '@process/acp/session/MessageTranslator';
import { PermissionResolver } from '@process/acp/session/PermissionResolver';
import type { QueuedPrompt } from '@process/acp/session/PromptQueue';
import { PromptQueue } from '@process/acp/session/PromptQueue';
import { PromptTimer } from '@process/acp/session/PromptTimer';
import type { AgentConfig, ProtocolHandlers, SessionCallbacks, SessionStatus } from '@process/acp/types';
import * as fs from 'node:fs';

export type SessionOptions = {
  promptTimeoutMs?: number;
  maxStartRetries?: number;
  maxResumeRetries?: number;
  metrics?: AcpMetrics;
  promptQueueMaxSize?: number;
  approvalCacheMaxSize?: number;
};

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  idle: [
    'starting', // start()
  ],
  starting: [
    'active', // handshake completed
    'starting', // handshake failed, retriable error
    'error', // handshake failed, non-retriable error
  ],
  active: [
    'prompting', // drainLoop PromptQueue
    'suspended', // suspend() or PromptQueue is empty
    'idle', // stop()
  ],
  prompting: [
    'active', // prompt completed, and PromptQueue is empty
    'prompting', // prompt completed, but PromptQueue is not empty
    'resuming', // process crashed with retriable error
    'error', // prompt crashed with non-retriable error
    'idle', // stop()
  ],
  suspended: [
    'resuming', // sendMessage() / resume()
    'idle', // stop()
  ],
  resuming: [
    'active', // handshake completed
    'resuming', // handshake failed, retriable error
    'error', // handshake failed, non-retriable error
  ],
  error: [
    'starting', // start() after error
    'idle', // stop() after error
  ],
};

/**
 * Wrap all SessionCallbacks methods with try/catch to prevent callback
 * implementation bugs from disrupting AcpSession's internal state machine.
 * Callback errors are logged but never propagated.
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
        return (fn as (...a: unknown[]) => unknown)(...args);
      } catch (err) {
        console.error(`[AcpSession:callback] ${key} threw:`, err);
      }
    };
  }
  return wrapped as SessionCallbacks;
}

export class AcpSession {
  private _status: SessionStatus = 'idle';
  private _sessionId: string | null = null;
  private draining = false;
  private queuePaused = false;
  private authPending = false;
  private cachedAuthMethods: AuthMethod[] | null = null;

  // retry properties
  private startRetryCount: number = 0;
  private resumeRetryCount: number = 0;
  private readonly maxStartRetries: number;
  private readonly maxResumeRetries: number;
  private readonly promptTimeoutMs: number;

  // components
  private readonly configTracker: ConfigTracker;
  private readonly permissionResolver: PermissionResolver;
  private readonly promptQueue: PromptQueue;
  private readonly messageTranslator: MessageTranslator;
  private readonly inputPreprocessor: InputPreprocessor;
  private readonly promptTimer: PromptTimer;
  private readonly authNegotiator: AuthNegotiator;
  private readonly metrics: AcpMetrics;
  private readonly callbacks: SessionCallbacks;
  // single-owner client reference (null when suspended/idle)
  private client: AcpClient | null = null;

  constructor(
    private readonly agentConfig: AgentConfig,
    private readonly clientFactory: ClientFactory,
    callbacks: SessionCallbacks,
    options?: SessionOptions
  ) {
    this.maxStartRetries = options?.maxStartRetries ?? 3;
    this.maxResumeRetries = options?.maxResumeRetries ?? 2;
    this.promptTimeoutMs = options?.promptTimeoutMs ?? 300_000;
    this.metrics = options?.metrics ?? noopMetrics;
    this.callbacks = wrapCallbacks(callbacks);

    this.configTracker = new ConfigTracker();
    this.promptQueue = new PromptQueue(options?.promptQueueMaxSize);
    this.messageTranslator = new MessageTranslator(agentConfig.agentId);
    this.inputPreprocessor = new InputPreprocessor((path) => fs.readFileSync(path, 'utf-8'));
    this.promptTimer = new PromptTimer(this.promptTimeoutMs, () => this.handlePromptTimeout());
    this.authNegotiator = new AuthNegotiator(agentConfig.agentBackend);
    this.permissionResolver = new PermissionResolver({
      autoApproveAll: agentConfig.autoApproveAll ?? false,
      cacheMaxSize: options?.approvalCacheMaxSize,
    });

    if (agentConfig.authCredentials) {
      this.authNegotiator.mergeCredentials(agentConfig.authCredentials);
    }

    // Restore session ID from previous run so doStart() calls loadSession instead of createSession.
    if (agentConfig.resumeSessionId) {
      this._sessionId = agentConfig.resumeSessionId;
    }
  }

  get status(): SessionStatus {
    return this._status;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  private setStatus(newStatus: SessionStatus): void {
    const allowed = VALID_TRANSITIONS[this._status];
    if (!allowed.includes(newStatus)) return;
    this._status = newStatus;
    this.callbacks.onStatusChange(newStatus);
  }

  start(): void {
    if (this._status === 'error') {
      this.startRetryCount = 0;
    }
    if (this._status !== 'idle' && this._status !== 'error') return;
    console.log(`[AcpSession] Starting session with backend ${this.agentConfig.agentBackend}`);
    this.doStart();
  }

  private async doStart(): Promise<void> {
    this.setStatus('starting');
    try {
      // Phase 1+2: spawn + init (AcpClient handles internally)
      const handlers = this.buildProtocolHandlers();
      this.client = this.clientFactory.create(this.agentConfig, handlers);
      this.client.onDisconnect(this.handleDisconnect);

      const t0 = Date.now();
      const initResult = await this.client.start();
      this.metrics.recordSpawnLatency(this.agentConfig.agentBackend, Date.now() - t0);

      // Cache authMethods for UI
      if (initResult.authMethods && initResult.authMethods.length > 0) {
        this.cachedAuthMethods = initResult.authMethods;
      }

      // Phase 3: create or load session
      const mcpServers = McpConfig.merge({
        userServers: this.agentConfig.mcpServers,
        presetServers: this.agentConfig.presetMcpServers,
        teamServer: this.agentConfig.teamMcpConfig,
      });

      let sessionResult: NewSessionResponse | LoadSessionResponse;
      try {
        sessionResult = this._sessionId
          ? await this.tryLoadOrCreate(mcpServers)
          : await this.client.createSession({
              cwd: this.agentConfig.cwd,
              mcpServers,
              additionalDirectories: this.agentConfig.additionalDirectories,
            });
      } catch (err) {
        const normalized = normalizeError(err);
        if (normalized.code === 'AUTH_REQUIRED') {
          this.authPending = true;
          await this.teardownConnection();
          this.callbacks.onSignal({
            type: 'auth_required',
            auth: this.authNegotiator.buildAuthRequiredData(this.cachedAuthMethods ?? undefined),
          });
          return;
        }
        throw err;
      }

      // Phase 4: apply session result
      this.applySessionResult(sessionResult);

      // Session is now active. Start draining the prompt queue if there are pending prompts.
      this.scheduleDrain();
    } catch (err) {
      this.handleStartError(err);
    }
  }

  private applySessionResult(sessionResult: NewSessionResponse | LoadSessionResponse): void {
    if ('sessionId' in sessionResult && typeof sessionResult.sessionId === 'string') {
      this._sessionId = sessionResult.sessionId;
    }
    this.callbacks.onSessionId(this._sessionId!);

    this.configTracker.syncFromSessionResult({
      currentModelId: sessionResult.models?.currentModelId ?? undefined,
      availableModels: sessionResult.models?.availableModels?.map((m) => ({
        modelId: m.modelId,
        name: m.name,
        description: m.description ?? undefined,
      })),
      currentModeId: sessionResult.modes?.currentModeId ?? undefined,
      availableModes: sessionResult.modes?.availableModes?.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description ?? undefined,
      })),
      configOptions: sessionResult.configOptions?.map((opt) => ({
        id: opt.id,
        name: opt.name,
        type: opt.type,
        currentValue: opt.currentValue,
      })),
      cwd: this.agentConfig.cwd,
      additionalDirectories: this.agentConfig.additionalDirectories,
    });

    this.callbacks.onConfigUpdate(this.configTracker.configSnapshot());
    this.callbacks.onModelUpdate(this.configTracker.modelSnapshot());
    this.callbacks.onModeUpdate(this.configTracker.modeSnapshot());

    this.messageTranslator.reset();
    this.setStatus('active');
  }

  private async handleStartError(err: unknown): Promise<void> {
    const acpErr = normalizeError(err);
    console.error(`[AcpSession:infra] start failed (${acpErr.code}, retryable=${acpErr.retryable})\n ${acpErr.stack}`);

    if (acpErr.retryable && this.startRetryCount < this.maxStartRetries) {
      this.startRetryCount++;
      if (this.client instanceof ProcessAcpClient) {
        this.client.clearBunxCacheIfNeeded();
      }
      await this.teardownConnection();
      const delay = 1000 * Math.pow(2, this.startRetryCount - 1);
      setTimeout(() => this.doStart(), delay);
    } else {
      await this.teardownConnection();
      this.enterError(acpErr.message);
    }
  }

  async stop(): Promise<void> {
    this.promptTimer.stop();
    this.promptQueue.clear();
    this.permissionResolver.rejectAll(new Error('Session stopped'));
    this.draining = false;
    this.queuePaused = false;
    this.authPending = false;
    await this.teardownConnection();
    this.setStatus('idle');
  }

  async suspend(): Promise<void> {
    if (this._status !== 'active' || !this.promptQueue.isEmpty) return;
    await this.teardownConnection();
    this.setStatus('suspended');
  }

  retryAuth(credentials?: Record<string, string>): void {
    if (!this.authPending) return;
    this.authPending = false;
    if (credentials) this.authNegotiator.mergeCredentials(credentials);
    this.doStart();
  }

  private async resume(): Promise<void> {
    this.setStatus('resuming');
    try {
      const handlers = this.buildProtocolHandlers();
      this.client = this.clientFactory.create(this.agentConfig, handlers);
      this.client.onDisconnect(this.handleDisconnect);
      await this.client.start();

      const mcpServers = McpConfig.merge({
        userServers: this.agentConfig.mcpServers,
        presetServers: this.agentConfig.presetMcpServers,
        teamServer: this.agentConfig.teamMcpConfig,
      });
      await this.tryLoadOrCreate(mcpServers);

      await this.reassertConfig();
      this.setStatus('active');

      if (this.queuePaused) {
        this.callbacks.onSignal({ type: 'queue_paused', reason: 'crash_recovery' });
      } else {
        this.scheduleDrain();
      }
    } catch (err) {
      this.handleResumeError(err);
    }
  }

  private async handleResumeError(err: unknown): Promise<void> {
    const acpErr = normalizeError(err);
    if (acpErr.retryable && this.resumeRetryCount < this.maxResumeRetries) {
      this.resumeRetryCount++;
      if (this.client instanceof ProcessAcpClient) {
        this.client.clearBunxCacheIfNeeded();
      }
      await this.teardownConnection();
      const delay = 1000 * Math.pow(2, this.resumeRetryCount - 1);
      setTimeout(() => this.resume(), delay);
    } else {
      await this.teardownConnection();
      this.enterError(acpErr.message);
    }
  }

  sendMessage(text: string, files?: string[]): void {
    const prompt: QueuedPrompt = { id: crypto.randomUUID(), text, files, enqueuedAt: Date.now() };
    switch (this._status) {
      case 'idle':
      case 'error':
        throw new AcpError('INVALID_STATE', `Cannot send in ${this._status} state`);
      case 'starting':
      case 'resuming':
      case 'active':
      case 'prompting':
        if (!this.promptQueue.enqueue(prompt)) {
          throw new AcpError('QUEUE_FULL', 'Prompt queue is full');
        }
        this.callbacks.onQueueUpdate(this.promptQueue.snapshot());
        if (this._status === 'active') this.scheduleDrain();
        return;
      case 'suspended':
        if (!this.promptQueue.enqueue(prompt)) {
          throw new AcpError('QUEUE_FULL', 'Prompt queue is full');
        }
        this.callbacks.onQueueUpdate(this.promptQueue.snapshot());
        this.resume();
        return;
    }
  }

  cancelPrompt(): void {
    if (this._status !== 'prompting' || !this.client || !this._sessionId) return;
    this.client.cancel(this._sessionId).catch(() => {});
  }

  cancelAll(): void {
    this.promptQueue.clear();
    this.callbacks.onQueueUpdate(this.promptQueue.snapshot());
    if (this._status === 'prompting') this.cancelPrompt();
  }

  resumeQueue(): void {
    this.queuePaused = false;
    this.scheduleDrain();
  }

  setModel(modelId: string): void {
    if (this._status === 'idle' || this._status === 'error') {
      throw new AcpError('INVALID_STATE', `Cannot set model in ${this._status}`);
    }
    this.configTracker.setDesiredModel(modelId);
    if (this._status === 'active' && this.client && this._sessionId) {
      this.client
        .setModel(this._sessionId, modelId)
        .then(() => this.configTracker.setCurrentModel(modelId))
        .then(() => this.callbacks.onModelUpdate(this.configTracker.modelSnapshot()))
        .catch(() => {});
    }
  }

  setMode(modeId: string): void {
    if (this._status === 'idle' || this._status === 'error') {
      throw new AcpError('INVALID_STATE', `Cannot set mode in ${this._status}`);
    }
    this.configTracker.setDesiredMode(modeId);
    if (this._status === 'active' && this.client && this._sessionId) {
      this.client
        .setMode(this._sessionId, modeId)
        .then(() => this.configTracker.setCurrentMode(modeId))
        .then(() => this.callbacks.onModeUpdate(this.configTracker.modeSnapshot()))
        .catch(() => {});
    }
  }

  setConfigOption(id: string, value: string | boolean): void {
    this.configTracker.setDesiredConfigOption(id, value);
    if (this._status === 'active' && this.client && this._sessionId) {
      this.client
        .setConfigOption(this._sessionId, id, value)
        .then(() => this.configTracker.setCurrentConfigOption(id, value))
        .catch(() => {});
    }
  }

  getConfigOptions() {
    return this.configTracker.configSnapshot().configOptions;
  }

  confirmPermission(callId: string, optionId: string): void {
    this.permissionResolver.resolve(callId, optionId);
  }

  private scheduleDrain(): void {
    if (this.draining || this.queuePaused) return;
    queueMicrotask(() => this.drainLoop());
  }

  private async drainLoop(): Promise<void> {
    if (this.draining || this.queuePaused) return;
    this.draining = true;

    try {
      while (!this.promptQueue.isEmpty && this._status === 'active' && !this.queuePaused) {
        const prompt = this.promptQueue.dequeue()!;
        this.callbacks.onQueueUpdate(this.promptQueue.snapshot());
        await this.executePrompt(prompt);
      }
    } finally {
      this.draining = false;
    }
  }

  private async executePrompt(prompt: QueuedPrompt): Promise<void> {
    if (!this.client || !this._sessionId) return;

    this.setStatus('prompting');

    try {
      const content = this.inputPreprocessor.process(prompt.text, prompt.files);
      await this.reassertConfig();

      this.promptTimer.start();
      await this.client.prompt(this._sessionId, content);
      this.promptTimer.stop();

      this.messageTranslator.onTurnEnd();
      this.setStatus('active');
      this.callbacks.onSignal({ type: 'turn_finished' });
    } catch (err) {
      this.promptTimer.stop();
      this.messageTranslator.onTurnEnd();

      const acpErr = normalizeError(err);
      if (acpErr.code === 'AUTH_REQUIRED') {
        // Re-queue the failed prompt so it's retried after auth recovery.
        this.promptQueue.enqueueFront(prompt);
        this.authPending = true;
        await this.teardownConnection();
        this.setStatus('error');
        this.callbacks.onSignal({
          type: 'auth_required',
          auth: this.authNegotiator.buildAuthRequiredData(this.cachedAuthMethods ?? undefined),
        });
        return;
      }
      console.error(`[AcpSession:infra] prompt failed (${acpErr.code}):`, acpErr.message);
      this.metrics.recordError(this.agentConfig.agentBackend, acpErr.code);

      if (acpErr.retryable) {
        this.setStatus('active');
      } else {
        this.enterError(acpErr.message);
      }
    }
  }

  private buildProtocolHandlers(): ProtocolHandlers {
    return {
      onSessionUpdate: (notification) => this.handleMessage(notification),
      onRequestPermission: (request) => this.handlePermissionRequest(request),
      onReadTextFile: async (req) => {
        try {
          const content = fs.readFileSync(req.path, 'utf-8');
          return { content };
        } catch {
          throw new Error(`File not found: ${req.path}`);
        }
      },
      onWriteTextFile: async (req) => {
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

      case 'usage_update': {
        const u = update as UsageUpdate & { sessionUpdate: 'usage_update' };
        this.callbacks.onContextUsage({
          used: u.used ?? 0,
          total: u.size ?? 0,
          percentage: u.size > 0 ? Math.round((u.used / u.size) * 100) : 0,
        });
        return;
      }
    }

    this.promptTimer.reset();
    const messages = this.messageTranslator.translate(notification);
    for (const msg of messages) {
      this.callbacks.onMessage(msg);
    }
  }

  private async handlePermissionRequest(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.promptTimer.pause();
    try {
      const result = await this.permissionResolver.evaluate(request, (data) => {
        this.callbacks.onPermissionRequest(data);
      });
      return result;
    } finally {
      this.promptTimer.resume();
    }
  }

  private handleDisconnect(_info?: DisconnectInfo): void {
    if (this._status === 'idle' || this._status === 'suspended' || this._status === 'error') return;

    this.client = null;

    if (this._status === 'prompting') {
      this.promptTimer.stop();
      this.permissionResolver.rejectAll(new Error('Process disconnected'));
      this.queuePaused = true;
      this.resumeRetryCount = 0;
      this.resume();
    } else {
      this.setStatus('suspended');
    }
  }

  private handlePromptTimeout(): void {
    if (this._status !== 'prompting') return;
    this.cancelPrompt();
    this.callbacks.onSignal({
      type: 'error',
      message: 'Prompt timed out',
      recoverable: true,
    });
  }

  private async reassertConfig(): Promise<void> {
    if (!this.client || !this._sessionId) return;
    const pending = this.configTracker.getPendingChanges();
    if (pending.model) {
      try {
        await this.client.setModel(this._sessionId, pending.model);
        this.configTracker.setCurrentModel(pending.model);
      } catch {
        /* best effort */
      }
    }
    if (pending.mode) {
      try {
        await this.client.setMode(this._sessionId, pending.mode);
        this.configTracker.setCurrentMode(pending.mode);
      } catch {
        /* best effort */
      }
    }
    for (const opt of pending.configOptions) {
      try {
        await this.client.setConfigOption(this._sessionId, opt.id, opt.value);
        this.configTracker.setCurrentConfigOption(opt.id, opt.value);
      } catch {
        /* best effort */
      }
    }
  }

  private async tryLoadOrCreate(mcpServers: McpServer[]): Promise<NewSessionResponse | LoadSessionResponse> {
    if (this._sessionId && this.client) {
      try {
        return await this.client.loadSession({
          sessionId: this._sessionId,
          cwd: this.agentConfig.cwd,
          mcpServers,
          additionalDirectories: this.agentConfig.additionalDirectories,
        });
      } catch {
        this.callbacks.onSignal({ type: 'session_expired' });
      }
    }
    return this.client!.createSession({
      cwd: this.agentConfig.cwd,
      mcpServers,
      additionalDirectories: this.agentConfig.additionalDirectories,
    });
  }

  private enterError(message: string): void {
    this.promptQueue.clear();
    this.permissionResolver.rejectAll(new Error(message));
    this.promptTimer.stop();
    this.callbacks.onQueueUpdate(this.promptQueue.snapshot());
    this.setStatus('error');
    this.callbacks.onSignal({ type: 'error', message, recoverable: false });
  }

  private async teardownConnection(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch {
        /* best effort */
      }
      this.client = null;
    }
  }
}
