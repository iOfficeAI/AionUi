/**
 * Standalone bridge adapter — uses Node.js EventEmitter instead of ipcMain.
 * Import this module ONLY in the standalone entry point (src/server.ts).
 * Never import alongside src/common/adapter/main.ts in the same process.
 */
import { EventEmitter } from 'events';
import { bridge } from '@office-ai/platform';
import { broadcastToAll, setBridgeEmitter } from './registry';

const internalEmitter = new EventEmitter();
internalEmitter.setMaxListeners(100);

bridge.adapter({
  emit(name, data) {
    // Broadcast to all connected WebSocket clients
    broadcastToAll(name, data);
  },
  on(bridgeEmitterRef) {
    // Persist reference so webserver/adapter.ts can route incoming WS messages
    setBridgeEmitter(bridgeEmitterRef);
    // Route messages dispatched via dispatchMessage() into the bridge handlers
    internalEmitter.on('message', ({ name, data }: { name: string; data: unknown }) => {
      bridgeEmitterRef.emit(name, data);
    });
  },
});

/**
 * Called by webserver/adapter.ts for each incoming WebSocket message.
 * Routes the message through the internal EventEmitter into the bridge handlers.
 */
export function dispatchMessage(name: string, data: unknown): void {
  internalEmitter.emit('message', { name, data });
}
