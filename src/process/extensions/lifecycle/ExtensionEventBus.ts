/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';

/**
 * Built-in extension system events.
 * Extensions and internal modules can listen for these.
 */
export const ExtensionSystemEvents = {
  /** Fired after an extension is activated (lifecycle hook completed) */
  EXTENSION_ACTIVATED: 'extension.activated',
  /** Fired after an extension is deactivated */
  EXTENSION_DEACTIVATED: 'extension.deactivated',
  /** Fired after an extension is installed (first-time activation) */
  EXTENSION_INSTALLED: 'extension.installed',
  /** Fired after an extension is uninstalled */
  EXTENSION_UNINSTALLED: 'extension.uninstalled',
  /** Fired when the extension registry completes a hot-reload */
  REGISTRY_RELOADED: 'registry.reloaded',
  /** Fired when extension states are persisted to disk */
  STATES_PERSISTED: 'states.persisted',
} as const;

export type ExtensionSystemEvent = (typeof ExtensionSystemEvents)[keyof typeof ExtensionSystemEvents];

/**
 * Payload for extension lifecycle events.
 */
export interface ExtensionLifecyclePayload {
  extensionName: string;
  version: string;
  timestamp: number;
}

/**
 * ExtensionEventBus — Global event bus for extension inter-communication.
 *
 * Inspired by NocoBase's event system, this provides:
 * - System lifecycle events (activation, deactivation, reload)
 * - Namespaced custom events for extension-to-extension communication
 *
 * Usage:
 * ```typescript
 * // Extension A publishes
 * extensionEventBus.emit('my-extension:data-ready', { items: [...] });
 *
 * // Extension B subscribes
 * extensionEventBus.on('my-extension:data-ready', (payload) => { ... });
 *
 * // System events
 * extensionEventBus.on('extension.activated', (payload) => { ... });
 * ```
 */
class ExtensionEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(200);
  }

  /**
   * Emit a namespaced extension event.
   * Convention: `{extensionName}:{eventName}` for custom events.
   */
  emitExtensionEvent(extensionName: string, eventName: string, payload?: unknown): void {
    const fullEvent = `${extensionName}:${eventName}`;
    this.emit(fullEvent, payload);
  }

  /**
   * Listen for a namespaced extension event.
   * Returns an unsubscribe function.
   */
  onExtensionEvent(extensionName: string, eventName: string, handler: (payload: unknown) => void): () => void {
    const fullEvent = `${extensionName}:${eventName}`;
    this.on(fullEvent, handler);
    return () => {
      this.off(fullEvent, handler);
    };
  }

  /**
   * Emit a system lifecycle event.
   */
  emitLifecycle(event: ExtensionSystemEvent, payload: ExtensionLifecyclePayload): void {
    this.emit(event, payload);
  }

  /**
   * Listen for a system lifecycle event. Returns an unsubscribe function.
   */
  onLifecycle(event: ExtensionSystemEvent, handler: (payload: ExtensionLifecyclePayload) => void): () => void {
    this.on(event, handler);
    return () => {
      this.off(event, handler);
    };
  }
}

/** Singleton instance */
export const extensionEventBus = new ExtensionEventBus();
