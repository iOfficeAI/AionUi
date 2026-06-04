/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';
import type { PetNotificationSummary } from './petTypes';

const STREAM_CHANNELS = new Set(['chat.response.stream', 'openclaw.response.stream']);

type StreamMessage = {
  type?: string;
};

export class PetEventBridge {
  private disposed = false;
  private pendingConfirmationIds = new Set<string>();
  private notificationListeners: Array<(summary: PetNotificationSummary) => void> = [];

  constructor(
    private sm: PetStateMachine,
    private ticker: PetIdleTicker
  ) {}

  handleBridgeMessage(channelName: string, data: unknown): void {
    if (this.disposed) return;

    // Permission request → notification state
    if (channelName === 'confirmation.add') {
      const id = getConfirmationId(data);
      if (id) {
        this.pendingConfirmationIds.add(id);
        this.emitNotificationSummary();
      }
      this.ticker.resetIdle();
      this.sm.requestState('notification');
      return;
    }

    if (channelName === 'confirmation.update') {
      const id = getConfirmationId(data);
      if (id) {
        this.pendingConfirmationIds.add(id);
        this.emitNotificationSummary();
      }
      return;
    }

    if (channelName === 'confirmation.remove') {
      const id = getConfirmationId(data);
      if (id && this.pendingConfirmationIds.delete(id)) {
        this.emitNotificationSummary();
      }
      return;
    }

    if (!STREAM_CHANNELS.has(channelName)) return;

    const msg = data as StreamMessage | undefined;
    if (!msg?.type) return;

    let targetState: Parameters<PetStateMachine['requestState']>[0] | null = null;

    switch (msg.type) {
      case 'thinking':
      case 'thought':
        targetState = 'thinking';
        break;
      case 'text':
      case 'content':
        targetState = 'working';
        break;
      case 'finish':
        // `done` is the functional completion signal (bubble + check).
        // `happy` is reserved for user-initiated affection (right-click
        // "pat") so the two animations carry distinct meanings instead
        // of happy being both "AI finished" and "user petted me".
        targetState = 'done';
        break;
      case 'error':
        targetState = 'error';
        break;
    }

    if (targetState) {
      this.ticker.resetIdle();
      this.sm.requestState(targetState);
    }
  }

  handleUserSendMessage(): void {
    if (this.disposed) return;
    this.ticker.resetIdle();
    this.sm.requestState('thinking');
  }

  handleTurnCompleted(): void {
    if (this.disposed) return;
    this.ticker.resetIdle();
    this.sm.requestState('done');
  }

  handleConfirmationAdd(): void {
    if (this.disposed) return;
    this.ticker.resetIdle();
    this.sm.requestState('notification');
  }

  onNotificationChange(cb: (summary: PetNotificationSummary) => void): void {
    this.notificationListeners.push(cb);
    cb(this.getNotificationSummary());
  }

  getNotificationSummary(): PetNotificationSummary {
    return { pendingConfirmations: this.pendingConfirmationIds.size };
  }

  dispose(): void {
    this.disposed = true;
    this.pendingConfirmationIds.clear();
    this.notificationListeners.length = 0;
  }

  private emitNotificationSummary(): void {
    const summary = this.getNotificationSummary();
    for (const cb of this.notificationListeners) {
      try {
        cb(summary);
      } catch {
        // Never crash the bridge from an optional UI listener.
      }
    }
  }
}

function getConfirmationId(data: unknown): string | null {
  if (!data || typeof data !== 'object' || !('id' in data)) return null;
  const id = (data as { id?: unknown }).id;
  return typeof id === 'string' && id.length > 0 ? id : null;
}
