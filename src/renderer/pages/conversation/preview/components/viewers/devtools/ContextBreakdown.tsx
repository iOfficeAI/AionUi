/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Context injection breakdown — shows what context is injected into each turn.
 * Visualizes CLAUDE.md, system reminders, tool I/O, user input, and thinking tokens.
 */

import type { IDevToolsContextBreakdownSummary } from '@/common/ipcBridge';
import { Collapse, Progress, Tooltip, Typography } from '@arco-design/web-react';
import React, { useMemo } from 'react';
import { formatTokens, truncate } from './helpers';
import type { MessageContextInfo } from './types';
import { CONTEXT_TYPE_COLORS, CONTEXT_TYPE_LABELS } from './types';

type ContextBreakdownProps = {
  contextBreakdown: IDevToolsContextBreakdownSummary | undefined;
  contextInfoJson: string;
};

/** Stacked bar for a single message's context injections */
const InjectionBar: React.FC<{ info: MessageContextInfo; maxTokens: number }> = ({ info, maxTokens }) => {
  if (info.totalTokens === 0) return null;
  const barWidth = Math.max((info.totalTokens / maxTokens) * 100, 2);

  return (
    <div className='flex items-center gap-8px mb-2px'>
      <div className='w-50px text-11px text-t-quaternary text-right flex-shrink-0'>{formatTokens(info.totalTokens)}</div>
      <div className='flex-1 flex h-14px rd-2px overflow-hidden bg-bg-3'>
        {info.injections.map((inj, i) => {
          const pct = info.totalTokens > 0 ? (inj.tokenEstimate / info.totalTokens) * barWidth : 0;
          return (
            <Tooltip key={i} content={`${CONTEXT_TYPE_LABELS[inj.type] || inj.type}: ${formatTokens(inj.tokenEstimate)} tokens\n${truncate(inj.preview, 100)}`}>
              <div
                style={{
                  width: `${pct}%`,
                  backgroundColor: CONTEXT_TYPE_COLORS[inj.type] || '#C9CDD4',
                  minWidth: inj.tokenEstimate > 0 ? '1px' : 0,
                }}
                className='h-full'
              />
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
};

const ContextBreakdown: React.FC<ContextBreakdownProps> = ({ contextBreakdown, contextInfoJson }) => {
  const contextInfo = useMemo<MessageContextInfo[]>(() => {
    try {
      return JSON.parse(contextInfoJson) as MessageContextInfo[];
    } catch {
      return [];
    }
  }, [contextInfoJson]);

  // Handle undefined contextBreakdown gracefully
  if (!contextBreakdown) {
    return <div className='text-13px text-t-tertiary p-12px'>No context breakdown data available</div>;
  }

  const { byType, totalTokens, topSources } = contextBreakdown;

  // Sort types by token count
  const sortedTypes = useMemo(() => {
    return Object.entries(byType)
      .filter(([, v]) => v.totalTokens > 0)
      .sort(([, a], [, b]) => b.totalTokens - a.totalTokens);
  }, [byType]);

  const maxMsgTokens = useMemo(() => {
    return Math.max(...contextInfo.map((m) => m.totalTokens), 1);
  }, [contextInfo]);

  if (totalTokens === 0) {
    return <div className='text-13px text-t-tertiary p-12px'>No context injection data available</div>;
  }

  return (
    <div className='h-full overflow-auto p-12px'>
      {/* Summary section */}
      <div className='mb-20px'>
        <Typography.Title heading={6} className='mb-12px'>
          Context Breakdown ({formatTokens(totalTokens)} total tokens)
        </Typography.Title>

        {/* Stacked bar overview */}
        <div className='flex h-28px rd-4px overflow-hidden mb-12px'>
          {sortedTypes.map(([type, info]) => (
            <Tooltip key={type} content={`${CONTEXT_TYPE_LABELS[type] || type}: ${formatTokens(info.totalTokens)} (${((info.totalTokens / totalTokens) * 100).toFixed(1)}%)`}>
              <div
                style={{
                  width: `${(info.totalTokens / totalTokens) * 100}%`,
                  backgroundColor: CONTEXT_TYPE_COLORS[type] || '#C9CDD4',
                  minWidth: info.totalTokens > 0 ? '2px' : 0,
                }}
                className='h-full transition-all'
              />
            </Tooltip>
          ))}
        </div>

        {/* Legend with progress bars */}
        <div className='space-y-6px'>
          {sortedTypes.map(([type, info]) => {
            const pct = totalTokens > 0 ? (info.totalTokens / totalTokens) * 100 : 0;
            return (
              <div key={type} className='flex items-center gap-8px'>
                <div className='w-10px h-10px rd-2px flex-shrink-0' style={{ backgroundColor: CONTEXT_TYPE_COLORS[type] || '#C9CDD4' }} />
                <span className='text-13px text-t-secondary w-100px flex-shrink-0'>{CONTEXT_TYPE_LABELS[type] || type}</span>
                <div className='flex-1'>
                  <Progress percent={pct} showText={false} size='small' color={CONTEXT_TYPE_COLORS[type] || '#C9CDD4'} />
                </div>
                <span className='text-12px text-t-tertiary w-60px text-right flex-shrink-0'>{formatTokens(info.totalTokens)}</span>
                <span className='text-11px text-t-quaternary w-50px text-right flex-shrink-0'>{pct.toFixed(1)}%</span>
                <span className='text-11px text-t-quaternary w-40px text-right flex-shrink-0'>{info.count}x</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Top sources */}
      {topSources.length > 0 && (
        <div className='mb-20px'>
          <Typography.Title heading={6} className='mb-12px'>
            Top Sources
          </Typography.Title>
          <div className='space-y-4px'>
            {topSources.slice(0, 15).map((source, i) => (
              <div key={i} className='flex items-center gap-8px text-12px'>
                <div className='w-10px h-10px rd-2px flex-shrink-0' style={{ backgroundColor: CONTEXT_TYPE_COLORS[source.type] || '#C9CDD4' }} />
                <span className='text-t-secondary font-mono truncate flex-1' title={source.source}>
                  {source.source}
                </span>
                <span className='text-t-tertiary flex-shrink-0'>{formatTokens(source.totalTokens)}</span>
                <span className='text-t-quaternary flex-shrink-0'>{source.count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-message breakdown */}
      {contextInfo.length > 0 && (
        <Collapse bordered={false}>
          <Collapse.Item
            name='per-message'
            header={
              <Typography.Title heading={6} style={{ margin: 0 }}>
                Per-Message Breakdown ({contextInfo.length} messages)
              </Typography.Title>
            }
          >
            <div className='pt-8px'>
              {contextInfo
                .filter((m) => m.totalTokens > 0)
                .map((info, i) => (
                  <InjectionBar key={info.uuid || i} info={info} maxTokens={maxMsgTokens} />
                ))}
            </div>
          </Collapse.Item>
        </Collapse>
      )}
    </div>
  );
};

export default ContextBreakdown;
