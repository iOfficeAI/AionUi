/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type FC } from 'react';

type SidebarIconProps = {
  size?: number;
  strokeWidth?: number;
};

/**
 * Claude-desktop-style sidebar toggle icon: a rounded rectangle with a vertical divider
 * near the left edge, indicating a collapsible side panel. Rendered as inline SVG since
 * @icon-park doesn't ship this exact shape.
 *
 * Uses a 48-unit viewBox to match @icon-park's stroke scale, so passing the same
 * `strokeWidth` value here and to @icon-park icons produces visually identical lines.
 *
 * The rect spans y=10..38 (height 28), slightly taller than @icon-park's
 * ArrowLeft/ArrowRight (which span y=12..36) so the sidebar icon reads a
 * touch larger. The rect remains centered at y=24, matching the arrows'
 * centerline so all three icons stay on the same visual baseline.
 */
const SidebarIcon: FC<SidebarIconProps> = ({ size = 18, strokeWidth = 4 }) => (
  <svg
    width={size}
    height={size}
    viewBox='0 0 48 48'
    fill='none'
    stroke='currentColor'
    strokeWidth={strokeWidth}
    strokeLinecap='round'
    strokeLinejoin='round'
    aria-hidden='true'
    focusable='false'
    style={{ display: 'inline-block', verticalAlign: 'middle' }}
  >
    <rect x='6' y='10' width='36' height='28' rx='5' />
    <line x1='18' y1='10' x2='18' y2='38' />
  </svg>
);

export default SidebarIcon;
