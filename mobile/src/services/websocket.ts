/**
 * WebSocket connection manager for AionUi Mobile.
 * Mirrors the protocol from src/adapter/browser.ts:
 * - JSON messages: { name: string, data: unknown }
 * - Heartbeat: ping/pong
 * - Exponential backoff reconnection
 * - Token via Sec-WebSocket-Protocol header
 */

import { decodeJwtPayload } from '../utils/jwt';

type WSMessage = { name: string; data: unknown };
type MessageHandler = (name: string, data: unknown) => void;

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'auth_failed';

export type ConnectionStateListener = (state: ConnectionState) => void;

export class WebSocketService {
  private socket: WebSocket | null = null;
  private messageHandler: MessageHandler | null = null;
  private stateListeners = new Set<ConnectionStateListener>();
  private messageQueue: WSMessage[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 500;
  private shouldReconnect = true;
  private _state: ConnectionState = 'disconnected';
  private host = '';
  private port = '';
  private token = '';
  private lastPingReceived = 0;
  private deadConnectionTimer: ReturnType<typeof setInterval> | null = null;
  private authChallengeHandler: (() => Promise<boolean>) | null = null;
  private isHandlingAuthChallenge = false;
  private heartbeatHandler: (() => void) | null = null;

  get state(): ConnectionState {
    return this._state;
  }

  private setState(state: ConnectionState) {
    this._state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }

  onStateChange(listener: ConnectionStateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(handler: MessageHandler) {
    this.messageHandler = handler;
  }

  configure(host: string, port: string, token: string) {
    this.host = host;
    this.port = port;
    this.token = token;
  }

  setAuthChallengeHandler(handler: (() => Promise<boolean>) | null) {
    this.authChallengeHandler = handler;
  }

  setHeartbeatHandler(handler: (() => void) | null) {
    this.heartbeatHandler = handler;
  }

  updateToken(token: string) {
    this.token = token;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // If token is already expired, go through auth challenge instead of attempting connection
    if (this.isTokenExpired()) {
      console.warn('[WS] Token expired before connect, triggering auth challenge');
      void this.handleAuthChallenge();
      return;
    }

    this.shouldReconnect = true;
    this.setState('connecting');

    const url = `ws://${this.host}:${this.port}`;

    try {
      // Pass token via Sec-WebSocket-Protocol header (server supports this)
      this.socket = new WebSocket(url, [this.token]);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.reconnectDelay = 500;
      this.lastPingReceived = Date.now();
      this.startDeadConnectionCheck();
      this.setState('connected');
      this.flushQueue();
    };

    this.socket.onmessage = (event: WebSocketMessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as WSMessage;

        // Handle server heartbeat
        if (payload.name === 'ping') {
          this.lastPingReceived = Date.now();
          this.send('pong', { timestamp: Date.now() });
          this.heartbeatHandler?.();
          return;
        }

        // Handle auth expiration
        if (payload.name === 'auth-expired') {
          console.warn('[WS] Authentication expired');
          void this.handleAuthChallenge();
          return;
        }

        this.messageHandler?.(payload.name, payload.data);
      } catch {
        // Ignore malformed messages
      }
    };

    this.socket.onclose = (event: WebSocketCloseEvent) => {
      this.socket = null;
      this.stopDeadConnectionCheck();

      // Close code 1008 = policy violation (token invalid)
      if (event.code === 1008) {
        console.warn('[WS] Connection rejected (policy violation)');
        void this.handleAuthChallenge();
        return;
      }

      if (this.shouldReconnect) {
        this.setState('disconnected');
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  disconnect() {
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.stopDeadConnectionCheck();
    this.messageQueue = [];
    this.socket?.close();
    this.socket = null;
    this.setState('disconnected');
  }

  send(name: string, data: unknown) {
    const message: WSMessage = { name, data };

    if (this.socket?.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(message));
        return;
      } catch {
        // Queue on send failure
      }
    }

    this.messageQueue.push(message);

    if (!this.socket || this.socket.readyState === WebSocket.CLOSED) {
      this.connect();
    }
  }

  reconnect() {
    this.disconnect();
    this.shouldReconnect = true;
    this.reconnectDelay = 500;
    this.connect();
  }

  private async handleAuthChallenge() {
    if (this.isHandlingAuthChallenge) return;
    this.isHandlingAuthChallenge = true;

    try {
      if (this.authChallengeHandler) {
        const recovered = await this.authChallengeHandler();
        if (recovered) return;
      }
    } catch {
      // Auth challenge handler failed
    } finally {
      this.isHandlingAuthChallenge = false;
    }

    // Recovery failed — set auth_failed
    this.shouldReconnect = false;
    this.clearReconnectTimer();
    this.socket?.close();
    this.setState('auth_failed');
  }

  private flushQueue() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift();
      if (msg) {
        this.socket.send(JSON.stringify(msg));
      }
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer !== null || !this.shouldReconnect) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
      this.connect();
    }, this.reconnectDelay);
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startDeadConnectionCheck() {
    this.stopDeadConnectionCheck();
    this.deadConnectionTimer = setInterval(() => {
      if (this.lastPingReceived > 0 && Date.now() - this.lastPingReceived > 50000) {
        console.warn('[WS] Dead connection detected (no ping for 50s), reconnecting');
        this.socket?.close();
      }
    }, 15000);
  }

  private stopDeadConnectionCheck() {
    if (this.deadConnectionTimer !== null) {
      clearInterval(this.deadConnectionTimer);
      this.deadConnectionTimer = null;
    }
  }

  private isTokenExpired(): boolean {
    if (!this.token) return false;
    const payload = decodeJwtPayload(this.token);
    if (!payload?.exp) return false;
    return payload.exp * 1000 < Date.now();
  }
}

// Singleton instance
export const wsService = new WebSocketService();
