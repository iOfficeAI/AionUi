import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@/common/theme/types';

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: { changed: { on: () => () => {} }, setActive: { invoke: vi.fn().mockResolvedValue(undefined) } },
  },
}));
vi.mock('@/renderer/utils/theme/systemThemeWatcher', () => ({ startSystemThemeWatcher: () => () => {} }));
vi.mock('@/renderer/utils/theme/systemAppearance', () => ({ getSystemPrefersDark: () => false }));

describe('theme recovery from backend settings', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('reapplies stored custom CSS after the first settings request fails and a retry succeeds', async () => {
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const custom: Theme = {
      id: 'custom',
      name: 'Custom',
      appearance: 'dark',
      builtin: false,
      css: 'body { --recovery-proof: 1; }',
      created_at: 0,
      updated_at: 0,
    };
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error('backend temporarily unavailable'));
    vi.stubGlobal('fetch', fetchMock);
    const { configService } = await import('@/common/config/configService');
    const { default: useTheme } = await import('@/renderer/hooks/system/useTheme');
    const { result } = renderHook(() => useTheme());
    await waitFor(() => expect(result.current[0]?.appearance).toBe('light'));
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { 'theme.activeId': 'custom', 'theme.userThemes': [custom] } }), {
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await act(async () => {
      await configService.initialize();
    });

    await waitFor(() => expect(result.current[0]?.id).toBe('custom'));
    expect(document.getElementById('theme-decoration')?.textContent).toContain('--recovery-proof');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
