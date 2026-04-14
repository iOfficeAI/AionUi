import type { IMessageText, TMessage } from '@/common/chat/chatLib';

const isStreamingAssistantTextMessage = (message: TMessage): message is IMessageText => {
  if (message.hidden || message.type !== 'text' || message.position !== 'left') {
    return false;
  }

  if (message.content.teammateMessage) {
    return false;
  }

  return typeof message.content.content === 'string' && message.content.content.trim().length > 0;
};

export const getStreamingAssistantTextMessageId = (
  messages: TMessage[],
  isStreamingContent: boolean | undefined
): string | undefined => {
  if (!isStreamingContent) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (isStreamingAssistantTextMessage(message)) {
      return message.id;
    }
  }

  return undefined;
};
