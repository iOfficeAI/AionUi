/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentUsageResponse } from '@/common/types/agentUsage';
import { pct } from './chartMath';
import { SEGMENT_PALETTE } from './Sparkline';

/** 次级 KPI（会话数 / 消息数 / 缓存占比）—— 作为 bento 片段渲染，
 * 总 token 由 index 的 Hero 承担。返回 Fragment 让各卡成为 .usage-bento 的直接子项。 */
const KpiRow: React.FC<{ data: AgentUsageResponse }> = ({ data }) => {
  const { t } = useTranslation();
  const a = data.summary.byAgent;
  const totalTok = a.reduce((s, x) => s + x.totalTokens, 0);
  const sessions = a.reduce((s, x) => s + x.sessions, 0);
  const messages = a.reduce((s, x) => s + x.messages, 0);
  const cacheRead = a.reduce((s, x) => s + x.cacheReadTokens, 0);
  const cacheCreation = a.reduce((s, x) => s + x.cacheCreationTokens, 0);
  const readPct = pct(cacheRead, totalTok);
  const createPct = pct(cacheCreation, totalTok);
  const cacheRatio = readPct + createPct;

  const subStyle: React.CSSProperties = {
    fontSize: 11,
    color: 'var(--text-secondary, #86909c)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  };

  // 按工具拆分子信息：每个工具单独一行（claude X / codex Y），避免单列卡片内截断
  const byAgentLines = (pick: (x: (typeof a)[number]) => number): React.ReactNode => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {a.map((x) => (
        <div key={x.agent} style={subStyle} title={`${x.agent} ${pick(x).toLocaleString()}`}>
          {x.agent} {pick(x).toLocaleString()}
        </div>
      ))}
    </div>
  );

  return (
    <>
      <div
        className='usage-cell'
        style={{ gridArea: 'sess', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
      >
        <div className='usage-cell-label'>{t('usageStats.kpi.sessions')}</div>
        <div className='usage-figure' style={{ fontSize: 28, margin: '8px 0 6px' }}>
          {sessions.toLocaleString()}
        </div>
        {byAgentLines((x) => x.sessions)}
      </div>

      <div
        className='usage-cell'
        style={{ gridArea: 'msg', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
      >
        <div className='usage-cell-label'>{t('usageStats.kpi.messages')}</div>
        <div className='usage-figure' style={{ fontSize: 28, margin: '8px 0 6px' }}>
          {messages.toLocaleString()}
        </div>
        {byAgentLines((x) => x.messages)}
      </div>

      <div className='usage-cell' style={{ gridArea: 'cache' }}>
        <div className='usage-cell-label'>{t('usageStats.kpi.cacheRatio')}</div>
        <div className='usage-figure' style={{ fontSize: 28, margin: '8px 0 10px' }}>
          {cacheRatio.toFixed(0)}
          <span style={{ fontSize: 16, color: 'var(--text-secondary, #86909c)' }}>%</span>
        </div>
        <div
          style={{
            display: 'flex',
            height: 7,
            borderRadius: 5,
            overflow: 'hidden',
            background: 'var(--color-fill, #e5e6eb)',
          }}
        >
          <div style={{ width: `${readPct}%`, background: SEGMENT_PALETTE[0] }} />
          <div style={{ width: `${createPct}%`, background: SEGMENT_PALETTE[4] }} />
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            marginTop: 8,
            fontSize: 11,
            color: 'var(--text-secondary, #86909c)',
            flexWrap: 'wrap',
          }}
        >
          <span>
            <span style={{ color: SEGMENT_PALETTE[0] }}>●</span> {t('usageStats.composition.cacheRead')}{' '}
            {readPct.toFixed(0)}%
          </span>
          <span>
            <span style={{ color: SEGMENT_PALETTE[4] }}>●</span> {t('usageStats.composition.cacheCreation')}{' '}
            {createPct.toFixed(0)}%
          </span>
          <span>
            <span style={{ color: 'var(--color-fill, #e5e6eb)' }}>●</span> {t('usageStats.composition.uncached')}{' '}
            {Math.max(0, 100 - readPct - createPct).toFixed(0)}%
          </span>
        </div>
      </div>
    </>
  );
};

export default KpiRow;
