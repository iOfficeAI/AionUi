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
    <path d='M3 12h5' />
    {/* dominant branch: up-right arrow */}
    <path d='M8 12 18 5' />
    <path d='M12 5h6v6' />
    {/* original path: smaller down-right arrow */}
    <path d='M8 12l7 7' />
    <path d='M15 14v5h-5' />
  </svg>
);

export default ForkBranchIcon;
