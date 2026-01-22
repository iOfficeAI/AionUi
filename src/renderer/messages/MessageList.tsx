/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CodexToolCallUpdate, TMessage } from '@/common/chatLib';
import { iconColors } from '@/renderer/theme/colors';
import { Image } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import MessageAcpPermission from '@renderer/messages/acp/MessageAcpPermission';
import MessageAcpToolCall from '@renderer/messages/acp/MessageAcpToolCall';
import MessageAgentStatus from '@renderer/messages/MessageAgentStatus';
import classNames from 'classnames';
import React, { createContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { VirtuosoHandle } from 'react-virtuoso';
import { Virtuoso } from 'react-virtuoso';
import HOC from '../utils/HOC';
import MessageCodexPermission from './codex/MessageCodexPermission';
import MessageCodexToolCall from './codex/MessageCodexToolCall';
import MessageFileChanges from './codex/MessageFileChanges';
import { useMessageList } from './hooks';
import MessageTips from './MessageTips';
import MessageToolCall from './MessageToolCall';
import MessageToolGroup from './MessageToolGroup';
import MessageText from './MessagetText';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

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
        return <MessageCodexPermission message={message}></MessageCodexPermission>;
      case 'codex_tool_call':
        return <MessageCodexToolCall message={message}></MessageCodexToolCall>;
      default:
        return <div>{t('messages.unknownMessageType', { type: String((message as { type?: unknown }).type) })}</div>;
    }
  }),
  (prev, next) => prev.message.id === next.message.id && prev.message.content === next.message.content && prev.message.position === next.message.position && prev.message.type === next.message.type
);

const MessageList: React.FC<{ className?: string }> = () => {
  const list = useMessageList();
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const previousListLengthRef = useRef(list.length);
  const shouldFollowOutputRef = useRef(true);
  const lastMessageSignatureRef = useRef('');
  const autoscrollRafRef = useRef<number | null>(null);
  const scrollerElementRef = useRef<HTMLElement | null>(null);
  const lastScrollTopRef = useRef<number | null>(null);
  const { t } = useTranslation();

  const scheduleAutoscrollToBottom = useCallback(() => {
    if (autoscrollRafRef.current !== null) return;
    autoscrollRafRef.current = requestAnimationFrame(() => {
      autoscrollRafRef.current = null;
      virtuosoRef.current?.autoscrollToBottom();
    });
  }, []);

  const handleScrollerScroll = useCallback(() => {
    const el = scrollerElementRef.current;
    if (!el) return;
    const prevTop = lastScrollTopRef.current;
    const nextTop = el.scrollTop;

    // If the user scrolls upward, disable follow mode until they return to bottom.
    if (prevTop !== null && nextTop < prevTop - 1) {
      shouldFollowOutputRef.current = false;
    }

    lastScrollTopRef.current = nextTop;
  }, []);

  const setVirtuosoScrollerRef = useCallback(
    (ref: HTMLElement | Window | null) => {
      const nextEl = ref instanceof HTMLElement ? ref : null;

      if (scrollerElementRef.current && scrollerElementRef.current !== nextEl) {
        scrollerElementRef.current.removeEventListener('scroll', handleScrollerScroll);
      }

      scrollerElementRef.current = nextEl;
      lastScrollTopRef.current = nextEl ? nextEl.scrollTop : null;

      if (nextEl) {
        nextEl.addEventListener('scroll', handleScrollerScroll, { passive: true });
      }
    },
    [handleScrollerScroll]
  );

  useEffect(() => {
    return () => {
      if (autoscrollRafRef.current !== null) {
        cancelAnimationFrame(autoscrollRafRef.current);
        autoscrollRafRef.current = null;
      }
      if (scrollerElementRef.current) {
        scrollerElementRef.current.removeEventListener('scroll', handleScrollerScroll);
      }
    };
  }, [handleScrollerScroll]);

  // 预处理消息列表，将 Codex turn_diff 消息进行分组
  // Pre-process message list to group Codex turn_diff messages
  const processedList = useMemo(() => {
    const result: Array<TMessage | { type: 'codex_summary'; id: string; messages: TurnDiffContent[] }> = [];
    const turnDiffs: TurnDiffContent[] = [];
    let firstTurnDiffId = '';

    list.forEach((message) => {
      if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
        if (!firstTurnDiffId) firstTurnDiffId = message.id;
        turnDiffs.push(message.content as TurnDiffContent);
      } else {
        if (turnDiffs.length > 0) {
          result.push({ type: 'codex_summary', id: `summary-${firstTurnDiffId}`, messages: [...turnDiffs] });
          turnDiffs.length = 0;
          firstTurnDiffId = '';
        }
        result.push(message);
      }
    });

    if (turnDiffs.length > 0) {
      result.push({ type: 'codex_summary', id: `summary-${firstTurnDiffId}`, messages: [...turnDiffs] });
    }

    return result;
  }, [list]);

  // 滚动到底部
  const scrollToBottom = useCallback(
    (smooth = false) => {
      if (processedList.length === 0) return;
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

  const getMessageFollowSignature = useCallback((message: TMessage | undefined) => {
    if (!message) return '';
    const base = `${message.id}|${message.msg_id || ''}|${message.type}|${message.position || ''}`;

    switch (message.type) {
      case 'text':
        return `${base}|${message.content.content.length}`;
      case 'tool_call':
        return `${base}|${message.content.callId}|${message.content.status || ''}|${message.content.error ? 1 : 0}`;
      case 'tool_group': {
        const statuses = message.content.map((tool) => tool.status).join(',');
        const contentSize = message.content.reduce((acc, tool) => {
          acc += tool.description?.length || 0;
          const resultDisplay = tool.resultDisplay;
          if (typeof resultDisplay === 'string') {
            acc += resultDisplay.length;
          } else if (resultDisplay && typeof resultDisplay === 'object') {
            const maybeDiff = (resultDisplay as { fileDiff?: string }).fileDiff;
            if (typeof maybeDiff === 'string') acc += maybeDiff.length;
            const maybeImg = (resultDisplay as { img_url?: string }).img_url;
            if (typeof maybeImg === 'string') acc += maybeImg.length;
          }
          if (tool.confirmationDetails) {
            acc += tool.confirmationDetails.title?.length || 0;
          }
          return acc;
        }, 0);
        return `${base}|${message.content.length}|${statuses}|${contentSize}`;
      }
      case 'acp_tool_call': {
        const update = message.content.update;
        const contentSize = (update.content || []).reduce((acc, item) => {
          acc += item.type.length;
          acc += item.path?.length || 0;
          acc += item.oldText?.length || 0;
          acc += item.newText?.length || 0;
          acc += item.content?.text?.length || 0;
          return acc;
        }, 0);
        return `${base}|${update.toolCallId}|${update.status}|${update.kind}|${update.title.length}|${contentSize}`;
      }
      case 'codex_tool_call': {
        const contentSize = (message.content.content || []).reduce((acc, item) => {
          acc += item.type.length;
          acc += item.text?.length || 0;
          acc += item.output?.length || 0;
          acc += item.filePath?.length || 0;
          acc += item.oldText?.length || 0;
          acc += item.newText?.length || 0;
          return acc;
        }, 0);
        return `${base}|${message.content.toolCallId}|${message.content.status}|${message.content.kind}|${message.content.subtype}|${contentSize}`;
      }
      case 'tips':
        return `${base}|${message.content.type}|${message.content.content.length}`;
      case 'agent_status':
        return `${base}|${message.content.backend}|${message.content.status}`;
      case 'acp_permission':
      case 'codex_permission':
        // Permission payloads are relatively small and not streamed; base signature is enough.
        return base;
      default:
        return base;
    }
  }, []);

  // 当消息列表更新时，智能滚动
  useEffect(() => {
    const currentListLength = list.length;
    const isNewMessage = currentListLength !== previousListLengthRef.current;

    // 更新记录的列表长度
    previousListLengthRef.current = currentListLength;

    // 检查最新消息是否是用户发送的（position === 'right'）
    const lastMessage = list[list.length - 1];
    const isUserMessage = lastMessage?.position === 'right';

    const lastSig = getMessageFollowSignature(lastMessage);
    const prevSig = lastMessageSignatureRef.current;
    lastMessageSignatureRef.current = lastSig;

    // 如果是用户发送的消息，强制滚动到底部并重置滚动状态
    if (isUserMessage && isNewMessage) {
      shouldFollowOutputRef.current = true;
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      return;
    }

    // Follow mode is driven by user intent (scrolling up disables it).
    // We still keep `atBottom` state for UI (scroll-to-bottom button).
    const shouldFollow = shouldFollowOutputRef.current;

    // New message appended: scroll if follow mode is enabled.
    if (isNewMessage && shouldFollow) {
      setTimeout(() => {
        scrollToBottom();
      }, 100);
      return;
    }

    // Existing last item updated (streaming / tool output / size increase): keep following.
    // This fixes the case where list length doesn't change but content grows.
    if (!isNewMessage && shouldFollow && prevSig && lastSig && lastSig !== prevSig) {
      scheduleAutoscrollToBottom();
    }
  }, [list, scrollToBottom, scheduleAutoscrollToBottom, getMessageFollowSignature]);

  // 点击滚动按钮
  const handleScrollButtonClick = () => {
    shouldFollowOutputRef.current = true;
    scrollToBottom(true);
    setShowScrollButton(false);
  };

  const renderItem = (index: number, item: (typeof processedList)[0]) => {
    if ('type' in item && item.type === 'codex_summary') {
      return (
        <div key={item.id} className='w-full message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto'>
          <MessageFileChanges turnDiffChanges={item.messages} />
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
              setShowScrollButton(!isAtBottom);

              // When the list is back at bottom, resume follow mode.
              if (isAtBottom) {
                shouldFollowOutputRef.current = true;
              }
            }}
            atBottomThreshold={100}
            increaseViewportBy={200}
            itemContent={renderItem}
            scrollerRef={setVirtuosoScrollerRef}
            followOutput={() => (shouldFollowOutputRef.current ? 'auto' : false)}
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
