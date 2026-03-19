/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { registerWebSocketBroadcaster, getBridgeEmitter } from '../adapter/main';
import { WebSocketManager } from './websocket/WebSocketManager';

// 存储取消注册函数，用于服务器停止时清理
// Store unregister function for cleanup when server stops
let unregisterBroadcaster: (() => void) | null = null;

/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 * Initialize Web Adapter - Bridge communication between WebSocket and platform bridge
 *
 * 注意：不再调用 bridge.adapter()，而是注册到主适配器
 * Note: No longer calling bridge.adapter(), instead registering with main adapter
 * 这样可以避免覆盖 Electron IPC 适配器
 * This avoids overwriting the Electron IPC adapter
 */
export function initWebAdapter(wss: WebSocketServer): void {
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();

  // 注册 WebSocket 广播函数到主适配器
  // Register WebSocket broadcast function to main adapter
  unregisterBroadcaster = registerWebSocketBroadcaster((name, data) => {
    wsManager.broadcast(name, data);
  });

  // 设置 WebSocket 消息处理器，将消息转发到 bridge emitter
  // Setup WebSocket message handler to forward messages to bridge emitter
  wsManager.setupConnectionHandler((name, data, _ws) => {
    const emitter = getBridgeEmitter();
    if (emitter) {
      emitter.emit(name, data);
    }
  });
}

/**
 * 清理 Web 适配器（服务器停止时调用）
 * Cleanup Web Adapter (called when server stops)
 */
export function cleanupWebAdapter(): void {
  if (unregisterBroadcaster) {
    unregisterBroadcaster();
    unregisterBroadcaster = null;
  }
}
