/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useSyncExternalStore } from 'react';

import type { ExplorerView } from './explorerStore';
import { getExplorerSnapshot, subscribeExplorer } from './explorerStore';

/** Subscribe a React component to the explorer store's projected view. */
export function useExplorerView(): ExplorerView {
  return useSyncExternalStore(subscribeExplorer, getExplorerSnapshot, getExplorerSnapshot);
}
