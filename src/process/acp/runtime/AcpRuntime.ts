// src/process/acp/runtime/AcpRuntime.ts

import type { TMessage } from '@/common/chat/chatLib';
import { IdleReclaimer } from '@process/acp/runtime/IdleReclaimer';
import { AcpSession } from '@process/acp/session/AcpSession';
import type {
  AgentConfig,
  ConfigOption,
  RuntimeOptions,
  SessionCallbacks,
  SessionEntry,
  SessionStatus,
  SignalEvent,
} from '@process/acp/types';
import type { ConnectorFactory } from '@process/acp/infra/AgentConnector';
import type { IAcpSessionRepository } from '@process/services/database/IAcpSessionRepository';

const DEFAULT_IDLE_TIMEOUT_MS = 300_000; // 5 minutes
const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds

type StreamEventHandler = (convId: string, message: TMessage) => void;
type SignalEventHandler = (convId: string, event: SignalEvent) => void;

export class AcpRuntime {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly idleReclaimer: IdleReclaimer;

  onStreamEvent: StreamEventHandler = () => {};
  onSignalEvent: SignalEventHandler = () => {};

  constructor(
    private readonly acpSessionRepo: IAcpSessionRepository,
    private readonly connectorFactory: ConnectorFactory,
    options?: RuntimeOptions
  ) {
    this.idleReclaimer = new IdleReclaimer(
      this.sessions,
      options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    );
    this.idleReclaimer.start();
  }

  createConversation(convId: string, agentConfig: AgentConfig): void {
    if (this.sessions.has(convId)) return;

    const callbacks = this.buildCallbacks(convId);
    const session = new AcpSession(agentConfig, this.connectorFactory, callbacks);

    this.sessions.set(convId, { session, lastActiveAt: Date.now() });

    this.acpSessionRepo.upsertSession({
      conversation_id: convId,
      agent_backend: agentConfig.agentBackend,
      agent_source: agentConfig.agentSource,
      agent_id: agentConfig.agentId,
      session_id: null,
      session_status: 'idle',
      session_config: JSON.stringify(agentConfig),
      last_active_at: Date.now(),
      suspended_at: null,
    });

    session.start();
  }

  async closeConversation(convId: string): Promise<void> {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    const session = entry.session as AcpSession;
    await session.stop();
    this.sessions.delete(convId);
    this.acpSessionRepo.deleteSession(convId);
  }

  sendMessage(convId: string, text: string, files?: string[]): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    const session = entry.session as AcpSession;
    entry.lastActiveAt = Date.now();
    this.acpSessionRepo.touchLastActive(convId);
    session.sendMessage(text, files);
  }

  confirmPermission(convId: string, callId: string, optionId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).confirmPermission(callId, optionId);
  }

  cancelPrompt(convId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).cancelPrompt();
  }

  cancelAll(convId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).cancelAll();
  }

  resumeQueue(convId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).resumeQueue();
  }

  setModel(convId: string, modelId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).setModel(modelId);
  }

  setMode(convId: string, modeId: string): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).setMode(modeId);
  }

  setConfigOption(convId: string, id: string, value: string | boolean): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).setConfigOption(id, value);
  }

  getConfigOptions(convId: string): ConfigOption[] | null {
    const entry = this.sessions.get(convId);
    if (!entry) return null;
    return (entry.session as AcpSession).getConfigOptions();
  }

  retryAuth(convId: string, credentials?: Record<string, string>): void {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    (entry.session as AcpSession).retryAuth(credentials);
  }

  getSessionStatus(convId: string): SessionStatus | null {
    const entry = this.sessions.get(convId);
    if (!entry) return null;
    return (entry.session as AcpSession).status;
  }

  async shutdown(): Promise<void> {
    this.idleReclaimer.stop();
    const promises: Promise<void>[] = [];
    for (const [_, entry] of this.sessions) {
      const session = entry.session as AcpSession;
      if (session.status === 'active' || session.status === 'prompting') {
        promises.push(session.suspend());
      }
    }
    await Promise.allSettled(promises);
    this.sessions.clear();
  }

  private buildCallbacks(convId: string): SessionCallbacks {
    return {
      onMessage: (message) => {
        this.onStreamEvent(convId, message);
      },
      onSessionId: (sessionId) => {
        this.acpSessionRepo.updateSessionId(convId, sessionId);
      },
      onStatusChange: (status) => {
        this.persistStatus(convId, status);
        this.onSignalEvent(convId, { type: 'status_change', status });
      },
      onConfigUpdate: (config) => {
        this.acpSessionRepo.updateSessionConfig(convId, JSON.stringify(config));
        this.onSignalEvent(convId, { type: 'config_update', config });
      },
      onModelUpdate: (model) => {
        this.onSignalEvent(convId, { type: 'model_update', model });
      },
      onModeUpdate: (mode) => {
        this.onSignalEvent(convId, { type: 'mode_update', mode });
      },
      onContextUsage: (usage) => {
        this.onSignalEvent(convId, { type: 'context_usage', usage });
      },
      onQueueUpdate: (queue) => {
        this.onSignalEvent(convId, { type: 'queue_update', queue });
      },
      onPermissionRequest: (data) => {
        this.onSignalEvent(convId, { type: 'permission_request', data });
      },
      onSignal: (signal) => {
        if (signal.type === 'auth_required') {
          this.onSignalEvent(convId, { type: 'auth_required', auth: signal.auth });
        } else if (signal.type === 'queue_paused') {
          this.onSignalEvent(convId, { type: 'queue_paused', reason: signal.reason });
        } else if (signal.type === 'error') {
          this.onSignalEvent(convId, {
            type: 'error',
            message: signal.message,
            recoverable: signal.recoverable,
          });
        } else if (signal.type === 'session_expired') {
          this.onSignalEvent(convId, {
            type: 'error',
            message: 'Session expired',
            recoverable: true,
          });
        }
      },
    };
  }

  private persistStatus(convId: string, status: SessionStatus): void {
    const stableStatus = this.toStableStatus(status);
    const suspendedAt = status === 'suspended' ? Date.now() : null;
    this.acpSessionRepo.updateStatus(convId, stableStatus, suspendedAt);
  }

  private toStableStatus(status: SessionStatus): 'idle' | 'active' | 'suspended' | 'error' {
    switch (status) {
      case 'idle':
        return 'idle';
      case 'starting':
      case 'active':
      case 'prompting':
      case 'resuming':
        return 'active';
      case 'suspended':
        return 'suspended';
      case 'error':
        return 'error';
    }
  }
}
