import { TChatConversation } from '@/common/storage';
import { useCallback } from 'react';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';

type Draft =
  | {
      _type: 'gemini';
      content: string;
      atPath: string[];
      uploadFile: string[];
    }
  | {
      _type: 'claude';
      content: unknown;
    };

/**
 * 当前支持的对话类型以及对应的草稿对象
 */
type SendBoxDraftStore = {
  [K in TChatConversation['type']]: Map<string, Extract<Draft, { _type: K }>>;
};

const store: SendBoxDraftStore = {
  gemini: new Map(),
};

const setDraft = <K extends TChatConversation['type']>(type: K, conversation_id: string, draft: Extract<Draft, { _type: K }> | undefined) => {
  // TODO import ts-pattern for exhaustive check
  switch (type) {
    case 'gemini':
      if (draft) {
        store.gemini.set(conversation_id, draft as Extract<Draft, { _type: 'gemini' }>);
      } else {
        store.gemini.delete(conversation_id);
      }
      break;
    default:
      break;
  }
};

const getDraft = <K extends TChatConversation['type']>(type: K, conversation_id: string): Extract<Draft, { _type: K }> | undefined => {
  // TODO import ts-pattern for exhaustive check
  switch (type) {
    case 'gemini':
      return store.gemini.get(conversation_id) as Extract<Draft, { _type: K }>;
    default:
      return undefined;
  }
};

/**
 * 获得一种类型下的会话草稿操作的 React Hook
 */
export const getSendBoxDraftHook = <K extends TChatConversation['type']>(type: K, initialValue: Extract<Draft, { _type: K }>) => {
  function useDraft(conversation_id: string) {
    const swrRet = useSWR([`/send-box/${type}/draft/${conversation_id}`, conversation_id], ([_, id]) => {
      return getDraft(type, id);
    });

    const mutateDraft = useCallback(
      (draft: (k: Extract<Draft, { _type: K }>) => typeof k | undefined): void => {
        swrRet.mutate(
          (prev) => {
            const newDraft = draft(prev ?? initialValue);
            setDraft(type, conversation_id, newDraft);
            return newDraft;
          },
          { revalidate: false }
        );
      },
      [conversation_id]
    );

    return {
      get data() {
        return swrRet.data;
      },
      mutate: mutateDraft,
    };
  }

  return useDraft;
};

/**
 * 查询某个对话是否存在草稿
 */
export const useHasDraft = (conversation_id: string) => {
  const { data } = useSWR([`/send-box/draft/${conversation_id}`, conversation_id], ([_, id]) => {
    return Object.values(store).some((draftMap) => draftMap.has(id));
  });

  return data !== undefined;
};

/**
 * 删除某个对话的草稿
 */
export const useDeleteDraft = () => {
  const { trigger } = useSWRMutation('/send-box/draft', (_, { arg: { conversation_id } }: { arg: { conversation_id: string } }) => {
    for (const draftMap of Object.values(store)) {
      if (draftMap.has(conversation_id)) {
        return draftMap.delete(conversation_id);
      }
    }
    return false;
  });

  return trigger;
};
