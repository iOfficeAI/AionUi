/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { pct } from './chartMath';

type Seg = { name: string; value: number; color: string };

const CompositionDonut: React.FC<{ segments: Seg[]; centerLabel: string; centerSub?: string }> = ({
  segments,
  centerLabel,
  centerSub,
}) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  // dasharray 单位：周长归一化为 100
  let offset = 25; // 起点在 12 点钟方向（-90deg 等效）
  const arcs =
    total > 0
      ? segments
          .filter((s) => s.value > 0)
          .map((s) => {
            const len = pct(s.value, total); // 占周长百分比
            const el = (
              <circle
                key={s.name}
                cx='21'
                cy='21'
                r='15.9155'
                fill='none'
                stroke={s.color}
                strokeWidth='6'
                strokeDasharray={`${len.toFixed(3)} ${(100 - len).toFixed(3)}`}
                strokeDashoffset={offset.toFixed(3)}
                transform='rotate(-90 21 21)'
              />
            );
            offset -= len;
            return el;
          })
      : [];
  return (
    <svg width='140' height='140' viewBox='0 0 42 42' role='img'>
      <circle cx='21' cy='21' r='15.9155' fill='none' stroke='var(--color-fill, #e5e6eb)' strokeWidth='6' />
      {arcs}
      <text x='21' y='20' textAnchor='middle' fontSize='5' fontWeight='600' fill='var(--text-primary, #1d2129)'>
        {centerLabel}
      </text>
      {centerSub ? (
        <text x='21' y='25.5' textAnchor='middle' fontSize='3' fill='var(--text-secondary, #86909c)'>
          {centerSub}
        </text>
      ) : null}
    </svg>
  );
};

export type { Seg };
export default CompositionDonut;
