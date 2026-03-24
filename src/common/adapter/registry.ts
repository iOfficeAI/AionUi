/**
 * Shared WebSocket broadcaster registry and bridge emitter reference.
 * No Electron imports — safe to use in both Electron main process and standalone mode.
 */

type WebSocketBroadcastFn = (name: string, data: unknown) => void;

const webSocketBroadcasters: WebSocketBroadcastFn[] = [];

let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

/**
 * Register a WebSocket broadcast function.
 * Returns an unregister function.
 */
export function registerWebSocketBroadcaster(fn: WebSocketBroadcastFn): () => void {
  webSocketBroadcasters.push(fn);
  return () => {
    const idx = webSocketBroadcasters.indexOf(fn);
    if (idx > -1) webSocketBroadcasters.splice(idx, 1);
  };
}

/**
 * Broadcast a message to all registered WebSocket clients.
 */
export function broadcastToAll(name: string, data: unknown): void {
  for (const broadcast of webSocketBroadcasters) {
    try {
      broadcast(name, data);
    } catch (error) {
      console.error('[registry] WebSocket broadcast error:', error);
    }
  }
}

export function getBridgeEmitter(): typeof bridgeEmitter {
  return bridgeEmitter;
}

/**
 * Set the bridge emitter reference (called by adapter implementations).
 */
export function setBridgeEmitter(emitter: typeof bridgeEmitter): void {
  bridgeEmitter = emitter;
}
