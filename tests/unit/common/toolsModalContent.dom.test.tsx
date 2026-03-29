import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

type MockServer = {
  id: string;
  name: string;
  builtin: boolean;
  enabled: boolean;
  updatedAt: number;
  transport: {
    type: 'stdio';
    command: string;
    args: string[];
    env: Record<string, string>;
  };
};

const testState = vi.hoisted(() => ({
  createDeferred: () => {
    let resolve!: () => void;
    const promise = new Promise<void>((innerResolve) => {
      resolve = innerResolve;
    });

    return { promise, resolve };
  },
  BUILTIN_IMAGE_GEN_ID: 'builtin-image-gen',
  initialBuiltinServer: (): MockServer => ({
    id: 'builtin-image-gen',
    name: 'aionui-image-generation',
    builtin: true,
    enabled: false,
    updatedAt: 1,
    transport: {
      type: 'stdio',
      command: 'node',
      args: ['/abs/builtin-mcp-image-gen.js'],
      env: {
        AIONUI_IMG_PLATFORM: 'new-api',
        AIONUI_IMG_BASE_URL: 'https://example.com',
        AIONUI_IMG_API_KEY: 'key',
        AIONUI_IMG_MODEL: 'grok-imagine-1.0',
      },
    },
  }),
  mockConfigGet: vi.fn(),
  mockConfigSet: vi.fn(() => Promise.resolve()),
  mockConfigRemove: vi.fn(() => Promise.resolve()),
  mockCheckSingleServerInstallStatus: vi.fn(() => Promise.resolve()),
  mockRemoveMcpFromAgents: vi.fn(() => Promise.resolve()),
  mockHandleTestMcpConnection: vi.fn(),
  mockCheckOAuthStatus: vi.fn(),
  mockLogin: vi.fn(() => Promise.resolve({ success: true })),
  syncDeferred: undefined as { promise: Promise<void>; resolve: () => void } | undefined,
  mockSyncMcpToAgents: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Help: () => <span data-testid='icon-help' />,
  Down: () => <span data-testid='icon-down' />,
  Plus: () => <span data-testid='icon-plus' />,
}));

vi.mock('@arco-design/web-react', () => {
  const FormComponent = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  const FormItem = ({ children, label }: React.PropsWithChildren<{ label?: React.ReactNode }>) => (
    <label>
      <span>{label}</span>
      {children}
    </label>
  );

  return {
    Divider: () => <hr />,
    Form: Object.assign(FormComponent, { Item: FormItem }),
    Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Input: Object.assign(
      ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
        <input value={value} onChange={(event) => onChange?.(event.target.value)} />
      ),
      {
        Password: ({ value, onChange }: { value?: string; onChange?: (value: string) => void }) => (
          <input type='password' value={value} onChange={(event) => onChange?.(event.target.value)} />
        ),
      }
    ),
    Button: ({
      children,
      onClick,
      disabled,
    }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
      <button disabled={disabled} onClick={onClick}>
        {children}
      </button>
    ),
    Dropdown: ({ children }: React.PropsWithChildren) => <>{children}</>,
    Menu: Object.assign(({ children }: React.PropsWithChildren) => <div>{children}</div>, {
      Item: ({
        children,
        onClick,
      }: React.PropsWithChildren<{ onClick?: (event: { stopPropagation: () => void }) => void }>) => (
        <button onClick={() => onClick?.({ stopPropagation: () => {} })}>{children}</button>
      ),
    }),
    Modal: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    Switch: ({
      checked,
      disabled,
      onChange,
    }: {
      checked?: boolean;
      disabled?: boolean;
      onChange?: (checked: boolean) => void;
    }) => (
      <input
        aria-label='switch'
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        role='switch'
        type='checkbox'
      />
    ),
    Message: {
      useMessage: () => [
        {
          success: vi.fn(),
          error: vi.fn(),
          info: vi.fn(),
          warning: vi.fn(),
        },
        <div key='message-holder' />,
      ],
    },
  };
});

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/AionSelect', () => {
  const Select = ({
    children,
    value,
    onChange,
  }: React.PropsWithChildren<{ value?: string; onChange?: (value: string) => void }>) => (
    <select onChange={(event) => onChange?.(event.target.value)} value={value}>
      {children}
    </select>
  );

  Select.Option = ({ children, value }: React.PropsWithChildren<{ value: string }>) => (
    <option value={value}>{children}</option>
  );
  Select.OptGroup = ({ children, label }: React.PropsWithChildren<{ label: string }>) => (
    <optgroup label={label}>{children}</optgroup>
  );

  return { default: Select };
});

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

vi.mock('@/renderer/pages/settings/components/AddMcpServerModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/ToolsSettings/McpAgentStatusDisplay', () => ({
  default: () => <div data-testid='mcp-agent-status-display' />,
}));

vi.mock('@/renderer/pages/settings/ToolsSettings/McpServerItem', () => ({
  default: () => <div data-testid='mcp-server-item' />,
}));

vi.mock('@/renderer/hooks/agent/useConfigModelListWithImage', () => ({
  default: () => ({
    modelListWithImage: [
      {
        id: 'provider-1',
        name: 'Image Provider',
        apiKey: 'key',
        platform: 'new-api',
        baseUrl: 'https://example.com',
        model: ['grok-imagine-1.0'],
      },
    ],
  }),
}));

vi.mock('@/common/config/storage', () => ({
  BUILTIN_IMAGE_GEN_ID: testState.BUILTIN_IMAGE_GEN_ID,
  ConfigStorage: {
    get: (...args: unknown[]) => testState.mockConfigGet(...args),
    set: (...args: unknown[]) => testState.mockConfigSet(...args),
    remove: (...args: unknown[]) => testState.mockConfigRemove(...args),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    getAvailableAgents: {
      invoke: vi.fn(() => Promise.resolve({ success: true, data: [] })),
    },
  },
}));

vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => {
    const [mcpServers, setMcpServers] = React.useState([testState.initialBuiltinServer()]);

    return {
      mcpServers,
      extensionMcpServers: [],
      saveMcpServers: async (serversOrUpdater: MockServer[] | ((prevServers: MockServer[]) => MockServer[])) => {
        setMcpServers((prevServers) =>
          typeof serversOrUpdater === 'function' ? serversOrUpdater(prevServers) : serversOrUpdater
        );
      },
    };
  },
  useMcpAgentStatus: () => {
    const [agentInstallStatus, setAgentInstallStatus] = React.useState<Record<string, string[]>>({});

    return {
      agentInstallStatus,
      setAgentInstallStatus,
      isServerLoading: () => false,
      checkSingleServerInstallStatus: testState.mockCheckSingleServerInstallStatus,
    };
  },
  useMcpOperations: () => ({
    syncMcpToAgents: testState.mockSyncMcpToAgents,
    removeMcpFromAgents: testState.mockRemoveMcpFromAgents,
  }),
  useMcpConnection: () => ({
    testingServers: {},
    handleTestMcpConnection: testState.mockHandleTestMcpConnection,
  }),
  useMcpModal: () => ({
    showMcpModal: false,
    editingMcpServer: undefined,
    deleteConfirmVisible: false,
    serverToDelete: undefined,
    mcpCollapseKey: {},
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
    handleToggleMcpServer: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: testState.mockCheckOAuthStatus,
    login: testState.mockLogin,
  }),
}));

import ToolsModalContent from '@/renderer/components/settings/SettingsModal/contents/ToolsModalContent';

describe('ToolsModalContent image generation status refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    testState.syncDeferred = testState.createDeferred();
    testState.mockSyncMcpToAgents.mockImplementation(() => testState.syncDeferred.promise);
    testState.mockConfigGet.mockImplementation((key: string) => {
      if (key === 'tools.imageGenerationModel') {
        return Promise.resolve({
          id: 'provider-1',
          name: 'Image Provider',
          apiKey: 'key',
          platform: 'new-api',
          baseUrl: 'https://example.com',
          useModel: 'grok-imagine-1.0',
          model: ['grok-imagine-1.0'],
        });
      }

      return Promise.resolve(undefined);
    });
  });

  it('refreshes image generation agent status only after sync completes when enabling the builtin MCP server', async () => {
    render(<ToolsModalContent />);

    const toggle = (await screen.findAllByRole('switch', { name: 'switch' }))[0];
    expect(toggle).not.toBeDisabled();

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(testState.mockSyncMcpToAgents).toHaveBeenCalledOnce();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(testState.mockCheckSingleServerInstallStatus).not.toHaveBeenCalled();

    await act(async () => {
      testState.syncDeferred.resolve();
      await testState.syncDeferred.promise;
    });

    await waitFor(() => {
      expect(testState.mockCheckSingleServerInstallStatus).toHaveBeenCalledOnce();
    });
    expect(testState.mockCheckSingleServerInstallStatus).toHaveBeenCalledWith('aionui-image-generation');
  });

  it('persists speech-to-text provider settings when the user switches provider and updates credentials', async () => {
    render(<ToolsModalContent />);

    const providerSelect = await screen.findByLabelText(/settings\.speechToTextProvider/);
    fireEvent.change(providerSelect, { target: { value: 'deepgram' } });

    await waitFor(() => {
      expect(testState.mockConfigSet).toHaveBeenCalledWith(
        'tools.speechToText',
        expect.objectContaining({
          provider: 'deepgram',
        })
      );
    });

    const apiKeyInput = await screen.findByLabelText(/settings\.speechToTextApiKey/);
    fireEvent.change(apiKeyInput, { target: { value: 'deepgram-secret' } });

    await waitFor(() => {
      expect(testState.mockConfigSet).toHaveBeenLastCalledWith(
        'tools.speechToText',
        expect.objectContaining({
          provider: 'deepgram',
          deepgram: expect.objectContaining({
            apiKey: 'deepgram-secret',
          }),
        })
      );
    });
  });

  it('shows required and optional markers for OpenAI and Deepgram speech-to-text fields', async () => {
    render(<ToolsModalContent />);

    await screen.findByLabelText(/settings\.speechToTextApiKey/);

    expect(screen.getAllByText(/settings\.speechToTextRequired/)).toHaveLength(1);
    expect(screen.getAllByText(/settings\.speechToTextOptional/)).toHaveLength(3);

    const providerSelect = screen.getByLabelText(/settings\.speechToTextProvider/);
    fireEvent.change(providerSelect, { target: { value: 'deepgram' } });

    await screen.findByLabelText(/settings\.speechToTextDetectLanguage/);

    expect(screen.getAllByText(/settings\.speechToTextRequired/)).toHaveLength(1);
    expect(screen.getAllByText(/settings\.speechToTextOptional/)).toHaveLength(6);
  });
});
