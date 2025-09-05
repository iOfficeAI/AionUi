/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage, IMessageText, IMessageToolGroup } from '@/common/chatLib';
import type { AcpSessionUpdate, AcpBackend } from '../process/AcpConnection';
import { uuid } from '@/common/utils';

interface AcpMessage {
  type: 'assistant' | 'user' | 'tool_call' | 'tool_result' | 'thought';
  content: any;
  id?: string;
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
    if ('update' in sessionUpdate) {
      const update = (sessionUpdate as any).update;

      // Handle different update types
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
      }

      return messages;
    }

    // Handle the legacy format with messages array
    if (!sessionUpdate.messages) {
      return messages;
    }

    for (const acpMessage of sessionUpdate.messages) {
      const convertedMessage = this.convertSingleMessage(acpMessage);
      if (convertedMessage) {
        messages.push(convertedMessage);
      }
    }

    return messages;
  }

  /**
   * Convert ACP session update chunk to AionUI message
   */
  private convertSessionUpdateChunk(update: any): TMessage | null {
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
  private convertThoughtChunk(update: any): TMessage | null {
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
  private convertSingleMessage(acpMessage: AcpMessage): TMessage | null {
    const baseMessage = {
      id: acpMessage.id || uuid(),
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    switch (acpMessage.type) {
      case 'assistant':
        if (typeof acpMessage.content === 'string') {
          return {
            ...baseMessage,
            type: 'text',
            content: {
              content: acpMessage.content,
            },
          } as IMessageText;
        } else if (acpMessage.content.tool_calls) {
          // Handle tool calls from assistant
          return this.convertToolCalls(acpMessage.content.tool_calls, baseMessage);
        }
        break;

      case 'tool_call':
        return this.convertToolCall(acpMessage.content, baseMessage);

      case 'tool_result':
        return this.convertToolResult(acpMessage.content, baseMessage);

      case 'thought':
        // Convert thoughts to tips messages
        return {
          ...baseMessage,
          type: 'tips',
          position: 'center',
          content: {
            content: acpMessage.content,
            type: 'warning',
          },
        };

      case 'user':
        return {
          ...baseMessage,
          type: 'text',
          position: 'right',
          content: {
            content: acpMessage.content,
          },
        } as IMessageText;

      default:
        return null;
    }

    return null;
  }

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
  private convertToolCall(content: any, baseMessage: any): TMessage {
    const args = typeof content.arguments === 'string' ? this.parseToolArguments(content.arguments) : content.arguments || {};

    return {
      ...baseMessage,
      type: 'tool_call',
      content: {
        callId: content.id || uuid(),
        name: content.function?.name || content.name || 'unknown',
        args,
        status: 'success',
      },
    };
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
