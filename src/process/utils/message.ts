/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chat/chatLib';
import { composeMessage } from '@/common/chat/chatLib';
import type { AgentBackend } from '@/common/types/acpTypes';

const Cache = new Map<string, ConversationManageWithDB>();

// Place all messages in a unified update queue based on the conversation
// Ensure that the update mechanism for each message is consistent with the front end, meaning that the database and UI data are in sync
// Aggregate multiple messages for synchronous updates, reducing database operations
class ConversationManageWithDB {
  private stack: Array<['insert' | 'accumulate', TMessage]> = [];
  private timer: NodeJS.Timeout;
  private messageList: TMessage[] = [];
  /** Whether a flush is currently in progress (replaces unbounded promise chain) */
  private flushing = false;

  constructor(private conversation_id: string) {}
  static get(conversation_id: string) {
    if (Cache.has(conversation_id)) return Cache.get(conversation_id);
    const manage = new ConversationManageWithDB(conversation_id);
    Cache.set(conversation_id, manage);
    return manage;
  }

  /** Clear pending timer and discard queued messages so this instance can be GC'd. */
  dispose(): void {
    clearTimeout(this.timer);
    this.stack = [];
  }
  sync(type: 'insert' | 'accumulate', message: TMessage) {
    this.stack.push([type, message]);
    clearTimeout(this.timer);
    if (type === 'insert') {
      this.flush();
      return;
    }
    this.timer = setTimeout(() => {
      this.flush();
    }, 2000);
  }

  private async flush(): Promise<void> {
    if (this.flushing || this.stack.length === 0) return;
    this.flushing = true;
    try {
      const stack = this.stack.splice(0);
      for (const [type, msg] of stack) {
        if (type === 'insert') {
          this.messageList.push(msg);
        } else {
          this.messageList = composeMessage(msg, this.messageList, () => {});
        }
      }
      executePendingCallbacks();
    } catch (err) {
      console.error('[Message] flush error:', err);
    } finally {
      this.flushing = false;
      // If new messages arrived during flush, process them
      if (this.stack.length > 0) {
        this.flush();
      }
    }
  }
}

/**
 * Add a new message to the database
 * Wraps async work inside an IIFE to keep call sites synchronous.
 */
export const addMessage = (conversation_id: string, message: TMessage): void => {
  ConversationManageWithDB.get(conversation_id).sync('insert', message);
};

/**
 * Remove a conversation's message queue from the in-memory cache.
 * Call this when a conversation is deleted to prevent memory leaks.
 */
export const removeFromMessageCache = (conversation_id: string): void => {
  const cached = Cache.get(conversation_id);
  if (cached) {
    cached.dispose();
    Cache.delete(conversation_id);
  }
};

/**
 * Add or update a single message
 * If message exists (by id), update it; otherwise insert it
 */
export const addOrUpdateMessage = (conversation_id: string, message: TMessage, backend?: AgentBackend): void => {
  // Validate message
  if (!message) {
    console.error('[Message] Cannot add or update undefined message');
    return;
  }

  if (!message.id) {
    console.error('[Message] Message missing required id field:', message);
    return;
  }

  ConversationManageWithDB.get(conversation_id).sync('accumulate', message);
};

/**
 * Execute a callback after the next async operation completes
 * Note: With direct database operations, this executes immediately after the pending operation
 */
const pendingCallbacks: Array<() => void> = [];

export const nextTickToLocalFinish = (fn: () => void): void => {
  pendingCallbacks.push(fn);
};

/**
 * Execute all pending callbacks
 */
export const executePendingCallbacks = (): void => {
  while (pendingCallbacks.length > 0) {
    const callback = pendingCallbacks.shift();
    if (callback) {
      try {
        callback();
      } catch (error) {
        console.error('[Message] Error in pending callback:', error);
      }
    }
  }
};

/**
 * @deprecated This function is no longer needed with direct database operations
 */
export const nextTickToLocalRunning = (_fn: (list: TMessage[]) => TMessage[]): void => {
  console.warn('[Message] nextTickToLocalRunning is deprecated with database storage');
};
