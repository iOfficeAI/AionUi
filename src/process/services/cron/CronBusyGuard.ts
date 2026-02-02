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
class CronBusyGuard {
  private states = new Map<string, ConversationState>();

  /**
   * Check if a conversation is currently processing a message
   */
  isProcessing(conversationId: string): boolean {
    return this.states.get(conversationId)?.isProcessing ?? false;
  }

  /**
   * Set the processing state of a conversation
   * Should be called at the start and end of message processing
   */
  setProcessing(conversationId: string, value: boolean): void {
    const state = this.states.get(conversationId) ?? { isProcessing: false, lastActiveAt: 0 };
    state.isProcessing = value;
    if (value) {
      state.lastActiveAt = Date.now();
    }
    this.states.set(conversationId, state);
  }

  /**
   * Get the last active timestamp of a conversation
   */
  getLastActiveAt(conversationId: string): number | undefined {
    return this.states.get(conversationId)?.lastActiveAt;
  }

  /**
   * Wait for a conversation to become idle
   * Polls the state until isProcessing is false or timeout
   *
   * @param conversationId - The conversation to wait for
   * @param timeoutMs - Maximum time to wait (default 60s)
   * @throws Error if timeout is reached
   */
  async waitForIdle(conversationId: string, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    const pollInterval = 1000; // 1 second

    while (this.isProcessing(conversationId)) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timeout waiting for conversation ${conversationId} to be idle`);
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
  remove(conversationId: string): void {
    this.states.delete(conversationId);
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
