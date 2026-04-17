import { getFullAutoMode } from '@/common/types/agentModes';
import type { AuthMethod, LoadSessionResponse, McpServer, NewSessionResponse } from '@agentclientprotocol/sdk';
import { normalizeError } from '@process/acp/errors/errorNormalize';
import type { AcpClient, ClientFactory, DisconnectInfo } from '@process/acp/infra/IAcpClient';
import { ProcessAcpClient } from '@process/acp/infra/ProcessAcpClient';
import type { AcpMetrics } from '@process/acp/metrics/AcpMetrics';
import { AuthNegotiator } from '@process/acp/session/AuthNegotiator';
import type { ConfigTracker } from '@process/acp/session/ConfigTracker';
import { McpConfig } from '@process/acp/session/McpConfig';
import type { MessageTranslator } from '@process/acp/session/MessageTranslator';
import type { AgentConfig, ProtocolHandlers, SessionCallbacks, SessionStatus } from '@process/acp/types';

// ─── YOLO mode resolution ──────────────────────────────────────

/**
 * Resolve the YOLO mode ID for a given backend, validated against the
 * agent's actual available modes. Returns `null` if the agent doesn't
 * advertise a matching mode (caller should fall back to client-side
 * auto-approve only).
 */
function resolveYoloModeId(backend: string, availableModes: ReadonlyArray<{ id: string }>): string | null {
  const candidate = getFullAutoMode(backend);
  return availableModes.some((m) => m.id === candidate) ? candidate : null;
}

// ────────────────────────────────────────────────────────────────

/** Minimal interface that AcpSession exposes so SessionLifecycle can drive state transitions. */
export type LifecycleHost = {
  readonly agentConfig: AgentConfig;
  readonly configTracker: ConfigTracker;
  readonly messageTranslator: MessageTranslator;
  readonly callbacks: SessionCallbacks;
  readonly metrics: AcpMetrics;

  setStatus(status: SessionStatus): void;
  enterError(message: string): void;
  flushPendingPrompt(): void;
  buildProtocolHandlers(): ProtocolHandlers;
  onDisconnect(info?: DisconnectInfo): void;
};

export type LifecycleOptions = {
  maxStartRetries: number;
  maxResumeRetries: number;
};

export class SessionLifecycle {
  private _sessionId: string | null = null;
  private _client: AcpClient | null = null;
  private authPending = false;
  private cachedAuthMethods: AuthMethod[] | null = null;

  private startRetryCount = 0;
  private resumeRetryCount = 0;

  readonly authNegotiator: AuthNegotiator;

  constructor(
    private readonly host: LifecycleHost,
    private readonly clientFactory: ClientFactory,
    private readonly options: LifecycleOptions
  ) {
    this.authNegotiator = new AuthNegotiator(host.agentConfig.agentBackend);

    if (host.agentConfig.authCredentials) {
      this.authNegotiator.mergeCredentials(host.agentConfig.authCredentials);
    }
    if (host.agentConfig.resumeSessionId) {
      this._sessionId = host.agentConfig.resumeSessionId;
    }
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get client(): AcpClient | null {
    return this._client;
  }

  get isAuthPending(): boolean {
    return this.authPending;
  }

  // ─── Start ────────────────────────────────────────────────────

  start(): void {
    this.startRetryCount = 0;
    void this.doStart().catch((err) => this.handleStartError(err));
  }

  private async doStart(): Promise<void> {
    this.host.setStatus('starting');
    try {
      await this.spawnAndInit();
      const sessionResult = await this.establishSession();
      if (!sessionResult) return; // auth-required, already handled
      this.applySessionResult(sessionResult);
      this.host.flushPendingPrompt();
    } catch (err) {
      this.handleStartError(err);
    }
  }

  private async spawnAndInit(): Promise<void> {
    const handlers = this.host.buildProtocolHandlers();
    this._client = this.clientFactory.create(this.host.agentConfig, handlers);
    this._client.onDisconnect(this.handleDisconnect);

    const t0 = Date.now();
    const initResult = await this._client.start();
    this.host.metrics.recordSpawnLatency(this.host.agentConfig.agentBackend, Date.now() - t0);

    if (initResult.authMethods && initResult.authMethods.length > 0) {
      this.cachedAuthMethods = initResult.authMethods;
    }

    this.host.callbacks.onInitialize?.(initResult);
  }

  /** Returns null when auth is required (caller should bail). */
  private async establishSession(): Promise<NewSessionResponse | LoadSessionResponse | null> {
    const mcpServers = this.buildMcpServers();
    try {
      return this._sessionId
        ? await this.tryLoadOrCreate(mcpServers)
        : await this._client!.createSession({
            cwd: this.host.agentConfig.cwd,
            mcpServers,
            additionalDirectories: this.host.agentConfig.additionalDirectories,
          });
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.code === 'AUTH_REQUIRED') {
        this.authPending = true;
        await this.teardown();
        this.host.callbacks.onSignal({
          type: 'auth_required',
          auth: this.authNegotiator.buildAuthRequiredData(this.cachedAuthMethods ?? undefined),
        });
        return null;
      }
      throw err;
    }
  }

  private async handleStartError(err: unknown): Promise<void> {
    const acpErr = normalizeError(err);
    console.error(`[SessionLifecycle] start failed (${acpErr.code}, retryable=${acpErr.retryable})\n ${acpErr.stack}`);

    if (acpErr.retryable && this.startRetryCount < this.options.maxStartRetries) {
      this.startRetryCount++;
      this.clearBunxCacheIfNeeded();
      await this.teardown();
      const delay = 1000 * Math.pow(2, this.startRetryCount - 1);
      setTimeout(() => this.doStart(), delay);
    } else {
      await this.teardown();
      this.host.enterError(acpErr.message);
    }
  }

  // ─── Resume ───────────────────────────────────────────────────

  resume(): void {
    void this.doResume().catch((err) => this.handleResumeError(err));
  }

  private async doResume(): Promise<void> {
    this.host.setStatus('resuming');
    try {
      await this.spawnAndInit();
      await this.tryLoadOrCreate(this.buildMcpServers());
      await this.reassertConfig();
      this.host.setStatus('active');
      this.host.flushPendingPrompt();
    } catch (err) {
      this.handleResumeError(err);
    }
  }

  private async handleResumeError(err: unknown): Promise<void> {
    const acpErr = normalizeError(err);
    if (acpErr.retryable && this.resumeRetryCount < this.options.maxResumeRetries) {
      this.resumeRetryCount++;
      this.clearBunxCacheIfNeeded();
      await this.teardown();
      const delay = 1000 * Math.pow(2, this.resumeRetryCount - 1);
      setTimeout(() => this.doResume(), delay);
    } else {
      await this.teardown();
      this.host.enterError(acpErr.message);
    }
  }

  /** Reset resume retry counter and trigger a resume (used after disconnect during prompting). */
  resumeFromDisconnect(): void {
    this.resumeRetryCount = 0;
    this.resume();
  }

  // ─── Auth ─────────────────────────────────────────────────────

  retryAuth(credentials?: Record<string, string>): void {
    if (!this.authPending) return;
    this.authPending = false;
    if (credentials) this.authNegotiator.mergeCredentials(credentials);
    this.doStart();
  }

  clearAuthPending(): void {
    this.authPending = false;
  }

  setAuthPendingForPrompt(): void {
    this.authPending = true;
  }

  // ─── Session result ───────────────────────────────────────────

  private applySessionResult(sessionResult: NewSessionResponse | LoadSessionResponse): void {
    if ('sessionId' in sessionResult && typeof sessionResult.sessionId === 'string') {
      this._sessionId = sessionResult.sessionId;
    }
    this.host.callbacks.onSessionId(this._sessionId!);

    this.host.configTracker.syncFromSessionResult({
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
      cwd: this.host.agentConfig.cwd,
      additionalDirectories: this.host.agentConfig.additionalDirectories,
    });

    this.host.callbacks.onConfigUpdate(this.host.configTracker.configSnapshot());
    this.host.callbacks.onModelUpdate(this.host.configTracker.modelSnapshot());
    this.host.callbacks.onModeUpdate(this.host.configTracker.modeSnapshot());

    this.host.messageTranslator.reset();
    this.host.setStatus('active');

    // Apply YOLO mode: tell the agent to enter full-auto mode so it stops
    // sending permission requests. Client-side autoApproveAll remains as fallback.
    if (this.host.agentConfig.yoloMode) {
      this.applyYoloMode();
    }
  }

  /**
   * Resolve and apply the YOLO mode for the current backend.
   * Sets desiredMode in configTracker (so reassertConfig picks it up as fallback)
   * and fires an immediate setMode call to the agent.
   */
  private applyYoloMode(): void {
    const availableModes = this.host.configTracker.modeSnapshot().availableModes;
    const yoloModeId = resolveYoloModeId(this.host.agentConfig.agentBackend, availableModes);
    if (!yoloModeId) {
      console.warn(
        `[SessionLifecycle] No YOLO mode found for backend ${this.host.agentConfig.agentBackend}, ` +
          'falling back to client-side auto-approve only'
      );
      return;
    }

    // Record as desired so reassertConfig can re-apply after reconnect
    this.host.configTracker.setDesiredMode(yoloModeId);

    if (this._client && this._sessionId) {
      this._client
        .setMode(this._sessionId, yoloModeId)
        .then(() => {
          this.host.configTracker.setCurrentMode(yoloModeId);
          this.host.callbacks.onModeUpdate(this.host.configTracker.modeSnapshot());
        })
        .catch((err) => console.warn('[SessionLifecycle] YOLO setMode failed:', err));
    }
  }

  // ─── Config reassert ─────────────────────────────────────────

  async reassertConfig(): Promise<void> {
    if (!this._client || !this._sessionId) return;
    const pending = this.host.configTracker.getPendingChanges();

    if (pending.model) {
      try {
        await this._client.setModel(this._sessionId, pending.model);
        this.host.configTracker.setCurrentModel(pending.model);
      } catch {
        /* best effort */
      }
    }
    if (pending.mode) {
      try {
        await this._client.setMode(this._sessionId, pending.mode);
        this.host.configTracker.setCurrentMode(pending.mode);
      } catch {
        /* best effort */
      }
    }
    for (const opt of pending.configOptions) {
      try {
        await this._client.setConfigOption(this._sessionId, opt.id, opt.value);
        this.host.configTracker.setCurrentConfigOption(opt.id, opt.value);
      } catch {
        /* best effort */
      }
    }
  }

  // ─── Teardown & helpers ───────────────────────────────────────

  async teardown(): Promise<void> {
    if (this._client) {
      try {
        await this._client.close();
      } catch {
        /* best effort */
      }
      this._client = null;
    }
  }

  clearClient(): void {
    this._client = null;
  }

  handleDisconnect = (info?: DisconnectInfo): void => {
    this.host.onDisconnect(info);
  };

  private async tryLoadOrCreate(mcpServers: McpServer[]): Promise<NewSessionResponse | LoadSessionResponse> {
    if (this._sessionId && this._client) {
      try {
        return await this._client.loadSession({
          sessionId: this._sessionId,
          cwd: this.host.agentConfig.cwd,
          mcpServers,
          additionalDirectories: this.host.agentConfig.additionalDirectories,
        });
      } catch {
        this.host.callbacks.onSignal({ type: 'session_expired' });
      }
    }
    return this._client!.createSession({
      cwd: this.host.agentConfig.cwd,
      mcpServers,
      additionalDirectories: this.host.agentConfig.additionalDirectories,
    });
  }

  private buildMcpServers(): McpServer[] {
    return McpConfig.merge({
      userServers: this.host.agentConfig.mcpServers,
      presetServers: this.host.agentConfig.presetMcpServers,
      teamServer: this.host.agentConfig.teamMcpConfig,
    });
  }

  private clearBunxCacheIfNeeded(): void {
    if (this._client instanceof ProcessAcpClient) {
      this._client.clearBunxCacheIfNeeded();
    }
  }
}
