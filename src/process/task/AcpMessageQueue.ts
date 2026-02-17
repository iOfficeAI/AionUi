/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Message queue for ACP agents.
 *
 * Queues messages and auto-prompts the agent sequentially:
 * after the agent finishes responding, the next message in the queue is sent
 * until the queue is empty.
 *
 * Messages can be enqueued via hooks, cron, or the legacy sendMessage flow.
 */

import { uuid } from '@/common/utils';

export type QueuedMessagePriority = 'normal' | 'high';

export type QueuedMessageSource = 'user' | 'hook' | 'cron' | 'system';

export interface QueuedMessage {
  /** Unique ID for this queued message */
  id: string;
  /** The text content to send */
  content: string;
  /** Optional file paths to attach */
  files?: string[];
  /** Optional msg_id (generated if not provided) */
  msg_id?: string;
  /** Priority: high-priority messages are inserted at the front */
  priority: QueuedMessagePriority;
  /** Where this message originated */
  source: QueuedMessageSource;
  /** Timestamp when enqueued */
  enqueuedAt: number;
}

export type QueueStatus = 'idle' | 'processing' | 'paused';

export type QueueEventType = 'enqueue' | 'dequeue' | 'start' | 'finish' | 'error' | 'drain' | 'pause' | 'resume';

export interface QueueEvent {
  type: QueueEventType;
  message?: QueuedMessage;
  queueLength: number;
  error?: string;
}

export type QueueEventListener = (event: QueueEvent) => void;

/** Function that sends a message and resolves when the agent turn finishes */
export type MessageSender = (data: { content: string; files?: string[]; msg_id?: string }) => Promise<unknown>;

export class AcpMessageQueue {
  private queue: QueuedMessage[] = [];
  private status: QueueStatus = 'idle';
  private listeners: QueueEventListener[] = [];
  private sender: MessageSender | null = null;
  private processing = false;
  private maxQueueSize = 100;
  /** Resolves when the agent emits its 'finish' signal for the current turn */
  private turnFinishResolve: (() => void) | null = null;

  /**
   * Set the message sender function.
   * This is called to actually deliver messages to the agent.
   */
  setSender(sender: MessageSender): void {
    this.sender = sender;
  }

  /**
   * Enqueue a message. If the queue is idle, processing starts automatically.
   */
  enqueue(message: Omit<QueuedMessage, 'id' | 'enqueuedAt'>): string {
    if (this.queue.length >= this.maxQueueSize) {
      console.warn(`[AcpMessageQueue] Queue full (${this.maxQueueSize}), dropping message`);
      return '';
    }

    const queuedMessage: QueuedMessage = {
      ...message,
      id: uuid(),
      msg_id: message.msg_id || uuid(),
      enqueuedAt: Date.now(),
    };

    if (message.priority === 'high') {
      // Insert after any other high-priority messages but before normal ones
      const firstNormalIdx = this.queue.findIndex((m) => m.priority === 'normal');
      if (firstNormalIdx === -1) {
        this.queue.push(queuedMessage);
      } else {
        this.queue.splice(firstNormalIdx, 0, queuedMessage);
      }
    } else {
      this.queue.push(queuedMessage);
    }

    this.emit({ type: 'enqueue', message: queuedMessage, queueLength: this.queue.length });

    // Auto-start processing if idle
    if (this.status === 'idle' && !this.processing) {
      void this.processNext();
    }

    return queuedMessage.id;
  }

  /**
   * Enqueue multiple messages at once.
   */
  enqueueAll(messages: Array<Omit<QueuedMessage, 'id' | 'enqueuedAt'>>): string[] {
    return messages.map((msg) => this.enqueue(msg));
  }

  /**
   * Notify the queue that the agent has finished responding.
   * If processNext() is waiting for the turn to finish, this unblocks it.
   * Otherwise it triggers processing of the next pending message.
   */
  onAgentFinished(): void {
    // Unblock processNext() which is awaiting the turn-finish promise
    if (this.turnFinishResolve) {
      const resolve = this.turnFinishResolve;
      this.turnFinishResolve = null;
      resolve();
      return;
    }
    // If there are pending messages and we're not already processing, start
    if (this.queue.length > 0 && this.status !== 'paused' && !this.processing) {
      void this.processNext();
    }
  }

  /**
   * Pause queue processing. Current message will finish but no new ones start.
   */
  pause(): void {
    if (this.status === 'paused') return;
    this.status = 'paused';
    this.emit({ type: 'pause', queueLength: this.queue.length });
  }

  /**
   * Resume queue processing after a pause.
   */
  resume(): void {
    if (this.status !== 'paused') return;
    this.status = 'idle';
    this.emit({ type: 'resume', queueLength: this.queue.length });
    if (this.queue.length > 0 && !this.processing) {
      void this.processNext();
    }
  }

  /**
   * Clear all pending messages from the queue.
   */
  clear(): void {
    this.queue = [];
    this.status = 'idle';
    this.emit({ type: 'drain', queueLength: 0 });
  }

  /**
   * Remove a specific message from the queue by ID.
   */
  remove(messageId: string): boolean {
    const idx = this.queue.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    this.queue.splice(idx, 1);
    return true;
  }

  /**
   * Get current queue status info.
   */
  getStatus(): { status: QueueStatus; queueLength: number; messages: QueuedMessage[] } {
    return {
      status: this.status,
      queueLength: this.queue.length,
      messages: [...this.queue],
    };
  }

  /**
   * Subscribe to queue events.
   */
  on(listener: QueueEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Check if the queue is paused (avoids TS narrowing issues across await boundaries) */
  private isPaused(): boolean {
    return this.status === 'paused';
  }

  /**
   * Process the next message in the queue.
   */
  private async processNext(): Promise<void> {
    if (this.processing) return;
    if (this.status === 'paused') return;
    if (this.queue.length === 0) {
      this.status = 'idle';
      this.emit({ type: 'drain', queueLength: 0 });
      return;
    }
    if (!this.sender) {
      console.error('[AcpMessageQueue] No sender configured, cannot process queue');
      return;
    }

    this.processing = true;
    this.status = 'processing';

    const message = this.queue.shift()!;
    this.emit({ type: 'dequeue', message, queueLength: this.queue.length });
    this.emit({ type: 'start', message, queueLength: this.queue.length });

    try {
      // Create a promise that resolves when onAgentFinished() is called
      const turnFinished = new Promise<void>((resolve) => {
        this.turnFinishResolve = resolve;
      });

      await this.sender({
        content: message.content,
        files: message.files,
        msg_id: message.msg_id,
      });

      // Wait for the agent to finish the turn (finish signal from ACP)
      // This ensures the next queued message is only sent after Claude responds
      await turnFinished;

      this.emit({ type: 'finish', message, queueLength: this.queue.length });
    } catch (error) {
      // Clear the turn-finish resolver on error to avoid a dangling promise
      this.turnFinishResolve = null;
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[AcpMessageQueue] Failed to send message ${message.id}:`, errorMsg);
      this.emit({ type: 'error', message, queueLength: this.queue.length, error: errorMsg });
    }

    this.processing = false;

    // Continue processing if there are more messages
    // Note: status may have changed to 'paused' during the await above
    if (this.queue.length > 0 && !this.isPaused()) {
      void this.processNext();
    } else if (this.queue.length === 0) {
      this.status = 'idle';
      this.emit({ type: 'drain', queueLength: 0 });
    }
  }

  private emit(event: QueueEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[AcpMessageQueue] Listener error:', err);
      }
    }
  }
}
