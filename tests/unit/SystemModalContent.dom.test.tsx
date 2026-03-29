import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// Mock window.matchMedia for Arco Design responsive observer
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

// === Mocking Dependencies === //

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en-US' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      loading: vi.fn(() => vi.fn()),
    },
    Modal: Object.assign(actual.Modal, { useModal: () => [{ confirm: vi.fn() }, <div key='modal-holder' />] }),
  };
});

vi.mock('@icon-park/react', () => ({
  FolderOpen: () => <span data-testid='icon-folder-open' />,
  FolderSearch: () => <span data-testid='icon-folder-search' />,
  Link: () => <span data-testid='icon-link' />,
}));

vi.mock('@/renderer/components/settings/LanguageSwitcher', () => ({
  default: () => <div data-testid='language-switcher' />,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: any) => <div data-testid='scroll-area'>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'modal',
}));

// IPC Bridge mocks
const mockGetCdpStatus = vi.fn();
const mockUpdateCdpConfig = vi.fn();
const mockRestart = vi.fn();
const mockOpenExternal = vi.fn();
const mockSystemInfo = vi.fn();
const mockIsDevToolsOpened = vi.fn();
const mockOpenDevTools = vi.fn();
const mockDevToolsStateChangedOn = vi.fn(() => vi.fn());
const mockGetCloseToTray = vi.fn();
const mockGetNotificationEnabled = vi.fn();
const mockGetCronNotificationEnabled = vi.fn();
const mockSetCloseToTray = vi.fn();
const mockSetNotificationEnabled = vi.fn();
const mockSetCronNotificationEnabled = vi.fn();
const mockOpenFile = vi.fn();
const mockShowOpen = vi.fn();
const mockUpdateSystemInfo = vi.fn();

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    application: {
      getCdpStatus: { invoke: (...args: any[]) => mockGetCdpStatus(...args) },
      updateCdpConfig: { invoke: (...args: any[]) => mockUpdateCdpConfig(...args) },
      restart: { invoke: (...args: any[]) => mockRestart(...args) },
      systemInfo: { invoke: (...args: any[]) => mockSystemInfo(...args) },
      isDevToolsOpened: { invoke: (...args: any[]) => mockIsDevToolsOpened(...args) },
      openDevTools: { invoke: (...args: any[]) => mockOpenDevTools(...args) },
      devToolsStateChanged: { on: (...args: any[]) => mockDevToolsStateChangedOn(...args) },
      updateSystemInfo: { invoke: (...args: any[]) => mockUpdateSystemInfo(...args) },
    },
    systemSettings: {
      getCloseToTray: { invoke: (...args: any[]) => mockGetCloseToTray(...args) },
      getNotificationEnabled: { invoke: (...args: any[]) => mockGetNotificationEnabled(...args) },
      getCronNotificationEnabled: { invoke: (...args: any[]) => mockGetCronNotificationEnabled(...args) },
      setCloseToTray: { invoke: (...args: any[]) => mockSetCloseToTray(...args) },
      setNotificationEnabled: { invoke: (...args: any[]) => mockSetNotificationEnabled(...args) },
      setCronNotificationEnabled: { invoke: (...args: any[]) => mockSetCronNotificationEnabled(...args) },
    },
    dialog: {
      showOpen: { invoke: (...args: any[]) => mockShowOpen(...args) },
    },
    shell: {
      openExternal: { invoke: (...args: any[]) => mockOpenExternal(...args) },
      openFile: { invoke: (...args: any[]) => mockOpenFile(...args) },
    },
  },
}));

// Mock SWR to control data fetching
let swrCache: Record<string, any> = {};
let swrMutateCallback: ((key: string) => void) | null = null;

vi.mock('swr', () => {
  const useSWR = (key: string, fetcher: () => Promise<any>) => {
    const [data, setData] = React.useState<any>(() => swrCache[key]);
    const [isLoading, setIsLoading] = React.useState(() => swrCache[key] === undefined);

    React.useEffect(() => {
      if (swrCache[key] !== undefined) {
        setData(swrCache[key]);
        setIsLoading(false);
        return;
      }
      fetcher().then((result) => {
        swrCache[key] = result;
        setData(result);
        setIsLoading(false);
      });
    }, [key]);

    // Register mutate listener
    React.useEffect(() => {
      swrMutateCallback = (mutateKey: string) => {
        if (mutateKey === key) {
          fetcher().then((result) => {
            swrCache[key] = result;
            setData(result);
          });
        }
      };
    }, [key]);

    return { data, isLoading, error: undefined };
  };

  const mutate = (key: string) => {
    if (swrMutateCallback) swrMutateCallback(key);
    return Promise.resolve();
  };

  useSWR.default = useSWR;
  return { default: useSWR, mutate };
});

import SystemModalContent from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent';

describe('SystemModalContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    swrCache = {};
    swrMutateCallback = null;

    // Default mock implementations
    mockGetCdpStatus.mockResolvedValue({
      data: {
        enabled: true,
        configEnabled: true,
        startupEnabled: true,
        port: 9230,
        isDevMode: true,
      },
    });
    mockSystemInfo.mockResolvedValue({
      cacheDir: '/tmp/cache',
      workDir: '/tmp/work',
      logDir: '/tmp/logs',
    });
    mockIsDevToolsOpened.mockResolvedValue(false);
    mockGetCloseToTray.mockResolvedValue(false);
    mockGetNotificationEnabled.mockResolvedValue(true);
    mockGetCronNotificationEnabled.mockResolvedValue(false);
  });

  it('should render system settings with language switcher and preferences', async () => {
    render(<SystemModalContent />);

    await waitFor(() => {
      expect(screen.getByTestId('language-switcher')).toBeInTheDocument();
    });

    expect(screen.getByText('settings.language')).toBeInTheDocument();
    expect(screen.getByText('settings.closeToTray')).toBeInTheDocument();
  });

  it('should render DevTools toggle button', async () => {
    mockIsDevToolsOpened.mockResolvedValue(false);

    render(<SystemModalContent />);

    await waitFor(() => {
      expect(screen.getByText('settings.openDevTools')).toBeInTheDocument();
    });
  });

  it('should toggle DevTools when button is clicked', async () => {
    mockIsDevToolsOpened.mockResolvedValue(false);
    mockOpenDevTools.mockResolvedValue(true);

    render(<SystemModalContent />);

    await waitFor(() => {
      expect(screen.getByText('settings.openDevTools')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('settings.openDevTools'));
    });

    expect(mockOpenDevTools).toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.getByText('settings.closeDevTools')).toBeInTheDocument();
    });
  });

  it('should update DevTools state via event listener', async () => {
    let eventCallback: ((event: { isOpen: boolean }) => void) | null = null;
    mockDevToolsStateChangedOn.mockImplementation((cb: any) => {
      eventCallback = cb;
      return vi.fn();
    });

    render(<SystemModalContent />);

    await waitFor(() => {
      expect(screen.getByText('settings.openDevTools')).toBeInTheDocument();
    });

    // Wait for the event listener to be registered via useEffect
    await waitFor(() => {
      expect(eventCallback).not.toBeNull();
    });

    // Simulate DevTools opened event from main process
    await act(async () => {
      eventCallback?.({ isOpen: true });
    });

    await waitFor(() => {
      expect(screen.getByText('settings.closeDevTools')).toBeInTheDocument();
    });
  });

  describe('CdpSettings', () => {
    it('should render CDP settings in dev mode', async () => {
      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.title')).toBeInTheDocument();
      });

      expect(screen.getByText('settings.cdp.enable')).toBeInTheDocument();
      expect(screen.getByText('http://127.0.0.1:9230')).toBeInTheDocument();
    });

    it('should not render CDP settings when not in dev mode', async () => {
      mockGetCdpStatus.mockResolvedValue({
        data: {
          enabled: false,
          configEnabled: false,
          startupEnabled: false,
          port: null,
          isDevMode: false,
        },
      });

      render(<SystemModalContent />);

      // Wait for loading to finish
      await waitFor(() => {
        expect(screen.getByText('settings.language')).toBeInTheDocument();
      });

      expect(screen.queryByText('settings.cdp.title')).not.toBeInTheDocument();
    });

    it('should toggle CDP enabled state', async () => {
      mockUpdateCdpConfig.mockResolvedValue({ success: true });
      const { Message } = await import('@arco-design/web-react');

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.enable')).toBeInTheDocument();
      });

      // Find the CDP switch - Arco Switch renders as <button role="switch">
      const cdpSection = screen.getByText('settings.cdp.title').parentElement!;
      const cdpSwitch = cdpSection.querySelector('button[role="switch"]');
      expect(cdpSwitch).toBeTruthy();

      await act(async () => {
        fireEvent.click(cdpSwitch!);
      });

      await waitFor(() => {
        expect(mockUpdateCdpConfig).toHaveBeenCalledWith({ enabled: false });
      });

      expect(Message.success).toHaveBeenCalledWith('settings.cdp.configSaved');
    });

    it('should show error message when CDP config update fails', async () => {
      mockUpdateCdpConfig.mockResolvedValue({ success: false, msg: 'Update failed' });
      const { Message } = await import('@arco-design/web-react');

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.enable')).toBeInTheDocument();
      });

      const cdpSection = screen.getByText('settings.cdp.title').parentElement!;
      const cdpSwitch = cdpSection.querySelector('button[role="switch"]');

      await act(async () => {
        fireEvent.click(cdpSwitch!);
      });

      await waitFor(() => {
        expect(Message.error).toHaveBeenCalledWith('Update failed');
      });
    });

    it('should show restart alert when config differs from runtime state', async () => {
      mockGetCdpStatus.mockResolvedValue({
        data: {
          enabled: false,
          configEnabled: true,
          startupEnabled: true,
          port: null,
          isDevMode: true,
        },
      });

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.restartRequired')).toBeInTheDocument();
      });

      expect(screen.getByText('settings.restartNow')).toBeInTheDocument();
    });

    it('should call restart when restart button is clicked', async () => {
      mockGetCdpStatus.mockResolvedValue({
        data: {
          enabled: false,
          configEnabled: true,
          startupEnabled: true,
          port: null,
          isDevMode: true,
        },
      });
      mockRestart.mockResolvedValue(undefined);

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.restartNow')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByText('settings.restartNow'));
      });

      expect(mockRestart).toHaveBeenCalled();
    });

    it('should show disabled hint when CDP is off and no port', async () => {
      mockGetCdpStatus.mockResolvedValue({
        data: {
          enabled: false,
          configEnabled: false,
          startupEnabled: false,
          port: null,
          isDevMode: true,
        },
      });

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.disabledHint')).toBeInTheDocument();
      });
    });

    it('should display MCP config with correct port', async () => {
      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByText('settings.cdp.mcpConfig')).toBeInTheDocument();
      });

      // Check MCP config contains the port
      const preElement = screen.getByText(/chrome-devtools-mcp@0\.16\.0/);
      expect(preElement).toBeInTheDocument();
      expect(preElement.textContent).toContain('--browser-url=http://127.0.0.1:9230');
    });

    it('should open CDP URL in browser', async () => {
      mockOpenExternal.mockResolvedValue(undefined);

      render(<SystemModalContent />);

      await waitFor(() => {
        expect(screen.getByTestId('icon-link')).toBeInTheDocument();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId('icon-link').closest('button')!);
      });

      expect(mockOpenExternal).toHaveBeenCalledWith('http://127.0.0.1:9230/json');
    });
  });
});
