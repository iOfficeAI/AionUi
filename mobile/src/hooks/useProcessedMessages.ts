import { useMemo } from 'react';
import type { TMessage, TMessageType } from '../utils/messageAdapter';

export type ToolSummaryVO = {
  type: 'tool_summary';
  id: string;
  messages: TMessage[];
};

export type ProcessedItem = TMessage | ToolSummaryVO;

const TOOL_CALL_TYPES: Set<TMessageType> = new Set(['tool_call', 'tool_group', 'acp_tool_call', 'codex_tool_call']);

export function isToolCallType(type: TMessageType): boolean {
  return TOOL_CALL_TYPES.has(type);
}

export function isGroupComplete(messages: TMessage[]): boolean {
  return messages.every((msg) => {
    if (msg.type === 'tool_group' && Array.isArray(msg.content)) {
      return msg.content.every((t: any) => t.status === 'Success' || t.status === 'Error' || t.status === 'Canceled');
    }
    if (msg.type === 'tool_call') {
      const s = msg.content?.status;
      return s === 'success' || s === 'error' || s === 'canceled';
    }
    if (msg.type === 'acp_tool_call') {
      const s = msg.content?.update?.status;
      return s === 'completed' || s === 'failed';
    }
    if (msg.type === 'codex_tool_call') {
      const s = msg.content?.status;
      return s === 'success' || s === 'error' || s === 'canceled';
    }
    return true;
  });
}

export function countSteps(messages: TMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    if (msg.type === 'tool_group' && Array.isArray(msg.content)) {
      count += msg.content.length;
    } else {
      count += 1;
    }
  }
  return count;
}

export function countErrors(messages: TMessage[]): number {
  let count = 0;
  for (const msg of messages) {
    if (msg.type === 'tool_group' && Array.isArray(msg.content)) {
      count += msg.content.filter((t: any) => t.status === 'Error').length;
    } else if (msg.type === 'tool_call') {
      if (msg.content?.status === 'error') count++;
    } else if (msg.type === 'acp_tool_call') {
      if (msg.content?.update?.status === 'failed') count++;
    } else if (msg.type === 'codex_tool_call') {
      if (msg.content?.status === 'error') count++;
    }
  }
  return count;
}

export function getCurrentStepName(messages: TMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.type === 'tool_group' && Array.isArray(msg.content)) {
      for (let j = msg.content.length - 1; j >= 0; j--) {
        const t = msg.content[j];
        if (t.status === 'Executing') return t.description || t.name || '';
      }
    } else if (msg.type === 'tool_call') {
      if (msg.content?.status !== 'success' && msg.content?.status !== 'error') {
        return msg.content?.name || '';
      }
    } else if (msg.type === 'acp_tool_call') {
      if (msg.content?.update?.status === 'in_progress') {
        return msg.content?.update?.title || msg.content?.update?.kind || '';
      }
    } else if (msg.type === 'codex_tool_call') {
      if (msg.content?.status !== 'success' && msg.content?.status !== 'error') {
        return msg.content?.title || msg.content?.description || '';
      }
    }
  }
  return '';
}

export function useProcessedMessages(messages: TMessage[]): ProcessedItem[] {
  return useMemo(() => {
    const result: ProcessedItem[] = [];
    let toolBatch: TMessage[] = [];

    const flushBatch = () => {
      if (toolBatch.length === 0) return;
      const id = toolBatch.map((m) => m.id).join('-');
      result.push({ type: 'tool_summary', id, messages: toolBatch });
      toolBatch = [];
    };

    for (const msg of messages) {
      if (isToolCallType(msg.type)) {
        toolBatch.push(msg);
      } else {
        flushBatch();
        result.push(msg);
      }
    }
    flushBatch();

    return result;
  }, [messages]);
}
