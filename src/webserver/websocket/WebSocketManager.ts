/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { WebSocketServer } from 'ws';
import { WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import crypto from 'crypto';
import { TokenMiddleware } from '@/webserver/auth/middleware/TokenMiddleware';
import { AuthService } from '@/webserver/auth/service/AuthService';
import { getRemoteRuntimeHub } from '@/webserver/remote';
import { WEBSOCKET_CONFIG } from '../config/constants';
import { SHOW_OPEN_REQUEST_EVENT } from '../../adapter/constant';

interface ClientInfo {
  token: string;
  userId: string;
  username: string;
  deviceId: string;
  lastPing: number;
}

/**
 * WebSocket 管理器 - 管理客户端连接、心跳检测和消息处理
 * WebSocket Manager - Manages client connections, heartbeat detection, and message handling
 */
export class WebSocketManager {
  private clients: Map<WebSocket, ClientInfo> = new Map();
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private remoteHubUnsubscribers: Array<() => void> = [];

  constructor(private wss: WebSocketServer) {}

  /**
   * 初始化 WebSocket 管理器
   * Initialize WebSocket manager
   */
  initialize(): void {
    this.startHeartbeat();
    this.bindRemoteHubEvents();
    console.log('[WebSocketManager] Initialized');
  }

  /**
   * 设置连接处理器
   * Setup connection handler
   */
  setupConnectionHandler(onMessage: (name: string, data: any, ws: WebSocket) => void): void {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const token = TokenMiddleware.extractWebSocketToken(req);
      const auth = this.validateConnection(ws, token);

      if (!auth || !token) {
        return;
      }

      const deviceId = this.resolveDeviceId(req);
      this.addClient(ws, token, auth.userId, auth.username, deviceId);
      this.registerRemoteDevice(ws, req);
      this.setupMessageHandler(ws, onMessage);
      this.setupCloseHandler(ws);
      this.setupErrorHandler(ws);
      this.sendRemoteSnapshot(ws);

      console.log(`[WebSocketManager] Client connected (user=${auth.username}, device=${deviceId.slice(0, 8)})`);
    });
  }

  /**
   * 验证连接
   * Validate connection
   */
  private validateConnection(ws: WebSocket, token: string | null): { userId: string; username: string } | null {
    if (!token) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'No token provided');
      return null;
    }

    const decoded = AuthService.verifyWebSocketToken(token);
    if (!decoded) {
      try {
        ws.send(JSON.stringify({ name: 'auth-expired', data: { message: 'Token expired, please login again' } }));
      } catch {
        // Socket may not be ready for sending yet
      }
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Invalid or expired token');
      return null;
    }

    return {
      userId: decoded.userId,
      username: decoded.username,
    };
  }

  /**
   * 添加客户端
   * Add client
   */
  private addClient(ws: WebSocket, token: string, userId: string, username: string, deviceId: string): void {
    this.clients.set(ws, {
      token,
      userId,
      username,
      deviceId,
      lastPing: Date.now(),
    });
  }

  /**
   * 注册远程设备
   * Register remote device
   */
  private registerRemoteDevice(ws: WebSocket, req: IncomingMessage): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) return;

    getRemoteRuntimeHub().registerDevice({
      deviceId: clientInfo.deviceId,
      userId: clientInfo.userId,
      username: clientInfo.username,
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.socket.remoteAddress,
      capabilities: ['ws', 'handoff', 'approval'],
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

        if (this.handleSystemMessages(ws, name, data)) {
          return;
        }

        if (this.handleRemoteRuntimeMessages(ws, name, data)) {
          return;
        }

        // Forward other messages to bridge system
        onMessage(name, data, ws);
      } catch {
        ws.send(
          JSON.stringify({
            error: 'Invalid message format',
            expected: '{ "name": "event-name", "data": {...} }',
          })
        );
      }
    });
  }

  private handleSystemMessages(ws: WebSocket, name: string, data: any): boolean {
    if (name === 'pong') {
      this.updateLastPing(ws);
      const clientInfo = this.clients.get(ws);
      if (clientInfo) {
        getRemoteRuntimeHub().markDeviceAlive(clientInfo.userId, clientInfo.deviceId);
      }
      return true;
    }

    if (name === 'subscribe-show-open') {
      this.handleFileSelection(ws, data);
      return true;
    }

    return false;
  }

  private handleRemoteRuntimeMessages(ws: WebSocket, name: string, data: any): boolean {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) {
      return false;
    }

    const remoteHub = getRemoteRuntimeHub();

    try {
      if (name === 'remote.snapshot.request') {
        this.sendRemoteSnapshot(ws);
        return true;
      }

      if (name === 'remote.session.open') {
        const title = typeof data?.title === 'string' ? data.title : undefined;
        const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : undefined;
        const metadata = this.toOptionalRecord(data?.metadata);
        const session = remoteHub.openSession(clientInfo.userId, title, metadata, sessionId);
        ws.send(JSON.stringify({ name: 'remote.session.opened', data: session }));
        return true;
      }

      if (name === 'remote.session.attach') {
        if (typeof data?.sessionId !== 'string' || data.sessionId.trim() === '') {
          ws.send(JSON.stringify({ name: 'remote.error', data: { message: 'sessionId is required' } }));
          return true;
        }
        const session = remoteHub.attachSession(clientInfo.userId, data.sessionId, clientInfo.deviceId);
        ws.send(JSON.stringify({ name: 'remote.session.attached', data: session }));
        return true;
      }

      if (name === 'remote.session.detach') {
        if (typeof data?.sessionId !== 'string' || data.sessionId.trim() === '') {
          ws.send(JSON.stringify({ name: 'remote.error', data: { message: 'sessionId is required' } }));
          return true;
        }
        const session = remoteHub.detachSession(clientInfo.userId, data.sessionId, clientInfo.deviceId);
        ws.send(JSON.stringify({ name: 'remote.session.detached', data: session }));
        return true;
      }

      if (name === 'remote.approval.create') {
        const title = typeof data?.title === 'string' ? data.title : 'Approval request';
        const summary = typeof data?.summary === 'string' ? data.summary : 'Remote action requires approval';
        const sessionId = typeof data?.sessionId === 'string' ? data.sessionId : undefined;
        const payload = this.toOptionalRecord(data?.payload);
        const ttlMs = typeof data?.ttlMs === 'number' ? data.ttlMs : undefined;

        const approval = remoteHub.createApproval({
          userId: clientInfo.userId,
          title,
          summary,
          sessionId,
          payload,
          ttlMs,
        });

        ws.send(JSON.stringify({ name: 'remote.approval.created', data: approval }));
        return true;
      }

      if (name === 'remote.approval.resolve') {
        if (typeof data?.approvalId !== 'string' || data.approvalId.trim() === '') {
          ws.send(JSON.stringify({ name: 'remote.error', data: { message: 'approvalId is required' } }));
          return true;
        }

        const status = data?.status;
        if (status !== 'approved' && status !== 'rejected') {
          ws.send(JSON.stringify({ name: 'remote.error', data: { message: 'status must be approved or rejected' } }));
          return true;
        }

        const note = typeof data?.note === 'string' ? data.note : undefined;
        const approval = remoteHub.resolveApproval(clientInfo.userId, data.approvalId, status, clientInfo.deviceId, clientInfo.username, note);
        ws.send(JSON.stringify({ name: 'remote.approval.resolved', data: approval }));
        return true;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote runtime operation failed';
      ws.send(JSON.stringify({ name: 'remote.error', data: { message } }));
      return true;
    }

    return false;
  }

  private toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }

    return value as Record<string, unknown>;
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
    ws.send(JSON.stringify({ name: SHOW_OPEN_REQUEST_EVENT, data: { ...data, isFileMode } }));
  }

  /**
   * 设置关闭处理器
   * Setup close handler
   */
  private setupCloseHandler(ws: WebSocket): void {
    ws.on('close', () => {
      const clientInfo = this.clients.get(ws);
      if (clientInfo) {
        getRemoteRuntimeHub().unregisterDevice(clientInfo.userId, clientInfo.deviceId);
      }
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
      const clientInfo = this.clients.get(ws);
      if (clientInfo) {
        getRemoteRuntimeHub().unregisterDevice(clientInfo.userId, clientInfo.deviceId);
      }
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
  private checkClients(): void {
    const now = Date.now();

    for (const [ws, clientInfo] of this.clients) {
      // Check if client timed out
      if (this.isClientTimeout(clientInfo, now)) {
        console.log('[WebSocketManager] Client heartbeat timeout, closing connection');
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Heartbeat timeout');
        this.clients.delete(ws);
        getRemoteRuntimeHub().unregisterDevice(clientInfo.userId, clientInfo.deviceId);
        continue;
      }

      // Validate if WebSocket token is still valid
      if (!AuthService.verifyWebSocketToken(clientInfo.token)) {
        console.log('[WebSocketManager] Token expired, closing connection');
        ws.send(JSON.stringify({ name: 'auth-expired', data: { message: 'Token expired, please login again' } }));
        ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.POLICY_VIOLATION, 'Token expired');
        this.clients.delete(ws);
        getRemoteRuntimeHub().unregisterDevice(clientInfo.userId, clientInfo.deviceId);
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

    for (const [ws] of this.clients) {
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

    for (const unsubscribe of this.remoteHubUnsubscribers) {
      unsubscribe();
    }
    this.remoteHubUnsubscribers = [];

    // Close all connections
    for (const [ws] of this.clients) {
      ws.close(WEBSOCKET_CONFIG.CLOSE_CODES.NORMAL_CLOSURE, 'Server shutting down');
    }

    this.clients.clear();
    console.log('[WebSocketManager] Destroyed');
  }

  private bindRemoteHubEvents(): void {
    const hub = getRemoteRuntimeHub();

    const bind = (event: string, listener: (payload: any) => void) => {
      hub.on(event, listener);
      this.remoteHubUnsubscribers.push(() => {
        hub.off(event, listener);
      });
    };

    bind('remote.devices.updated', (payload: { userId: string; devices: unknown[] }) => {
      this.broadcastToUser(payload.userId, 'remote.devices.updated', payload.devices);
    });

    bind('remote.sessions.updated', (payload: { userId: string; sessions: unknown[] }) => {
      this.broadcastToUser(payload.userId, 'remote.sessions.updated', payload.sessions);
    });

    bind('remote.approvals.updated', (payload: { userId: string; approvals: unknown[] }) => {
      this.broadcastToUser(payload.userId, 'remote.approvals.updated', payload.approvals);
    });

    bind('remote.tunnel.updated', (payload: { status: unknown }) => {
      this.broadcast('remote.tunnel.updated', payload.status);
    });
  }

  private broadcastToUser(userId: string, name: string, data: unknown): void {
    const message = JSON.stringify({ name, data });

    for (const [ws, clientInfo] of this.clients) {
      if (clientInfo.userId !== userId) continue;
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    }
  }

  private sendRemoteSnapshot(ws: WebSocket): void {
    const clientInfo = this.clients.get(ws);
    if (!clientInfo) {
      return;
    }

    const snapshot = getRemoteRuntimeHub().getSnapshot(clientInfo.userId);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ name: 'remote.snapshot', data: snapshot }));
    }
  }

  private resolveDeviceId(req: IncomingMessage): string {
    const fromHeader = req.headers['x-aionui-device-id'];
    if (typeof fromHeader === 'string' && fromHeader.trim() !== '') {
      return fromHeader.trim();
    }

    const cookieHeader = req.headers['cookie'];
    if (typeof cookieHeader === 'string') {
      const cookies = cookieHeader.split(';').reduce(
        (acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          if (key && value) {
            acc[key] = decodeURIComponent(value);
          }
          return acc;
        },
        {} as Record<string, string>
      );
      if (cookies['aionui-device-id']) {
        return cookies['aionui-device-id'];
      }
    }

    return `dev_${crypto.randomUUID()}`;
  }
}

export default WebSocketManager;
