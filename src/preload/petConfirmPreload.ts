/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('petConfirmAPI', {
  onConfirmationAdd: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-add', (_event, data) => callback(data));
  },
  onConfirmationUpdate: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-update', (_event, data) => callback(data));
  },
  onConfirmationRemove: (callback: (data: any) => void) => {
    ipcRenderer.on('pet:confirm-remove', (_event, data) => callback(data));
  },
  onThemeChange: (callback: (theme: string) => void) => {
    ipcRenderer.on('pet:confirm-theme', (_event, theme) => callback(theme));
  },
  respond: (data: { conversation_id: string; msg_id: string; callId: string; data: any }) => {
    ipcRenderer.send('pet:confirm-respond', data);
  },
  dragStart: () => {
    ipcRenderer.send('pet:confirm-drag-start');
  },
  dragEnd: () => {
    ipcRenderer.send('pet:confirm-drag-end');
  },
});
