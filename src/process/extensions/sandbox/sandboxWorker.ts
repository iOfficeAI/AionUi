/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Extension Worker Script — runs inside a Worker Thread.
 *
 * This script:
 * 1. Receives extension config via workerData
 * 2. Exposes a restricted `aion` API proxy to the extension
 * 3. Loads and executes the extension entry point via native require
 * 4. Proxies communication via structured messages
 *
 * Current isolation model:
 * - Extension code runs with full Worker Thread privileges (Node.js built-ins accessible)
 * - Electron main-process APIs are not directly accessible (different process/thread)
 * - The `aion` proxy provides a structured communication channel to the main thread
 * - Declared permissions in the manifest are NOT enforced at runtime — they are
 *   informational only and used for UI display purposes
 *
 * TODO: Enforce declared permissions at runtime (e.g. via vm.runInNewContext +
 * custom require proxy, or Node.js --experimental-permission flag) to prevent
 * extensions from accessing undeclared Node.js APIs.
 */

import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import type { SandboxMessage } from './sandbox';

if (!parentPort) {
  throw new Error('This script must be run as a Worker Thread');
}

const port = parentPort;
const config = workerData as {
  extensionName: string;
  extensionDir: string;
  entryPoint: string;
  permissions: Record<string, unknown>;
};

// ============ Restricted Console ============

const sandboxConsole = {
  log: (...args: unknown[]) => {
    port.postMessage({ type: 'log', level: 'log', args: args.map(String) } satisfies SandboxMessage);
  },
  warn: (...args: unknown[]) => {
    port.postMessage({ type: 'log', level: 'warn', args: args.map(String) } satisfies SandboxMessage);
  },
  error: (...args: unknown[]) => {
    port.postMessage({ type: 'log', level: 'error', args: args.map(String) } satisfies SandboxMessage);
  },
  info: (...args: unknown[]) => {
    port.postMessage({ type: 'log', level: 'log', args: args.map(String) } satisfies SandboxMessage);
  },
};

// ============ Extension API Proxy ============

/**
 * The `aion` object available to sandboxed extensions.
 * All method calls are proxied to the main thread.
 */
const aionProxy = {
  extensionName: config.extensionName,
  extensionDir: config.extensionDir,

  /** Send a message to the main thread (UI layer) */
  postToUI: (message: unknown) => {
    port.postMessage({ type: 'event', name: 'ui-message', payload: message } satisfies SandboxMessage);
  },

  /** Emit an event on the extension event bus */
  emitEvent: (eventName: string, payload?: unknown) => {
    port.postMessage({ type: 'event', name: `ext:${eventName}`, payload } satisfies SandboxMessage);
  },

  /** Storage API (if permission granted) */
  storage: {
    get: async (key: string): Promise<unknown> => callMainThread('storage.get', [key]),
    set: async (key: string, value: unknown): Promise<void> => {
      await callMainThread('storage.set', [key, value]);
    },
    delete: async (key: string): Promise<void> => {
      await callMainThread('storage.delete', [key]);
    },
  },
};

let callIdCounter = 0;
const pendingMainCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function callMainThread(method: string, args: unknown[]): Promise<unknown> {
  const id = `w-${++callIdCounter}`;
  return new Promise((resolve, reject) => {
    pendingMainCalls.set(id, { resolve, reject });
    port.postMessage({ type: 'api-call', id, method, args } satisfies SandboxMessage);
  });
}

// ============ Message Handler ============

const eventHandlers = new Map<string, Set<(payload: unknown) => void>>();

port.on('message', (msg: SandboxMessage) => {
  switch (msg.type) {
    case 'api-call': {
      // Main thread calling a method on the extension
      handleApiCall(msg.id, msg.method, msg.args);
      break;
    }
    case 'api-response': {
      // Response to our call to main thread
      const pending = pendingMainCalls.get(msg.id);
      if (pending) {
        pendingMainCalls.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve(msg.result);
        }
      }
      break;
    }
    case 'event': {
      // Event from main thread
      const handlers = eventHandlers.get(msg.name);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(msg.payload);
          } catch (error) {
            sandboxConsole.error(`Event handler error for "${msg.name}":`, error);
          }
        }
      }
      break;
    }
    case 'shutdown': {
      cleanup();
      process.exit(0);
      break;
    }
  }
});

// ============ Extension Method Registry ============

const extensionMethods = new Map<string, (...args: unknown[]) => unknown>();

function handleApiCall(id: string, method: string, args: unknown[]): void {
  const fn = extensionMethods.get(method);
  if (!fn) {
    port.postMessage({
      type: 'api-response',
      id,
      error: `Method "${method}" not found in extension`,
    } satisfies SandboxMessage);
    return;
  }

  try {
    const result = fn(...args);
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      (result as Promise<unknown>)
        .then((r) => {
          port.postMessage({ type: 'api-response', id, result: r } satisfies SandboxMessage);
        })
        .catch((e) => {
          port.postMessage({ type: 'api-response', id, error: String(e) } satisfies SandboxMessage);
        });
    } else {
      port.postMessage({ type: 'api-response', id, result } satisfies SandboxMessage);
    }
  } catch (error) {
    port.postMessage({ type: 'api-response', id, error: String(error) } satisfies SandboxMessage);
  }
}

// ============ Load Extension ============

let extensionModule: unknown = null;
let cleanupFn: (() => void) | null = null;

function cleanup(): void {
  if (cleanupFn) {
    try {
      cleanupFn();
    } catch (error) {
      sandboxConsole.error('Cleanup error:', error);
    }
  }
}

try {
  const entryPath = path.resolve(config.extensionDir, config.entryPoint);

  // Override console in the worker
  (globalThis as any).console = sandboxConsole;
  // Expose aion proxy
  (globalThis as any).aion = aionProxy;

  // eslint-disable-next-line no-eval
  const nativeRequire = eval('require');
  extensionModule = nativeRequire(entryPath);

  const mod = extensionModule as Record<string, unknown>;

  // Register exported functions as callable methods
  if (mod && typeof mod === 'object') {
    for (const [key, value] of Object.entries(mod)) {
      if (typeof value === 'function') {
        extensionMethods.set(key, value as (...args: unknown[]) => unknown);
      }
    }
  }

  // Check for cleanup/dispose function
  if (typeof mod?.cleanup === 'function') {
    cleanupFn = mod.cleanup as () => void;
  } else if (typeof mod?.dispose === 'function') {
    cleanupFn = mod.dispose as () => void;
  }

  // Signal ready
  port.postMessage({ type: 'ready' } satisfies SandboxMessage);
} catch (error) {
  sandboxConsole.error('Failed to load extension:', error);
  port.postMessage({ type: 'log', level: 'error', args: [`Failed to load: ${error}`] } satisfies SandboxMessage);
  process.exit(1);
}
