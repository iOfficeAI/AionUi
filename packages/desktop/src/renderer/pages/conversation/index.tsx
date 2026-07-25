import { ipcBridge } from '@/common';
import { Message, Spin } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import ChatConversation from './components/ChatConversation';
import { usePreviewContext } from '@/renderer/pages/conversation/Preview';
import { useAutoTitle } from '@/renderer/hooks/chat/useAutoTitle';
import { getConversationOrNull } from '@/renderer/pages/conversation/utils/conversationCache';

const ChatConversationIndex: React.FC = () => {
  const { id } = useParams();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { closePreviewIfWorkspaceChanged } = usePreviewContext();
  const { syncTitleFromHistory } = useAutoTitle();
  const notFoundHandledIdRef = useRef<string | undefined>(undefined);
  const defaultConversationTitle = t('conversation.welcome.newConversation');

  const { data, isLoading, mutate } = useSWR(id ? `conversation/${id}` : null, () => {
    return getConversationOrNull(id!);
  });

  // Close preview only when the workspace changes, not on every conversation
  // switch. Same-workspace conversations (same project) keep the preview open.
  // The ref lives in PreviewContext (app-root level) so it survives remounts.
  useEffect(() => {
    if (!data) return;
    const workspace = (data.extra as { workspace?: string } | undefined)?.workspace ?? null;
    closePreviewIfWorkspaceChanged(workspace);
  }, [data, closePreviewIfWorkspaceChanged]);

  useEffect(() => {
    if (!id) return;

    return ipcBridge.conversation.listChanged.on((event) => {
      if (event.conversation_id !== id || (event.action !== 'updated' && event.action !== 'created')) {
        return;
      }

      void mutate();
    });
  }, [id, mutate]);

  useEffect(() => {
    if (!data || data.name !== defaultConversationTitle) {
      return;
    }

    void syncTitleFromHistory(data.id);
  }, [data, defaultConversationTitle, syncTitleFromHistory]);

  // 会话不存在（例如从历史栈回到已删除会话）时，提示并替换路由到首页，
  // 避免渲染空骨架。每个 id 只触发一次。
  // Conversation does not exist (e.g. navigating back to a deleted one via
  // browser history): show a toast and replace the route with home, so we
  // don't render an empty skeleton. Fire at most once per id.
  useEffect(() => {
    if (!id || isLoading || data || notFoundHandledIdRef.current === id) return;
    notFoundHandledIdRef.current = id;
    Message.warning(t('conversation.notFound'));
    navigate('/', { replace: true });
  }, [id, isLoading, data, navigate, t]);

  if (isLoading) return <Spin loading></Spin>;
  return <ChatConversation conversation={data ?? undefined}></ChatConversation>;
};

export default ChatConversationIndex;
