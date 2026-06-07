import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// store must be defined at module scope BEFORE the mock factory so that
// hoisted vi.mock can capture it via closure without TDZ issues.
// We use a plain object to avoid the const TDZ trap.
const store: Map<string, unknown> = new Map();
vi.mock('@/common/config/configService', () => {
  // defer whenReady so the module-level fire doesn't race with store init
  const whenReady = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    configService: {
      whenReady,
      get: (k: string) => store.get(k),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
      }),
      subscribe: () => () => {},
    },
  };
});

import { useFontSizes } from '@renderer/hooks/ui/useFontSizes';
import { configService } from '@/common/config/configService';

describe('useFontSizes', () => {
  beforeEach(() => {
    store.clear();
    document.documentElement.removeAttribute('style');
    vi.clearAllMocks();
  });

  it('returns defaults when nothing persisted and applies them', async () => {
    const { result } = renderHook(() => useFontSizes());
    await waitFor(() => expect(result.current.fontSizes.chat).toBe(16));
    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('16px');
  });

  it('persists clamped value and updates CSS variable on setFontSize', async () => {
    const { result } = renderHook(() => useFontSizes());
    await waitFor(() => expect(result.current.fontSizes.chat).toBe(16));
    await act(async () => {
      await result.current.setFontSize('chat', 99);
    });
    expect(result.current.fontSizes.chat).toBe(22); // clamped to max
    expect(configService.set).toHaveBeenCalledWith('ui.fontSize.chat', 22);
    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('22px');
  });
});
