import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// store/subscribers must be defined at module scope BEFORE the mock factory so
// the hoisted vi.mock can capture them via closure without TDZ issues.
const store: Map<string, unknown> = new Map();
const subscribers: Map<string, Set<(value: unknown) => void>> = new Map();

// Real subscriber-registry mock mirroring configService: set() writes the store
// then synchronously notifies subscribers for that key (as the real service does
// before its await), so the hook's subscription is the single update path.
vi.mock('@/common/config/configService', () => {
  // defer whenReady so the module-level fire doesn't race with store init
  const whenReady = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return {
    configService: {
      whenReady,
      get: (k: string) => store.get(k),
      set: vi.fn(async (k: string, v: unknown) => {
        store.set(k, v);
        const subs = subscribers.get(k);
        if (subs) {
          for (const cb of subs) {
            cb(v);
          }
        }
      }),
      subscribe: (k: string, cb: (value: unknown) => void) => {
        if (!subscribers.has(k)) {
          subscribers.set(k, new Set());
        }
        subscribers.get(k)!.add(cb);
        return () => {
          subscribers.get(k)?.delete(cb);
        };
      },
    },
  };
});

import { useFontSizes } from '@renderer/hooks/ui/useFontSizes';
import { configService } from '@/common/config/configService';

describe('useFontSizes', () => {
  beforeEach(() => {
    store.clear();
    subscribers.clear();
    document.documentElement.removeAttribute('style');
    vi.clearAllMocks();
  });

  it('returns defaults when nothing persisted and applies them', async () => {
    const { result } = renderHook(() => useFontSizes());
    await waitFor(() => expect(result.current.fontSizes.chat).toBe(14));
    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('14px');
  });

  it('loads an out-of-range persisted value clamped and applies it', async () => {
    store.set('ui.fontSize.chat', 999);
    const { result } = renderHook(() => useFontSizes());
    await waitFor(() => expect(result.current.fontSizes.chat).toBe(22)); // clamped to max
    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('22px');
  });

  it('persists clamped value and updates CSS variable on setFontSize', async () => {
    const { result } = renderHook(() => useFontSizes());
    await waitFor(() => expect(result.current.fontSizes.chat).toBe(14));
    await act(async () => {
      await result.current.setFontSize('chat', 99);
    });
    expect(result.current.fontSizes.chat).toBe(22); // clamped to max
    expect(configService.set).toHaveBeenCalledWith('ui.fontSize.chat', 22);
    expect(document.documentElement.style.getPropertyValue('--chat-font-size')).toBe('22px');
  });
});
