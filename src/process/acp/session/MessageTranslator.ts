// src/process/acp/session/MessageTranslator.ts
import type { TMessage } from '@/common/chat/chatLib';
import type { SessionNotification } from '../types';

const CONFIG_UPDATES = new Set(['current_mode_update', 'config_option_update', 'session_info_update', 'usage_update']);

type MessageEntry = {
  messageId: string;
  accumulatedText: string;
  type: string;
};

export class MessageTranslator {
  private messageMap = new Map<string, MessageEntry>();

  get activeEntryCount(): number {
    return this.messageMap.size;
  }

  translate(notification: SessionNotification): TMessage[] {
    const update = notification.update;
    const updateType = update.sessionUpdate;

    if (CONFIG_UPDATES.has(updateType)) return [];

    switch (updateType) {
      case 'agent_message_chunk':
        return this.handleAgentMessageChunk(update);
      case 'agent_thought_chunk':
        return this.handleThoughtChunk(update);
      case 'tool_call':
        return this.handleToolCall(update);
      case 'tool_call_update':
        return this.handleToolCallUpdate(update);
      case 'plan':
        return this.handlePlan(update);
      case 'available_commands_update':
        return this.handleAvailableCommands(update);
      case 'user_message_chunk':
        return [];
      default:
        return [];
    }
  }

  onTurnEnd(): void {
    this.messageMap.clear();
  }

  reset(): void {
    this.messageMap.clear();
  }

  private handleAgentMessageChunk(update: Record<string, unknown>): TMessage[] {
    const messageId = (update.messageId as string) ?? 'default';
    const text = (update.text as string) ?? '';

    let entry = this.messageMap.get(messageId);
    if (!entry) {
      entry = { messageId, accumulatedText: '', type: 'text' };
      this.messageMap.set(messageId, entry);
    }
    entry.accumulatedText += text;

    return [
      {
        id: messageId,
        msg_id: messageId,
        type: 'text',
        content: { text: entry.accumulatedText },
        position: 'left',
        status: 'work',
      } as unknown as TMessage,
    ];
  }

  private handleThoughtChunk(update: Record<string, unknown>): TMessage[] {
    const messageId = `thought-${(update.messageId as string) ?? 'default'}`;
    const text = (update.text as string) ?? '';

    let entry = this.messageMap.get(messageId);
    if (!entry) {
      entry = { messageId, accumulatedText: '', type: 'thinking' };
      this.messageMap.set(messageId, entry);
    }
    entry.accumulatedText += text;

    return [
      {
        id: messageId,
        msg_id: messageId,
        type: 'thinking',
        content: { text: entry.accumulatedText },
        position: 'left',
        status: 'work',
      } as unknown as TMessage,
    ];
  }

  private handleToolCall(update: Record<string, unknown>): TMessage[] {
    const toolCallId = (update.toolCallId as string) ?? crypto.randomUUID();
    return [
      {
        id: toolCallId,
        msg_id: toolCallId,
        type: 'acpToolCall',
        content: {
          toolCallId,
          name: update.name ?? 'unknown',
          input: update.input,
        },
        position: 'left',
        status: 'work',
      } as unknown as TMessage,
    ];
  }

  private handleToolCallUpdate(update: Record<string, unknown>): TMessage[] {
    const toolCallId = (update.toolCallId as string) ?? '';
    return [
      {
        id: toolCallId,
        msg_id: toolCallId,
        type: 'acpToolCall',
        content: {
          toolCallId,
          name: update.name ?? 'unknown',
          output: update.output,
          status: update.status,
        },
        position: 'left',
        status: (update.status as string) === 'completed' ? 'finish' : 'work',
      } as unknown as TMessage,
    ];
  }

  private handlePlan(update: Record<string, unknown>): TMessage[] {
    return [
      {
        id: crypto.randomUUID(),
        msg_id: crypto.randomUUID(),
        type: 'plan',
        content: update,
        position: 'left',
        status: 'finish',
      } as unknown as TMessage,
    ];
  }

  private handleAvailableCommands(update: Record<string, unknown>): TMessage[] {
    return [
      {
        id: crypto.randomUUID(),
        msg_id: crypto.randomUUID(),
        type: 'availableCommands',
        content: update,
        position: 'left',
        status: 'finish',
      } as unknown as TMessage,
    ];
  }
}
