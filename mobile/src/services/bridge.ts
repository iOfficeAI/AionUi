/**
 * Bridge service: request-response abstraction over WebSocket.
 * Mirrors the @office-ai/platform bridge pattern:
 * - emit(name, data) to send
 * - listen for responses via message name matching
 *
 * The AionUi WebSocket protocol uses same-name event routing:
 * Client sends { name, data } → server processes → responds with { name, result }.
 */

import { wsService } from './websocket';

type BridgeCallback = (data: unknown) => void;

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
   * The server responds with the same event name.
   */
  request<T = unknown>(name: string, data?: unknown, timeoutMs = 30000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        unsub();
        reject(new Error(`Bridge request '${name}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsub = this.on(name, (responseData) => {
        clearTimeout(timer);
        unsub();
        resolve(responseData as T);
      });

      wsService.send(name, data);
    });
  }

  /**
   * Send a fire-and-forget message (emitter pattern).
   */
  emit(name: string, data?: unknown) {
    wsService.send(name, data);
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
