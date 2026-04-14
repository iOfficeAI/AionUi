/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const ipcMock = vi.hoisted(() => ({
  getModelInfo: vi.fn(),
  onResponseStream: vi.fn(() => () => {}),
  getModelConfig: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModelInfo: { invoke: ipcMock.getModelInfo },
      responseStream: { on: ipcMock.onResponseStream },
    },
    mode: {
      getModelConfig: { invoke: ipcMock.getModelConfig },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [], error: undefined, mutate: vi.fn() }),
}));

import AcpModelSelector from '../../src/renderer/components/agent/AcpModelSelector';

describe('AcpModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.onResponseStream.mockReturnValue(() => {});
    ipcMock.getModelConfig.mockResolvedValue([]);
  });

  it('shows the model source in the compact button label', async () => {
    ipcMock.getModelInfo.mockResolvedValue({
      success: true,
      data: {
        modelInfo: {
          currentModelId: 'claude-opus-4-6',
          currentModelLabel: 'Claude Opus 4.6',
          availableModels: [{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' }],
          canSwitch: false,
          source: 'models',
          sourceDetail: 'cc-switch',
        },
      },
    });

    render(<AcpModelSelector conversationId='conv-1' backend='claude' />);

    await waitFor(() => {
      expect(screen.getAllByText('Claude Opus 4.6 · cc-switch').length).toBeGreaterThan(0);
    });
  });
});
