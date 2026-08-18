/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext } from 'react';

export type SideConversationControlValue = {
  enableSide: boolean;
  onOpenSide?: (firstQuestion?: string) => void;
  /** Fill the active side tab composer with text (does not send). */
  onAskInSide?: (selectedText: string) => void;
  /** True when a side thread exists but the dock is collapsed */
  sideCollapsed: boolean;
  onReopenSide?: () => void;
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
