/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { transformMessage } from '@/common/chatLib';
import type { IResponseMessage } from '@/common/ipcBridge';
import type { AcpPermissionRequest } from '@/common/acpTypes';
import { uuid } from '@/common/utils';
import { addOrUpdateMessage } from '../../message';
import { CodexAgentEventType } from '@/common/codexTypes';
import type { CodexAgentEvent } from '@/common/codexTypes';
import { CodexMessageProcessor } from './CodexMessageProcessor';
import { CodexToolHandlers } from './CodexToolHandlers';

// Extended permission request with additional UI fields for Codex
interface ExtendedAcpPermissionRequest extends Omit<AcpPermissionRequest, 'options'> {
  title?: string;
  description?: string;
  agentType?: string;
  requestId?: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
    description?: string;
  }>;
}

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
      this.toolHandlers.getPendingConfirmations().add(uniqueRequestId);
    }

    // Transform Codex-specific message to standard format before calling transformMessage
    const standardMessage = this.transformCodexPermissionToStandard(evt, uniqueRequestId);

    if (standardMessage) {
      const transformedMessage = transformMessage(standardMessage);
      addOrUpdateMessage(this.conversation_id, transformedMessage, true);
      ipcBridge.codexConversation.responseStream.emit(standardMessage);
    }
  }

  private transformCodexPermissionToStandard(evt: Extract<CodexAgentEvent, { type: CodexAgentEventType.APPLY_PATCH_APPROVAL_REQUEST } | { type: CodexAgentEventType.ELICITATION_CREATE }>, uniqueRequestId: string): IResponseMessage | null {
    const eventData = evt.data as any;

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
      const elicitationData = eventData;

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
