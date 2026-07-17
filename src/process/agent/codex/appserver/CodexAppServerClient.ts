/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import { getConfiguredAppClientName, getConfiguredAppClientVersion } from '@/common/utils/appConfig';
import { CodexJsonlTransport } from './CodexJsonlTransport';
import type {
  CodexAppServerClientOptions,
  CodexJsonRpcFailure,
  CodexJsonRpcId,
  CodexJsonRpcMessage,
  CodexJsonRpcNotification,
  CodexJsonRpcRequest,
  CodexJsonRpcSuccess,
  CodexServerRequestHandler,
} from './types';

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

const CODEX_CLI_ORIGINATOR = 'codex_cli_rs';

export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private transport: CodexJsonlTransport | null = null;
  private startPromise: Promise<void> | null = null;
  private nextId = 1;
  private readonly pending = new Map<CodexJsonRpcId, PendingRequest>();
  private readonly emitter = new EventEmitter();
  private readonly stderrTail: string[] = [];
  private serverRequestHandler: CodexServerRequestHandler | null = null;

  constructor(private readonly options: CodexAppServerClientOptions) {}

  get pid(): number | undefined {
    return this.child?.pid;
  }

  getStderrTail(): string[] {
    return [...this.stderrTail];
  }

  onNotification(handler: (message: CodexJsonRpcNotification) => void): () => void {
    this.emitter.on('notification', handler);
    return () => this.emitter.off('notification', handler);
  }

  onFailure(handler: (error: Error) => void): () => void {
    this.emitter.on('failure', handler);
    return () => this.emitter.off('failure', handler);
  }

  onServerRequest(handler: CodexServerRequestHandler): void {
    this.serverRequestHandler = handler;
  }

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }
    if (this.child && this.transport) return;

    this.startPromise = this.startProcess();
    try {
      await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  private async startProcess(): Promise<void> {
    const child = spawn(this.options.command, this.options.args, {
      cwd: this.options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.on('data', (chunk) => this.pushStderr(String(chunk)));
    child.on('error', (error) => this.handleChildFailure(child, error));
    child.on('exit', (code, signal) => {
      this.handleChildFailure(child, createCodexExitError(code, signal, this.options.command));
    });
    this.transport = new CodexJsonlTransport({ stdout: child.stdout, stdin: child.stdin });
    this.transport.onMessage((message) => void this.handleMessage(message));
    this.transport.onError((error) => this.handleTransportFailure(error));
    try {
      await this.request('initialize', this.getInitializeParams());
      this.transport.write({ jsonrpc: '2.0', method: 'initialized', params: {} });
    } catch (error) {
      if (this.child === child && !child.killed) {
        child.kill();
      }
      this.clearProcess(child);
      throw error;
    }
  }

  private getInitializeParams(): Record<string, unknown> {
    return {
      clientInfo: {
        name: CODEX_CLI_ORIGINATOR,
        title: getConfiguredAppClientName(),
        version: getConfiguredAppClientVersion(),
      },
      ...this.options.initializeParams,
    };
  }

  request<TResult = unknown>(method: string, params?: unknown): Promise<TResult> {
    if (!this.transport) {
      return Promise.reject(new Error('Codex app-server client has not started'));
    }
    const id = this.nextId++;
    const request: CodexJsonRpcRequest = { jsonrpc: '2.0', id, method, params };
    return new Promise<TResult>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.transport?.write(request);
    });
  }

  async dispose(): Promise<void> {
    this.transport?.dispose();
    this.transport = null;
    this.rejectAll(new Error('Codex app-server client disposed'));
    if (this.child && !this.child.killed) {
      this.child.kill();
    }
    this.child = null;
    this.emitter.removeAllListeners();
  }

  private async handleMessage(message: CodexJsonRpcMessage): Promise<void> {
    if ('id' in message && ('result' in message || 'error' in message)) {
      this.handleResponse(message as CodexJsonRpcSuccess | CodexJsonRpcFailure);
      return;
    }

    if ('id' in message && 'method' in message) {
      await this.handleServerRequest(message as CodexJsonRpcRequest);
      return;
    }

    if ('method' in message) {
      this.emitter.emit('notification', message as CodexJsonRpcNotification);
    }
  }

  private handleResponse(response: CodexJsonRpcSuccess | CodexJsonRpcFailure): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if ('error' in response) {
      pending.reject(new Error(response.error.message));
      return;
    }
    pending.resolve(response.result);
  }

  private async handleServerRequest(request: CodexJsonRpcRequest): Promise<void> {
    try {
      if (!this.serverRequestHandler) {
        this.transport?.write({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Unsupported server request: ${request.method}`,
          },
        });
        return;
      }

      const result = await this.serverRequestHandler(request);
      this.transport?.write({ jsonrpc: '2.0', id: request.id, result });
    } catch (error) {
      this.transport?.write({
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  private pushStderr(chunk: string): void {
    this.stderrTail.push(...chunk.split(/\r?\n/).filter(Boolean));
    while (this.stderrTail.length > 20) {
      this.stderrTail.shift();
    }
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }

  private handleTransportFailure(error: Error): void {
    const child = this.child;
    this.rejectAll(error);
    this.emitter.emit('failure', error);
    if (child && !child.killed) {
      child.kill();
    }
    if (child) {
      this.clearProcess(child);
    } else {
      this.transport?.dispose();
      this.transport = null;
    }
  }

  private handleChildFailure(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    this.rejectAll(error);
    this.emitter.emit('failure', error);
    this.clearProcess(child);
  }

  private clearProcess(child: ChildProcessWithoutNullStreams): void {
    if (this.child !== child) return;
    this.transport?.dispose();
    this.transport = null;
    this.child = null;
  }
}

function createCodexExitError(code: number | null, signal: NodeJS.Signals | null, command: string): Error {
  const base = `Codex app-server exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`;
  if (signal !== 'SIGKILL' || process.platform !== 'darwin') {
    return new Error(base);
  }

  return new Error(
    `${base}. macOS blocked or killed the Codex CLI binary. Update/reinstall @openai/codex and make sure AionUi resolves a current Codex executable. Command: ${command}`
  );
}
