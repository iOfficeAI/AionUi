/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const ipcMock = vi.hoisted(() => ({
  getModelInfo: vi.fn(),
  setModel: vi.fn(),
  onResponseStream: vi.fn(() => () => {}),
  getModelConfig: vi.fn().mockResolvedValue([]),
}));

let responseHandler: ((message: any) => void) | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: {
      getModelInfo: { invoke: ipcMock.getModelInfo },
      setModel: { invoke: ipcMock.setModel },
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
    responseHandler = null;
    ipcMock.onResponseStream.mockImplementation((handler: (message: any) => void) => {
      responseHandler = handler;
      return () => {};
    });
    ipcMock.getModelConfig.mockResolvedValue([]);
    ipcMock.setModel.mockResolvedValue({
      success: true,
      data: { modelInfo: null },
    });
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

  it('shows codex stream as the model source when stream events arrive', async () => {
    ipcMock.getModelInfo.mockResolvedValue({
      success: true,
      data: { modelInfo: null },
    });

    render(<AcpModelSelector conversationId='conv-1' backend='codex' />);

    responseHandler?.({
      conversation_id: 'conv-1',
      type: 'codex_model_info',
      data: { model: 'gpt-5.4/high' },
    });

    await waitFor(() => {
      expect(screen.getAllByText('gpt-5.4/high').length).toBeGreaterThan(0);
    });
  });

  it('refreshes Claude model info when the window regains focus', async () => {
    ipcMock.getModelInfo
      .mockResolvedValueOnce({
        success: true,
        data: {
          modelInfo: {
            currentModelId: 'claude-opus-4-6',
            currentModelLabel: 'Claude Opus 4.6',
            availableModels: [
              { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
              { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
            ],
            canSwitch: true,
            source: 'models',
            sourceDetail: 'cc-switch',
          },
        },
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          modelInfo: {
            currentModelId: 'claude-sonnet-4-5',
            currentModelLabel: 'Claude Sonnet 4.5',
            availableModels: [
              { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
              { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            ],
            canSwitch: true,
            source: 'models',
            sourceDetail: 'cc-switch',
          },
        },
      });

    render(<AcpModelSelector conversationId='conv-1' backend='claude' />);

    await waitFor(() => {
      expect(screen.getAllByText('Claude Opus 4.6 · cc-switch').length).toBeGreaterThan(0);
    });

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(screen.getAllByText('Claude Sonnet 4.5 · cc-switch').length).toBeGreaterThan(0);
    });
  });

  it('updates the visible model label immediately after selecting a different model', async () => {
    ipcMock.getModelInfo.mockResolvedValue({
      success: true,
      data: {
        modelInfo: {
          currentModelId: 'claude-opus-4-6',
          currentModelLabel: 'Claude Opus 4.6',
          availableModels: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'glm-5.1x', label: 'GLM 5.1x' },
          ],
          canSwitch: true,
          source: 'models',
          sourceDetail: 'cc-switch',
        },
      },
    });
    ipcMock.setModel.mockResolvedValue({
      success: true,
      data: {
        modelInfo: {
          currentModelId: 'glm-5.1x',
          currentModelLabel: 'GLM 5.1x',
          availableModels: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'glm-5.1x', label: 'GLM 5.1x' },
          ],
          canSwitch: true,
          source: 'models',
          sourceDetail: 'cc-switch',
        },
      },
    });

    render(<AcpModelSelector conversationId='conv-1' backend='claude' />);

    await waitFor(() => {
      expect(screen.getAllByText('Claude Opus 4.6 · cc-switch').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.getByText('GLM 5.1x')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('GLM 5.1x'));

    await waitFor(() => {
      expect(screen.getAllByText('GLM 5.1x · cc-switch').length).toBeGreaterThan(0);
    });
  });
});
