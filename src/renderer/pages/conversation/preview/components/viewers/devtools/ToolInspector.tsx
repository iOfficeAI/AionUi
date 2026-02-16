/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tool inspector — detailed view of tool executions with syntax highlighting.
 * Shows tool inputs/outputs with language-appropriate rendering (code, diffs, terminal).
 */

import { Collapse, Input, Tag, Tooltip, Typography } from '@arco-design/web-react';
import React, { useMemo, useState } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { vs, vs2015 } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { detectLanguage, formatDuration, formatTokens, shortenPath, truncate } from './helpers';
import type { ToolExecution } from './types';

type ToolInspectorProps = {
  chunksJson: string;
};

/** Detect theme from document */
function useTheme(): 'light' | 'dark' {
  const [theme, setTheme] = React.useState<'light' | 'dark'>(() => {
    return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light';
  });

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme((document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

/** Determine the display mode for a tool's result */
function getToolDisplayMode(toolName: string, input: Record<string, unknown>): 'code' | 'diff' | 'terminal' | 'json' | 'text' {
  switch (toolName) {
    case 'Read':
      return 'code';
    case 'Edit':
      return 'diff';
    case 'Write':
      return 'code';
    case 'Bash':
      return 'terminal';
    case 'Grep':
    case 'Glob':
      return 'text';
    case 'WebFetch':
    case 'WebSearch':
      return 'text';
    default:
      return 'json';
  }
}

/** Get the language for syntax highlighting based on tool and input */
function getHighlightLanguage(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') {
    const filePath = (input.file_path as string) || (input.path as string) || '';
    return detectLanguage(filePath);
  }
  if (toolName === 'Bash') return 'bash';
  if (toolName === 'Grep' || toolName === 'Glob') return 'text';
  return 'json';
}

/** Code display with syntax highlighting */
const CodeDisplay: React.FC<{ code: string; language: string; maxHeight?: number }> = ({ code, language, maxHeight = 400 }) => {
  const theme = useTheme();
  return (
    <div style={{ maxHeight }} className='overflow-auto rd-4px'>
      <SyntaxHighlighter
        style={theme === 'dark' ? vs2015 : vs}
        language={language}
        PreTag='div'
        wrapLongLines
        customStyle={{
          margin: 0,
          padding: '8px',
          fontSize: '12px',
          background: 'transparent',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

/** Terminal output display */
const TerminalDisplay: React.FC<{ output: string; maxHeight?: number }> = ({ output, maxHeight = 400 }) => {
  return (
    <pre
      className='text-12px font-mono p-8px rd-4px overflow-auto whitespace-pre-wrap break-all'
      style={{
        maxHeight,
        backgroundColor: '#1e1e1e',
        color: '#d4d4d4',
      }}
    >
      {output}
    </pre>
  );
};

/** Diff display */
const DiffDisplay: React.FC<{ input: Record<string, unknown>; result?: string }> = ({ input, result }) => {
  const theme = useTheme();
  const filePath = (input.file_path as string) || '';
  const oldStr = (input.old_string as string) || '';
  const newStr = (input.new_string as string) || '';

  if (oldStr || newStr) {
    // Show the old → new replacement
    return (
      <div className='space-y-4px'>
        {filePath && <div className='text-12px text-t-tertiary font-mono'>{filePath}</div>}
        <div className='grid grid-cols-2 gap-4px'>
          <div>
            <div className='text-11px text-t-quaternary mb-2px'>Old</div>
            <pre className='text-12px font-mono p-8px rd-4px overflow-auto max-h-200px whitespace-pre-wrap break-all bg-[#fdd]' style={{ color: '#a31515' }}>
              {oldStr || '(empty)'}
            </pre>
          </div>
          <div>
            <div className='text-11px text-t-quaternary mb-2px'>New</div>
            <pre className='text-12px font-mono p-8px rd-4px overflow-auto max-h-200px whitespace-pre-wrap break-all bg-[#dfd]' style={{ color: '#22863a' }}>
              {newStr || '(empty)'}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  // Fallback to showing result
  if (result) {
    return <CodeDisplay code={result} language='diff' />;
  }

  return <div className='text-12px text-t-tertiary p-8px'>No diff data available</div>;
};

/** Single tool execution card */
const ToolExecutionCard: React.FC<{ exec: ToolExecution }> = ({ exec }) => {
  const displayMode = getToolDisplayMode(exec.toolName, exec.input);
  const language = getHighlightLanguage(exec.toolName, exec.input);

  const filePath = (exec.input.file_path as string) || (exec.input.path as string) || '';
  const command = (exec.input.command as string) || '';
  const pattern = (exec.input.pattern as string) || '';
  const description = (exec.input.description as string) || '';

  // Build subtitle
  const subtitle = filePath
    ? shortenPath(filePath)
    : command
      ? truncate(description || command, 80)
      : pattern
        ? `"${pattern}"`
        : exec.summary;

  return (
    <Collapse.Item
      name={exec.id}
      header={
        <div className='flex items-center gap-8px w-full'>
          <Tag size='small' color={exec.isError ? 'red' : 'purple'}>
            {exec.toolName}
          </Tag>
          <span className='text-12px text-t-secondary font-mono truncate flex-1' title={subtitle}>
            {subtitle}
          </span>
          {exec.durationMs != null && exec.durationMs > 0 && (
            <span className='text-11px text-t-quaternary flex-shrink-0'>{formatDuration(exec.durationMs)}</span>
          )}
          {exec.isError && (
            <Tag size='small' color='red' className='flex-shrink-0'>
              Error
            </Tag>
          )}
        </div>
      }
    >
      <div className='space-y-8px'>
        {/* Input section */}
        <div>
          <div className='text-11px text-t-quaternary mb-4px font-600'>Input</div>
          {displayMode === 'diff' ? (
            <DiffDisplay input={exec.input} />
          ) : (
            <CodeDisplay code={JSON.stringify(exec.input, null, 2)} language='json' maxHeight={250} />
          )}
        </div>

        {/* Result section */}
        {exec.result != null && (
          <div>
            <div className='text-11px text-t-quaternary mb-4px font-600'>Result</div>
            {displayMode === 'terminal' ? (
              <TerminalDisplay output={exec.result} />
            ) : displayMode === 'code' ? (
              <CodeDisplay code={exec.result} language={language} />
            ) : displayMode === 'diff' ? (
              <CodeDisplay code={exec.result} language='diff' />
            ) : (
              <pre className='text-12px text-t-secondary font-mono bg-bg-3 p-8px rd-4px overflow-auto max-h-400px whitespace-pre-wrap break-all'>
                {exec.result}
              </pre>
            )}
          </div>
        )}
      </div>
    </Collapse.Item>
  );
};

const ToolInspector: React.FC<ToolInspectorProps> = ({ chunksJson }) => {
  const [filter, setFilter] = useState('');
  const [toolFilter, setToolFilter] = useState<string | null>(null);

  // Extract all tool executions from AI chunks
  const executions = useMemo<ToolExecution[]>(() => {
    try {
      const chunks = JSON.parse(chunksJson) as Array<{ chunkType: string; toolExecutions?: ToolExecution[] }>;
      const execs: ToolExecution[] = [];
      for (const chunk of chunks) {
        if (chunk.chunkType === 'ai' && chunk.toolExecutions) {
          execs.push(...chunk.toolExecutions);
        }
      }
      return execs;
    } catch {
      return [];
    }
  }, [chunksJson]);

  // Get unique tool names for filtering
  const toolNames = useMemo(() => {
    const names = new Map<string, number>();
    for (const exec of executions) {
      names.set(exec.toolName, (names.get(exec.toolName) || 0) + 1);
    }
    return Array.from(names.entries()).sort(([, a], [, b]) => b - a);
  }, [executions]);

  // Filter executions
  const filteredExecs = useMemo(() => {
    let result = executions;
    if (toolFilter) {
      result = result.filter((e) => e.toolName === toolFilter);
    }
    if (filter.trim()) {
      const lowerFilter = filter.toLowerCase();
      result = result.filter((e) => {
        return (
          e.toolName.toLowerCase().includes(lowerFilter) ||
          e.summary.toLowerCase().includes(lowerFilter) ||
          JSON.stringify(e.input).toLowerCase().includes(lowerFilter) ||
          (e.result || '').toLowerCase().includes(lowerFilter)
        );
      });
    }
    return result;
  }, [executions, filter, toolFilter]);

  if (executions.length === 0) {
    return <div className='text-13px text-t-tertiary p-12px'>No tool executions found</div>;
  }

  const errorCount = executions.filter((e) => e.isError).length;

  return (
    <div className='h-full flex flex-col'>
      {/* Filters */}
      <div className='flex items-center gap-8px px-12px py-8px border-b-1px border-b-solid border-b-border-2 flex-shrink-0 flex-wrap'>
        <Input.Search
          placeholder='Search tools...'
          size='small'
          style={{ width: 200 }}
          value={filter}
          onChange={setFilter}
          allowClear
        />
        <div className='flex gap-4px flex-wrap'>
          {toolNames.map(([name, count]) => (
            <Tag
              key={name}
              size='small'
              color={toolFilter === name ? 'purple' : undefined}
              className='cursor-pointer'
              onClick={() => setToolFilter((prev) => (prev === name ? null : name))}
            >
              {name} ({count})
            </Tag>
          ))}
        </div>
        {errorCount > 0 && (
          <Tag size='small' color='red'>
            {errorCount} errors
          </Tag>
        )}
        <span className='text-11px text-t-quaternary ml-auto'>
          {filteredExecs.length} / {executions.length} executions
        </span>
      </div>

      {/* Tool execution list */}
      <div className='flex-1 overflow-auto p-12px'>
        <Collapse bordered={false} accordion>
          {filteredExecs.map((exec) => (
            <ToolExecutionCard key={exec.id} exec={exec} />
          ))}
        </Collapse>
      </div>
    </div>
  );
};

export default ToolInspector;
