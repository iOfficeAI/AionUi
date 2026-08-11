/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import type { CodexAppServerTransportStreams, CodexJsonRpcMessage, CodexJsonRpcOutgoing } from './types';

type TransportEvents = {
  message: (message: CodexJsonRpcMessage) => void;
  error: (error: Error) => void;
};

export class CodexJsonlTransport {
  private readonly emitter = new EventEmitter();
  private buffer = '';
  private disposed = false;

  constructor(private readonly streams: CodexAppServerTransportStreams) {
    this.streams.stdout.on('data', this.handleStdoutData);
    this.streams.stdout.on('error', this.handleStreamError);
    this.streams.stdin.on('error', this.handleStreamError);
  }

  onMessage(handler: TransportEvents['message']): () => void {
    this.emitter.on('message', handler);
    return () => this.emitter.off('message', handler);
  }

  onError(handler: TransportEvents['error']): () => void {
    this.emitter.on('error', handler);
    return () => this.emitter.off('error', handler);
  }

  write(message: CodexJsonRpcOutgoing): void {
    if (this.disposed) {
      throw new Error('Codex JSONL transport is disposed');
    }
    this.streams.stdin.write(`${JSON.stringify(message)}\n`);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.streams.stdout.off('data', this.handleStdoutData);
    this.streams.stdout.off('error', this.handleStreamError);
    this.streams.stdin.off('error', this.handleStreamError);
    this.emitter.removeAllListeners();
  }

  private readonly handleStdoutData = (chunk: Buffer | string): void => {
    this.buffer += String(chunk);
    let newlineIndex = this.buffer.indexOf('\n');

    while (newlineIndex >= 0) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        this.emitLine(line);
      }
      newlineIndex = this.buffer.indexOf('\n');
    }
  };

  private emitLine(line: string): void {
    try {
      this.emitter.emit('message', JSON.parse(line) as CodexJsonRpcMessage);
    } catch (error) {
      this.emitter.emit('error', error instanceof Error ? error : new Error(String(error)));
    }
  }

  private readonly handleStreamError = (error: Error): void => {
    this.emitter.emit('error', error);
  };
}
