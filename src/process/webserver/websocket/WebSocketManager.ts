/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { TokenMiddleware } from '@process/webserver/auth/middleware/TokenMiddleware';
import { WEBSOCKET_CONFIG } from '../config/constants';
import { SHOW_OPEN_REQUEST_EVENT } from '@/common/adapter/constant';

interface ClientInfo {
  token: string;
  lastPing: number;
}

/**
 * WebSocket 管理器 - 管理客户端连接、心跳检测和消息处理
 * WebSocket Manager - Manages client connections, heartbeat detection, and message handling
 */
export class WebSocketManager {
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(private wss: WebSocketServer) {}

  /**
   * 初始化 WebSocket 管理器
   * Initialize WebSocket manager
   */
  initialize(): void {
    this.startHeartbeat();
    console.log('[WebSocketManager] Initialized');
  }

  /**
   * 设置连接处理器
   * Setup connection handler
   */
  setupConnectionHandler(onMessage: (name: string, data: any, ws: WebSocket) => void): void {
    this.wss.on('connection', async (ws: WebSocket, req: IncomingMessage) => {
      // Buffer messages that arrive before async auth completes so they are
      // not lost due to the race between ws.on("message") registration and
      // the await below.
      const pendingMessages: Buffer[] = [];
      const bufferMessage = (raw: Buffer) => pendingMessages.push(raw);
      ws.on('message', bufferMessage);

      const token = TokenMiddleware.extractWebSocketToken(req);

      if (!(await this.validateConnection(ws, token))) {
        ws.off('message', bufferMessage);
        return;
      }

      ws.off('message', bufferMessage);
      this.addClient(ws, token!);
      this.setupMessageHandler(ws, onMessage);
      this.setupCloseHandler(ws);
      this.setupErrorHandler(ws);

      // Replay any messages that arrived during auth validation
      for (const raw of pendingMessages) {
        ws.emit('message', raw, false);
      }

      console.log('[WebSocketManager] Client connected');
    });
  }

  /**
   * 验证连接
   * Validate connection
   */
  private async validateConnection(ws: WebSocket, token: string | null): Promise<boolean> {
    if (!token) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'No token provided');
      return false;
    }

    if (!(await TokenMiddleware.validateWebSocketToken(token))) {
      // Send auth-expired before closing so the client can redirect to login
      // instead of entering an infinite reconnection loop.
      // This mirrors the behavior in checkClients() heartbeat check.
      try {
        ws.send(
          JSON.stringify({
            name: 'auth-expired',
            data: { message: 'Token expired, please login again' },
          })
        );
      } catch {
        // Socket may not be ready for sending yet; close will still fire on client
      }
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Invalid or expired token');
      return false;
    }

    return true;
  }

  /**
   * 添加客户端
   * Add client
   */
  private addClient(ws: WebSocket, token: string): void {
    this.clients.set(ws, {
      token,
      lastPing: Date.now(),
    });
  }

  /**
   * 设置消息处理器
   * Setup message handler
   */
  private setupMessageHandler(ws: WebSocket, onMessage: (name: string, data: any, ws: WebSocket) => void): void {
    ws.on('message', (rawData) => {
      try {
        const parsed = JSON.parse(rawData.toString());
        const { name, data } = parsed;

        // Handle pong response - update last ping time
        if (name === 'pong') {
          this.updateLastPing(ws);
          return;
        }

        // Handle file selection request - forward to client
        if (name === 'subscribe-show-open') {
          this.handleFileSelection(ws, data);
          return;
        }

        // Forward other messages to bridge system
        onMessage(name, data, ws);
      } catch (error) {
        ws.send(
          JSON.stringify({
            error: 'Invalid message format',
            expected: '{ "name": "event-name", "data": {...} }',
          })
        );
      }
    });
  }

  /**
   * 处理文件选择请求
   * Handle file selection request
   */
  private handleFileSelection(ws: WebSocket, data: any): void {
    // Extract properties from nested data structure
    const actualData = data.data || data;
    const properties = actualData.properties;

    // Determine if this is file selection mode
    const isFileMode = properties && properties.includes('openFile') && !properties.includes('openDirectory');

    // Send file selection request to client with isFileMode flag
    ws.send(
      JSON.stringify({
        name: SHOW_OPEN_REQUEST_EVENT,
        data: { ...data, isFileMode },
      })
    );
  }

  /**
   * 设置关闭处理器
   * Setup close handler
   */
  private setupCloseHandler(ws: WebSocket): void {
    ws.on('close', () => {
      this.clients.delete(ws);
      console.log('[WebSocketManager] Client disconnected');
    });
  }

  /**
   * 设置错误处理器
   * Setup error handler
   */
  private setupErrorHandler(ws: WebSocket): void {
    ws.on('error', (error) => {
      console.error('[WebSocketManager] Client error:', error);
      this.clients.delete(ws);
    });
  }

  /**
   * 更新最后心跳时间
   * Update last ping time
   */
  private updateLastPing(ws: WebSocket): void {
    const clientInfo = this.clients.get(ws);
    if (clientInfo) {
      clientInfo.lastPing = Date.now();
    }
  }

  /**
   * 启动心跳检测
   * Start heartbeat detection
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkClients();
    }, WEBSOCKET_CONFIG.HEARTBEAT_INTERVAL);
  }

  /**
   * 检查所有客户端
   * Check all clients
   */
  private async checkClients(): Promise<void> {
    const now = Date.now();

    for (const [ws, clientInfo] of this.clients) {
      // Check if client timed out
      if (this.isClientTimeout(clientInfo, now)) {
        console.log('[WebSocketManager] Client heartbeat timeout, closing connection');
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Heartbeat timeout');
        this.clients.delete(ws);
        continue;
      }

      // Validate if WebSocket token is still valid
      if (!(await TokenMiddleware.validateWebSocketToken(clientInfo.token))) {
        console.log('[WebSocketManager] Token expired, closing connection');
        ws.send(
          JSON.stringify({
            name: 'auth-expired',
            data: { message: 'Token expired, please login again' },
          })
        );
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Token expired');
        this.clients.delete(ws);
        continue;
      }

      // Send heartbeat ping
      this.sendHeartbeat(ws);
    }
  }

  /**
   * 检查客户端是否超时
   * Check if client timed out
   */
  private isClientTimeout(clientInfo: ClientInfo, now: number): boolean {
    return now - clientInfo.lastPing > WEBSOCKET_CONFIG.HEARTBEAT_TIMEOUT;
  }

  /**
   * 发送心跳
   * Send heartbeat
   */
  private sendHeartbeat(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ name: 'ping', data: { timestamp: Date.now() } }));
    }
  }

  /**
   * 向所有客户端广播消息
   * Broadcast message to all clients
   */
  broadcast(name: string, data: any): void {
    const message = JSON.stringify({ name, data });

    for (const [ws, _clientInfo] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  /**
   * 获取连接的客户端数量
   * Get connected client count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * 清理资源
   * Cleanup resources
   */
  destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Close all connections
    for (const [ws] of this.clients) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.NORMAL_CLOSURE, 'Server shutting down');
    }

    this.clients.clear();
    console.log('[WebSocketManager] Destroyed');
  }
}

export default WebSocketManager;
