import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatMessageTime } from '@renderer/pages/conversation/Messages/components/MessagetText';

describe('formatMessageTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns HH:mm for today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 15, 0, 0)); // 2026-03-31 15:00

    const timestamp = new Date(2026, 2, 31, 9, 5, 0).getTime();
    expect(formatMessageTime(timestamp)).toBe('09:05');
  });

  it('returns MM-DD HH:mm for a different day in the same month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 15, 0, 0)); // 2026-03-31

    const timestamp = new Date(2026, 2, 29, 14, 30, 0).getTime(); // 2026-03-29
    expect(formatMessageTime(timestamp)).toBe('03-29 14:30');
  });

  it('returns MM-DD HH:mm for a different month', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 15, 0, 0)); // 2026-03-31

    const timestamp = new Date(2026, 0, 5, 8, 0, 0).getTime(); // 2026-01-05
    expect(formatMessageTime(timestamp)).toBe('01-05 08:00');
  });

  it('returns MM-DD HH:mm for a different year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 0)); // 2026-01-01

    const timestamp = new Date(2025, 11, 31, 23, 59, 0).getTime(); // 2025-12-31
    expect(formatMessageTime(timestamp)).toBe('12-31 23:59');
  });

  it('pads single-digit hours and minutes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 12, 0, 0)); // 2026-06-15

    const timestamp = new Date(2026, 5, 15, 3, 7, 0).getTime(); // same day, 03:07
    expect(formatMessageTime(timestamp)).toBe('03:07');
  });

  it('handles midnight correctly', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 2, 31, 10, 0, 0));

    const timestamp = new Date(2026, 2, 31, 0, 0, 0).getTime(); // midnight today
    expect(formatMessageTime(timestamp)).toBe('00:00');
  });
});
