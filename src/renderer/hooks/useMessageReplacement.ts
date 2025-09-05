/**
 * Hook for handling message replacement (loading -> actual content)
 * This provides a cleaner API than the current inline implementation
 */

import { useCallback } from 'react';
import { useUpdateMessageList } from '@/renderer/messages/hooks';
import type { TMessage } from '@/common/chatLib';

export const useMessageReplacement = () => {
  const updateMessageList = useUpdateMessageList();

  const replaceMessage = useCallback(
    (targetMessageId: string, newContent: string, clearStatus = true) => {
      updateMessageList((list: TMessage[]) => {
        let found = false;

        const newList = list.map((msg: TMessage) => {
          if (msg.id === targetMessageId) {
            found = true;
            return {
              ...msg,
              content: {
                content: newContent,
              },
              status: clearStatus ? undefined : msg.status,
            } as TMessage;
          }
          return msg;
        });

        if (!found) {
          console.warn('[MessageReplacement] Target message not found:', targetMessageId);
        }

        return newList;
      });
    },
    [updateMessageList]
  );

  const appendToMessage = useCallback(
    (targetMessageId: string, additionalContent: string) => {
      updateMessageList((list: TMessage[]) => {
        return list.map((msg: TMessage) => {
          if (msg.id === targetMessageId && msg.type === 'text') {
            return {
              ...msg,
              content: {
                content: (msg.content as any).content + additionalContent,
              },
            } as TMessage;
          }
          return msg;
        });
      });
    },
    [updateMessageList]
  );

  return {
    replaceMessage,
    appendToMessage,
  };
};

/**
 * Usage example:
 *
 * const { replaceMessage } = useMessageReplacement();
 *
 * // In message handler:
 * if (message.isLoadingReplacement) {
 *   replaceMessage(message.msg_id, message.data);
 * }
 */
