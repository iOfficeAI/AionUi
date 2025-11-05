/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

import { bridge } from '@office-ai/platform';
import { ADAPTER_BRIDGE_EVENT_KEY } from './constant';

/**
 * Bridge event data structure for IPC communication
 * IPC 通信的桥接事件数据结构
 */
interface BridgeEventData {
  name: string;
  data: unknown;
}

const adapterWindowList: Array<BrowserWindow> = [];

/**
 * @description 建立与每一个browserWindow的通信桥梁
 * */
bridge.adapter({
  emit(name, data) {
    for (let i = 0, len = adapterWindowList.length; i < len; i++) {
      const win = adapterWindowList[i];
      // console.log('>>>>>>>>adapter.emit', name, data);
      win.webContents.send(ADAPTER_BRIDGE_EVENT_KEY, JSON.stringify({ name, data }));
    }
  },
  on(emitter) {
    ipcMain.handle(ADAPTER_BRIDGE_EVENT_KEY, (event, info) => {
      const { name, data } = JSON.parse(info) as BridgeEventData;
      // console.log('>>>>>>>>adapter.on', name, data);
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
