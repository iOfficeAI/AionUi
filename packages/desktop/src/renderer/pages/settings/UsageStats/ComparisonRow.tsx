/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { AgentUsageResponse } from '@/common/types/agentUsage';
import RankBar from './RankBar';
import { SEGMENT_PALETTE } from './Sparkline';
import { topN, formatTokens, pct } from './chartMath';

/** 对比区 —— 作为 bento 片段：按工具占比条 + 项目排行 + 模型排行。 */
const ComparisonRow: React.FC<{ data: AgentUsageResponse }> = ({ data }) => {
  const { t } = useTranslation();
  const agents = data.summary.byAgent.map((x, i) => ({
    name: x.agent,
    value: x.totalTokens,
    color: SEGMENT_PALETTE[i % SEGMENT_PALETTE.length],
  }));
  const grandTotal = agents.reduce((s, x) => s + x.value, 0);

  // by_project / by_model 后端按 (agent, X) 聚合；id 用复合 key 防 React 冲突，tag 显示工具来源
  const projRows = topN(data.byProject, (p) => p.totalTokens, 8).map((p) => ({
    id: `${p.agent}/${p.project}`,
    label: p.project,
    value: p.totalTokens,
    tag: p.agent,
  }));
  const modelRows = topN(data.byModel, (m) => m.totalTokens, 8).map((m) => ({
    id: `${m.agent}/${m.model}`,
    label: m.model,
    value: m.totalTokens,
    tag: m.agent,
  }));

  return (
    <>
      {/* 按工具 —— 占比条 */}
      <div className='usage-cell' style={{ gridArea: 'tool' }}>
        <div className='usage-cell-label' style={{ marginBottom: 14 }}>
          {t('usageStats.comparison.title')}
        </div>
        <div
          style={{
            display: 'flex',
            height: 14,
            borderRadius: 7,
            overflow: 'hidden',
            background: 'var(--color-fill, #e5e6eb)',
            marginBottom: 16,
          }}
        >
          {agents.map((a) => (
            <div
              key={a.name}
              style={{ width: `${pct(a.value, grandTotal)}%`, background: a.color }}
              title={`${a.name} ${pct(a.value, grandTotal).toFixed(0)}%`}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 40, flexWrap: 'wrap' }}>
          {agents.map((a) => (
            <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: a.color, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary, #86909c)' }}>{a.name}</div>
                <div className='usage-figure' style={{ fontSize: 22 }}>
                  {formatTokens(a.value)}
                  <span style={{ fontSize: 12, color: 'var(--text-secondary, #86909c)', marginLeft: 6 }}>
                    {pct(a.value, grandTotal).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 项目排行 */}
      <div className='usage-cell' style={{ gridArea: 'proj' }}>
        <div className='usage-cell-label' style={{ marginBottom: 14 }}>
          {t('usageStats.comparison.projectsTitle')}
        </div>
        <RankBar rows={projRows} />
      </div>

      {/* 模型排行 */}
      <div className='usage-cell' style={{ gridArea: 'model' }}>
        <div className='usage-cell-label' style={{ marginBottom: 14 }}>
          {t('usageStats.comparison.modelsTitle')}
        </div>
        <RankBar rows={modelRows} />
      </div>
    </>
  );
};

export default ComparisonRow;
