// src/process/acp/session/PromptQueue.ts

import type { QueuedPrompt, QueueSnapshot } from '../types';

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
