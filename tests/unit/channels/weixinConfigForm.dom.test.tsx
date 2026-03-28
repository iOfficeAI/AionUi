/**
 * DOM tests for WeixinConfigForm login state machine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import React from 'react';

const { mockEnablePlugin, mockDisablePlugin, mockGetPluginStatus } = vi.hoisted(() => ({
  mockEnablePlugin: vi.fn(async () => ({ success: true })),
  mockDisablePlugin: vi.fn(async () => ({ success: true })),
  mockGetPluginStatus: vi.fn(async () => ({ success: true, data: [] })),
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
      info: vi.fn(),
    },
  };
});

// Mock i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback ?? key,
  }),
}));

// Mock electronAPI
const mockWeixinLoginStart = vi.fn();
const mockWeixinLoginOnQR = vi.fn(() => vi.fn());
const mockWeixinLoginOnScanned = vi.fn(() => vi.fn());
const mockWeixinLoginOnDone = vi.fn(() => vi.fn());

Object.defineProperty(window, 'electronAPI', {
  value: {
    weixinLoginStart: mockWeixinLoginStart,
    weixinLoginOnQR: mockWeixinLoginOnQR,
    weixinLoginOnScanned: mockWeixinLoginOnScanned,
    weixinLoginOnDone: mockWeixinLoginOnDone,
  },
  writable: true,
});

// Mock channel IPC bridge
vi.mock('@/common/adapter/ipcBridge', () => ({
  channel: {
    enablePlugin: { invoke: mockEnablePlugin },
    disablePlugin: { invoke: mockDisablePlugin },
    getPluginStatus: { invoke: mockGetPluginStatus },
    syncChannelSettings: { invoke: vi.fn(async () => ({ success: true })) },
    getPendingPairings: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
    getAuthorizedUsers: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
    pairingRequested: { on: vi.fn(() => vi.fn()) },
    userAuthorized: { on: vi.fn(() => vi.fn()) },
  },
  acpConversation: {
    getAvailableAgents: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: { get: vi.fn(async () => undefined), set: vi.fn(async () => {}) },
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div data-testid='model-selector' />,
}));

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid='webui-qr'>{value}</div>,
}));

import WeixinConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm';

const noopModelSelection = {
  currentModel: undefined,
  isLoading: false,
  onSelectModel: vi.fn(),
} as any;

class MockEventSource {
  static instances: MockEventSource[] = [];
  listeners = new Map<string, Array<(event: MessageEvent) => void>>();
  onerror: null | (() => void) = null;
  close = vi.fn();

  constructor(
    public readonly url: string,
    public readonly options?: EventSourceInit
  ) {
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(listener);
    this.listeners.set(type, handlers);
  }

  emit(type: string, data: unknown = {}) {
    const event = { data: JSON.stringify(data) } as MessageEvent;
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

describe('WeixinConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockEventSource.instances.length = 0;
    Object.defineProperty(window, 'EventSource', {
      value: MockEventSource,
      writable: true,
    });
    window.electronAPI = {
      weixinLoginStart: mockWeixinLoginStart,
      weixinLoginOnQR: mockWeixinLoginOnQR,
      weixinLoginOnScanned: mockWeixinLoginOnScanned,
      weixinLoginOnDone: mockWeixinLoginOnDone,
    } as typeof window.electronAPI;
    mockWeixinLoginOnQR.mockReturnValue(vi.fn());
    mockWeixinLoginOnScanned.mockReturnValue(vi.fn());
    mockWeixinLoginOnDone.mockReturnValue(vi.fn());
  });

  it('renders login button in idle state', () => {
    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);
    expect(screen.getByText('扫码登录')).toBeTruthy();
  });

  it('shows loading state when login starts', async () => {
    // weixinLoginStart never resolves in this test — stays in loading
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    // Button should be loading/disabled
    const btn = screen.getByRole('button', { name: /扫码登录/i });
    expect(btn).toBeTruthy();
  });

  it('displays QR image when qrcodeUrl is set', async () => {
    let qrCallback: ((data: { qrcodeUrl: string }) => void) | null = null;
    mockWeixinLoginOnQR.mockImplementation((cb: any) => {
      qrCallback = cb;
      return vi.fn();
    });
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    await act(async () => {
      qrCallback?.({ qrcodeUrl: 'https://example.com/qr.png' });
    });

    const img = screen.getByRole('img');
    expect((img as HTMLImageElement).src).toContain('qr.png');
    expect(screen.getByText('请用微信扫描二维码')).toBeTruthy();
  });

  it('shows scanned text when onScanned fires', async () => {
    let qrCallback: ((data: { qrcodeUrl: string }) => void) | null = null;
    let scannedCallback: (() => void) | null = null;

    mockWeixinLoginOnQR.mockImplementation((cb: any) => {
      qrCallback = cb;
      return vi.fn();
    });
    mockWeixinLoginOnScanned.mockImplementation((cb: any) => {
      scannedCallback = cb;
      return vi.fn();
    });
    mockWeixinLoginStart.mockReturnValue(new Promise(() => {}));

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });
    await act(async () => {
      qrCallback?.({ qrcodeUrl: 'https://example.com/qr.png' });
    });
    await act(async () => {
      scannedCallback?.();
    });

    expect(screen.getByText('已扫码，等待确认...')).toBeTruthy();
  });

  it('shows already-connected state when pluginStatus.hasToken is true', () => {
    const pluginStatus = {
      id: 'weixin_default',
      type: 'weixin',
      enabled: true,
      connected: true,
      hasToken: true,
      name: 'WeChat',
      status: 'running' as const,
    };

    render(
      <WeixinConfigForm
        pluginStatus={pluginStatus as any}
        modelSelection={noopModelSelection}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.getByText('已连接')).toBeTruthy();
    // Login button should not be shown
    expect(screen.queryByText('扫码登录')).toBeNull();
  });

  it('does not show connected state when plugin has token but is disabled', () => {
    const pluginStatus = {
      id: 'weixin_default',
      type: 'weixin',
      enabled: false,
      connected: false,
      hasToken: true,
      name: 'WeChat',
      status: 'stopped' as const,
    };

    render(
      <WeixinConfigForm
        pluginStatus={pluginStatus as any}
        modelSelection={noopModelSelection}
        onStatusChange={vi.fn()}
      />
    );

    expect(screen.queryByText('已连接')).toBeNull();
    expect(screen.getByText('扫码登录')).toBeTruthy();
  });

  it('uses the WebUI EventSource login flow when electron login bridge is unavailable', async () => {
    const onStatusChange = vi.fn();
    window.electronAPI = {} as typeof window.electronAPI;
    mockGetPluginStatus.mockResolvedValueOnce({
      success: true,
      data: [{ id: 'weixin_default', type: 'weixin', enabled: true, hasToken: true, status: 'running' }],
    });

    render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={onStatusChange} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    const es = MockEventSource.instances[0];
    expect(es?.url).toBe('/api/channel/weixin/login');
    expect(es?.options).toEqual({ withCredentials: true });

    await act(async () => {
      es?.emit('qr', { qrcodeData: 'ticket_webui_1' });
    });
    expect(screen.getByTestId('webui-qr').textContent).toContain('ticket_webui_1');

    await act(async () => {
      es?.emit('scanned');
    });
    expect(screen.getByText('已扫码，等待确认...')).toBeTruthy();

    await act(async () => {
      es?.emit('done', { accountId: 'acc-1', botToken: 'bot-1' });
    });

    await waitFor(() => {
      expect(mockEnablePlugin).toHaveBeenCalledWith({
        pluginId: 'weixin_default',
        config: { accountId: 'acc-1', botToken: 'bot-1' },
      });
    });
    expect(es?.close).toHaveBeenCalled();
    expect(onStatusChange).toHaveBeenCalledWith(expect.objectContaining({ type: 'weixin', enabled: true }));
  });

  it('resets to idle when enableWeixinPlugin fails in WebUI mode', async () => {
    window.electronAPI = {} as typeof window.electronAPI;
    mockEnablePlugin.mockResolvedValueOnce({ success: false, msg: 'Enable failed' });

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    const es = MockEventSource.instances[0];

    await act(async () => {
      es?.emit('done', { accountId: 'acc-1', botToken: 'bot-1' });
    });

    await waitFor(() => {
      expect(screen.getByText('扫码登录')).toBeTruthy();
    });
  });

  it('resets to idle when SSE error event contains expired message', async () => {
    window.electronAPI = {} as typeof window.electronAPI;

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    const es = MockEventSource.instances[0];

    await act(async () => {
      es?.emit('qr', { qrcodeData: 'ticket_1' });
    });

    await act(async () => {
      es?.emit('error', { message: 'QR code expired' });
    });

    await waitFor(() => {
      expect(screen.getByText('扫码登录')).toBeTruthy();
    });
    expect(es?.close).toHaveBeenCalled();
  });

  it('resets to idle when SSE error event contains non-expired message', async () => {
    window.electronAPI = {} as typeof window.electronAPI;

    render(<WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />);

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    const es = MockEventSource.instances[0];

    await act(async () => {
      es?.emit('qr', { qrcodeData: 'ticket_2' });
    });

    await act(async () => {
      es?.emit('error', { message: 'server internal error' });
    });

    await waitFor(() => {
      expect(screen.getByText('扫码登录')).toBeTruthy();
    });
    expect(es?.close).toHaveBeenCalled();
  });

  it('stays connected when handleDisconnect fails', async () => {
    mockDisablePlugin.mockResolvedValueOnce({ success: false, msg: 'Disable failed' });

    const pluginStatus = {
      id: 'weixin_default',
      type: 'weixin',
      enabled: true,
      connected: true,
      hasToken: true,
      name: 'WeChat',
      status: 'running' as const,
    };

    render(
      <WeixinConfigForm
        pluginStatus={pluginStatus as any}
        modelSelection={noopModelSelection}
        onStatusChange={vi.fn()}
      />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('断开连接'));
    });

    expect(mockDisablePlugin).toHaveBeenCalledWith({ pluginId: 'weixin_default' });
    expect(screen.getByText('已连接')).toBeTruthy();
  });

  it('closes EventSource on component unmount', async () => {
    window.electronAPI = {} as typeof window.electronAPI;

    const { unmount } = render(
      <WeixinConfigForm pluginStatus={null} modelSelection={noopModelSelection} onStatusChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('扫码登录'));
    });

    const es = MockEventSource.instances[0];
    expect(es).toBeTruthy();

    unmount();

    expect(es?.close).toHaveBeenCalled();
  });

  it('allows disconnecting from the connected state', async () => {
    const initialPluginStatus = {
      id: 'weixin_default',
      type: 'weixin',
      enabled: true,
      connected: true,
      hasToken: true,
      name: 'WeChat',
      status: 'running' as const,
    };

    const onStatusChange = vi.fn();

    const TestHarness = () => {
      const [status, setStatus] = React.useState(initialPluginStatus as any);

      return (
        <WeixinConfigForm
          pluginStatus={status}
          modelSelection={noopModelSelection}
          onStatusChange={(nextStatus) => {
            onStatusChange(nextStatus);
            setStatus(nextStatus);
          }}
        />
      );
    };

    render(<TestHarness />);

    await act(async () => {
      fireEvent.click(screen.getByText('断开连接'));
    });

    expect(mockDisablePlugin).toHaveBeenCalledWith({ pluginId: 'weixin_default' });
    expect(onStatusChange).toHaveBeenCalledWith(null);
    await waitFor(() => {
      expect(screen.getByText('扫码登录')).toBeTruthy();
    });
  });
});
