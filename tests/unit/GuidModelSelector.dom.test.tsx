/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

const ipcMock = vi.hoisted(() => ({
  listProviders: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    mode: {
      listProviders: { invoke: ipcMock.listProviders },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback || key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [], error: undefined, mutate: vi.fn() }),
}));

import GuidModelSelector from '../../src/renderer/pages/guid/components/GuidModelSelector';

describe('GuidModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ipcMock.listProviders.mockResolvedValue([]);
  });

  it('shows the model source for read-only ACP model info', () => {
    render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn(async () => {})}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          current_model_id: 'claude-opus-4-6',
          current_model_label: 'Claude Opus 4.6',
          available_models: [{ id: 'claude-opus-4-6', label: 'Claude Opus 4.6' }],
          can_switch: false,
          source: 'models',
          source_detail: 'cc-switch',
        }}
        selectedAcpModel={null}
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.getAllByText('Claude Opus 4.6 · cc-switch').length).toBeGreaterThan(0);
  });

  it('shows the selected model and source when ACP switching is enabled', () => {
    render(
      <GuidModelSelector
        isGeminiMode={false}
        modelList={[]}
        currentModel={undefined}
        setCurrentModel={vi.fn(async () => {})}
        geminiModeLookup={new Map()}
        currentAcpCachedModelInfo={{
          current_model_id: 'claude-opus-4-6',
          current_model_label: 'Claude Opus 4.6',
          available_models: [
            { id: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
            { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5' },
          ],
          can_switch: true,
          source: 'models',
          source_detail: 'acp-models',
        }}
        selectedAcpModel={'claude-sonnet-4-5'}
        setSelectedAcpModel={vi.fn()}
      />
    );

    expect(screen.getAllByText('Claude Sonnet 4.5').length).toBeGreaterThan(0);
  });
});
