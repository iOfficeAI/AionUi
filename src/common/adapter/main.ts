/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

import { bridge } from '@office-ai/platform';
import { ADAPTER_BRIDGE_EVENT_KEY } from './constant';
import { registerWebSocketBroadcaster, getBridgeEmitter, setBridgeEmitter, broadcastToAll } from './registry';

/**
 * Bridge event data structure for IPC communication
 * IPC 通信的桥接事件数据结构
 */
interface BridgeEventData {
  name: string;
  data: unknown;
}

const adapterWindowList: Array<BrowserWindow> = [];

export { registerWebSocketBroadcaster, getBridgeEmitter };

/**
 * @description 建立与每一个browserWindow的通信桥梁
 * */
bridge.adapter({
  emit(name, data) {
    // 1. Send to all Electron BrowserWindows (skip destroyed ones)
    for (let i = adapterWindowList.length - 1; i >= 0; i--) {
      const win = adapterWindowList[i];
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        adapterWindowList.splice(i, 1);
        continue;
      }
      win.webContents.send(ADAPTER_BRIDGE_EVENT_KEY, JSON.stringify({ name, data }));
    }
    // 2. Also broadcast to all WebSocket clients
    broadcastToAll(name, data);
  },
  on(emitter) {
    // 保存 emitter 引用供 WebSocket 处理使用 / Save emitter reference for WebSocket handling
    setBridgeEmitter(emitter);

    ipcMain.handle(ADAPTER_BRIDGE_EVENT_KEY, (_event, info) => {
      const { name, data } = JSON.parse(info) as BridgeEventData;
      return Promise.resolve(emitter.emit(name, data));
    });
  },
});

export const initMainAdapterWithWindow = (win: BrowserWindow) => {
  adapterWindowList.push(win);
  const off = () => {
    const index = adapterWindowList.indexOf(win);
    if (index > -1) adapterWindowList.splice(index, 1);
  };
  win.on('closed', off);
  return off;
};
