/**
 * Message adapter: converts IResponseMessage from WebSocket to TMessage for UI.
 * This is a simplified port of src/common/chatLib.ts transformMessage + composeMessage.
 * We avoid importing chatLib directly to avoid potential Metro resolution issues
 * with its import chain. Instead, we replicate the core logic.
 */

import { uuid } from './uuid';

// Simplified TMessage types for mobile rendering
export type TMessageType =
  | 'text'
  | 'tips'
  | 'tool_call'
  | 'tool_group'
  | 'agent_status'
  | 'acp_permission'
  | 'acp_tool_call'
  | 'codex_permission'
  | 'codex_tool_call'
  | 'plan';

export type TMessage = {
  id: string;
  msg_id?: string;
  conversation_id: string;
  type: TMessageType;
  content: any;
  createdAt?: number;
  position?: 'left' | 'right' | 'center' | 'pop';
  status?: 'finish' | 'pending' | 'error' | 'work';
};

export type IResponseMessage = {
  type: string;
  data: unknown;
  msg_id: string;
  conversation_id: string;
};

/**
 * Transform a raw WebSocket IResponseMessage into a renderable TMessage.
 */
export function transformMessage(message: IResponseMessage): TMessage | undefined {
  switch (message.type) {
    case 'error':
      return {
        id: uuid(),
        type: 'tips',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: { content: message.data as string, type: 'error' },
      };

    case 'content':
    case 'user_content': {
      const data = message.data;
      const isRich = typeof data === 'object' && data !== null && 'content' in data;
      return {
        id: uuid(),
        type: 'text',
        msg_id: message.msg_id,
        position: message.type === 'content' ? 'left' : 'right',
        conversation_id: message.conversation_id,
        content: isRich ? { content: (data as any).content } : { content: data as string },
      };
    }

    case 'tool_call':
      return {
        id: uuid(),
        type: 'tool_call',
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        position: 'left',
        content: message.data,
      };

    case 'tool_group':
      return {
        id: uuid(),
        type: 'tool_group',
        msg_id: message.msg_id,
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'agent_status':
      return {
        id: uuid(),
        type: 'agent_status',
        msg_id: message.msg_id,
        position: 'center',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'acp_permission':
      return {
        id: uuid(),
        type: 'acp_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'acp_tool_call':
      return {
        id: uuid(),
        type: 'acp_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'codex_permission':
      return {
        id: uuid(),
        type: 'codex_permission',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'codex_tool_call':
      return {
        id: uuid(),
        type: 'codex_tool_call',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    case 'plan':
      return {
        id: uuid(),
        type: 'plan',
        msg_id: message.msg_id,
        position: 'left',
        conversation_id: message.conversation_id,
        content: message.data,
      };

    // Ignored types (same as chatLib.ts)
    case 'thought':
    case 'start':
    case 'finish':
    case 'system':
    case 'acp_model_info':
    case 'codex_model_info':
    case 'acp_context_usage':
    case 'request_trace':
    case 'available_commands':
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Compose/merge a new message into the message list.
 * Handles streaming text concatenation and tool call merging.
 */
export function composeMessage(message: TMessage | undefined, list: TMessage[]): TMessage[] {
  if (!message) return list;
  if (!list.length) return [message];

  const last = list[list.length - 1];

  // Tool group merging by callId
  if (message.type === 'tool_group' && Array.isArray(message.content)) {
    const remainingMap = new Map(message.content.map((t: any) => [t.callId, t]));
    if (remainingMap.size === 0) return list;

    let didUpdate = false;
    const updatedList = list.map((existingMsg) => {
      if (existingMsg.type !== 'tool_group' || !Array.isArray(existingMsg.content)) return existingMsg;

      let merged = false;
      const newContent = existingMsg.content.map((tool: any) => {
        const update = remainingMap.get(tool.callId);
        if (!update) return tool;
        merged = true;
        remainingMap.delete(tool.callId);
        return { ...tool, ...update };
      });

      if (!merged) return existingMsg;
      didUpdate = true;
      return { ...existingMsg, content: newContent };
    });

    const base = didUpdate ? updatedList : list;
    if (remainingMap.size > 0) {
      return [...base, { ...message, content: Array.from(remainingMap.values()) }];
    }
    return didUpdate ? base : list;
  }

  // Tool call merging by callId
  if (message.type === 'tool_call') {
    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (msg.type === 'tool_call' && msg.content.callId === message.content.callId) {
        const updated = [...list];
        updated[i] = { ...msg, content: { ...msg.content, ...message.content } };
        return updated;
      }
    }
    return [...list, message];
  }

  // Codex/ACP tool call merging
  if (message.type === 'codex_tool_call') {
    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (msg.type === 'codex_tool_call' && msg.content.toolCallId === message.content.toolCallId) {
        const updated = [...list];
        updated[i] = { ...msg, content: { ...msg.content, ...message.content } };
        return updated;
      }
    }
    return [...list, message];
  }

  if (message.type === 'acp_tool_call') {
    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (msg.type === 'acp_tool_call' && msg.content.update?.toolCallId === message.content.update?.toolCallId) {
        const updated = [...list];
        updated[i] = { ...msg, content: { ...msg.content, ...message.content } };
        return updated;
      }
    }
    return [...list, message];
  }

  // Plan merging by sessionId
  if (message.type === 'plan') {
    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (msg.type === 'plan' && msg.content.sessionId === message.content.sessionId) {
        const updated = [...list];
        updated[i] = { ...msg, content: { ...msg.content, ...message.content } };
        return updated;
      }
    }
    return [...list, message];
  }

  // Text streaming: concat if same msg_id and type
  if (last.msg_id !== message.msg_id || last.type !== message.type) {
    return [...list, message];
  }

  if (message.type === 'text' && last.type === 'text') {
    const merged = {
      ...last,
      ...message,
      id: last.id,
      content: {
        ...message.content,
        content: last.content.content + message.content.content,
      },
    };
    const updated = [...list];
    updated[updated.length - 1] = merged;
    return updated;
  }

  const updated = [...list];
  updated[updated.length - 1] = { ...last, ...message, id: last.id };
  return updated;
}
