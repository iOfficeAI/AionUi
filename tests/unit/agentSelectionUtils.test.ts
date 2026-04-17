/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const configStorageMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
}));

vi.mock('../../src/common/config/storage', () => ({
  ConfigStorage: configStorageMocks,
}));

import {
  savePreferredMode,
  savePreferredModelId,
  getAgentKey,
} from '../../src/renderer/pages/guid/hooks/agentSelectionUtils';

// ---------------------------------------------------------------------------
// getAgentKey
// ---------------------------------------------------------------------------

describe('getAgentKey', () => {
  it('returns "custom:<id>" for agents with customAgentId', () => {
    expect(getAgentKey({ backend: 'custom', customAgentId: 'abc-123' })).toBe('custom:abc-123');
    // Preset assistants now use actual backend type but still get custom: prefix
    expect(getAgentKey({ backend: 'claude', customAgentId: 'preset-1' })).toBe('custom:preset-1');
  });

  it('returns backend directly for non-custom agents', () => {
    expect(getAgentKey({ backend: 'claude' })).toBe('claude');
    expect(getAgentKey({ backend: 'gemini' })).toBe('gemini');
    expect(getAgentKey({ backend: 'codex' })).toBe('codex');
  });

  it('returns "custom" when backend is custom but no customAgentId', () => {
    expect(getAgentKey({ backend: 'custom' })).toBe('custom');
  });
});

// ---------------------------------------------------------------------------
// savePreferredMode
// ---------------------------------------------------------------------------

describe('savePreferredMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configStorageMocks.get.mockResolvedValue({});
    configStorageMocks.set.mockResolvedValue(undefined);
  });

  it('saves preferred mode for gemini under gemini.config', async () => {
    configStorageMocks.get.mockResolvedValue({ yoloMode: false });

    await savePreferredMode('gemini', 'yolo');

    expect(configStorageMocks.get).toHaveBeenCalledWith('gemini.config');
    expect(configStorageMocks.set).toHaveBeenCalledWith('gemini.config', {
      yoloMode: false,
      preferredMode: 'yolo',
    });
  });

  it('saves preferred mode for aionrs under aionrs.config', async () => {
    configStorageMocks.get.mockResolvedValue({});

    await savePreferredMode('aionrs', 'yolo');

    expect(configStorageMocks.get).toHaveBeenCalledWith('aionrs.config');
    expect(configStorageMocks.set).toHaveBeenCalledWith('aionrs.config', {
      preferredMode: 'yolo',
    });
  });

  it('saves preferred mode for ACP backend under acp.config', async () => {
    configStorageMocks.get.mockResolvedValue({});

    await savePreferredMode('claude', 'bypassPermissions');

    expect(configStorageMocks.get).toHaveBeenCalledWith('acp.config');
    expect(configStorageMocks.set).toHaveBeenCalledWith('acp.config', {
      claude: { preferredMode: 'bypassPermissions' },
    });
  });

  it('preserves existing ACP config when saving mode', async () => {
    configStorageMocks.get.mockResolvedValue({
      claude: { preferredModelId: 'model-1', yoloMode: true },
      codex: { preferredMode: 'yolo' },
    });

    await savePreferredMode('claude', 'default');

    expect(configStorageMocks.set).toHaveBeenCalledWith('acp.config', {
      claude: { preferredModelId: 'model-1', yoloMode: true, preferredMode: 'default' },
      codex: { preferredMode: 'yolo' },
    });
  });

  it('does NOT save when agentKey is "custom"', async () => {
    await savePreferredMode('custom', 'yolo');

    expect(configStorageMocks.get).not.toHaveBeenCalled();
    expect(configStorageMocks.set).not.toHaveBeenCalled();
  });

  it('silently catches errors during save', async () => {
    configStorageMocks.get.mockRejectedValue(new Error('storage error'));

    // Should not throw
    await expect(savePreferredMode('claude', 'default')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// savePreferredModelId
// ---------------------------------------------------------------------------

describe('savePreferredModelId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configStorageMocks.get.mockResolvedValue({});
    configStorageMocks.set.mockResolvedValue(undefined);
  });

  it('saves preferred model ID under acp.config for given backend', async () => {
    await savePreferredModelId('codex', 'gpt-4o');

    expect(configStorageMocks.get).toHaveBeenCalledWith('acp.config');
    expect(configStorageMocks.set).toHaveBeenCalledWith('acp.config', {
      codex: { preferredModelId: 'gpt-4o' },
    });
  });

  it('preserves existing config when saving model ID', async () => {
    configStorageMocks.get.mockResolvedValue({
      codex: { preferredMode: 'yolo' },
    });

    await savePreferredModelId('codex', 'gpt-4o');

    expect(configStorageMocks.set).toHaveBeenCalledWith('acp.config', {
      codex: { preferredMode: 'yolo', preferredModelId: 'gpt-4o' },
    });
  });

  it('silently catches errors during save', async () => {
    configStorageMocks.get.mockRejectedValue(new Error('storage error'));

    await expect(savePreferredModelId('codex', 'gpt-4o')).resolves.toBeUndefined();
  });
});
