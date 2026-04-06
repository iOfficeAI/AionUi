import { describe, it, expect } from 'vitest';
import { classifyHealthCheckMessage } from '@/renderer/components/settings/SettingsModal/contents/healthCheckUtils';

describe('classifyHealthCheckMessage', () => {
  it('skips request_trace (metadata emitted before API call)', () => {
    expect(classifyHealthCheckMessage('request_trace')).toBe('skip');
  });

  it('skips start (stream creation, not an API response)', () => {
    expect(classifyHealthCheckMessage('start')).toBe('skip');
  });

  it('returns error for error events', () => {
    expect(classifyHealthCheckMessage('error')).toBe('error');
  });

  it('returns success for text content events', () => {
    expect(classifyHealthCheckMessage('text')).toBe('success');
  });

  it('returns success for any unknown event type (first real chunk)', () => {
    expect(classifyHealthCheckMessage('delta')).toBe('success');
    expect(classifyHealthCheckMessage('finish')).toBe('success');
    expect(classifyHealthCheckMessage('tool_call')).toBe('success');
  });
});
