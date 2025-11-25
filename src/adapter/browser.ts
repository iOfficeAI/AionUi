/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge, logger } from '@office-ai/platform';
import type { ElectronBridgeAPI } from '@/types/electron';

interface CustomWindow extends Window {
  electronAPI?: ElectronBridgeAPI;
  __bridgeEmitter?: { emit: (name: string, data: unknown) => void };
  __emitBridgeCallback?: (name: string, data: unknown) => void;
  __websocketReconnect?: () => void;
}

const win = window as CustomWindow;

/**
 * 适配electron的API到浏览器中,建立renderer和main的通信桥梁, 与preload.ts中的注入对应
 * */
if (win.electronAPI) {
  // Electron 环境 - 使用 IPC 通信
  bridge.adapter({
    emit(name, data) {
      return win.electronAPI.emit(name, data);
    },
    on(emitter) {
      win.electronAPI?.on((event) => {
        try {
          const { value } = event;
          const { name, data } = JSON.parse(value);
          emitter.emit(name, data);
        } catch (e) {
          console.warn('JSON parsing error:', e);
        }
      });
    },
  });
} else {
  // Web 环境 - 使用 WebSocket 通信，并在登录后自动补上已获取 Cookie 的连接
  // Web runtime bridge: ensure the socket reconnects after login so session cookie can be sent
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultHost = `${window.location.hostname}:25808`;
  const socketUrl = `${protocol}//${window.location.host || defaultHost}`;

  type QueuedMessage = { name: string; data: unknown };

  let socket: WebSocket | null = null;
  let emitterRef: { emit: (name: string, data: unknown) => void } | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = 500;
  let shouldReconnect = true; // Flag to control reconnection

  const messageQueue: QueuedMessage[] = [];

  // 1.发送队列中积压的消息，确保在重新建立连接后不会丢事件
  const flushQueue = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (messageQueue.length > 0) {
      const queued = messageQueue.shift();
      if (queued) {
        socket.send(JSON.stringify(queued));
      }
    }
  };

  // 2.简单的指数退避重连，等待服务端在登录成功后接受新连接
  const scheduleReconnect = () => {
    if (reconnectTimer !== null || !shouldReconnect) {
      return;
    }

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      reconnectDelay = Math.min(reconnectDelay * 2, 8000);
      connect();
    }, reconnectDelay);
  };

  // 3.建立 WebSocket 连接（或复用已有的 OPEN/CONNECTING 状态）
  const connect = () => {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      socket = new WebSocket(socketUrl);
    } catch (error) {
      scheduleReconnect();
      return;
    }

    socket.addEventListener('open', () => {
      reconnectDelay = 500;
      flushQueue();
    });

    socket.addEventListener('message', (event: MessageEvent) => {
      if (!emitterRef) {
        return;
      }

      try {
        const payload = JSON.parse(event.data as string) as { name: string; data: unknown };

        // 处理服务端心跳 ping，立即回复 pong 以保持连接
        // Handle server heartbeat ping - respond with pong immediately to keep connection alive
        if (payload.name === 'ping') {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ name: 'pong', data: { timestamp: Date.now() } }));
          }
          return;
        }

        // 处理认证过期 - 停止重连并跳转到登录页
        // Handle auth expiration - stop reconnecting and redirect to login
        if (payload.name === 'auth-expired') {
          console.warn('[WebSocket] Authentication expired, stopping reconnection');
          shouldReconnect = false;

          // 清除所有待执行的重连定时器
          // Clear any pending reconnection timer
          if (reconnectTimer !== null) {
            window.clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }

          // 关闭 socket 并跳转到登录页
          // Close the socket and redirect to login page
          socket?.close();

          // 短暂延迟后跳转到登录页，以便显示 UI 反馈
          // Redirect to login page after a short delay to show any UI feedback
          setTimeout(() => {
            window.location.href = '/login';
          }, 1000);

          return;
        }

        emitterRef.emit(payload.name, payload.data);
      } catch (error) {
        // 忽略格式错误的消息 / Ignore malformed payloads
      }
    });

    socket.addEventListener('close', () => {
      socket = null;
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      socket?.close();
    });
  };

  // 4.确保在发送/订阅前已经发起连接
  const ensureSocket = () => {
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) {
      connect();
    }
  };

  bridge.adapter({
    emit(name, data) {
      const message: QueuedMessage = { name, data };

      ensureSocket();

      if (socket && socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(JSON.stringify(message));
          return;
        } catch (error) {
          scheduleReconnect();
        }
      }

      messageQueue.push(message);
    },
    on(emitter) {
      emitterRef = emitter;
      win.__bridgeEmitter = emitter;

      // Expose callback emitter for bridge provider pattern
      // Used by components to send responses back through WebSocket
      win.__emitBridgeCallback = (name: string, data: unknown) => {
        emitter.emit(name, data);
      };

      ensureSocket();
    },
  });

  connect();

  // Expose reconnection control for login flow
  win.__websocketReconnect = () => {
    shouldReconnect = true;
    reconnectDelay = 500;
    connect();
  };
}

logger.provider({
  log(log) {
    console.log('process.log', log.type, ...log.logs);
  },
  path() {
    return Promise.resolve('');
  },
});
