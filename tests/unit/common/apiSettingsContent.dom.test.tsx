import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type MockInputProps = {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
};

type MockSelectProps = {
  value?: string;
  onChange?: (value: string) => void;
  options?: Array<{ label: string; value: string }>;
};

const testState = vi.hoisted(() => {
  const translations: Record<string, string> = {
    'common.copy': 'Copy',
    'common.copyFailed': 'Copy failed',
    'common.copySuccess': 'Copied',
    'common.loading': 'Please wait...',
    'common.refresh': 'Refresh',
    'common.save': 'Save',
    'common.unknownError': 'Unknown error',
    'settings.apiPage.title': 'Local HTTP API',
    'settings.apiPage.description':
      'Manage API access, conversation callbacks, and /api/v1/conversation/create payload generation from separate tabs.',
    'settings.apiPage.tabs.auth': 'API Auth',
    'settings.apiPage.tabs.callback': 'Conversation Callback',
    'settings.apiPage.tabs.generator': 'Parameter Generator',
    'settings.apiPage.auth.enableLabel': 'Enable HTTP API',
    'settings.apiPage.auth.enableDescription': 'Expose local capabilities through /api/v1/conversation/* routes.',
    'settings.apiPage.auth.tokenTitle': 'API Token',
    'settings.apiPage.auth.tokenDescription': 'Use a Bearer token to authenticate external requests.',
    'settings.apiPage.auth.tokenPlaceholder': 'Enter a token manually or generate a secure 64-character token',
    'settings.apiPage.auth.generateToken': 'Generate Token',
    'settings.apiPage.auth.tokenHint': 'Request header: Authorization: Bearer {token}',
    'settings.apiPage.auth.copySuccess': 'Token copied',
    'settings.apiPage.auth.diagnosticsMoved':
      'Conversation runtime diagnostics have moved to the standalone "API Diagnostics" page for focused debugging.',
    'settings.apiPage.docs.title': 'Swagger Docs',
    'settings.apiPage.docs.description':
      'Swagger docs are served by AionUi. In desktop mode, start WebUI first; in browser/server mode, open them directly from the current server.',
    'settings.apiPage.docs.statusReady': 'Direct Access Available',
    'settings.apiPage.docs.statusUnavailable': 'Start WebUI First',
    'settings.apiPage.docs.open': 'Open Docs',
    'settings.apiPage.docs.copySuccess': 'Swagger link copied',
    'settings.apiPage.docs.unavailableWarning': 'Start WebUI before opening Swagger docs.',
    'settings.apiPage.callback.title': 'Conversation Callback',
    'settings.apiPage.callback.description':
      'Send an HTTP callback to your service after a conversation turn finishes.',
    'settings.apiPage.callback.enableLabel': 'Enable callback',
    'settings.apiPage.callback.enableDescription':
      'Disabled by default. When enabled, completed conversations will trigger the callback below.',
    'settings.apiPage.callback.urlLabel': 'Callback URL',
    'settings.apiPage.callback.methodLabel': 'HTTP Method',
    'settings.apiPage.callback.headersTitle': 'Request Headers',
    'settings.apiPage.callback.headersDescription':
      'Add custom headers when your callback endpoint needs extra auth or metadata.',
    'settings.apiPage.callback.emptyHeaders': 'No custom headers added yet',
    'settings.apiPage.callback.headerKeyPlaceholder': 'Header name',
    'settings.apiPage.callback.headerValuePlaceholder': 'Header value',
    'settings.apiPage.callback.bodyLabel': 'Callback Body (JSON)',
    'settings.apiPage.callback.bodyVariables': 'Available template variables',
    'settings.apiPage.callback.jsFilterLabel': 'Enable JS filter',
    'settings.apiPage.callback.jsFilterDescription':
      'When disabled, the callback filter output stays empty. When enabled, the app runs jsFilter(input) and injects the returned string into the template.',
    'settings.apiPage.callback.jsFilterScriptLabel': 'JS filter script',
    'settings.apiPage.callback.restoreExample': 'Restore Example',
    'settings.apiPage.callback.jsFilterHint':
      'Define a jsFilter(input) function. Its return value will be injected into the callback payload.',
    'settings.apiPage.callback.disabledState':
      'Callback is currently disabled. Turn it on to configure URL, headers, request body, and JS filtering.',
    'settings.apiPage.generator.title': '/api/v1/conversation/create Parameter Generator',
    'settings.apiPage.generator.description':
      'Reuse the existing CLI detection, mode resolution, and model cache to build request payloads without manual guessing.',
    'settings.apiPage.generator.cliLabel': 'CLI',
    'settings.apiPage.generator.cliPlaceholder': 'Select CLI',
    'settings.apiPage.generator.modelLabel': 'Model',
    'settings.apiPage.generator.modelPlaceholder': 'Select model',
    'settings.apiPage.generator.modelFallbackPlaceholder': 'No provider model detected, placeholder model will be used',
    'settings.apiPage.generator.modelNotRequired': 'The current CLI type does not require a separate model field.',
    'settings.apiPage.generator.modeLabel': 'Mode',
    'settings.apiPage.generator.configOptionsLabel': 'CLI Conversation Options',
    'settings.apiPage.generator.configOptionsHint':
      'Choose an ACP or Codex-compatible CLI first to see its conversation options here.',
    'settings.apiPage.generator.workspaceLabel': 'Workspace (optional)',
    'settings.apiPage.generator.workspacePlaceholder': 'Leave empty to use the default AionUi workspace',
    'settings.apiPage.generator.messageLabel': 'First Message',
    'settings.apiPage.generator.messagePlaceholder':
      'Example: Scan the workspace first and summarize the project structure',
    'settings.apiPage.generator.resultTitle': 'Generated Result',
    'settings.apiPage.generator.resultDescription': 'Copy this JSON directly into POST /api/v1/conversation/create.',
    'settings.apiPage.generator.copyJson': 'Copy JSON',
    'settings.apiPage.generator.copySuccess': 'Generated JSON copied',
    'settings.apiPage.generator.refreshFailed': 'Failed to refresh generator sources',
    'settings.apiPage.messages.loadFailed': 'Failed to load API settings',
    'settings.apiPage.messages.saveSuccess': 'API settings saved',
    'settings.apiPage.messages.saveFailed': 'Failed to save API settings',
    'settings.apiPage.messages.enabled': 'HTTP API enabled',
    'settings.apiPage.messages.disabled': 'HTTP API disabled',
    'settings.apiPage.messages.toggleFailed': 'Failed to toggle HTTP API',
    'settings.apiPage.messages.generateTokenSuccess': 'Generated a new API token',
  };

  return {
    getApiConfig: vi.fn(),
    saveApiConfig: vi.fn(),
    updateApiEnabled: vi.fn(),
    getModelConfig: vi.fn(),
    getAvailableAgents: vi.fn(),
    getWebuiStatus: vi.fn(),
    openExternal: vi.fn(),
    openExternalUrl: vi.fn(),
    isElectronDesktop: vi.fn(() => true),
    configStorageGet: vi.fn(),
    messageSuccess: vi.fn(),
    messageError: vi.fn(),
    messageWarning: vi.fn(),
    clipboardWriteText: vi.fn(() => Promise.resolve()),
    translations,
    t: (key: string) => translations[key] || key,
  };
});

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: {
    writeText: testState.clipboardWriteText,
  },
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: testState.t,
  }),
}));

vi.mock('@icon-park/react', () => ({
  Copy: () => <span data-testid='icon-copy' />,
  Delete: () => <span data-testid='icon-delete' />,
  Plus: () => <span data-testid='icon-plus' />,
  Refresh: () => <span data-testid='icon-refresh' />,
}));

const arcoMockComponents = vi.hoisted(() => ({
  Button: ({ children, disabled, onClick }: React.PropsWithChildren<{ disabled?: boolean; onClick?: () => void }>) => (
    <button disabled={disabled} onClick={onClick} type='button'>
      {children}
    </button>
  ),
  InputComponent: ({ value, onChange, placeholder, readOnly }: MockInputProps) => (
    <input
      placeholder={placeholder}
      readOnly={readOnly}
      value={value || ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  TextArea: ({ value, onChange, placeholder, readOnly }: MockInputProps) => (
    <textarea
      placeholder={placeholder}
      readOnly={readOnly}
      value={value || ''}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
  Select: ({ value, onChange, options }: MockSelectProps) => (
    <select value={value} onChange={(event) => onChange?.(event.target.value)}>
      {(options || []).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
  Switch: ({ checked, onChange }: { checked?: boolean; onChange?: (checked: boolean) => void }) => (
    <input checked={checked} onChange={(event) => onChange?.(event.target.checked)} role='switch' type='checkbox' />
  ),
  Tabs: ({
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
              data-active={activeTab === resolvedKey}
              onClick={() => onChange?.(resolvedKey)}
              type='button'
            >
              {item.props.title}
            </button>
          );
        })}
      </div>
    );
  },
}));

vi.mock('@arco-design/web-react', () => {
  const Input = Object.assign(arcoMockComponents.InputComponent, { TextArea: arcoMockComponents.TextArea });
  const Tabs = Object.assign(arcoMockComponents.Tabs, {
    TabPane: ({ children }: React.PropsWithChildren) => <>{children}</>,
  });

  return {
    Button: arcoMockComponents.Button,
    Input,
    Message: {
      success: testState.messageSuccess,
      error: testState.messageError,
      warning: testState.messageWarning,
    },
    Select: arcoMockComponents.Select,
    Switch: arcoMockComponents.Switch,
    Tabs,
  };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      getApiConfig: { invoke: (...args: unknown[]) => testState.getApiConfig(...args) },
      saveApiConfig: { invoke: (...args: unknown[]) => testState.saveApiConfig(...args) },
      updateApiEnabled: { invoke: (...args: unknown[]) => testState.updateApiEnabled(...args) },
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
        on: () => vi.fn(),
      },
    },
    shell: {
      openExternal: { invoke: (...args: unknown[]) => testState.openExternal(...args) },
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

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => testState.isElectronDesktop(),
  openExternalUrl: (...args: unknown[]) => testState.openExternalUrl(...args),
}));

vi.mock('@/renderer/utils/model/agentModes', () => ({
  getAgentModes: () => [],
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => <div>AcpModelSelector</div>,
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div>AgentModeSelector</div>,
}));

vi.mock('@/renderer/pages/guid/components/GuidAcpConfigSelector', () => ({
  default: () => <div>GuidAcpConfigSelector</div>,
}));

import ApiSettingsContent from '@/renderer/components/settings/SettingsModal/contents/ApiSettingsContent';

describe('ApiSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    testState.getApiConfig.mockResolvedValue({
      enabled: true,
      authToken: 'token-123',
      callbackEnabled: false,
      callbackMethod: 'POST',
      callbackBody: '{"ok":true}',
      jsFilterEnabled: false,
      jsFilterScript: 'function jsFilter(input) { return ""; }',
    });
    testState.saveApiConfig.mockResolvedValue({ success: true });
    testState.updateApiEnabled.mockResolvedValue({ success: true });
    testState.getModelConfig.mockResolvedValue([
      {
        id: 'provider-1',
        platform: 'openai',
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: ['gpt-4o-mini'],
      },
    ]);
    testState.getAvailableAgents.mockResolvedValue({ success: true, data: [] });
    testState.getWebuiStatus.mockResolvedValue({
      success: true,
      data: {
        running: true,
        localUrl: 'http://localhost:25808',
      },
    });
    testState.isElectronDesktop.mockReturnValue(true);
    testState.configStorageGet.mockResolvedValue(undefined);
  });

  it('switches tabs and preserves callback form state', async () => {
    render(<ApiSettingsContent />);

    await waitFor(() => {
      expect(testState.getApiConfig).toHaveBeenCalledOnce();
    });

    fireEvent.click(await screen.findByText('Conversation Callback'));

    const callbackSwitch = screen.getByRole('switch');
    fireEvent.click(callbackSwitch);

    const callbackInput = await screen.findByPlaceholderText('https://your-server.com/webhook');
    fireEvent.change(callbackInput, { target: { value: 'https://callback.example.com/hook' } });

    fireEvent.click(await screen.findByText('Parameter Generator'));
    expect(screen.getByText('/api/v1/conversation/create Parameter Generator')).toBeInTheDocument();

    fireEvent.click(await screen.findByText('Conversation Callback'));

    expect(screen.getByDisplayValue('https://callback.example.com/hook')).toBeInTheDocument();
  });

  it('shows an error message when saving fails', async () => {
    testState.saveApiConfig.mockResolvedValue({ success: false, error: 'boom' });

    render(<ApiSettingsContent />);

    await waitFor(() => {
      expect(testState.getApiConfig).toHaveBeenCalledOnce();
    });

    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(testState.messageError).toHaveBeenCalledWith('Failed to save API settings: boom');
    });
  });

  it('keeps Swagger docs gated by runtime status in desktop mode', async () => {
    testState.getWebuiStatus.mockResolvedValue({
      success: true,
      data: {
        running: false,
        localUrl: 'http://localhost:25808',
      },
    });

    render(<ApiSettingsContent />);

    await waitFor(() => {
      expect(testState.getWebuiStatus).toHaveBeenCalledOnce();
    });

    expect(screen.getByDisplayValue('http://localhost:25808/api/docs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Docs' })).toBeDisabled();
  });

  it('opens Swagger docs directly from the current server in browser runtime', async () => {
    testState.isElectronDesktop.mockReturnValue(false);
    const currentOrigin = window.location.origin;
    window.history.replaceState({}, '', '/#/settings/api');

    render(<ApiSettingsContent />);

    await waitFor(() => {
      expect(testState.getApiConfig).toHaveBeenCalledOnce();
    });

    expect(testState.getWebuiStatus).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue(`${currentOrigin}/api/docs`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Docs' }));

    expect(testState.openExternalUrl).toHaveBeenCalledWith(`${currentOrigin}/api/docs`);
    expect(testState.messageWarning).not.toHaveBeenCalled();
  });
});
