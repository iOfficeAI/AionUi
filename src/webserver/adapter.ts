/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import { bridge } from '@office-ai/platform';
import { dialog } from 'electron';
import { ipcBridge } from '../common';

let activeTokens: Set<string>;
const connectedClients: Set<WebSocket> = new Set();

/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 */
export function initWebAdapter(wss: WebSocketServer, tokens: Set<string>): void {
  console.log('🔧 [Adapter] Initializing Web adapter...');
  activeTokens = tokens;

  // 设置WebUI模式下的dialog.showOpen provider（与Electron模式保持一致）
  ipcBridge.dialog.showOpen.provider((options) => {
    return dialog
      .showOpenDialog({
        defaultPath: options?.defaultPath,
        properties: options?.properties,
      })
      .then((res) => {
        return res.filePaths;
      });
  });

  // 设置 bridge 适配器
  bridge.adapter({
    // 从 main process 向 web clients 发送数据
    emit(name: string, data: any) {
      const message = JSON.stringify({ name, data });

      connectedClients.forEach((ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    },

    // 接收来自 web clients 的数据
    on(emitter) {
      console.log('🔌 [Adapter] Setting up WebSocket connection handler...');
      wss.on('connection', (ws, req) => {
        console.log('🌐 [Adapter] WebSocket client connected');
        // Token 验证（在 index.ts 中已经完成，这里是双重保险）
        const url = new URL(req.url || '', 'http://localhost');
        const token = url.searchParams.get('token');

        if (!token || !activeTokens.has(token)) {
          console.log('❌ [Adapter] Invalid token');
          ws.close(1008, 'Invalid token');
          return;
        }

        console.log('✅ [Adapter] Token validated, adding to connected clients');
        // 添加到活跃连接
        connectedClients.add(ws);
        // 处理消息
        ws.on('message', async (rawData) => {
          try {
            const { name, data } = JSON.parse(rawData.toString());
            console.log('📨 [WebSocket] Received message:', name, data);

            // 其他消息转发给 bridge 系统
            emitter.emit(name, data);
          } catch (error) {
            console.warn('Invalid WebSocket message:', error);
            ws.send(
              JSON.stringify({
                error: 'Invalid message format',
                expected: '{ "name": "event-name", "data": {...} }',
              })
            );
          }
        });

        // 清理连接
        ws.on('close', () => {
          connectedClients.delete(ws);
        });

        ws.on('error', (error) => {
          console.warn('WebSocket error:', error);
          connectedClients.delete(ws);
        });
      });
    },
  });
}

/**
 * 获取当前连接的客户端数量
 */
export function getConnectedClientsCount(): number {
  return connectedClients.size;
}

/**
 * 向所有连接的客户端发送消息
 */
export function broadcastToClients(name: string, data: any): void {
  const message = JSON.stringify({ name, data });

  connectedClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
