/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';

export const removeWorkspaceEntry = (path: string) => {
  return ipcBridge.fs.removeEntry.invoke({ path });
};

export const renameWorkspaceEntry = (path: string, newName: string) => {
  return ipcBridge.fs.renameEntry.invoke({ path, newName });
};
