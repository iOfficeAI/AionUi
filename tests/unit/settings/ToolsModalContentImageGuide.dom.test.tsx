/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { SettingsTabNavigateProvider } from '@/renderer/components/settings/SettingsModal/settingsViewContext';

const hooks = vi.hoisted(() => ({
  modelListWithImage: [] as unknown[],
  providerQueryData: [] as unknown[],
  mcpServers: [] as unknown[],
  getClientBusinessSetting: vi.fn(() => Promise.resolve(undefined)),
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
  saveMcpServers: vi.fn(() => Promise.resolve()),
  updateServer: vi.fn(),
  toggleServer: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key }),
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/AionSelect', () => {
  return {
    default: Object.assign(
      ({ children, value }: { children?: React.ReactNode; value?: string }) => (
        <div data-testid='image-model-select' data-value={value}>
          {children}
        </div>
      ),
      {
        OptGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
        Option: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
      }
    ),
  };
});

vi.mock('@/renderer/components/base/TalkToButlerButton', () => ({
  default: () => <div>TalkToButlerButton</div>,
}));

vi.mock('@/renderer/pages/settings/components/AddMcpServerModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/ToolsSettings/McpServerItem', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/agent/useConfigModelListWithImage', () => ({
  default: () => ({ modelListWithImage: hooks.modelListWithImage }),
}));

vi.mock('@/renderer/hooks/agent/useModelProviderList', () => ({
  useProvidersQuery: () => ({ data: hooks.providerQueryData }),
}));

vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => ({
    mcpServers: hooks.mcpServers,
    extensionMcpServers: [],
    saveMcpServers: hooks.saveMcpServers,
    setMcpServers: vi.fn(),
    isMcpServersLoading: false,
  }),
  useMcpConnection: () => ({ testingServers: {}, handleTestMcpConnection: vi.fn(), handleTestMcpConnections: vi.fn() }),
  useMcpModal: () => ({
    showMcpModal: false,
    editingMcpServer: undefined,
    deleteConfirmVisible: false,
    serverToDelete: undefined,
    mcpCollapseKey: [],
    showAddMcpModal: vi.fn(),
    showEditMcpModal: vi.fn(),
    hideMcpModal: vi.fn(),
    showDeleteConfirm: vi.fn(),
    hideDeleteConfirm: vi.fn(),
    toggleServerCollapse: vi.fn(),
  }),
  useMcpServerCRUD: () => ({
    handleAddMcpServer: vi.fn(),
    handleBatchImportMcpServers: vi.fn(),
    handleEditMcpServer: vi.fn(),
    handleDeleteMcpServer: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: vi.fn(),
    markLoginRequired: vi.fn(),
    clearLoginRequired: vi.fn(),
    login: vi.fn(),
  }),
  useMountedMessage: (m: unknown) => m,
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: hooks.getClientBusinessSetting,
  setClientBusinessSetting: hooks.setClientBusinessSetting,
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  mcpService: {
    updateServer: { invoke: hooks.updateServer },
    toggleServer: { invoke: hooks.toggleServer },
  },
}));

import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';

describe('ToolsModalContent image model guide', () => {
  beforeEach(() => {
    hooks.modelListWithImage = [];
    hooks.providerQueryData = [];
    hooks.mcpServers = [];
    hooks.getClientBusinessSetting.mockClear();
    hooks.setClientBusinessSetting.mockClear();
    hooks.saveMcpServers.mockClear();
    hooks.updateServer.mockReset();
    hooks.toggleServer.mockReset();
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a clickable "go to configure" link that navigates to the model tab', async () => {
    const navigateToTab = vi.fn();
    render(
      <SettingsTabNavigateProvider value={navigateToTab}>
        <ToolsModalContent />
      </SettingsTabNavigateProvider>
    );

    const link = await screen.findByText('settings.goToModelSettings');
    // Rendered as an inline anchor (text link), not a button.
    expect(link.tagName).toBe('A');
    fireEvent.click(link);

    await waitFor(() => expect(navigateToTab).toHaveBeenCalledWith('model'));
  });

  it('renders the guide text as plain text (no link) when no tab navigator is provided', async () => {
    const { container } = render(<ToolsModalContent />);

    // The empty-state hint still shows the go-to-configure wording, but not as a clickable link.
    await waitFor(() => expect(container.textContent).toContain('settings.goToModelSettings'));
    const links = Array.from(container.querySelectorAll('a')).filter(
      (a) => a.textContent === 'settings.goToModelSettings'
    );
    expect(links).toHaveLength(0);
  });

  it('shows every configured provider model without a separate custom-model opt-in', async () => {
    hooks.modelListWithImage = [
      {
        id: 'custom-provider',
        name: 'Custom Provider',
        platform: 'custom',
        base_url: 'https://example.com/v1',
        api_key: 'test-key',
        models: ['my-image-model'],
      },
    ];
    render(<ToolsModalContent />);

    expect(await screen.findByText('my-image-model')).toBeInTheDocument();
    expect(screen.queryByText('settings.imageGenCustomModelWarning')).not.toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });

  it('shows popular compatible image model families without custom opt-in', async () => {
    hooks.modelListWithImage = [
      {
        id: 'image-gateway',
        name: 'Images Gateway',
        platform: 'custom',
        base_url: 'https://images.example.com/v1',
        api_key: 'test-key',
        models: ['gpt-image-2', 'grok-imagine-image-2.0', 'flux-2-pro'],
      },
    ];

    render(<ToolsModalContent />);

    expect(await screen.findByText('gpt-image-2')).toBeInTheDocument();
    expect(screen.getByText('grok-imagine-image-2.0')).toBeInTheDocument();
    expect(screen.getByText('flux-2-pro')).toBeInTheDocument();
    expect(screen.queryByText('settings.imageGenCustomModelWarning')).not.toBeInTheDocument();
  });

  it('keeps a saved custom model selectable and warns after it is selected', async () => {
    hooks.modelListWithImage = [
      {
        id: 'custom-provider',
        name: 'Custom Provider',
        platform: 'custom',
        base_url: 'https://example.com/v1',
        api_key: 'test-key',
        models: ['saved-image-model', 'other-image-model'],
      },
    ];
    hooks.getClientBusinessSetting.mockResolvedValueOnce({
      id: 'custom-provider',
      name: 'Custom Provider',
      platform: 'custom',
      base_url: '',
      api_key: '',
      use_model: 'saved-image-model',
    });

    render(<ToolsModalContent />);

    expect(await screen.findByText('saved-image-model')).toBeInTheDocument();
    expect(screen.getByText('other-image-model')).toBeInTheDocument();
    expect(screen.getByText('settings.imageGenCustomModelWarning')).toBeInTheDocument();
  });

  it('keeps the image generation switch actionable and requests a model when none is selected', async () => {
    hooks.mcpServers = [
      {
        id: 'builtin-image-gen',
        name: 'aionui-image-generation',
        builtin: true,
        enabled: false,
        transport: { type: 'stdio', command: 'node', args: [], env: {} },
        original_json: '{}',
      },
    ];

    render(<ToolsModalContent />);

    const imageGenerationSwitch = screen.getByRole('switch', { name: 'settings.imageGenerationToggle' });
    expect(imageGenerationSwitch).toBeEnabled();

    fireEvent.click(imageGenerationSwitch);

    expect(await screen.findByText('settings.selectModel')).toBeInTheDocument();
    expect(hooks.toggleServer).not.toHaveBeenCalled();
  });

  it('enables the built-in image generation server after a configured model is loaded', async () => {
    const provider = {
      id: 'custom-provider',
      name: 'Custom Provider',
      platform: 'custom',
      base_url: 'https://example.com/v1',
      api_key: 'test-key',
      models: ['my-image-model'],
    };
    const server = {
      id: 'builtin-image-gen',
      name: 'aionui-image-generation',
      builtin: true,
      enabled: false,
      transport: {
        type: 'stdio',
        command: 'node',
        args: [],
        env: {
          AIONUI_IMG_PROVIDER_ID: provider.id,
          AIONUI_IMG_PLATFORM: provider.platform,
          AIONUI_IMG_BASE_URL: provider.base_url,
          AIONUI_IMG_API_KEY: provider.api_key,
          AIONUI_IMG_MODEL: provider.models[0],
        },
      },
      original_json: '{}',
    };
    hooks.modelListWithImage = [provider];
    hooks.mcpServers = [server];
    hooks.getClientBusinessSetting.mockResolvedValueOnce({
      ...provider,
      base_url: '',
      api_key: '',
      use_model: provider.models[0],
    });
    hooks.toggleServer.mockResolvedValueOnce({ ...server, enabled: true });

    render(<ToolsModalContent />);

    await waitFor(() =>
      expect(screen.getByTestId('image-model-select')).toHaveAttribute('data-value', 'custom-provider|my-image-model')
    );
    fireEvent.click(screen.getByRole('switch', { name: 'settings.imageGenerationToggle' }));

    await waitFor(() => expect(hooks.toggleServer).toHaveBeenCalledWith({ id: 'builtin-image-gen' }));
    expect(hooks.saveMcpServers).toHaveBeenCalledTimes(1);
  });

  it('supplements current Gemini image model IDs when provider discovery returns no image models', async () => {
    hooks.providerQueryData = [
      {
        id: 'gemini',
        name: 'Gemini',
        platform: 'gemini',
        base_url: '',
        api_key: 'test-key',
        models: ['gemini-3.1-pro'],
      },
      {
        id: 'openrouter',
        name: 'OpenRouter',
        platform: 'OpenRouter',
        base_url: 'https://openrouter.ai/api/v1',
        api_key: 'test-key',
        models: ['openai/gpt-5.4'],
      },
    ];
    const { default: useActualConfigModelListWithImage } = await vi.importActual<
      typeof import('@/renderer/hooks/agent/useConfigModelListWithImage')
    >('@/renderer/hooks/agent/useConfigModelListWithImage');

    const { result } = renderHook(() => useActualConfigModelListWithImage());

    expect(result.current.modelListWithImage[0].models).toContain('gemini-3.1-flash-image');
    expect(result.current.modelListWithImage[1].models).toContain('google/gemini-3.1-flash-image');
  });
});
