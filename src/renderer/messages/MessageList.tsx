/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate, IMessageAcpToolCall, IMessageToolGroup, TMessage } from '@/common/chatLib';
import { iconColors } from '@/renderer/theme/colors';
import { Image } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import MessageAcpPermission from '@renderer/messages/acp/MessageAcpPermission';
import MessageAcpToolCall from '@renderer/messages/acp/MessageAcpToolCall';
import MessageAgentStatus from '@renderer/messages/MessageAgentStatus';
import classNames from 'classnames';
import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { VirtuosoHandle } from 'react-virtuoso';
import { Virtuoso } from 'react-virtuoso';
import { uuid } from '../utils/common';
import HOC from '../utils/HOC';
import MessageCodexToolCall from './codex/MessageCodexToolCall';
import type { FileChangeInfo } from './codex/MessageFileChanges';
import MessageFileChanges, { parseDiff } from './codex/MessageFileChanges';
import { useMessageList } from './hooks';
import MessagePlan from './MessagePlan';
import MessageTips from './MessageTips';
import MessageToolCall from './MessageToolCall';
import MessageToolGroup from './MessageToolGroup';
import MessageToolGroupSummary from './MessageToolGroupSummary';
import MessageText from './MessagetText';
import type { WriteFileResult } from './types';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

type IMessageVO =
  | TMessage
  | { type: 'file_summary'; id: string; diffs: FileChangeInfo[] }
  | {
      type: 'tool_summary';
      id: string;
      messages: Array<IMessageToolGroup | IMessageAcpToolCall>;
    };

// 图片预览上下文 Image preview context
export const ImagePreviewContext = createContext<{ inPreviewGroup: boolean }>({ inPreviewGroup: false });

const MessageItem: React.FC<{ message: TMessage }> = React.memo(
  HOC((props) => {
    const { message } = props as { message: TMessage };
    return (
      <div
        className={classNames('flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-full md:max-w-780px mx-auto', message.type, {
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
        // Permission UI is now handled by ConversationChatConfirm component
        return null;
      case 'codex_tool_call':
        return <MessageCodexToolCall message={message}></MessageCodexToolCall>;
      case 'plan':
        return <MessagePlan message={message}></MessagePlan>;
      default:
        return <div>{t('messages.unknownMessageType', { type: (message as any).type })}</div>;
    }
  }),
  (prev, next) => prev.message.id === next.message.id && prev.message.content === next.message.content && prev.message.position === next.message.position && prev.message.type === next.message.type
);

const MessageList: React.FC<{ className?: string }> = () => {
  const list = useMessageList();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const previousListLengthRef = useRef(list.length);
  const { t } = useTranslation();

  // 预处理消息列表，将 Codex turn_diff 消息进行分组
  // Pre-process message list to group Codex turn_diff messages
  const processedList = useMemo(() => {
    const result: Array<IMessageVO> = [];
    let diffsChanges: FileChangeInfo[] = [];
    let toolList: Array<IMessageToolGroup | IMessageAcpToolCall> = [];

    const pushFileDffChanges = (changes: FileChangeInfo) => {
      if (!diffsChanges.length) {
        result.push({ type: 'file_summary', id: `summary-${uuid()}`, diffs: diffsChanges });
      }
      diffsChanges.push(changes);
      toolList = [];
    };
    const pushToolList = (message: IMessageToolGroup | IMessageAcpToolCall) => {
      if (!toolList.length) {
        result.push({ type: 'tool_summary', id: ``, messages: toolList });
      }
      toolList.push(message);
      diffsChanges = [];
    };

    for (let i = 0, len = list.length; i < len; i++) {
      const message = list[i];
      if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
        pushFileDffChanges(parseDiff((message.content as TurnDiffContent).data.unified_diff));
        continue;
      }
      if (message.type === 'tool_group') {
        if (message.content.length === 1) {
          const writeFileResults = message.content.filter((item) => item.name === 'WriteFile' && item.resultDisplay && typeof item.resultDisplay === 'object' && 'fileDiff' in item.resultDisplay).map((item) => item.resultDisplay as WriteFileResult);
          if (writeFileResults.length && writeFileResults[0].fileDiff) {
            pushFileDffChanges(parseDiff(writeFileResults[0].fileDiff, writeFileResults[0].fileName));
            continue;
          }
        }
        pushToolList(message);
        continue;
      }
      if (message.type === 'acp_tool_call') {
        pushToolList(message);
        continue;
      }
      toolList = [];
      diffsChanges = [];
      result.push(message);
    }
    return result;
  }, [list]);

  // 滚动到底部
  const scrollToBottom = useCallback(
    (smooth = false) => {
      if (virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({
          index: processedList.length - 1,
          behavior: smooth ? 'smooth' : 'auto',
          align: 'end',
        });
      }
    },
    [processedList.length]
  );

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
      setAtBottom(true);
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      return;
    }

    // 如果用户不在底部且不是新消息添加，不自动滚动
    // 只在新消息添加时且原本在底部时才自动滚动
    if (isNewMessage && atBottom) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [list, atBottom, scrollToBottom]);

  // 点击滚动按钮
  const handleScrollButtonClick = () => {
    scrollToBottom(true);
    setShowScrollButton(false);
    setAtBottom(true);
  };

  const renderItem = (index: number, item: (typeof processedList)[0]) => {
    if ('type' in item && ['file_summary', 'tool_summary'].includes(item.type)) {
      return (
        <div key={item.id} className={'w-full message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto ' + item.type}>
          {item.type === 'file_summary' && <MessageFileChanges diffsChanges={item.diffs} />}
          {item.type === 'tool_summary' && <MessageToolGroupSummary messages={item.messages}></MessageToolGroupSummary>}
        </div>
      );
    }
    return <MessageItem message={item as TMessage} key={(item as TMessage).id}></MessageItem>;
  };

  return (
    <div className='relative flex-1 h-full'>
      {/* 使用 PreviewGroup 包裹所有消息，实现跨消息预览图片 */}
      <Image.PreviewGroup actionsLayout={['zoomIn', 'zoomOut', 'originalSize', 'rotateLeft', 'rotateRight']}>
        <ImagePreviewContext.Provider value={{ inPreviewGroup: true }}>
          <Virtuoso
            ref={virtuosoRef}
            className='flex-1 h-full pb-10px box-border'
            data={processedList}
            initialTopMostItemIndex={processedList.length - 1}
            atBottomStateChange={(isAtBottom) => {
              setAtBottom(isAtBottom);
              setShowScrollButton(!isAtBottom);
            }}
            atBottomThreshold={100}
            increaseViewportBy={200}
            itemContent={renderItem}
            followOutput='auto'
            components={{
              Header: () => <div className='h-10px' />,
              Footer: () => <div className='h-20px' />,
            }}
          />
        </ImagePreviewContext.Provider>
      </Image.PreviewGroup>

      {showScrollButton && (
        <>
          {/* 渐变遮罩 Gradient mask */}
          <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
          {/* 滚动按钮 Scroll button */}
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
