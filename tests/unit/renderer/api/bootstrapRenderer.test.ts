/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { configInitializeMock, consoleErrorMock } = vi.hoisted(() => ({
  configInitializeMock: vi.fn(),
  consoleErrorMock: vi.fn(),
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    initialize: configInitializeMock,
  },
}));

describe('bootstrapRendererConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('waits for configService initialization to finish', async () => {
    configInitializeMock.mockResolvedValue(undefined);
    const { bootstrapRendererConfig } = await import('@/renderer/services/bootstrapRenderer');

    await bootstrapRendererConfig(consoleErrorMock);

    expect(configInitializeMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock).not.toHaveBeenCalled();
  });

  it('swallows initialization failures so app bootstrap can continue', async () => {
    const error = new Error('boom');
    configInitializeMock.mockRejectedValue(error);
    const { bootstrapRendererConfig } = await import('@/renderer/services/bootstrapRenderer');

    await expect(bootstrapRendererConfig(consoleErrorMock)).resolves.toBeUndefined();
    expect(consoleErrorMock).toHaveBeenCalledWith('Failed to initialize config:', error);
  });
});
