/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { bridge } from '@office-ai/platform';
import { emitToWebSocketBroadcasters, setBridgeEmitter } from './bridgeHub';

/**
 * Headless adapter for Bun standalone services.
 *
 * - emits bridge events to WebSocket broadcasters
 * - captures emitter for WebSocket -> provider forwarding
 */
bridge.adapter({
  emit(name, data) {
    emitToWebSocketBroadcasters(name, data);
  },
  on(emitter) {
    setBridgeEmitter(emitter);
  },
});
