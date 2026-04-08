/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PetStateMachine } from './petStateMachine';
import type { PetIdleTicker } from './petIdleTicker';

const STREAM_CHANNELS = new Set(['chat.response.stream', 'openclaw.response.stream']);

type StreamMessage = {
  type?: string;
};

export class PetEventBridge {
  private disposed = false;

  constructor(
    private sm: PetStateMachine,
    private ticker: PetIdleTicker
  ) {}

  handleBridgeMessage(channelName: string, data: unknown): void {
    if (this.disposed) return;

    // Permission request → notification state
    if (channelName === 'confirmation.add') {
      this.ticker.resetIdle();
      this.sm.requestState('notification');
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

  dispose(): void {
    this.disposed = true;
  }
}
