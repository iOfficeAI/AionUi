/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import { bridge } from '@office-ai/platform';

let isTokenValidFn: (token: string) => boolean;
const connectedClients: Set<WebSocket> = new Set();

/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 */
export function initWebAdapter(wss: WebSocketServer, tokenValidator: (token: string) => boolean): void {
  isTokenValidFn = tokenValidator;

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
      wss.on('connection', (ws, req) => {
        // Token 验证 - 支持从Headers或URL获取
        const url = new URL(req.url || '', 'http://localhost');
        const token = req.headers['authorization']?.replace('Bearer ', '') ||
                     req.headers['sec-websocket-protocol'] ||
                     url.searchParams.get('token');

        if (!token || !isTokenValidFn(token)) {
          ws.close(1008, 'Invalid or expired token');
          return;
        }

        // 添加到活跃连接
        connectedClients.add(ws);
        // 处理消息
        ws.on('message', async (rawData) => {
          try {
            const { name, data } = JSON.parse(rawData.toString());

            // 处理文件选择请求 - 转发给客户端弹窗处理
            if (name === 'subscribe-show-open') {
              // 判断是否为文件选择模式
              const isFileMode = data && data.properties && (data.properties.includes('openFile') || data.properties.includes('multiSelections')) && !data.properties.includes('openDirectory');

              // 发送文件选择请求给客户端
              ws.send(JSON.stringify({ name: 'show-open-request', data: { ...data, isFileMode } }));
              return;
            }

            // 其他消息转发给 bridge 系统
            emitter.emit(name, data);
          } catch (error) {
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

        ws.on('error', () => {
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
