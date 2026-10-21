/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { createContext, useContext } from 'react';

/**
 * What a column's header needs to be the thing you grab to reorder columns:
 * the pointer-down that may become a drag (the view decides, after a small
 * move or a hold), the click that must not follow a drag, whether this column
 * is the one being dragged (its header shows a light wash), the accessible
 * name of the grip, and the keyboard alternative (Alt+Arrow on the grip moves
 * the column one slot).
 */
export type ColumnHeaderDragHandle = {
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: React.MouseEvent<HTMLElement>) => void;
  isDragging: boolean;
  label: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
};

/**
 * Spread onto an interactive descendant of the header's title area whose
 * press is its own — the minimap's search trigger — so a pointer-down there
 * never becomes a column drag and the click that ends it still fires. Text
 * fields need no mark: a press inside one is always the field's. The title
 * and the grip are not marked: they are the drag.
 */
export const COLUMN_DRAG_IGNORE_PROPS = { 'data-column-drag': 'ignore' } as const;
/** Matches an element carrying `COLUMN_DRAG_IGNORE_PROPS`, for the view's own check. */
export const COLUMN_DRAG_IGNORE_SELECTOR = '[data-column-drag="ignore"]';

export type ChatColumnContextValue = {
  /**
   * Is this column the active one, so its composer may take the keyboard
   * focus (on mount, and again each time the column becomes active). A
   * conversation on its own is always active — today's behaviour. In a split
   * group only the focused column is: with several composers mounting at once,
   * each focusing itself would hand the focus to whichever mounted last, and
   * the focused column is the one the user chose, not the one that came up
   * last. Same contract as the Team view's active slot, without its runtime.
   */
  composerActive: boolean;
  /**
   * The view is one column among several, so its header must fit a narrow
   * width: the title keeps its room and the model picker gives way first, and
   * the header reads as this column's own band. A conversation on its own is
   * never compact.
   */
  compactHeader: boolean;
  /**
   * This column is the one the user is working in. It is marked by a light
   * primary wash on the header band and a hairline around the column — not by
   * a heavy ring, which reads as a black box drawn over the chat.
   */
  columnFocused?: boolean;
  /** Present in a split column: the header's title area is the drag activator that reorders columns. */
  headerDragHandle?: ColumnHeaderDragHandle;
};

const ChatColumnContext = createContext<ChatColumnContextValue>({ composerActive: true, compactHeader: false });

export const ChatColumnProvider = ChatColumnContext.Provider;

export const useChatColumn = (): ChatColumnContextValue => useContext(ChatColumnContext);
