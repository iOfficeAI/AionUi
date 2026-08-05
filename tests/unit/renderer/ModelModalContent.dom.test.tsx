/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IProvider } from '@/common/config/storage';

const mocks = vi.hoisted(() => ({
  providers: [] as IProvider[],
  mutate: vi.fn(),
  syncPersonalModels: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    acpConversation: { checkProviderHealth: { invoke: vi.fn() } },
    larkAuth: { syncPersonalModels: { invoke: mocks.syncPersonalModels } },
    mode: {
      createProvider: { invoke: vi.fn() },
      deleteProvider: { invoke: vi.fn() },
      listProviders: { invoke: vi.fn() },
      updateProvider: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: mocks.providers, mutate: mocks.mutate }),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageHeader', () => ({
  default: ({ title, actions }: { title: React.ReactNode; actions: React.ReactNode }) => (
    <div>
      <span>{title}</span>
      {actions}
    </div>
  ),
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/assistant/useTalkToButler', () => ({ useTalkToButler: () => vi.fn() }));

vi.mock('@/renderer/hooks/system/useDeepLink', () => ({ consumePendingDeepLink: () => null }));

vi.mock('@/renderer/pages/settings/components/AddModelModal', () => ({
  default: { useModal: () => [{ close: vi.fn(), open: vi.fn() }, null] },
}));
vi.mock('@/renderer/pages/settings/components/AddPlatformModal', () => ({
  default: { useModal: () => [{ close: vi.fn(), open: vi.fn() }, null] },
}));
vi.mock('@/renderer/pages/settings/components/EditModeModal', () => ({
  default: { useModal: () => [{ close: vi.fn(), open: vi.fn() }, null] },
}));

import ModelModalContent from '@/renderer/components/settings/SettingsModal/contents/ModelModalContent';

const provider = (id: string): IProvider => ({
  id,
  platform: 'openai',
  name: 'GEA · sales-forecast',
  base_url: 'http://127.0.0.1:1234/personal/provider',
  api_key: 'local-key',
  models: ['deepseek-v4-flash'],
  enabled: true,
  model_enabled: { 'deepseek-v4-flash': true },
});

const expandProvider = () => {
  const header = screen.getByText('GEA · sales-forecast').closest('[role="button"]');
  expect(header).not.toBeNull();
  fireEvent.click(header!);
};

const triggerGeaSync = async () => {
  fireEvent.click(screen.getByTestId('add-model-menu'));
  const item = await screen.findByTestId('add-model-menu-gea');
  fireEvent.click((item.closest('[role="menuitem"]') ?? item) as HTMLElement);
};

describe('ModelModalContent managed personal model controls', () => {
  beforeEach(() => {
    mocks.mutate.mockReset();
    mocks.syncPersonalModels.mockReset();
    mocks.syncPersonalModels.mockResolvedValue({
      success: true,
      data: { configured: 1, failed: 0, skipped: 0, status: 'completed' },
    });
  });

  it('offers a GEA refresh action and reloads providers after syncing', async () => {
    mocks.providers = [];
    render(<ModelModalContent />);

    await triggerGeaSync();

    await waitFor(() => expect(mocks.syncPersonalModels).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.mutate).toHaveBeenCalled());
  });

  it('keeps visible feedback on the add-model button while GEA sync is pending', async () => {
    let resolveSync!: (value: Awaited<ReturnType<typeof mocks.syncPersonalModels>>) => void;
    mocks.syncPersonalModels.mockReturnValue(
      new Promise((resolve) => {
        resolveSync = resolve;
      })
    );
    mocks.providers = [];
    render(<ModelModalContent />);

    await triggerGeaSync();

    await waitFor(() => {
      const button = screen.getByTestId('add-model-menu');
      expect(button).toHaveTextContent('settings.personalModelFetching');
      expect(button).toHaveClass('arco-btn-loading');
    });

    resolveSync({
      success: true,
      data: { configured: 0, failed: 0, skipped: 0, status: 'completed' },
    });
  });

  it('keeps only enable switches for an automatically managed provider', () => {
    mocks.providers = [provider('gea-personal-1234567890abcdef12345678')];
    render(<ModelModalContent />);
    expandProvider();

    expect(screen.getByText('settings.personalModelManaged')).toBeInTheDocument();
    expect(screen.getByTestId('provider-toggle-gea-personal-1234567890abcdef12345678')).toBeInTheDocument();
    expect(
      screen.getByTestId('model-toggle-gea-personal-1234567890abcdef12345678-deepseek-v4-flash')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('provider-actions-gea-personal-1234567890abcdef12345678')).toBeNull();
    expect(screen.queryByTestId('model-actions-gea-personal-1234567890abcdef12345678-deepseek-v4-flash')).toBeNull();
  });

  it('leaves edit and delete actions available for a user-managed provider', () => {
    mocks.providers = [provider('user-provider')];
    render(<ModelModalContent />);
    expandProvider();

    expect(screen.getByTestId('provider-actions-user-provider')).toBeInTheDocument();
    expect(screen.getByTestId('model-actions-user-provider-deepseek-v4-flash')).toBeInTheDocument();
  });
});
