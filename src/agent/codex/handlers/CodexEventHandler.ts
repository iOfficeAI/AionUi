/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpPermissionRequest } from '@/common/acpTypes';
import { uuid } from '@/common/utils';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { ICodexMessageEmitter } from './CodexMessageEmitter';
import { CodexAgentEventType } from '@/common/codexTypes';
import type { ExecApprovalRequestData, AgentReasoningData, AgentReasoningDeltaData, BaseCodexEventData, PatchApprovalData, CodexAgentEvent, CodexEventParams } from '@/common/codexTypes';
import { CodexMessageProcessor } from './CodexMessageProcessor';
import { CodexToolHandlers } from './CodexToolHandlers';

// Extended permission request with additional UI fields for Codex
type ExtendedAcpPermissionRequest = Omit<AcpPermissionRequest, 'options'> & import('@/common/codexTypes').CodexPermissionRequest;

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

    // Handle exec approval requests
    if (type === CodexAgentEventType.EXEC_APPROVAL_REQUEST) {
      this.handleExecApprovalRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }>);
      return;
    }

    // Handle permission requests through unified transformMessage
    if (type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST || type === CodexAgentEventType.ELICITATION_CREATE) {
      this.handlePermissionRequest(evt as Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>);
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

    // Catch all unhandled events for debugging
    console.warn(`❌ [CodexAgentManager] Unhandled event type: "${type}"`, (evt as { data?: unknown }).data);
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

  private handleExecApprovalRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.EXEC_APPROVAL_REQUEST }>) {
    const eventData = evt.data as ExecApprovalRequestData;
    const callId = eventData.call_id || uuid();
    const uniqueRequestId = `exec_${callId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(uniqueRequestId)) {
      return;
    }

    this.toolHandlers.getPendingConfirmations().add(uniqueRequestId);

    // Create command approval request
    const standardMessage: IResponseMessage = {
      type: 'acp_permission',
      msg_id: uuid(),
      conversation_id: this.conversation_id,
      data: {
        title: 'Command Execution Permission',
        description: eventData.reason || `Codex wants to execute command: ${Array.isArray(eventData.command) ? eventData.command.join(' ') : eventData.command}`,
        agentType: 'codex',
        sessionId: '',
        options: [
          {
            optionId: 'allow_once',
            name: 'Allow',
            kind: 'allow_once' as const,
            description: 'Allow this command execution',
          },
          {
            optionId: 'reject_once',
            name: 'Reject',
            kind: 'reject_once' as const,
            description: 'Reject this command execution',
          },
        ],
        requestId: uniqueRequestId,
        toolCall: {
          title: 'Execute Command',
          toolCallId: uniqueRequestId,
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

  private handlePermissionRequest(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST } | { type: CodexAgentEventType.ELICITATION_CREATE }>) {
    const originalCallId = (evt.data as CodexEventParams)?.call_id || (evt.data as CodexEventParams)?.codex_call_id || uuid();
    const type = evt.type;

    // Create unique ID combining message type and call_id to match UI expectation
    const uniqueRequestId = type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST ? `patch_${originalCallId}` : `elicitation_${originalCallId}`;

    // Check if we've already processed this call_id to avoid duplicates
    if (this.toolHandlers.getPendingConfirmations().has(uniqueRequestId)) {
      return;
    }

    // Store patch changes for later execution
    if ((evt.data as CodexEventParams)?.changes || (evt.data as CodexEventParams)?.codex_changes) {
      this.toolHandlers.getPendingConfirmations().add(uniqueRequestId);

      // Store the actual changes for later application
      const changes = (evt.data as CodexEventParams)?.changes || (evt.data as CodexEventParams)?.codex_changes;
      if (changes) {
        this.toolHandlers.storePatchChanges(uniqueRequestId, changes);
      }
    }

    // Transform Codex-specific message to standard format before calling transformMessage
    const standardMessage = this.transformCodexPermissionToStandard(evt, uniqueRequestId);

    if (standardMessage) {
      this.messageEmitter.emitAndPersistMessage(standardMessage, true);
    }
  }

  private transformCodexPermissionToStandard(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST }> | Extract<CodexAgentEvent, { type: CodexAgentEventType.ELICITATION_CREATE }>, uniqueRequestId: string): IResponseMessage | null {
    const eventData = evt.type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST ? (evt.data as PatchApprovalData) : (evt.data as import('@/common/codexTypes').ElicitationCreateData);

    if (evt.type === CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST) {
      return {
        type: 'acp_permission',
        msg_id: uuid(),
        conversation_id: this.conversation_id,
        data: {
          title: 'File Write Permission',
          description: eventData.message || 'Codex wants to apply proposed code changes',
          agentType: 'codex',
          sessionId: '',
          options: [
            {
              optionId: 'allow_once',
              name: 'Allow',
              kind: 'allow_once' as const,
              description: 'Allow this file operation',
            },
            {
              optionId: 'reject_once',
              name: 'Reject',
              kind: 'reject_once' as const,
              description: 'Reject this file operation',
            },
          ],
          requestId: uniqueRequestId,
          toolCall: {
            title: 'Write File',
            toolCallId: uniqueRequestId,
            rawInput: {
              description: eventData.message,
            },
          },
        } as ExtendedAcpPermissionRequest,
      };
    }

    if (evt.type === CodexAgentEventType.ELICITATION_CREATE) {
      const elicitationData = eventData as import('@/common/codexTypes').ElicitationCreateData;

      // Handle file write permission requests
      if (elicitationData.codex_elicitation === 'file-write' || (elicitationData.message && elicitationData.message.toLowerCase().includes('write'))) {
        return {
          type: 'acp_permission',
          msg_id: uuid(),
          conversation_id: this.conversation_id,
          data: {
            title: 'File Write Permission',
            description: elicitationData.message || 'Codex wants to apply proposed code changes',
            agentType: 'codex',
            sessionId: '',
            options: [
              {
                optionId: 'allow_once',
                name: 'Allow',
                kind: 'allow_once' as const,
                description: 'Allow this file operation',
              },
              {
                optionId: 'reject_once',
                name: 'Reject',
                kind: 'reject_once' as const,
                description: 'Reject this file operation',
              },
            ],
            requestId: uniqueRequestId,
            toolCall: {
              title: 'Write File',
              toolCallId: uniqueRequestId,
              rawInput: {
                description: elicitationData.message,
              },
            },
          } as ExtendedAcpPermissionRequest,
        };
      }

      // Handle exec approval requests
      if (elicitationData.codex_elicitation === 'exec-approval') {
        return {
          type: 'acp_permission',
          msg_id: uuid(),
          conversation_id: this.conversation_id,
          data: {
            title: 'Command Execution Permission',
            description: elicitationData.message || 'Codex wants to execute a command',
            agentType: 'codex',
            sessionId: '',
            options: [
              {
                optionId: 'allow_once',
                name: 'Allow',
                kind: 'allow_once' as const,
                description: 'Allow this command execution',
              },
              {
                optionId: 'reject_once',
                name: 'Reject',
                kind: 'reject_once' as const,
                description: 'Reject this command execution',
              },
            ],
            requestId: uniqueRequestId,
            toolCall: {
              title: 'Execute Command',
              toolCallId: uniqueRequestId,
              rawInput: {
                command: Array.isArray(elicitationData.codex_command) ? elicitationData.codex_command.join(' ') : elicitationData.codex_command,
                cwd: elicitationData.codex_cwd,
                description: elicitationData.message,
              },
            },
          } as ExtendedAcpPermissionRequest,
        };
      }

      // Handle file read permission requests
      if (elicitationData.codex_elicitation === 'file-read' || (elicitationData.message && elicitationData.message.toLowerCase().includes('read'))) {
        return {
          type: 'acp_permission',
          msg_id: uuid(),
          conversation_id: this.conversation_id,
          data: {
            title: 'File Read Permission',
            description: elicitationData.message || 'Codex wants to read files from your workspace',
            agentType: 'codex',
            sessionId: '',
            options: [
              {
                optionId: 'allow_once',
                name: 'Allow',
                kind: 'allow_once' as const,
                description: 'Allow reading files',
              },
              {
                optionId: 'reject_once',
                name: 'Reject',
                kind: 'reject_once' as const,
                description: 'Reject file access',
              },
            ],
            requestId: uniqueRequestId,
            toolCall: {
              title: 'Read File',
              toolCallId: uniqueRequestId,
              rawInput: {
                description: elicitationData.message,
              },
            },
          } as ExtendedAcpPermissionRequest,
        };
      }

      // For other elicitation types, create a generic content message
      return {
        type: 'content',
        msg_id: uuid(),
        conversation_id: this.conversation_id,
        data: `Codex Elicitation: ${elicitationData.codex_elicitation} - ${elicitationData.message || 'No description'}`,
      };
    }

    return null;
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
