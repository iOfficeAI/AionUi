/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { uuid } from '@/common/utils';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import type { CodexEventMsg, CodexJsonRpcEvent } from '@/common/codex/types';
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

    //agent_reasoning 因为有 agent_reasoning_delta，所以忽略
    if (type === 'agent_reasoning') {
      return;
    }

    // agent_message 是完整消息，用于最终持久化（但不发送到前端，避免重复显示）
    if (type === 'agent_message') {
      this.messageProcessor.processFinalMessage(msg);
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

    if (this.isMessageType(msg, 'exec_command_begin')) {
      this.toolHandlers.handleExecCommandBegin(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_output_delta')) {
      this.toolHandlers.handleExecCommandOutputDelta(msg);
      return;
    }

    if (this.isMessageType(msg, 'exec_command_end')) {
      this.toolHandlers.handleExecCommandEnd(msg);
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

    // Tool: turn diff
    if (this.isMessageType(msg, 'turn_diff')) {
      this.toolHandlers.handleTurnDiff(msg);
      return;
    }
  }

  /**
   * Unified permission request handler to prevent duplicates
   */
  private handleUnifiedPermissionRequest(msg: Extract<CodexEventMsg, { type: 'exec_approval_request' }> | Extract<CodexEventMsg, { type: 'apply_patch_approval_request' }>) {
    // Extract call_id - both types have this field
    const callId = msg.call_id || uuid();
    const unifiedRequestId = `permission_${callId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(unifiedRequestId)) {
      return;
    }

    // Mark this request as being processed
    this.toolHandlers.getPendingConfirmations().add(unifiedRequestId);

    // Route to appropriate handler based on event type
    if (msg.type === 'exec_approval_request') {
      this.processExecApprovalRequest(msg, unifiedRequestId);
    } else {
      this.processApplyPatchRequest(msg, unifiedRequestId);
    }
  }

  private processExecApprovalRequest(
    msg: Extract<
      CodexEventMsg,
      {
        type: 'exec_approval_request';
      }
    >,
    unifiedRequestId: string
  ) {
    const callId = msg.call_id || uuid();

    const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
    const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);

    // 权限请求需要持久化
    this.messageEmitter.emitAndPersistMessage(
      {
        type: 'codex_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          subtype: 'exec_approval_request',
          title: displayInfo.titleKey,
          description: msg.reason || `${displayInfo.icon} Codex wants to execute command: ${Array.isArray(msg.command) ? msg.command.join(' ') : msg.command}`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          data: msg, // 直接使用原始事件数据
        },
      },
      true
    );
  }

  private processApplyPatchRequest(
    msg: Extract<
      CodexEventMsg,
      {
        type: 'apply_patch_approval_request';
      }
    >,
    unifiedRequestId: string
  ) {
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
          subtype: 'apply_patch_approval_request',
          title: displayInfo.titleKey,
          description: msg.message || `${displayInfo.icon} Codex wants to apply proposed code changes`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: callId,
          data: msg, // 直接使用原始事件数据
        },
      },
      true
    );
  }

  // Expose tool handlers for external access
  getToolHandlers(): CodexToolHandlers {
    return this.toolHandlers;
  }

  // Expose message processor for external access
  getMessageProcessor(): CodexMessageProcessor {
    return this.messageProcessor;
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
