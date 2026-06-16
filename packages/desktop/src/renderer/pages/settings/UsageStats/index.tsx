/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Spin, Empty, Alert, Button, Radio } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { ipcBridge } from '@/common';
import type { AgentUsageResponse, AgentUsageParams } from '@/common/types/agentUsage';
import SettingsPageWrapper from '../components/SettingsPageWrapper';
import SourceBanner from './SourceBanner';
import KpiRow from './KpiRow';
import TrendChart from './TrendChart';
import CompositionDonut from './CompositionDonut';
import ComparisonRow from './ComparisonRow';
import SessionList from './SessionList';
import Sparkline, { SEGMENT_PALETTE } from './Sparkline';
import { formatTokens, formatPct } from './chartMath';

const PAGE = 200;

const UsageStats: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AgentUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<'error' | 'unsupported' | null>(null);
  const [gran, setGran] = useState<'day' | 'week'>('day');
  const [range, setRange] = useState<'today' | '7d' | '30d' | '90d' | 'all'>('30d');
  const [dim, setDim] = useState<'agent' | 'project' | 'model'>('agent');
  const [offset, setOffset] = useState(0);
  // 请求 epoch: 防止并发请求的旧响应覆盖新状态 (Codex review P1).
  // 每次发起 load 时 epoch++, 响应回来后比对 — 不是当前 epoch 就丢弃。
  // 同时区分 append: 累加只在自己那一轮 epoch 内有效, 切换维度后旧 append 不能 merge 进新 scope。
  const epochRef = useRef(0);

  const load = useCallback(async (params: AgentUsageParams, append: boolean) => {
    const myEpoch = ++epochRef.current;
    setLoading(true);
    setErr(null);
    try {
      const r = await ipcBridge.analytics.getAgentUsage.invoke(params);
      if (myEpoch !== epochRef.current) return; // 已被更新请求取代, 丢弃
      setData((prev) => (append && prev ? { ...r, sessions: [...prev.sessions, ...r.sessions] } : r));
    } catch (e: unknown) {
      if (myEpoch !== epochRef.current) return;
      const status = (e as { status?: number })?.status;
      setErr(status === 404 ? 'unsupported' : 'error');
    } finally {
      if (myEpoch === epochRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setOffset(0);
    void load(
      { trendGranularity: gran, timeRange: range, trendDimension: dim, sessionsLimit: PAGE, sessionsOffset: 0 },
      false
    );
  }, [gran, range, dim, load]);

  const refresh = () => {
    setOffset(0);
    void load(
      {
        trendGranularity: gran,
        timeRange: range,
        trendDimension: dim,
        refresh: true,
        sessionsLimit: PAGE,
        sessionsOffset: 0,
      },
      false
    );
  };

  const loadMore = () => {
    const next = offset + PAGE;
    setOffset(next);
    void load(
      { trendGranularity: gran, timeRange: range, trendDimension: dim, sessionsLimit: PAGE, sessionsOffset: next },
      true
    );
  };

  const perPointLabel = t('usageStats.trendCtl.perPoint', {
    span: gran === 'week' ? t('usageStats.granularity.week') : t('usageStats.granularity.day'),
  });

  return (
    <SettingsPageWrapper>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Radio.Group
          type='button'
          value={range}
          onChange={(v: string) => setRange(v as 'today' | '7d' | '30d' | '90d' | 'all')}
        >
          <Radio value='today'>{t('usageStats.timeRange.today')}</Radio>
          <Radio value='7d'>{t('usageStats.timeRange.7d')}</Radio>
          <Radio value='30d'>{t('usageStats.timeRange.30d')}</Radio>
          <Radio value='90d'>{t('usageStats.timeRange.90d')}</Radio>
          <Radio value='all'>{t('usageStats.timeRange.all')}</Radio>
        </Radio.Group>
        <Radio.Group type='button' value={gran} onChange={(v: string) => setGran(v as 'day' | 'week')}>
          <Radio value='day'>{t('usageStats.granularity.day')}</Radio>
          <Radio value='week'>{t('usageStats.granularity.week')}</Radio>
        </Radio.Group>
        <span style={{ fontSize: 12, color: 'var(--text-secondary, #86909c)' }}>
          {t('usageStats.trend.dimension.label')}
        </span>
        <Radio.Group type='button' value={dim} onChange={(v: string) => setDim(v as 'agent' | 'project' | 'model')}>
          <Radio value='agent'>{t('usageStats.trend.dimension.agent')}</Radio>
          <Radio value='project'>{t('usageStats.trend.dimension.project')}</Radio>
          <Radio value='model'>{t('usageStats.trend.dimension.model')}</Radio>
        </Radio.Group>
        <Button onClick={refresh} loading={loading}>
          {t('usageStats.refresh')}
        </Button>
      </div>

      {err === 'unsupported' && <Alert type='warning' content={t('usageStats.unsupported')} />}
      {err === 'error' && <Alert type='error' content={t('usageStats.error')} />}
      {loading && !data && <Spin style={{ display: 'block', textAlign: 'center', padding: 48 }} />}

      {data && !err && (
        <>
          <SourceBanner sources={data.sources} />
          {data.summary.byAgent.length === 0 ? (
            <Empty description={t('usageStats.empty')} />
          ) : (
            <>
              <div className='usage-bento'>
                <HeroCard data={data} rangeLabel={t(`usageStats.timeRange.${range}`)} />
                <KpiRow data={data} />
                <TrendChart points={data.trend.points} perPointLabel={perPointLabel} style={{ gridArea: 'trend' }} />
                <CompositionCard data={data} />
                <ComparisonRow data={data} />
              </div>
              <SessionList
                rows={data.sessions}
                total={data.sessionsTotal}
                hasMore={data.sessions.length < data.sessionsTotal}
                onLoadMore={loadMore}
              />
            </>
          )}
        </>
      )}
    </SettingsPageWrapper>
  );
};

// Hero: 总 token 主指标 + 时间范围注脚 + 大趋势线（gridArea hero）
const HeroCard: React.FC<{ data: AgentUsageResponse; rangeLabel: string }> = ({ data, rangeLabel }) => {
  const { t } = useTranslation();
  const totalTok = data.summary.byAgent.reduce((s, x) => s + x.totalTokens, 0);
  const trendTotals = data.trend.points.map((p) => Object.values(p.bySegment).reduce((s, v) => s + v, 0));
  return (
    <div className='usage-cell' style={{ gridArea: 'hero', display: 'flex', flexDirection: 'column' }}>
      <div className='usage-cell-label'>{t('usageStats.kpi.totalTokens')}</div>
      <div className='usage-figure' style={{ fontSize: 50, lineHeight: 1, margin: '12px 0 5px' }}>
        {formatTokens(totalTok)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary, #86909c)' }}>{rangeLabel}</div>
      <div style={{ marginTop: 16, flex: 1, display: 'flex', alignItems: 'flex-end', minHeight: 96 }}>
        <Sparkline values={trendTotals} color='var(--primary, #165dff)' height={140} fill />
      </div>
    </div>
  );
};

// Token 构成环卡片（用 summary 求和的四类 token）（gridArea comp）
const CompositionCard: React.FC<{ data: AgentUsageResponse }> = ({ data }) => {
  const { t } = useTranslation();
  const a = data.summary.byAgent;
  const inp = a.reduce((s, x) => s + x.inputTokens, 0);
  const out = a.reduce((s, x) => s + x.outputTokens, 0);
  const cr = a.reduce((s, x) => s + x.cacheReadTokens, 0);
  const cc = a.reduce((s, x) => s + x.cacheCreationTokens, 0);
  const total = inp + out + cr + cc;
  const segs = [
    { name: t('usageStats.composition.input'), value: inp, color: SEGMENT_PALETTE[0] },
    { name: t('usageStats.composition.output'), value: out, color: SEGMENT_PALETTE[2] },
    { name: t('usageStats.composition.cacheRead'), value: cr, color: SEGMENT_PALETTE[4] },
    { name: t('usageStats.composition.cacheCreation'), value: cc, color: SEGMENT_PALETTE[5] },
  ];
  return (
    <div className='usage-cell' style={{ gridArea: 'comp' }}>
      <div className='usage-cell-label' style={{ marginBottom: 12 }}>
        {t('usageStats.composition.title')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <CompositionDonut
          segments={segs}
          centerLabel={formatTokens(total)}
          centerSub={t('usageStats.composition.unit')}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          {segs.map((s) => (
            <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-secondary, #86909c)' }}>{s.name}</span>
              <span
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary, #1d2129)',
                }}
              >
                {formatTokens(s.value)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary, #86909c)',
                  width: 38,
                  textAlign: 'right',
                }}
              >
                {formatPct(s.value, total)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default UsageStats;
