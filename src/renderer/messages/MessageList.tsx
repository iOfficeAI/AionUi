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

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const TOUCH = 8; // 与滚动条宽度一致，提升精度
    const nearEdge = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const hasV = el.scrollHeight > el.clientHeight;
      const hasH = el.scrollWidth > el.clientWidth;
      const withinY = e.clientY >= r.top && e.clientY <= r.bottom;
      const withinX = e.clientX >= r.left && e.clientX <= r.right;
      const nearRight = hasV && withinY && e.clientX >= r.right - TOUCH && e.clientX <= r.right;
      const nearBottom = hasH && withinX && e.clientY >= r.bottom - TOUCH && e.clientY <= r.bottom;
      return nearRight || nearBottom;
    };
    const onMove = (e: MouseEvent) => el.classList.toggle('scrollbar-gentle--hover', nearEdge(e));
    const onDown = (e: MouseEvent) => { if (nearEdge(e)) el.classList.add('scrollbar-gentle--dragging'); };
    const onUp = () => el.classList.remove('scrollbar-gentle--dragging');
    const onLeave = () => el.classList.remove('scrollbar-gentle--hover');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div className='flex-1 overflow-auto h-full pb-10px box-border scrollbar-gentle relative' ref={ref}>
      {list.map((message) => {
        return <MessageItem message={message} key={message.id}></MessageItem>;
      })}
    </div>
  );
};

export default MessageList;
