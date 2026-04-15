// tests/unit/process/acp/session/PromptQueue.test.ts

import { describe, it, expect } from 'vitest';
import { PromptQueue } from '@process/acp/session/PromptQueue';

function makePrompt(id: string) {
  return { id, text: `msg-${id}`, enqueuedAt: Date.now() };
}

describe('PromptQueue', () => {
  it('enqueues and dequeues in FIFO order (INV-S-02)', () => {
    const q = new PromptQueue(5);
    q.enqueue(makePrompt('a'));
    q.enqueue(makePrompt('b'));
    expect(q.dequeue()!.id).toBe('a');
    expect(q.dequeue()!.id).toBe('b');
  });

  it('returns false when full (INV-S-14)', () => {
    const q = new PromptQueue(2);
    expect(q.enqueue(makePrompt('a'))).toBe(true);
    expect(q.enqueue(makePrompt('b'))).toBe(true);
    expect(q.enqueue(makePrompt('c'))).toBe(false);
    expect(q.length).toBe(2);
  });

  it('dequeue returns null when empty', () => {
    const q = new PromptQueue(5);
    expect(q.dequeue()).toBeNull();
  });

  it('clear empties the queue', () => {
    const q = new PromptQueue(5);
    q.enqueue(makePrompt('a'));
    q.enqueue(makePrompt('b'));
    q.clear();
    expect(q.isEmpty).toBe(true);
    expect(q.length).toBe(0);
  });

  it('snapshot returns shallow copy with correct metadata', () => {
    const q = new PromptQueue(5);
    q.enqueue(makePrompt('a'));
    const snap = q.snapshot();
    expect(snap.length).toBe(1);
    expect(snap.maxSize).toBe(5);
    expect(snap.items[0].id).toBe('a');
  });

  it('never exceeds maxSize (INV-S-14)', () => {
    const q = new PromptQueue(3);
    for (let i = 0; i < 100; i++) q.enqueue(makePrompt(String(i)));
    expect(q.length).toBeLessThanOrEqual(3);
  });
});
