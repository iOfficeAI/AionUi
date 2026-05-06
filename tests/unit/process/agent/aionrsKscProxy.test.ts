/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TProviderWithModel } from '@/common/config/storage';

const ensureLocalWebServerRunning = vi.fn();

vi.mock('@process/bridge/webuiBridge', () => ({
  ensureLocalWebServerRunning,
}));

describe('aionrs KSC proxy helpers', () => {
  beforeEach(() => {
    ensureLocalWebServerRunning.mockReset();
  });

  it('detects KSC proxy base URLs', async () => {
    const { isKscProxyBaseUrl } = await import('@process/agent/aionrs/kscProxy');

    expect(isKscProxyBaseUrl('http://127.0.0.1:25808/api/ksc-proxy/ksc%3Aid/v1')).toBe(true);
    expect(isKscProxyBaseUrl('https://example.com/v1')).toBe(false);
    expect(isKscProxyBaseUrl('not a url')).toBe(false);
  });

  it('rewrites KSC proxy URLs to the active loopback WebUI port', async () => {
    const { rewriteKscProxyBaseUrlPort } = await import('@process/agent/aionrs/kscProxy');

    expect(rewriteKscProxyBaseUrlPort('http://localhost:25808/api/ksc-proxy/ksc%3Aid/v1', 25810)).toBe(
      'http://127.0.0.1:25810/api/ksc-proxy/ksc%3Aid/v1'
    );
  });

  it('starts the local proxy server and returns a model with the active port', async () => {
    ensureLocalWebServerRunning.mockResolvedValue({ port: 25810 });
    const { ensureKscProxyModel } = await import('@process/agent/aionrs/kscProxy');
    const model = {
      id: 'ksc:id',
      name: 'KSC',
      platform: 'custom',
      baseUrl: 'http://127.0.0.1:25808/api/ksc-proxy/ksc%3Aid/v1',
      apiKey: 'sk',
      useModel: 'm',
    } as TProviderWithModel;

    const result = await ensureKscProxyModel(model);

    expect(ensureLocalWebServerRunning).toHaveBeenCalledWith(25808);
    expect(result.baseUrl).toBe('http://127.0.0.1:25810/api/ksc-proxy/ksc%3Aid/v1');
  });

  it('leaves non-KSC models unchanged', async () => {
    const { ensureKscProxyModel } = await import('@process/agent/aionrs/kscProxy');
    const model = {
      id: 'openai',
      name: 'OpenAI',
      platform: 'custom',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk',
      useModel: 'm',
    } as TProviderWithModel;

    const result = await ensureKscProxyModel(model);

    expect(ensureLocalWebServerRunning).not.toHaveBeenCalled();
    expect(result).toBe(model);
  });
});
