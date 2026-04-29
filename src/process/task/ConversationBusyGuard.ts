/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Conversation state for tracking busy/idle status.
 */
type ConversationState = {
  isProcessing: boolean;
  lastActiveAt: number;
};

type IdleCallback = () => void;

/**
 * Tracks per-conversation busy state across agent runtimes and task services.
 */
export class ConversationBusyGuard {
  private states = new Map<string, ConversationState>();
  private idleCallbacks = new Map<string, IdleCallback[]>();

  isProcessing(conversationId: string): boolean {
    return this.states.get(conversationId)?.isProcessing ?? false;
  }

  setProcessing(conversationId: string, value: boolean): void {
    const state = this.states.get(conversationId) ?? { isProcessing: false, lastActiveAt: 0 };
    state.isProcessing = value;
    if (value) {
      state.lastActiveAt = Date.now();
    }
    this.states.set(conversationId, state);

    if (!value) {
      const callbacks = this.idleCallbacks.get(conversationId);
      if (callbacks) {
        this.idleCallbacks.delete(conversationId);
        for (const callback of callbacks) {
          callback();
        }
      }
    }
  }

  onceIdle(conversationId: string, callback: IdleCallback): void {
    if (!this.isProcessing(conversationId)) {
      callback();
      return;
    }

    const existing = this.idleCallbacks.get(conversationId) ?? [];
    existing.push(callback);
    this.idleCallbacks.set(conversationId, existing);
  }

  getLastActiveAt(conversationId: string): number | undefined {
    return this.states.get(conversationId)?.lastActiveAt;
  }

  async waitForIdle(conversationId: string, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    const pollInterval = 1000;

    while (this.isProcessing(conversationId)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for conversation ${conversationId} to be idle`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  getAllStates(): Map<string, ConversationState> {
    return new Map(this.states);
  }

  cleanup(olderThanMs = 3600000): void {
    const now = Date.now();
    for (const [id, state] of this.states) {
      if (!state.isProcessing && now - state.lastActiveAt > olderThanMs) {
        this.states.delete(id);
      }
    }
  }

  remove(conversationId: string): void {
    this.states.delete(conversationId);
  }

  clear(): void {
    this.states.clear();
  }
}

export const conversationBusyGuard = new ConversationBusyGuard();
