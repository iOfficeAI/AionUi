/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReplyQuote } from '@/renderer/utils/emitter';
import React, { createContext, useContext } from 'react';

export type SideConversationControlValue = {
  enableSide: boolean;
  onOpenSide?: (firstQuestion?: string) => void;
  /** Attach selected message text to the active side tab composer as a
   * reply-quote chip (does not send, never dumped into the input). */
  onAskInSide?: (quote: ReplyQuote) => void;
};

const SideConversationControlContext = createContext<SideConversationControlValue | null>(null);

export const SideConversationControlProvider: React.FC<{
  value: SideConversationControlValue;
  children: React.ReactNode;
}> = ({ value, children }) => (
  <SideConversationControlContext.Provider value={value}>{children}</SideConversationControlContext.Provider>
);

export function useSideConversationControlSafe(): SideConversationControlValue | null {
  return useContext(SideConversationControlContext);
}
