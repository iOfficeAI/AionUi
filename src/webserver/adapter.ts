/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { bridge } from '@office-ai/platform';
import { WebSocketManager } from './websocket/WebSocketManager';

/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 * Initialize Web Adapter - Bridge communication between WebSocket and platform bridge
 */
export function initWebAdapter(wss: WebSocketServer): void {
  const wsManager = new WebSocketManager(wss);
  wsManager.initialize();

  // Setup bridge adapter
  bridge.adapter({
    // Send data from main process to web clients
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit(name: string, data: any) {
      wsManager.broadcast(name, data);
    },

    // Receive data from web clients
    on(emitter) {
      wsManager.setupConnectionHandler((name, data, _ws) => {
        emitter.emit(name, data);
      });
    },
  });

  console.log('[WebAdapter] ✓ Web adapter initialized successfully');
}

/**
 * 获取当前连接的客户端数量
 * Get connected client count (for backward compatibility)
 */
export function getConnectedClientsCount(): number {
  // This function is kept for backward compatibility
  // In the new architecture, you should access this through WebSocketManager instance
  return 0;
}

/**
 * 向所有连接的客户端发送消息
 * Broadcast message to all connected clients (for backward compatibility)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function broadcastToClients(_name: string, _data: any): void {
  // This function is kept for backward compatibility
  // In the new architecture, you should access this through WebSocketManager instance
  console.warn('[WebAdapter] broadcastToClients is deprecated, use WebSocketManager.broadcast instead');
}
