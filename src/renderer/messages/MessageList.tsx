/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import classNames from 'classnames';
import React, { useEffect, useRef } from 'react';
import HOC from '../utils/HOC';
import { useMessageList } from './hooks';
import MessageTips from './MessageTips';
import MessageToolCall from './MessageToolCall';
import MessageToolGroup from './MessageToolGroup';
import MessageText from './MessagetText';
import MessageAcpStatus from './MessageAcpStatus';
import MessageAcpPermission from './MessageAcpPermission';

const MessageItem: React.FC<{ message: TMessage }> = HOC((props) => {
  const { message } = props as { message: TMessage };
  return (
    <div
      className={classNames('flex items-start message-item [&>div]:max-w-95% min-w-300px px-8px m-t-10px max-w-780px mx-auto', message.type, {
        'justify-center': message.position === 'center',
        'justify-end': message.position === 'right',
        'justify-start': message.position === 'left',
      })}
    >
      {props.children}
    </div>
  );
})(({ message }) => {
  switch (message.type) {
    case 'text':
      return <MessageText message={message}></MessageText>;
    case 'tips':
      return <MessageTips message={message}></MessageTips>;
    case 'tool_call':
      return <MessageToolCall message={message}></MessageToolCall>;
    case 'tool_group':
      return <MessageToolGroup message={message}></MessageToolGroup>;
    case 'acp_status':
      return <MessageAcpStatus message={message}></MessageAcpStatus>;
    case 'acp_permission':
      return <MessageAcpPermission message={message}></MessageAcpPermission>;
    default:
      return <div>Unknown message type: {(message as any).type}</div>;
  }
});

const MessageList: React.FC<{ className?: string }> = ({ className }) => {
  const list = useMessageList();

  const ref = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  };
  useEffect(() => {
    setTimeout(() => {
      scrollToBottom();
    }, 100);
  }, [list]);

  return (
    <div className='flex-1 overflow-auto h-full pb-10px box-border' ref={ref}>
      {list.map((message) => {
        return <MessageItem message={message} key={message.id}></MessageItem>;
      })}
    </div>
  );
};

export default MessageList;
