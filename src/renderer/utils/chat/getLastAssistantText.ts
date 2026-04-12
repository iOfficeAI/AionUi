import type { IMessageText, TMessage } from '@/common/chat/chatLib';
import { stripThinkTags } from '@/renderer/utils/chat/thinkTagFilter';

const isCopyableAssistantText = (message: TMessage): message is IMessageText => {
  return message.type === 'text' && message.position === 'left' && !message.hidden;
};

const stripSkillSuggestPreserveWhitespace = (content: string): string => {
  return content.replace(/\[SKILL_SUGGEST\][\s\S]*?\[\/SKILL_SUGGEST\]/gi, '').replace(/\n{3,}/g, '\n\n');
};

const sanitizeAssistantText = (content: string): string => {
  return stripSkillSuggestPreserveWhitespace(stripThinkTags(content));
};

export const getLastAssistantText = (messageList: TMessage[], loading: boolean): string | null => {
  if (loading) {
    return null;
  }

  for (let index = messageList.length - 1; index >= 0; index -= 1) {
    const message = messageList[index];
    if (!isCopyableAssistantText(message)) {
      continue;
    }

    const sanitizedContent = sanitizeAssistantText(message.content.content);
    if (sanitizedContent.trim()) {
      return sanitizedContent;
    }
  }

  return null;
};
