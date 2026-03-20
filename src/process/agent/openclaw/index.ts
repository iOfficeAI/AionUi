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
import net from 'node:net';
import { OpenClawGatewayConnection } from './OpenClawGatewayConnection';
import { OpenClawGatewayManager } from './OpenClawGatewayManager';
import { getGatewayAuthPassword, getGatewayAuthToken, getGatewayPort } from './openclawConfig';
import type { ChatEvent, EventFrame, HelloOk, OpenClawGatewayConfig } from './types';

async function isTcpPortOpen(host: string, port: number, timeoutMs = 300): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (result: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

export interface OpenClawAgentConfig {
  /** Conversation ID */
  id: string;
  /** Working directory */
  workingDir: string;
  /** Gateway configuration */
  gateway?: OpenClawGatewayConfig;
  /** Extra configuration */
  extra?: {
    workspace?: string;
    /** Session key for resume */
    sessionKey?: string;
    /** YOLO mode (auto-approve all permissions) */
    yoloMode?: boolean;
  };
  /** Stream event callback */
  onStreamEvent: (data: IResponseMessage) => void;
  /** Signal event callback (for non-persisted events like permissions) */
  onSignalEvent?: (data: IResponseMessage) => void;
  /** Session key update callback */
  onSessionKeyUpdate?: (sessionKey: string) => void;
}

/**
 * OpenClaw Agent using Gateway WebSocket connection
 *
 * Similar to AcpAgent but uses WebSocket to communicate with
 * OpenClaw Gateway instead of stdio JSON-RPC.
 */
export class OpenClawAgent {
  private readonly id: string;
  private readonly config: OpenClawAgentConfig;
  private gatewayManager: OpenClawGatewayManager | null = null;
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

  // Streaming message state - driven by chat.delta events
  private currentStreamMsgId: string | null = null;
  private accumulatedAssistantText = '';
  // Fallback text buffered from agent.stream="assistant" events,
  // used when chat:delta is dropped (dropIfSlow) and chat:final has no message.
  private agentAssistantFallbackText = '';

  private readonly onStreamEvent: (data: IResponseMessage) => void;
  private readonly onSignalEvent?: (data: IResponseMessage) => void;
  private readonly onSessionKeyUpdate?: (sessionKey: string) => void;

  constructor(config: OpenClawAgentConfig) {
    this.id = config.id;
    this.config = config;
    this.onStreamEvent = config.onStreamEvent;
    this.onSignalEvent = config.onSignalEvent;
    this.onSessionKeyUpdate = config.onSessionKeyUpdate;

    // Initialize adapter with 'openclaw-gateway' backend
    this.adapter = new AcpAdapter(this.id, 'openclaw-gateway');
  }

  /**
   * Start the agent
   * - Start gateway process (if not using external)
   * - Connect via WebSocket
   * - Resolve session
   */
  async start(): Promise<void> {
    try {
      this.emitStatusMessage('connecting');

      const gatewayConfig: OpenClawGatewayConfig = this.config.gateway || { port: 18789 };
      const useExternal = gatewayConfig.useExternalGateway ?? false;
      const port = gatewayConfig.port || getGatewayPort();
      const host = gatewayConfig.host || 'localhost';

      // Auto-load token/password from OpenClaw config if not explicitly provided
      const token = gatewayConfig.token ?? getGatewayAuthToken() ?? undefined;
      const password = gatewayConfig.password ?? getGatewayAuthPassword() ?? undefined;

      // Start gateway process if not using external
      if (!useExternal) {
        // If a gateway is already listening on the target port, don't try to spawn another one.
        // This avoids failures like "port already in use" when the user runs the Gateway service via launchd/systemd.
        const probeHost = host === 'localhost' ? '127.0.0.1' : host;
        const alreadyListening = await isTcpPortOpen(probeHost, port);
        if (alreadyListening) {
          // Gateway already running, skip spawning
        } else {
          this.gatewayManager = new OpenClawGatewayManager({
            cliPath: gatewayConfig.cliPath || 'openclaw',
            port,
          });

          try {
            await this.gatewayManager.start();
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to start OpenClaw Gateway: ${errorMsg}`, { cause: error });
          }
        }
      }

      // Create and configure connection
      this.connection = new OpenClawGatewayConnection({
        url: `ws://${host}:${port}`,
        token,
        password,
        onEvent: (evt) => this.handleEvent(evt),
        onHelloOk: (hello) => this.handleHelloOk(hello),
        onConnectError: (err) => this.handleConnectError(err),
        onClose: (code, reason) => this.handleClose(code, reason),
      });

      // Start connection
      this.connection.start();

      // Wait for connection to be established
      await this.waitForConnection();
      this.emitStatusMessage('connected');

      // Resolve session
      await this.resolveSession();
      this.emitStatusMessage('session_active');
    } catch (error) {
      this.emitStatusMessage('error');
      throw error;
    }
  }

  /**
   * Stop the agent
   */
  async stop(): Promise<void> {
    // Stop connection
    if (this.connection) {
      this.connection.stop();
      this.connection = null;
    }

    // Stop gateway process
    if (this.gatewayManager) {
      await this.gatewayManager.stop();
      this.gatewayManager = null;
    }

    // Clear caches
    this.approvalStore.clear();
    this.pendingPermissions.clear();
    this.pendingNavigationTools.clear();

    this.emitStatusMessage('disconnected');

    // Emit finish event
    this.onStreamEvent({
      type: 'finish',
      conversation_id: this.id,
      msg_id: uuid(),
      data: null,
    });
  }

  /**
   * Send a message
   */
  async sendMessage(data: { content: string; files?: string[]; msg_id?: string }): Promise<AcpResult> {
    try {
      // Auto-reconnect if needed
      if (!this.connection?.isConnected || !this.connection?.sessionKey) {
        await this.start();
      }

      // Reset streaming state for new message
      this.currentStreamMsgId = null;
      this.accumulatedAssistantText = '';
      this.agentAssistantFallbackText = '';
      this.adapter.resetMessageTracking();

      // Process file references
      let processedContent = data.content;
      if (data.files && data.files.length > 0) {
        const fileRefs = data.files.map((f) => (f.includes(' ') ? `@"${f}"` : `@${f}`)).join(' ');
        processedContent = `${fileRefs} ${processedContent}`;
      }

      // Send chat message
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

  /**
   * Confirm a permission request
   */
  confirmMessage(data: { confirmKey: string; callId: string }): Promise<AcpResult> {
    const pending = this.pendingPermissions.get(data.callId);
    if (!pending) {
      return Promise.resolve({
        success: false,
        error: createAcpError(AcpErrorType.UNKNOWN, `Permission request not found: ${data.callId}`, false),
      });
    }

    this.pendingPermissions.delete(data.callId);

    // Cache "always allow" decisions
    if (data.confirmKey === 'allow_always') {
      // TODO: Store in approval store
    }

    pending.resolve({ optionId: data.confirmKey });
    return Promise.resolve({ success: true, data: null });
  }

  /**
   * Kill the agent (compatibility method)
   */
  kill(): void {
    this.stop().catch(console.error);
  }

  // ========== Private Methods ==========

  private async waitForConnection(timeoutMs = 30000): Promise<void> {
    const startTime = Date.now();
    while (!this.connection?.isConnected) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Connection timeout');
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  private async resolveSession(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not available');
    }

    const resumeKey = this.config.extra?.sessionKey;

    // If we have a resume key, try to resolve it first
    if (resumeKey) {
      try {
        const result = await this.connection.sessionsResolve({ key: resumeKey });
        this.connection.sessionKey = result.key;
        return;
      } catch (err) {
        console.warn('[OpenClawAgent] Failed to resume session, using default:', err);
      }
    }

    // For new conversations: reset creates/clears the session and returns the canonical key.
    // sessions.reset is sufficient — no need for a subsequent sessions.resolve call.
    const defaultKey = this.id; // use conversation_id for per-conversation session isolation
    try {
      const resetResult = await this.connection.sessionsReset({ key: defaultKey, reason: 'new' });
      this.connection.sessionKey = resetResult.key;
    } catch (err) {
      // Fallback: try plain resolve (handles race conditions where session already exists)
      console.warn('[OpenClawAgent] Failed to reset session, trying plain resolve:', err);
      try {
        const result = await this.connection.sessionsResolve({ key: defaultKey });
        this.connection.sessionKey = result.key;
      } catch (resolveErr) {
        console.warn('[OpenClawAgent] Failed to resolve default session, falling back:', resolveErr);
        this.connection.sessionKey = defaultKey;
      }
    }

    // Notify about session key
    if (this.connection.sessionKey !== resumeKey) {
      this.onSessionKeyUpdate?.(this.connection.sessionKey!);
    }
  }

  private isFromOtherSession(sessionKey?: string): boolean {
    return !!(sessionKey && this.connection?.sessionKey && sessionKey !== this.connection.sessionKey);
  }

  private handleEvent(evt: EventFrame): void {
    // Handle different event types
    switch (evt.event) {
      // Chat events - streaming message updates
      case 'chat':
      case 'chat.event':
        this.handleChatEvent(evt.payload as ChatEvent);
        break;

      // Agent events - lifecycle, assistant text, tool calls
      case 'agent':
      case 'agent.event':
        this.handleAgentEvent(evt.payload);
        break;

      // Permission/approval requests
      case 'exec.approval.request':
        this.handleApprovalRequest(evt.payload);
        break;

      // Gateway shutdown
      case 'shutdown':
        this.handleDisconnect('Gateway shutdown');
        break;

      // Ignore health and tick events
      case 'health':
      case 'tick':
        break;

      default:
        break;
    }
  }

  private handleChatEvent(event: ChatEvent): void {
    // Filter out events from other sessions to prevent cross-session message contamination
    if (this.isFromOtherSession(event.sessionKey)) return;
    switch (event.state) {
      case 'delta': {
        // Extract cumulative text from the message (gateway sends cumulative snapshots)
        const cumulative = this.extractTextFromMessage(event.message);
        if (!cumulative) return;

        // chat:delta is working — clear fallback buffer so it won't be reused
        this.agentAssistantFallbackText = '';

        // Initialize stable msg_id for this turn on first delta
        if (!this.currentStreamMsgId) {
          this.currentStreamMsgId = uuid();
          this.accumulatedAssistantText = '';
        }

        // Compute incremental delta from cumulative text
        let delta: string;
        if (
          cumulative.length >= this.accumulatedAssistantText.length &&
          cumulative.startsWith(this.accumulatedAssistantText)
        ) {
          delta = cumulative.substring(this.accumulatedAssistantText.length);
          this.accumulatedAssistantText = cumulative;
        } else {
          // Not cumulative — treat as incremental
          delta = cumulative;
          this.accumulatedAssistantText += cumulative;
        }

        if (!delta) return;

        this.onStreamEvent({
          type: 'content',
          conversation_id: this.id,
          msg_id: this.currentStreamMsgId!, // initialized above
          data: delta,
        });
        break;
      }

      case 'final': {
        // If delta events were missed (WebSocket gap), recover full text from final message
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
        // Layer 2 fallback: if chat:delta was dropped but agent.stream="assistant" buffered text
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
        // Layer 3 fallback: when Gateway suppresses all content events (e.g. isSilentReplyText),
        // chat:final arrives with no message and no delta was received. Pull from chat.history instead.
        if (!this.currentStreamMsgId && this.connection?.sessionKey) {
          this.fetchAndEmitHistoryFallback(event.runId);
          break; // handleEndTurn is called inside fetchAndEmitHistoryFallback
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
        console.warn('[OpenClawAgent] handleChatEvent: unknown state:', (event as { state: unknown }).state);
    }
  }

  /**
   * Extract text from a chat message payload.
   * Gateway sends content as string, array of blocks, or top-level text field.
   */
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
    // Filter out events from other sessions (defensive)
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
          // Gateway actual fields
          phase?: string; // 'start' | 'update' | 'result' | 'partialResult'
          name?: string; // tool name e.g. 'exec', 'read', 'write'
          toolCallId?: string;
          args?: Record<string, unknown>;
          meta?: string; // result description
          isError?: boolean;
          // Legacy / fallback fields
          status?: string;
          title?: string;
          kind?: string;
          content?: unknown[];
        };

        // Map phase → status
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

        // Map name → kind
        const toolName = toolData.name ?? toolData.title ?? '';
        const kind = this.inferToolKind(toolName) ?? (toolData.kind as 'read' | 'edit' | 'execute') ?? 'execute';

        // Build content: prefer meta (result description), fallback to args
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

        // Check for navigation tools
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
        // Intentionally ignored — turn lifecycle is driven by chat.state events (final/aborted/error)
        break;

      case 'assistant': {
        // Buffer assistant text as fallback for when chat:delta events are dropped (dropIfSlow).
        // Primary text delivery is via chat:delta; this is only used when chat:final arrives
        // with no message and no delta was received.
        if (!event.data) break;
        const text = (event.data.text as string) || '';
        if (text) {
          this.agentAssistantFallbackText = text;
        }
        break;
      }

      default:
        console.warn('[OpenClawAgent] Unhandled agent stream:', event.stream, event);
    }
  }

  private handleApprovalRequest(payload: unknown): void {
    // Handle execution approval requests (permissions)
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

    // Store pending and emit to UI
    this.pendingPermissions.set(requestId, {
      // TODO: handle permission response once the UI returns a user decision
      resolve: (_response) => {},
      reject: (error) => {
        console.error('[OpenClawAgent] Permission error:', error);
      },
    });

    // Emit permission request
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

    // Timeout - reject pending to avoid silent hang
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
    console.error('[OpenClawAgent] Connection error:', err);
    this.emitErrorMessage(`Connection error: ${err.message}`);
  }

  private handleClose(_code: number, reason: string): void {
    this.handleDisconnect(reason);
  }

  /**
   * Layer 3 fallback: fetch last assistant message from chat.history when Gateway suppressed
   * all content events (e.g. isSilentReplyText filter), causing chat:final to arrive without content.
   */
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

        // Find the last assistant message for this run (fall back to any last assistant message)
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
        console.warn('[OpenClawAgent] chat.history fallback failed:', err);
      })
      .finally(() => {
        this.handleEndTurn();
      });
  }

  private handleEndTurn(): void {
    // Reset streaming state for next turn
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
    this.emitErrorMessage(`Gateway disconnected: ${reason}`, 'disconnect');

    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }

    // Clear state
    this.pendingPermissions.clear();
    this.approvalStore.clear();
    this.pendingNavigationTools.clear();
  }

  // ========== Message Emission ==========

  private emitStatusMessage(status: 'connecting' | 'connected' | 'session_active' | 'disconnected' | 'error'): void {
    if (!this.statusMessageId) {
      this.statusMessageId = uuid();
    }

    const msgId = this.statusMessageId!;
    const message: TMessage = {
      id: msgId,
      msg_id: msgId,
      conversation_id: this.id,
      type: 'agent_status',
      position: 'center',
      createdAt: Date.now(),
      content: {
        backend: 'openclaw-gateway',
        status,
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
        // Skip unknown message types to avoid sending raw JSON to external channels
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

// Re-export types and utilities
export { OpenClawGatewayConnection } from './OpenClawGatewayConnection';
export { OpenClawGatewayManager } from './OpenClawGatewayManager';
export type { OpenClawGatewayConfig } from './types';
