/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Conversation-fork glyph (Codex-style): a track that splits into two arrows —
 * a dominant up-right one (the new branch) and a smaller down-right one (the
 * original continuing). Hand-drawn because icon-park has no branch-out-arrow
 * shape; props mirror the icon-park subset our buttons already pass
 * (`size` / `fill` / `className`).
 */
const ForkBranchIcon: React.FC<{ size?: number | string; fill?: string; className?: string }> = ({
  size = 16,
  fill = 'currentColor',
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 24 24'
    fill='none'
    stroke={fill}
    strokeWidth='2'
    strokeLinecap='round'
    strokeLinejoin='round'
    className={className}
    aria-hidden='true'
  >
    {/* incoming track */}
    <path d='M3 12h6' />
    {/* dominant branch: up-right arrow */}
    <path d='M9 12l9-7' />
    <path d='M13.5 4.5H18.5V9.5' />
    {/* original path: smaller down-right arrow */}
    <path d='M9 12l5 5' />
    <path d='M14.5 13.5v4h-4' />
  </svg>
);

export default ForkBranchIcon;
