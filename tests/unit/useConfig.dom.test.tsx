import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const cache = new Map<string, unknown>();
const subs = new Map<string, Set<(v: unknown) => void>>();

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn((key: string) => cache.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      cache.set(key, value);
      subs.get(key)?.forEach((cb) => cb(value));
    }),
    subscribe: vi.fn((key: string, cb: (v: unknown) => void) => {
      if (!subs.has(key)) subs.set(key, new Set());
      subs.get(key)!.add(cb);
      return () => {
        subs.get(key)?.delete(cb);
      };
    }),
  },
}));

const { useConfig } = await import('@renderer/hooks/config/useConfig');

describe('useConfig', () => {
  beforeEach(() => {
    cache.clear();
    subs.clear();
  });

  it('should return current value and setter', () => {
    const { result } = renderHook(() => useConfig('theme'));
    expect(result.current[0]).toBeUndefined();
    expect(typeof result.current[1]).toBe('function');
  });

  it('should return existing cached value', () => {
    cache.set('language', 'zh-CN');
    const { result } = renderHook(() => useConfig('language'));
    expect(result.current[0]).toBe('zh-CN');
  });

  it('should update when value changes via setter', async () => {
    const { result } = renderHook(() => useConfig('theme'));
    await act(async () => {
      await result.current[1]('dark');
    });
    expect(result.current[0]).toBe('dark');
  });

  it('should update when value changes externally', () => {
    const { result } = renderHook(() => useConfig('colorScheme'));
    act(() => {
      cache.set('colorScheme', 'dark');
      subs.get('colorScheme')?.forEach((cb) => cb('dark'));
    });
    expect(result.current[0]).toBe('dark');
  });
});
