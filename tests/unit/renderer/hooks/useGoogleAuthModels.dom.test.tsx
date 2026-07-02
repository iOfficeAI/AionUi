/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

const { getClientBusinessSettingMock, googleAuthStatusMock, googleSubscriptionStatusMock, configServiceMock } =
  vi.hoisted(() => ({
    getClientBusinessSettingMock: vi.fn(),
    googleAuthStatusMock: vi.fn(),
    googleSubscriptionStatusMock: vi.fn(),
    configServiceMock: {
      get: vi.fn(),
    },
  }));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: getClientBusinessSettingMock,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    googleAuth: {
      status: {
        invoke: googleAuthStatusMock,
      },
    },
    google: {
      subscriptionStatus: {
        invoke: googleSubscriptionStatusMock,
      },
    },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';

const createWrapper = () => {
  const cache = new Map();
  return ({ children }: { children: React.ReactNode }) => (
    <SWRConfig value={{ provider: () => cache }}>{children}</SWRConfig>
  );
};

describe('useGoogleAuthModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configServiceMock.get.mockImplementation(() => {
      throw new Error('configService should not be used for google business settings');
    });
    getClientBusinessSettingMock.mockResolvedValue({ proxy: 'http://proxy.local' });
    googleAuthStatusMock.mockResolvedValue({ success: true });
    googleSubscriptionStatusMock.mockResolvedValue({
      isSubscriber: true,
      tier: 'pro',
      lastChecked: 123,
    });
  });

  it('reads google config from backend client settings instead of configService', async () => {
    const { result } = renderHook(() => useGoogleAuthModels(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isGoogleAuth).toBe(true);
      expect(result.current.subscriptionStatus).toEqual({
        isSubscriber: true,
        tier: 'pro',
        lastChecked: 123,
      });
    });

    expect(getClientBusinessSettingMock).toHaveBeenCalledWith('google.config');
    expect(googleAuthStatusMock).toHaveBeenCalledWith({ proxy: 'http://proxy.local' });
    expect(googleSubscriptionStatusMock).toHaveBeenCalledWith({ proxy: 'http://proxy.local' });
    expect(configServiceMock.get).not.toHaveBeenCalled();
  });
});
