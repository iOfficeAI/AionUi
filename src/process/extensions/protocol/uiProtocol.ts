/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension UI Communication Protocol — Figma-inspired dual-thread model.
 *
 * Figma separates plugin code into:
 *   - `main` (code.js) — logic thread, accesses Figma API
 *   - `ui` (ui.html) — iframe UI thread, handles rendering
 *   - Communication via `figma.ui.postMessage()` / `figma.ui.onmessage`
 *
 * AionUI adaptation:
 *   - Settings Tab / WebUI extensions render in sandboxed <iframe>
 *   - Main process holds the extension's logic and data
 *   - Structured message protocol for bidirectional communication
 *
 * Protocol:
 * ```
 *   iframe (UI)                    Main Process (Logic)
 *   ┌────────────┐                ┌────────────────────┐
 *   │ postMessage ├───────────────► onUIMessage        │
 *   │            │  ExtUIMessage  │                    │
 *   │ onMessage  ◄───────────────┤ postToUI           │
 *   └────────────┘                └────────────────────┘
 * ```
 */

// ============ Message Types ============

/**
 * Base message structure for extension UI communication.
 * All messages must have a type field for routing.
 */
export interface ExtUIMessage<T = unknown> {
  /** Message type identifier (e.g. 'save-config', 'request-data') */
  type: string;
  /** Message payload */
  data?: T;
  /** Optional request ID for request/response correlation */
  requestId?: string;
  /** Source extension name */
  extensionName?: string;
}

/**
 * Response message from main process to UI.
 */
export interface ExtUIResponse<T = unknown> extends ExtUIMessage<T> {
  /** Whether the operation succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

// ============ Well-Known Message Types ============

/**
 * Standard message types that all extension UIs can use.
 * Extensions can also define custom types.
 */
export const ExtUIMessageTypes = {
  // --- Configuration ---
  /** UI → Main: Request to save extension config */
  SAVE_CONFIG: 'ext:save-config',
  /** UI → Main: Request to load extension config */
  LOAD_CONFIG: 'ext:load-config',
  /** Main → UI: Config loaded response */
  CONFIG_LOADED: 'ext:config-loaded',
  /** Main → UI: Config saved confirmation */
  CONFIG_SAVED: 'ext:config-saved',

  // --- Theme ---
  /** Main → UI: Current theme info */
  THEME_INFO: 'ext:theme-info',
  /** Main → UI: Theme changed notification */
  THEME_CHANGED: 'ext:theme-changed',

  // --- Lifecycle ---
  /** Main → UI: Extension is about to be deactivated, save state */
  WILL_DEACTIVATE: 'ext:will-deactivate',
  /** UI → Main: Acknowledge deactivation, cleanup done */
  DID_CLEANUP: 'ext:did-cleanup',

  // --- Data ---
  /** UI → Main: Generic API call */
  API_CALL: 'ext:api-call',
  /** Main → UI: Generic API response */
  API_RESPONSE: 'ext:api-response',

  // --- UI State ---
  /** UI → Main: UI is ready (loaded and initialized) */
  UI_READY: 'ext:ui-ready',
  /** UI → Main: UI size change request */
  RESIZE: 'ext:resize',
} as const;

// ============ Message Handler Registry ============

export type ExtUIMessageHandler = (message: ExtUIMessage, respond: (response: ExtUIResponse) => void) => void;

/**
 * ExtensionUIBridge — manages communication between extension UI (iframe) and main process.
 *
 * Usage in main process:
 * ```typescript
 * const bridge = new ExtensionUIBridge('my-extension');
 * bridge.onMessage('save-config', (msg, respond) => {
 *   saveConfig(msg.data);
 *   respond({ type: 'config-saved', success: true });
 * });
 * bridge.postToUI({ type: 'theme-info', data: currentTheme });
 * ```
 *
 * Usage in extension UI (iframe):
 * ```javascript
 * // Listen for messages from main process
 * window.addEventListener('message', (event) => {
 *   const msg = event.data;
 *   if (msg.type === 'ext:config-loaded') {
 *     applyConfig(msg.data);
 *   }
 * });
 *
 * // Send message to main process
 * window.parent.postMessage({
 *   type: 'ext:save-config',
 *   data: { key: 'value' },
 *   extensionName: 'my-extension'
 * }, '*');
 * ```
 */
export class ExtensionUIBridge {
  private handlers = new Map<string, ExtUIMessageHandler>();
  private readonly extensionName: string;
  private postToUIFn: ((message: ExtUIResponse) => void) | null = null;

  constructor(extensionName: string) {
    this.extensionName = extensionName;
  }

  /**
   * Register a handler for a specific message type.
   */
  onMessage(type: string, handler: ExtUIMessageHandler): void {
    this.handlers.set(type, handler);
  }

  /**
   * Remove a handler for a specific message type.
   */
  offMessage(type: string): void {
    this.handlers.delete(type);
  }

  /**
   * Set the function used to post messages to the UI (iframe).
   * Called by the hosting component (e.g. ExtensionSettingsTabContent).
   */
  setPostToUI(fn: (message: ExtUIResponse) => void): void {
    this.postToUIFn = fn;
  }

  /**
   * Send a message to the extension UI.
   */
  postToUI(message: ExtUIResponse): void {
    if (this.postToUIFn) {
      this.postToUIFn({
        ...message,
        extensionName: this.extensionName,
      });
    }
  }

  /**
   * Handle an incoming message from the UI.
   * Called by the hosting component when it receives a postMessage from the iframe.
   */
  handleUIMessage(message: ExtUIMessage): void {
    const handler = this.handlers.get(message.type);
    if (handler) {
      handler(message, (response) => this.postToUI(response));
    } else {
      // Check for wildcard handler
      const wildcardHandler = this.handlers.get('*');
      if (wildcardHandler) {
        wildcardHandler(message, (response) => this.postToUI(response));
      }
    }
  }

  /**
   * Dispose of all handlers.
   */
  dispose(): void {
    this.handlers.clear();
    this.postToUIFn = null;
  }
}

// ============ Bridge Registry ============

const uiBridges = new Map<string, ExtensionUIBridge>();

/**
 * Get or create a UI bridge for an extension.
 */
export function getUIBridge(extensionName: string): ExtensionUIBridge {
  let bridge = uiBridges.get(extensionName);
  if (!bridge) {
    bridge = new ExtensionUIBridge(extensionName);
    uiBridges.set(extensionName, bridge);
  }
  return bridge;
}

/**
 * Dispose a UI bridge for an extension.
 */
export function disposeUIBridge(extensionName: string): void {
  const bridge = uiBridges.get(extensionName);
  if (bridge) {
    bridge.dispose();
    uiBridges.delete(extensionName);
  }
}

/**
 * Dispose all UI bridges (used during shutdown).
 */
export function disposeAllUIBridges(): void {
  for (const bridge of uiBridges.values()) {
    bridge.dispose();
  }
  uiBridges.clear();
}
