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
    // 1. 发送到所有 Electron BrowserWindow / Send to all Electron BrowserWindows
    for (let i = 0, len = adapterWindowList.length; i < len; i++) {
      const win = adapterWindowList[i];
      win.webContents.send(ADAPTER_BRIDGE_EVENT_KEY, JSON.stringify({ name, data }));
    }
    // 2. 同时广播到所有 WebSocket 客户端 / Also broadcast to all WebSocket clients
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
