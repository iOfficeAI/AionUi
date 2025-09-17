/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IMessageText, IMessageToolCall, IMessageToolGroup, IMessageAcpToolCall, TMessage } from '@/common/chatLib';
import { uuid } from '@/common/utils';
import type { AcpBackend, AcpSessionUpdate, ToolCallUpdateStatus, AgentMessageChunkUpdate, AgentThoughtChunkUpdate, PlanUpdate, AvailableCommandsUpdate, ToolCallUpdate } from '@/common/acpTypes';

/**
 * Adapter class to convert ACP messages to AionUI message format
 */
export class AcpAdapter {
  private conversationId: string;
  private backend: AcpBackend;
  private activeToolCalls: Map<string, IMessageAcpToolCall> = new Map();

  constructor(conversationId: string, backend: AcpBackend) {
    this.conversationId = conversationId;
    this.backend = backend;
  }

  /**
   * Convert ACP session update to AionUI messages
   */
  convertSessionUpdate(sessionUpdate: AcpSessionUpdate): TMessage[] {
    const messages: TMessage[] = [];
    const update = sessionUpdate.update;

    switch (update.sessionUpdate) {
      case 'agent_message_chunk': {
        if (update.content) {
          const message = this.convertSessionUpdateChunk(update);
          if (message) {
            messages.push(message);
          }
        }
        break;
      }

      case 'agent_thought_chunk': {
        if (update.content) {
          const message = this.convertThoughtChunk(update);
          if (message) {
            messages.push(message);
          }
        }
        break;
      }

      case 'tool_call': {
        const toolCallMessage = this.createOrUpdateAcpToolCall(sessionUpdate as ToolCallUpdate);
        if (toolCallMessage) {
          messages.push(toolCallMessage);
        }
        break;
      }

      case 'tool_call_update': {
        const toolCallUpdateMessage = this.updateAcpToolCall(sessionUpdate as ToolCallUpdateStatus);
        if (toolCallUpdateMessage) {
          messages.push(toolCallUpdateMessage);
        }
        break;
      }

      case 'plan': {
        const planMessage = this.convertPlanUpdate(sessionUpdate as PlanUpdate);
        if (planMessage) {
          messages.push(planMessage);
        }
        break;
      }

      case 'available_commands_update': {
        const commandsMessage = this.convertAvailableCommandsUpdate(sessionUpdate as AvailableCommandsUpdate);
        if (commandsMessage) {
          messages.push(commandsMessage);
        }
        break;
      }

      default:
        console.warn('Unknown session update type:', (update as any).sessionUpdate);
        break;
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

  private createOrUpdateAcpToolCall(update: ToolCallUpdate): IMessageAcpToolCall | null {
    const toolCallId = update.update.toolCallId;

    // 使用 toolCallId 作为 msg_id，确保同一个工具调用的消息可以被合并
    const baseMessage = {
      id: uuid(),
      msg_id: toolCallId, // 关键：使用 toolCallId 作为 msg_id
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    const acpToolCallMessage: IMessageAcpToolCall = {
      ...baseMessage,
      type: 'acp_tool_call',
      content: update, // 直接使用 ToolCallUpdate 作为 content
    };

    this.activeToolCalls.set(toolCallId, acpToolCallMessage);
    return acpToolCallMessage;
  }

  /**
   * Update existing ACP tool call message
   * Returns the updated message with the same msg_id so composeMessage can merge it
   */
  private updateAcpToolCall(update: ToolCallUpdateStatus): IMessageAcpToolCall | null {
    const toolCallData = update.update;
    const toolCallId = toolCallData.toolCallId;

    // Get existing message
    const existingMessage = this.activeToolCalls.get(toolCallId);
    if (!existingMessage) {
      console.warn(`No existing tool call found for ID: ${toolCallId}`);
      return null;
    }

    // Update the ToolCallUpdate content with new status and content
    const updatedContent: ToolCallUpdate = {
      ...existingMessage.content,
      update: {
        ...existingMessage.content.update,
        status: toolCallData.status,
        content: toolCallData.content ? [...(existingMessage.content.update.content || []), ...toolCallData.content] : existingMessage.content.update.content,
      },
    };

    // Create updated message with the SAME msg_id so composeMessage will merge it
    const updatedMessage: IMessageAcpToolCall = {
      ...existingMessage,
      msg_id: toolCallId, // 确保 msg_id 一致，这样 composeMessage 会合并消息
      content: updatedContent,
      createdAt: Date.now(), // 更新时间戳
    };

    // Update stored message
    this.activeToolCalls.set(toolCallId, updatedMessage);

    // Clean up completed/failed tool calls after a delay to prevent memory leaks
    if (toolCallData.status === 'completed' || toolCallData.status === 'failed') {
      setTimeout(() => {
        this.activeToolCalls.delete(toolCallId);
      }, 60000); // Clean up after 1 minute
    }

    // Return the updated message with same msg_id - composeMessage will merge it with existing
    return updatedMessage;
  }

  private convertToolCallUpdate(update: ToolCallUpdateStatus): TMessage | null {
    const baseMessage = {
      id: uuid(),
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    const toolCallData = update.update;

    // Create IMessageToolCall for tool call status updates
    return {
      ...baseMessage,
      type: 'tool_call',
      content: {
        callId: toolCallData.toolCallId,
        name: 'Unknown', // We don't have the original tool name in the update
        args: {}, // We don't have the original args in the update
        status: toolCallData.status === 'completed' ? 'success' : 'error',
        error: toolCallData.status === 'failed' ? 'Tool call failed' : undefined,
      },
    } as IMessageToolCall;
  }

  /**
   * Convert plan update to AionUI message
   */
  private convertPlanUpdate(update: PlanUpdate): TMessage | null {
    const baseMessage = {
      id: uuid(),
      msg_id: uuid(), // 生成独立的 msg_id，避免与其他消息合并
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    const planData = update.update;
    if (planData.entries && planData.entries.length > 0) {
      const planContent = planData.entries
        .map((entry) => {
          const statusIcon = entry.status === 'completed' ? '✅' : entry.status === 'in_progress' ? '🔄' : '⏳';
          const priority = entry.priority ? ` [${entry.priority.toUpperCase()}]` : '';
          return `${statusIcon} ${entry.content}${priority}`;
        })
        .join('\n');

      return {
        ...baseMessage,
        type: 'text',
        content: {
          content: `📋 **Plan Update**\n\n${planContent}`,
        },
      } as IMessageText;
    }

    return null;
  }

  /**
   * Convert available commands update to AionUI message
   */
  private convertAvailableCommandsUpdate(update: AvailableCommandsUpdate): TMessage | null {
    const baseMessage = {
      id: uuid(),
      msg_id: uuid(), // 生成独立的 msg_id，避免与其他消息合并
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    const commandsData = update.update;
    if (commandsData.availableCommands && commandsData.availableCommands.length > 0) {
      const commandsList = commandsData.availableCommands
        .map((command) => {
          let line = `• **${command.name}**: ${command.description}`;
          if (command.input?.hint) {
            line += ` (${command.input.hint})`;
          }
          return line;
        })
        .join('\n');

      return {
        ...baseMessage,
        type: 'text',
        content: {
          content: `🛠️ **Available Commands**\n\n${commandsList}`,
        },
      } as IMessageText;
    }

    return null;
  }

  /**
   * Convert ACP tool call to AionUI tool_call message
   */
  private convertToolCall(update: ToolCallUpdate): TMessage {
    const baseMessage = {
      id: uuid(),
      conversation_id: this.conversationId,
      createdAt: Date.now(),
      position: 'left' as const,
    };

    const toolCallData = update.update;

    // Map ACP kind to MessageToolCall compatible name
    const toolName = this.mapAcpKindToToolName(toolCallData.kind);

    // Extract and prepare arguments for MessageToolCall
    const args = this.prepareToolArgs(toolCallData);

    // Determine status based on tool call status
    let status: 'success' | 'error' | undefined;
    switch (toolCallData.status) {
      case 'pending':
      case 'in_progress':
        status = undefined; // Still processing
        break;
      default:
        status = undefined; // Will be updated by ToolCallUpdateStatus
        break;
    }

    return {
      ...baseMessage,
      type: 'tool_call',
      content: {
        callId: toolCallData.toolCallId,
        name: toolName,
        args: args,
        status: status,
      },
    } as IMessageToolCall;
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
   * Map ACP tool kind to AionUI tool names
   */
  private mapToolKindToName(kind: string): IMessageToolGroup['content'][0]['name'] {
    const kindMap: Record<string, IMessageToolGroup['content'][0]['name']> = {
      read: 'ReadFile',
      edit: 'WriteFile',
      execute: 'Shell',
    };

    return kindMap[kind.toLowerCase()] || 'Shell';
  }

  /**
   * Map ACP kind to MessageToolCall compatible tool names
   */
  private mapAcpKindToToolName(kind: string): string {
    const kindMap: Record<string, string> = {
      read: 'read_file',
      edit: 'write_file',
      execute: 'run_shell_command',
    };

    return kindMap[kind.toLowerCase()] || kind;
  }

  /**
   * Prepare tool arguments for MessageToolCall component
   */
  private prepareToolArgs(toolCallData: ToolCallUpdate['update']): Record<string, any> {
    const args: Record<string, any> = {};

    // Extract arguments from rawInput
    if (toolCallData.rawInput) {
      Object.assign(args, toolCallData.rawInput);
    }

    // Extract file path from locations
    if (toolCallData.locations && toolCallData.locations.length > 0) {
      args.file_path = toolCallData.locations[0].path;
      args.absolute_path = toolCallData.locations[0].path;
    }

    // Extract content for diff display
    if (toolCallData.content && toolCallData.content.length > 0) {
      const contentItem = toolCallData.content[0];
      if (contentItem.type === 'diff') {
        args.old_string = contentItem.oldText || '';
        args.new_string = contentItem.newText || '';
        if (contentItem.path) {
          args.file_path = contentItem.path;
        }
      } else if (contentItem.content?.text) {
        args.description = contentItem.content.text;
      }
    }

    // Add title as description if available
    if (toolCallData.title) {
      args.description = args.description || toolCallData.title;
    }

    return args;
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
}
