import type { TChatConversation } from '@/common/config/storage';

export const isConversationProcessing = (conversation?: Pick<TChatConversation, 'runtime' | 'status'> | null) => {
  return conversation?.runtime?.is_processing === true;
};
