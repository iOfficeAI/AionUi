/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests that HubStateManager.getExtensionListWithStatus() throttles
 * acpDetector.refreshBuiltinAgents() so opening the Agent Hub repeatedly
 * does not trigger an expensive PATH scan every time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mocks (must be defined before imports that load HubStateManager)
// ---------------------------------------------------------------------------

const mockRefreshBuiltinAgents = vi.hoisted(() => vi.fn(async () => {}));
const mockGetDetectedAgents = vi.hoisted(() => vi.fn(() => [] as Array<Record<string, unknown>>));

vi.mock('@process/agent/acp/AcpDetector', () => ({
  acpDetector: {
    refreshBuiltinAgents: mockRefreshBuiltinAgents,
    getDetectedAgents: mockGetDetectedAgents,
  },
}));

vi.mock('@process/extensions/ExtensionRegistry', () => ({
  ExtensionRegistry: {
    getInstance: () => ({
      getLoadedExtensions: () => [],
    }),
  },
}));

vi.mock('@process/extensions/lifecycle/statePersistence', () => ({
  loadPersistedStates: vi.fn(async () => new Map()),
  savePersistedStates: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    hub: {
      onStateChanged: { emit: vi.fn() },
    },
  },
}));

import { hubStateManager } from '../../src/process/extensions/hub/HubStateManager';

describe('HubStateManager.getExtensionListWithStatus throttling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the throttle by accessing the private field via cast
    (hubStateManager as unknown as { lastAgentRefreshAt: number }).lastAgentRefreshAt = 0;
  });

  it('refreshes builtin agents on first call', async () => {
    await hubStateManager.getExtensionListWithStatus({});
    expect(mockRefreshBuiltinAgents).toHaveBeenCalledTimes(1);
  });

  it('skips refresh when called again within cooldown window', async () => {
    await hubStateManager.getExtensionListWithStatus({});
    await hubStateManager.getExtensionListWithStatus({});
    await hubStateManager.getExtensionListWithStatus({});

    // Three calls but only the first triggers a refresh
    expect(mockRefreshBuiltinAgents).toHaveBeenCalledTimes(1);
  });

  it('refreshes again after cooldown expires', async () => {
    await hubStateManager.getExtensionListWithStatus({});
    expect(mockRefreshBuiltinAgents).toHaveBeenCalledTimes(1);

    // Simulate time passing past the cooldown
    (hubStateManager as unknown as { lastAgentRefreshAt: number }).lastAgentRefreshAt = Date.now() - 11_000;

    await hubStateManager.getExtensionListWithStatus({});
    expect(mockRefreshBuiltinAgents).toHaveBeenCalledTimes(2);
  });
});
