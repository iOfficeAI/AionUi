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
 * WebSocket 广播函数类型
 * WebSocket broadcast function type
 */
type WebSocketBroadcastFn = (name: string, data: unknown) => void;

/**
 * 已注册的 WebSocket 广播函数列表
 * Registered WebSocket broadcast functions
 */
const webSocketBroadcasters: WebSocketBroadcastFn[] = [];

/**
 * 注册 WebSocket 广播函数（供 WebUI 服务器使用）
 * Register WebSocket broadcast function (for WebUI server)
 * @param broadcastFn - 广播函数 / Broadcast function
 * @returns 取消注册函数 / Unregister function
 */
export function registerWebSocketBroadcaster(broadcastFn: WebSocketBroadcastFn): () => void {
  webSocketBroadcasters.push(broadcastFn);
  return () => {
    const index = webSocketBroadcasters.indexOf(broadcastFn);
    if (index > -1) {
      webSocketBroadcasters.splice(index, 1);
    }
  };
}

/**
 * 注册 WebSocket 消息处理器（供 WebUI 服务器使用）
 * Register WebSocket message handler (for WebUI server)
 * 由于 bridge 的 emitter 在适配器初始化时捕获，我们需要将其暴露出来
 * Since bridge emitter is captured at adapter init time, we need to expose it
 */
let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

/**
 * 获取 bridge emitter（供 WebSocket 处理器使用）
 * Get bridge emitter (for WebSocket handler)
 */
export function getBridgeEmitter(): typeof bridgeEmitter {
  return bridgeEmitter;
}

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
    for (const broadcast of webSocketBroadcasters) {
      try {
        broadcast(name, data);
      } catch (error) {
        console.error('[MainAdapter] WebSocket broadcast error:', error);
      }
    }
  },
  on(emitter) {
    // 保存 emitter 引用供 WebSocket 处理使用 / Save emitter reference for WebSocket handling
    bridgeEmitter = emitter;

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
