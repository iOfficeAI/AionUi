/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CodexToolCallUpdate,
  IMessageAcpToolCall,
  IMessageCodexAgentTranscript,
  IMessageCodexToolCall,
  IMessageToolGroup,
  TMessage,
} from '@/common/chat/chatLib';
import { useConversationContextSafe } from '@/renderer/hooks/context/ConversationContext';
import { iconColors } from '@/renderer/styles/colors';
import { CHAT_MESSAGE_JUMP_EVENT, type ChatMessageJumpDetail } from '@/renderer/utils/chat/chatMinimapEvents';
import { Image } from '@arco-design/web-react';
import { Down } from '@icon-park/react';
import MessageAcpPermission from '@renderer/pages/conversation/Messages/acp/MessageAcpPermission';
import MessageAcpToolCall from '@renderer/pages/conversation/Messages/acp/MessageAcpToolCall';
import classNames from 'classnames';
import React, { createContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Virtuoso } from 'react-virtuoso';
import { uuid } from '@renderer/utils/common';
import './messages.css';
import HOC from '@renderer/utils/ui/HOC';
import MessageCodexAgentEvent from './codex/MessageCodexAgentEvent';
import MessageCodexContextEvent from './codex/MessageCodexContextEvent';
import MessageCodexToolCall, { shouldHideInternalNativeToolCall } from './codex/MessageCodexToolCall';
import type { FileChangeInfo } from './codex/MessageFileChanges';
import MessageFileChanges, { parseDiff } from './codex/MessageFileChanges';
import { useMessageList } from './hooks';
import MessageAgentStatus from './components/MessageAgentStatus';
import MessagePlan from './components/MessagePlan';
import MessageTips from './components/MessageTips';
import MessageToolCall from './components/MessageToolCall';
import MessageToolGroup from './components/MessageToolGroup';
import MessageToolGroupSummary from './components/MessageToolGroupSummary';
import MessageCronTrigger from './components/MessageCronTrigger';
import MessageSkillSuggest from './components/MessageSkillSuggest';
import MessageText from './components/MessageText';
import MessageThinking from './components/MessageThinking';
import type { WriteFileResult } from './types';
import { useAutoScroll } from './useAutoScroll';
import { useAutoPreviewOfficeFiles } from '@/renderer/hooks/file/useAutoPreviewOfficeFiles';
import SelectionReplyButton from './components/SelectionReplyButton';

type TurnDiffContent = Extract<CodexToolCallUpdate, { subtype: 'turn_diff' }>;

type IMessageVO =
  | TMessage
  | {
      type: 'codex_agent_event_with_transcripts';
      id: string;
      message: Extract<TMessage, { type: 'codex_agent_event' }>;
      transcripts: IMessageCodexAgentTranscript[];
      toolCalls: IMessageCodexToolCall[];
      sourceMessageIds: string[];
    }
  | { type: 'file_summary'; id: string; diffs: FileChangeInfo[]; sourceMessageIds: string[] }
  | {
      type: 'tool_summary';
      id: string;
      messages: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageCodexToolCall>;
      sourceMessageIds: string[];
    };

type ConversationLocationState = {
  targetMessageId?: string;
  fromConversationSearch?: boolean;
};

const getProcessedItemSourceMessageIds = (item: IMessageVO): string[] => {
  if ('type' in item && item.type === 'tool_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'file_summary') {
    return item.sourceMessageIds;
  }
  if ('type' in item && item.type === 'codex_agent_event_with_transcripts') {
    return item.sourceMessageIds;
  }
  return 'id' in item ? [item.id] : [];
};

const matchesTargetMessage = (item: IMessageVO, targetMessageId?: string): boolean => {
  if (!targetMessageId) {
    return false;
  }
  return getProcessedItemSourceMessageIds(item).includes(targetMessageId);
};

const getProcessedItemAnchorId = (item: IMessageVO): string => {
  const sourceIds = getProcessedItemSourceMessageIds(item);
  return sourceIds[0] || ('id' in item ? item.id : uuid());
};

const highlightStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-aou-1)',
  boxShadow: '0 0 0 1px var(--color-aou-6-brand) inset',
  borderRadius: '12px',
};

const getUnhandledMessageType = (_message: never): string => 'unknown';

const isStreamingAssistantTextMessage = (message: TMessage): boolean => {
  if (message.hidden || message.type !== 'text' || message.position !== 'left') {
    return false;
  }

  if (message.content.teammateMessage) {
    return false;
  }

  return typeof message.content.content === 'string' && message.content.content.trim().length > 0;
};

const getStreamingAssistantTextMessageId = (
  messages: TMessage[],
  isStreamingContent: boolean | undefined
): string | undefined => {
  if (!isStreamingContent) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (isStreamingAssistantTextMessage(message)) {
      return message.id;
    }
  }

  return undefined;
};

export const buildProcessedMessageList = (list: TMessage[], conversationType?: string): Array<IMessageVO> => {
  const result: Array<IMessageVO> = [];
  const transcriptsByCallId = new Map<string, IMessageCodexAgentTranscript[]>();
  const toolCallsByAgentCallId = new Map<string, IMessageCodexToolCall[]>();
  for (const message of list) {
    if (message.type === 'codex_agent_transcript') {
      const transcripts = transcriptsByCallId.get(message.content.callId) || [];
      transcripts.push(message);
      transcriptsByCallId.set(message.content.callId, transcripts);
    }
    if (message.type === 'codex_tool_call' && message.content.agentCallId) {
      const toolCalls = toolCallsByAgentCallId.get(message.content.agentCallId) || [];
      toolCalls.push(message);
      toolCallsByAgentCallId.set(message.content.agentCallId, toolCalls);
    }
  }
  let diffsChanges: FileChangeInfo[] = [];
  let diffsSourceMessageIds: string[] = [];
  let toolList: Array<IMessageToolGroup | IMessageAcpToolCall | IMessageCodexToolCall> = [];
  let toolSourceMessageIds: string[] = [];

  const pushFileDffChanges = (changes: FileChangeInfo, sourceMessageId: string) => {
    if (!diffsChanges.length) {
      diffsSourceMessageIds = [];
      result.push({
        type: 'file_summary',
        id: `summary-${sourceMessageId}`,
        diffs: diffsChanges,
        sourceMessageIds: diffsSourceMessageIds,
      });
    }
    diffsChanges.push(changes);
    diffsSourceMessageIds.push(sourceMessageId);
    toolList = [];
    toolSourceMessageIds = [];
  };
  const pushToolList = (message: IMessageToolGroup | IMessageAcpToolCall | IMessageCodexToolCall) => {
    if (!toolList.length) {
      toolSourceMessageIds = [];
      result.push({
        type: 'tool_summary',
        id: `tool-summary-${message.id}`,
        messages: toolList,
        sourceMessageIds: toolSourceMessageIds,
      });
    }
    toolList.push(message);
    toolSourceMessageIds.push(message.id);
    diffsChanges = [];
    diffsSourceMessageIds = [];
  };
  const pushMessage = (message: TMessage) => {
    if (conversationType !== 'codex' || message.type !== 'text' || message.position !== 'left') {
      result.push(message);
      return;
    }

    const previous = result[result.length - 1];
    if (!previous || !('type' in previous) || previous.type !== 'text' || previous.position !== 'left') {
      result.push(message);
      return;
    }

    const previousContent = previous.content.content;
    const nextContent = message.content.content;
    if (typeof previousContent !== 'string' || typeof nextContent !== 'string') {
      result.push(message);
      return;
    }

    result[result.length - 1] = {
      ...previous,
      content: {
        ...previous.content,
        content: previousContent + nextContent,
      },
    };
  };

  for (let i = 0, len = list.length; i < len; i++) {
    const message = list[i];
    // Skip hidden and available_commands messages
    if (message.hidden) continue;
    if (message.type === 'available_commands') continue;
    if (message.type === 'codex_tool_call' && message.content.subtype === 'turn_diff') {
      pushFileDffChanges(parseDiff((message.content as TurnDiffContent).data.unified_diff), message.id);
      continue;
    }
    if (message.type === 'codex_agent_transcript') {
      continue;
    }
    if (message.type === 'codex_tool_call' && message.content.agentCallId) {
      continue;
    }
    if (message.type === 'codex_agent_event') {
      const transcripts = transcriptsByCallId.get(message.content.callId) || [];
      const toolCalls = toolCallsByAgentCallId.get(message.content.callId) || [];
      result.push({
        type: 'codex_agent_event_with_transcripts',
        id: message.id,
        message,
        transcripts,
        toolCalls,
        sourceMessageIds: [
          message.id,
          ...transcripts.map((transcript) => transcript.id),
          ...toolCalls.map((toolCall) => toolCall.id),
        ],
      });
      toolList = [];
      toolSourceMessageIds = [];
      diffsChanges = [];
      diffsSourceMessageIds = [];
      continue;
    }
    if (message.type === 'codex_tool_call') {
      if (!shouldHideInternalNativeToolCall(message.content)) {
        pushToolList(message);
      }
      continue;
    }
    if (message.type === 'tool_group') {
      if (message.content.length === 1) {
        const writeFileResults = message.content
          .filter(
            (item) =>
              item.name === 'WriteFile' &&
              item.resultDisplay &&
              typeof item.resultDisplay === 'object' &&
              'fileDiff' in item.resultDisplay
          )
          .map((item) => item.resultDisplay as WriteFileResult);
        if (writeFileResults.length && writeFileResults[0].fileDiff) {
          pushFileDffChanges(parseDiff(writeFileResults[0].fileDiff, writeFileResults[0].fileName), message.id);
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
    toolSourceMessageIds = [];
    diffsChanges = [];
    diffsSourceMessageIds = [];
    pushMessage(message);
  }
  return result;
};

// Image preview context
export const ImagePreviewContext = createContext<{ inPreviewGroup: boolean }>({ inPreviewGroup: false });

const MessageItem: React.FC<{
  message: TMessage;
  highlighted?: boolean;
  isStreaming?: boolean;
  codexAgentTranscripts?: IMessageCodexAgentTranscript[];
  codexAgentToolCalls?: IMessageCodexToolCall[];
}> = React.memo(
  HOC((props) => {
    const { message, highlighted } = props as { message: TMessage; highlighted?: boolean };
    return (
      <div
        id={`message-${message.id}`}
        data-testid={`message-${message.type}-${message.position}`}
        data-message-type={message.type}
        data-message-position={message.position}
        className={classNames(
          'min-w-0 flex items-start message-item [&>div]:max-w-full px-8px m-t-10px max-w-full md:max-w-780px mx-auto',
          message.type,
          {
            'justify-center': message.position === 'center',
            'justify-end': message.position === 'right',
            'justify-start': message.position === 'left',
          }
        )}
        style={highlighted ? highlightStyle : undefined}
      >
        {props.children}
      </div>
    );
  })(({ message, isStreaming, codexAgentTranscripts, codexAgentToolCalls }) => {
    const { t } = useTranslation();
    switch (message.type) {
      case 'text':
        return <MessageText message={message} isStreaming={isStreaming}></MessageText>;
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
      case 'codex_context_event':
        return <MessageCodexContextEvent message={message} />;
      case 'codex_agent_event':
        return (
          <MessageCodexAgentEvent
            message={message}
            transcripts={codexAgentTranscripts}
            toolCalls={codexAgentToolCalls}
          />
        );
      case 'codex_agent_transcript':
        return null;
      case 'plan':
        return <MessagePlan message={message}></MessagePlan>;
      case 'thinking':
        return <MessageThinking message={message}></MessageThinking>;
      case 'skill_suggest':
        return <MessageSkillSuggest message={message} />;
      case 'cron_trigger':
        return <MessageCronTrigger message={message} />;
      case 'available_commands':
        return null;
      default:
        return <div>{t('messages.unknownMessageType', { type: getUnhandledMessageType(message) })}</div>;
    }
  }),
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.position === next.message.position &&
    prev.message.type === next.message.type &&
    prev.highlighted === next.highlighted &&
    prev.isStreaming === next.isStreaming &&
    prev.codexAgentTranscripts === next.codexAgentTranscripts &&
    prev.codexAgentToolCalls === next.codexAgentToolCalls
);

const MessageList: React.FC<{ className?: string; emptySlot?: React.ReactNode }> = ({ emptySlot }) => {
  const list = useMessageList();
  const conversationContext = useConversationContextSafe();
  useAutoPreviewOfficeFiles(conversationContext);
  const { t } = useTranslation();
  const location = useLocation();
  const locationState = (location.state || {}) as ConversationLocationState;
  const targetMessageId = locationState.targetMessageId;
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | undefined>();
  const handledTargetKeyRef = useRef<string>('');
  const streamingMessageId = useMemo(
    () => getStreamingAssistantTextMessageId(list, conversationContext?.isStreamingContent),
    [conversationContext?.isStreamingContent, list]
  );

  const processedList = useMemo(
    () => buildProcessedMessageList(list, conversationContext?.type),
    [conversationContext?.type, list]
  );

  // Use auto-scroll hook
  const {
    virtuosoRef,
    handleScrollerRef,
    handleScroll,
    handleAtBottomStateChange,
    handleFollowOutput,
    showScrollButton,
    scrollToBottom,
    hideScrollButton,
  } = useAutoScroll({
    messages: list,
    itemCount: processedList.length,
  });

  useEffect(() => {
    if (!targetMessageId || processedList.length === 0 || !virtuosoRef.current) {
      return;
    }

    const targetKey = `${location.key}:${targetMessageId}`;
    if (handledTargetKeyRef.current === targetKey) {
      return;
    }

    const targetIndex = processedList.findIndex((item) => matchesTargetMessage(item, targetMessageId));
    if (targetIndex === -1) {
      return;
    }

    handledTargetKeyRef.current = targetKey;
    setHighlightedMessageId(targetMessageId);
    hideScrollButton();

    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: targetIndex,
        behavior: 'smooth',
        align: 'center',
      });
    });

    const timer = window.setTimeout(() => {
      setHighlightedMessageId((current) => (current === targetMessageId ? undefined : current));
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [hideScrollButton, location.key, processedList, targetMessageId, virtuosoRef]);

  useEffect(() => {
    const handleMessageJump = (event: Event) => {
      const detail = (event as CustomEvent<ChatMessageJumpDetail>).detail;
      if (!detail || !detail.conversationId) return;
      if (!conversationContext?.conversationId || detail.conversationId !== conversationContext.conversationId) return;

      const targetIndex = processedList.findIndex((item) => {
        if (
          (item as { type?: string }).type === 'file_summary' ||
          (item as { type?: string }).type === 'tool_summary'
        ) {
          return false;
        }
        if ((item as { type?: string }).type === 'codex_agent_event_with_transcripts') {
          const agentItem = item as Extract<IMessageVO, { type: 'codex_agent_event_with_transcripts' }>;
          if (detail.messageId && agentItem.sourceMessageIds.includes(detail.messageId)) return true;
          if (
            detail.msgId &&
            [agentItem.message, ...agentItem.transcripts, ...agentItem.toolCalls].some(
              (message) => message.msg_id === detail.msgId
            )
          ) {
            return true;
          }
          return false;
        }
        const message = item as TMessage;
        if (detail.messageId && message.id === detail.messageId) return true;
        if (detail.msgId && message.msg_id === detail.msgId) return true;
        return false;
      });
      if (targetIndex < 0) return;

      hideScrollButton();
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: targetIndex,
          align: detail.align || 'start',
          behavior: detail.behavior || 'smooth',
        });
      });
    };

    window.addEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    return () => {
      window.removeEventListener(CHAT_MESSAGE_JUMP_EVENT, handleMessageJump);
    };
  }, [conversationContext?.conversationId, hideScrollButton, processedList, virtuosoRef]);

  // Click scroll button
  const handleScrollButtonClick = () => {
    hideScrollButton();
    scrollToBottom('smooth');
  };

  const renderItem = (_index: number, item: (typeof processedList)[0]) => {
    const highlighted = matchesTargetMessage(item, highlightedMessageId);
    if ('type' in item && ['file_summary', 'tool_summary'].includes(item.type)) {
      return (
        <div
          key={item.id}
          id={`message-${getProcessedItemAnchorId(item)}`}
          className={'min-w-0 message-item px-8px m-t-10px max-w-full md:max-w-780px mx-auto ' + item.type}
          style={highlighted ? highlightStyle : undefined}
        >
          {item.type === 'file_summary' && <MessageFileChanges diffsChanges={item.diffs} />}
          {item.type === 'tool_summary' && <MessageToolGroupSummary messages={item.messages}></MessageToolGroupSummary>}
        </div>
      );
    }
    if ('type' in item && item.type === 'codex_agent_event_with_transcripts') {
      return (
        <MessageItem
          message={item.message}
          key={item.id}
          highlighted={highlighted}
          isStreaming={item.message.id === streamingMessageId}
          codexAgentTranscripts={item.transcripts}
          codexAgentToolCalls={item.toolCalls}
        ></MessageItem>
      );
    }
    return (
      <MessageItem
        message={item as TMessage}
        key={(item as TMessage).id}
        highlighted={highlighted}
        isStreaming={(item as TMessage).id === streamingMessageId}
      ></MessageItem>
    );
  };

  if (processedList.length === 0 && emptySlot) {
    return <div className='relative flex-1 h-full flex items-center justify-center'>{emptySlot}</div>;
  }

  return (
    <div className='relative flex-1 h-full'>
      {/* Use PreviewGroup to wrap all messages for cross-message image preview */}
      <Image.PreviewGroup actionsLayout={['zoomIn', 'zoomOut', 'originalSize', 'rotateLeft', 'rotateRight']}>
        <ImagePreviewContext.Provider value={{ inPreviewGroup: true }}>
          <Virtuoso
            ref={virtuosoRef}
            scrollerRef={handleScrollerRef}
            className='flex-1 h-full pb-10px box-border'
            data={processedList}
            initialTopMostItemIndex={processedList.length - 1}
            defaultItemHeight={40}
            atBottomThreshold={100}
            increaseViewportBy={1200}
            itemContent={renderItem}
            followOutput={handleFollowOutput}
            onScroll={handleScroll}
            atBottomStateChange={handleAtBottomStateChange}
            components={{
              Header: () => <div className='h-10px' />,
              Footer: () => <div className='h-20px' />,
            }}
          />
        </ImagePreviewContext.Provider>
      </Image.PreviewGroup>

      {showScrollButton && (
        <>
          {/* Gradient mask */}
          <div className='absolute bottom-0 left-0 right-0 h-100px pointer-events-none' />
          {/* Scroll button */}
          <div className='absolute bottom-20px left-50% transform -translate-x-50% z-100'>
            <div
              className='flex items-center justify-center w-40px h-40px rd-full bg-base shadow-lg cursor-pointer hover:bg-1 transition-all hover:scale-110 border-1 border-solid border-3'
              onClick={handleScrollButtonClick}
              title={t('messages.scrollToBottom')}
              style={{ lineHeight: 0 }}
            >
              <Down theme='filled' size='20' fill={iconColors.secondary} style={{ display: 'block' }} />
            </div>
          </div>
        </>
      )}

      <SelectionReplyButton messages={list} />
    </div>
  );
};

export default MessageList;
