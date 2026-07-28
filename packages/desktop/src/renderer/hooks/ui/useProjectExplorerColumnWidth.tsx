/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Layout-level width engine for the Project Explorer column (stage3 FULL / P2).
 *
 * The right explorer column now lives at the Layout level (sibling of the route
 * content), so the old 3-way ChatLayout split is re-partitioned into two 2-way
 * splits: Layout owns [content-region | explorer], ChatLayout owns [chat |
 * preview]. This hook manages the explorer width (resizable, persisted) and
 * clamps it so the content region always keeps room for chat (+ preview when
 * open) — the same reserve math as the legacy `calcLayoutMetrics`, moved up a
 * level. `availableWidth` is the measured [content + explorer] row width
 * (independent of the split), so the clamp is non-circular.
 */

import { useEffect } from 'react';

import {
  DEFAULT_WORKSPACE_PANEL_PX,
  MAX_WORKSPACE_PANEL_PX,
  MIN_CHAT_PANEL_PX,
  MIN_PREVIEW_PANEL_PX,
  MIN_WORKSPACE_PANEL_PX,
  PREVIEW_REGION_CHROME_PX,
} from '@/renderer/pages/conversation/utils/layoutCalc';
import { useResizableSplit } from '@/renderer/hooks/ui/useResizableSplit';

export function useProjectExplorerColumnWidth(availableWidth: number, isPreviewOpen: boolean, active: boolean) {
  const {
    splitRatio: requestedWidth,
    setSplitRatio,
    createDragHandle,
  } = useResizableSplit({
    unit: 'px',
    defaultWidth: DEFAULT_WORKSPACE_PANEL_PX,
    minWidth: MIN_WORKSPACE_PANEL_PX,
    maxWidth: MAX_WORKSPACE_PANEL_PX,
    storageKey: 'chat-workspace-width-px',
  });

  // Reserve room for chat (+ preview and its horizontal chrome when open) in the
  // content region, so the explorer never grows into space the preview region
  // (with its margins/border) actually occupies and push itself off-screen.
  const reservePx = MIN_CHAT_PANEL_PX + (isPreviewOpen ? MIN_PREVIEW_PANEL_PX + PREVIEW_REGION_CHROME_PX : 0);
  const maxByContainer = Math.max(MIN_WORKSPACE_PANEL_PX, availableWidth - reservePx);
  const widthPx = Math.min(requestedWidth, maxByContainer);

  // Persist a shrink when the stored width no longer fits (preview opened /
  // window shrank), so it does not overflow / crowd out chat+preview.
  useEffect(() => {
    if (!active || availableWidth <= 0) return;
    if (requestedWidth > maxByContainer) setSplitRatio(maxByContainer);
  }, [active, availableWidth, isPreviewOpen, requestedWidth, maxByContainer, setSplitRatio]);

  return { widthPx, createDragHandle };
}
