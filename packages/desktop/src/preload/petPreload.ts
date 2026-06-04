/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petAPI', {
  onStateChange: (cb: (state: string) => void) => {
    ipcRenderer.on('pet:state-changed', (_e, state: string) => cb(state));
  },
  onEyeMove: (cb: (data: { eyeDx: number; eyeDy: number; bodyDx: number; bodyRotate: number }) => void) => {
    ipcRenderer.on('pet:eye-move', (_e, data) => cb(data));
  },
  onResize: (cb: (size: number) => void) => {
    ipcRenderer.on('pet:resize', (_e, size: number) => cb(size));
  },
  onNotificationSummary: (cb: (data: { pendingConfirmations: number }) => void) => {
    ipcRenderer.on('pet:notification-summary', (_e, data) => cb(data));
  },
  onAssetChange: (
    cb: (asset: {
      id: string;
      displayName: string;
      description: string;
      format: 'svg-states' | 'codex-spritesheet';
      source: 'builtin' | 'custom';
      spritesheetUrl?: string;
    }) => void
  ) => {
    ipcRenderer.on('pet:asset-changed', (_e, asset) => cb(asset));
  },
});
