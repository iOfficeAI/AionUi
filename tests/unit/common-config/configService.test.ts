/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpRequestMock = vi.hoisted(() => vi.fn());

vi.mock('@/common/adapter/httpBridge', () => ({
  httpRequest: httpRequestMock,
}));

import { configService } from '@/common/config/configService';

describe('configService account transitions', () => {
  beforeEach(() => {
    configService.reset();
    httpRequestMock.mockReset();
  });

  it('preserves subscribers and publishes the next account config after reset', async () => {
    const values: unknown[] = [];
    const unsubscribe = configService.subscribe('language', (value) => values.push(value));

    httpRequestMock.mockResolvedValueOnce({ language: 'de-DE' });
    await configService.initialize();
    configService.reset();
    httpRequestMock.mockResolvedValueOnce({ language: 'fr-FR' });
    await configService.initialize();

    expect(values).toEqual(['de-DE', undefined, 'fr-FR']);
    expect(configService.get('language')).toBe('fr-FR');
    unsubscribe();
  });

  it('allows initialization to retry after a transient failure', async () => {
    httpRequestMock.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ language: 'en-US' });

    await expect(configService.initialize()).rejects.toThrow('offline');
    await expect(configService.initialize()).resolves.toBeUndefined();

    expect(configService.get('language')).toBe('en-US');
  });

  it('discards an old account response that resolves after reset', async () => {
    let resolveOldRequest: ((value: Record<string, unknown>) => void) | undefined;
    httpRequestMock.mockImplementationOnce(
      () =>
        new Promise<Record<string, unknown>>((resolve) => {
          resolveOldRequest = resolve;
        })
    );
    const oldInitialization = configService.initialize();

    configService.reset();
    httpRequestMock.mockResolvedValueOnce({ language: 'fr-FR' });
    await configService.initialize();
    resolveOldRequest?.({ language: 'de-DE' });
    await oldInitialization;

    expect(configService.get('language')).toBe('fr-FR');
  });
});
