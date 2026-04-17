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
import { AionrsAgent } from '@process/agent/aionrs';
import type { AionrsCapabilities } from '@process/agent/aionrs/protocol';
import { getDatabase } from '@process/services/database';
import { addMessage, addOrUpdateMessage } from '@process/utils/message';
import { uuid } from '@/common/utils';
import BaseAgentManager from './BaseAgentManager';
import { IpcAgentEventEmitter } from './IpcAgentEventEmitter';
import { mainError, mainLog, mainWarn } from '@process/utils/mainLogger';
import { hasCronCommands } from './CronCommandDetector';
import { processCronInMessage } from './MessageMiddleware';
import { extractAndStripThinkTags } from './ThinkTagDetector';
import { ConversationTurnCompletionService } from './ConversationTurnCompletionService';
import { cronBusyGuard } from '@process/services/cron/CronBusyGuard';
import { skillSuggestWatcher } from '@process/services/cron/SkillSuggestWatcher';

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

  // Finish fallback state
  private missingFinishFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly missingFinishFallbackDelayMs = 15000;

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
    super('aionrs', { ...data, model }, new IpcAgentEventEmitter(), false);
    this.workspace = data.workspace;
    this.conversation_id = data.conversation_id;
    this.model = model;
    this.currentMode = data.sessionMode || 'default';

    // enableFork=false skips auto-init in ForkTask, so init manually
    this.init();

    // Start the agent bootstrap — store promise so sendMessage can await it
    this.agentReady = this.start().catch(() => {});
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
      sessionArgs = hasMessages ? { resume: this.conversation_id } : { sessionId: this.conversation_id };
    } catch {
      // Fallback: start as new session if DB check fails
      sessionArgs = { sessionId: this.conversation_id };
    }

    const mergedData = { ...this.data.data, ...sessionArgs };

    const agent = new AionrsAgent({
      workspace: mergedData.workspace,
      model: mergedData.model,
      proxy: mergedData.proxy,
      yoloMode: mergedData.yoloMode,
      presetRules: mergedData.presetRules,
      maxTokens: mergedData.maxTokens,
      maxTurns: mergedData.maxTurns,
      sessionId: mergedData.sessionId,
      resume: mergedData.resume,
      teamMcpStdioConfig: mergedData.teamMcpStdioConfig,
      onStreamEvent: (event) => this.emit('aionrs.message', event),
    });

    await agent.start();
    this.agent = agent;
    this._capabilities = agent.capabilities ?? null;

    if (this.data.data.teamMcpStdioConfig) {
      const { notifyMcpReady } = await import('@process/team/mcpReadiness');
      const slotId = this.data.data.teamMcpStdioConfig.env?.find((e) => e.name === 'TEAM_AGENT_SLOT_ID')?.value;
      if (slotId) {
        notifyMcpReady(slotId);
      }
    }
  }

  async stop() {
    this.clearMissingFinishFallback();
    this.flushAllBufferedStreamTexts();
    cronBusyGuard.setProcessing(this.conversation_id, false);
    this.confirmations = [];
    if (this.agent) {
      this.agent.stop();
    }
  }

  async sendMessage(data: { content: string; msg_id: string; files?: string[] }) {
    const message: TMessage = {
      id: data.msg_id,
      type: 'text',
      position: 'right',
      conversation_id: this.conversation_id,
      content: { content: data.content },
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
    // Wait for agent bootstrap to complete before sending
    await this.agentReady;
    this._messageSentAt = Date.now();
    mainLog('[AionrsManager]', `message sent: msg_id=${data.msg_id}`);
    if (this.agent) {
      await this.agent.send(data.content, data.msg_id, data.files);
    }
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

  private scheduleMissingFinishFallback(): void {
    this.clearMissingFinishFallback();
    this.missingFinishFallbackTimer = setTimeout(() => {
      this.handleMissingFinishFallback();
    }, this.missingFinishFallbackDelayMs);
  }

  private clearMissingFinishFallback(): void {
    if (this.missingFinishFallbackTimer) {
      clearTimeout(this.missingFinishFallbackTimer);
      this.missingFinishFallbackTimer = null;
    }
  }

  private handleMissingFinishFallback(): void {
    this.clearMissingFinishFallback();

    if (this.getConfirmations().length > 0) {
      return;
    }

    mainWarn(
      '[AionrsManager]',
      `Turn became idle without finish signal; synthesizing finish for ${this.conversation_id}`
    );

    this.status = 'finished';
    void this.handleTurnEnd();

    const fallbackFinish: IResponseMessage = {
      type: 'finish',
      conversation_id: this.conversation_id,
      msg_id: uuid(),
      data: null,
    };
    ipcBridge.conversation.responseStream.emit(fallbackFinish);
    this.emitToEventBuses(fallbackFinish);
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

      // Restart fallback timer on every non-finish event (activity heartbeat)
      if (data.type !== 'finish') {
        this.scheduleMissingFinishFallback();
      }

      const contentTypes = ['content', 'tool_group'];
      if (contentTypes.includes(data.type)) {
        this.status = 'finished';
      }

      if (data.type === 'start') {
        const ttft = this._messageSentAt ? `${Date.now() - this._messageSentAt}ms` : 'n/a';
        mainLog('[AionrsManager]', `stream_start: msg_id=${data.msg_id}, TTFT=${ttft}`);
        this.status = 'running';
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
            timestamp: Date.now(),
          },
        });
        return;
      }

      // Handle thought events — convert to thinking messages
      if (data.type === 'thought') {
        data.conversation_id = this.conversation_id;
        const content = typeof data.data === 'string' ? data.data : '';
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
          this.emitThinkingMessage(thinking, 'thinking');
        }
        if (stripped !== data.data) {
          processedData = { ...data, data: stripped };
        }
      }

      // Accumulate text content from incremental deltas
      if (processedData.type === 'content' && typeof processedData.data === 'string') {
        this.currentMsgContent += processedData.data;
        this.currentMsgId = processedData.msg_id ?? this.currentMsgId;
      }

      // On turn end, clear fallback timer, persist usage, and check for cron commands
      if (processedData.type === 'finish') {
        const total = this._messageSentAt ? `${Date.now() - this._messageSentAt}ms` : 'n/a';
        mainLog('[AionrsManager]', `stream_end: msg_id=${processedData.msg_id}, total=${total}`, processedData.data);
        this._messageSentAt = null;
        this.clearMissingFinishFallback();
        this.saveContextUsage(processedData.data);
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
