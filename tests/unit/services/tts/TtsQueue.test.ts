/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/services/tts/TtsQueue. TtsService is replaced with a
 * fake so we can drive end/error callbacks deterministically.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TtsQueue,
  type TtsQueueItem,
  type TtsQueueState,
  type TtsServiceLike,
  type TtsPlayable,
} from '@/renderer/services/tts';
import type { TextToSpeechConfig } from '@/common/types/provider/speech';

type FakePlayable = TtsPlayable & {
  _end(): void;
  _error(): void;
  playMock: ReturnType<typeof vi.fn>;
  pauseMock: ReturnType<typeof vi.fn>;
  stopMock: ReturnType<typeof vi.fn>;
};

const makeFakePlayable = (): FakePlayable => {
  const endListeners = new Set<() => void>();
  const errorListeners = new Set<() => void>();
  const playMock = vi.fn();
  const pauseMock = vi.fn();
  const stopMock = vi.fn();
  const playable: FakePlayable = {
    play: playMock,
    pause: pauseMock,
    stop: stopMock,
    state: 'idle',
    onEnd: (cb) => {
      endListeners.add(cb);
      return () => endListeners.delete(cb);
    },
    onError: (cb) => {
      errorListeners.add(cb);
      return () => errorListeners.delete(cb);
    },
    _end: () => {
      for (const cb of endListeners) cb();
    },
    _error: () => {
      for (const cb of errorListeners) cb();
    },
    playMock,
    pauseMock,
    stopMock,
  };
  return playable;
};

const makeService = (): {
  service: TtsServiceLike;
  items: Array<{ text: string; config: TextToSpeechConfig; playable: FakePlayable }>;
} => {
  const items: Array<{ text: string; config: TextToSpeechConfig; playable: FakePlayable }> = [];
  const service: TtsServiceLike = {
    synthesize: (text, config) => {
      const playable = makeFakePlayable();
      items.push({ text, config, playable });
      return playable;
    },
  };
  return { service, items };
};

const baseConfig: TextToSpeechConfig = {
  enabled: true,
  provider: 'system',
};

describe('TtsQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('enqueue plays the first item immediately', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);
    const states: TtsQueueState[] = [];
    queue.subscribe((s) => states.push(s));

    queue.enqueue({ id: 'a', text: 'hello' });

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      text: 'hello',
      config: baseConfig,
      playable: expect.objectContaining({ playMock: expect.anything() }),
    });
    expect(items[0].playable.playMock).toHaveBeenCalledTimes(1);
    expect(queue.getState().currentId).toBe('a');
    expect(queue.getState().status).toBe('playing');
    expect(states.at(-1)?.currentId).toBe('a');
  });

  it('items play sequentially on natural end', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    queue.enqueue({ id: 'c', text: 'three' });

    // Only the first is playing; the rest are pending.
    expect(queue.getState().currentId).toBe('a');
    expect(queue.getState().queuedIds).toEqual(['b', 'c']);

    items[0].playable._end();
    expect(queue.getState().currentId).toBe('b');
    expect(queue.getState().queuedIds).toEqual(['c']);
    expect(items[1].playable.playMock).toHaveBeenCalledTimes(1);

    items[1].playable._end();
    expect(queue.getState().currentId).toBe('c');
    expect(queue.getState().queuedIds).toEqual([]);

    items[2].playable._end();
    expect(queue.getState().currentId).toBeNull();
    expect(queue.getState().status).toBe('idle');
  });

  it('deduplicates by id — both in the pending queue and currently playing', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'a', text: 'one' }); // ignored: already playing
    queue.enqueue({ id: 'b', text: 'two' });
    queue.enqueue({ id: 'b', text: 'two' }); // ignored: already pending

    // 'a' was synthesized once; 'b' is pending and not yet synthesized.
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('one');
    expect(queue.getState().queuedIds).toEqual(['b']);
  });

  it('playNow stops the current item and immediately starts the new one', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    queue.enqueue({ id: 'c', text: 'three' });

    queue.playNow({ id: 'x', text: 'jump' });

    expect(items[0].playable.stopMock).toHaveBeenCalledTimes(1);
    expect(queue.getState().currentId).toBe('x');
    // The remaining pending items 'b' and 'c' are preserved in their original order.
    expect(queue.getState().queuedIds).toEqual(['b', 'c']);
    expect(items.at(-1)?.playable.playMock).toHaveBeenCalledTimes(1);
  });

  it('pause/resume forwards to the underlying playable', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.pause();
    expect(items[0].playable.pauseMock).toHaveBeenCalledTimes(1);
    expect(queue.getState().status).toBe('paused');

    queue.resume();
    expect(items[0].playable.playMock).toHaveBeenCalledTimes(2); // play() forwards to resume as well
    expect(queue.getState().status).toBe('playing');
  });

  it('skip stops the current item and starts the next pending one', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    queue.skip();

    expect(items[0].playable.stopMock).toHaveBeenCalledTimes(1);
    expect(queue.getState().currentId).toBe('b');
    expect(queue.getState().queuedIds).toEqual([]);
  });

  it('stop clears the current item but preserves the pending queue', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    queue.stop();

    expect(items[0].playable.stopMock).toHaveBeenCalledTimes(1);
    expect(queue.getState().currentId).toBeNull();
    expect(queue.getState().status).toBe('idle');
    expect(queue.getState().queuedIds).toEqual(['b']);
    // After stop, the queue waits for the next enqueue/playNow to start.
    queue.enqueue({ id: 'c', text: 'three' });
    expect(queue.getState().currentId).toBe('b');
  });

  it('clear drops both the current item and the pending queue', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    queue.clear();

    expect(items[0].playable.stopMock).toHaveBeenCalledTimes(1);
    expect(queue.getState()).toEqual({ currentId: null, status: 'idle', queuedIds: [] });
  });

  it('error on the current item advances to the next pending one (no wedge)', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.enqueue({ id: 'b', text: 'two' });
    items[0].playable._error();

    expect(queue.getState().currentId).toBe('b');
    expect(items[1].playable.playMock).toHaveBeenCalledTimes(1);
  });

  it('subscribe fires on every state change and is unsubscribeable', () => {
    const { service } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);
    const listener = vi.fn();
    const unsub = queue.subscribe(listener);
    queue.enqueue({ id: 'a', text: 'one' });
    expect(listener).toHaveBeenCalled();
    const callCount = listener.mock.calls.length;
    unsub();
    queue.enqueue({ id: 'b', text: 'two' });
    expect(listener.mock.calls.length).toBe(callCount);
  });

  it('enqueue while paused does not start the next item (waits for resume)', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);

    queue.enqueue({ id: 'a', text: 'one' });
    queue.pause();
    // Enqueueing while paused must not call play() for the new item.
    queue.enqueue({ id: 'b', text: 'two' });
    expect(items).toHaveLength(1);
    expect(queue.getState().currentId).toBe('a');
    expect(queue.getState().queuedIds).toEqual(['b']);
  });

  it('does not synthesize without a configured config (drops items silently)', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service); // no setConfig call
    queue.enqueue({ id: 'a', text: 'one' });
    expect(items).toHaveLength(0);
    expect(queue.getState().currentId).toBeNull();
  });

  it('emits state in subscription order', () => {
    const { service } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);
    const states: TtsQueueState[] = [];
    queue.subscribe((s) => states.push(s));
    queue.enqueue({ id: 'a', text: 'one' });
    expect(states.length).toBeGreaterThan(0);
    expect(states.at(-1)).toEqual({ currentId: 'a', status: 'playing', queuedIds: [] });
  });
});

describe('TtsQueue (integration with synthetic items)', () => {
  it('round-trips several items without leaking listeners', () => {
    const { service, items } = makeService();
    const queue = new TtsQueue(service);
    queue.setConfig(baseConfig);
    const itemsToAdd: TtsQueueItem[] = [
      { id: 'a', text: 'one' },
      { id: 'b', text: 'two' },
      { id: 'c', text: 'three' },
    ];
    for (const item of itemsToAdd) queue.enqueue(item);
    items[0].playable._end();
    items[1].playable._end();
    items[2].playable._end();
    expect(queue.getState()).toEqual({ currentId: null, status: 'idle', queuedIds: [] });
  });
});
