/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Radio } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import type { TrendPoint } from '@/common/types/agentUsage';
import { SEGMENT_PALETTE } from './Sparkline';
import { cumulativeBySegment, formatTokens } from './chartMath';

/** 容器宽度测量；jsdom 无 ResizeObserver 时回退到固定宽度（测试可渲染）。 */
function useMeasure(): [React.RefObject<HTMLDivElement>, number] {
  const ref = React.useRef<HTMLDivElement>(null);
  const [w, setW] = React.useState(600);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setW(el.clientWidth || 600);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** 取整到「好看」的刻度上限（1 / 2 / 2.5 / 5 / 10 × 10^n）。 */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / mag;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * mag;
}

/** 坐标轴刻度的紧凑格式：去掉多余的零（2B / 1.5B / 500M / 0），比 formatTokens 更窄不裁切。 */
function formatTick(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  const fmt = (div: number, suf: string): string => `${(n / div).toFixed(2).replace(/\.?0+$/, '')}${suf}`;
  if (abs >= 1_000_000_000) return fmt(1_000_000_000, 'B');
  if (abs >= 1_000_000) return fmt(1_000_000, 'M');
  if (abs >= 1_000) return fmt(1_000, 'K');
  return String(n);
}

const CHART_H = 244;

const TrendChart: React.FC<{ points: TrendPoint[]; perPointLabel: string; style?: React.CSSProperties }> = ({
  points,
  perPointLabel,
  style,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = React.useState<'split' | 'cumulative'>('split');
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [hi, setHi] = React.useState(-1);
  const [wrapRef, W] = useMeasure();

  const allSegments = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of points) for (const k of Object.keys(p.bySegment)) set.add(k);
    return Array.from(set).toSorted();
  }, [points]);

  const colorOf = React.useMemo(
    () => new Map(allSegments.map((n, i) => [n, SEGMENT_PALETTE[i % SEGMENT_PALETTE.length]])),
    [allSegments]
  );

  // 可见 segments（图例过滤）；累计模式逐 segment 前缀和
  const visibleSegs = allSegments.filter((s) => !hidden.has(s));
  const bucketsFiltered = points.map((p) => Object.fromEntries(visibleSegs.map((k) => [k, p.bySegment[k] ?? 0])));
  const bucketsDisplay = mode === 'cumulative' ? cumulativeBySegment(bucketsFiltered) : bucketsFiltered;
  const totals = bucketsDisplay.map((b) => Object.values(b).reduce((s, v) => s + v, 0));
  const niceMax = niceCeil(Math.max(1, ...totals));

  const padL = 46;
  const padR = 16;
  const padT = 12;
  const padB = 22;
  const width = Math.max(W, 280);
  const plotW = width - padL - padR;
  const plotH = CHART_H - padT - padB;
  const n = points.length;
  const xOf = (i: number): number => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yOf = (v: number): number => padT + plotH - (v / niceMax) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * niceMax);

  // 逐段堆叠的上下沿（按可见 segment 顺序）
  const running = points.map(() => 0);
  const layers = visibleSegs.map((name) => {
    const lower = bucketsDisplay.map((_, i) => running[i]);
    bucketsDisplay.forEach((b, i) => (running[i] += b[name] ?? 0));
    const upper = bucketsDisplay.map((_, i) => running[i]);
    return { name, lower, upper };
  });

  const toggle = (name: string): void =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className='usage-cell' style={{ height: '100%', ...style }}>
      <div className='usage-cell-label' style={{ marginBottom: 12 }}>
        {t('usageStats.trend.title')}
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <Radio.Group
          type='button'
          size='small'
          value={mode}
          onChange={(v: string) => setMode(v as 'split' | 'cumulative')}
        >
          <Radio value='split'>{t('usageStats.trendCtl.split')}</Radio>
          <Radio value='cumulative'>{t('usageStats.trendCtl.cumulative')}</Radio>
        </Radio.Group>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary, #86909c)' }}>
          {perPointLabel}
        </span>
      </div>

      {points.length === 0 ? (
        <div style={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-secondary, #86909c)', fontSize: 13 }}>—</span>
        </div>
      ) : (
        <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
          <svg width={width} height={CHART_H} style={{ display: 'block' }} onMouseLeave={() => setHi(-1)}>
            {/* 网格 + Y 轴刻度 */}
            {ticks.map((tk, i) => (
              <g key={i}>
                <line
                  x1={padL}
                  y1={yOf(tk)}
                  x2={width - padR}
                  y2={yOf(tk)}
                  stroke='var(--color-border, #e5e6eb)'
                  strokeWidth='1'
                  strokeDasharray={i === 0 ? '0' : '3 4'}
                  opacity={i === 0 ? 1 : 0.6}
                />
                <text
                  x={padL - 8}
                  y={yOf(tk) + 3}
                  textAnchor='end'
                  fontSize='10'
                  fill='var(--text-secondary, #86909c)'
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  {formatTick(tk)}
                </text>
              </g>
            ))}

            {/* 堆叠面积 */}
            {layers.map(({ name, lower, upper }) => {
              const top = upper.map((v, i) => `${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`);
              const bot = lower.map((v, i) => `${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).toReversed();
              const d = `M${top.join(' L ')} L ${bot.join(' L ')} Z`;
              const lineD = `M${upper.map((v, i) => `${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' L ')}`;
              const color = colorOf.get(name);
              return (
                <g key={name}>
                  <path
                    d={d}
                    fill={color}
                    fillOpacity={hi === -1 ? 0.5 : 0.32}
                    style={{ transition: 'fill-opacity .15s' }}
                  />
                  <path d={lineD} fill='none' stroke={color} strokeWidth='1.6' strokeLinejoin='round' />
                </g>
              );
            })}

            {/* hover 游标 + 命中区 */}
            {hi >= 0 && (
              <line
                x1={xOf(hi)}
                y1={padT}
                x2={xOf(hi)}
                y2={padT + plotH}
                stroke='var(--text-secondary, #86909c)'
                strokeWidth='1'
                strokeDasharray='3 3'
              />
            )}
            {points.map((p, i) => (
              <rect
                key={`hit-${p.bucket}`}
                x={xOf(i) - plotW / n / 2}
                y={padT}
                width={plotW / n}
                height={plotH}
                fill={hi === i ? 'var(--color-fill, #e5e6eb)' : 'transparent'}
                fillOpacity={hi === i ? 0.4 : 0}
                onMouseEnter={() => setHi(i)}
              />
            ))}
            {/* X 轴日期（首尾对齐避免裁切） */}
            {points.map((p, i) => (
              <text
                key={`x-${p.bucket}`}
                x={xOf(i)}
                y={CHART_H - 6}
                textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                fontSize='10'
                fill='var(--text-secondary, #86909c)'
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {p.bucket.slice(5)}
              </text>
            ))}
          </svg>

          {/* hover 浮层 */}
          {hi >= 0 && (
            <div
              style={{
                position: 'absolute',
                left: Math.min(Math.max(xOf(hi), 72), width - 72),
                top: 6,
                transform: 'translateX(-50%)',
                background: 'var(--bg-base, #fff)',
                border: '1px solid var(--color-border, #e5e6eb)',
                borderRadius: 8,
                padding: '8px 10px',
                fontSize: 12,
                minWidth: 140,
                pointerEvents: 'none',
                boxShadow: '0 8px 24px rgba(0,0,0,.14)',
                zIndex: 2,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{points[hi].bucket}</div>
              {visibleSegs
                .map((name) => ({ name, val: bucketsDisplay[hi][name] ?? 0 }))
                .filter((s) => s.val > 0)
                .toSorted((a, b) => b.val - a.val)
                .map((s) => (
                  <div
                    key={s.name}
                    style={{ display: 'flex', justifyContent: 'space-between', gap: 16, lineHeight: 1.7 }}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: colorOf.get(s.name) }} />
                      {s.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatTokens(s.val)}</span>
                  </div>
                ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  marginTop: 5,
                  paddingTop: 5,
                  borderTop: '1px solid var(--color-border, #e5e6eb)',
                  fontWeight: 600,
                }}
              >
                <span>{t('usageStats.kpi.totalTokens')}</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{formatTokens(totals[hi])}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 图例（点击隐藏/显示） */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 11 }}>
        {allSegments.map((name) => {
          const off = hidden.has(name);
          return (
            <span
              key={name}
              onClick={() => toggle(name)}
              style={{
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                opacity: off ? 0.4 : 1,
                textDecoration: off ? 'line-through' : 'none',
                color: 'var(--text-secondary, #86909c)',
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 2, background: colorOf.get(name) }} />
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
};

export default TrendChart;
