import type { IMessageText, TMessage } from '@/common/chatLib';
import { ipcBridge } from '@/common';
import type { TChatConversation } from '@/common/storage';

const MAX_TEXT_MESSAGES = 12;
const MAX_SINGLE_MESSAGE_CHARS = 600;
const MAX_TRANSCRIPT_CHARS = 5000;

const normalizeText = (value?: string): string => value?.replace(/\s+/g, ' ').trim() || '';

const truncateText = (value: string, maxLength: number): string => {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const isTextMessage = (message: TMessage): message is IMessageText => message.type === 'text' && typeof message.content?.content === 'string';

const getMessageRoleLabel = (message: IMessageText): string => (message.position === 'right' ? '用户' : '助手');

const buildTranscript = (messages: TMessage[]): string => {
  const textMessages = messages.filter(isTextMessage);
  if (textMessages.length === 0) {
    return '';
  }

  const selectedMessages: string[] = [];
  let totalChars = 0;

  for (let index = textMessages.length - 1; index >= 0; index -= 1) {
    const message = textMessages[index];
    const normalized = normalizeText(message.content.content);
    if (!normalized) {
      continue;
    }

    const line = `${getMessageRoleLabel(message)}：${truncateText(normalized, MAX_SINGLE_MESSAGE_CHARS)}`;
    const projectedChars = totalChars + line.length;

    if (selectedMessages.length > 0 && projectedChars > MAX_TRANSCRIPT_CHARS) {
      break;
    }

    selectedMessages.unshift(line);
    totalChars = projectedChars;

    if (selectedMessages.length >= MAX_TEXT_MESSAGES) {
      break;
    }
  }

  return selectedMessages.join('\n\n');
};

export async function buildConversationHandoffMessage(options: { sourceConversationId: string; latestUserMessage?: string }): Promise<string> {
  const { sourceConversationId, latestUserMessage } = options;
  const normalizedLatestUserMessage = normalizeText(latestUserMessage);

  const [conversation, messages] = await Promise.all([ipcBridge.conversation.get.invoke({ id: sourceConversationId }).catch((): undefined => undefined), ipcBridge.database.getConversationMessages.invoke({ conversation_id: sourceConversationId, page: 0, pageSize: 200 }).catch(() => [] as TMessage[])]);

  const transcript = buildTranscript(messages);

  if (!transcript) {
    return normalizedLatestUserMessage;
  }

  const sourceConversation = conversation as TChatConversation | undefined;
  const sourceConversationLabel = normalizeText(sourceConversation?.name);

  return ['请继续接手当前任务。下面是从上一段会话继承的上下文，请直接基于这些背景继续工作。', normalizedLatestUserMessage ? `用户当前还希望继续处理的内容：\n${normalizedLatestUserMessage}` : '如果我没有补充新的要求，请延续下面的目标和上下文继续。', sourceConversationLabel ? `[来源会话]\n${sourceConversationLabel}` : '', '[最近对话上下文]', transcript].filter(Boolean).join('\n\n');
}

export function persistInitialConversationMessage(conversation: Pick<TChatConversation, 'id' | 'type'>, message: { input: string; files?: string[] }): void {
  const normalizedInput = normalizeText(message.input);
  if (!normalizedInput) {
    return;
  }

  const payload = JSON.stringify({
    input: normalizedInput,
    files: message.files && message.files.length > 0 ? message.files : undefined,
  });

  switch (conversation.type) {
    case 'gemini':
      sessionStorage.setItem(`gemini_initial_message_${conversation.id}`, payload);
      break;
    case 'codex':
      sessionStorage.setItem(`codex_initial_message_${conversation.id}`, payload);
      break;
    case 'openclaw-gateway':
      sessionStorage.setItem(`openclaw_initial_message_${conversation.id}`, payload);
      break;
    case 'nanobot':
      sessionStorage.setItem(`nanobot_initial_message_${conversation.id}`, payload);
      break;
    case 'acp':
    default:
      sessionStorage.setItem(`acp_initial_message_${conversation.id}`, payload);
      break;
  }
}
