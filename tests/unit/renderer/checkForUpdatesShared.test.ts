/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { autoCheck, manualCheck } = vi.hoisted(() => ({ autoCheck: vi.fn(), manualCheck: vi.fn() }));

vi.mock('@/common', () => ({
  ipcBridge: {
    autoUpdate: { check: { invoke: autoCheck } },
    update: { check: { invoke: manualCheck } },
  },
}));

import { runUpdateCheck } from '@/renderer/components/settings/checkForUpdatesShared';

const opts = { includePrerelease: false, fallbackVersion: '0.0.0', checkFailedLabel: 'failed' };

describe('runUpdateCheck downgrade guard', () => {
  beforeEach(() => {
    autoCheck.mockReset();
    manualCheck.mockReset();
  });

  it('does not offer an older auto-update version as available', async () => {
    // Installed 2.1.54, auto-updater reports an older 2.1.53 feed version.
    autoCheck.mockResolvedValue({ success: true, data: { updateInfo: { version: '2.1.53' } } });
    manualCheck.mockResolvedValue({
      success: true,
      data: { currentVersion: '2.1.54', updateAvailable: false, latest: { version: '2.1.53', htmlUrl: '' } },
    });

    const outcome = await runUpdateCheck(opts);

    expect(outcome.kind).toBe('upToDate');
  });

  it('does not offer an older manual version even when updateAvailable is true', async () => {
    // Defense-in-depth: backend flag says available but version is a downgrade.
    autoCheck.mockResolvedValue({ success: true, data: {} });
    manualCheck.mockResolvedValue({
      success: true,
      data: { currentVersion: '2.1.54', updateAvailable: true, latest: { version: '2.1.53', htmlUrl: '' } },
    });

    const outcome = await runUpdateCheck(opts);

    expect(outcome.kind).toBe('upToDate');
  });

  it('offers a strictly newer version as available', async () => {
    autoCheck.mockResolvedValue({ success: true, data: { updateInfo: { version: '2.1.55' } } });
    manualCheck.mockResolvedValue({
      success: true,
      data: { currentVersion: '2.1.54', updateAvailable: true, latest: { version: '2.1.55', htmlUrl: 'https://x' } },
    });

    const outcome = await runUpdateCheck(opts);

    expect(outcome.kind).toBe('available');
    if (outcome.kind === 'available') {
      expect(outcome.autoUpdateAvailable).toBe(true);
      expect(outcome.updateInfo?.version).toBe('2.1.55');
    }
  });
});
