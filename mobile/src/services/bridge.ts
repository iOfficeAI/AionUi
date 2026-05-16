/**
 * Bridge service: request-response abstraction over WebSocket.
 * Uses the @office-ai/platform subscribe protocol:
 * - Client sends: { name: 'subscribe-{key}', data: { id, data } }
 * - Server responds: { name: 'subscribe.callback-{key}{id}', data: result }
 * - Emitter events (server-push) use direct names (no subscribe prefix).
 */

import { wsService } from './websocket';

type BridgeCallback = (data: unknown) => void;

let requestCounter = 0;

function generateRequestId(): string {
  return `m_${Date.now()}_${(++requestCounter).toString(36)}`;
}

class BridgeService {
  private listeners = new Map<string, Set<BridgeCallback>>();

  constructor() {
    // Route all WebSocket messages through the bridge
    wsService.onMessage((name, data) => {
      // Broadcast to event listeners (including pending request handlers)
      const callbacks = this.listeners.get(name);
      if (callbacks) {
        callbacks.forEach((cb) => cb(data));
      }
    });
  }

  /**
   * Send a request and wait for a response (provider pattern).
   * Uses subscribe protocol: subscribe-{name} → subscribe.callback-{name}{id}
   */
  request<T = unknown>(name: string, data?: unknown, timeoutMs = 30000): Promise<T> {
    const id = generateRequestId();
    const callbackName = `subscribe.callback-${name}${id}`;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Bridge request '${name}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.on(callbackName, (responseData) => {
        clearTimeout(timer);
        unsub();
        resolve(responseData as T);
      });

      wsService.send(`subscribe-${name}`, { id, data });
    });
  }

  /**
   * Send a fire-and-forget message (emitter pattern).
   * Uses subscribe protocol without listening for callback.
   */
  emit(name: string, data?: unknown) {
    const id = generateRequestId();
    wsService.send(`subscribe-${name}`, { id, data });
  }

  /**
   * Subscribe to server-push events.
   * Returns unsubscribe function.
   */
  on(name: string, callback: BridgeCallback): () => void {
    if (!this.listeners.has(name)) {
      this.listeners.set(name, new Set());
    }
    this.listeners.get(name)!.add(callback);

    return () => {
      const set = this.listeners.get(name);
      if (set) {
        set.delete(callback);
        if (set.size === 0) this.listeners.delete(name);
      }
    };
  }

  /**
   * Convenience: subscribe to an event, auto-cleanup on unmount.
   */
  once(name: string, callback: BridgeCallback): () => void {
    const unsub = this.on(name, (data) => {
      unsub();
      callback(data);
    });
    return unsub;
  }
}

export const bridge = new BridgeService();
