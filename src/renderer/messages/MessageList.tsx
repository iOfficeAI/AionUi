/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import classNames from 'classnames';
import React, { useEffect, useRef, useState } from 'react';
import HOC from '../utils/HOC';
import { useMessageList } from './hooks';
import MessageAcpPermission from '@renderer/messages/acp/MessageAcpPermission';
import MessageAgentStatus from '@renderer/messages/MessageAgentStatus';
import MessageCodexPermission from './codex/MessageCodexPermission';
import MessageCodexToolCall from './codex/MessageCodexToolCall';
import MessageAcpToolCall from '@renderer/messages/acp/MessageAcpToolCall';
import MessageTips from './MessageTips';
import MessageToolCall from './MessageToolCall';
import MessageToolGroup from './MessageToolGroup';
import MessageText from './MessagetText';
import { Down } from '@icon-park/react';
import { useTranslation } from 'react-i18next';
import { iconColors } from '@/renderer/theme/colors';

const MessageItem: React.FC<{ message: TMessage }> = HOC((props) => {
  const { message } = props as { message: TMessage };
  return (
    <div
      className={classNames('flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-780px mx-auto', message.type, {
        'justify-center': message.position === 'center',
        'justify-end': message.position === 'right',
        'justify-start': message.position === 'left',
      })}
    >
      {props.children}
    </div>
  );
})(({ message }) => {
  const { t } = useTranslation();

  switch (message.type) {
    case 'text':
      return <MessageText message={message}></MessageText>;
    case 'tips':
      return <MessageTips message={message}></MessageTips>;
    case 'tool_call':
      return <MessageToolCall message={message}></MessageToolCall>;
    case 'tool_group':
      return <MessageToolGroup message={message}></MessageToolGroup>;
    case 'agent_status':
      return <MessageAgentStatus message={message}></MessageAgentStatus>;
    case 'acp_permission':
      return <MessageAcpPermission message={message}></MessageAcpPermission>;
    case 'acp_tool_call':
      return <MessageAcpToolCall message={message}></MessageAcpToolCall>;
    case 'codex_permission':
      return <MessageCodexPermission message={message}></MessageCodexPermission>;
    case 'codex_tool_call':
      return <MessageCodexToolCall message={message}></MessageCodexToolCall>;
    default:
      return <div>{t('messages.unknownMessageType', { type: (message as any).type })}</div>;
  }
});

const MessageList: React.FC<{ className?: string }> = () => {
  const list = useMessageList();
  const ref = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const previousListLengthRef = useRef(list.length);
  const { t } = useTranslation();

  // 检查是否在底部（允许一定的误差范围）
  const isAtBottom = () => {
    if (!ref.current) return true;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    return scrollHeight - scrollTop - clientHeight < 100;
  };

  // 滚动到底部
  const scrollToBottom = (smooth = false) => {
    if (ref.current) {
      ref.current.scrollTo({
        top: ref.current.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto',
      });
    }
  };

  // 监听用户滚动
  const handleScroll = () => {
    if (!ref.current) return;
    const atBottom = isAtBottom();
    setShowScrollButton(!atBottom);
    setIsUserScrolling(!atBottom);
  };

  // 当消息列表更新时，智能滚动
  useEffect(() => {
    const currentListLength = list.length;
    const isNewMessage = currentListLength !== previousListLengthRef.current;

    // 更新记录的列表长度
    previousListLengthRef.current = currentListLength;

    // 检查最新消息是否是用户发送的（position === 'right'）
    const lastMessage = list[list.length - 1];
    const isUserMessage = lastMessage?.position === 'right';

    // 如果是用户发送的消息，强制滚动到底部并重置滚动状态
    if (isUserMessage && isNewMessage) {
      setIsUserScrolling(false);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      return;
    }

    // 如果用户正在查看历史消息，不自动滚动
    if (isUserScrolling) return;

    // 只在新消息添加时才自动滚动，而不是消息内容更新时
    if (isNewMessage && isAtBottom()) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [list, isUserScrolling]);

  // 点击滚动按钮
  const handleScrollButtonClick = () => {
    scrollToBottom(true);
    setIsUserScrolling(false);
    setShowScrollButton(false);
  };

  return (
    <div className='relative flex-1 h-full'>
      <div className='flex-1 overflow-auto h-full pb-10px box-border' ref={ref} onScroll={handleScroll}>
        {list.map((message) => {
          return <MessageItem message={message} key={message.id}></MessageItem>;
        })}
      </div>
      {showScrollButton && (
        <>
          {/* 渐变遮罩 */}
          <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
          {/* 滚动按钮 */}
          <div className='absolute bottom-20px left-50% transform -translate-x-50% z-100'>
            <div className='flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg cursor-pointer hover:bg-1 transition-all hover:scale-110 border-1 border-solid border-3' onClick={handleScrollButtonClick} title={t('messages.scrollToBottom')} style={{ lineHeight: 0 }}>
              <Down theme='filled' size='20' fill={iconColors.secondary} style={{ display: 'block' }} />
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MessageList;
