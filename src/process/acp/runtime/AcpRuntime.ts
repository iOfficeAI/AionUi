// src/process/acp/runtime/AcpRuntime.ts

import type { TMessage } from '@/common/chat/chatLib';
import { getTeamGuideStdioConfig } from '@/process/team/mcp/guide/teamGuideSingleton';
import type { McpServer } from '@agentclientprotocol/sdk';
import type { ClientFactory } from '@process/acp/infra/IAcpClient';
import { IdleReclaimer } from '@process/acp/runtime/IdleReclaimer';
import { AcpSession } from '@process/acp/session/AcpSession';
import { McpConfig } from '@process/acp/session/McpConfig';
import type {
  AgentConfig,
  ConfigOption,
  RuntimeOptions,
  SessionCallbacks,
  SessionEntry,
  SessionStatus,
  SignalEvent,
} from '@process/acp/types';
// TODO(ACP Discovery): Re-enable when acp_session persistence is restored.
// import type { IAcpSessionRepository } from '@process/services/database/IAcpSessionRepository';
import { shouldInjectTeamGuideMcp } from '@process/team/prompts/teamGuideCapability';
import { ProcessConfig } from '@process/utils/initStorage';

const DEFAULT_IDLE_TIMEOUT_MS = 300_000; // 5 minutes
const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 seconds

type StreamEventHandler = (convId: string, message: TMessage) => void;
type SignalEventHandler = (convId: string, event: SignalEvent) => void;

/**
 * TODO(ACP Discovery): acp_session persistence is disabled.
 *
 * The acpSessionRepo parameter and all writes to the acp_session table are
 * commented out because:
 *   1. agent_id is incorrectly set to conversation_id (see typeBridge.ts).
 *   2. The table is not consumed by any reader yet.
 *
 * Re-enable together with ACP Discovery which will fix agent_id semantics.
 * See docs/feature/acp-rewrite/TODO.md for details.
 */
export class AcpRuntime {
  private readonly sessions = new Map<string, SessionEntry>();
  private readonly idleReclaimer: IdleReclaimer;

  onStreamEvent: StreamEventHandler = () => {};
  onSignalEvent: SignalEventHandler = () => {};

  constructor(
    // TODO(ACP Discovery): Re-enable acp_session persistence.
    // private readonly acpSessionRepo: IAcpSessionRepository,
    private readonly clientFactory: ClientFactory,
    options?: RuntimeOptions
  ) {
    this.idleReclaimer = new IdleReclaimer(
      this.sessions,
      options?.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      options?.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS
    );
    this.idleReclaimer.start();
  }

  async createConversation(convId: string, agentConfig: AgentConfig): Promise<void> {
    if (this.sessions.has(convId)) return;

    // Shallow-clone to avoid mutating the caller's object (e.g., MCP servers would
    // duplicate on retries if we pushed into the original arrays).
    const config = { ...agentConfig };

    // Inject team-guide MCP server for solo agents (not in team mode) so the
    // agent has the aion_create_team tool available.
    if (!config.teamMcpConfig) {
      if (await shouldInjectTeamGuideMcp(config.agentBackend)) {
        const aionStdioConfig = getTeamGuideStdioConfig();
        if (aionStdioConfig) {
          const guideServer: McpServer = {
            name: aionStdioConfig.name,
            command: aionStdioConfig.command,
            args: aionStdioConfig.args,
            env: [
              ...aionStdioConfig.env,
              { name: 'AION_MCP_BACKEND', value: config.agentBackend },
              { name: 'AION_MCP_CONVERSATION_ID', value: convId },
            ],
          };
          config.presetMcpServers = [...(config.presetMcpServers || []), guideServer];
        }
      }
    }

    // Load user-configured (builtin) MCP servers from settings, filtered by
    // cached agent MCP capabilities.

    const rawMcpServers = await ProcessConfig.get('mcp.config');
    if (Array.isArray(rawMcpServers) && rawMcpServers.length > 0) {
      const cachedInit = await ProcessConfig.get('acp.cachedInitializeResult');
      const caps = cachedInit?.[config.agentBackend]?.capabilities?.mcpCapabilities;
      const userServers = McpConfig.fromStorageConfig(rawMcpServers, caps);
      if (userServers.length > 0) {
        config.mcpServers = [...(config.mcpServers || []), ...userServers];
      }
    }

    const callbacks = this.buildCallbacks(convId);
    const session = new AcpSession(config, this.clientFactory, callbacks);

    this.sessions.set(convId, { session, lastActiveAt: Date.now() });

    // TODO(ACP Discovery): Re-enable after fixing agent_id.
    // this.acpSessionRepo.upsertSession({
    //   conversation_id: convId,
    //   agent_backend: agentConfig.agentBackend,
    //   agent_source: agentConfig.agentSource,
    //   agent_id: agentConfig.agentId,
    //   session_id: null,
    //   session_status: 'idle',
    //   session_config: JSON.stringify(agentConfig),
    //   last_active_at: Date.now(),
    //   suspended_at: null,
    // });

    session.start();
  }

  async closeConversation(convId: string): Promise<void> {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    const session = entry.session as AcpSession;
    await session.stop();
    this.sessions.delete(convId);
    // TODO(ACP Discovery): Re-enable after fixing agent_id.
    // this.acpSessionRepo.deleteSession(convId);
  }

  async sendMessage(convId: string, text: string, files?: string[]): Promise<void> {
    const entry = this.sessions.get(convId);
    if (!entry) return;
    const session = entry.session as AcpSession;
    entry.lastActiveAt = Date.now();
    // TODO(ACP Discovery): Re-enable after fixing agent_id.
    // this.acpSessionRepo.touchLastActive(convId);
    await session.sendMessage(text, files);
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
      onSessionId: (_sessionId) => {
        // TODO(ACP Discovery): Re-enable after fixing agent_id.
        // this.acpSessionRepo.updateSessionId(convId, sessionId);
      },
      onStatusChange: (status) => {
        // TODO(ACP Discovery): Re-enable after fixing agent_id.
        // this.persistStatus(convId, status);
        this.onSignalEvent(convId, { type: 'status_change', status });
      },
      onConfigUpdate: (config) => {
        // TODO(ACP Discovery): Re-enable after fixing agent_id.
        // this.acpSessionRepo.updateSessionConfig(convId, JSON.stringify(config));
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
      onPermissionRequest: (data) => {
        this.onSignalEvent(convId, { type: 'permission_request', data });
      },
      onSignal: (signal) => {
        switch (signal.type) {
          case 'auth_required':
            this.onSignalEvent(convId, { type: 'auth_required', auth: signal.auth });
            break;

          case 'error':
            this.onSignalEvent(convId, {
              type: 'error',
              message: signal.message,
              recoverable: signal.recoverable,
            });
            break;

          case 'session_expired':
            this.onSignalEvent(convId, {
              type: 'error',
              message: 'Session expired',
              recoverable: true,
            });
            break;
        }
      },
    };
  }

  // TODO(ACP Discovery): Re-enable when acp_session persistence is restored.
  // private persistStatus(convId: string, status: SessionStatus): void {
  //   const stableStatus = this.toStableStatus(status);
  //   const suspendedAt = status === 'suspended' ? Date.now() : null;
  //   this.acpSessionRepo.updateStatus(convId, stableStatus, suspendedAt);
  // }

  // private toStableStatus(status: SessionStatus): 'idle' | 'active' | 'suspended' | 'error' {
  //   switch (status) {
  //     case 'idle':
  //       return 'idle';
  //     case 'starting':
  //     case 'active':
  //     case 'prompting':
  //     case 'resuming':
  //       return 'active';
  //     case 'suspended':
  //       return 'suspended';
  //     case 'error':
  //       return 'error';
  //   }
  // }
}
