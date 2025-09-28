/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import type { CodexJsonRpcEvent, CodexEventMsg } from '@/common/codex/types';
import { CodexAgentEventType } from '@/common/codex/types';
import { CodexMessageProcessor } from '@/agent/codex/messaging/CodexMessageProcessor';
import { CodexToolHandlers } from '@/agent/codex/handlers/CodexToolHandlers';
import { PermissionType } from '@/common/codex/types/permissionTypes';
import { createPermissionOptionsForType, getPermissionDisplayInfo } from '@/common/codex/utils';

export class CodexEventHandler {
  private messageProcessor: CodexMessageProcessor;
  private toolHandlers: CodexToolHandlers;
  private messageEmitter: ICodexMessageEmitter;

  constructor(
    private conversation_id: string,
    messageEmitter: ICodexMessageEmitter
  ) {
    this.messageEmitter = messageEmitter;
    this.messageProcessor = new CodexMessageProcessor(conversation_id, messageEmitter);
    this.toolHandlers = new CodexToolHandlers(conversation_id, messageEmitter);
  }

  handleEvent(evt: CodexJsonRpcEvent) {
    return this.processCodexEvent(evt.params.msg);
  }

  private processCodexEvent(msg: CodexEventMsg) {
    const type = msg.type;

    //这两类消息因为有delta 类型数据，所以直接忽略。
    if (type === 'agent_reasoning' || type === 'agent_message') {
      return;
    }
    if (type === 'session_configured' || type === 'token_count') {
      return;
    }

    if (type === 'task_started') {
      this.messageProcessor.processTaskStart();
      return;
    }
    if (type === 'task_complete') {
      this.messageProcessor.processTaskComplete();
      return;
    }

    // Handle special message types that need custom processing
    if (this.isMessageType(msg, 'agent_message_delta')) {
      this.messageProcessor.processMessageDelta(msg);
      return;
    }

    // Handle reasoning deltas and reasoning messages - send them to UI for dynamic thinking display
    if (this.isMessageType(msg, 'agent_reasoning_delta')) {
      this.messageProcessor.handleReasoningMessage(msg);
      return;
    }

    if (this.isMessageType(msg, 'agent_reasoning_section_break')) {
      // 思考过程中断了
      this.messageProcessor.processReasonSectionBreak();
      return;
    }

    if (this.isMessageType(msg, 'stream_error')) {
      this.messageProcessor.processStreamError(msg);
      return;
    }

    // Note: Generic error events are now handled as stream_error type

    // Handle ALL permission-related requests through unified handler
    if (this.isMessageType(msg, 'exec_approval_request') || this.isMessageType(msg, 'apply_patch_approval_request')) {
      this.handleUnifiedPermissionRequest(msg);
      return;
    }

    // Tool: patch apply
    if (this.isMessageType(msg, 'patch_apply_begin')) {
      this.toolHandlers.handlePatchApplyBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'patch_apply_end')) {
      this.toolHandlers.handlePatchApplyEnd(msg);
      return;
    }

    if (type === 'elicitation/create') {
      return;
    }

    if (this.isMessageType(msg, 'exec_command_begin')) {
      this.toolHandlers.handleExecCommandBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_output_delta')) {
      this.toolHandlers.handleExecCommandOutputDelta(msg);
      return;
    }

    // Tool: mcp tool
    if (this.isMessageType(msg, 'mcp_tool_call_begin')) {
      this.toolHandlers.handleMcpToolCallBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'mcp_tool_call_end')) {
      this.toolHandlers.handleMcpToolCallEnd(msg);
      return;
    }

    // Tool: web search
    if (this.isMessageType(msg, 'web_search_begin')) {
      this.toolHandlers.handleWebSearchBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'web_search_end')) {
      this.toolHandlers.handleWebSearchEnd(msg);
      return;
    }
  }

  /**
   * Unified permission request handler to prevent duplicates
   * Handles both codex/event wrapped permissions and direct elicitation/create calls
   */
  private handleUnifiedPermissionRequest(msg: Extract<CodexEventMsg, { type: 'exec_approval_request' }> | Extract<CodexEventMsg, { type: 'apply_patch_approval_request' }> | Extract<CodexEventMsg, { type: 'elicitation/create' }>) {
    const type = msg.type;

    // Extract call_id from different event types - TypeScript will narrow the type automatically
    let callId: string;
    if (type === 'exec_approval_request') {
      callId = msg.call_id || uuid();
    } else if (type === 'apply_patch_approval_request') {
      callId = msg.call_id || uuid();
    } else {
      // ELICITATION_CREATE
      callId = msg.codex_call_id || uuid();
    }

    // Create unified unique ID using call_id only (ignoring message type)
    const unifiedRequestId = `permission_${callId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(unifiedRequestId)) {
      return;
    }

    // Mark this request as being processed
    this.toolHandlers.getPendingConfirmations().add(unifiedRequestId);

    // Route to appropriate handler based on event type (async processing)
    // TypeScript automatically narrows the type in each branch
    if (type === 'exec_approval_request') {
      // 请求批准命令执行
      this.processExecApprovalRequest(msg, unifiedRequestId).catch(console.error);
    } else if (type === 'apply_patch_approval_request') {
      // 请求批准应用代码补丁
      this.processApplyPatchRequest(msg, unifiedRequestId).catch(console.error);
    } else {
      // 请求批准启发式操作
      this.processElicitationRequest(msg, unifiedRequestId).catch(console.error);
    }
  }

  private async processExecApprovalRequest(msg: Extract<CodexEventMsg, { type: 'exec_approval_request' }>, unifiedRequestId: string) {
    const callId = msg.call_id || uuid();

    const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
    const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);

    // 权限请求需要持久化
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'codex_permission',
        msg_id: unifiedRequestId, // Use unified request ID to prevent duplicate messages
        conversation_id: this.conversation_id,
        data: {
          title: displayInfo.titleKey,
          description: msg.reason || `${displayInfo.icon} Codex wants to execute command: ${Array.isArray(msg.command) ? msg.command.join(' ') : msg.command}`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          toolCall: {
            title: 'Execute Command',
            toolCallId: callId, // Use actual call_id instead of unifiedRequestId
            kind: 'execute',
            rawInput: {
              command: Array.isArray(msg.command) ? msg.command.join(' ') : msg.command ? String(msg.command) : undefined,
              cwd: msg.cwd,
              reason: msg.reason ?? undefined,
            },
          },
        },
      },
      true
    );
  }

  private async processApplyPatchRequest(msg: Extract<CodexEventMsg, { type: 'apply_patch_approval_request' }>, unifiedRequestId: string) {
    const callId = msg.call_id || uuid();

    const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_WRITE);
    const options = createPermissionOptionsForType(PermissionType.FILE_WRITE);

    // Store patch changes for later execution
    if (msg?.changes || msg?.codex_changes) {
      const changes = msg?.changes || msg?.codex_changes;
      if (changes) {
        this.toolHandlers.storePatchChanges(unifiedRequestId, changes);
      }
    }

    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'codex_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          title: displayInfo.titleKey,
          description: msg.message || `${displayInfo.icon} Codex wants to apply proposed code changes`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          toolCall: {
            title: 'Write File',
            toolCallId: callId, // Use actual call_id instead of unifiedRequestId
            kind: 'write',
            rawInput: {
              description: msg.message,
            },
          },
        },
      },
      true
    );
  }

  private async processElicitationRequest(msg: Extract<CodexEventMsg, { type: 'elicitation/create' }>, unifiedRequestId: string) {
    const elicitationType = msg.codex_elicitation;
    const callId = msg.codex_call_id || uuid();

    // Handle different types of elicitations
    if (elicitationType === 'exec-approval') {
      const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
      const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);

      this.messageEmitter.emitAndPersistMessage(
        {
          type: 'codex_permission',
          msg_id: unifiedRequestId,
          conversation_id: this.conversation_id,
          data: {
            title: displayInfo.titleKey,
            description: msg.message || `${displayInfo.icon} Codex wants to execute a command`,
            agentType: 'codex',
            sessionId: '',
            options: options,
            requestId: callId,
            toolCall: {
              title: 'Execute Command',
              toolCallId: callId, // Use actual call_id instead of unifiedRequestId
              kind: 'execute',
              rawInput: {
                command: Array.isArray(msg.codex_command) ? msg.codex_command.join(' ') : msg.codex_command,
                cwd: msg.codex_cwd,
                description: msg.message,
              },
            },
          },
        },
        true
      );
    } else if (elicitationType === 'file-write' || (msg.message && msg.message.toLowerCase().includes('write'))) {
      // Handle file write permission requests
      const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_WRITE);
      const options = createPermissionOptionsForType(PermissionType.FILE_WRITE);

      this.messageEmitter.emitAndPersistMessage(
        {
          type: 'codex_permission',
          msg_id: unifiedRequestId,
          conversation_id: this.conversation_id,
          data: {
            title: displayInfo.titleKey,
            description: msg.message || `${displayInfo.icon} Codex wants to apply proposed code changes`,
            agentType: 'codex',
            sessionId: '',
            options: options,
            requestId: callId,
            toolCall: {
              title: 'Write File',
              toolCallId: callId, // Use actual call_id instead of unifiedRequestId
              kind: 'write',
              rawInput: {
                description: msg.message,
              },
            },
          },
        },
        true
      );
    } else if (elicitationType === 'file-read' || (msg.message && msg.message.toLowerCase().includes('read'))) {
      // Handle file read permission requests
      const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_READ);
      const options = createPermissionOptionsForType(PermissionType.FILE_READ);

      this.messageEmitter.emitAndPersistMessage(
        {
          type: 'codex_permission',
          msg_id: unifiedRequestId,
          conversation_id: this.conversation_id,
          data: {
            title: displayInfo.titleKey,
            description: msg.message || `${displayInfo.icon} Codex wants to read files from your workspace`,
            agentType: 'codex',
            sessionId: '',
            options: options,
            requestId: callId,
            toolCall: {
              title: 'Read File',
              toolCallId: callId, // Use actual call_id instead of unifiedRequestId
              kind: 'read',
              rawInput: {
                description: msg.message,
              },
            },
          },
        },
        true
      );
    } else {
      // For other elicitation types, create a generic content message (not a permission)
    }
  }

  // Expose tool handlers for external access
  getToolHandlers(): CodexToolHandlers {
    return this.toolHandlers;
  }

  // Type guard functions for intelligent type inference
  private isMessageType<T extends CodexEventMsg['type']>(
    msg: CodexEventMsg,
    messageType: T
  ): msg is Extract<
    CodexEventMsg,
    {
      type: T;
    }
  > {
    return msg.type === messageType;
  }

  cleanup() {
    this.messageProcessor.cleanup();
    this.toolHandlers.cleanup();
  }
}
