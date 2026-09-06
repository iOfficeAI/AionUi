/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { createContext, useContext } from 'react';

/**
 * What a column's header needs to be the thing you grab to reorder columns:
 * dnd-kit's activator ref and listeners for the title area, whether this
 * column is the one being dragged (its header shows a light wash), the
 * accessible name of the grip, and the keyboard alternative (Alt+Arrow on the
 * grip moves the column one slot).
 */
export type ColumnHeaderDragHandle = {
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  listeners?: Record<string, (event: React.SyntheticEvent) => void>;
  isDragging: boolean;
  label: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLElement>) => void;
};

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
