/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * Conversation-fork glyph: a track that branches off with an up-right arrow
 * (the "continue in a new task" affordance). Hand-drawn because icon-park has
 * no branch-out-arrow shape; props mirror the icon-park subset our buttons
 * already pass (`size` / `fill` / `className`).
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
    {/* the original track, continuing straight */}
    <path d='M4 17h10' />
    {/* the branch splitting off the track… */}
    <path d='M9 17 19 7' />
    {/* …ending in an up-right arrowhead */}
    <path d='M13 7h6v6' />
  </svg>
);

export default ForkBranchIcon;
