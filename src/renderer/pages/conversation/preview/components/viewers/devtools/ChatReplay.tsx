/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Chat history replay — full conversation view with expandable messages.
 * Shows user input, assistant output, thinking blocks, tool calls and results.
 */

import { Collapse, Input, Tag, Tooltip, Typography } from '@arco-design/web-react';
import React, { useCallback, useMemo, useState } from 'react';
import { formatTime, formatTokens, truncate } from './helpers';
import type { ContentBlock, ParsedMessage, ToolCall, ToolResult } from './types';
import { STEP_COLORS } from './types';

type ChatReplayProps = {
  messagesJson: string;
};

/** Render content blocks with appropriate formatting */
const ContentBlockRenderer: React.FC<{ blocks: ContentBlock[]; maxHeight?: number }> = ({ blocks, maxHeight = 300 }) => {
  return (
    <div className='space-y-4px'>
      {blocks.map((block, i) => {
        if (block.type === 'thinking' && block.thinking) {
          return (
            <Collapse key={i} bordered={false}>
              <Collapse.Item
                name={`thinking-${i}`}
                header={
                  <span className='text-12px text-t-tertiary flex items-center gap-4px'>
                    <span style={{ color: STEP_COLORS.thinking }}>Thinking</span>
                    <span className='text-11px text-t-quaternary'>({formatTokens(Math.ceil(block.thinking.length / 4))} tokens)</span>
                  </span>
                }
              >
                <pre
                  className='text-12px text-t-secondary font-mono bg-bg-3 p-8px rd-4px overflow-auto whitespace-pre-wrap break-words'
                  style={{ maxHeight }}
                >
                  {block.thinking}
                </pre>
              </Collapse.Item>
            </Collapse>
          );
        }

        if (block.type === 'tool_use' && block.name) {
          const inputStr = JSON.stringify(block.input || {}, null, 2);
          return (
            <div key={i} className='border-1px border-solid border-border-2 rd-6px overflow-hidden'>
              <div className='flex items-center gap-8px px-8px py-4px bg-bg-3'>
                <Tag size='small' color='purple'>
                  {block.name}
                </Tag>
                <span className='text-11px text-t-quaternary font-mono'>{block.id}</span>
              </div>
              <Collapse bordered={false}>
                <Collapse.Item name='input' header={<span className='text-12px text-t-tertiary'>Input</span>}>
                  <pre
                    className='text-12px text-t-secondary font-mono bg-bg-3 p-8px rd-4px overflow-auto whitespace-pre-wrap break-all'
                    style={{ maxHeight }}
                  >
                    {inputStr}
                  </pre>
                </Collapse.Item>
              </Collapse>
            </div>
          );
        }

        if (block.type === 'text' && block.text) {
          return (
            <div key={i} className='text-13px text-t-primary whitespace-pre-wrap break-words'>
              {block.text}
            </div>
          );
        }

        if (block.type === 'tool_result') {
          const resultContent = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
          return (
            <div key={i} className='border-1px border-solid border-border-2 rd-6px overflow-hidden'>
              <div className='flex items-center gap-8px px-8px py-4px bg-bg-3'>
                <Tag size='small' color={block.is_error ? 'red' : 'green'}>
                  {block.is_error ? 'Error' : 'Result'}
                </Tag>
                <span className='text-11px text-t-quaternary font-mono'>{block.tool_use_id}</span>
              </div>
              <pre
                className='text-12px text-t-secondary font-mono p-8px overflow-auto whitespace-pre-wrap break-all'
                style={{ maxHeight }}
              >
                {resultContent}
              </pre>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

/** Tool call display */
const ToolCallDisplay: React.FC<{ calls: ToolCall[] }> = ({ calls }) => {
  if (calls.length === 0) return null;
  return (
    <div className='flex flex-wrap gap-4px mt-4px'>
      {calls.map((call) => (
        <Tooltip key={call.id} content={`${call.name}: ${truncate(JSON.stringify(call.input), 200)}`}>
          <Tag size='small' color='purple'>
            {call.name}
          </Tag>
        </Tooltip>
      ))}
    </div>
  );
};

/** Tool result display */
const ToolResultDisplay: React.FC<{ results: ToolResult[] }> = ({ results }) => {
  if (results.length === 0) return null;
  return (
    <div className='mt-4px space-y-4px'>
      {results.map((result) => (
        <Collapse key={result.toolUseId} bordered={false}>
          <Collapse.Item
            name={result.toolUseId}
            header={
              <span className='text-12px flex items-center gap-4px'>
                <Tag size='small' color={result.isError ? 'red' : 'green'}>
                  {result.isError ? 'Error' : 'Result'}
                </Tag>
                <span className='text-t-quaternary font-mono'>{result.toolUseId}</span>
              </span>
            }
          >
            <pre className='text-12px text-t-secondary font-mono bg-bg-3 p-8px rd-4px overflow-auto max-h-200px whitespace-pre-wrap break-all'>
              {result.content || '(empty)'}
            </pre>
          </Collapse.Item>
        </Collapse>
      ))}
    </div>
  );
};

/** Single message card in the replay */
const MessageCard: React.FC<{ message: ParsedMessage; index: number }> = ({ message, index }) => {
  const isUser = message.type === 'user' && !message.isMeta && message.toolResults.length === 0;
  const isAssistant = message.type === 'assistant';
  const isSystem = message.type === 'system';
  const isMeta = message.isMeta;
  const isToolResult = message.type === 'user' && message.toolResults.length > 0;
  const isSummary = message.type === 'summary';

  const borderColor = isUser ? '#3491FA' : isAssistant ? '#0FC6C2' : isSystem ? '#86909C' : isSummary ? '#F7BA1E' : '#C9CDD4';
  const label = isUser
    ? 'User'
    : isAssistant
      ? 'Assistant'
      : isSystem
        ? 'System'
        : isMeta
          ? 'Meta'
          : isToolResult
            ? 'Tool Result'
            : isSummary
              ? 'Summary'
              : message.type;

  const usageText = message.usage
    ? `${formatTokens(message.usage.input_tokens)} in / ${formatTokens(message.usage.output_tokens)} out`
    : null;

  return (
    <div className='mb-8px'>
      <div className='flex items-center gap-8px mb-2px'>
        <div className='w-3px h-14px rd-2px' style={{ backgroundColor: borderColor }} />
        <span className='text-12px font-600' style={{ color: borderColor }}>
          {label}
        </span>
        <span className='text-11px text-t-quaternary'>#{index + 1}</span>
        <span className='text-11px text-t-quaternary'>{formatTime(message.timestamp)}</span>
        {message.model && (
          <span className='text-10px text-t-quaternary font-mono'>{message.model}</span>
        )}
        {usageText && (
          <span className='text-10px text-t-quaternary'>{usageText}</span>
        )}
      </div>
      <div className='ml-11px pl-10px border-l-1px border-l-solid border-l-border-2'>
        {/* Content */}
        {typeof message.content === 'string' ? (
          <div className='text-13px text-t-secondary whitespace-pre-wrap break-words max-h-400px overflow-auto'>
            {message.content || (isToolResult ? '' : '(empty)')}
          </div>
        ) : (
          <ContentBlockRenderer blocks={message.content as ContentBlock[]} />
        )}

        {/* Tool calls */}
        <ToolCallDisplay calls={message.toolCalls} />

        {/* Tool results from toolResults field */}
        <ToolResultDisplay results={message.toolResults} />
      </div>
    </div>
  );
};

const ChatReplay: React.FC<ChatReplayProps> = ({ messagesJson }) => {
  const [filter, setFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const messages = useMemo<ParsedMessage[]>(() => {
    try {
      return JSON.parse(messagesJson) as ParsedMessage[];
    } catch {
      return [];
    }
  }, [messagesJson]);

  const filteredMessages = useMemo(() => {
    let result = messages;

    // Filter by type
    if (typeFilter) {
      result = result.filter((m) => {
        if (typeFilter === 'user') return m.type === 'user' && !m.isMeta && m.toolResults.length === 0;
        if (typeFilter === 'assistant') return m.type === 'assistant';
        if (typeFilter === 'tool') return m.toolResults.length > 0 || m.toolCalls.length > 0;
        if (typeFilter === 'system') return m.type === 'system' || m.isMeta;
        return true;
      });
    }

    // Filter by search text
    if (filter.trim()) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((m) => {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
        return text.toLowerCase().includes(lowerFilter);
      });
    }

    return result;
  }, [messages, filter, typeFilter]);

  const handleTypeFilter = useCallback(
    (type: string) => {
      setTypeFilter((prev) => (prev === type ? null : type));
    },
    [],
  );

  if (messages.length === 0) {
    return <div className='text-13px text-t-tertiary p-12px'>No messages to display</div>;
  }

  const typeCounts = useMemo(() => {
    const counts = { user: 0, assistant: 0, tool: 0, system: 0 };
    for (const m of messages) {
      if (m.type === 'user' && !m.isMeta && m.toolResults.length === 0) counts.user++;
      else if (m.type === 'assistant') counts.assistant++;
      else if (m.toolResults.length > 0 || m.toolCalls.length > 0) counts.tool++;
      else counts.system++;
    }
    return counts;
  }, [messages]);

  return (
    <div className='h-full flex flex-col'>
      {/* Filters */}
      <div className='flex items-center gap-8px px-12px py-8px border-b-1px border-b-solid border-b-border-2 flex-shrink-0'>
        <Input.Search
          placeholder='Search messages...'
          size='small'
          style={{ width: 200 }}
          value={filter}
          onChange={setFilter}
          allowClear
        />
        <div className='flex gap-4px'>
          <Tag
            size='small'
            color={typeFilter === 'user' ? 'blue' : undefined}
            className='cursor-pointer'
            onClick={() => handleTypeFilter('user')}
          >
            User ({typeCounts.user})
          </Tag>
          <Tag
            size='small'
            color={typeFilter === 'assistant' ? 'cyan' : undefined}
            className='cursor-pointer'
            onClick={() => handleTypeFilter('assistant')}
          >
            Assistant ({typeCounts.assistant})
          </Tag>
          <Tag
            size='small'
            color={typeFilter === 'tool' ? 'purple' : undefined}
            className='cursor-pointer'
            onClick={() => handleTypeFilter('tool')}
          >
            Tools ({typeCounts.tool})
          </Tag>
          <Tag
            size='small'
            color={typeFilter === 'system' ? 'gray' : undefined}
            className='cursor-pointer'
            onClick={() => handleTypeFilter('system')}
          >
            System ({typeCounts.system})
          </Tag>
        </div>
        <span className='text-11px text-t-quaternary ml-auto'>
          {filteredMessages.length} / {messages.length} messages
        </span>
      </div>

      {/* Message list */}
      <div className='flex-1 overflow-auto p-12px'>
        {filteredMessages.map((msg, i) => (
          <MessageCard key={msg.uuid} message={msg} index={messages.indexOf(msg)} />
        ))}
      </div>
    </div>
  );
};

export default ChatReplay;
