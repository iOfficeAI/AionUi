/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferenceMocks = vi.hoisted(() => ({
  getLocal: vi.fn(),
  httpRequest: vi.fn(),
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/adapter/httpBridge')>()),
  httpRequest: preferenceMocks.httpRequest,
}));

vi.mock('@process/utils/initStorage', () => ({
  ProcessConfig: { get: preferenceMocks.getLocal },
}));

import { readStoredLanguage } from '@/process/services/i18n/languagePreference';

describe('main-process language preference', () => {
  beforeEach(() => {
    preferenceMocks.getLocal.mockReset();
    preferenceMocks.httpRequest.mockReset();
  });

  it('uses the current backend language for native menus', async () => {
    preferenceMocks.httpRequest.mockResolvedValue({ language: 'zh-CN' });

    await expect(readStoredLanguage()).resolves.toBe('zh-CN');
    expect(preferenceMocks.getLocal).not.toHaveBeenCalled();
  });

  it('falls back to the legacy local language when backend preferences are unavailable', async () => {
    preferenceMocks.httpRequest.mockRejectedValue(new Error('backend unavailable'));
    preferenceMocks.getLocal.mockResolvedValue('zh-TW');

    await expect(readStoredLanguage()).resolves.toBe('zh-TW');
  });
});
