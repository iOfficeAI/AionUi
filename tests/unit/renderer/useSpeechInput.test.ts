import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendSpeechTranscript,
  getSpeechInputAvailabilityForEnvironment,
  pickRecordingMimeType,
} from '@/renderer/hooks/system/useSpeechInput';

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
    vi.unstubAllGlobals();
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
