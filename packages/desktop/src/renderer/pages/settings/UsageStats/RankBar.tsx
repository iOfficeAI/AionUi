/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Tooltip } from '@arco-design/web-react';
import { formatTokens } from './chartMath';
import { SEGMENT_PALETTE } from './Sparkline';

type RankRow = { id?: string; label: string; value: number; tag?: string };

// 工具配色：与「按工具」占比条、趋势图保持一致（claude 蓝 / codex 绿 / 其余主色）。
const agentColor = (tag?: string): string => {
  if (tag === 'claude') return SEGMENT_PALETTE[0];
  if (tag === 'codex') return SEGMENT_PALETTE[1];
  return 'var(--primary, #165dff)';
};

const RankBar: React.FC<{ rows: RankRow[] }> = ({ rows }) => {
  if (rows.length === 0) {
    return <div style={{ color: 'var(--text-secondary, #86909c)', fontSize: 12, padding: '8px 0' }}>—</div>;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {rows.map((r) => {
        const color = agentColor(r.tag);
        return (
          <div key={r.id ?? r.label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
            {r.tag && (
              <span
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  padding: '3px 6px',
                  borderRadius: 5,
                  fontWeight: 600,
                  flexShrink: 0,
                  color,
                  background: `color-mix(in srgb, ${color} 15%, transparent)`,
                }}
              >
                {r.tag}
              </span>
            )}
            <Tooltip content={r.tag ? `${r.tag} · ${r.label}` : r.label} position='top'>
              <span
                style={{
                  flex: '0 0 auto',
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  cursor: 'default',
                  color: 'var(--text-primary, #1d2129)',
                }}
              >
                {r.label}
              </span>
            </Tooltip>
            <div
              style={{
                flex: 1,
                minWidth: 24,
                height: 6,
                background: 'var(--color-fill, #e5e6eb)',
                borderRadius: 6,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.max((r.value / max) * 100, 2)}%`,
                  background: color,
                  height: '100%',
                  borderRadius: 6,
                  transition: 'width .4s ease',
                }}
              />
            </div>
            <span
              style={{
                width: 64,
                textAlign: 'right',
                flexShrink: 0,
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                color: 'var(--text-secondary, #86909c)',
              }}
            >
              {formatTokens(r.value)}
            </span>
          </div>
        );
      })}
    </div>
  );
};

export default RankBar;
