/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type BridgeEmitterLike = {
  emit: (name: string, data: unknown) => unknown;
};

type WebSocketBroadcastFn = (name: string, data: unknown) => void;

const webSocketBroadcasters: WebSocketBroadcastFn[] = [];
let bridgeEmitter: BridgeEmitterLike | null = null;

export function registerWebSocketBroadcaster(broadcastFn: WebSocketBroadcastFn): () => void {
  webSocketBroadcasters.push(broadcastFn);
  return () => {
    const index = webSocketBroadcasters.indexOf(broadcastFn);
    if (index > -1) {
      webSocketBroadcasters.splice(index, 1);
    }
  };
}

export function emitToWebSocketBroadcasters(name: string, data: unknown): void {
  for (const broadcast of webSocketBroadcasters) {
    try {
      broadcast(name, data);
    } catch (error) {
      console.error('[BridgeHub] WebSocket broadcast error:', error);
    }
  }
}

export function setBridgeEmitter(emitter: BridgeEmitterLike | null): void {
  bridgeEmitter = emitter;
}

export function getBridgeEmitter(): BridgeEmitterLike | null {
  return bridgeEmitter;
}
