import { ipcBridge } from '@/common';
import { Message } from '@arco-design/web-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type BtwCommandState = {
  answer: string;
  isLoading: boolean;
  isOpen: boolean;
  question: string;
};

const INITIAL_STATE: BtwCommandState = {
  answer: '',
  isLoading: false,
  isOpen: false,
  question: '',
};

export function useBtwCommand(conversationId?: string, enabled = true) {
  const { t } = useTranslation();
  const requestIdRef = useRef(0);
  const previousConversationIdRef = useRef(conversationId);
  const previousEnabledRef = useRef(enabled);
  const [state, setState] = useState<BtwCommandState>(INITIAL_STATE);

  const dismiss = useCallback(() => {
    requestIdRef.current += 1;
    setState(INITIAL_STATE);
  }, []);

  useEffect(() => {
    const conversationChanged = previousConversationIdRef.current !== conversationId;
    const eligibilityDisabled = previousEnabledRef.current && !enabled;

    previousConversationIdRef.current = conversationId;
    previousEnabledRef.current = enabled;

    if ((conversationChanged || eligibilityDisabled) && state.isOpen) {
      requestIdRef.current += 1;
      setState(INITIAL_STATE);
    }
  }, [conversationId, enabled, state.isOpen]);

  const ask = useCallback(
    async (question: string) => {
      const requestId = ++requestIdRef.current;
      Message.info(t('conversation.sideQuestion.started'));
      setState({
        answer: '',
        isLoading: true,
        isOpen: true,
        question,
      });

      if (!conversationId) {
        Message.warning(t('conversation.sideQuestion.unsupported'));
        setState({
          answer: t('conversation.sideQuestion.unsupported'),
          isLoading: false,
          isOpen: true,
          question,
        });
        return;
      }

      try {
        const response = await ipcBridge.conversation.askSideQuestion.invoke({
          conversation_id: conversationId,
          question,
        });

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!response.success || !response.data) {
          Message.error(t('conversation.sideQuestion.error'));
          setState({
            answer: t('conversation.sideQuestion.error'),
            isLoading: false,
            isOpen: true,
            question,
          });
          return;
        }

        const statusMap: Record<string, { toast: typeof Message.info; key: string }> = {
          ok: { toast: Message.success, key: 'answered' },
          noAnswer: { toast: Message.success, key: 'noAnswer' },
          unsupported: { toast: Message.warning, key: 'unsupported' },
          toolsRequired: { toast: Message.info, key: 'toolsRequired' },
          invalid: { toast: Message.warning, key: 'emptyQuestion' },
        };

        const entry = statusMap[response.data.status];
        if (entry) {
          const text =
            response.data.status === 'ok'
              ? response.data.answer
              : t(`conversation.sideQuestion.${entry.key}` as Parameters<typeof t>[0]);
          entry.toast(response.data.status === 'ok' ? t('conversation.sideQuestion.answered') : text);
          setState({ answer: text, isLoading: false, isOpen: true, question });
          return;
        }
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }
        Message.error(t('conversation.sideQuestion.error'));
        setState({
          answer: t('conversation.sideQuestion.error'),
          isLoading: false,
          isOpen: true,
          question,
        });
      }
    },
    [conversationId, t]
  );

  return {
    ask,
    dismiss,
    ...state,
  };
}
