/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Conversation state for tracking busy/idle status
 */
interface ConversationState {
  isProcessing: boolean;
  lastActiveAt: number;
}

/**
 * Service to track conversation busy state
 * Used by CronService to avoid sending messages to busy conversations
 */
type IdleCallback = () => void;

export class CronBusyGuard {
  private states = new Map<string, ConversationState>();
  private idleCallbacks = new Map<string, IdleCallback[]>();

  /**
   * Check if a conversation is currently processing a message
   */
  isProcessing(conversation_id: string): boolean {
    return this.states.get(conversation_id)?.isProcessing ?? false;
  }

  /**
   * Set the processing state of a conversation
   * Should be called at the start and end of message processing
   */
  setProcessing(conversation_id: string, value: boolean): void {
    const state = this.states.get(conversation_id) ?? { isProcessing: false, lastActiveAt: 0 };
    state.isProcessing = value;
    if (value) {
      state.lastActiveAt = Date.now();
    }
    this.states.set(conversation_id, state);

    // Fire idle callbacks when processing completes
    if (!value) {
      const callbacks = this.idleCallbacks.get(conversation_id);
      if (callbacks) {
        this.idleCallbacks.delete(conversation_id);
        for (const cb of callbacks) cb();
      }
    }
  }

  /**
   * Register a one-time callback for when a conversation becomes idle.
   * If already idle, fires immediately.
   */
  onceIdle(conversation_id: string, callback: IdleCallback): void {
    if (!this.isProcessing(conversation_id)) {
      callback();
      return;
    }
    const existing = this.idleCallbacks.get(conversation_id) ?? [];
    existing.push(callback);
    this.idleCallbacks.set(conversation_id, existing);
  }

  /**
   * Get the last active timestamp of a conversation
   */
  getLastActiveAt(conversation_id: string): number | undefined {
    return this.states.get(conversation_id)?.lastActiveAt;
  }

  /**
   * Wait for a conversation to become idle
   * Polls the state until isProcessing is false or timeout
   *
   * @param conversation_id - The conversation to wait for
   * @param timeoutMs - Maximum time to wait (default 60s)
   * @throws Error if timeout is reached
   */
  async waitForIdle(conversation_id: string, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    const pollInterval = 1000; // 1 second

    while (this.isProcessing(conversation_id)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for conversation ${conversation_id} to be idle`);
      }
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  /**
   * Get all conversation states (for debugging/monitoring)
   */
  getAllStates(): Map<string, ConversationState> {
    return new Map(this.states);
  }

  /**
   * Clean up stale states that haven't been active for a while
   * Should be called periodically to prevent memory leaks
   *
   * @param olderThanMs - Remove states older than this (default 1 hour)
   */
  cleanup(olderThanMs = 3600000): void {
    const now = Date.now();
    for (const [id, state] of this.states) {
      // Only clean up idle conversations
      if (!state.isProcessing && now - state.lastActiveAt > olderThanMs) {
        this.states.delete(id);
      }
    }
  }

  /**
   * Remove state for a specific conversation
   * Call when conversation is deleted
   */
  remove(conversation_id: string): void {
    this.states.delete(conversation_id);
  }

  /**
   * Clear all states (for testing)
   */
  clear(): void {
    this.states.clear();
  }
}

// Singleton instance
export const cronBusyGuard = new CronBusyGuard();
