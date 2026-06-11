/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TextToSpeechConfig } from '@/common/types/provider/speech';
import { type TtsPlayable, TtsService, type TtsServiceOptions } from './TtsService';

/** Public-facing state of the queue. */
export type TtsQueueStatus = 'idle' | 'playing' | 'paused';

export type TtsQueueItem = {
  /** Stable identifier (typically the chat message id). Used for dedupe. */
  id: string;
  /** Plain text to be spoken. */
  text: string;
};

export type TtsQueueState = {
  /** Currently playing item id, or `null` if nothing is playing. */
  currentId: string | null;
  status: TtsQueueStatus;
  /** Ids of items waiting to be played (in play order, excluding the current). */
  queuedIds: string[];
};

export type TtsQueueListener = (state: TtsQueueState) => void;

/** Minimal `TtsService` surface that the queue depends on. Exposed for tests. */
export type TtsServiceLike = {
  synthesize(text: string, config: TextToSpeechConfig): TtsPlayable;
};

const buildState = (currentId: string | null, status: TtsQueueStatus, queuedIds: string[]): TtsQueueState => ({
  currentId,
  status,
  queuedIds,
});

/**
 * Sequential per-message playback queue for TTS. The queue itself is owned
 * by the renderer (renderer/services/tts); the wiring task is responsible for
 * calling {@link enqueue} when a message is ready and {@link playNow} when the
 * user explicitly requests an immediate jump.
 */
export class TtsQueue {
  private readonly service: TtsServiceLike;
  private readonly pending: TtsQueueItem[] = [];
  private current: {
    item: TtsQueueItem;
    playable: TtsPlayable;
    removeOnEnd?: () => void;
    removeOnError?: () => void;
  } | null = null;
  private currentConfig: TextToSpeechConfig | null = null;
  private status: TtsQueueStatus = 'idle';
  private readonly listeners = new Set<TtsQueueListener>();

  constructor(service?: TtsServiceLike | TtsServiceOptions) {
    if (service && typeof (service as TtsServiceLike).synthesize === 'function') {
      this.service = service as TtsServiceLike;
    } else {
      this.service = new TtsService((service as TtsServiceOptions | undefined) ?? {});
    }
  }

  /** Enqueue an item. Items with an id already pending (or currently playing) are ignored. */
  enqueue(item: TtsQueueItem): void {
    if (!item.id) return;
    if (this.current?.item.id === item.id) return;
    if (this.pending.some((q) => q.id === item.id)) return;
    this.pending.push(item);
    this.emit();
    if (!this.current && this.status === 'idle') {
      this.advance();
    }
  }

  /**
   * Stop the current item (if any) and immediately start playing `item`. The
   * remaining pending queue is preserved as-is.
   */
  playNow(item: TtsQueueItem): void {
    if (!item.id) return;
    // Remove any existing entry with the same id to avoid duplicate play.
    const existingIdx = this.pending.findIndex((q) => q.id === item.id);
    if (existingIdx >= 0) this.pending.splice(existingIdx, 1);
    this.stopCurrent({ keepQueue: true });
    this.current = null;
    this.pending.unshift(item);
    this.status = 'idle';
    this.emit();
    this.advance();
  }

  /** Pause the currently playing item, if any. No-op if already paused or idle. */
  pause(): void {
    if (this.status !== 'playing') return;
    this.current?.playable.pause();
    this.status = 'paused';
    this.emit();
  }

  /** Resume a paused item. No-op if not paused. */
  resume(): void {
    if (this.status !== 'paused') return;
    this.current?.playable.play();
    this.status = 'playing';
    this.emit();
  }

  /**
   * Skip the current item and start the next pending one (if any). Errors
   * encountered while playing the skipped item must not wedge the queue.
   */
  skip(): void {
    if (!this.current) return;
    this.stopCurrent({ keepQueue: true });
    this.current = null;
    this.status = 'idle';
    this.emit();
    this.advance();
  }

  /**
   * Stop the current item but keep the pending queue intact. Used by user
   * "stop" controls; the next item will start on the next {@link enqueue}
   * or {@link playNow} call.
   */
  stop(): void {
    this.stopCurrent({ keepQueue: true });
    this.current = null;
    this.status = 'idle';
    this.emit();
  }

  /** Clear the pending queue and stop the current item. */
  clear(): void {
    this.stopCurrent({ keepQueue: false });
    this.pending.length = 0;
    this.current = null;
    this.status = 'idle';
    this.emit();
  }

  /** Snapshot of the current state. */
  getState(): TtsQueueState {
    return buildState(
      this.current?.item.id ?? null,
      this.status,
      this.pending.map((p) => p.id)
    );
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(listener: TtsQueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Replace the config used for subsequent syntheses. Has no effect on an
   * item that is currently playing (its playable is already constructed).
   */
  setConfig(config: TextToSpeechConfig | null): void {
    this.currentConfig = config;
  }

  private advance(): void {
    if (this.status === 'paused') return; // wait for explicit resume
    const next = this.pending.shift();
    if (!next) {
      this.current = null;
      this.status = 'idle';
      this.emit();
      return;
    }
    if (!this.currentConfig) {
      // No config — drop the item silently to avoid invoking the service with garbage.
      this.advance();
      return;
    }
    let playable: TtsPlayable;
    try {
      playable = this.service.synthesize(next.text, this.currentConfig);
    } catch (err) {
      console.warn('[TtsQueue] synthesize threw, advancing:', err);
      this.advance();
      return;
    }
    const removeOnEnd = playable.onEnd(() => {
      if (this.current?.item.id !== next.id) return;
      if (this.current.removeOnEnd) this.current.removeOnEnd();
      if (this.current.removeOnError) this.current.removeOnError();
      this.current = null;
      this.status = 'idle';
      this.emit();
      this.advance();
    });
    const removeOnError = playable.onError(() => {
      if (this.current?.item.id !== next.id) return;
      console.warn(`[TtsQueue] item ${next.id} errored, advancing to next`);
      if (this.current.removeOnEnd) this.current.removeOnEnd();
      if (this.current.removeOnError) this.current.removeOnError();
      this.current = null;
      this.status = 'idle';
      this.emit();
      this.advance();
    });
    this.current = { item: next, playable, removeOnEnd, removeOnError };
    this.status = 'playing';
    this.emit();
    try {
      playable.play();
    } catch (err) {
      console.warn('[TtsQueue] play() threw, advancing:', err);
      this.advance();
    }
  }

  private stopCurrent(opts: { keepQueue: boolean }): void {
    if (!this.current) return;
    try {
      this.current.playable.stop();
    } catch (err) {
      console.warn('[TtsQueue] stop() threw:', err);
    }
    if (this.current.removeOnEnd) this.current.removeOnEnd();
    if (this.current.removeOnError) this.current.removeOnError();
    if (!opts.keepQueue) {
      // keepQueue=false is only used by clear() which also empties the array
    }
  }

  private emit(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.warn('[TtsQueue] listener threw:', err);
      }
    }
  }
}
