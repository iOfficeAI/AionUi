/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';

/**
 * Whether the hoisted preview region should stay on screen even though the
 * preview says it is closed.
 *
 * One preview panel follows the focused split column (plan decision 3), and
 * its open/closed state is stored per project scope. In a group whose columns
 * belong to different projects, following the focus swaps the scope, and the
 * scope that comes back may say "closed" — so `isOpen` flipped on every click
 * between columns and the whole right-hand region was torn out of the layout
 * and put back. That is the flicker.
 *
 * The region is held open for as long as the user is working in split routes
 * with the panel up; only its contents follow the focus, and a column with
 * nothing to show gets an empty panel instead of a collapsing layout. The hold
 * ends with a deliberate close (the counter the preview bumps for those, and
 * for those only) or with leaving the split routes.
 */
export const usePreviewRegionHold = ({
  isSplitGroupRoute,
  isPreviewOpen,
  deliberateCloseCount,
}: {
  isSplitGroupRoute: boolean;
  isPreviewOpen: boolean;
  deliberateCloseCount: number;
}): boolean => {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (isSplitGroupRoute && isPreviewOpen) setHeld(true);
  }, [isSplitGroupRoute, isPreviewOpen]);
  useEffect(() => {
    if (!isSplitGroupRoute) setHeld(false);
  }, [isSplitGroupRoute]);
  const closesSeen = useRef(deliberateCloseCount);
  useEffect(() => {
    if (closesSeen.current === deliberateCloseCount) return;
    closesSeen.current = deliberateCloseCount;
    setHeld(false);
  }, [deliberateCloseCount]);
  return held;
};
