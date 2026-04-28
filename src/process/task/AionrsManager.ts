/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import type { IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import { transformMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { channelEventBus } from '@process/channels/agent/ChannelEventBus';
import { teamEventBus } from '@process/team/teamEventBus';
import type { TProviderWithModel } from '@/common/config/storage';
import { BaseApprovalStore, type IApprovalKey } from '@/common/chat/approval';
import { ToolConfirmationOutcome } from '../agent/gemini/cli/tools/tools';
import { AionrsAgent, type StdioMcpOption } from '@process/agent/aionrs';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage, flushConversationMessages } from '@process/utils/message';
import { uuid } from '@/common/utils';
import {
  normalizePresetAssistantExtra,
  type PresetContextProvenance,
  type RuntimeContractsConfig,
} from '@/common/utils/presetAssistantExtra';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { hasCronCommands } from './CronCommandDetector';
import { processCronInMessage } from './MessageMiddleware';
import { extractAndStripThinkTags } from './ThinkTagDetector';
import { ConversationTurnCompletionService } from './ConversationTurnCompletionService';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';
import {
  createRuntimeResponseContractState,
  buildRuntimeResponseContractInitialPrompt,
  buildRuntimeResponseContractRepairPrompt,
  denyForbiddenPreArtifactTools,
  finalizeRuntimeResponseContract,
  isRuntimeResponseContractActive,
  recordRuntimeContractRawContent,
  recordRuntimeContractReasoning,
  resetRuntimeResponseContractForRepair,
  type RuntimeContractFinalizeResult,
  type RuntimeContractState,
} from './RuntimeResponseContract';

// Aionrs-specific approval key — reuses same pattern as GeminiApprovalStore
type AionrsApprovalKey = IApprovalKey & {
  action: 'exec' | 'edit' | 'info' | 'mcp';
  identifier?: string;
};

function isValidCommandName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(name);
}

export class AionrsApprovalStore extends BaseApprovalStore<AionrsApprovalKey> {
  static createKeysFromConfirmation(action: string, commandType?: string): AionrsApprovalKey[] {
    if (action === 'exec' && commandType) {
      return commandType
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean)
        .filter(isValidCommandName)
        .map((cmd) => ({ action: 'exec' as const, identifier: cmd }));
    }
    if (action === 'edit' || action === 'info' || action === 'mcp') {
      return [{ action: action as AionrsApprovalKey['action'] }];
    }
    return [];
  }
}

type AionrsManagerData = {
  workspace: string;
  proxy?: string;
  model: TProviderWithModel;
  conversation_id: string;
  yoloMode?: boolean;
  presetRules?: string;
  presetContext?: string;
  presetAssistantId?: string;
  presetRulesHash?: string;
  skillPackHash?: string;
  enabledSkills?: string[];
  excludeBuiltinSkills?: string[];
  runtimeContracts?: RuntimeContractsConfig;
  contextProvenance?: PresetContextProvenance;
  maxTokens?: number;
  maxTurns?: number;
  sessionMode?: string;
  sessionId?: string;
  resume?: string;
  teamMcpStdioConfig?: {
    name: string;
    command: string;
    args: string[];
    env: Array<{ name: string; value: string }>;
  };
};

export class AionrsManager extends BaseAgentManager<AionrsManagerData, string> {
  workspace: string;
  model: TProviderWithModel;
  readonly approvalStore = new AionrsApprovalStore();
  private agent: AionrsAgent | null = null;
  private agentReady: Promise<void>;
  private currentMode: string = 'default';
  private _capabilities: AionrsCapabilities | null = null;
  private _configSentAt: number | null = null;
  private _messageSentAt: number | null = null;
  private currentMsgId: string | null = null;
  private currentMsgContent: string = '';
  private isFreshSession = true;
  private activeResponseContract: RuntimeContractState | null = null;
  private agentStartError: unknown = null;

  // Heartbeat state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly heartbeatIntervalMs = 30_000;
  private readonly heartbeatMaxMissed = 3;
  private heartbeatMissedCount = 0;
  private heartbeatActive = false;

  // Thinking state
  private thinkingMsgId: string | null = null;
  private thinkingStartTime: number | null = null;
  private thinkingContent: string = '';
  private thinkingDbFlushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly streamDbFlushIntervalMs: number = 120;

  // Stream text DB write buffer
  private readonly bufferedStreamTexts = new Map<
    string,
    { message: Extract<TMessage, { type: 'text' }>; timer: ReturnType<typeof setTimeout> }
  >();

  constructor(data: AionrsManagerData, model: TProviderWithModel) {
    const normalizedData = normalizePresetAssistantExtra(data, {
      type: 'aionrs',
      isPreset: Boolean(data.presetAssistantId),
      failClosed: true,
      model,
    });
    super('aionrs', { ...normalizedData, model }, new IpcAgentEventEmitter(), false);
    this.workspace = normalizedData.workspace;
    this.conversation_id = normalizedData.conversation_id;
    this.model = model;
    this.currentMode = normalizedData.sessionMode || 'default';

    // enableFork=false skips auto-init in ForkTask, so init manually
    this.init();

    // Start the agent bootstrap; keep failures visible so sendMessage can fail closed.
    this.agentReady = this.start().catch((error) => {
      mainError('[AionrsManager]', 'Failed to start aionrs agent', error);
      this.agentStartError = error;
    });
  }

  /**
   * Determine new vs resume session, then create the AionrsAgent in-process.
   * If the conversation already has messages in the DB, pass --resume;
   * otherwise pass --session-id for a new session.
   */
  override async start() {
    let sessionArgs: { resume?: string; sessionId?: string };
    try {
      const db = await getDatabase();
      const result = db.getConversationMessages(this.conversation_id, 0, 1);
      const hasMessages = (result.data?.length ?? 0) > 0;
      this.isFreshSession = !hasMessages;
      sessionArgs = hasMessages ? { resume: this.conversation_id } : { sessionId: this.conversation_id };
    } catch {
      // Fallback: start as new session if DB check fails
      this.isFreshSession = true;
      sessionArgs = { sessionId: this.conversation_id };
    }

    const mergedData = { ...this.data.data, ...sessionArgs };

    // Collect stdio MCP servers to inject. In-team sessions get the team_*
    // coordination MCP (with slot handshake). Solo sessions get the team-guide
    // MCP so aion_create_team / aion_list_models are available. Mirrors
    // GeminiAgentManager's solo branch.
    const stdioMcpServers: StdioMcpOption[] = [];
    if (mergedData.teamMcpStdioConfig) {
      stdioMcpServers.push({ ...mergedData.teamMcpStdioConfig, awaitReady: true });
    } else {
      const teamGuide = await this.buildTeamGuideMcpStdioConfig();
      if (teamGuide) stdioMcpServers.push(teamGuide);
    }

    const agent = new AionrsAgent({
      workspace: mergedData.workspace,
      model: mergedData.model,
      proxy: mergedData.proxy,
      yoloMode: mergedData.yoloMode,
      presetRules: mergedData.presetRules,
      contextProvenance: mergedData.contextProvenance,
      maxTokens: mergedData.maxTokens,
      maxTurns: mergedData.maxTurns,
      sessionId: mergedData.sessionId,
      resume: mergedData.resume,
      stdioMcpServers,
      onStreamEvent: (event) => this.emit('aionrs.message', event),
      onProcessExit: (code, activeMsgId) => this.handleProcessExit(code, activeMsgId),
      onPong: () => this.handlePong(),
    });

    await agent.start();
    this.agent = agent;
    this._capabilities = agent.capabilities ?? null;
    this.startHeartbeat();

    if (this.data.data.teamMcpStdioConfig) {
      const { notifyMcpReady } = await import('@process/team/mcpReadiness');
      const slotId = this.data.data.teamMcpStdioConfig.env?.find((e) => e.name === 'TEAM_AGENT_SLOT_ID')?.value;
      if (slotId) {
        notifyMcpReady(slotId);
      }
    }
  }

  /**
   * Build the team-guide MCP stdio config for a solo aionrs session, or return
   * undefined when the agent is in a team (team_* MCP takes precedence) or when
   * the team-guide service hasn't started.
   */
  private async buildTeamGuideMcpStdioConfig(): Promise<
    { name: string; command: string; args: string[]; env: Array<{ name: string; value: string }> } | undefined
  > {
    if (this.data.data.teamMcpStdioConfig) return undefined;
    const [{ shouldInjectTeamGuideMcp }, { getTeamGuideStdioConfig }] = await Promise.all([
      import('@process/team/prompts/teamGuideCapability'),
      import('@process/team/mcp/guide/teamGuideSingleton'),
    ]);
    if (!(await shouldInjectTeamGuideMcp('aionrs'))) return undefined;
    const base = getTeamGuideStdioConfig();
    if (!base) return undefined;
    return {
      name: base.name,
      command: base.command,
      args: base.args,
      env: [
        ...base.env,
        { name: 'AION_MCP_BACKEND', value: 'aionrs' },
        { name: 'AION_MCP_CONVERSATION_ID', value: this.conversation_id },
      ],
    };
  }

  async stop() {
    this.stopHeartbeat();
    this.flushAllBufferedStreamTexts();
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.confirmations = [];
    if (this.agent) {
      this.agent.stop();
    }
  }

  async sendMessage(data: { content?: string; input?: string; msg_id: string; files?: string[] }) {
    const content = data.content ?? data.input ?? '';
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: { content },
    };
    addMessage(this.conversation_id, message);
    try {
      (await getDatabase()).updateConversation(this.conversation_id, {});
    } catch {
      // Conversation might not exist in DB yet
    }
    cronBusyGuard.setProcessing(this.conversation_id, true);
    this.status = 'pending';
    this._lastActivityAt = Date.now();
    this.activeResponseContract = createRuntimeResponseContractState({
      assistantId: this.data.data.presetAssistantId,
      prompt: content,
      isFirstTurn: this.isFreshSession,
      runtimeContracts: this.data.data.runtimeContracts,
    });
    // Wait for agent bootstrap to complete before sending
    await this.agentReady;
    if (this.agentStartError) {
      await this.handleStartupFailure(data.msg_id, this.agentStartError);
      return;
    }
    this._messageSentAt = Date.now();
    mainLog('[AionrsManager]', `message sent: msg_id=${data.msg_id}`);
    if (!this.agent) {
      await this.handleStartupFailure(data.msg_id, new Error('aionrs agent did not initialize'));
      return;
    }
    const outboundContent = isRuntimeResponseContractActive(this.activeResponseContract)
      ? buildRuntimeResponseContractInitialPrompt(this.activeResponseContract, content)
      : content;
    await this.agent.send(outboundContent, data.msg_id, data.files);
    this.isFreshSession = false;
  }

  private async handleStartupFailure(msgId: string, error: unknown): Promise<void> {
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.status = 'finished';
    const detail = error instanceof Error ? error.message : String(error);
    const response: IResponseMessage = {
      type: 'error',
      msg_id: msgId,
      conversation_id: this.conversation_id,
      data: `AionRS runtime startup failed before the first assistant response: ${detail}`,
    };
    const tMessage = transformMessage(response);
    if (tMessage) {
      addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
      await flushConversationMessages(this.conversation_id);
    }
    ipcBridge.conversation.responseStream.emit(response);
    this.activeResponseContract = null;
  }

  /**
   * Check if a confirmation should be auto-approved based on current mode.
   */
  private tryAutoApprove(content: IMessageToolGroup['content'][number]): boolean {
    const type = content.confirmationDetails?.type;

    if (this.currentMode === 'yolo') {
      this.agent?.approveTool(content.callId, 'once');
      return true;
    }
    if (this.currentMode === 'auto_edit') {
      if (type === 'edit' || type === 'info') {
        this.agent?.approveTool(content.callId, 'once');
        return true;
      }
    }
    return false;
  }

  private handleConformationMessage(message: IMessageToolGroup) {
    const confirmingTools = message.content.filter((c) => c.status === 'Confirming');

    for (const content of confirmingTools) {
      // Check mode-based auto-approval
      if (this.tryAutoApprove(content)) continue;

      // Check approval store ("always allow" memory)
      const action = content.confirmationDetails?.type ?? 'info';
      const commandType =
        action === 'exec' ? (content.confirmationDetails as { rootCommand?: string })?.rootCommand : undefined;
      const keys = AionrsApprovalStore.createKeysFromConfirmation(action, commandType);
      if (keys.length > 0 && this.approvalStore.allApproved(keys)) {
        this.agent?.approveTool(content.callId, 'once');
        continue;
      }

      // Show confirmation dialog to user
      const options = [
        { label: 'messages.confirmation.yesAllowOnce', value: ToolConfirmationOutcome.ProceedOnce },
        { label: 'messages.confirmation.yesAllowAlways', value: ToolConfirmationOutcome.ProceedAlways },
        { label: 'messages.confirmation.no', value: ToolConfirmationOutcome.Cancel },
      ];

      this.addConfirmation({
        title: content.confirmationDetails?.title || content.name || '',
        id: content.callId,
        action,
        description: content.description || '',
        callId: content.callId,
        options,
        commandType,
      });
    }
  }

  /**
   * Emit to teamEventBus (terminal events only) and channelEventBus (all events).
   * Mirrors the multi-bus emission pattern in AcpAgentManager.
   */
  private emitToEventBuses(message: IResponseMessage): void {
    if (message.type === 'finish' || message.type === 'error') {
      teamEventBus.emit('responseStream', {
        ...message,
        conversation_id: this.conversation_id,
      });
    }
    channelEventBus.emitAgentMessage(this.conversation_id, {
      ...message,
      conversation_id: this.conversation_id,
    });
  }

  private emitThinkingMessage(content: string, status: 'thinking' | 'done' = 'thinking'): void {
    if (!this.thinkingMsgId) {
      this.thinkingMsgId = uuid();
      this.thinkingStartTime = Date.now();
      this.thinkingContent = '';
    }

    if (status === 'thinking') {
      this.thinkingContent += content;
    }

    const duration = status === 'done' && this.thinkingStartTime ? Date.now() - this.thinkingStartTime : undefined;

    ipcBridge.conversation.responseStream.emit({
      type: 'thinking',
      conversation_id: this.conversation_id,
      msg_id: this.thinkingMsgId,
      data: {
        content,
        duration,
        status,
      },
    });

    if (status === 'done') {
      this.flushThinkingToDb(duration, 'done');
    } else if (!this.thinkingDbFlushTimer) {
      this.thinkingDbFlushTimer = setTimeout(() => {
        this.flushThinkingToDb(undefined, 'thinking');
      }, this.streamDbFlushIntervalMs);
    }
  }

  private flushThinkingToDb(duration: number | undefined, status: 'thinking' | 'done'): void {
    if (this.thinkingDbFlushTimer) {
      clearTimeout(this.thinkingDbFlushTimer);
      this.thinkingDbFlushTimer = null;
    }
    if (!this.thinkingMsgId) return;
    const tMessage: TMessage = {
      id: this.thinkingMsgId,
      msg_id: this.thinkingMsgId,
      type: 'thinking',
      position: 'left',
      conversation_id: this.conversation_id,
      content: {
        content: this.thinkingContent,
        duration,
        status,
      },
      createdAt: this.thinkingStartTime || Date.now(),
    };
    addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
  }

  private clearThinkingState(): void {
    this.thinkingMsgId = null;
    this.thinkingStartTime = null;
    this.thinkingContent = '';
  }

  private queueBufferedStreamText(message: Extract<TMessage, { type: 'text' }>): void {
    const key = `${message.conversation_id}:${message.msg_id || message.id}`;
    const existing = this.bufferedStreamTexts.get(key);
    if (existing) {
      this.bufferedStreamTexts.set(key, {
        ...existing,
        message: {
          ...existing.message,
          content: {
            ...existing.message.content,
            content: existing.message.content.content + message.content.content,
          },
        },
      });
      return;
    }

    const timer = setTimeout(() => {
      this.flushBufferedStreamText(key);
    }, this.streamDbFlushIntervalMs);

    this.bufferedStreamTexts.set(key, {
      message: { ...message, content: { ...message.content } },
      timer,
    });
  }

  private flushBufferedStreamText(key: string): void {
    const buffered = this.bufferedStreamTexts.get(key);
    if (!buffered) return;
    clearTimeout(buffered.timer);
    this.bufferedStreamTexts.delete(key);
    addOrUpdateMessage(this.conversation_id, buffered.message, 'aionrs');
  }

  private flushAllBufferedStreamTexts(): void {
    if (this.bufferedStreamTexts.size === 0) return;
    const keys = Array.from(this.bufferedStreamTexts.keys());
    for (const key of keys) {
      this.flushBufferedStreamText(key);
    }
  }

  private notifyTurnCompletion(): void {
    void ConversationTurnCompletionService.getInstance().notifyPotentialCompletion(this.conversation_id, {
      status: this.status ?? 'finished',
      workspace: this.workspace,
      backend: 'aionrs',
      pendingConfirmations: this.getConfirmations().length,
      modelId: this.model.useModel,
    });
  }

  private saveContextUsage(data: unknown): void {
    if (!data || typeof data !== 'object' || !('input_tokens' in data)) return;
    const usage = data as { input_tokens: number; output_tokens: number };
    const totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
    if (totalTokens <= 0) return;

    void (async () => {
      try {
        const db = await getDatabase();
        const result = db.getConversation(this.conversation_id);
        if (result.success && result.data && result.data.type === 'aionrs') {
          const conversation = result.data;
          db.updateConversation(this.conversation_id, {
            extra: { ...conversation.extra, lastTokenUsage: { totalTokens } },
          } as Partial<typeof conversation>);
        }
      } catch {
        // Non-critical metadata, silently ignore errors
      }
    })();
  }

  private async saveRuntimeContractState(result: RuntimeContractFinalizeResult): Promise<void> {
    const state = this.activeResponseContract;
    if (!state) return;
    try {
      const db = await getDatabase();
      const existing = db.getConversation(this.conversation_id);
      if (existing.success && existing.data && existing.data.type === 'aionrs') {
        db.updateConversation(this.conversation_id, {
          extra: {
            ...existing.data.extra,
            runtimeContractState: {
              schemaVersion: state.schemaVersion,
              active: state.active,
              status: result.status,
              errors: result.errors,
              finalizedAt: Date.now(),
            },
          },
        } as Partial<typeof existing.data>);
      }
    } catch (error) {
      mainWarn('[AionrsManager]', 'Failed to save runtime contract state', error);
    }
  }

  private scheduleContractRepair(state: RuntimeContractState, errors: string[], msgId: string): void {
    mainWarn('[AionrsManager]', 'Runtime response contract blocked first attempt; requesting one no-tool repair', {
      conversationId: this.conversation_id,
      msgId,
      errors,
    });
    resetRuntimeResponseContractForRepair(state);
    this.currentMsgId = msgId;
    this.currentMsgContent = '';
    this._messageSentAt = Date.now();

    setTimeout(() => {
      if (!this.agent || this.activeResponseContract !== state) return;
      void this.agent.send(buildRuntimeResponseContractRepairPrompt(state, errors), msgId, []).catch((error) => {
        mainError('[AionrsManager]', 'Runtime response contract repair send failed', error);
      });
    }, 0);
  }

  private async handleContractTurnEnd(
    processedData: IResponseMessage,
    options: { allowRepair?: boolean } = {}
  ): Promise<void> {
    const result = finalizeRuntimeResponseContract(this.activeResponseContract, this.currentMsgContent);
    const msgId = this.currentMsgId || processedData.msg_id || uuid();
    const state = this.activeResponseContract;
    if (result.status === 'blocked' && state && !state.repairAttempted && this.agent && options.allowRepair !== false) {
      this.scheduleContractRepair(state, result.errors, msgId);
      return;
    }
    this.currentMsgId = msgId;
    this.currentMsgContent = result.visibleText;

    const visibleMessage: IResponseMessage = {
      type: 'content',
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: result.visibleText,
    };
    const tMessage = transformMessage(visibleMessage);
    if (tMessage) {
      this.flushAllBufferedStreamTexts();
      addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
      await flushConversationMessages(this.conversation_id);
    }

    await this.saveRuntimeContractState(result);
    ipcBridge.conversation.responseStream.emit(visibleMessage);
    this.emitToEventBuses(visibleMessage);

    const finalizedMessage: IResponseMessage = {
      type: 'assistant_message_finalized',
      conversation_id: this.conversation_id,
      msg_id: msgId,
      data: {
        schemaVersion: this.activeResponseContract?.schemaVersion ?? 1,
        status: result.status,
        errors: result.errors,
        cropped: result.cropped,
        presetAssistantId: this.data.data.presetAssistantId,
        presetRulesHash: this.data.data.presetRulesHash,
        skillPackHash: this.data.data.skillPackHash,
      },
    };
    ipcBridge.conversation.responseStream.emit(finalizedMessage);
    this.emitToEventBuses(finalizedMessage);

    const finishMessage: IResponseMessage = {
      ...processedData,
      type: 'finish',
      conversation_id: this.conversation_id,
      msg_id: processedData.msg_id || msgId,
    };
    ipcBridge.conversation.responseStream.emit(finishMessage);
    this.emitToEventBuses(finishMessage);

    this.activeResponseContract = null;
    await this.handleTurnEnd();
  }

  private handleProcessExit(code: number | null, activeMsgId: string): void {
    mainError('[AionrsManager]', `aionrs process exited unexpectedly (code=${code}) during active turn ${activeMsgId}`);
    this.stopHeartbeat();

    const errorMessage: IResponseMessage = {
      type: 'error',
      conversation_id: this.conversation_id,
      msg_id: activeMsgId,
      data: `Agent process exited unexpectedly (code ${code})`,
    };
    ipcBridge.conversation.responseStream.emit(errorMessage);
    this.emitToEventBuses(errorMessage);

    const finishMessage: IResponseMessage = {
      type: 'finish',
      conversation_id: this.conversation_id,
      msg_id: activeMsgId || uuid(),
      data: null,
    };

    this.status = 'finished';
    if (this.activeResponseContract?.active) {
      void this.handleContractTurnEnd(finishMessage, { allowRepair: false });
      return;
    }

    void this.handleTurnEnd();
    ipcBridge.conversation.responseStream.emit(finishMessage);
    this.emitToEventBuses(finishMessage);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.checkHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.heartbeatMissedCount = 0;
    this.heartbeatActive = false;
  }

  private handlePong(): void {
    this.heartbeatMissedCount = 0;
  }

  private checkHeartbeat(): void {
    if (!this.heartbeatActive || !this.agent?.isAlive) return;

    this.heartbeatMissedCount++;

    if (this.heartbeatMissedCount >= this.heartbeatMaxMissed) {
      mainError(
        '[AionrsManager]',
        `aionrs process unresponsive after ${this.heartbeatMaxMissed} missed pongs, killing`
      );
      this.agent?.kill();
      return;
    }

    this.agent?.ping();
  }

  init() {
    this.on('aionrs.message', (data) => {
      // Store capabilities from config_changed events
      if (data.type === 'config_changed') {
        const elapsed = this._configSentAt ? `${Date.now() - this._configSentAt}ms` : 'n/a';
        mainLog('[AionrsManager]', `config_changed received (${elapsed})`, data.data);
        this._configSentAt = null;
        this._capabilities = data.data as AionrsCapabilities;
        ipcBridge.conversation.responseStream.emit({
          type: 'config_changed',
          conversation_id: this.conversation_id,
          msg_id: '',
          data: data.data,
        });
        return;
      }

      // Log info events from aionrs (includes set_config/set_mode acknowledgments)
      if (data.type === 'info') {
        const elapsed = this._configSentAt ? ` (${Date.now() - this._configSentAt}ms since command)` : '';
        mainLog('[AionrsManager]', `info: ${data.data}${elapsed}`);
      }

      // System-level events (empty msg_id) are not part of a conversation turn.
      // Skip stream processing to avoid false-positive running state and fallback timer.
      if (!data.msg_id) return;

      // Any stream event with msg_id counts as activity — reset heartbeat missed count.
      // This provides backward compat with aionrs binaries that don't yet support pong.
      this.heartbeatMissedCount = 0;

      const contentTypes = ['content', 'tool_group'];
      if (contentTypes.includes(data.type)) {
        this.status = 'finished';
      }

      if (data.type === 'start') {
        const ttft = this._messageSentAt ? `${Date.now() - this._messageSentAt}ms` : 'n/a';
        mainLog('[AionrsManager]', `stream_start: msg_id=${data.msg_id}, TTFT=${ttft}`);
        this.status = 'running';
        this.heartbeatActive = true;
        this.heartbeatMissedCount = 0;
        this.currentMsgId = data.msg_id ?? null;
        this.currentMsgContent = '';

        // Reset thinking state on new turn
        if (this.thinkingMsgId) {
          this.emitThinkingMessage('', 'done');
          this.clearThinkingState();
        }

        ipcBridge.conversation.responseStream.emit({
          type: 'request_trace',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: {
            agentType: 'aionrs' as const,
            provider: this.model.name,
            modelId: this.model.useModel,
            baseUrl: this.model.baseUrl,
            platform: this.model.platform,
            presetAssistantId: this.data.data.presetAssistantId,
            presetRulesHash: this.data.data.presetRulesHash,
            skillPackHash: this.data.data.skillPackHash,
            contextProvenance: this.data.data.contextProvenance,
            timestamp: Date.now(),
          },
        });
        return;
      }

      // Handle thought events — convert to thinking messages
      if (data.type === 'thought') {
        data.conversation_id = this.conversation_id;
        const content = typeof data.data === 'string' ? data.data : '';
        if (isRuntimeResponseContractActive(this.activeResponseContract)) {
          recordRuntimeContractReasoning(this.activeResponseContract, content);
          return;
        }
        if (content) {
          this.emitThinkingMessage(content, 'thinking');
        }
        return;
      }

      // Non-thought event while thinking → end thinking phase
      if (this.thinkingMsgId) {
        this.emitThinkingMessage('', 'done');
        this.clearThinkingState();
      }

      // Extract inline <think> tags from content before main pipeline
      let processedData = data;
      if (data.type === 'content' && typeof data.data === 'string') {
        const { thinking, content: stripped } = extractAndStripThinkTags(data.data);
        if (thinking) {
          if (isRuntimeResponseContractActive(this.activeResponseContract)) {
            recordRuntimeContractReasoning(this.activeResponseContract, thinking);
          } else {
            this.emitThinkingMessage(thinking, 'thinking');
          }
        }
        if (stripped !== data.data) {
          processedData = { ...data, data: stripped };
        }
      }

      // Accumulate text content from incremental deltas
      if (processedData.type === 'content' && typeof processedData.data === 'string') {
        this.currentMsgContent += processedData.data;
        this.currentMsgId = processedData.msg_id ?? this.currentMsgId;
        recordRuntimeContractRawContent(this.activeResponseContract, processedData.data);
        if (isRuntimeResponseContractActive(this.activeResponseContract)) {
          return;
        }
      }

      if (processedData.type === 'tool_group') {
        const toolContent = Array.isArray(processedData.data)
          ? (processedData.data as IMessageToolGroup['content'])
          : [];
        const deniedTools = denyForbiddenPreArtifactTools(this.activeResponseContract, toolContent);
        if (deniedTools.length > 0) {
          for (const tool of deniedTools) {
            this.agent?.denyTool(tool.callId, tool.reason);
          }
          return;
        }
        if (
          isRuntimeResponseContractActive(this.activeResponseContract) &&
          this.activeResponseContract.deniedToolCalls.length > 0
        ) {
          return;
        }
      }

      // On turn end, clear fallback timer, persist usage, and check for cron commands
      if (processedData.type === 'finish') {
        const total = this._messageSentAt ? `${Date.now() - this._messageSentAt}ms` : 'n/a';
        mainLog('[AionrsManager]', `stream_end: msg_id=${processedData.msg_id}, total=${total}`, processedData.data);
        this._messageSentAt = null;
        this.heartbeatActive = false;
        this.heartbeatMissedCount = 0;
        this.saveContextUsage(processedData.data);
        if (this.activeResponseContract?.active) {
          void this.handleContractTurnEnd(processedData as IResponseMessage);
          return;
        }
        void this.handleTurnEnd();
      }

      processedData.conversation_id = this.conversation_id;

      const pipelineStart = Date.now();

      // Transform and persist message (skip transient UI state)
      const skipTransformTypes = ['finished', 'start', 'finish'];
      if (!skipTransformTypes.includes(processedData.type)) {
        const transformStart = Date.now();
        const tMessage = transformMessage(processedData as IResponseMessage);
        const transformDuration = Date.now() - transformStart;

        if (tMessage) {
          const dbStart = Date.now();
          const isStreamTextChunk = tMessage.type === 'text' && processedData.type === 'content';
          if (isStreamTextChunk) {
            this.queueBufferedStreamText(tMessage as Extract<TMessage, { type: 'text' }>);
          } else {
            this.flushAllBufferedStreamTexts();
            addOrUpdateMessage(this.conversation_id, tMessage, 'aionrs');
          }
          const dbDuration = Date.now() - dbStart;

          if (transformDuration > 5 || dbDuration > 5) {
            mainLog(
              '[AionrsManager]',
              `stream: transform ${transformDuration}ms, db ${dbDuration}ms type=${processedData.type}`
            );
          }

          if (tMessage.type === 'tool_group') {
            this.handleConformationMessage(tMessage);
          }
        }
      }

      const emitStart = Date.now();
      ipcBridge.conversation.responseStream.emit(processedData);
      this.emitToEventBuses(processedData as IResponseMessage);
      const emitDuration = Date.now() - emitStart;

      const totalDuration = Date.now() - pipelineStart;
      if (totalDuration > 10) {
        mainLog(
          '[AionrsManager]',
          `stream: pipeline ${totalDuration}ms (emit=${emitDuration}ms) type=${processedData.type}`
        );
      }
    });
  }

  private async handleTurnEnd(): Promise<void> {
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.flushAllBufferedStreamTexts();

    // Finalize thinking if still active
    if (this.thinkingMsgId) {
      this.emitThinkingMessage('', 'done');
      this.clearThinkingState();
    }

    const content = this.currentMsgContent;
    const msgId = this.currentMsgId;

    // Reset state immediately to prevent carry-over
    this.currentMsgId = null;
    this.currentMsgContent = '';

    // Notify external services (e.g. cron scheduler) that the turn completed
    this.notifyTurnCompletion();

    // Check for SKILL_SUGGEST.md updates (registered by cron executor)
    skillSuggestWatcher.onFinish(this.conversation_id);

    if (!content || !hasCronCommands(content)) {
      return;
    }

    try {
      const cronMessage: TMessage = {
        id: msgId || uuid(),
        msg_id: msgId || uuid(),
        type: 'text',
        position: 'left',
        conversation_id: this.conversation_id,
        content: { content },
        status: 'finish',
        createdAt: Date.now(),
      };

      const collectedResponses: string[] = [];
      await processCronInMessage(this.conversation_id, 'aionrs', cronMessage, (sysMsg) => {
        collectedResponses.push(sysMsg);
        ipcBridge.conversation.responseStream.emit({
          type: 'system',
          conversation_id: this.conversation_id,
          msg_id: uuid(),
          data: sysMsg,
        });
      });

      if (collectedResponses.length > 0) {
        const feedbackMessage = `[System Response]\n${collectedResponses.join('\n')}`;
        await this.sendMessage({
          content: feedbackMessage,
          msg_id: uuid(),
        });
      }
    } catch (error) {
      mainError('[AionrsManager]', 'Cron command processing failed', error);
    }
  }

  getCapabilities(): AionrsCapabilities | null {
    return this._capabilities;
  }

  setConfig(config: { model?: string; thinking?: string; thinking_budget?: number; effort?: string }): void {
    if (this.agent) {
      this.agent.setConfig(config);
    }
  }

  getMode(): { mode: string; initialized: boolean } {
    return { mode: this.currentMode, initialized: true };
  }

  async setMode(mode: string): Promise<{ success: boolean; data?: { mode: string } }> {
    this.currentMode = mode;
    this.saveSessionMode(mode);
    if (this.agent) {
      this._configSentAt = Date.now();
      mainLog('[AionrsManager]', `set_mode sent: mode=${mode}`);
      this.agent.setMode(mode as 'default' | 'auto_edit' | 'yolo');
    }
    return { success: true, data: { mode: this.currentMode } };
  }

  private async saveSessionMode(mode: string): Promise<void> {
    try {
      const db = await getDatabase();
      const result = db.getConversation(this.conversation_id);
      if (result.success && result.data && result.data.type === 'aionrs') {
        const conversation = result.data;
        db.updateConversation(this.conversation_id, {
          extra: { ...conversation.extra, sessionMode: mode },
        } as Partial<typeof conversation>);
      }
    } catch (error) {
      mainError('[AionrsManager]', 'Failed to save session mode', error);
    }
  }

  confirm(id: string, callId: string, data: string) {
    // Store "always allow" in approval store
    if (data === ToolConfirmationOutcome.ProceedAlways) {
      const confirmation = this.confirmations.find((c) => c.callId === callId);
      if (confirmation?.action) {
        const keys = AionrsApprovalStore.createKeysFromConfirmation(confirmation.action, confirmation.commandType);
        this.approvalStore.approveAll(keys);
      }
    }

    super.confirm(id, callId, data);

    if (this.agent) {
      if (data === ToolConfirmationOutcome.Cancel) {
        this.agent.denyTool(callId, 'User cancelled');
      } else {
        const scope = data === ToolConfirmationOutcome.ProceedAlways ? 'always' : 'once';
        this.agent.approveTool(callId, scope);
      }
    }
  }

  override kill() {
    if (this.agent) {
      this.agent.kill();
    }
    super.kill();
  }
}
