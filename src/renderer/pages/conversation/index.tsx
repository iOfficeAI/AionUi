import { ipcBridge } from '@/common';
import { Spin } from '@arco-design/web-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import useSWR from 'swr';
import ChatConversation from './ChatConversation';

const ChatConversationIndex: React.FC = () => {
  const { id } = useParams();
  const { data, isLoading } = useSWR(`conversation/${id}`, () => {
    return ipcBridge.conversation.get.invoke({ id });
  });
  if (isLoading) return <Spin loading></Spin>;
  return <ChatConversation conversation={data}></ChatConversation>;
};

export default ChatConversationIndex;
