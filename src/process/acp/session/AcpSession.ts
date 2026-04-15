import { AcpError } from '@process/acp/errors/AcpError';
import { normalizeError } from '@process/acp/errors/errorNormalize';
import type { AcpProtocol, ProtocolFactory } from '@process/acp/infra/AcpProtocol';
import { defaultProtocolFactory } from '@process/acp/infra/AcpProtocol';
import type { ConnectorFactory, ConnectorHandle } from '@process/acp/infra/IAgentConnector';
import { noopMetrics, type AcpMetrics } from '@process/acp/metrics/AcpMetrics';
import { AuthNegotiator } from '@process/acp/session/AuthNegotiator';
import { ConfigTracker } from '@process/acp/session/ConfigTracker';
import { InputPreprocessor } from '@process/acp/session/InputPreprocessor';
import { McpConfig } from '@process/acp/session/McpConfig';
import { MessageTranslator } from '@process/acp/session/MessageTranslator';
import { PermissionResolver } from '@process/acp/session/PermissionResolver';
import { PromptQueue } from '@process/acp/session/PromptQueue';
import { PromptTimer } from '@process/acp/session/PromptTimer';
import type {
  AgentConfig,
  McpServerConfig,
  ProtocolHandlers,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionCallbacks,
  SessionNotification,
  SessionStatus,
} from '@process/acp/types';
import * as fs from 'node:fs';

export type SessionOptions = {
  promptTimeoutMs?: number;
  maxStartRetries?: number;
  maxResumeRetries?: number;
  protocolFactory?: ProtocolFactory;
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

export class AcpSession {
  private protocol: AcpProtocol | null = null;
  private connectorHandle: ConnectorHandle | null = null;
  private _status: SessionStatus = 'idle';
  private _sessionId: string | null = null;
  private startRetryCount = 0;
  private resumeRetryCount = 0;
  private draining = false;
  private queuePaused = false;
  private authPending = false;

  private readonly configTracker: ConfigTracker;
  private readonly permissionResolver: PermissionResolver;
  private readonly promptQueue: PromptQueue;
  private readonly messageTranslator: MessageTranslator;
  private readonly inputPreprocessor: InputPreprocessor;
  private readonly promptTimer: PromptTimer;
  private readonly authNegotiator: AuthNegotiator;
  private readonly metrics: AcpMetrics;
  private readonly protocolFactory: ProtocolFactory;
  private readonly maxStartRetries: number;
  private readonly maxResumeRetries: number;
  private readonly promptTimeoutMs: number;

  constructor(
    private readonly agentConfig: AgentConfig,
    private readonly connectorFactory: ConnectorFactory,
    private readonly callbacks: SessionCallbacks,
    options?: SessionOptions
  ) {
    this.maxStartRetries = options?.maxStartRetries ?? 3;
    this.maxResumeRetries = options?.maxResumeRetries ?? 2;
    this.promptTimeoutMs = options?.promptTimeoutMs ?? 300_000;
    this.protocolFactory = options?.protocolFactory ?? defaultProtocolFactory;
    this.metrics = options?.metrics ?? noopMetrics;

    this.configTracker = new ConfigTracker();
    this.promptQueue = new PromptQueue(options?.promptQueueMaxSize);
    this.messageTranslator = new MessageTranslator();
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
    this.doStart();
  }

  private async doStart(): Promise<void> {
    this.setStatus('starting');
    try {
      const t0 = Date.now();
      const connector = this.connectorFactory.create(this.agentConfig);
      this.connectorHandle = await connector.connect();
      this.metrics.recordSpawnLatency(this.agentConfig.agentBackend, Date.now() - t0);

      const handlers = this.buildProtocolHandlers();
      this.protocol = this.protocolFactory(this.connectorHandle.stream, handlers);
      this.protocol.closed.then(() => this.handleDisconnect());

      const t1 = Date.now();
      const initResult = await this.protocol.initialize();
      this.metrics.recordInitLatency(this.agentConfig.agentBackend, Date.now() - t1);

      if (initResult.authMethods && initResult.authMethods.length > 0) {
        try {
          await this.authNegotiator.authenticate(this.protocol, initResult.authMethods);
        } catch (err) {
          if (err instanceof AcpError && err.code === 'AUTH_REQUIRED') {
            this.authPending = true;
            await this.teardownConnection();
            this.callbacks.onSignal({
              type: 'auth_required',
              auth: this.authNegotiator.buildAuthRequiredData(initResult.authMethods),
            });
            return;
          }
          throw err;
        }
      }

      const mcpServers = McpConfig.merge({
        userServers: this.agentConfig.mcpServers,
        presetServers: this.agentConfig.presetMcpServers,
        teamServer: this.agentConfig.teamMcpConfig,
      });

      const sessionResult = this._sessionId
        ? await this.tryLoadOrCreate(mcpServers)
        : await this.protocol.createSession({
            cwd: this.agentConfig.cwd,
            mcpServers,
            additionalDirectories: this.agentConfig.additionalDirectories,
          });

      const result = sessionResult as Record<string, unknown>;
      this._sessionId = (result.sessionId as string) ?? this._sessionId;
      this.callbacks.onSessionId(this._sessionId!);

      this.configTracker.syncFromSessionResult({
        currentModelId: result.currentModelId as string | undefined,
        availableModels: result.availableModels as
          | Array<{ modelId: string; name: string; description?: string }>
          | undefined,
        currentModeId: result.currentModeId as string | undefined,
        availableModes: result.availableModes as Array<{ id: string; name: string; description?: string }> | undefined,
        configOptions: result.configOptions as
          | Array<{
              id: string;
              name: string;
              type: 'select' | 'boolean';
              currentValue: string | boolean;
            }>
          | undefined,
        cwd: this.agentConfig.cwd,
        additionalDirectories: this.agentConfig.additionalDirectories,
      });

      this.callbacks.onConfigUpdate(this.configTracker.configSnapshot());
      this.callbacks.onModelUpdate(this.configTracker.modelSnapshot());
      this.callbacks.onModeUpdate(this.configTracker.modeSnapshot());

      await this.reassertConfig();

      this.messageTranslator.reset();
      this.setStatus('active');
      this.scheduleDrain();
    } catch (err) {
      this.handleStartError(err);
    }
  }

  private async handleStartError(err: unknown): Promise<void> {
    const acpErr = normalizeError(err);
    if (acpErr.retryable && this.startRetryCount < this.maxStartRetries) {
      this.startRetryCount++;
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
      const connector = this.connectorFactory.create(this.agentConfig);
      this.connectorHandle = await connector.connect();
      const handlers = this.buildProtocolHandlers();
      this.protocol = this.protocolFactory(this.connectorHandle.stream, handlers);
      this.protocol.closed.then(() => this.handleDisconnect());

      await this.protocol.initialize();

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
      await this.teardownConnection();
      const delay = 1000 * Math.pow(2, this.resumeRetryCount - 1);
      setTimeout(() => this.resume(), delay);
    } else {
      await this.teardownConnection();
      this.enterError(acpErr.message);
    }
  }

  sendMessage(text: string, files?: string[]): void {
    const prompt = { id: crypto.randomUUID(), text, files, enqueuedAt: Date.now() };

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
    if (this._status !== 'prompting' || !this.protocol || !this._sessionId) return;
    this.protocol.cancel(this._sessionId).catch(() => {});
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
    if (this._status === 'active' && this.protocol && this._sessionId) {
      this.protocol
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
    if (this._status === 'active' && this.protocol && this._sessionId) {
      this.protocol
        .setMode(this._sessionId, modeId)
        .then(() => this.configTracker.setCurrentMode(modeId))
        .then(() => this.callbacks.onModeUpdate(this.configTracker.modeSnapshot()))
        .catch(() => {});
    }
  }

  setConfigOption(id: string, value: string | boolean): void {
    this.configTracker.setDesiredConfigOption(id, value);
    if (this._status === 'active' && this.protocol && this._sessionId) {
      this.protocol
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

  private async executePrompt(prompt: { id: string; text: string; files?: string[] }): Promise<void> {
    if (!this.protocol || !this._sessionId) return;

    this.setStatus('prompting');

    try {
      const content = this.inputPreprocessor.process(prompt.text, prompt.files);
      await this.reassertConfig();
      this.promptTimer.start();
      await this.protocol.prompt(this._sessionId, content);
      this.promptTimer.stop();
      this.messageTranslator.onTurnEnd();
      this.setStatus('active');
    } catch (err) {
      this.promptTimer.stop();
      this.messageTranslator.onTurnEnd();

      const acpErr = normalizeError(err);
      if (acpErr.code === 'PROCESS_CRASHED') {
        return;
      }
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
      onSessionUpdate: (notification) => this.handleSessionUpdate(notification),
      onRequestPermission: (request) => this.handlePermissionRequest(request),
      onReadTextFile: async (req) => {
        const { path } = req as { path: string };
        try {
          const content = fs.readFileSync(path, 'utf-8');
          return { content };
        } catch {
          return { error: 'File not found' };
        }
      },
      onWriteTextFile: async (req) => {
        const { path, content } = req as { path: string; content: string };
        try {
          fs.writeFileSync(path, content, 'utf-8');
          return { success: true };
        } catch {
          return { error: 'Write failed' };
        }
      },
    };
  }

  private handleSessionUpdate(notification: SessionNotification): void {
    const update = notification.update;

    if (update.sessionUpdate === 'current_mode_update') {
      this.configTracker.setCurrentMode(update.modeId);
      this.callbacks.onModeUpdate(this.configTracker.modeSnapshot());
      return;
    }
    if (update.sessionUpdate === 'config_option_update') {
      this.callbacks.onConfigUpdate(this.configTracker.configSnapshot());
      return;
    }
    if (update.sessionUpdate === 'usage_update') {
      const u = update as Record<string, unknown>;
      this.callbacks.onContextUsage({
        used: (u.inputTokens as number) ?? 0,
        total: (u.contextWindow as number) ?? 0,
        percentage: 0,
      });
      return;
    }

    this.promptTimer.reset();
    const messages = this.messageTranslator.translate(notification);
    for (const msg of messages) {
      try {
        this.callbacks.onMessage(msg);
      } catch {
        // onMessage error must not affect session update processing
      }
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

  private handleDisconnect(): void {
    if (this._status === 'idle' || this._status === 'suspended' || this._status === 'error') return;

    this.protocol = null;
    this.connectorHandle = null;

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
    if (!this.protocol || !this._sessionId) return;
    const pending = this.configTracker.getPendingChanges();
    if (pending.model) {
      try {
        await this.protocol.setModel(this._sessionId, pending.model);
        this.configTracker.setCurrentModel(pending.model);
      } catch {
        /* best effort */
      }
    }
    if (pending.mode) {
      try {
        await this.protocol.setMode(this._sessionId, pending.mode);
        this.configTracker.setCurrentMode(pending.mode);
      } catch {
        /* best effort */
      }
    }
    for (const opt of pending.configOptions) {
      try {
        await this.protocol.setConfigOption(this._sessionId, opt.id, opt.value);
        this.configTracker.setCurrentConfigOption(opt.id, opt.value);
      } catch {
        /* best effort */
      }
    }
  }

  private async tryLoadOrCreate(mcpServers: McpServerConfig[]): Promise<unknown> {
    if (this._sessionId && this.protocol) {
      try {
        return await this.protocol.loadSession({
          sessionId: this._sessionId,
          cwd: this.agentConfig.cwd,
          mcpServers,
          additionalDirectories: this.agentConfig.additionalDirectories,
        });
      } catch {
        this.callbacks.onSignal({ type: 'session_expired' });
      }
    }
    return this.protocol!.createSession({
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
    this.protocol = null;
    if (this.connectorHandle) {
      try {
        await this.connectorHandle.shutdown();
      } catch {
        /* best effort */
      }
      this.connectorHandle = null;
    }
  }
}
