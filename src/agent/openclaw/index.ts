/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcpAdapter } from '@/agent/acp/AcpAdapter';
import { AcpApprovalStore } from '@/agent/acp/ApprovalStore';
import type { TMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { NavigationInterceptor } from '@/common/navigation';
import { uuid } from '@/common/utils';
import type { AcpResult, AcpSessionUpdate, ToolCallUpdate } from '@/types/acpTypes';
import { AcpErrorType, createAcpError } from '@/types/acpTypes';
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
  private pendingPermissions = new Map<string, { resolve: (response: { optionId: string }) => void; reject: (error: Error) => void }>();
  private statusMessageId: string | null = null;
  private pendingNavigationTools = new Set<string>();

  // Streaming message state - independent from AcpAdapter
  private currentStreamMsgId: string | null = null;
  private accumulatedAssistantText = '';

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

      if (token) {
        console.log('[OpenClawAgent] Using gateway auth token from config');
      } else if (password) {
        console.log('[OpenClawAgent] Using gateway auth password from config');
      }

      // Start gateway process if not using external
      if (!useExternal) {
        // If a gateway is already listening on the target port, don't try to spawn another one.
        // This avoids failures like "port already in use" when the user runs the Gateway service via launchd/systemd.
        const probeHost = host === 'localhost' ? '127.0.0.1' : host;
        const alreadyListening = await isTcpPortOpen(probeHost, port);
        if (alreadyListening) {
          console.log(`[OpenClawAgent] Gateway already listening on ${probeHost}:${port}, skip spawning`);
        } else {
          this.gatewayManager = new OpenClawGatewayManager({
            cliPath: gatewayConfig.cliPath || 'openclaw',
            port,
          });

          try {
            await this.gatewayManager.start();
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to start OpenClaw Gateway: ${errorMsg}`);
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
        console.log('[OpenClawAgent] Resumed session:', result.key);
        return;
      } catch (err) {
        console.warn('[OpenClawAgent] Failed to resume session, using default:', err);
      }
    }

    // Use "main" as default session key - OpenClaw will create it if needed
    const defaultKey = 'main';
    this.connection.sessionKey = defaultKey;
    console.log('[OpenClawAgent] Using default session key:', defaultKey);

    // Notify about session key
    if (defaultKey !== resumeKey) {
      this.onSessionKeyUpdate?.(defaultKey);
    }
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
        console.log('[OpenClawAgent] Gateway shutdown:', evt.payload);
        this.handleDisconnect('Gateway shutdown');
        break;

      // Ignore health and tick events
      case 'health':
      case 'tick':
        break;

      default:
        // Log unknown events for debugging
        console.log('[OpenClawAgent] Unhandled event:', evt.event, evt.payload);
    }
  }

  private handleChatEvent(event: ChatEvent): void {
    // Skip delta processing when handleAgentEvent is already handling the assistant stream
    // This prevents duplicate messages with different msg_ids
    if (event.state === 'delta' && this.currentStreamMsgId) {
      // Agent stream is active, skip to avoid duplicate content
      return;
    }

    // Convert to ACP session update format for adapter reuse
    if (event.state === 'delta' && event.message) {
      // Convert OpenClaw message format to ACP format
      const acpUpdate = this.convertToAcpFormat(event);
      if (acpUpdate) {
        const messages = this.adapter.convertSessionUpdate(acpUpdate);
        for (const message of messages) {
          this.emitMessage(message);
        }
      }
    } else if (event.state === 'final' || event.state === 'aborted') {
      // End of turn
      this.handleEndTurn();
    } else if (event.state === 'error') {
      this.emitErrorMessage(event.errorMessage || 'Unknown error');
      this.handleEndTurn();
    }
  }

  private handleAgentEvent(payload: unknown): void {
    // Convert agent events to messages
    const event = payload as { stream: string; data: Record<string, unknown>; runId?: string };

    // Map agent event streams to ACP update types
    if ((event.stream === 'assistant' || event.stream === 'message') && event.data) {
      // Use delta for streaming, fallback to text for full content
      const rawDelta = (event.data.delta as string) || (event.data.text as string);
      if (!rawDelta) return;

      // Initialize msg_id for this streaming session if not set
      if (!this.currentStreamMsgId) {
        this.currentStreamMsgId = uuid();
        this.accumulatedAssistantText = '';
      }

      // Heuristic: detect if rawDelta is cumulative text or incremental delta.
      // NOTE: This prefix-matching approach can misidentify incremental deltas as cumulative
      // if the delta content happens to start with the accumulated text. A protocol-level
      // indicator from the gateway would be more reliable.
      let actualDelta: string;
      const isCumulative = rawDelta.startsWith(this.accumulatedAssistantText) && this.accumulatedAssistantText.length > 0;

      if (isCumulative) {
        // OpenClaw returns cumulative text, extract only the new part
        actualDelta = rawDelta.substring(this.accumulatedAssistantText.length);
        this.accumulatedAssistantText = rawDelta;
      } else if (this.accumulatedAssistantText.length === 0) {
        // First chunk
        actualDelta = rawDelta;
        this.accumulatedAssistantText = rawDelta;
      } else {
        // True incremental delta
        actualDelta = rawDelta;
        this.accumulatedAssistantText += rawDelta;
      }

      if (!actualDelta) {
        return;
      }

      // Emit content directly with stable msg_id - bypass adapter
      this.onStreamEvent({
        type: 'content',
        conversation_id: this.id,
        msg_id: this.currentStreamMsgId!, // Non-null after initialization above
        data: actualDelta,
      });
    } else if ((event.stream === 'thinking' || event.stream === 'thought') && event.data) {
      const delta = (event.data.delta as string) || (event.data.text as string);
      if (!delta) return;

      // Emit thought as signal event (not persisted)
      if (this.onSignalEvent) {
        this.onSignalEvent({
          type: 'thought',
          conversation_id: this.id,
          msg_id: uuid(),
          data: { subject: 'Thinking', description: delta },
        });
      }
    } else if (event.stream === 'lifecycle') {
      // Handle lifecycle events (start/end)
      const phase = event.data.phase as string;
      if (phase === 'end') {
        this.handleEndTurn();
      }
    } else if (event.stream === 'tool_call') {
      // Handle tool calls
      const toolData = event.data as {
        toolCallId?: string;
        status?: string;
        title?: string;
        kind?: string;
        content?: unknown[];
      };

      const acpUpdate: ToolCallUpdate = {
        sessionId: this.id,
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: toolData.toolCallId || uuid(),
          status: (toolData.status as 'pending' | 'in_progress' | 'completed' | 'failed') || 'pending',
          title: toolData.title || 'Tool Call',
          kind: (toolData.kind as 'read' | 'edit' | 'execute') || 'execute',
          content: toolData.content as ToolCallUpdate['update']['content'],
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
      resolve: (response) => {
        console.log('[OpenClawAgent] Permission response:', response);
      },
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

  private handleHelloOk(hello: HelloOk): void {
    console.log('[OpenClawAgent] Connected to gateway:', hello.server.version);
  }

  private handleConnectError(err: Error): void {
    console.error('[OpenClawAgent] Connection error:', err);
    this.emitErrorMessage(`Connection error: ${err.message}`);
  }

  private handleClose(code: number, reason: string): void {
    console.log('[OpenClawAgent] Connection closed:', code, reason);
    this.handleDisconnect(reason);
  }

  private handleEndTurn(): void {
    // Reset streaming state for next turn
    this.currentStreamMsgId = null;
    this.accumulatedAssistantText = '';

    if (this.onSignalEvent) {
      this.onSignalEvent({
        type: 'finish',
        conversation_id: this.id,
        msg_id: uuid(),
        data: null,
      });
    }
  }

  private handleDisconnect(reason: string): void {
    this.emitStatusMessage('disconnected');
    this.emitErrorMessage(`Gateway disconnected: ${reason}`);

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
    this.statusMessageId = null;
  }

  /**
   * Convert OpenClaw chat event to ACP format for adapter reuse
   */
  private convertToAcpFormat(event: ChatEvent): AcpSessionUpdate | null {
    const message = event.message as {
      role?: string;
      content?: string | Array<{ type: string; text?: string }>;
    } | null;

    if (!message) return null;

    // Extract text content
    let text = '';
    if (typeof message.content === 'string') {
      text = message.content;
    } else if (Array.isArray(message.content)) {
      text = message.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text || '')
        .join('');
    }

    if (!text) return null;

    return {
      sessionId: event.sessionKey,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: {
          type: 'text',
          text,
        },
      },
    };
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

  private emitErrorMessage(error: string): void {
    const message: TMessage = {
      id: uuid(),
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
