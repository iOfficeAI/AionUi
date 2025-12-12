import { ipcBridge } from '@/common';
import { Spin } from '@arco-design/web-react';
import React, { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import ChatConversation from './ChatConversation';
import { usePreviewContext } from '@/renderer/pages/conversation/preview';

const ChatConversationIndex: React.FC = () => {
  const { id } = useParams();
  const { closePreview } = usePreviewContext();
  const previousConversationIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!id) return;

    // 切换会话时自动关闭预览面板，避免跨会话残留
    // Ensure preview panel closes when switching conversations
    if (previousConversationIdRef.current && previousConversationIdRef.current !== id) {
      closePreview();
    }

    previousConversationIdRef.current = id;
  }, [id, closePreview]);

  const { data, isLoading } = useSWR(`conversation/${id}`, () => {
    return ipcBridge.conversation.get.invoke({ id });
  });
  if (isLoading) return <Spin loading></Spin>;
  return <ChatConversation conversation={data}></ChatConversation>;
};

export default ChatConversationIndex;
