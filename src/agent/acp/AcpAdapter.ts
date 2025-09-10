/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText, IMessageToolCall, IMessageToolGroup, TMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import type { AcpBackend } from '@/common/acpTypes';

export const JSONRPC_VERSION = '2.0' as const;

export interface AcpRequest {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  method: string;
  params?: any;
}

export interface AcpResponse {
  jsonrpc: typeof JSONRPC_VERSION;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
  };
}

export interface AcpNotification {
  jsonrpc: typeof JSONRPC_VERSION;
  method: string;
  params?: any;
}

export type AcpMessage = AcpRequest | AcpNotification | AcpResponse | AcpSessionUpdate;

// Base interface for all session updates
interface BaseSessionUpdate {
  sessionId: string;
}

// Agent message chunk update
interface AgentMessageChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_message_chunk';
    content: {
      type: 'text' | 'image';
      text?: string;
      data?: string;
      mimeType?: string;
      uri?: string;
    };
  };
}

// Agent thought chunk update
interface AgentThoughtChunkUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'agent_thought_chunk';
    content: {
      type: 'text';
      text: string;
    };
  };
}

// Tool call update
interface ToolCallUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call';
    toolCallId: string;
    status: 'pending' | 'in_progress';
    title: string;
    kind: 'read' | 'edit' | 'execute';
    rawInput?: any;
    content?: Array<{
      type: 'content' | 'diff';
      content?: {
        type: 'text';
        text: string;
      };
      path?: string;
      oldText?: string | null;
      newText?: string;
    }>;
    locations?: Array<{
      path: string;
    }>;
  };
}

// Tool call update (status change)
interface ToolCallUpdateStatus extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'tool_call_update';
    toolCallId: string;
    status: 'completed' | 'failed';
    content?: Array<{
      type: 'content';
      content: {
        type: 'text';
        text: string;
      };
    }>;
  };
}

// Plan update
interface PlanUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'plan';
    entries: Array<{
      content: string;
      status: 'pending' | 'in_progress' | 'completed';
      priority?: 'low' | 'medium' | 'high';
    }>;
  };
}

// Available commands update
interface AvailableCommandsUpdate extends BaseSessionUpdate {
  update: {
    sessionUpdate: 'available_commands_update';
    availableCommands: Array<{
      name: string;
      description: string;
      input?: {
        hint?: string;
      } | null;
    }>;
  };
}

// Union type for all session updates
export type AcpSessionUpdate = AgentMessageChunkUpdate | AgentThoughtChunkUpdate | ToolCallUpdate | ToolCallUpdateStatus | PlanUpdate | AvailableCommandsUpdate;

export interface AcpPermissionRequest {
  sessionId: string;
  options: Array<{
    optionId: string;
    name: string;
    kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always';
    // 以下字段为向后兼容，不是官方协议标准
    description?: string;
    title?: string;
  }>;
  toolCall: {
    toolCallId: string;
    status: string;
    title: string;
    kind: string;
  };
}

interface AcpToolCall {
  id: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface AcpToolResult {
  toolCallId: string;
  output: string;
  success?: boolean;
}

/**
 * Adapter class to convert ACP messages to AionUI message format
 */
export class AcpAdapter {
  private conversationId: string;
  private backend: AcpBackend;

  constructor(conversationId: string, backend: AcpBackend) {
    this.conversationId = conversationId;
    this.backend = backend;
  }

  /**
   * Convert ACP session update to AionUI messages
   */
  convertSessionUpdate(sessionUpdate: AcpSessionUpdate): TMessage[] {
    const messages: TMessage[] = [];
    // Handle the new session update format from Gemini ACP
    const update = sessionUpdate.update;
    if (update.sessionUpdate === 'agent_message_chunk' && update.content) {
      const message = this.convertSessionUpdateChunk(update);
      if (message) {
        messages.push(message);
      }
    } else if (update.sessionUpdate === 'agent_thought_chunk' && update.content) {
      const message = this.convertThoughtChunk(update);
      if (message) {
        messages.push(message);
      }
    } else if (update.sessionUpdate === 'tool_call') {
      const message = this.convertToolCall(sessionUpdate as ToolCallUpdate);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  }

  /**
   * Convert ACP session update chunk to AionUI message
   */
  private convertSessionUpdateChunk(update: AgentMessageChunkUpdate['update']): TMessage | null {
    const baseMessage = {
      id: uuid(),
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    if (update.content && update.content.text) {
      return {
        ...baseMessage,
        type: 'text',
        content: {
          content: update.content.text,
        },
      } as IMessageText;
    }

    return null;
  }

  /**
   * Convert ACP thought chunk to AionUI message
   */
  private convertThoughtChunk(update: AgentThoughtChunkUpdate['update']): TMessage | null {
    const baseMessage = {
      id: uuid(),
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'center' as const,
    };

    if (update.content && update.content.text) {
      return {
        ...baseMessage,
        type: 'tips',
        content: {
          content: update.content.text,
          type: 'warning',
        },
      };
    }

    return null;
  }

  /**
   * Convert a single ACP message to AionUI message format
   */
  // private convertSingleMessage(acpMessage: AcpMessage): TMessage | null {
  //   const baseMessage = {
  //     id: acpMessage.id || uuid(),
  //     conversation_id: this.conversationId,
  //     createdAt: Date.now(),
  //     position: 'left' as const,
  //   };
  //
  //   switch (acpMessage.type) {
  //     case 'assistant':
  //       if (typeof acpMessage.content === 'string') {
  //         return {
  //           ...baseMessage,
  //           type: 'text',
  //           content: {
  //             content: acpMessage.content,
  //           },
  //         } as IMessageText;
  //       } else if (acpMessage.content.tool_calls) {
  //         // Handle tool calls from assistant
  //         return this.convertToolCalls(acpMessage.content.tool_calls, baseMessage);
  //       }
  //       break;
  //
  //     case 'tool_call':
  //       return this.convertToolCall(acpMessage.content, baseMessage);
  //
  //     case 'tool_result':
  //       return this.convertToolResult(acpMessage.content, baseMessage);
  //
  //     case 'thought':
  //       // Convert thoughts to tips messages
  //       return {
  //         ...baseMessage,
  //         type: 'tips',
  //         position: 'center',
  //         content: {
  //           content: acpMessage.content,
  //           type: 'warning',
  //         },
  //       };
  //
  //     case 'user':
  //       return {
  //         ...baseMessage,
  //         type: 'text',
  //         position: 'right',
  //         content: {
  //           content: acpMessage.content,
  //         },
  //       } as IMessageText;
  //
  //     default:
  //       return null;
  //   }
  //
  //   return null;
  // }

  /**
   * Convert ACP tool calls to AionUI tool_group message
   */
  private convertToolCalls(toolCalls: AcpToolCall[], baseMessage: any): IMessageToolGroup {
    const tools = toolCalls.map((toolCall) => {
      return {
        callId: toolCall.id,
        description: `Calling ${toolCall.function.name}`,
        name: this.mapToolName(toolCall.function.name),
        renderOutputAsMarkdown: true,
        status: 'Executing' as const,
      };
    });

    return {
      ...baseMessage,
      type: 'tool_group',
      content: tools,
    };
  }

  /**
   * Convert ACP single tool call to AionUI tool_call message
   */
  private convertToolCall(content: ToolCallUpdate): TMessage {
    const baseMessage = {
      id: uuid(),
      conversation_id: this.conversationId,
      position: 'left' as const,
    };
    return {
      ...baseMessage,
      type: 'tool_call',
      content: {
        callId: content.update.toolCallId,
        name: content.update.kind,
        status: content,
      },
    } as unknown as IMessageToolCall;
  }

  /**
   * Convert ACP tool result to update existing tool_group message
   */
  private convertToolResult(content: AcpToolResult, baseMessage: any): TMessage | null {
    // For tool results, we typically want to update an existing tool_group message
    // rather than create a new message. This would need to be handled by the caller
    // who maintains the message list state.

    return {
      ...baseMessage,
      type: 'tool_group',
      content: [
        {
          callId: content.toolCallId,
          description: 'Tool execution result',
          name: 'Shell' as const,
          renderOutputAsMarkdown: true,
          status: content.success !== false ? ('Success' as const) : ('Error' as const),
          resultDisplay: content.output,
        },
      ],
    };
  }

  /**
   * Map ACP tool names to AionUI tool names
   */
  private mapToolName(acpToolName: string): IMessageToolGroup['content'][0]['name'] {
    const toolNameMap: Record<string, IMessageToolGroup['content'][0]['name']> = {
      bash: 'Shell',
      shell: 'Shell',
      write_file: 'WriteFile',
      read_file: 'ReadFile',
      edit_file: 'WriteFile',
      search: 'GoogleSearch',
      web_search: 'GoogleSearch',
      generate_image: 'ImageGeneration',
      create_image: 'ImageGeneration',
    };

    return toolNameMap[acpToolName.toLowerCase()] || 'Shell';
  }

  /**
   * Parse tool arguments from string or return as-is if already parsed
   */
  private parseToolArguments(args: string | object): Record<string, any> {
    if (typeof args === 'string') {
      try {
        return JSON.parse(args);
      } catch (error) {
        return { raw: args };
      }
    }
    return args as Record<string, any>;
  }

  /**
   * Update the conversation ID for this adapter
   */
  updateConversationId(conversationId: string): void {
    this.conversationId = conversationId;
  }

  /**
   * Update the backend for this adapter
   */
  updateBackend(backend: AcpBackend): void {
    this.backend = backend;
  }

  /**
   * Get backend-specific message formatting
   */
  getBackendSpecificFormatting(message: TMessage): TMessage {
    // Apply any backend-specific formatting
    switch (this.backend) {
      case 'claude':
        return this.formatForClaude(message);
      case 'gemini':
        return this.formatForGemini(message);
      default:
        return message;
    }
  }

  private formatForClaude(message: TMessage): TMessage {
    // Claude-specific message formatting
    if (message.type === 'text' && message.position === 'left') {
      // Add Claude branding or specific styling
      return {
        ...message,
        content: {
          ...message.content,
          content: message.content.content,
        },
      };
    }
    return message;
  }

  private formatForGemini(message: TMessage): TMessage {
    // Gemini-specific message formatting
    if (message.type === 'text' && message.position === 'left') {
      // Add Gemini branding or specific styling
      return {
        ...message,
        content: {
          ...message.content,
          content: message.content.content,
        },
      };
    }
    return message;
  }
}
