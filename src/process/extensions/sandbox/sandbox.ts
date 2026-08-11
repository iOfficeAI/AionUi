/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import { getSandboxPermissionDeniedError, type ExtPermissions } from './permissions';
import { extensionEventBus } from '../lifecycle/ExtensionEventBus';

/**
 * Extension Sandbox — Worker Thread isolation for extension code execution.
 *
 * Inspired by Figma's iframe sandbox model, adapted for Node.js:
 * - Each sandboxed extension runs in a separate Worker Thread
 * - Communication happens via structured message passing (like postMessage)
 * - The worker has a restricted API proxy instead of full Node.js access
 *
 * Architecture:
 * ```
 *   Main Thread (trusted)          Worker Thread (sandboxed)
 *   ┌──────────────────┐          ┌──────────────────────────┐
 *   │ SandboxHost       │◄──────►│ Extension code            │
 *   │  - API proxy      │  msg   │  - Restricted globals     │
 *   │  - Permission     │  port  │  - Proxy API object       │
 *   │    enforcement    │         │  - No direct fs/net/child │
 *   └──────────────────┘          └──────────────────────────┘
 * ```
 */

// ============ Message Protocol ============

export type SandboxMessage =
  | { type: 'api-call'; id: string; method: string; args: unknown[] }
  | { type: 'api-response'; id: string; result?: unknown; error?: string }
  | { type: 'event'; name: string; payload: unknown }
  | { type: 'log'; level: 'log' | 'warn' | 'error'; args: unknown[] }
  | { type: 'ready' }
  | { type: 'shutdown' };

// ============ Sandbox Host (Main Thread) ============

/**
 * Handler for Worker → Host API calls (e.g. storage.get, storage.set).
 * Returns the result or throws on error.
 */
export type SandboxApiHandler = (...args: unknown[]) => Promise<unknown> | unknown;

/**
 * Callback invoked when the worker sends a UI-bound message via aion.postToUI().
 */
export type SandboxUIMessageHandler = (extensionName: string, payload: unknown) => void;

export interface SandboxHostOptions {
  extensionName: string;
  extensionDir: string;
  entryPoint: string;
  permissions: ExtPermissions;
  /** Timeout for worker initialization (ms). Default 10000 */
  initTimeout?: number;
  /** Timeout for individual API calls (ms). Default 30000 */
  callTimeout?: number;
  /**
   * Map of method names to handlers for Worker → Host API calls.
   * Keys match the `method` field in api-call messages (e.g. 'storage.get').
   */
  apiHandlers?: Record<string, SandboxApiHandler>;
  /** Callback for messages sent via aion.postToUI() in the worker. */
  onUIMessage?: SandboxUIMessageHandler;
}

/**
 * SandboxHost manages a Worker Thread for running extension code in isolation.
 *
 * Usage:
 * ```typescript
 * const host = new SandboxHost({
 *   extensionName: 'my-ext',
 *   extensionDir: '/path/to/ext',
 *   entryPoint: 'main.js',
 *   permissions: { storage: true, network: false },
 * });
 * await host.start();
 * const result = await host.call('myMethod', [arg1, arg2]);
 * await host.stop();
 * ```
 */
export class SandboxHost {
  private worker: Worker | null = null;
  private pendingCalls = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private callCounter = 0;
  private readonly options: SandboxHostOptions & { initTimeout: number; callTimeout: number };
  private _running = false;

  constructor(options: SandboxHostOptions) {
    this.options = {
      initTimeout: 10000,
      callTimeout: 30000,
      ...options,
    };
  }

  get running(): boolean {
    return this._running;
  }

  /**
   * Start the sandboxed worker.
   * Resolves when the worker sends the 'ready' message.
   */
  async start(): Promise<void> {
    if (this._running) return;

    const workerScript = path.join(__dirname, 'sandboxWorker.js');

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        void this.stop();
        reject(new Error(`[Sandbox] Worker for "${this.options.extensionName}" timed out during initialization`));
      }, this.options.initTimeout);

      try {
        this.worker = new Worker(workerScript, {
          workerData: {
            extensionName: this.options.extensionName,
            extensionDir: this.options.extensionDir,
            entryPoint: this.options.entryPoint,
            permissions: this.options.permissions,
          },
          // Restrict worker capabilities
          execArgv: [],
        });

        this.worker.on('message', (msg: SandboxMessage) => {
          this.handleMessage(msg);
          if (msg.type === 'ready') {
            clearTimeout(timer);
            this._running = true;
            resolve();
          }
        });

        this.worker.on('error', (error) => {
          clearTimeout(timer);
          console.error(`[Sandbox] Worker error for "${this.options.extensionName}":`, error);
          this._running = false;
          reject(error);
        });

        this.worker.on('exit', (code) => {
          this._running = false;
          if (code !== 0) {
            console.warn(`[Sandbox] Worker for "${this.options.extensionName}" exited with code ${code}`);
          }
          // Reject all pending calls
          for (const [, pending] of this.pendingCalls) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Worker exited'));
          }
          this.pendingCalls.clear();
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Call a method in the sandboxed extension.
   */
  async call(method: string, args: unknown[] = []): Promise<unknown> {
    if (!this.worker || !this._running) {
      throw new Error(`[Sandbox] Worker for "${this.options.extensionName}" is not running`);
    }

    const id = `call-${++this.callCounter}`;

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new Error(`[Sandbox] Call "${method}" timed out for "${this.options.extensionName}"`));
      }, this.options.callTimeout);

      this.pendingCalls.set(id, { resolve, reject, timer });

      this.worker!.postMessage({
        type: 'api-call',
        id,
        method,
        args,
      } satisfies SandboxMessage);
    });
  }

  /**
   * Send an event to the sandboxed extension.
   */
  emit(eventName: string, payload: unknown): void {
    if (!this.worker || !this._running) return;
    this.worker.postMessage({
      type: 'event',
      name: eventName,
      payload,
    } satisfies SandboxMessage);
  }

  /**
   * Gracefully stop the worker.
   */
  async stop(): Promise<void> {
    if (!this.worker) return;

    this.worker.postMessage({ type: 'shutdown' } satisfies SandboxMessage);

    // Give it a moment to clean up, then force terminate
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        void this.worker?.terminate();
        resolve();
      }, 3000);

      this.worker!.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.worker = null;
    this._running = false;
  }

  private handleMessage(msg: SandboxMessage): void {
    switch (msg.type) {
      case 'api-call': {
        // Worker → Host RPC: route to registered apiHandlers
        this.handleWorkerApiCall(msg.id, msg.method, msg.args);
        break;
      }
      case 'api-response': {
        const pending = this.pendingCalls.get(msg.id);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingCalls.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
        break;
      }
      case 'log':
        // Forward worker logs to main process console with prefix
        {
          const prefix = `[Sandbox:${this.options.extensionName}]`;
          const logFn = msg.level === 'error' ? console.error : msg.level === 'warn' ? console.warn : console.log;
          logFn(prefix, ...msg.args);
        }
        break;
      case 'event': {
        const { name, payload } = msg;
        if (name === 'ui-message') {
          // aion.postToUI() — forward to the registered UI message handler
          this.options.onUIMessage?.(this.options.extensionName, payload);
        } else if (name.startsWith('ext:')) {
          // aion.emitEvent() — forward to the extension event bus
          extensionEventBus.emitExtensionEvent(this.options.extensionName, name.slice(4), payload);
        }
        break;
      }
      default:
        break;
    }
  }

  /**
   * Handle an api-call from the Worker and send back an api-response.
   */
  private handleWorkerApiCall(id: string, method: string, args: unknown[]): void {
    const permissionError = getSandboxPermissionDeniedError(method, this.options.permissions);
    if (permissionError) {
      this.worker?.postMessage({
        type: 'api-response',
        id,
        error: permissionError,
      } satisfies SandboxMessage);
      return;
    }

    const handler = this.options.apiHandlers?.[method];
    if (!handler) {
      this.worker?.postMessage({
        type: 'api-response',
        id,
        error: `No handler registered for "${method}"`,
      } satisfies SandboxMessage);
      return;
    }

    try {
      const result = handler(...args);
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        (result as Promise<unknown>)
          .then((r) => {
            this.worker?.postMessage({ type: 'api-response', id, result: r } satisfies SandboxMessage);
          })
          .catch((e) => {
            this.worker?.postMessage({ type: 'api-response', id, error: String(e) } satisfies SandboxMessage);
          });
      } else {
        this.worker?.postMessage({ type: 'api-response', id, result } satisfies SandboxMessage);
      }
    } catch (error) {
      this.worker?.postMessage({ type: 'api-response', id, error: String(error) } satisfies SandboxMessage);
    }
  }
}

// ============ Sandbox Manager ============

const activeSandboxes = new Map<string, SandboxHost>();

/**
 * Get or create a sandbox for an extension.
 */
export function getSandbox(extensionName: string): SandboxHost | undefined {
  return activeSandboxes.get(extensionName);
}

/**
 * Create and start a new sandbox for an extension.
 */
export async function createSandbox(options: SandboxHostOptions): Promise<SandboxHost> {
  // Stop existing sandbox if any
  const existing = activeSandboxes.get(options.extensionName);
  if (existing?.running) {
    await existing.stop();
  }

  const host = new SandboxHost(options);
  await host.start();
  activeSandboxes.set(options.extensionName, host);
  return host;
}

/**
 * Stop and remove a sandbox.
 */
export async function destroySandbox(extensionName: string): Promise<void> {
  const host = activeSandboxes.get(extensionName);
  if (host) {
    await host.stop();
    activeSandboxes.delete(extensionName);
  }
}

/**
 * Stop all active sandboxes (used during shutdown).
 */
export async function destroyAllSandboxes(): Promise<void> {
  const promises = Array.from(activeSandboxes.values()).map((h) => h.stop());
  await Promise.allSettled(promises);
  activeSandboxes.clear();
}
