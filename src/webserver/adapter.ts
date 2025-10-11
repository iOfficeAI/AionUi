/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import { bridge } from '@office-ai/platform';
import { AuthService } from '../auth/AuthService';

// 已连接的客户端映射 / Connected clients map
const connectedClients: Map<WebSocket, { token: string; lastPing: number }> = new Map();

// 心跳检测配置 / Heartbeat configuration
const HEARTBEAT_INTERVAL = 30000; // 30秒发送一次心跳 / Send heartbeat every 30 seconds
const HEARTBEAT_TIMEOUT = 60000; // 60秒无响应断开连接 / Disconnect after 60 seconds without response

/**
 * 初始化 Web 适配器 - 建立 WebSocket 与 bridge 的通信桥梁
 * Initialize Web Adapter - Bridge communication between WebSocket and platform bridge
 */
export function initWebAdapter(wss: WebSocketServer): void {
  // 启动心跳检测定时器 / Start heartbeat timer
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const heartbeatTimer = setInterval(() => {
    const now = Date.now();
    connectedClients.forEach((clientInfo, ws) => {
      // 检查客户端是否超时 / Check if client timed out
      if (now - clientInfo.lastPing > HEARTBEAT_TIMEOUT) {
        console.log('[WebSocket] Client heartbeat timeout, closing connection');
        ws.close(1008, 'Heartbeat timeout');
        connectedClients.delete(ws);
        return;
      }

      // 验证 WebSocket token 是否仍然有效 / Validate if WebSocket token is still valid
      if (!AuthService.verifyWebSocketToken(clientInfo.token)) {
        console.log('[WebSocket] Token expired, closing connection');
        ws.send(JSON.stringify({ name: 'auth-expired', data: { message: 'Token expired, please login again' } }));
        ws.close(1008, 'Token expired');
        connectedClients.delete(ws);
        return;
      }

      // 发送心跳 ping / Send heartbeat ping
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ name: 'ping', data: { timestamp: now } }));
      }
    });
  }, HEARTBEAT_INTERVAL);

  // 设置 bridge 适配器 / Setup bridge adapter
  bridge.adapter({
    // 从主进程向 Web 客户端发送数据 / Send data from main process to web clients
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit(name: string, data: any) {
      const message = JSON.stringify({ name, data });

      connectedClients.forEach((_clientInfo, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(message);
        }
      });
    },

    // 接收来自 Web 客户端的数据 / Receive data from web clients
    on(emitter) {
      wss.on('connection', (ws, req) => {
        // Token 验证 - 支持从 Headers 或 URL 获取
        // Token validation - support from Headers or URL
        const url = new URL(req.url || '', 'http://localhost');
        const token = req.headers['authorization']?.replace('Bearer ', '') || req.headers['sec-websocket-protocol'] || url.searchParams.get('token');

        if (!token) {
          console.warn('[WebSocket] Connection rejected: No token provided');
          ws.close(1008, 'No token provided');
          return;
        }

        // 验证 WebSocket token（使用专用的验证方法）
        // Verify WebSocket token (using dedicated verification method)
        if (!AuthService.verifyWebSocketToken(token)) {
          console.warn('[WebSocket] Connection rejected: Invalid or expired WebSocket token');
          ws.close(1008, 'Invalid or expired token');
          return;
        }

        // 添加到活跃连接，保存 token 和最后心跳时间
        // Add to active connections, save token and last ping time
        connectedClients.set(ws, { token, lastPing: Date.now() });

        // 处理消息 / Handle messages
        ws.on('message', async (rawData) => {
          try {
            const { name, data } = JSON.parse(rawData.toString());

            // 处理心跳响应 - 更新最后心跳时间
            // Handle pong response - update last ping time
            if (name === 'pong') {
              const clientInfo = connectedClients.get(ws);
              if (clientInfo) {
                clientInfo.lastPing = Date.now();
              }
              return;
            }

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
 * 向所有连接的客户端发送消息 / Broadcast message to all connected clients
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function broadcastToClients(name: string, data: any): void {
  const message = JSON.stringify({ name, data });

  connectedClients.forEach((clientInfo, ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  });
}
