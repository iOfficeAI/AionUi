import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: {
    getExtI18nForLocale: {
      invoke,
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
  }),
}));

import { useExtI18n } from '@/renderer/hooks/system/useExtI18n';

describe('useExtI18n', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('reads translations from the backend extension namespace without ext prefix', async () => {
    invoke.mockResolvedValue({
      hello: {
        extension: {
          settingsTabs: {
            settings: {
              name: 'Localized Settings',
            },
          },
        },
      },
    });

    const { result } = renderHook(() => useExtI18n());

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith({ locale: 'en-US' });
    });

    await waitFor(() => {
      expect(
        result.current.resolveExtTabName({
          id: 'ext-hello-settings',
          label: 'Fallback Settings',
          url: '/api/extensions/hello/assets/settings.html',
          order: 100,
          extensionName: 'hello',
        })
      ).toBe('Localized Settings');
    });
  });

  it('falls back to the backend label when no translation exists', async () => {
    invoke.mockResolvedValue({});

    const { result } = renderHook(() => useExtI18n());

    await waitFor(() => {
      expect(invoke).toHaveBeenCalled();
    });

    expect(
      result.current.resolveExtTabName({
        id: 'ext-hello-settings',
        label: 'Fallback Settings',
        url: '/api/extensions/hello/assets/settings.html',
        order: 100,
        extensionName: 'hello',
      })
    ).toBe('Fallback Settings');
  });
});
