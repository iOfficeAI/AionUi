import type { TChatConversation } from '@/common/config/storage';

const LEGACY_READ_ONLY_CONVERSATION_TYPES = new Set(['openclaw-gateway', 'nanobot', 'remote', 'gemini', 'codex']);

export const isConversationProcessing = (conversation?: Pick<TChatConversation, 'runtime' | 'status'> | null) => {
  return conversation?.runtime?.is_processing === true;
};

export const isLegacyReadOnlyConversationType = (type?: string | null) => {
  return Boolean(type && LEGACY_READ_ONLY_CONVERSATION_TYPES.has(type));
};
