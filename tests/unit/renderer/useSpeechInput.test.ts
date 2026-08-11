// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendSpeechTranscript,
  getSpeechInputAvailabilityForEnvironment,
  pickRecordingMimeType,
  useSpeechInput,
} from '@/renderer/hooks/system/useSpeechInput';

const mockTranscribeAudioBlob = vi.fn();

vi.mock('@/renderer/services/SpeechToTextService', () => ({
  transcribeAudioBlob: (...args: unknown[]) => mockTranscribeAudioBlob(...args),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => false,
}));

const installRecordingEnvironment = ({ getUserMedia }: { getUserMedia: () => Promise<MediaStream> }) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia,
    },
  });

  class MockMediaRecorder {
    static isTypeSupported(mimeType: string) {
      return mimeType === 'audio/webm';
    }

    public mimeType: string;
    public ondataavailable: ((event: { data: Blob }) => void) | null = null;
    public onerror: (() => void) | null = null;
    public onstop: (() => void) | null = null;
    public state = 'inactive';

    constructor(_stream: MediaStream, options?: { mimeType?: string }) {
      this.mimeType = options?.mimeType ?? 'audio/webm';
    }

    start() {
      this.state = 'recording';
    }

    stop() {
      this.state = 'inactive';
      this.ondataavailable?.({
        data: new Blob(['recorded-audio'], { type: this.mimeType }),
      });
      this.onstop?.();
    }
  }

  vi.stubGlobal('MediaRecorder', MockMediaRecorder);
};

describe('appendSpeechTranscript', () => {
  it('appends trimmed speech text on a new line when base content exists', () => {
    expect(appendSpeechTranscript('hello', '  world  ')).toBe('hello\nworld');
  });

  it('ignores empty speech text', () => {
    expect(appendSpeechTranscript('hello', '   ')).toBe('hello');
  });
});

describe('getSpeechInputAvailabilityForEnvironment', () => {
  it('returns record when recording APIs are available in a secure context', () => {
    expect(
      getSpeechInputAvailabilityForEnvironment({
        hasFileInput: true,
        hasMediaDevices: true,
        hasMediaRecorder: true,
        hostname: 'example.com',
        isElectronDesktop: false,
        isSecureContext: true,
      })
    ).toBe('record');
  });

  it('falls back to file when live recording is unavailable', () => {
    expect(
      getSpeechInputAvailabilityForEnvironment({
        hasFileInput: true,
        hasMediaDevices: false,
        hasMediaRecorder: false,
        hostname: 'example.com',
        isElectronDesktop: false,
        isSecureContext: false,
      })
    ).toBe('file');
  });
});

describe('pickRecordingMimeType', () => {
  afterEach(() => {
    mockTranscribeAudioBlob.mockReset();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns the first supported recording mime type', () => {
    vi.stubGlobal('MediaRecorder', {
      isTypeSupported: vi.fn((mimeType: string) => mimeType === 'audio/webm'),
    });

    expect(pickRecordingMimeType()).toBe('audio/webm');
  });

  it('returns an empty string when MediaRecorder is unavailable', () => {
    vi.stubGlobal('MediaRecorder', undefined);

    expect(pickRecordingMimeType()).toBe('');
  });
});

describe('useSpeechInput', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in file mode when live recording APIs are unavailable', () => {
    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    expect(result.current.availability).toBe('file');
    expect(result.current.status).toBe('idle');
  });

  it('returns the transcript and clears transient error state after a successful file transcription', async () => {
    const onTranscript = vi.fn();
    mockTranscribeAudioBlob.mockResolvedValueOnce({ text: 'hello from speech' });

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript,
      })
    );

    await act(async () => {
      await result.current.transcribeFile(new Blob(['audio'], { type: 'audio/webm' }));
    });

    expect(onTranscript).toHaveBeenCalledWith('hello from speech');
    expect(result.current.status).toBe('idle');
    expect(result.current.errorCode).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('surfaces an empty transcript as a recoverable warning state', async () => {
    mockTranscribeAudioBlob.mockResolvedValueOnce({ text: '   ' });

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.transcribeFile(new Blob(['audio'], { type: 'audio/webm' }));
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('empty-transcript');
    expect(result.current.errorMessage).toBeNull();
  });

  it('extracts a concrete provider message when transcription requests fail', async () => {
    mockTranscribeAudioBlob.mockRejectedValueOnce(new Error('STT_REQUEST_FAILED: model overloaded'));

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.transcribeFile(new Blob(['audio'], { type: 'audio/webm' }));
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('transcription-failed');
    expect(result.current.errorMessage).toBe('model overloaded');

    act(() => {
      result.current.clearError();
    });

    expect(result.current.status).toBe('idle');
    expect(result.current.errorCode).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('keeps the detailed error empty for generic transcription failures', async () => {
    mockTranscribeAudioBlob.mockRejectedValueOnce(new Error('STT_NETWORK_ERROR'));

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.transcribeFile(new Blob(['audio'], { type: 'audio/webm' }));
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorCode).toBe('network');
    expect(result.current.errorMessage).toBeNull();
  });

  it('reports recording unsupported when recording is requested without live capture support', async () => {
    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.errorCode).toBe('recording-unsupported');
    expect(result.current.errorMessage).toBeNull();
  });

  it('records audio and transcribes it when live recording is available', async () => {
    vi.useFakeTimers();
    const stopTrack = vi.fn();
    const onTranscript = vi.fn();
    mockTranscribeAudioBlob.mockResolvedValueOnce({ text: 'recorded result' });
    installRecordingEnvironment({
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: stopTrack }],
      })) as unknown as () => Promise<MediaStream>,
    });

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript,
      })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(result.current.availability).toBe('record');
    expect(result.current.status).toBe('recording');
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(result.current.recordingDurationMs).toBeGreaterThan(0);
    expect(result.current.recordingLevels).toHaveLength(40);

    await act(async () => {
      result.current.stopRecording();
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(onTranscript).toHaveBeenCalledWith('recorded result');
    expect(result.current.status).toBe('idle');
    expect(result.current.errorMessage).toBeNull();
    expect(stopTrack).toHaveBeenCalled();
  });

  it('maps recording permission failures without exposing a stale detail message', async () => {
    installRecordingEnvironment({
      getUserMedia: vi.fn(async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      }) as unknown as () => Promise<MediaStream>,
    });

    const { result } = renderHook(() =>
      useSpeechInput({
        locale: 'en-US',
        onTranscript: vi.fn(),
      })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.errorCode).toBe('permission-denied');
    expect(result.current.errorMessage).toBeNull();
  });
});
