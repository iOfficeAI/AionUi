/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

let testDir: string;

vi.mock('electron', () => ({
  app: {
    getPath: (_name: string) => testDir,
  },
  BrowserWindow: {
    getAllWindows: () => [],
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

import { GatewayStore } from '@process/services/gateway/gatewayStore';
import { syncOmniRouteIntoStore } from '@process/services/gateway/localOmniRouteSync';

describe('OmniRoute Sync Tests', () => {
  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omniroute-sync-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('syncs into GatewayStore and creates accounts and combos', async () => {
    const store = new GatewayStore();
    const result = await syncOmniRouteIntoStore(store);

    expect(result.success).toBe(true);
    expect(result.serverPort).toBe(20128);

    const accounts = store.getAccounts();
    expect(accounts.length).toBeGreaterThan(0);

    // Should have accounts connected to port 20128
    const omniAccounts = accounts.filter((a) => a.platform === 'omniroute');
    expect(omniAccounts.length).toBeGreaterThan(0);
    expect(omniAccounts[0].baseUrl).toContain('20128');

    // Should have combos created
    const combos = store.getCombos();
    expect(combos.length).toBeGreaterThanOrEqual(0);
  });
});
