/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';

const startWebHost = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/app'),
    getPath: vi.fn(() => '/data'),
    getVersion: vi.fn(() => 'test'),
    isPackaged: true,
  },
}));

vi.mock('@aionui/web-host', () => ({ startWebHost }));
vi.mock('@/common/adapter/httpBridge', () => ({ httpRequest: vi.fn() }));
vi.mock('@/process/utils/initStorage', () => ({
  getSystemDir: vi.fn(() => ({ cacheDir: '/cache', logDir: '/logs', workDir: '/work' })),
}));
vi.mock('@/process/utils/utils', () => ({ getDataPath: vi.fn(() => '/data') }));

import { startDesktopWebUI } from '@/process/utils/webuiConfig';

describe('desktop WebUI network boundary', () => {
  it('keeps browser hosting in the authenticated standalone or Docker runtime', async () => {
    await expect(startDesktopWebUI({ port: 25808, allowRemote: false })).rejects.toThrow(
      'Browser hosting requires the authenticated standalone WebUI or Docker deployment'
    );

    expect(startWebHost).not.toHaveBeenCalled();
  });
});
