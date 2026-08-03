/**
 * Shared WebSocket broadcaster registry and bridge emitter reference.
 * No Electron imports — safe to use in both Electron main process and WebUI mode.
 */

type WebSocketBroadcastFn = (name: string, data: unknown) => void;

export type BridgeWindowTarget = {
  isDestroyed: () => boolean;
  webContents: {
    isDestroyed: () => boolean;
    send: (channel: string, payload: string) => void;
  };
};

const webSocketBroadcasters: WebSocketBroadcastFn[] = [];

let bridgeEmitter: { emit: (name: string, data: unknown) => unknown } | null = null;

/** Detect a pathological string before JSON serialization allocates another full copy. */
export function containsOversizedBridgeString(
  value: unknown,
  maxLength: number,
  seen: WeakSet<object> = new WeakSet()
): boolean {
  if (typeof value === 'string') return value.length > maxLength;
  if (typeof value !== 'object' || value === null) return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) {
    return value.some((item) => containsOversizedBridgeString(item, maxLength, seen));
  }
  return Object.values(value as Record<string, unknown>).some((item) =>
    containsOversizedBridgeString(item, maxLength, seen)
  );
}

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

/**
 * Send an already-serialized bridge event without allowing a BrowserWindow
 * teardown race to escape into the producer's event loop.
 */
export function sendToBridgeWindows(
  windows: BridgeWindowTarget[],
  channel: string,
  payload: string,
  onError: (error: unknown) => void
): void {
  for (let i = windows.length - 1; i >= 0; i--) {
    const win = windows[i];
    if (win.isDestroyed() || win.webContents.isDestroyed()) {
      windows.splice(i, 1);
      continue;
    }

    try {
      win.webContents.send(channel, payload);
    } catch (error) {
      // isDestroyed() and send() are not atomic. A renderer can disappear
      // between them; quarantine a target that became invalid and keep the
      // agent stream alive for every other consumer.
      if (win.isDestroyed() || win.webContents.isDestroyed()) {
        windows.splice(i, 1);
      }
      onError(error);
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
