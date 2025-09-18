/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import { bridge } from '@office-ai/platform';

let activeTokens: Set<string>;
const connectedClients: Set<WebSocket> = new Set();

// 存储待处理的文件选择请求
const pendingFileRequests = new Map<string, any>();

// 存储bridge实例的引用
let bridgeInstance: typeof bridge;


/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 */
export function initWebAdapter(wss: WebSocketServer, tokens: Set<string>): void {
  activeTokens = tokens;
  bridgeInstance = bridge;

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
        // Token 验证（在 index.ts 中已经完成，这里是双重保险）
        const url = new URL(req.url || '', 'http://localhost');
        const token = url.searchParams.get('token');

        if (!token || !activeTokens.has(token)) {
          ws.close(1008, 'Invalid token');
          return;
        }

        // 添加到活跃连接
        connectedClients.add(ws);
        // 处理消息
        ws.on('message', (rawData) => {
          try {
            const { name, data } = JSON.parse(rawData.toString());

            // 处理文件选择请求
            if (name === 'subscribe-show-open') {
              let requestId = data.id;
              if (requestId && requestId.startsWith('show-open')) {
                requestId = requestId.replace('show-open', '');
              }

              const isFileMode = data && data.properties && (data.properties.includes('openFile') || data.properties.includes('multiSelections')) && !data.properties.includes('openDirectory');

              ws.send(JSON.stringify({ name: 'show-open-request', data: { ...data, isFileMode } }));

              pendingFileRequests.set(requestId, {
                originalData: data,
                requestName: name,
                timestamp: Date.now(),
              });
              return;
            }

            // 处理文件选择响应
            if (name === 'show-open-response') {
              for (const [requestId, requestInfo] of pendingFileRequests.entries()) {
                const eventName = requestInfo.requestName.replace('subscribe-', '');
                const callbackEventName = `subscribe.callback-${eventName}${requestId}`;
                bridgeInstance.emit(callbackEventName, data);
                pendingFileRequests.delete(requestId);
                break;
              }
              return;
            }

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
