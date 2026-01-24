/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TMessage } from '@/common/chatLib';
import { composeMessage } from '@/common/chatLib';
import type { AcpBackend } from '@/types/acpTypes';
import { getDatabase } from './database/export';
import { ProcessChat } from './initStorage';

const Cache = new Map<string, ConversationManageWithDB>();

// Place all messages in a unified update queue based on the conversation
// Ensure that the update mechanism for each message is consistent with the front end, meaning that the database and UI data are in sync
// Aggregate multiple messages for synchronous updates, reducing database operations
class ConversationManageWithDB {
  private stack: Array<['insert' | 'accumulate', TMessage]> = [];
  private db = getDatabase();
  private timer: NodeJS.Timeout;
  private savePromise = Promise.resolve();
  constructor(private conversation_id: string) {
    this.savePromise = ensureConversationExists(this.db, this.conversation_id).catch(() => {});
  }
  static get(conversation_id: string) {
    if (Cache.has(conversation_id)) return Cache.get(conversation_id);
    const manage = new ConversationManageWithDB(conversation_id);
    Cache.set(conversation_id, manage);
    return manage;
  }
  sync(type: 'insert' | 'accumulate', message: TMessage) {
    this.stack.push([type, message]);
    clearTimeout(this.timer);
    if (type === 'insert') {
      this.save2DataBase();
      return;
    }
    this.timer = setTimeout(() => {
      this.save2DataBase();
    }, 2000);
  }

  private save2DataBase() {
    this.savePromise = this.savePromise
      .then(() => {
        const stack = this.stack.slice();
        this.stack = [];
        const messages = this.db.getConversationMessages(this.conversation_id, 0, 50, 'DESC'); //
        let messageList = messages.data.reverse();
        let updateMessage = stack.shift();
        while (updateMessage) {
          if (updateMessage[0] === 'insert') {
            this.db.insertMessage(updateMessage[1]);
            messageList.push(updateMessage[1]);
          } else {
            messageList = composeMessage(updateMessage[1], messageList, (type, message) => {
              if (type === 'insert') this.db.insertMessage(message);
              if (type === 'update') {
                this.db.updateMessage(message.id, message);
              }
            });
          }
          updateMessage = stack.shift();
        }
        executePendingCallbacks();
      })
      .then(() => {
        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            resolve();
            clearTimeout(timer);
          }, 10);
        });
      });
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
 * Ensure conversation exists in database
 * If not, load from file storage and create it
 */
async function ensureConversationExists(db: ReturnType<typeof getDatabase>, conversation_id: string): Promise<void> {
  // Check if conversation exists in database
  const existingConv = db.getConversation(conversation_id);
  if (existingConv.success && existingConv.data) {
    return; // Conversation already exists
  }

  // Load conversation from file storage
  const history = await ProcessChat.get('chat.history');
  const conversation = (history || []).find((c) => c.id === conversation_id);

  if (!conversation) {
    console.error(`[Message] Conversation ${conversation_id} not found in file storage either`);
    return;
  }

  // Create conversation in database
  const result = db.createConversation(conversation);
  if (!result.success) {
    console.error(`[Message] Failed to create conversation in database:`, result.error);
  }
}

/**
 * Add or update a single message
 * If message exists (by id), update it; otherwise insert it
 */
export const addOrUpdateMessage = (conversation_id: string, message: TMessage, backend?: AcpBackend): void => {
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
