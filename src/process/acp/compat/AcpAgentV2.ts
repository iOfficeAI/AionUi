// src/process/acp/compat/AcpAgentV2.ts

import { AcpSession, type SessionOptions } from '@process/acp/session/AcpSession';
import { DefaultConnectorFactory } from '@process/acp/runtime/ConnectorFactory';
import type {
  AgentConfig,
  SessionCallbacks,
  SessionStatus,
  ModelSnapshot,
  ModeSnapshot,
  ConfigSnapshot,
  ContextUsage,
  QueueSnapshot,
} from '@process/acp/types';
import type { TMessage } from '@/common/chat/chatLib';
import type { AcpModelInfo, AcpSessionConfigOption, AcpResult } from '@/common/types/acpTypes';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import {
  toAgentConfig,
  toResponseMessage,
  toAcpModelInfo,
  toAcpConfigOptions,
  type OldAcpAgentConfig,
} from '@process/acp/compat/typeBridge';

type PendingOp<T> = {
  resolve: (value: T) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * AcpAgentV2 — Compatibility adapter that presents the OLD AcpAgent interface
 * while internally delegating to the NEW AcpSession.
 *
 * This adapter:
 * - Converts OldAcpAgentConfig → AgentConfig + SessionCallbacks
 * - Routes new SessionCallbacks → old event format (onStreamEvent, onSignalEvent)
 * - Caches model/config state from callbacks for sync getters
 * - Bridges async old API ↔ void new API via pending promises
 */
export class AcpAgentV2 {
  private session: AcpSession;
  private conversationId: string;
  private onStreamEvent: (data: IResponseMessage) => void;
  private onSignalEvent?: (data: IResponseMessage) => void;
  private onSessionIdUpdate?: (sessionId: string) => void;
  private onAvailableCommandsUpdate?: (commands: Array<{ name: string; description?: string; hint?: string }>) => void;

  // Cached state from callbacks
  private cachedModelInfo: AcpModelInfo | null = null;
  private cachedConfigOptions: AcpSessionConfigOption[] = [];
  private lastSessionId: string | null = null;
  private lastStatus: SessionStatus = 'idle';

  // Promise bridges for async methods (Tasks 4-6)
  private startOp: PendingOp<void> | null = null;
  private modelOp: PendingOp<AcpModelInfo | null> | null = null;
  private modeOp: PendingOp<{ success: boolean; error?: string }> | null = null;
  private configOp: PendingOp<AcpSessionConfigOption[]> | null = null;

  constructor(config: OldAcpAgentConfig) {
    this.conversationId = config.id;
    this.onStreamEvent = config.onStreamEvent as (data: IResponseMessage) => void;
    this.onSignalEvent = config.onSignalEvent as ((data: IResponseMessage) => void) | undefined;
    this.onSessionIdUpdate = config.onSessionIdUpdate;
    this.onAvailableCommandsUpdate = config.onAvailableCommandsUpdate;

    const agentConfig: AgentConfig = toAgentConfig(config);
    const callbacks: SessionCallbacks = this.buildCallbacks();
    const connectorFactory = new DefaultConnectorFactory();

    const sessionOptions: SessionOptions = {
      promptTimeoutMs: 300_000,
      maxStartRetries: 3,
      maxResumeRetries: 2,
    };

    this.session = new AcpSession(agentConfig, connectorFactory, callbacks, sessionOptions);
  }

  /**
   * Build SessionCallbacks that route new events → old event format
   */
  private buildCallbacks(): SessionCallbacks {
    return {
      onMessage: (message: TMessage) => {
        const oldMsg = toResponseMessage(message, this.conversationId);
        // Skip empty messages (e.g., filtered available_commands)
        if (oldMsg.type) {
          this.onStreamEvent(oldMsg);
        }
      },

      onSessionId: (sessionId: string) => {
        this.lastSessionId = sessionId;
        if (this.onSessionIdUpdate) {
          this.onSessionIdUpdate(sessionId);
        }
      },

      onStatusChange: (status: SessionStatus) => {
        this.lastStatus = status;

        // Resolve startOp when reaching active/error
        if (status === 'active' && this.startOp) {
          this.resolveOp(this.startOp, undefined);
          this.startOp = null;
        } else if (status === 'error' && this.startOp) {
          this.rejectOp(this.startOp, new Error('Session failed to start'));
          this.startOp = null;
        }

        // Emit old-style agent_status event
        const oldStatusName = this.mapStatusToOldName(status);
        this.onStreamEvent({
          type: 'agent_status',
          conversation_id: this.conversationId,
          msg_id: `status_${Date.now()}`,
          data: { status: oldStatusName },
        });
      },

      onModelUpdate: (model: ModelSnapshot) => {
        this.cachedModelInfo = toAcpModelInfo(model);

        // Resolve modelOp if pending
        if (this.modelOp) {
          this.resolveOp(this.modelOp, this.cachedModelInfo);
          this.modelOp = null;
        }

        // Emit to old stream event
        this.onStreamEvent({
          type: 'acp_model_info',
          conversation_id: this.conversationId,
          msg_id: `model_${Date.now()}`,
          data: this.cachedModelInfo,
        });
      },

      onModeUpdate: (_mode: ModeSnapshot) => {
        // Resolve modeOp if pending
        if (this.modeOp) {
          this.resolveOp(this.modeOp, { success: true });
          this.modeOp = null;
        }
      },

      onConfigUpdate: (config: ConfigSnapshot) => {
        this.cachedConfigOptions = toAcpConfigOptions(config.configOptions);

        // Resolve configOp if pending
        if (this.configOp) {
          this.resolveOp(this.configOp, this.cachedConfigOptions);
          this.configOp = null;
        }

        // Forward availableCommands to old callback
        if (this.onAvailableCommandsUpdate && config.availableCommands.length > 0) {
          const commands = config.availableCommands.map((name) => ({
            name,
            description: name,
          }));
          this.onAvailableCommandsUpdate(commands);
        }
      },

      onContextUsage: (usage: ContextUsage) => {
        this.onStreamEvent({
          type: 'acp_context_usage',
          conversation_id: this.conversationId,
          msg_id: `usage_${Date.now()}`,
          data: { used: usage.used, size: usage.total },
        });
      },

      onPermissionRequest: (data) => {
        if (this.onSignalEvent) {
          this.onSignalEvent({
            type: 'acp_permission',
            conversation_id: this.conversationId,
            msg_id: data.callId,
            data: {
              toolCall: {
                toolCallId: data.callId,
                title: data.title,
                kind: data.kind,
                rawInput: data.rawInput,
              },
              options: data.options.map((opt) => ({
                optionId: opt.optionId,
                name: opt.label,
              })),
            },
          });
        }
      },

      onSignal: (event) => {
        if (!this.onSignalEvent) return;

        switch (event.type) {
          case 'session_expired':
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: 'Session expired',
            });
            break;

          case 'queue_paused':
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: 'Queue paused due to crash recovery',
            });
            break;

          case 'auth_required':
            // Forward auth_required signal (not implemented in old AcpAgent, but should not crash)
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: 'Authentication required',
            });
            break;

          case 'error':
            this.onSignalEvent({
              type: 'error',
              conversation_id: this.conversationId,
              msg_id: `signal_${Date.now()}`,
              data: event.message,
            });
            break;
        }
      },

      onQueueUpdate: (_queue: QueueSnapshot) => {
        // No old equivalent — ignore
      },
    };
  }

  /**
   * Map new 7-state FSM to old status names
   */
  private mapStatusToOldName(status: SessionStatus): string {
    switch (status) {
      case 'idle':
        return 'disconnected';
      case 'starting':
        return 'connecting';
      case 'active':
        return 'session_active';
      case 'prompting':
        return 'session_active';
      case 'suspended':
        return 'disconnected';
      case 'resuming':
        return 'connecting';
      case 'error':
        return 'error';
      default:
        return 'disconnected';
    }
  }

  // ─── Public Getters ─────────────────────────────────────────────

  get isConnected(): boolean {
    return this.lastStatus !== 'idle' && this.lastStatus !== 'error';
  }

  get hasActiveSession(): boolean {
    return this.lastStatus === 'active' || this.lastStatus === 'prompting';
  }

  get currentSessionId(): string | null {
    return this.lastSessionId;
  }

  // ─── Lifecycle Methods (Task 4) ────────────────────────────────

  async start(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.startOp = null;
        reject(new Error('Session start timed out'));
      }, 120_000); // 2-minute timeout
      this.startOp = { resolve, reject, timer };
      this.session.start();
    });
  }

  async kill(): Promise<void> {
    await this.session.stop();
  }

  cancelPrompt(): void {
    this.session.cancelPrompt();
  }

  // ─── Messaging + Permission Methods (Task 5 — stubs) ───────────

  async sendMessage(_data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    throw new Error('Not implemented — see Task 5');
  }

  async confirmMessage(_data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    throw new Error('Not implemented — see Task 5');
  }

  // ─── Config/Model/Mode Methods (Task 6 — partial) ──────────────

  getModelInfo(): AcpModelInfo | null {
    return this.cachedModelInfo;
  }

  getConfigOptions(): AcpSessionConfigOption[] {
    return this.cachedConfigOptions;
  }

  async setModelByConfigOption(_modelId: string): Promise<AcpModelInfo | null> {
    throw new Error('Not implemented — see Task 6');
  }

  async setMode(_mode: string): Promise<{ success: boolean; error?: string }> {
    throw new Error('Not implemented — see Task 6');
  }

  async setConfigOption(_configId: string, _value: string): Promise<AcpSessionConfigOption[]> {
    throw new Error('Not implemented — see Task 6');
  }

  async enableYoloMode(): Promise<void> {
    throw new Error('Not implemented — see Task 6');
  }

  // ─── Helper Methods ─────────────────────────────────────────────

  private resolveOp<T>(op: PendingOp<T>, value: T): void {
    clearTimeout(op.timer);
    op.resolve(value);
  }

  private rejectOp<T>(op: PendingOp<T>, err: Error): void {
    clearTimeout(op.timer);
    op.reject(err);
  }
}
