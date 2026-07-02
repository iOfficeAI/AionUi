/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { httpRequestMock } = vi.hoisted(() => ({
  httpRequestMock: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

import {
  getClientBusinessSetting,
  removeClientBusinessSetting,
  setClientBusinessSetting,
} from '@/renderer/services/clientBusinessSettings';

describe('clientBusinessSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads a business setting from backend client settings', async () => {
    httpRequestMock.mockResolvedValue({
      'tools.imageGenerationModel': { id: 'provider-1', use_model: 'gpt-image-1' },
    });

    const result = await getClientBusinessSetting('tools.imageGenerationModel');

    expect(httpRequestMock).toHaveBeenCalledWith('GET', '/api/settings/client?keys=tools.imageGenerationModel');
    expect(result).toEqual({ id: 'provider-1', use_model: 'gpt-image-1' });
  });

  it('writes a business setting to backend client settings', async () => {
    httpRequestMock.mockResolvedValue(undefined);

    await setClientBusinessSetting('tools.imageGenerationModel', {
      id: 'provider-1',
      name: 'Provider',
      platform: 'openai',
      base_url: '',
      api_key: '',
      use_model: 'gpt-image-1',
      switch: true,
    });

    expect(httpRequestMock).toHaveBeenCalledWith('PUT', '/api/settings/client', {
      'tools.imageGenerationModel': {
        id: 'provider-1',
        name: 'Provider',
        platform: 'openai',
        base_url: '',
        api_key: '',
        use_model: 'gpt-image-1',
        switch: true,
      },
    });
  });

  it('removes a business setting from backend client settings', async () => {
    httpRequestMock.mockResolvedValue(undefined);

    await removeClientBusinessSetting('tools.imageGenerationModel');

    expect(httpRequestMock).toHaveBeenCalledWith('PUT', '/api/settings/client', {
      'tools.imageGenerationModel': null,
    });
  });
});
