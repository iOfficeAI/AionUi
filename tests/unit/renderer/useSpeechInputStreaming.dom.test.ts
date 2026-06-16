/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Streaming orchestration tests for useSpeechInput: streaming happy path,
 * fallback to whole-blob /api/stt on stream errors, failure memory, and the
 * MediaRecorder-branch decisions (shouldTryStreaming=false / AudioWorklet
 * unavailable). The real MediaRecorder path is not driven under jsdom — the
 * branch is asserted at module-call level (getUserMedia attempted, stream
 * client untouched).
 */

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import type { SpeechStreamCallbacks, SpeechStreamHandle } from '@/renderer/services/speech/SpeechStreamClient';

const mocks = vi.hoisted(() => {
  class AudioWorkletUnavailableError extends Error {
    constructor() {
      super('AudioWorklet is not available in this environment');
      this.name = 'AudioWorkletUnavailableError';
    }
  }
  return {
    AudioWorkletUnavailableError,
    createPcmRecorder: vi.fn(),
    encodeWavPcm16: vi.fn(),
    getClientBusinessSetting: vi.fn(),
    rememberStreamUnsupported: vi.fn(),
    shouldTryStreaming: vi.fn(),
    startSpeechStream: vi.fn(),
    transcribeAudioBlob: vi.fn(),
  };
});

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: mocks.getClientBusinessSetting,
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/renderer/services/SpeechToTextService', () => ({
  transcribeAudioBlob: mocks.transcribeAudioBlob,
}));

vi.mock('@/renderer/services/speech/pcmRecorder', () => ({
  AudioWorkletUnavailableError: mocks.AudioWorkletUnavailableError,
  createPcmRecorder: mocks.createPcmRecorder,
  encodeWavPcm16: mocks.encodeWavPcm16,
  STREAM_SAMPLE_RATE: 24000,
}));

vi.mock('@/renderer/services/speech/SpeechStreamClient', () => ({
  startSpeechStream: mocks.startSpeechStream,
}));

vi.mock('@/renderer/services/speech/speechStreamPolicy', () => ({
  rememberStreamUnsupported: mocks.rememberStreamUnsupported,
  shouldTryStreaming: mocks.shouldTryStreaming,
}));

import { composeLiveTranscript, joinTranscriptSegments, useSpeechInput } from '@/renderer/hooks/system/useSpeechInput';

const makeConfig = (): SpeechToTextConfig => ({
  enabled: true,
  provider: 'openai',
  openai: { api_key: 'sk-test', base_url: '', language: '', model: 'gpt-4o-transcribe' },
});

const STREAM_PCM = new Uint8Array([1, 2, 3, 4, 5, 6]);

type RecorderFixture = {
  handle: { stream: MediaStream; stop: ReturnType<typeof vi.fn> };
  onChunk: (chunk: Uint8Array) => void;
};

/** Mock createPcmRecorder: capture onChunk and resolve with a fake handle. */
const installRecorderMock = (): RecorderFixture => {
  const fixture: RecorderFixture = {
    handle: {
      stream: { getTracks: () => [] } as unknown as MediaStream,
      stop: vi.fn(() => Promise.resolve({ pcm: STREAM_PCM, sampleRate: 24000 })),
    },
    onChunk: () => {
      throw new Error('createPcmRecorder was not called');
    },
  };
  mocks.createPcmRecorder.mockImplementation(async (options: { onChunk: (chunk: Uint8Array) => void }) => {
    fixture.onChunk = options.onChunk;
    return fixture.handle;
  });
  return fixture;
};

type StreamFixture = {
  handle: SpeechStreamHandle & { sendChunk: ReturnType<typeof vi.fn> };
  callbacks: () => SpeechStreamCallbacks;
};

/** Mock startSpeechStream: capture callbacks for manual firing. */
const installStreamMock = (): StreamFixture => {
  let callbacks: SpeechStreamCallbacks | null = null;
  const handle = { abort: vi.fn(), sendChunk: vi.fn(), stop: vi.fn() };
  mocks.startSpeechStream.mockImplementation((options: { callbacks: SpeechStreamCallbacks }) => {
    callbacks = options.callbacks;
    return handle;
  });
  return {
    handle,
    callbacks: () => {
      if (!callbacks) throw new Error('startSpeechStream was not called');
      return callbacks;
    },
  };
};

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  ondataavailable: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
  }
}

const getUserMedia = vi.fn();

const renderSpeechInput = () => {
  const onTranscript = vi.fn();
  const onLiveTranscript = vi.fn();
  const rendered = renderHook(() => useSpeechInput({ onLiveTranscript, onTranscript }));
  return { ...rendered, onLiveTranscript, onTranscript };
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom lacks media APIs: stub the minimum so availability === 'record'.
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia },
  });
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  mocks.getClientBusinessSetting.mockResolvedValue(makeConfig());
  mocks.shouldTryStreaming.mockReturnValue(true);
  mocks.transcribeAudioBlob.mockResolvedValue({ model: 'm', provider: 'openai', text: 'fallback text' });
  mocks.encodeWavPcm16.mockReturnValue(new Blob(['wav'], { type: 'audio/wav' }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('joinTranscriptSegments', () => {
  it('joins latin segments with a single space', () => {
    expect(joinTranscriptSegments(['hello there', 'how are you'])).toBe('hello there how are you');
  });

  it('joins CJK-adjacent segments directly', () => {
    expect(joinTranscriptSegments(['你好', '世界'])).toBe('你好世界');
  });

  it('joins directly when only one side of the boundary is CJK', () => {
    expect(joinTranscriptSegments(['我在用', 'AionUi'])).toBe('我在用AionUi');
    expect(joinTranscriptSegments(['open', '设置页'])).toBe('open设置页');
  });

  it('treats CJK punctuation as a CJK boundary', () => {
    expect(joinTranscriptSegments(['你好。', 'then'])).toBe('你好。then');
  });

  it('trims leading/trailing whitespace of each segment', () => {
    expect(joinTranscriptSegments(['  hello ', ' world  '])).toBe('hello world');
  });

  it('drops empty and whitespace-only segments', () => {
    expect(joinTranscriptSegments(['', 'a', '   ', 'b'])).toBe('a b');
    expect(joinTranscriptSegments([])).toBe('');
  });
});

describe('composeLiveTranscript', () => {
  it('joins finals as one continuous utterance', () => {
    expect(composeLiveTranscript(['a', 'b'], '')).toBe('a b');
    expect(composeLiveTranscript(['你好', '世界'], '')).toBe('你好世界');
  });

  it('returns the partial alone when there are no finals', () => {
    expect(composeLiveTranscript([], 'typing')).toBe('typing');
  });

  it('appends the partial after finals with the same boundary rule', () => {
    expect(composeLiveTranscript(['a', 'b'], 'c')).toBe('a b c');
    expect(composeLiveTranscript(['你好'], '世界')).toBe('你好世界');
  });

  it('returns an empty string when both are empty', () => {
    expect(composeLiveTranscript([], '')).toBe('');
  });
});

describe('useSpeechInput streaming orchestration', () => {
  it('runs the streaming happy path: chunks, live transcript, done', async () => {
    const recorder = installRecorderMock();
    const stream = installStreamMock();
    const { result, onLiveTranscript, onTranscript } = renderSpeechInput();

    expect(result.current.availability).toBe('record');

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.status).toBe('recording');
    expect(mocks.shouldTryStreaming).toHaveBeenCalledWith(makeConfig());
    // The configured STT language is the only language signal: the start frame
    // must NOT carry a UI-locale languageHint (auto-detect stays truly auto).
    expect(mocks.startSpeechStream).toHaveBeenCalledTimes(1);
    expect(mocks.startSpeechStream.mock.calls[0][0]).not.toHaveProperty('languageHint');

    // Recorder chunks are piped into the stream handle unchanged.
    const chunk = new Uint8Array([9, 8, 7]);
    act(() => {
      recorder.onChunk(chunk);
    });
    expect(stream.handle.sendChunk).toHaveBeenCalledWith(chunk);

    // Partial/final sequences compose the live transcript in order.
    act(() => stream.callbacks().onPartial('hel'));
    expect(onLiveTranscript).toHaveBeenLastCalledWith('hel');
    act(() => stream.callbacks().onFinal('final1'));
    expect(onLiveTranscript).toHaveBeenLastCalledWith('final1');
    act(() => stream.callbacks().onPartial('fin'));
    expect(onLiveTranscript).toHaveBeenLastCalledWith('final1 fin');
    act(() => stream.callbacks().onFinal('final2'));
    expect(onLiveTranscript).toHaveBeenLastCalledWith('final1 final2');

    act(() => {
      result.current.stopRecording();
    });
    expect(result.current.status).toBe('transcribing');
    expect(recorder.handle.stop).toHaveBeenCalled();
    expect(stream.handle.stop).toHaveBeenCalled();

    await act(async () => {
      stream.callbacks().onDone();
    });

    expect(onLiveTranscript).toHaveBeenLastCalledWith(null);
    expect(onTranscript).toHaveBeenCalledWith('final1 final2');
    // The live display is cleared before the terminal transcript is delivered.
    const clearOrder = onLiveTranscript.mock.invocationCallOrder.at(-1)!;
    expect(clearOrder).toBeLessThan(onTranscript.mock.invocationCallOrder[0]);
    expect(result.current.status).toBe('idle');
    expect(mocks.rememberStreamUnsupported).not.toHaveBeenCalled();
  });

  it('surfaces empty-transcript when the stream finishes without finals', async () => {
    installRecorderMock();
    const stream = installStreamMock();
    const { result, onLiveTranscript, onTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });
    act(() => {
      result.current.stopRecording();
    });
    await act(async () => {
      stream.callbacks().onDone();
    });

    expect(onLiveTranscript).toHaveBeenLastCalledWith(null);
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('empty-transcript');
  });

  it('keeps recording when streaming fails before ready, then batches the full PCM on stop', async () => {
    const recorder = installRecorderMock();
    const stream = installStreamMock();
    const { result, onTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });
    expect(result.current.status).toBe('recording');

    // Stream drops before `ready` with a non-UNSUPPORTED code (the real-world
    // faster-whisper case: a generic early close surfaces as INTERRUPTED). This
    // used to stop the recorder immediately and transcribe ~0.12s of silence →
    // "no speech detected" on every attempt.
    await act(async () => {
      stream.callbacks().onError('STT_STREAM_INTERRUPTED', 'closed before ready');
    });

    // The regression: the recorder must keep running so the whole utterance is
    // still captured; an ambiguous pre-ready code is not persisted.
    expect(recorder.handle.stop).not.toHaveBeenCalled();
    expect(result.current.status).toBe('recording');
    expect(mocks.rememberStreamUnsupported).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();

    // The deferred whole-blob fallback runs only once the user stops.
    await act(async () => {
      result.current.stopRecording();
    });
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('fallback text'));
    expect(recorder.handle.stop).toHaveBeenCalled();
    expect(mocks.encodeWavPcm16).toHaveBeenCalledWith(STREAM_PCM, 24000, 1);
    expect(result.current.status).toBe('idle');
  });

  it('remembers on STT_STREAM_UNSUPPORTED before ready, then batches the full recording on stop', async () => {
    const recorder = installRecorderMock();
    const stream = installStreamMock();
    const { result, onLiveTranscript, onTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });

    // Server explicitly rejects streaming before `ready`: remember the config so
    // future recordings skip straight to batch, but keep recording right now.
    await act(async () => {
      stream.callbacks().onError('STT_STREAM_UNSUPPORTED', 'streaming not supported');
    });
    expect(mocks.rememberStreamUnsupported).toHaveBeenCalledWith(makeConfig());
    expect(recorder.handle.stop).not.toHaveBeenCalled();
    expect(result.current.status).toBe('recording');
    expect(onTranscript).not.toHaveBeenCalled();

    await act(async () => {
      result.current.stopRecording();
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('fallback text'));
    expect(recorder.handle.stop).toHaveBeenCalled();
    expect(mocks.encodeWavPcm16).toHaveBeenCalledWith(STREAM_PCM, 24000, 1);
    // Fallback transcription carries no UI-locale language hint either.
    expect(mocks.transcribeAudioBlob).toHaveBeenCalledWith(mocks.encodeWavPcm16.mock.results[0].value);
    expect(result.current.status).toBe('idle');

    // The live display is cleared before the fallback transcription starts.
    expect(onLiveTranscript).toHaveBeenLastCalledWith(null);
    const clearOrder = onLiveTranscript.mock.invocationCallOrder.at(-1)!;
    expect(clearOrder).toBeLessThan(mocks.transcribeAudioBlob.mock.invocationCallOrder[0]);
  });

  it('falls back without remembering on STT_STREAM_INTERRUPTED mid-session', async () => {
    installRecorderMock();
    const stream = installStreamMock();
    const { result, onLiveTranscript, onTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });
    // The stream established (`ready`) before it dropped — a true mid-session
    // interruption, where replaying the captured PCM immediately is correct.
    act(() => stream.callbacks().onReady());
    act(() => stream.callbacks().onPartial('mid'));

    // Stream dies while still recording (no stopRecording call).
    await act(async () => {
      stream.callbacks().onError('STT_STREAM_INTERRUPTED', 'connection closed');
    });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('fallback text'));
    expect(mocks.rememberStreamUnsupported).not.toHaveBeenCalled();
    expect(mocks.encodeWavPcm16).toHaveBeenCalledWith(STREAM_PCM, 24000, 1);
    expect(onLiveTranscript).toHaveBeenLastCalledWith(null);
    expect(result.current.status).toBe('idle');
  });

  it('surfaces the error state when the fallback transcription also fails', async () => {
    installRecorderMock();
    const stream = installStreamMock();
    mocks.transcribeAudioBlob.mockRejectedValue(new Error('STT_NETWORK_ERROR'));
    const { result, onTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });
    // Mid-session drop (after `ready`) → immediate replay, which then fails.
    act(() => stream.callbacks().onReady());
    await act(async () => {
      stream.callbacks().onError('STT_STREAM_INTERRUPTED', 'connection closed');
    });

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.errorCode).toBe('network');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('uses the MediaRecorder path when shouldTryStreaming returns false', async () => {
    mocks.shouldTryStreaming.mockReturnValue(false);
    // The MediaRecorder branch starts at getUserMedia; reject so the session
    // ends at the hook's existing error mapping instead of driving the full
    // (jsdom-unsupported) recording flow.
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { result, onLiveTranscript } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mocks.shouldTryStreaming).toHaveBeenCalledWith(makeConfig());
    expect(mocks.createPcmRecorder).not.toHaveBeenCalled();
    expect(mocks.startSpeechStream).not.toHaveBeenCalled();
    expect(getUserMedia).toHaveBeenCalled();
    expect(onLiveTranscript).not.toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('permission-denied');
  });

  it('falls back to the MediaRecorder branch when AudioWorklet is unavailable, without remembering', async () => {
    mocks.createPcmRecorder.mockRejectedValue(new mocks.AudioWorkletUnavailableError());
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    const { result } = renderSpeechInput();

    await act(async () => {
      await result.current.startRecording();
    });

    expect(mocks.createPcmRecorder).toHaveBeenCalled();
    expect(mocks.startSpeechStream).not.toHaveBeenCalled();
    expect(mocks.rememberStreamUnsupported).not.toHaveBeenCalled();
    // The MediaRecorder branch was entered (its getUserMedia was attempted).
    expect(getUserMedia).toHaveBeenCalled();
    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('permission-denied');
  });
});
