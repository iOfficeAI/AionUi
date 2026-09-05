/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';

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
};

const ChatColumnContext = createContext<ChatColumnContextValue>({ composerActive: true });

export const ChatColumnProvider = ChatColumnContext.Provider;

export const useChatColumn = (): ChatColumnContextValue => useContext(ChatColumnContext);
