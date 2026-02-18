/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Command palette — Cmd+K search overlay across messages and tools.
 * Provides full-text search with categorized results.
 */

import { Input, Tag } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatTime, formatTokens, truncate } from './helpers';
import type { ParsedMessage, ToolExecution } from './types';

type SearchResult = {
  id: string;
  type: 'message' | 'tool' | 'thinking';
  title: string;
  preview: string;
  timestamp: number;
  metadata?: string;
};

type CommandPaletteProps = {
  messagesJson: string;
  chunksJson: string;
  onClose: () => void;
  onSelectMessage?: (uuid: string) => void;
};

/** Extract searchable items from messages and chunks */
function buildSearchIndex(messagesJson: string, chunksJson: string): SearchResult[] {
  const items: SearchResult[] = [];

  try {
    const messages = JSON.parse(messagesJson) as ParsedMessage[];
    for (const msg of messages) {
      // User messages
      if (msg.type === 'user' && !msg.isMeta && msg.toolResults.length === 0) {
        const text = typeof msg.content === 'string' ? msg.content : '';
        if (text.trim()) {
          items.push({
            id: msg.uuid,
            type: 'message',
            title: 'User',
            preview: text,
            timestamp: msg.timestamp,
          });
        }
      }

      // Assistant messages — text blocks
      if (msg.type === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content as Array<{ type: string; text?: string; thinking?: string; name?: string }>) {
          if (block.type === 'text' && block.text) {
            items.push({
              id: `${msg.uuid}-text`,
              type: 'message',
              title: 'Assistant',
              preview: block.text,
              timestamp: msg.timestamp,
            });
          }
          if (block.type === 'thinking' && block.thinking) {
            items.push({
              id: `${msg.uuid}-thinking`,
              type: 'thinking',
              title: 'Thinking',
              preview: block.thinking,
              timestamp: msg.timestamp,
            });
          }
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  // Tool executions from chunks
  try {
    const chunks = JSON.parse(chunksJson) as Array<{ chunkType: string; toolExecutions?: ToolExecution[] }>;
    for (const chunk of chunks) {
      if (chunk.chunkType === 'ai' && chunk.toolExecutions) {
        for (const exec of chunk.toolExecutions) {
          items.push({
            id: exec.id,
            type: 'tool',
            title: exec.toolName,
            preview: exec.summary + (exec.result ? '\n' + exec.result.slice(0, 200) : ''),
            timestamp: exec.startTime,
            metadata: exec.isError ? 'error' : undefined,
          });
        }
      }
    }
  } catch {
    // Ignore parse errors
  }

  return items;
}

const TYPE_COLORS: Record<string, string> = {
  message: 'arcoblue',
  tool: 'purple',
  thinking: 'orangered',
};

const CommandPalette: React.FC<CommandPaletteProps> = ({ messagesJson, chunksJson, onClose, onSelectMessage }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const searchIndex = useMemo(() => buildSearchIndex(messagesJson, chunksJson), [messagesJson, chunksJson]);

  const results = useMemo(() => {
    if (!query.trim()) return searchIndex.slice(0, 20);
    const lowerQuery = query.toLowerCase();
    return searchIndex.filter((item) => item.preview.toLowerCase().includes(lowerQuery) || item.title.toLowerCase().includes(lowerQuery)).slice(0, 50);
  }, [searchIndex, query]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [results]);

  // Scroll selected item into view
  useEffect(() => {
    if (resultsRef.current) {
      const selected = resultsRef.current.children[selectedIndex] as HTMLElement;
      selected?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }
      if (e.key === 'Enter' && results[selectedIndex]) {
        const item = results[selectedIndex];
        if (item.type === 'message' && onSelectMessage) {
          onSelectMessage(item.id);
        }
        return;
      }
    },
    [results, selectedIndex, onClose, onSelectMessage]
  );

  return (
    <div className='fixed inset-0 z-1000 flex items-start justify-center pt-80px bg-black/40' onClick={onClose}>
      <div className='w-600px max-h-500px bg-bg-1 rd-12px shadow-lg border-1px border-solid border-border-2 flex flex-col overflow-hidden' onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* Search input */}
        <div className='px-12px py-8px border-b-1px border-b-solid border-b-border-2'>
          <Input ref={inputRef as any} placeholder='Search messages, tools, thinking...' size='large' value={query} onChange={setQuery} allowClear prefix={<span className='text-t-quaternary'>Search</span>} />
        </div>

        {/* Results */}
        <div ref={resultsRef} className='flex-1 overflow-auto'>
          {results.length === 0 ? (
            <div className='text-13px text-t-tertiary p-12px text-center'>No results found</div>
          ) : (
            results.map((item, i) => (
              <div
                key={item.id}
                className={`flex items-start gap-8px px-12px py-8px cursor-pointer transition-colors ${i === selectedIndex ? 'bg-primary-1' : 'hover:bg-bg-3'}`}
                onClick={() => {
                  if (item.type === 'message' && onSelectMessage) {
                    onSelectMessage(item.id);
                  }
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <Tag size='small' color={TYPE_COLORS[item.type] || 'gray'} className='flex-shrink-0 mt-2px'>
                  {item.title}
                </Tag>
                <div className='flex-1 min-w-0'>
                  <div className='text-13px text-t-secondary truncate'>{truncate(item.preview, 120)}</div>
                  <div className='text-11px text-t-quaternary mt-2px'>
                    {formatTime(item.timestamp)}
                    {item.metadata === 'error' && (
                      <Tag size='small' color='red' className='ml-4px'>
                        Error
                      </Tag>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className='px-12px py-6px border-t-1px border-t-solid border-t-border-2 flex items-center gap-12px text-11px text-t-quaternary'>
          <span>{results.length} results</span>
          <span className='ml-auto'>
            <kbd className='px-4px py-1px bg-bg-3 rd-2px'>↑↓</kbd> Navigate <kbd className='px-4px py-1px bg-bg-3 rd-2px'>Enter</kbd> Select <kbd className='px-4px py-1px bg-bg-3 rd-2px'>Esc</kbd> Close
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
