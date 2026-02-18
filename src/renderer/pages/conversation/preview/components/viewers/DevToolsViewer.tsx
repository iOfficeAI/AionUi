/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DevTools session analysis viewer — displays Claude Code session insights
 * with multi-tab layout: Overview, Chat Replay, Tool Inspector, Context,
 * Subagents, Projects, and Command Palette search.
 * Inspired by claude-devtools (https://github.com/matt1398/claude-devtools).
 */

import { ipcBridge } from '@/common';
import type { IDevToolsSessionAnalysis, IDevToolsCompactionEvent, IDevToolsToolSummary } from '@/common/ipcBridge';
import { Collapse, Empty, Progress, Spin, Statistic, Tag, Tooltip, Typography } from '@arco-design/web-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Sub-components
import ChatReplay from './devtools/ChatReplay';
import CommandPalette from './devtools/CommandPalette';
import SubagentTree from './devtools/SubagentTree';
import ToolInspector from './devtools/ToolInspector';

type DevToolsViewerProps = {
  /** JSON-encoded metadata: { sessionId, workspace } */
  content: string;
};

type TokenCategory = 'user' | 'assistant' | 'thinking' | 'tool_input' | 'tool_output' | 'system' | 'claude_md';

type TabKey = 'overview' | 'chat' | 'tools' | 'subagents';

// ==================== Chunk types (deserialized from JSON) ====================

type SemanticStep = {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'output' | 'subagent';
  content: string;
  startTime: number;
  tokens: { input: number; output: number };
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
  subagentDescription?: string;
};

type ToolExecution = {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  result?: string;
  isError: boolean;
  startTime: number;
  summary: string;
};

type ChunkBase = {
  id: string;
  chunkType: 'user' | 'ai' | 'system' | 'compact';
  startTime: number;
  endTime: number;
};

type UserChunk = ChunkBase & { chunkType: 'user'; text: string };
type AIChunk = ChunkBase & { chunkType: 'ai'; semanticSteps: SemanticStep[]; toolExecutions: ToolExecution[]; subagentIds: string[] };
type SystemChunk = ChunkBase & { chunkType: 'system'; text: string };
type CompactChunk = ChunkBase & { chunkType: 'compact'; text: string; tokenDelta?: number };
type Chunk = UserChunk | AIChunk | SystemChunk | CompactChunk;

// ==================== Constants ====================

const TOKEN_COLORS: Record<TokenCategory, string> = {
  user: '#3491FA',
  assistant: '#0FC6C2',
  thinking: '#F7BA1E',
  tool_input: '#722ED1',
  tool_output: '#9FDB1D',
  system: '#86909C',
  claude_md: '#F77234',
};

const TOKEN_LABELS: Record<TokenCategory, string> = {
  user: 'User Input',
  assistant: 'Assistant Output',
  thinking: 'Thinking',
  tool_input: 'Tool Input',
  tool_output: 'Tool Output',
  system: 'System',
  claude_md: 'CLAUDE.md',
};

const STEP_ICONS: Record<SemanticStep['type'], string> = {
  thinking: '\uD83D\uDCAD',
  tool_call: '\uD83D\uDD27',
  tool_result: '\uD83D\uDCCB',
  output: '\uD83D\uDCAC',
  subagent: '\uD83E\uDD16',
};

const STEP_COLORS: Record<SemanticStep['type'], string> = {
  thinking: '#F7BA1E',
  tool_call: '#722ED1',
  tool_result: '#9FDB1D',
  output: '#0FC6C2',
  subagent: '#3491FA',
};

const TAB_CONFIG: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: 'overview', label: 'Overview', icon: '\uD83D\uDCCA' },
  { key: 'chat', label: 'Chat', icon: '\uD83D\uDCAC' },
  { key: 'tools', label: 'Tools', icon: '\uD83D\uDD27' },
  { key: 'subagents', label: 'Agents', icon: '\uD83E\uDD16' },
];

// ==================== Helpers ====================

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1_000);
  return `${mins}m ${secs}s`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max) + '\u2026';
}

// ==================== Overview Sub-components ====================

/** Overview metrics cards */
const MetricsOverview: React.FC<{ analysis: IDevToolsSessionAnalysis }> = ({ analysis }) => {
  const { metrics, messageCount, model } = analysis;

  return (
    <div className='grid grid-cols-2 md:grid-cols-4 gap-12px mb-20px'>
      <div className='p-12px bg-bg-2 rd-8px'>
        <Statistic title='Total Tokens' value={metrics.totalTokens} groupSeparator suffix={<span className='text-12px text-t-tertiary ml-4px'>({formatTokens(metrics.totalTokens)})</span>} />
      </div>
      <div className='p-12px bg-bg-2 rd-8px'>
        <Statistic title='Duration' value={formatDuration(metrics.durationMs)} />
      </div>
      <div className='p-12px bg-bg-2 rd-8px'>
        <Statistic title='Messages' value={messageCount} groupSeparator />
      </div>
      <div className='p-12px bg-bg-2 rd-8px'>
        <Statistic title='Model' value={model || 'Unknown'} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} />
      </div>
      {metrics.cacheReadTokens > 0 && (
        <div className='p-12px bg-bg-2 rd-8px'>
          <Statistic title='Cache Read' value={metrics.cacheReadTokens} groupSeparator suffix={<span className='text-12px text-t-tertiary ml-4px'>tokens</span>} />
        </div>
      )}
      {metrics.cacheCreationTokens > 0 && (
        <div className='p-12px bg-bg-2 rd-8px'>
          <Statistic title='Cache Create' value={metrics.cacheCreationTokens} groupSeparator suffix={<span className='text-12px text-t-tertiary ml-4px'>tokens</span>} />
        </div>
      )}
    </div>
  );
};

/** Token attribution breakdown with progress bars */
const TokenAttribution: React.FC<{ attribution: IDevToolsSessionAnalysis['tokenAttribution'] }> = ({ attribution }) => {
  const total = useMemo(() => {
    return Object.values(attribution).reduce((sum, v) => sum + v, 0);
  }, [attribution]);

  if (total === 0) return null;

  const categories = (Object.entries(attribution) as [TokenCategory, number][]).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);

  return (
    <div className='mb-20px'>
      <Typography.Title heading={6} className='mb-12px'>
        Token Attribution
      </Typography.Title>

      {/* Stacked bar */}
      <div className='flex h-24px rd-4px overflow-hidden mb-12px'>
        {categories.map(([category, value]) => (
          <Tooltip key={category} content={`${TOKEN_LABELS[category]}: ${formatTokens(value)} (${((value / total) * 100).toFixed(1)}%)`}>
            <div
              style={{
                width: `${(value / total) * 100}%`,
                backgroundColor: TOKEN_COLORS[category],
                minWidth: value > 0 ? '2px' : 0,
              }}
              className='h-full transition-all'
            />
          </Tooltip>
        ))}
      </div>

      {/* Legend */}
      <div className='flex flex-wrap gap-12px'>
        {categories.map(([category, value]) => (
          <div key={category} className='flex items-center gap-6px text-13px'>
            <div className='w-10px h-10px rd-2px' style={{ backgroundColor: TOKEN_COLORS[category] }} />
            <span className='text-t-secondary'>{TOKEN_LABELS[category]}</span>
            <span className='text-t-tertiary'>{formatTokens(value)}</span>
            <span className='text-t-quaternary'>({((value / total) * 100).toFixed(1)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/** Tool usage summary table */
const ToolUsageSummary: React.FC<{ tools: IDevToolsToolSummary[] }> = ({ tools }) => {
  if (tools.length === 0) return null;

  const totalCalls = tools.reduce((sum, t) => sum + t.count, 0);

  return (
    <div className='mb-20px'>
      <Typography.Title heading={6} className='mb-12px'>
        Tool Usage ({totalCalls} calls)
      </Typography.Title>

      <div className='space-y-8px'>
        {tools.map((tool) => {
          const pct = totalCalls > 0 ? (tool.count / totalCalls) * 100 : 0;
          return (
            <div key={tool.toolName} className='flex items-center gap-12px'>
              <div className='w-100px text-13px text-t-primary font-mono truncate' title={tool.toolName}>
                {tool.toolName}
              </div>
              <div className='flex-1'>
                <Progress percent={pct} showText={false} size='small' color='#3491FA' />
              </div>
              <div className='flex items-center gap-8px min-w-120px justify-end'>
                <span className='text-13px text-t-secondary'>{tool.count}x</span>
                {tool.totalDurationMs > 0 && <span className='text-12px text-t-tertiary'>({formatDuration(tool.totalDurationMs)})</span>}
                {tool.errorCount > 0 && (
                  <Tag size='small' color='red'>
                    {tool.errorCount} err
                  </Tag>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Single semantic step row inside the timeline */
const StepRow: React.FC<{ step: SemanticStep }> = ({ step }) => {
  const [expanded, setExpanded] = useState(false);
  const icon = STEP_ICONS[step.type];
  const color = STEP_COLORS[step.type];
  const tokens = step.tokens.input + step.tokens.output;

  const label = useMemo(() => {
    switch (step.type) {
      case 'thinking':
        return 'Thinking';
      case 'tool_call':
        return step.toolName || 'Tool Call';
      case 'tool_result':
        return step.isError ? 'Error' : 'Result';
      case 'output':
        return 'Output';
      case 'subagent':
        return 'Subagent';
    }
  }, [step]);

  const preview = useMemo(() => {
    if (step.type === 'tool_call' && step.toolInput) {
      const input = step.toolInput;
      if (input.file_path) return String(input.file_path);
      if (input.command) return truncate(String(input.command), 80);
      if (input.pattern) return String(input.pattern);
      if (input.query) return String(input.query);
      if (input.url) return String(input.url);
      return truncate(JSON.stringify(input), 80);
    }
    return truncate(step.content || '', 120);
  }, [step]);

  const hasDetail = step.content && step.content.length > 120;

  return (
    <div className='mb-2px'>
      <div className='flex items-start gap-8px py-4px px-8px rd-4px hover:bg-bg-2 cursor-pointer text-13px' onClick={() => hasDetail && setExpanded(!expanded)}>
        <span className='flex-shrink-0 w-20px text-center select-none'>{icon}</span>
        <Tag size='small' style={{ backgroundColor: color + '20', color, borderColor: color + '40' }}>
          {label}
        </Tag>
        <span className='flex-1 text-t-secondary font-mono text-12px truncate' title={step.content}>
          {preview}
        </span>
        {tokens > 0 && <span className='flex-shrink-0 text-11px text-t-quaternary'>{formatTokens(tokens)}</span>}
        {hasDetail && <span className='flex-shrink-0 text-t-quaternary text-11px select-none'>{expanded ? '\u25BC' : '\u25B6'}</span>}
      </div>

      {expanded && step.content && (
        <div className='ml-28px mr-8px mb-4px'>
          <pre className='text-12px text-t-secondary font-mono bg-bg-3 p-8px rd-4px overflow-auto max-h-200px whitespace-pre-wrap break-all'>
            {step.content.slice(0, 2000)}
            {step.content.length > 2000 && '\n\u2026 (truncated)'}
          </pre>
        </div>
      )}
    </div>
  );
};

/** Single chunk in the event timeline */
const ChunkItem: React.FC<{ chunk: Chunk }> = ({ chunk }) => {
  if (chunk.chunkType === 'user') {
    const userChunk = chunk as UserChunk;
    return (
      <div className='mb-12px'>
        <div className='flex items-center gap-8px mb-4px'>
          <div className='w-3px h-16px rd-2px bg-#3491FA' />
          <span className='text-13px font-600 text-t-primary'>User</span>
          <span className='text-11px text-t-quaternary'>{formatTime(chunk.startTime)}</span>
        </div>
        <div className='ml-11px pl-12px border-l-1px border-l-solid border-l-border-2'>
          <div className='text-13px text-t-secondary bg-bg-2 p-8px rd-6px'>{truncate(userChunk.text || '', 300)}</div>
        </div>
      </div>
    );
  }

  if (chunk.chunkType === 'ai') {
    const aiChunk = chunk as AIChunk;
    const steps = aiChunk.semanticSteps || [];
    const toolCount = (aiChunk.toolExecutions || []).length;

    return (
      <div className='mb-12px'>
        <div className='flex items-center gap-8px mb-4px'>
          <div className='w-3px h-16px rd-2px bg-#0FC6C2' />
          <span className='text-13px font-600 text-t-primary'>Assistant</span>
          <span className='text-11px text-t-quaternary'>{formatTime(chunk.startTime)}</span>
          {toolCount > 0 && (
            <Tag size='small' color='purple'>
              {toolCount} tool{toolCount !== 1 ? 's' : ''}
            </Tag>
          )}
          {(aiChunk.subagentIds || []).length > 0 && (
            <Tag size='small' color='blue'>
              {aiChunk.subagentIds.length} subagent{aiChunk.subagentIds.length !== 1 ? 's' : ''}
            </Tag>
          )}
        </div>
        <div className='ml-11px pl-12px border-l-1px border-l-solid border-l-border-2'>{steps.length > 0 ? steps.map((step) => <StepRow key={step.id} step={step} />) : <div className='text-12px text-t-tertiary py-4px px-8px'>No steps recorded</div>}</div>
      </div>
    );
  }

  if (chunk.chunkType === 'compact') {
    const compactChunk = chunk as CompactChunk;
    return (
      <div className='mb-12px'>
        <div className='flex items-center gap-8px py-6px px-12px bg-bg-3 rd-6px border-1px border-solid border-border-2'>
          <span className='text-14px select-none'>{'\uD83D\uDCE6'}</span>
          <span className='text-13px text-t-tertiary font-600'>Context Compaction</span>
          <span className='text-11px text-t-quaternary'>{formatTime(chunk.startTime)}</span>
          {compactChunk.tokenDelta && (
            <Tag size='small' color='orange'>
              {formatTokens(compactChunk.tokenDelta)} tokens saved
            </Tag>
          )}
        </div>
      </div>
    );
  }

  if (chunk.chunkType === 'system') {
    const systemChunk = chunk as SystemChunk;
    return (
      <div className='mb-12px'>
        <div className='flex items-center gap-8px mb-4px'>
          <div className='w-3px h-16px rd-2px bg-#86909C' />
          <span className='text-13px font-600 text-t-tertiary'>System</span>
          <span className='text-11px text-t-quaternary'>{formatTime(chunk.startTime)}</span>
        </div>
        <div className='ml-11px pl-12px border-l-1px border-l-solid border-l-border-2'>
          <div className='text-12px text-t-tertiary font-mono bg-bg-3 p-8px rd-4px max-h-100px overflow-auto'>{truncate(systemChunk.text || '', 200)}</div>
        </div>
      </div>
    );
  }

  return null;
};

/** Event timeline showing conversation flow with semantic steps */
const EventTimeline: React.FC<{ chunksJson: string }> = ({ chunksJson }) => {
  const chunks = useMemo<Chunk[]>(() => {
    try {
      return JSON.parse(chunksJson) as Chunk[];
    } catch {
      return [];
    }
  }, [chunksJson]);

  if (chunks.length === 0) return null;

  const totalSteps = chunks.reduce((sum, c) => {
    if (c.chunkType === 'ai') return sum + ((c as AIChunk).semanticSteps || []).length;
    return sum + 1;
  }, 0);

  return (
    <div className='mb-20px'>
      <Collapse bordered={false} defaultActiveKey={['timeline']}>
        <Collapse.Item
          name='timeline'
          header={
            <Typography.Title heading={6} style={{ margin: 0 }}>
              Event Timeline ({chunks.length} turns, {totalSteps} steps)
            </Typography.Title>
          }
        >
          <div className='pt-8px'>
            {chunks.map((chunk) => (
              <ChunkItem key={chunk.id} chunk={chunk} />
            ))}
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

/** Compaction events summary */
const CompactionSummary: React.FC<{ events: IDevToolsCompactionEvent[] }> = ({ events }) => {
  if (events.length === 0) return null;

  const totalSaved = events.reduce((sum, e) => sum + Math.abs(e.delta), 0);

  return (
    <div className='mb-20px'>
      <Collapse bordered={false}>
        <Collapse.Item
          name='compaction'
          header={
            <Typography.Title heading={6} style={{ margin: 0 }}>
              Compaction Events ({events.length}, {formatTokens(totalSaved)} tokens recycled)
            </Typography.Title>
          }
        >
          <div className='pt-8px space-y-4px'>
            {events.map((event) => (
              <div key={event.index} className='flex items-center gap-8px text-12px py-2px'>
                <span className='text-t-quaternary w-70px flex-shrink-0'>{formatTime(event.timestamp)}</span>
                <Tag size='small' color={event.delta < 0 ? 'red' : 'green'}>
                  {event.delta < 0 ? '' : '+'}
                  {formatTokens(event.delta)}
                </Tag>
                <span className='text-t-tertiary'>
                  {formatTokens(event.tokensBefore)} \u2192 {formatTokens(event.tokensAfter)}
                </span>
                <span className='text-t-quaternary truncate flex-1'>{truncate(event.text, 60)}</span>
              </div>
            ))}
          </div>
        </Collapse.Item>
      </Collapse>
    </div>
  );
};

/** Session timing info */
const SessionTiming: React.FC<{ analysis: IDevToolsSessionAnalysis }> = ({ analysis }) => {
  return (
    <div className='mb-20px'>
      <Typography.Title heading={6} className='mb-12px'>
        Session Info
      </Typography.Title>
      <div className='grid grid-cols-2 gap-8px text-13px'>
        <div className='flex items-center gap-8px'>
          <span className='text-t-tertiary'>Started:</span>
          <span className='text-t-secondary'>{new Date(analysis.startTime).toLocaleString()}</span>
        </div>
        <div className='flex items-center gap-8px'>
          <span className='text-t-tertiary'>Ended:</span>
          <span className='text-t-secondary'>{new Date(analysis.endTime).toLocaleString()}</span>
        </div>
        <div className='flex items-center gap-8px'>
          <span className='text-t-tertiary'>Session ID:</span>
          <span className='text-t-secondary font-mono text-12px truncate' title={analysis.sessionId}>
            {analysis.sessionId}
          </span>
        </div>
        <div className='flex items-center gap-8px'>
          <span className='text-t-tertiary'>Project:</span>
          <span className='text-t-secondary font-mono text-12px truncate' title={analysis.projectPath}>
            {analysis.projectPath}
          </span>
        </div>
      </div>
    </div>
  );
};

/** Overview tab content */
const OverviewTab: React.FC<{ analysis: IDevToolsSessionAnalysis }> = ({ analysis }) => {
  return (
    <div className='h-full overflow-auto p-20px'>
      <div className='max-w-800px mx-auto'>
        <MetricsOverview analysis={analysis} />
        {analysis.tokenAttribution && <TokenAttribution attribution={analysis.tokenAttribution} />}
        <EventTimeline chunksJson={analysis.chunks} />
        <ToolUsageSummary tools={analysis.toolExecutionSummary ?? []} />
        <CompactionSummary events={analysis.compactionEvents ?? []} />
        <SessionTiming analysis={analysis} />
      </div>
    </div>
  );
};

// ==================== Tab Bar ====================

const TabBar: React.FC<{
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  subagentCount: number;
  onSearch: () => void;
}> = ({ activeTab, onTabChange, subagentCount, onSearch }) => {
  return (
    <div className='flex items-center gap-2px px-8px py-4px border-b-1px border-b-solid border-b-border-2 bg-bg-2 flex-shrink-0'>
      {TAB_CONFIG.map(({ key, label, icon }) => {
        const isActive = activeTab === key;
        const badge = key === 'subagents' && subagentCount > 0 ? subagentCount : null;
        return (
          <div key={key} className={`flex items-center gap-4px px-10px py-5px rd-4px cursor-pointer text-12px transition-colors select-none ${isActive ? 'bg-bg-1 text-t-primary font-600 shadow-sm' : 'text-t-tertiary hover:text-t-secondary hover:bg-bg-3'}`} onClick={() => onTabChange(key)}>
            <span>{icon}</span>
            <span>{label}</span>
            {badge != null && <span className='text-10px bg-primary-1 text-primary px-4px rd-full'>{badge}</span>}
          </div>
        );
      })}
      <div className='ml-auto'>
        <div className='flex items-center gap-4px px-10px py-5px rd-4px cursor-pointer text-12px text-t-tertiary hover:text-t-secondary hover:bg-bg-3 transition-colors select-none' onClick={onSearch} title='Search (Cmd+K)'>
          <span>{'\uD83D\uDD0D'}</span>
          <span>Search</span>
          <kbd className='text-10px px-4px py-1px bg-bg-3 rd-2px text-t-quaternary ml-4px'>{'\u2318'}K</kbd>
        </div>
      </div>
    </div>
  );
};

// ==================== Main Component ====================

/** Auto-refresh polling interval in milliseconds */
const POLL_INTERVAL_MS = 5_000;

const DevToolsViewer: React.FC<DevToolsViewerProps> = ({ content }) => {
  const { t } = useTranslation();
  const [analysis, setAnalysis] = useState<IDevToolsSessionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [showSearch, setShowSearch] = useState(false);
  const [liveMode, setLiveMode] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFetchingRef = useRef(false);

  // Parse the content to get sessionId and workspace
  const params = useMemo(() => {
    try {
      return JSON.parse(content) as { sessionId: string; workspace?: string };
    } catch {
      return null;
    }
  }, [content]);

  // Core fetch function — used for both initial load and polling refreshes
  const fetchAnalysis = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!params?.sessionId) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const result = await ipcBridge.devtools.analyzeSession.invoke({
          sessionId: params.sessionId,
          workspace: params.workspace,
        });

        if (result.success && result.data) {
          setAnalysis(result.data);
          setLastRefreshedAt(Date.now());
          if (!opts.silent) setError(null);
        } else if (!opts.silent) {
          setError(result.msg || 'Failed to analyze session');
        }
      } catch (err) {
        if (!opts.silent) {
          setError(err instanceof Error ? err.message : 'Unexpected error');
        }
      } finally {
        isFetchingRef.current = false;
        if (!opts.silent) {
          setLoading(false);
        }
      }
    },
    [params?.sessionId, params?.workspace]
  );

  // Initial load
  useEffect(() => {
    if (!params?.sessionId) {
      setError('No session ID provided');
      setLoading(false);
      return;
    }

    void fetchAnalysis();
  }, [params?.sessionId, params?.workspace, fetchAnalysis]);

  // Polling for realtime updates
  useEffect(() => {
    if (!params?.sessionId || !liveMode) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(() => {
      void fetchAnalysis({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [params?.sessionId, liveMode, fetchAnalysis]);

  // Keyboard shortcut for Cmd+K search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setShowSearch((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleOpenSession = useCallback((sessionId: string, workspace?: string) => {
    // Re-analyze with new session — reset tabs and re-enable live mode
    setActiveTab('overview');
    setLiveMode(true);

    // Update params won't help here since content is a prop, so do a direct fetch
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const result = await ipcBridge.devtools.analyzeSession.invoke({ sessionId, workspace });
        if (result.success && result.data) {
          setAnalysis(result.data);
          setLastRefreshedAt(Date.now());
        } else {
          setError(result.msg || 'Failed to analyze session');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  if (loading) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Spin size={32} tip='Analyzing session...' />
      </div>
    );
  }

  if (error) {
    return (
      <div className='h-full flex items-center justify-center p-20px'>
        <Empty description={error} />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className='h-full flex items-center justify-center'>
        <Empty description={t('common.noData', { defaultValue: 'No data available' })} />
      </div>
    );
  }

  return (
    <div className='h-full flex flex-col'>
      {/* Header */}
      <div className='flex items-center gap-8px px-12px py-6px border-b-1px border-b-solid border-b-border-2 flex-shrink-0'>
        <Typography.Title heading={6} style={{ margin: 0 }} className='flex items-center gap-8px'>
          Session Insights
          <Tag size='small' color='arcoblue'>
            claude-devtools
          </Tag>
        </Typography.Title>
        <div className='ml-auto flex items-center gap-8px'>
          {lastRefreshedAt && <span className='text-10px text-t-quaternary'>{new Date(lastRefreshedAt).toLocaleTimeString()}</span>}
          <Tooltip content={liveMode ? 'Auto-refresh ON (click to pause)' : 'Auto-refresh OFF (click to resume)'}>
            <div className='flex items-center gap-4px px-6px py-2px rd-4px cursor-pointer select-none transition-colors hover:bg-bg-3' onClick={() => setLiveMode((prev) => !prev)}>
              <span
                className='inline-block w-6px h-6px rd-full'
                style={{
                  backgroundColor: liveMode ? '#00B42A' : '#86909C',
                  boxShadow: liveMode ? '0 0 4px #00B42A' : 'none',
                }}
              />
              <span className={`text-11px ${liveMode ? 'text-green-6' : 'text-t-quaternary'}`}>{liveMode ? 'Live' : 'Paused'}</span>
            </div>
          </Tooltip>
          <span className='text-11px text-t-quaternary font-mono'>{analysis.sessionId}</span>
        </div>
      </div>

      {/* Tab bar */}
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} subagentCount={analysis.subagents?.length || 0} onSearch={() => setShowSearch(true)} />

      {/* Tab content */}
      <div className='flex-1 min-h-0'>
        {activeTab === 'overview' && <OverviewTab analysis={analysis} />}
        {activeTab === 'chat' && <ChatReplay messagesJson={analysis.messages} />}
        {activeTab === 'tools' && <ToolInspector chunksJson={analysis.chunks} />}
        {activeTab === 'subagents' && <SubagentTree subagents={analysis.subagents || []} totalMetrics={analysis.metrics} />}
      </div>

      {/* Command palette overlay */}
      {showSearch && <CommandPalette messagesJson={analysis.messages} chunksJson={analysis.chunks} onClose={() => setShowSearch(false)} />}
    </div>
  );
};

export default DevToolsViewer;
