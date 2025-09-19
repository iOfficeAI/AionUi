/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import { uuid } from '@/common/utils';
import { addOrUpdateMessage } from '../../message';
import { CodexAgentEventType } from '@/common/codexTypes';
import type { CodexAgentEvent } from '@/common/codexTypes';
import { CodexMessageProcessor } from './CodexMessageProcessor';
import { CodexToolHandlers } from './CodexToolHandlers';

export class CodexEventHandler {
  private messageProcessor: CodexMessageProcessor;
  private toolHandlers: CodexToolHandlers;

  constructor(private conversation_id: string) {
    this.messageProcessor = new CodexMessageProcessor(conversation_id);
    this.toolHandlers = new CodexToolHandlers(conversation_id);
  }

  handleEvent(evt: CodexAgentEvent) {
    const type = evt.type;

    // Handle special message types that need custom processing
    if (type === CodexAgentEventType.AGENT_MESSAGE_DELTA) {
      this.messageProcessor.processMessageDelta(evt);
      return;
    }

    if (type === CodexAgentEventType.AGENT_MESSAGE) {
      this.messageProcessor.processMessage(evt);
      return;
    }

    if (type === CodexAgentEventType.TASK_COMPLETE) {
      this.messageProcessor.processTaskComplete();
      return;
    }

    // Handle reasoning deltas and reasoning messages - ignore them as they're internal Codex thoughts
    if (type === CodexAgentEventType.AGENT_REASONING_DELTA || type === CodexAgentEventType.AGENT_REASONING) {
      // These are Codex's internal reasoning steps, not user-facing content
      return;
    }

    if (type === CodexAgentEventType.STREAM_ERROR) {
      this.messageProcessor.processStreamError(evt);
      return;
    }

    // Tool: exec command
    if (type === CodexAgentEventType.EXEC_COMMAND_BEGIN) {
      this.toolHandlers.handleExecCommandBegin(evt);
      return;
    }

    if (type === CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA) {
      this.toolHandlers.handleExecCommandOutputDelta(evt);
      return;
    }

    if (type === CodexAgentEventType.EXEC_COMMAND_END) {
      this.toolHandlers.handleExecCommandEnd(evt);
      return;
    }

    // Handle permission requests through unified transformMessage
    if (type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST || type === CodexAgentEventType.ELICITATION_CREATE) {
      this.handlePermissionRequest(evt);
      return;
    }

    // Tool: patch apply
    if (type === CodexAgentEventType.PATCH_APPLY_BEGIN) {
      this.toolHandlers.handlePatchApplyBegin(evt);
      return;
    }

    if (type === CodexAgentEventType.PATCH_APPLY_END) {
      this.toolHandlers.handlePatchApplyEnd(evt);
      return;
    }

    // Tool: mcp tool
    if (type === CodexAgentEventType.MCP_TOOL_CALL_BEGIN) {
      this.toolHandlers.handleMcpToolCallBegin(evt);
      return;
    }

    if (type === CodexAgentEventType.MCP_TOOL_CALL_END) {
      this.toolHandlers.handleMcpToolCallEnd(evt);
      return;
    }

    // Tool: web search
    if (type === CodexAgentEventType.WEB_SEARCH_BEGIN) {
      this.toolHandlers.handleWebSearchBegin(evt);
      return;
    }

    if (type === CodexAgentEventType.WEB_SEARCH_END) {
      this.toolHandlers.handleWebSearchEnd(evt);
      return;
    }

    // Catch all unhandled events for debugging
    console.warn(`❌ [CodexAgentManager] Unhandled event type: "${type}"`, (evt as any).data);
  }

  private handlePermissionRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST } | { type: CodexAgentEventType.ELICITATION_CREATE }>) {
    const originalCallId = evt.data?.call_id || evt.data?.codex_call_id || uuid();
    const type = evt.type;

    // Create unique ID combining message type and call_id to match UI expectation
    const uniqueRequestId = type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST ? `patch_${originalCallId}` : `elicitation_${originalCallId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(uniqueRequestId)) {
      return;
    }

    // Store patch changes for later execution
    if (evt.data?.changes || evt.data?.codex_changes) {
      // Store with unique ID for both permission handling and MCP connection
      // Keep original ID mapping for MCP resolvePermission call
      // Note: We would need to expose these methods or handle them differently
      // this.patchChanges.set(uniqueRequestId, changes);
      // this.patchBuffers.set(uniqueRequestId, this.summarizePatch(changes));
      this.toolHandlers.getPendingConfirmations().add(uniqueRequestId);
    }

    // Use unified transformMessage to handle the message
    const responseMessage: IResponseMessage = {
      type: type,
      data: evt.data,
      msg_id: uuid(),
      conversation_id: this.conversation_id,
    };

    const transformedMessage = transformMessage(responseMessage);

    if (transformedMessage) {
      addOrUpdateMessage(this.conversation_id, transformedMessage, true); // 立即保存权限消息
      // Send the transformed message with correct type to UI
      const uiMessage: IResponseMessage = {
        type: transformedMessage.type as any,
        data: transformedMessage.content,
        msg_id: transformedMessage.msg_id || responseMessage.msg_id,
        conversation_id: this.conversation_id,
      };
      ipcBridge.codexConversation.responseStream.emit(uiMessage);
    }
  }

  // Expose tool handlers for external access
  getToolHandlers(): CodexToolHandlers {
    return this.toolHandlers;
  }

  cleanup() {
    this.messageProcessor.cleanup();
    this.toolHandlers.cleanup();
  }
}
