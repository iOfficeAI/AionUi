import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Theme } from '@/common/theme/types';

const { configGetMock, configSetMock, publishMock } = vi.hoisted(() => ({
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  publishMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: configGetMock,
    set: configSetMock,
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    theme: {
      setActive: { invoke: publishMock },
    },
  },
}));

vi.mock('@renderer/theme/builtinThemes', () => ({
  BUILTIN_THEMES: [
    { id: 'light', name: 'Light', appearance: 'light', builtin: true, created_at: 0, updated_at: 0 },
    { id: 'dark', name: 'Dark', appearance: 'dark', builtin: true, created_at: 0, updated_at: 0 },
  ] satisfies Theme[],
}));

import { setActiveTheme } from '@/renderer/utils/theme/applyTheme';

type BrowserWindow = Window & { electronAPI?: unknown };

describe('setActiveTheme', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configGetMock.mockReturnValue([]);
    configSetMock.mockResolvedValue(undefined);
    publishMock.mockResolvedValue(undefined);
    delete (window as BrowserWindow).electronAPI;
  });

  afterEach(() => {
    (window as BrowserWindow).electronAPI = {};
  });

  it('returns the selected theme in WebUI without invoking the Electron relay', async () => {
    const selected = await setActiveTheme('dark');

    expect(selected.appearance).toBe('dark');
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('publishes the selected theme when running inside Electron', async () => {
    (window as BrowserWindow).electronAPI = {};

    const selected = await setActiveTheme('dark');

    expect(publishMock).toHaveBeenCalledWith(selected);
  });

  it('rejects when the preference cannot be saved', async () => {
    configSetMock.mockRejectedValue(new Error('save failed'));

    await expect(setActiveTheme('dark')).rejects.toThrow('save failed');
    expect(publishMock).not.toHaveBeenCalled();
  });
});
