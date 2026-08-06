/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { createContext, useContext } from 'react';
import type { BlockerInfo } from './useBlockerTaskResolver';

export type ActivityTaskIndex = {
  resolve: (id: string) => BlockerInfo | undefined;
  /**
   * Scrolls a loaded card into view + highlights it. Returns false if the card
   * is not currently in the DOM (not paged in / filtered out).
   */
  highlightTask: (id: string) => boolean;
};

const noop: ActivityTaskIndex = { resolve: () => undefined, highlightTask: () => false };

const Ctx = createContext<ActivityTaskIndex>(noop);

export const ActivityTaskIndexProvider = Ctx.Provider;
export const useActivityTaskIndex = (): ActivityTaskIndex => useContext(Ctx);
