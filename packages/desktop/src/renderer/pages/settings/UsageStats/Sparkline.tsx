/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

const SEGMENT_PALETTE = ['#3491FA', '#00B42A', '#FF7D00', '#F53F3F', '#722ED1', '#14C9C9', '#F7BA1E', '#D91AD9'];

const Sparkline: React.FC<{ values: number[]; color?: string; height?: number; fill?: boolean }> = ({
  values,
  color,
  height = 32,
  fill = false,
}) => {
  if (values.length === 0) {
    return <svg width='100%' height={height} aria-hidden='true' />;
  }
  const W = 120;
  const max = Math.max(1, ...values);
  const stroke = color ?? SEGMENT_PALETTE[0];
  const n = values.length;
  const coords = values.map((v, i) => {
    const x = n === 1 ? 0 : (i / (n - 1)) * W;
    const y = height - (v / max) * (height - 4) - 2; // 留 2px 边距，最高点贴顶
    return [x, y] as const;
  });
  const pts = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  // 渐变填充（用于 Hero 大趋势线），id 随颜色派生避免冲突
  const gid = `spark-${stroke.replace(/[^a-z0-9]/gi, '')}`;
  const area = `M0,${height} ${pts} L${W},${height} Z`;
  return (
    <svg width='100%' height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio='none' aria-hidden='true'>
      {fill ? (
        <>
          <defs>
            <linearGradient id={gid} x1='0' y1='0' x2='0' y2='1'>
              <stop offset='0%' stopColor={stroke} stopOpacity='0.22' />
              <stop offset='100%' stopColor={stroke} stopOpacity='0' />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      ) : null}
      <polyline fill='none' stroke={stroke} strokeWidth='2' points={pts} vectorEffect='non-scaling-stroke' />
    </svg>
  );
};

export { SEGMENT_PALETTE };
export default Sparkline;
