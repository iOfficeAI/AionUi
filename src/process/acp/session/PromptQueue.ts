// src/process/acp/session/PromptQueue.ts

import type { QueueSnapshot } from '@process/acp/types';

export type QueuedPrompt = {
  id: string;
  text: string;
  files?: string[];
  enqueuedAt: number;
};

export class PromptQueue {
  private items: QueuedPrompt[] = [];

  constructor(public readonly maxSize: number = 5) {}

  get length(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  enqueue(prompt: QueuedPrompt): boolean {
    if (this.items.length >= this.maxSize) return false;
    this.items.push(prompt);
    return true;
  }

  dequeue(): QueuedPrompt | null {
    return this.items.shift() ?? null;
  }

  /** Re-insert a prompt at the front (e.g., after a retriable auth failure). */
  enqueueFront(prompt: QueuedPrompt): void {
    this.items.unshift(prompt);
  }

  clear(): void {
    this.items = [];
  }

  snapshot(): QueueSnapshot {
    return {
      items: this.items.map((p) => ({ id: p.id, text: p.text, enqueuedAt: p.enqueuedAt })),
      maxSize: this.maxSize,
      length: this.items.length,
    };
  }
}
