import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiSettingsContent from '../../../src/renderer/components/settings/SettingsModal/contents/ApiSettingsContent';

const diagnosticsTab = {
  id: 'ext-api-diagnostics-devtools-runtime-diagnostics',
  name: 'API Diagnostics',
  entryUrl: 'aion-asset://api-diagnostics-devtools/settings/api-diagnostics.html',
  order: 30,
  _extensionName: 'api-diagnostics-devtools',
} as const;

const testState = vi.hoisted(() => ({
  getApiConfig: vi.fn(),
  getModelConfig: vi.fn(),
  getAvailableAgents: vi.fn(),
  getWebuiStatus: vi.fn(),
  configStorageGet: vi.fn(),
  getSettingsTabs: vi.fn(),
  resolveExtTabName: vi.fn((tab: { name: string }) => tab.name),
  messageError: vi.fn(),
  messageSuccess: vi.fn(),
  messageWarning: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      (
        ({
          'common.loading': 'Loading',
          'common.save': 'Save',
          'settings.apiPage.title': 'Local HTTP API',
          'settings.apiPage.description': 'API settings',
          'settings.apiPage.tabs.auth': 'API Auth',
          'settings.apiPage.tabs.callback': 'Conversation Callback',
          'settings.apiPage.tabs.generator': 'Parameter Generator',
        }) as Record<string, string>
      )[key] || key,
  }),
}));

vi.mock('@arco-design/web-react', () => {
  const Button = ({
    children,
    disabled,
    onClick,
  }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
    <button disabled={disabled} onClick={onClick} type='button'>
      {children}
    </button>
  );

  const Tabs = ({
    children,
    activeTab,
    onChange,
  }: React.PropsWithChildren<{ activeTab?: string; onChange?: (key: string) => void }>) => {
    const items = React.Children.toArray(children) as Array<React.ReactElement<{ title: React.ReactNode }>>;
    return (
      <div>
        {items.map((item) => {
          const rawKey = String(item.key);
          const resolvedKey = rawKey.replace(/^\.\$/, '');
          return (
            <button
              key={rawKey}
              aria-pressed={activeTab === resolvedKey}
              onClick={() => onChange?.(resolvedKey)}
              type='button'
            >
              {item.props.title}
            </button>
          );
        })}
      </div>
    );
  };

  Tabs.TabPane = ({ children }: React.PropsWithChildren) => <>{children}</>;

  return {
    Button,
    Message: {
      error: testState.messageError,
      success: testState.messageSuccess,
      warning: testState.messageWarning,
    },
    Tabs,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getApiConfig: { invoke: (...args: unknown[]) => testState.getApiConfig(...args) },
    },
    mode: {
      getModelConfig: { invoke: (...args: unknown[]) => testState.getModelConfig(...args) },
    },
    acpConversation: {
      getAvailableAgents: { invoke: (...args: unknown[]) => testState.getAvailableAgents(...args) },
    },
    webui: {
      getStatus: { invoke: (...args: unknown[]) => testState.getWebuiStatus(...args) },
      statusChanged: {
        on: () => () => undefined,
      },
    },
    shell: {
      openExternal: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  extensions: {
    getSettingsTabs: { invoke: (...args: unknown[]) => testState.getSettingsTabs(...args) },
    stateChanged: {
      on: () => () => undefined,
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: (...args: unknown[]) => testState.configStorageGet(...args),
  },
}));

vi.mock('@/common/types/codex/codexConfigOptions', () => ({
  getDefaultAcpConfigOptions: () => [],
}));

vi.mock('@/renderer/hooks/system/useExtI18n', () => ({
  useExtI18n: () => ({
    resolveExtTabName: testState.resolveExtTabName,
  }),
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  getAgentModes: () => [],
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ApiSettingsContent/tabs/ApiAuthTab', () => ({
  default: () => <div>auth-tab</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/ApiSettingsContent/tabs/CallbackTab', () => ({
  default: () => <div>callback-tab</div>,
}));

vi.mock(
  '@/renderer/components/settings/SettingsModal/contents/ApiSettingsContent/tabs/ConversationCreateGeneratorTab',
  () => ({
    default: () => <div>generator-tab</div>,
  })
);

vi.mock('@/renderer/components/settings/SettingsModal/contents/ExtensionSettingsTabContent', () => ({
  default: ({ tabId }: { tabId: string }) => <div>embedded-extension:{tabId}</div>,
}));

describe('ApiSettingsContent diagnostics tab', () => {
  beforeEach(() => {
    testState.getApiConfig.mockReset();
    testState.getModelConfig.mockReset();
    testState.getAvailableAgents.mockReset();
    testState.getWebuiStatus.mockReset();
    testState.configStorageGet.mockReset();
    testState.getSettingsTabs.mockReset();
    testState.resolveExtTabName.mockClear();
    testState.messageError.mockReset();
    testState.messageSuccess.mockReset();
    testState.messageWarning.mockReset();

    testState.getApiConfig.mockResolvedValue({
      enabled: true,
      callbackEnabled: false,
      callbackMethod: 'POST',
    });
    testState.getModelConfig.mockResolvedValue([]);
    testState.getAvailableAgents.mockResolvedValue({ success: true, data: [] });
    testState.getWebuiStatus.mockResolvedValue({ success: false });
    testState.configStorageGet.mockResolvedValue(undefined);
  });

  it('renders diagnostics as an embedded api tab when the extension contributes it', async () => {
    testState.getSettingsTabs.mockResolvedValue([diagnosticsTab]);

    render(<ApiSettingsContent />);

    const diagnosticsButton = await screen.findByRole('button', { name: 'API Diagnostics' });
    fireEvent.click(diagnosticsButton);

    expect(await screen.findByText(`embedded-extension:${diagnosticsTab.id}`)).toBeInTheDocument();
    expect(testState.resolveExtTabName).toHaveBeenCalledWith(expect.objectContaining({ id: diagnosticsTab.id }));
  });

  it('keeps the api page tabs stable when diagnostics extension is unavailable', async () => {
    testState.getSettingsTabs.mockResolvedValue([]);

    render(<ApiSettingsContent />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'API Auth' })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'API Diagnostics' })).not.toBeInTheDocument();
    expect(screen.getByText('auth-tab')).toBeInTheDocument();
  });
});
