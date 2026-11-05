/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@/common/platform/bridge';
import { WEBUI_DEFAULT_PORT } from '@/common/config/constants';
import { refreshSessionOutcome, resetSessionRefresh } from './sessionRefresh';
import type { ElectronBridgeAPI } from '@/common/types/platform/electron';

interface CustomWindow extends Window {
  electronAPI?: ElectronBridgeAPI;
  __bridgeEmitter?: { emit: (name: string, data: unknown) => void };
  __websocketReconnect?: () => void;
}

type BrowserWebSocketPayload = { name: string; data?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBrowserWebSocketPayload(value: unknown): value is BrowserWebSocketPayload {
  return isRecord(value) && typeof value.name === 'string';
}

export function isRealtimeAuthTerminalError(payload: unknown): boolean {
  const data = getRealtimeErrorData(payload);
  if (!data) {
    return false;
  }

  const { code } = data;
  return code === 'REALTIME_AUTH_MISSING' || code === 'REALTIME_AUTH_EXPIRED';
}

function getRealtimeErrorData(payload: unknown): Record<string, unknown> | null {
  if (!isBrowserWebSocketPayload(payload) || payload.name !== 'realtime.error' || !isRecord(payload.data)) {
    return null;
  }

  return payload.data;
}

function isUnrecoverableRealtimeError(payload: unknown): boolean {
  return getRealtimeErrorData(payload)?.recoverable === false;
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
  // Web runtime bridge: ensure the socket reconnects after login so session cookie can be sent.
  // Path must be `/ws` — web-host's static-server only proxies WebSocket upgrades under /ws.
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const defaultHost = `${window.location.hostname}:${WEBUI_DEFAULT_PORT}`;
  const socketUrl = `${protocol}//${window.location.host || defaultHost}/ws`;

  type QueuedMessage = { name: string; data: unknown };

  const BASE_RECONNECT_DELAY = 500;
  const MAX_RECONNECT_DELAY = 8000;
  // A connection must hold this long before the backoff is considered recovered.
  // A server that accepts the upgrade and drops it right away (rejected auth,
  // backend restarting) still fires `open`, so resetting the delay there alone
  // would keep the backoff pinned at its minimum forever.
  const STABLE_CONNECTION_MS = 5000;

  let socket: WebSocket | null = null;
  let emitterRef: { emit: (name: string, data: unknown) => void } | null = null;
  let reconnectTimer: number | null = null;
  let reconnectDelay = BASE_RECONNECT_DELAY;
  let connectedAt = 0;
  let shouldReconnect = true; // Flag to control reconnection
  // Auth recovery runs on its own schedule: the socket stays down until a refresh
  // succeeds, so it must not share the reconnect timer/backoff.
  let authRecoveryTimer: number | null = null;
  let authRecoveryDelay = BASE_RECONNECT_DELAY;
  let authRecoveryPending = false;

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
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
      connect();
    }, reconnectDelay);
  };

  // 跳转到登录页（已在登录页则跳过，防止无限刷新循环）
  // Redirect to the login page (skipped when already there to avoid a reload loop).
  const redirectToLogin = () => {
    if (window.location.pathname === '/login' || window.location.hash.includes('/login')) {
      return;
    }

    // 短暂延迟以便展示 UI 反馈；用 hash 导航留在 SPA 内（HashRouter），
    // 避免整页刷新落到空 hash 造成白屏
    // Short delay to surface any UI feedback; hash navigation stays within the SPA
    // (HashRouter) instead of a full reload that would land on an empty hash.
    setTimeout(() => {
      window.location.hash = '/login';
    }, 1000);
  };

  // 认证失效后的恢复：续期成功才重连；refresh 也失效才跳登录页；
  // 无法判定时只重试续期，绝不拿着同一个失效 Cookie 重拨
  // Recover from an auth failure. The backend has already said this session is
  // not authenticated, so the socket must stay down until a refresh actually
  // succeeds — re-dialling with the same dead cookie only earns the same close.
  // Only the *refresh* is retried, and only when the failure was inconclusive.
  const attemptAuthRecovery = (): Promise<void> => {
    authRecoveryPending = true;
    return refreshSessionOutcome().then((outcome) => {
      authRecoveryPending = false;

      if (outcome === 'refreshed') {
        // 新 Cookie 已就位，按退避重连即可携带；不要重置 reconnectDelay，
        // 否则「续期成功但服务端仍拒绝」会变成新的无节制循环
        // Fresh cookie is in place — the reconnect carries it. Go through the
        // backoff rather than dialling straight away, and leave reconnectDelay
        // alone: a backend that keeps refusing even a freshly minted session would
        // otherwise loop refresh -> dial -> close -> refresh unthrottled. The delay
        // is credited back on `close` once a connection has actually held.
        authRecoveryDelay = BASE_RECONNECT_DELAY;
        shouldReconnect = true;
        scheduleReconnect();
        return;
      }

      if (outcome === 'expired') {
        // refresh 凭证本身失效，只能重新登录
        // The refresh credential itself is dead — only a fresh login helps.
        redirectToLogin();
        return;
      }

      // 离线 / 429 / 5xx：无法判定会话是否真的失效，按退避重试续期，
      // 不要因为一次瞬时故障就把用户踢到登录页
      // Offline / 429 / 5xx says nothing about the session, so retry the refresh
      // on a backoff rather than signing the user out over a transient failure.
      authRecoveryTimer = window.setTimeout(() => {
        authRecoveryTimer = null;
        void attemptAuthRecovery();
      }, authRecoveryDelay);
      authRecoveryDelay = Math.min(authRecoveryDelay * 2, MAX_RECONNECT_DELAY);
    });
  };

  const recoverFromAuthFailure = () => {
    // 续期期间暂停自动重连，避免拿着失效 Cookie 空转（#4124 的重连风暴）
    // Pause auto-reconnect while refreshing so the dead cookie can't loop
    // (the #4124 reconnect storm).
    shouldReconnect = false;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    socket?.close();

    // 一次只跑一轮恢复：帧可能重复到达
    // One recovery at a time — the terminal frame can arrive more than once.
    if (authRecoveryPending || authRecoveryTimer !== null) {
      return;
    }
    void attemptAuthRecovery();
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

    // Capture the socket created in this call so the close handler only
    // nulls the outer reference when it still points at THIS socket.
    // Without this guard, a late-firing close event from the OLD socket
    // could wipe the reference to a NEWLY created replacement socket.
    const currentSocket = socket;

    currentSocket.addEventListener('open', () => {
      connectedAt = Date.now();
      flushQueue();
    });

    currentSocket.addEventListener('message', (event: MessageEvent) => {
      if (!emitterRef) {
        return;
      }

      try {
        const payload = JSON.parse(event.data as string) as unknown;

        if (!isBrowserWebSocketPayload(payload)) {
          return;
        }

        // 处理服务端心跳 ping，立即回复 pong 以保持连接
        // Handle server heartbeat ping - respond with pong immediately to keep connection alive
        if (payload.name === 'ping') {
          if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ name: 'pong', data: { timestamp: Date.now() } }));
          }
          return;
        }

        // 处理认证过期 - 先静默续期，成功则重连，失败才跳转登录页
        // Handle auth expiration - try a silent refresh first; reconnect on success,
        // and only fall back to the login page when the refresh token is also dead.
        if (isRealtimeAuthTerminalError(payload)) {
          console.warn('[WebSocket] Authentication expired, attempting silent refresh');
          recoverFromAuthFailure();
          return;
        }

        if (isUnrecoverableRealtimeError(payload)) {
          console.warn('[WebSocket] Unrecoverable realtime error, reconnecting');
          emitterRef.emit(payload.name, payload.data);
          currentSocket.close();
          return;
        }

        emitterRef.emit(payload.name, payload.data);
      } catch (error) {
        // 忽略格式错误的消息 / Ignore malformed payloads
      }
    });

    currentSocket.addEventListener('close', () => {
      // Only null the outer reference if it still points at this socket.
      if (socket === currentSocket) {
        socket = null;
      }

      // Only credit the backoff if the connection actually held for a while.
      // Otherwise an accept-then-immediately-drop server keeps the delay at its
      // minimum and the client hammers it forever.
      if (connectedAt !== 0 && Date.now() - connectedAt >= STABLE_CONNECTION_MS) {
        reconnectDelay = BASE_RECONNECT_DELAY;
      }
      connectedAt = 0;

      scheduleReconnect();
    });

    currentSocket.addEventListener('error', () => {
      currentSocket.close();
    });
  };

  // 4.确保在发送/订阅前已经发起连接
  const ensureSocket = () => {
    // 认证已终止时不得重连，否则 emit 会绕过上面的“停止重连”逻辑
    // A terminal auth error deliberately stops reconnection; emit() must not restart it.
    if (!shouldReconnect) {
      return;
    }

    // 已有退避重连在排队时不要立即重拨，否则退避形同虚设
    // A backoff reconnect is already queued — let it run. Dialling here instead
    // would tie the reconnect rate to how often the app emits bridge events
    // rather than to the backoff, turning a failing connection into a storm.
    if (reconnectTimer !== null) {
      return;
    }

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

      ensureSocket();
    },
  });

  connect();

  // Expose reconnection control for login flow
  win.__websocketReconnect = () => {
    // 登录成功后清除上一个会话留下的续期闩锁与重试队列，
    // 否则新 Cookie 也会被判定为失效
    // A new session invalidates the previous one's expiry latch and any queued
    // refresh retry; without this the fresh cookie would still be treated as
    // unrefreshable.
    resetSessionRefresh();
    if (authRecoveryTimer !== null) {
      window.clearTimeout(authRecoveryTimer);
      authRecoveryTimer = null;
    }
    authRecoveryDelay = BASE_RECONNECT_DELAY;
    shouldReconnect = true;
    reconnectDelay = BASE_RECONNECT_DELAY;
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connect();
  };
}
