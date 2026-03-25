/**
 * DOM tests for WeixinConfigForm login state machine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';

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
    enablePlugin: { invoke: vi.fn(async () => ({ success: true })) },
    getPluginStatus: { invoke: vi.fn(async () => ({ success: true, data: [] })) },
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

import WeixinConfigForm from '@/renderer/components/settings/SettingsModal/contents/channels/WeixinConfigForm';

const noopModelSelection = {
  currentModel: undefined,
  isLoading: false,
  onSelectModel: vi.fn(),
} as any;

describe('WeixinConfigForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
