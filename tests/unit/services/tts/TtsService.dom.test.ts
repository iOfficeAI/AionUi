/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/services/tts/TtsService. We exercise both providers
 * (system / openai) using dependency injection so we don't need a real
 * `window.speechSynthesis` or `Audio` element.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TtsService, type TtsAudioElement, type TtsPlayable } from '@/renderer/services/tts/TtsService';
import type { TextToSpeechConfig } from '@/common/types/provider/speech';

// ---------------------------------------------------------------------------
// System provider (Web Speech API) tests
// ---------------------------------------------------------------------------

type FakeUtteranceInstance = {
  text: string;
  rate: number;
  voice: { name: string } | null;
  onend: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type FakeSynthesis = {
  speak: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
  speaking: boolean;
  paused: boolean;
};

const buildSystemHost = (voices: Array<{ name: string; lang?: string }> = []) => {
  const utterances: FakeUtteranceInstance[] = [];
  class FakeUtterance {
    text: string;
    rate = 1;
    voice: { name: string } | null = null;
    onend: ((event: Event) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;
    constructor(text: string) {
      this.text = text;
      utterances.push(this as unknown as FakeUtteranceInstance);
    }
  }
  const UtteranceCtor = vi.fn(FakeUtterance as unknown as new (text: string) => FakeUtteranceInstance);
  const synthesis: FakeSynthesis = {
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    getVoices: vi.fn(() => voices),
    speaking: false,
    paused: false,
  };
  return { synthesis, UtteranceCtor, utterances };
};

describe('TtsService — system provider', () => {
  it('builds an utterance with the configured text and default rate', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost();
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const config: TextToSpeechConfig = { enabled: true, provider: 'system' };

    const playable: TtsPlayable = service.synthesize('hello world', config);
    playable.play();

    expect(utterances).toHaveLength(1);
    expect(utterances[0].text).toBe('hello world');
    expect(utterances[0].rate).toBe(1);
    expect(synthesis.speak).toHaveBeenCalledWith(utterances[0]);
    expect(playable.state).toBe('playing');
  });

  it('applies the configured rate and resolves a matching voice by name', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost([{ name: 'Karen' }, { name: 'Daniel' }]);
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const config: TextToSpeechConfig = {
      enabled: true,
      provider: 'system',
      system: { voice: 'Karen', rate: 1.5 },
    };

    service.synthesize('hi', config).play();

    expect(utterances[0].rate).toBe(1.5);
    expect(utterances[0].voice).toEqual({ name: 'Karen' });
    expect(synthesis.speak).toHaveBeenCalledTimes(1);
  });

  it('falls back to no voice when the configured name is not found', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost([{ name: 'Daniel' }]);
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const config: TextToSpeechConfig = {
      enabled: true,
      provider: 'system',
      system: { voice: 'Nonexistent' },
    };

    service.synthesize('hi', config).play();

    expect(utterances[0].voice).toBeNull();
  });

  it('fires onEnd when the utterance ends naturally', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost();
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const onEnd = vi.fn();
    const playable = service.synthesize('hi', { enabled: true, provider: 'system' });
    playable.onEnd(onEnd);
    playable.play();
    expect(onEnd).not.toHaveBeenCalled();

    utterances[0].onend?.(new Event('end'));
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('stopped');
  });

  it('fires onError when the utterance reports an error', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost();
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const onError = vi.fn();
    const playable = service.synthesize('hi', { enabled: true, provider: 'system' });
    playable.onError(onError);
    playable.play();

    utterances[0].onerror?.(new Event('error'));
    expect(onError).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('errored');
  });

  it('pause and resume forward to the synthesis engine', () => {
    const { synthesis, UtteranceCtor, utterances } = buildSystemHost();
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const playable = service.synthesize('hi', { enabled: true, provider: 'system' });
    playable.play();
    playable.pause();
    expect(synthesis.pause).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('paused');

    playable.play();
    expect(synthesis.resume).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('playing');

    // Sanity: the previous utterance callback should be unaffected.
    utterances[0].onend?.(new Event('end'));
    expect(playable.state).toBe('stopped');
  });

  it('stop cancels the current utterance and marks state stopped', () => {
    const { synthesis, UtteranceCtor } = buildSystemHost();
    const service = new TtsService({
      speechHost: { speechSynthesis: synthesis, SpeechSynthesisUtterance: UtteranceCtor },
    });
    const playable = service.synthesize('hi', { enabled: true, provider: 'system' });
    playable.play();
    playable.stop();
    expect(synthesis.cancel).toHaveBeenCalled();
    expect(playable.state).toBe('stopped');
  });
});

// ---------------------------------------------------------------------------
// OpenAI provider tests
// ---------------------------------------------------------------------------

const makeAudioElement = (): TtsAudioElement & {
  _emitEnd: () => void;
  _emitError: () => void;
  listeners: Map<string, Set<() => void>>;
} => {
  const listeners = new Map<string, Set<() => void>>();
  const element = {
    src: '',
    paused: false,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: (type: 'ended' | 'error', listener: () => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: 'ended' | 'error', listener: () => void) => {
      listeners.get(type)?.delete(listener);
    },
    _emitEnd: () => {
      for (const cb of listeners.get('ended') ?? []) cb();
    },
    _emitError: () => {
      for (const cb of listeners.get('error') ?? []) cb();
    },
    listeners,
  };
  return element;
};

describe('TtsService — openai provider', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('decodes base64 audio into a Blob, creates an object URL, and plays via Audio', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => ({
      audio: Buffer.from('hello-audio').toString('base64'),
      mime: 'audio/mpeg',
    }));
    const objectURLFactory = vi.fn((_blob: Blob) => 'blob:mock/abc');
    const service = new TtsService({
      audioFactory: () => element,
      objectURLFactory,
      fetch: fetchImpl,
    });
    const config: TextToSpeechConfig = {
      enabled: true,
      provider: 'openai',
      openai: { model: 'tts-1', voice: 'alloy' },
    };

    const playable = service.synthesize('hi', config);
    playable.play();

    expect(fetchImpl).toHaveBeenCalledWith('hi', config);
    // Wait one microtask for the decode chain to complete.
    await vi.waitFor(() => expect(objectURLFactory).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(element.src).toBe('blob:mock/abc'));
    await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(1));
    expect(playable.state).toBe('playing');
  });

  it('fires onEnd when the audio element emits the "ended" event', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => ({ audio: Buffer.from('x').toString('base64'), mime: 'audio/mpeg' }));
    const service = new TtsService({
      audioFactory: () => element,
      objectURLFactory: () => 'blob:mock',
      fetch: fetchImpl,
    });
    const onEnd = vi.fn();
    const playable = service.synthesize('hi', { enabled: true, provider: 'openai' });
    playable.onEnd(onEnd);
    playable.play();
    await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(1));
    element._emitEnd();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('stopped');
  });

  it('fires onError when the audio element emits the "error" event', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => ({ audio: Buffer.from('x').toString('base64'), mime: 'audio/mpeg' }));
    const service = new TtsService({
      audioFactory: () => element,
      objectURLFactory: () => 'blob:mock',
      fetch: fetchImpl,
    });
    const onError = vi.fn();
    const playable = service.synthesize('hi', { enabled: true, provider: 'openai' });
    playable.onError(onError);
    playable.play();
    await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(1));
    element._emitError();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('errored');
  });

  it('pause forwards to the audio element and flips state to paused', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => ({ audio: Buffer.from('x').toString('base64'), mime: 'audio/mpeg' }));
    const service = new TtsService({
      audioFactory: () => element,
      objectURLFactory: () => 'blob:mock',
      fetch: fetchImpl,
    });
    const playable = service.synthesize('hi', { enabled: true, provider: 'openai' });
    playable.play();
    await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(1));
    playable.pause();
    expect(element.pause).toHaveBeenCalledTimes(1);
    expect(playable.state).toBe('paused');
  });

  it('treats fetch rejection as an error and fires onError', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => {
      throw new Error('boom');
    });
    const service = new TtsService({
      audioFactory: () => element,
      objectURLFactory: () => 'blob:mock',
      fetch: fetchImpl,
    });
    const onError = vi.fn();
    const playable = service.synthesize('hi', { enabled: true, provider: 'openai' });
    playable.onError(onError);
    playable.play();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(playable.state).toBe('errored');
  });

  it('stop pauses the audio element, revokes the object URL, and sets state stopped', async () => {
    const element = makeAudioElement();
    const fetchImpl = vi.fn(async () => ({ audio: Buffer.from('x').toString('base64'), mime: 'audio/mpeg' }));
    const objectURLFactory = vi.fn(() => 'blob:mock/stop');
    const revokeSpy = vi.fn();
    // Provide a URL.revokeObjectURL shim for the test environment.
    const prevRevoke = (URL as unknown as { revokeObjectURL?: (url: string) => void }).revokeObjectURL;
    (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = revokeSpy;
    try {
      const service = new TtsService({
        audioFactory: () => element,
        objectURLFactory,
        fetch: fetchImpl,
      });
      const playable = service.synthesize('hi', { enabled: true, provider: 'openai' });
      playable.play();
      await vi.waitFor(() => expect(element.play).toHaveBeenCalledTimes(1));
      playable.stop();
      expect(element.pause).toHaveBeenCalledTimes(1);
      expect(revokeSpy).toHaveBeenCalledWith('blob:mock/stop');
      expect(playable.state).toBe('stopped');
    } finally {
      if (prevRevoke) {
        (URL as unknown as { revokeObjectURL: (url: string) => void }).revokeObjectURL = prevRevoke;
      } else {
        delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
      }
    }
  });
});
