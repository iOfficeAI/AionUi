/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpAdapter } from '@process/agent/acp/AcpAdapter';
import { AcpApprovalStore } from '@process/agent/acp/ApprovalStore';
import type { TMessage } from '@/common/chat/chatLib';
import type { IResponseMessage } from '@/common/adapter/ipcBridge';
import { NavigationInterceptor } from '@/common/chat/navigation';
import { uuid } from '@/common/utils';
import type { AcpResult, ToolCallUpdate } from '@/common/types/acpTypes';
import { AcpErrorType, createAcpError } from '@/common/types/acpTypes';
import { OpenClawGatewayConnection } from '@process/agent/openclaw/OpenClawGatewayConnection';
import type { ChatEvent, EventFrame, HelloOk } from '@process/agent/openclaw/types';
import { getDatabase } from '@process/services/database';
import type { RemoteAgentConfig } from './types';

export interface RemoteAgentCoreConfig {
  conversationId: string;
  remoteConfig: RemoteAgentConfig;
  sessionKey?: string;
  onStreamEvent: (data: IResponseMessage) => void;
  onSignalEvent?: (data: IResponseMessage) => void;
  onSessionKeyUpdate?: (sessionKey: string) => void;
}

/**
 * Remote Agent core — the remote counterpart of OpenClawAgent.
 *
 * Directly uses OpenClawGatewayConnection (transport layer reuse) without
 * managing a local Gateway process. Gets URL/Token from RemoteAgentConfig
 * instead of reading local ~/.openclaw/ config.
 */
export class RemoteAgentCore {
  private readonly id: string;
  private readonly remoteConfig: RemoteAgentConfig;
  private connection: OpenClawGatewayConnection | null = null;
  private adapter: AcpAdapter;
  private approvalStore = new AcpApprovalStore();
  private pendingPermissions = new Map<
    string,
    { resolve: (response: { optionId: string }) => void; reject: (error: Error) => void }
  >();
  private statusMessageId: string | null = null;
  private disconnectTipMessageId: string | null = null;
  private pendingNavigationTools = new Set<string>();

  private currentStreamMsgId: string | null = null;
  private accumulatedAssistantText = '';
  private agentAssistantFallbackText = '';

  private readonly resumeKey?: string;
  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;
  private readonly onSessionKeyUpdate?: (sessionKey: string) => void;

  constructor(config: RemoteAgentCoreConfig) {
    this.id = config.conversationId;
    this.remoteConfig = config.remoteConfig;
    this.resumeKey = config.sessionKey;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.onSessionKeyUpdate = config.onSessionKeyUpdate;

    this.adapter = new AcpAdapter(this.id, 'remote');
  }

  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      const { url, authType, authToken } = this.remoteConfig;

      this.connection = new OpenClawGatewayConnection({
        url,
        rejectUnauthorized: !this.remoteConfig.allowInsecure,
        token: authType === 'bearer' ? authToken : undefined,
        password: authType === 'password' ? authToken : undefined,
        deviceIdentity: this.remoteConfig.deviceId
          ? {
              deviceId: this.remoteConfig.deviceId,
              publicKeyPem: this.remoteConfig.devicePublicKey!,
              privateKeyPem: this.remoteConfig.devicePrivateKey!,
            }
          : undefined,
        deviceToken: this.remoteConfig.deviceToken,
        onDeviceTokenIssued: (token) => this.persistDeviceToken(token),
        onEvent: (evt) => this.handleEvent(evt),
        onHelloOk: (hello) => this.handleHelloOk(hello),
        onConnectError: (err) => this.handleConnectError(err),
        onClose: (code, reason) => this.handleClose(code, reason),
      });

      this.connection.start();
      await this.waitForConnection();
      this.emitStatusMessage('connected');

      await this.resolveSession();
      this.emitStatusMessage('session_active');
    } catch (error) {
      this.emitStatusMessage('error');
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.connection) {
      this.connection.stop();
      this.connection = null;
    }

    this.approvalStore.clear();
    this.pendingPermissions.clear();
    this.pendingNavigationTools.clear();

    this.emitStatusMessage('disconnected');

    this.onStreamEvent({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
  }

  async sendMessage(data: { content: string; files?: string[] }): Promise<AcpResult> {
    try {
      if (!this.connection?.isConnected || !this.connection?.sessionKey) {
        await this.start();
      }

      this.currentStreamMsgId = null;
      this.accumulatedAssistantText = '';
      this.agentAssistantFallbackText = '';
      this.adapter.resetMessageTracking();

      let processedContent = data.content;
      if (data.files && data.files.length > 0) {
        const fileRefs = data.files.map((f) => (f.includes(' ') ? `@"${f}"` : `@${f}`)).join(' ');
        processedContent = `${fileRefs} ${processedContent}`;
      }

      await this.connection!.chatSend({
        sessionKey: this.connection!.sessionKey!,
        message: processedContent,
      });

      return { success: true, data: null };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emitErrorMessage(errorMsg);
      return {
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, errorMsg, false),
      };
    }
  }

  confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    const pending = this.pendingPermissions.get(data.callId);
    if (!pending) {
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found: ${data.callId}`, false),
      });
    }

    this.pendingPermissions.delete(data.callId);
    pending.resolve({ optionId: data.confirmKey });
    return Promise.resolve({ success: true, data: null });
  }

  kill(): void {
    this.stop().catch(console.error);
  }

  // ========== Private Methods ==========

  private async waitForConnection(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (!this.connection?.isConnected) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Remote agent connection timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async resolveSession(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not available');
    }

    if (this.resumeKey) {
      try {
        const result = await this.connection.sessionsResolve({ key: this.resumeKey });
        this.connection.sessionKey = result.key;
        return;
      } catch (err) {
        console.warn('[RemoteAgentCore] Failed to resume session, using default:', err);
      }
    }

    const defaultKey = this.id;
    try {
      const resetResult = await this.connection.sessionsReset({ key: defaultKey, reason: 'new' });
      this.connection.sessionKey = resetResult.key;
    } catch (err) {
      console.warn('[RemoteAgentCore] Failed to reset session, trying plain resolve:', err);
      try {
        const result = await this.connection.sessionsResolve({ key: defaultKey });
        this.connection.sessionKey = result.key;
      } catch (resolveErr) {
        console.warn('[RemoteAgentCore] Failed to resolve default session, falling back:', resolveErr);
        this.connection.sessionKey = defaultKey;
      }
    }

    if (this.connection.sessionKey !== this.resumeKey) {
      this.onSessionKeyUpdate?.(this.connection.sessionKey!);
    }
  }

  private isFromOtherSession(sessionKey?: string): boolean {
    return !!(sessionKey && this.connection?.sessionKey && sessionKey !== this.connection.sessionKey);
  }

  private handleEvent(evt: EventFrame): void {
    switch (evt.event) {
      case 'chat':
      case 'chat.event':
        this.handleChatEvent(evt.payload as ChatEvent);
        break;
      case 'agent':
      case 'agent.event':
        this.handleAgentEvent(evt.payload);
        break;
      case 'exec.approval.request':
        this.handleApprovalRequest(evt.payload);
        break;
      case 'shutdown':
        this.handleDisconnect('Remote gateway shutdown');
        break;
      case 'health':
      case 'tick':
        break;
      default:
        break;
    }
  }

  private handleChatEvent(event: ChatEvent): void {
    if (this.isFromOtherSession(event.sessionKey)) return;
    switch (event.state) {
      case 'delta': {
        const cumulative = this.extractTextFromMessage(event.message);
        if (!cumulative) return;

        this.agentAssistantFallbackText = '';

        if (!this.currentStreamMsgId) {
          this.currentStreamMsgId = uuid();
          this.accumulatedAssistantText = '';
        }

        let delta: string;
        if (
          cumulative.length >= this.accumulatedAssistantText.length &&
          cumulative.startsWith(this.accumulatedAssistantText)
        ) {
          delta = cumulative.substring(this.accumulatedAssistantText.length);
          this.accumulatedAssistantText = cumulative;
        } else {
          delta = cumulative;
          this.accumulatedAssistantText += cumulative;
        }

        if (!delta) return;

        this.onStreamEvent({
          type: 'content',
          conversation_id: this.id,
          msg_id: this.currentStreamMsgId!,
          data: delta,
        });
        break;
      }

      case 'final': {
        if (event.message) {
          const finalText = this.extractTextFromMessage(event.message);
          if (finalText && finalText.length > this.accumulatedAssistantText.length) {
            if (!this.currentStreamMsgId) {
              this.currentStreamMsgId = uuid();
              this.accumulatedAssistantText = '';
            }
            const delta = finalText.substring(this.accumulatedAssistantText.length);
            this.accumulatedAssistantText = finalText;
            this.onStreamEvent({
              type: 'content',
              conversation_id: this.id,
              msg_id: this.currentStreamMsgId!,
              data: delta,
            });
          }
        }
        if (!this.currentStreamMsgId && this.agentAssistantFallbackText) {
          const fallback = this.agentAssistantFallbackText;
          const fallbackMsgId = uuid();
          this.currentStreamMsgId = fallbackMsgId;
          this.accumulatedAssistantText = fallback;
          this.onStreamEvent({
            type: 'content',
            conversation_id: this.id,
            msg_id: fallbackMsgId,
            data: fallback,
          });
        }
        if (!this.currentStreamMsgId && this.connection?.sessionKey) {
          this.fetchAndEmitHistoryFallback(event.runId);
          break;
        }

        this.handleEndTurn();
        break;
      }

      case 'aborted':
        this.handleEndTurn();
        break;

      case 'error':
        this.emitErrorMessage(event.errorMessage || 'Unknown error');
        this.handleEndTurn();
        break;

      default:
        console.warn('[RemoteAgentCore] handleChatEvent: unknown state:', (event as { state: unknown }).state);
    }
  }

  private extractTextFromMessage(message: unknown): string | null {
    if (!message || typeof message !== 'object') return null;
    const m = message as Record<string, unknown>;
    const content = m.content;
    if (typeof content === 'string') return content || null;
    if (Array.isArray(content)) {
      const text = content
        .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
        .filter((item) => item.type === 'text')
        .map((item) => (typeof item.text === 'string' ? item.text : ''))
        .join('');
      return text || null;
    }
    if (typeof m.text === 'string') return m.text || null;
    return null;
  }

  private handleAgentEvent(payload: unknown): void {
    const event = payload as { stream: string; data: Record<string, unknown>; runId?: string; sessionKey?: string };
    if (this.isFromOtherSession(event.sessionKey)) return;
    switch (event.stream) {
      case 'thinking':
      case 'thought': {
        if (!event.data) break;
        const delta = (event.data.delta as string) || (event.data.text as string);
        if (!delta) break;
        this.onSignalEvent?.({
          type: 'thought',
          conversation_id: this.id,
          msg_id: uuid(),
          data: { subject: 'Thinking', description: delta },
        });
        break;
      }

      case 'tool':
      case 'tool_call': {
        if (!event.data) break;
        const toolData = event.data as {
          phase?: string;
          name?: string;
          toolCallId?: string;
          args?: Record<string, unknown>;
          meta?: string;
          isError?: boolean;
          status?: string;
          title?: string;
          kind?: string;
          content?: unknown[];
        };

        const phaseToStatus: Record<string, 'pending' | 'in_progress' | 'completed' | 'failed'> = {
          start: 'in_progress',
          update: 'in_progress',
          partialResult: 'in_progress',
        };
        let status: 'pending' | 'in_progress' | 'completed' | 'failed';
        if (toolData.phase === 'result') {
          status = toolData.isError ? 'failed' : 'completed';
        } else {
          status =
            phaseToStatus[toolData.phase ?? ''] ??
            ((toolData.status as 'pending' | 'in_progress' | 'completed' | 'failed') || 'pending');
        }

        const toolName = toolData.name ?? toolData.title ?? '';
        const kind = this.inferToolKind(toolName) ?? (toolData.kind as 'read' | 'edit' | 'execute') ?? 'execute';

        let content: ToolCallUpdate['update']['content'];
        if (toolData.content) {
          content = toolData.content as ToolCallUpdate['update']['content'];
        } else if (toolData.meta) {
          content = [{ type: 'content', content: { type: 'text', text: toolData.meta } }];
        } else if (toolData.args) {
          content = [{ type: 'content', content: { type: 'text', text: JSON.stringify(toolData.args, null, 2) } }];
        }

        const acpUpdate: ToolCallUpdate = {
          sessionId: this.id,
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: toolData.toolCallId || uuid(),
            status,
            title: toolName || 'Tool Call',
            kind,
            content,
          },
        };

        if (NavigationInterceptor.isNavigationTool(acpUpdate.update.title)) {
          const url = NavigationInterceptor.extractUrl(acpUpdate.update);
          if (url) {
            const previewMessage = NavigationInterceptor.createPreviewMessage(url, this.id);
            this.onStreamEvent(previewMessage);
          }
        }

        const messages = this.adapter.convertSessionUpdate(acpUpdate);
        for (const message of messages) {
          this.emitMessage(message);
        }
        break;
      }

      case 'lifecycle':
        break;

      case 'assistant': {
        if (!event.data) break;
        const text = (event.data.text as string) || '';
        if (text) {
          this.agentAssistantFallbackText = text;
        }
        break;
      }

      default:
        console.warn('[RemoteAgentCore] Unhandled agent stream:', event.stream, event);
    }
  }

  private handleApprovalRequest(payload: unknown): void {
    const request = payload as {
      requestId: string;
      toolCall?: {
        toolCallId?: string;
        title?: string;
        kind?: string;
        rawInput?: Record<string, unknown>;
      };
      options?: Array<{
        optionId: string;
        name: string;
        kind: string;
      }>;
    };

    const requestId = request.requestId || uuid();

    this.pendingPermissions.set(requestId, {
      resolve: (_response) => {},
      reject: (error) => {
        console.error('[RemoteAgentCore] Permission error:', error);
      },
    });

    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'acp_permission',
        conversation_id: this.id,
        msg_id: uuid(),
        data: {
          sessionId: this.id,
          toolCall: request.toolCall || { toolCallId: requestId },
          options: request.options || [
            { optionId: 'allow_once', name: 'Allow', kind: 'allow_once' },
            { optionId: 'allow_always', name: 'Always Allow', kind: 'allow_always' },
            { optionId: 'reject_once', name: 'Reject', kind: 'reject_once' },
          ],
        },
      });
    }

    setTimeout(() => {
      const pending = this.pendingPermissions.get(requestId);
      if (pending) {
        this.pendingPermissions.delete(requestId);
        pending.reject(new Error('Permission request timed out'));
      }
    }, 70000);
  }

  private handleHelloOk(_hello: HelloOk): void {}

  private handleConnectError(err: Error): void {
    console.error('[RemoteAgentCore] Connection error:', err);
    this.emitErrorMessage(`Connection error: ${err.message}`);
  }

  private handleClose(_code: number, reason: string): void {
    this.handleDisconnect(reason);
  }

  private persistDeviceToken(token: string): void {
    getDatabase()
      .then((db) => {
        db.updateRemoteAgent(this.remoteConfig.id, { device_token: token });
      })
      .catch((err: unknown) => {
        console.warn('[RemoteAgentCore] Failed to persist device token:', err);
      });
  }

  private fetchAndEmitHistoryFallback(runId: string): void {
    const sessionKey = this.connection?.sessionKey;
    if (!sessionKey) {
      this.handleEndTurn();
      return;
    }

    this.connection!.chatHistory(sessionKey, 5)
      .then((result: unknown) => {
        const raw = result as { messages?: unknown[] } | unknown[];
        const messages: unknown[] = Array.isArray(raw) ? raw : ((raw as { messages?: unknown[] })?.messages ?? []);

        const last = [...messages].toReversed().find((m: unknown) => {
          const msg = m as { role?: string; runId?: string };
          return msg?.role === 'assistant' && (!runId || !msg.runId || msg.runId === runId);
        }) as { content?: unknown } | undefined;

        const text = this.extractTextFromMessage(last);
        if (text) {
          const msgId = uuid();
          this.currentStreamMsgId = msgId;
          this.accumulatedAssistantText = text;
          this.onStreamEvent({
            type: 'content',
            conversation_id: this.id,
            msg_id: msgId,
            data: text,
          });
        }
      })
      .catch((err: unknown) => {
        console.warn('[RemoteAgentCore] chat.history fallback failed:', err);
      })
      .finally(() => {
        this.handleEndTurn();
      });
  }

  private handleEndTurn(): void {
    this.currentStreamMsgId = null;
    this.accumulatedAssistantText = '';
    this.agentAssistantFallbackText = '';

    this.onSignalEvent?.({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
  }

  private inferToolKind(name: string): 'read' | 'edit' | 'execute' | null {
    const n = name.toLowerCase();
    if (/read|view|list|search|grep|glob|find|get|fetch/.test(n)) return 'read';
    if (/write|edit|create|delete|patch|update|insert|remove/.test(n)) return 'edit';
    if (/exec|run|bash|shell|terminal/.test(n)) return 'execute';
    return null;
  }

  private handleDisconnect(reason: string): void {
    this.emitStatusMessage('disconnected');
    this.emitErrorMessage(`Remote agent disconnected: ${reason}`, 'disconnect');

    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }

    this.pendingPermissions.clear();
    this.approvalStore.clear();
    this.pendingNavigationTools.clear();
  }

  // ========== Message Emission ==========

  private emitStatusMessage(status: 'connecting' | 'connected' | 'session_active' | 'disconnected' | 'error'): void {
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const message: TMessage = {
      id: this.statusMessageId!,
      msg_id: this.statusMessageId!,
      conversation_id: this.id,
      type: 'agent_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: 'remote',
        status,
        agentName: this.remoteConfig.name,
      },
    };

    this.emitMessage(message);
  }

  private emitErrorMessage(error: string, kind: 'generic' | 'disconnect' = 'generic'): void {
    const messageId = kind === 'disconnect' ? (this.disconnectTipMessageId ??= uuid()) : uuid();
    const message: TMessage = {
      id: messageId,
      msg_id: messageId,
      conversation_id: this.id,
      type: 'tips',
      position: 'center',
      createdAt: Date.now(),
      content: {
        content: error,
        type: 'error',
      },
    };

    this.emitMessage(message);
  }

  private emitMessage(message: TMessage): void {
    const finalMsgId = message.msg_id || message.id;
    const responseMessage: IResponseMessage = {
      type: '',
      data: null,
      conversation_id: this.id,
      msg_id: finalMsgId,
    };

    switch (message.type) {
      case 'text':
        responseMessage.type = 'content';
        responseMessage.data = message.content.content;
        break;
      case 'agent_status':
        responseMessage.type = 'agent_status';
        responseMessage.data = message.content;
        break;
      case 'tips':
        responseMessage.type = 'error';
        responseMessage.data = message.content.content;
        break;
      case 'acp_tool_call':
        responseMessage.type = 'acp_tool_call';
        responseMessage.data = message.content;
        break;
      case 'plan':
        responseMessage.type = 'plan';
        responseMessage.data = message.content;
        break;
      case 'tool_group':
        responseMessage.type = 'tool_group';
        responseMessage.data = message.content;
        break;
      default:
        return;
    }

    this.onStreamEvent(responseMessage);
  }

  // ========== Getters ==========

  get isConnected(): boolean {
    return this.connection?.isConnected ?? false;
  }

  get hasActiveSession(): boolean {
    return !!this.connection?.sessionKey;
  }

  get currentSessionKey(): string | null {
    return this.connection?.sessionKey ?? null;
  }
}
