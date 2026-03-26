import { describe, expect, it } from 'vitest';
import { parseNativeRecorderMessage } from '@/process/bridge/services/voice/MacNativeVoiceRecorder';

describe('parseNativeRecorderMessage', () => {
  it('should parse ready messages', () => {
    expect(parseNativeRecorderMessage('{"event":"ready"}')).toEqual({ event: 'ready' });
  });

  it('should parse result messages', () => {
    expect(parseNativeRecorderMessage('{"event":"result","pcmBase64":"YWJj","durationMs":1280,"bytes":4096}')).toEqual({
      bytes: 4096,
      durationMs: 1280,
      event: 'result',
      pcmBase64: 'YWJj',
    });
  });

  it('should reject malformed payloads', () => {
    expect(parseNativeRecorderMessage('{"event":"result","durationMs":"100"}')).toBeNull();
  });
});
