/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpPermissionRequest } from '@/common/acpTypes';
import { uuid } from '@/common/utils';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { ICodexMessageEmitter } from '@/agent/codex/messaging/CodexMessageEmitter';
import { CodexAgentEventType } from '@/common/codex/types';
import type { ExecApprovalRequestData, AgentReasoningData, AgentReasoningDeltaData, BaseCodexEventData, PatchApprovalData, CodexAgentEvent, CodexEventParams } from '@/common/codex/types';
import { CodexMessageProcessor } from '@/agent/codex/messaging/CodexMessageProcessor';
import { CodexToolHandlers } from '@/agent/codex/tools/CodexToolHandlers';
import { PermissionType } from '@/common/codex/types/permissionTypes';
import { createPermissionOptionsForType, getPermissionDisplayInfo } from '@/common/codex/utils';

// Extended permission request with additional UI fields for Codex
type ExtendedAcpPermissionRequest = Omit<AcpPermissionRequest, 'options'> & import('@/common/codex/types').CodexPermissionRequest;

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

  handleEvent(evt: CodexAgentEvent | { type: string; data: unknown }) {
    const type = evt.type;

    // Handle session and configuration events
    if (type === CodexAgentEventType.SESSION_CONFIGURED) {
      // These are informational events, no UI action needed
      return;
    }

    if (type === CodexAgentEventType.TASK_STARTED) {
      // These are informational events, no UI action needed
      return;
    }

    // Handle special message types that need custom processing
    if (type === CodexAgentEventType.AGENT_MESSAGE_DELTA) {
      this.messageProcessor.processMessageDelta(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_MESSAGE_DELTA }>);
      return;
    }

    if (type === CodexAgentEventType.AGENT_MESSAGE) {
      this.messageProcessor.processMessage(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_MESSAGE }>);
      // After processing the final agent message, automatically signal task completion
      this.messageProcessor.processTaskComplete();
      return;
    }

    if (type === CodexAgentEventType.TASK_COMPLETE) {
      this.messageProcessor.processTaskComplete();
      return;
    }

    // Handle reasoning deltas and reasoning messages - send them to UI for dynamic thinking display
    if (type === CodexAgentEventType.AGENT_REASONING_DELTA || type === CodexAgentEventType.AGENT_REASONING) {
      this.handleReasoningMessage(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING_DELTA } | { type: CodexAgentEventType.AGENT_REASONING }>);
      return;
    }

    // Handle reasoning section breaks - send them to UI for dynamic thinking display
    if (type === CodexAgentEventType.AGENT_REASONING_SECTION_BREAK) {
      this.handleReasoningMessage(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING_SECTION_BREAK }>);
      return;
    }

    // Handle token count events - could be useful for usage tracking
    if (type === CodexAgentEventType.TOKEN_COUNT) {
      // These are informational events for usage tracking
      return;
    }

    if (type === CodexAgentEventType.STREAM_ERROR) {
      this.messageProcessor.processStreamError(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.STREAM_ERROR }>);
      return;
    }

    // Handle generic error events from Codex CLI
    if (type === 'error') {
      this.messageProcessor.processGenericError(evt as { type: 'error'; data: { message?: string } | string });
      return;
    }

    // Tool: exec command
    if (type === CodexAgentEventType.EXEC_COMMAND_BEGIN) {
      this.toolHandlers.handleExecCommandBegin(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_BEGIN }>);
      return;
    }

    if (type === CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA) {
      this.toolHandlers.handleExecCommandOutputDelta(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_OUTPUT_DELTA }>);
      return;
    }

    if (type === CodexAgentEventType.EXEC_COMMAND_END) {
      this.toolHandlers.handleExecCommandEnd(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_COMMAND_END }>);
      return;
    }

    // Handle ALL permission-related requests through unified handler
    if (type === CodexAgentEventType.EXEC_APPROVAL_REQUEST || type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST || type === CodexAgentEventType.ELICITATION_CREATE) {
      this.handleUnifiedPermissionRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>);
      return;
    }

    // Tool: patch apply
    if (type === CodexAgentEventType.PATCH_APPLY_BEGIN) {
      this.toolHandlers.handlePatchApplyBegin(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_BEGIN }>);
      return;
    }

    if (type === CodexAgentEventType.PATCH_APPLY_END) {
      this.toolHandlers.handlePatchApplyEnd(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.PATCH_APPLY_END }>);
      return;
    }

    // Tool: mcp tool
    if (type === CodexAgentEventType.MCP_TOOL_CALL_BEGIN) {
      this.toolHandlers.handleMcpToolCallBegin(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_BEGIN }>);
      return;
    }

    if (type === CodexAgentEventType.MCP_TOOL_CALL_END) {
      this.toolHandlers.handleMcpToolCallEnd(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.MCP_TOOL_CALL_END }>);
      return;
    }

    // Tool: web search
    if (type === CodexAgentEventType.WEB_SEARCH_BEGIN) {
      this.toolHandlers.handleWebSearchBegin(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_BEGIN }>);
      return;
    }

    if (type === CodexAgentEventType.WEB_SEARCH_END) {
      this.toolHandlers.handleWebSearchEnd(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.WEB_SEARCH_END }>);
      return;
    }
  }

  private handleReasoningMessage(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING_DELTA }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.AGENT_REASONING_SECTION_BREAK }>) {
    const eventData = evt.data as AgentReasoningDeltaData | AgentReasoningData | BaseCodexEventData | undefined;

    // Create a standard message format for reasoning content
    const standardMessage: IResponseMessage = {
      type: evt.type,
      msg_id: uuid(),
      conversation_id: this.conversation_id,
      data: (eventData as AgentReasoningDeltaData)?.delta || (eventData as AgentReasoningData)?.text || eventData || '',
    };

    // Transform and persist message, then emit to UI
    this.messageEmitter.emitAndPersistMessage(standardMessage, true);
  }

  /**
   * Unified permission request handler to prevent duplicates
   * Handles both codex/event wrapped permissions and direct elicitation/create calls
   */
  private handleUnifiedPermissionRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>) {
    const type = evt.type;

    // Extract call_id from different event types
    let callId: string;
    if (type === CodexAgentEventType.EXEC_APPROVAL_REQUEST) {
      callId = (evt.data as ExecApprovalRequestData)?.call_id || uuid();
    } else if (type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST) {
      const patchData = evt.data as PatchApprovalData;
      callId = patchData?.call_id || (patchData as CodexEventParams)?.codex_call_id || uuid();
    } else {
      // ELICITATION_CREATE
      callId = (evt.data as import('@/common/codex/types').ElicitationCreateData)?.codex_call_id || uuid();
    }

    // Create unified unique ID using call_id only (ignoring message type)
    const unifiedRequestId = `permission_${callId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(unifiedRequestId)) {
      return;
    }

    // Mark this request as being processed
    this.toolHandlers.getPendingConfirmations().add(unifiedRequestId);

    // Route to appropriate handler based on event type
    if (type === CodexAgentEventType.EXEC_APPROVAL_REQUEST) {
      this.processExecApprovalRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }>, unifiedRequestId);
    } else if (type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST) {
      this.processApplyPatchRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }>, unifiedRequestId);
    } else {
      // ELICITATION_CREATE
      this.processElicitationRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>, unifiedRequestId);
    }
  }

  private processExecApprovalRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }>, unifiedRequestId: string) {
    const eventData = evt.data as ExecApprovalRequestData;
    const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
    const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);

    // Create command approval request
    const standardMessage: IResponseMessage = {
      type: 'acp_permission',
      msg_id: unifiedRequestId, // Use unified request ID to prevent duplicate messages
      conversation_id: this.conversation_id,
      data: {
        title: displayInfo.titleKey,
        description: eventData.reason || `${displayInfo.icon} Codex wants to execute command: ${Array.isArray(eventData.command) ? eventData.command.join(' ') : eventData.command}`,
        agentType: 'codex',
        sessionId: '',
        options: options,
        requestId: unifiedRequestId,
        toolCall: {
          title: 'Execute Command',
          toolCallId: unifiedRequestId,
          rawInput: {
            command: Array.isArray(eventData.command) ? eventData.command.join(' ') : eventData.command ? String(eventData.command) : undefined,
            cwd: eventData.cwd,
            reason: eventData.reason ?? undefined,
          },
        },
      } as ExtendedAcpPermissionRequest,
    };

    this.messageEmitter.emitAndPersistMessage(standardMessage, true);
  }

  private processApplyPatchRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }>, unifiedRequestId: string) {
    const eventData = evt.data as PatchApprovalData;
    const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_WRITE);
    const options = createPermissionOptionsForType(PermissionType.FILE_WRITE);

    // Store patch changes for later execution
    if (eventData?.changes || eventData?.codex_changes) {
      const changes = eventData?.changes || eventData?.codex_changes;
      if (changes) {
        this.toolHandlers.storePatchChanges(unifiedRequestId, changes);
      }
    }

    const standardMessage: IResponseMessage = {
      type: 'acp_permission',
      msg_id: unifiedRequestId,
      conversation_id: this.conversation_id,
      data: {
        title: displayInfo.titleKey,
        description: eventData.message || `${displayInfo.icon} Codex wants to apply proposed code changes`,
        agentType: 'codex',
        sessionId: '',
        options: options,
        requestId: unifiedRequestId,
        toolCall: {
          title: 'Write File',
          toolCallId: unifiedRequestId,
          rawInput: {
            description: eventData.message,
          },
        },
      } as ExtendedAcpPermissionRequest,
    };

    this.messageEmitter.emitAndPersistMessage(standardMessage, true);
  }

  private processElicitationRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>, unifiedRequestId: string) {
    const elicitationData = evt.data as import('@/common/codex/types').ElicitationCreateData;
    const elicitationType = elicitationData.codex_elicitation;

    // Handle different types of elicitations
    if (elicitationType === 'exec-approval') {
      const displayInfo = getPermissionDisplayInfo(PermissionType.COMMAND_EXECUTION);
      const options = createPermissionOptionsForType(PermissionType.COMMAND_EXECUTION);

      const standardMessage: IResponseMessage = {
        type: 'acp_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          title: displayInfo.titleKey,
          description: elicitationData.message || `${displayInfo.icon} Codex wants to execute a command`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: unifiedRequestId,
          toolCall: {
            title: 'Execute Command',
            toolCallId: unifiedRequestId,
            rawInput: {
              command: Array.isArray(elicitationData.codex_command) ? elicitationData.codex_command.join(' ') : elicitationData.codex_command,
              cwd: elicitationData.codex_cwd,
              description: elicitationData.message,
            },
          },
        } as any,
      };

      this.messageEmitter.emitAndPersistMessage(standardMessage, true);
    } else if (elicitationType === 'file-write' || (elicitationData.message && elicitationData.message.toLowerCase().includes('write'))) {
      // Handle file write permission requests
      const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_WRITE);
      const options = createPermissionOptionsForType(PermissionType.FILE_WRITE);

      const standardMessage: IResponseMessage = {
        type: 'acp_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          title: displayInfo.titleKey,
          description: elicitationData.message || `${displayInfo.icon} Codex wants to apply proposed code changes`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: unifiedRequestId,
          toolCall: {
            title: 'Write File',
            toolCallId: unifiedRequestId,
            rawInput: {
              description: elicitationData.message,
            },
          },
        } as any,
      };

      this.messageEmitter.emitAndPersistMessage(standardMessage, true);
    } else if (elicitationType === 'file-read' || (elicitationData.message && elicitationData.message.toLowerCase().includes('read'))) {
      // Handle file read permission requests
      const displayInfo = getPermissionDisplayInfo(PermissionType.FILE_READ);
      const options = createPermissionOptionsForType(PermissionType.FILE_READ);

      const standardMessage: IResponseMessage = {
        type: 'acp_permission',
        msg_id: unifiedRequestId,
        conversation_id: this.conversation_id,
        data: {
          title: displayInfo.titleKey,
          description: elicitationData.message || `${displayInfo.icon} Codex wants to read files from your workspace`,
          agentType: 'codex',
          sessionId: '',
          options: options,
          requestId: unifiedRequestId,
          toolCall: {
            title: 'Read File',
            toolCallId: unifiedRequestId,
            rawInput: {
              description: elicitationData.message,
            },
          },
        } as any,
      };

      this.messageEmitter.emitAndPersistMessage(standardMessage, true);
    } else {
      // For other elicitation types, create a generic content message (not a permission)
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
