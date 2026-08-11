/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { shouldShowFromTray } from '@/process/utils/tray';
import { readCloseToTraySetting } from '@/process/utils/closeToTraySetting';

const settingMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  httpRequest: vi.fn(),
}));

vi.mock('@/process/utils/initStorage', () => ({
  ProcessConfig: {
    get: settingMocks.get,
    set: settingMocks.set,
  },
}));

vi.mock('@/common/adapter/httpBridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/common/adapter/httpBridge')>()),
  httpRequest: settingMocks.httpRequest,
}));

describe('shouldShowFromTray', () => {
  it('shows when window is not visible', () => {
    expect(shouldShowFromTray(false, false)).toBe(true);
  });

  it('shows when window is minimized', () => {
    expect(shouldShowFromTray(true, true)).toBe(true);
  });

  it('hides when window is visible and not minimized', () => {
    expect(shouldShowFromTray(true, false)).toBe(false);
  });
});

describe('close-to-tray default', () => {
  beforeEach(() => {
    settingMocks.get.mockReset();
    settingMocks.set.mockReset();
    settingMocks.httpRequest.mockReset();
  });

  it('defaults to enabled when no local or backend preference exists', async () => {
    settingMocks.get.mockResolvedValue(undefined);
    settingMocks.httpRequest.mockResolvedValue({});

    await expect(readCloseToTraySetting()).resolves.toBe(true);
  });

  it('keeps an explicit disabled preference', async () => {
    settingMocks.get.mockResolvedValue(false);

    await expect(readCloseToTraySetting()).resolves.toBe(false);
    expect(settingMocks.httpRequest).not.toHaveBeenCalled();
  });

  it('keeps the enabled default when backend preference loading fails', async () => {
    settingMocks.get.mockResolvedValue(undefined);
    settingMocks.httpRequest.mockRejectedValue(new Error('backend unavailable'));

    await expect(readCloseToTraySetting()).resolves.toBe(true);
  });
});

describe('tray menu language at startup', () => {
  it('initializes native translations before creating the tray menu', () => {
    const source = readFileSync(resolve(__dirname, '../../../packages/desktop/src/index.ts'), 'utf8');
    const initializeLanguageIndex = source.indexOf('await setInitialLanguage(savedLanguage)');
    const createTrayIndex = source.indexOf('createOrUpdateTray();', initializeLanguageIndex);

    expect(initializeLanguageIndex).toBeGreaterThan(-1);
    expect(createTrayIndex).toBeGreaterThan(initializeLanguageIndex);
  });
});
