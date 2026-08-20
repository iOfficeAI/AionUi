import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { toggleServerDefault, i18nState } = vi.hoisted(() => ({
  toggleServerDefault: vi.fn(),
  i18nState: { tImpl: (key: string): string | undefined => key },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => i18nState.tImpl(key) }),
}));

beforeEach(() => {
  i18nState.tImpl = (key: string) => key;
});

vi.mock('@icon-park/react', () => {
  const Icon = () => <span>icon</span>;
  return {
    Check: Icon,
    CloseSmall: Icon,
    Info: Icon,
    LoadingOne: Icon,
    Refresh: Icon,
    Write: Icon,
    DeleteFour: Icon,
    SettingOne: Icon,
    Login: Icon,
    Down: Icon,
    Plus: Icon,
  };
});

vi.mock('@/renderer/components/base/FeedbackButton', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/ToolsSettings/McpServerToolsList', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/settings/components/AddMcpServerModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/hooks/mcp', () => ({
  useMcpServers: () => ({
    mcpServers: [userServer({ id: 'memory', enabled: false })],
    extensionMcpServers: [],
    saveMcpServers: vi.fn(),
    setMcpServers: vi.fn(),
  }),
  useMcpOAuth: () => ({
    oauthStatus: {},
    loggingIn: {},
    checkOAuthStatus: vi.fn(),
    markLoginRequired: vi.fn(),
    clearLoginRequired: vi.fn(),
    login: vi.fn(),
  }),
  useMcpConnection: () => ({
    testingServers: {},
    handleTestMcpConnection: vi.fn(),
    handleTestMcpConnections: vi.fn(),
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
    handleToggleServerDefault: toggleServerDefault,
  }),
}));

import type { IMcpServer } from '@/common/config/storage';
import McpServerHeader from '@/renderer/pages/settings/ToolsSettings/McpServerHeader';
import McpManagement from '@/renderer/pages/settings/ToolsSettings/McpManagement';

const userServer = (overrides: Partial<IMcpServer> & { id: string }): IMcpServer => ({
  name: overrides.id,
  enabled: false,
  transport: { type: 'stdio', command: 'test' },
  created_at: 1,
  updated_at: 1,
  original_json: '{}',
  ...overrides,
});

const renderHeader = (props: Partial<React.ComponentProps<typeof McpServerHeader>>) =>
  render(
    <McpServerHeader
      server={userServer({ id: 'memory' })}
      isTestingConnection={false}
      onTestConnection={vi.fn()}
      onEditServer={vi.fn()}
      onDeleteServer={vi.fn()}
      onToggleDefault={vi.fn()}
      {...props}
    />
  );

const querySwitch = (container: HTMLElement) => container.querySelector('.arco-switch') as HTMLElement | null;

describe('McpServerHeader default-for-new-conversations switch (#3119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders an unchecked switch for a default-disabled user server and toggles it on click', () => {
    const onToggleDefault = vi.fn();
    const server = userServer({ id: 'memory', enabled: false });
    const { container } = renderHeader({ server, onToggleDefault });

    const switchEl = querySwitch(container);
    expect(switchEl).not.toBeNull();
    expect(switchEl!.className).not.toContain('arco-switch-checked');

    fireEvent.click(switchEl!);
    expect(onToggleDefault).toHaveBeenCalledTimes(1);
    expect(onToggleDefault).toHaveBeenCalledWith(server);
  });

  it('renders a checked switch when the server is a global default', () => {
    const { container } = renderHeader({ server: userServer({ id: 'memory', enabled: true }) });
    expect(querySwitch(container)?.className).toContain('arco-switch-checked');
  });

  it('hides the switch for builtin servers, read-only rows, and missing handlers', () => {
    const { container: builtin } = renderHeader({ server: userServer({ id: 'chrome-devtools', builtin: true }) });
    expect(querySwitch(builtin)).toBeNull();

    const { container: readOnly } = renderHeader({ isReadOnly: true });
    expect(querySwitch(readOnly)).toBeNull();

    const { container: noHandler } = renderHeader({ onToggleDefault: undefined });
    expect(querySwitch(noHandler)).toBeNull();
  });

  it('shows the loading state while a toggle is in flight', () => {
    const { container } = renderHeader({ isTogglingDefault: true });
    expect(container.querySelector('.arco-switch-loading')).not.toBeNull();
  });

  it('falls back to the built-in tooltip text when the i18n key is missing', () => {
    i18nState.tImpl = () => undefined;
    const { container } = renderHeader({});
    // Rendering must not crash and the switch still shows with its fallback label.
    expect(querySwitch(container)).not.toBeNull();
  });

  it('opens the settings dropdown and routes edit/delete actions', async () => {
    const onEditServer = vi.fn();
    const onDeleteServer = vi.fn();
    const server = userServer({ id: 'memory' });
    const { container } = renderHeader({ server, onEditServer, onDeleteServer });

    const buttons = container.querySelectorAll('.arco-btn');
    const settingsButton = buttons[buttons.length - 1] as HTMLElement;

    fireEvent.mouseEnter(settingsButton);
    const editItem = await screen.findByText('settings.mcpEditServer');
    fireEvent.click(editItem);
    expect(onEditServer).toHaveBeenCalledTimes(1);
    expect(onEditServer).toHaveBeenCalledWith(server);

    // Re-open the popup (clicking an item closes it) and exercise delete.
    fireEvent.mouseEnter(settingsButton);
    const deleteItem = await screen.findByText('settings.mcpDeleteServer');
    fireEvent.click(deleteItem);
    expect(onDeleteServer).toHaveBeenCalledTimes(1);
    expect(onDeleteServer).toHaveBeenCalledWith('memory');
  });
});

describe('McpManagement default toggle wiring (#3119)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderManagement = () =>
    render(
      <McpManagement
        message={
          { success: vi.fn(), error: vi.fn() } as unknown as React.ComponentProps<typeof McpManagement>['message']
        }
      />
    );

  it('routes switch clicks through the CRUD toggle and clears loading afterwards', async () => {
    let resolveToggle: () => void = () => undefined;
    toggleServerDefault.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        })
    );

    const { container } = renderManagement();
    const switchEl = querySwitch(container);
    expect(switchEl).not.toBeNull();

    fireEvent.click(switchEl!);
    expect(toggleServerDefault).toHaveBeenCalledTimes(1);
    expect(toggleServerDefault).toHaveBeenCalledWith(expect.objectContaining({ id: 'memory' }));

    // While the backend call is pending, the row shows its loading spinner.
    await waitFor(() => {
      expect(container.querySelector('.arco-switch-loading')).not.toBeNull();
    });

    await act(async () => {
      resolveToggle();
    });
    await waitFor(() => {
      expect(container.querySelector('.arco-switch-loading')).toBeNull();
    });
  });

  it('renders the settings list with the user server name visible', () => {
    renderManagement();
    expect(screen.getByText('memory')).toBeInTheDocument();
  });
});
