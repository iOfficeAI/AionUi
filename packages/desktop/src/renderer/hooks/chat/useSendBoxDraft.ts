import { useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';
export type { FileOrFolderItem } from '@/renderer/utils/file/fileTypes';

type Draft =
  | {
      _type: 'acp';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'codex';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    }
  | {
      _type: 'aionrs';
      content: string;
      atPath: Array<string | FileOrFolderItem>;
      uploadFile: string[];
    };

/**
 * 当前支持的对话类型以及对应的草稿对象
 */
type DraftConversationType = Draft['_type'];
type SendBoxDraftStore = {
  [K in DraftConversationType]: Map<string, Extract<Draft, { _type: K }>>;
};

const store: SendBoxDraftStore = {
  acp: new Map(),
  codex: new Map(),
  aionrs: new Map(),
};

export type ConversationSendBoxPrefill = {
  requestId: number;
  prompt: string;
};

type ConversationSendBoxPrefillListener = (prefill: ConversationSendBoxPrefill) => void;

let pendingConversationPrefill:
  | {
      conversation_id: string;
      prefill: ConversationSendBoxPrefill;
    }
  | undefined;
const conversationPrefillListeners = new Map<string, ConversationSendBoxPrefillListener>();
let nextConversationPrefillRequestId = 0;

/**
 * Adds a prompt without discarding text the user has already typed.
 */
export const appendPromptToDraft = (draft: string, prompt: string): string => {
  if (!prompt) return draft;
  if (!draft) return prompt;
  return `${draft}${draft.endsWith('\n') ? '' : '\n'}${prompt}`;
};

/**
 * Delivers a prefill only to the SendBox owned by the requested conversation.
 * If that SendBox is not mounted yet, the request remains queued until it is.
 */
export const requestConversationSendBoxPrefill = (conversation_id: string, prompt: string): void => {
  if (!conversation_id || !prompt) return;

  const prefill = {
    requestId: ++nextConversationPrefillRequestId,
    prompt,
  };
  // A navigation can only have one not-yet-mounted destination. Supersede an
  // older target so opening it later cannot inject a stale prompt.
  pendingConversationPrefill = undefined;
  const listener = conversationPrefillListeners.get(conversation_id);
  if (listener) {
    listener(prefill);
    return;
  }

  pendingConversationPrefill = { conversation_id, prefill };
};

/**
 * Registers the mounted SendBox as the single consumer for its conversation.
 */
export const useConversationSendBoxPrefill = (
  conversation_id: string | undefined,
  onPrefill: ConversationSendBoxPrefillListener
): void => {
  const onPrefillRef = useRef(onPrefill);
  onPrefillRef.current = onPrefill;

  useEffect(() => {
    if (!conversation_id) return;

    const listener: ConversationSendBoxPrefillListener = (prefill) => onPrefillRef.current(prefill);
    conversationPrefillListeners.set(conversation_id, listener);

    if (pendingConversationPrefill?.conversation_id === conversation_id) {
      const { prefill } = pendingConversationPrefill;
      pendingConversationPrefill = undefined;
      listener(prefill);
    }

    return () => {
      if (conversationPrefillListeners.get(conversation_id) === listener) {
        conversationPrefillListeners.delete(conversation_id);
      }
    };
  }, [conversation_id]);
};

const setDraft = <K extends DraftConversationType>(
  type: K,
  conversation_id: string,
  draft: Extract<Draft, { _type: K }> | undefined
) => {
  // TODO import ts-pattern for exhaustive check
  switch (type) {
    case 'acp':
      if (draft) {
        store.acp.set(conversation_id, draft as Extract<Draft, { _type: 'acp' }>);
      } else {
        store.acp.delete(conversation_id);
      }
      break;
    case 'codex':
      if (draft) {
        store.codex.set(conversation_id, draft as Extract<Draft, { _type: 'codex' }>);
      } else {
        store.codex.delete(conversation_id);
      }
      break;
    case 'aionrs':
      if (draft) {
        store.aionrs.set(conversation_id, draft as Extract<Draft, { _type: 'aionrs' }>);
      } else {
        store.aionrs.delete(conversation_id);
      }
      break;
    default:
      break;
  }
};

const getDraft = <K extends DraftConversationType>(
  type: K,
  conversation_id: string
): Extract<Draft, { _type: K }> | undefined => {
  // TODO import ts-pattern for exhaustive check
  switch (type) {
    case 'acp':
      return store.acp.get(conversation_id) as Extract<Draft, { _type: K }>;
    case 'codex':
      return store.codex.get(conversation_id) as Extract<Draft, { _type: K }>;
    case 'aionrs':
      return store.aionrs.get(conversation_id) as Extract<Draft, { _type: K }>;
    default:
      return undefined;
  }
};

/**
 * 获得一种类型下的会话草稿操作的 React Hook
 */
export const getSendBoxDraftHook = <K extends DraftConversationType>(
  type: K,
  initialValue: Extract<Draft, { _type: K }>
) => {
  function useDraft(conversation_id: string) {
    const swrRet = useSWR([`/send-box/${type}/draft/${conversation_id}`, conversation_id], ([_, id]) => {
      return getDraft(type, id);
    });

    const mutateDraft = useCallback(
      (draft: (k: Extract<Draft, { _type: K }>) => typeof k | undefined): void => {
        swrRet
          .mutate(
            (prev) => {
              const newDraft = draft(prev ?? initialValue);
              setDraft(type, conversation_id, newDraft);
              return newDraft;
            },
            { revalidate: false }
          )
          .catch((error) => {
            console.error('Failed to mutate draft:', error);
          });
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
