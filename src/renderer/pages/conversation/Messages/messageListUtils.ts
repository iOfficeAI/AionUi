import type { TMessage } from '@/common/chat/chatLib';

const NON_RENDERABLE_MESSAGE_TYPES = new Set<TMessage['type']>(['available_commands', 'codex_permission']);

export const shouldRenderMessageInList = (message: TMessage): boolean => {
  return !message.hidden && !NON_RENDERABLE_MESSAGE_TYPES.has(message.type);
};
