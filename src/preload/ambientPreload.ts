/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

// Minimal surface the bubble renderer needs. Click-vs-drag threshold is
// evaluated in the renderer (pointer coordinates are renderer-local there);
// main process only sees three discrete events.
contextBridge.exposeInMainWorld('ambientAPI', {
  dragStart: () => ipcRenderer.send('ambient:drag-start'),
  dragEnd: () => ipcRenderer.send('ambient:drag-end'),
  click: () => ipcRenderer.send('ambient:click'),
});
