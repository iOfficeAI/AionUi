/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petAPI', {
  onTalking: (cb: (talking: boolean) => void) => {
    ipcRenderer.on('pet:talking', (_e, talking: boolean) => cb(talking));
  },
  onSlap: (cb: () => void) => {
    ipcRenderer.on('pet:slap-anim', () => cb());
  },
});
