/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import enUsSettings from '@/renderer/services/i18n/locales/en-US/settings.json';

// --- Polyfills --------------------------------------------------------------
// Arco Design's responsive observer calls window.matchMedia during mount.
// jsdom does not provide it, so we stub a minimal implementation.
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

// --- Mocks ------------------------------------------------------------------

const mockTestConnection = vi.fn();
const mockCreate = vi.fn();
const mockHandshake = vi.fn();
const mockRefreshModels = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    remoteAgent: {
      testConnection: { invoke: (...args: unknown[]) => mockTestConnection(...args) },
      create: { invoke: (...args: unknown[]) => mockCreate(...args) },
      handshake: { invoke: (...args: unknown[]) => mockHandshake(...args) },
      refreshModels: { invoke: (...args: unknown[]) => mockRefreshModels(...args) },
    },
  },
}));

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/common/utils/defaultRemoteAgent', () => ({
  getDefaultRemoteAgentId: vi.fn(() => null),
  setDefaultRemoteAgentId: vi.fn(),
}));

// react-i18next passthrough — `t(key)` returns the key itself so tests can
// assert on the human label rather than the i18n key string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      // Resolve settings.* keys from the en-US JSON for readable assertions
      if (key.startsWith('settings.')) {
        const parts = key.split('.');
        let node: unknown = enUsSettings;
        for (let i = 1; i < parts.length; i++) {
          if (node && typeof node === 'object' && parts[i] in (node as Record<string, unknown>)) {
            node = (node as Record<string, unknown>)[parts[i]];
          } else {
            return key;
          }
        }
        if (typeof node === 'string') {
          return params
            ? Object.entries(params).reduce(
                (s, [k, v]) => s.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v)),
                node
              )
            : node;
        }
      }
      return key;
    },
    i18n: { language: 'en-US' },
  }),
}));

// Mock ThemeContext for AionModal
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ fontScale: 1 }),
}));

// Mock connectError utilities to use real implementations
vi.mock('@/renderer/utils/remote/connectError', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/utils/remote/connectError')>(
    '@/renderer/utils/remote/connectError'
  );
  return actual;
});

import ConnectWizard from '@/renderer/components/settings/ConnectWizard';
import {
  clearConnectWizardDismissal,
  dismissConnectWizard,
  isConnectWizardDismissed,
} from '@/renderer/components/settings/ConnectWizard/connectWizardState';

// --- Helpers ----------------------------------------------------------------

const fillUrl = async (url: string) => {
  const input = screen.getByPlaceholderText('http://192.168.0.5:4096');
  await act(async () => {
    fireEvent.change(input, { target: { value: url } });
  });
};

const clickConnect = () => {
  const btn = screen.getByRole('button', { name: /connect/i });
  fireEvent.click(btn);
};

// --- Tests ------------------------------------------------------------------

describe('ConnectWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockTestConnection.mockResolvedValue({ success: true });
    mockCreate.mockResolvedValue({ id: 'agent-123' });
    mockHandshake.mockResolvedValue({ status: 'ok' });
    mockRefreshModels.mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('happy path: fill URL → Connect → all steps succeed → Start chatting fires onCompleted', async () => {
    const onCompleted = vi.fn();
    render(<ConnectWizard visible onClose={vi.fn()} onCompleted={onCompleted} />);

    await fillUrl('http://myserver:4096');
    clickConnect();

    // Wait for all steps to complete
    await waitFor(() => {
      expect(screen.getByText(/all set/i)).toBeTruthy();
    });

    expect(mockTestConnection).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://myserver:4096', protocol: 'opencode' })
    );
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://myserver:4096', protocol: 'opencode' })
    );
    expect(mockHandshake).toHaveBeenCalledWith({ id: 'agent-123' });
    expect(mockRefreshModels).toHaveBeenCalledWith({ id: 'agent-123' });

    // Click "Start chatting"
    const startBtn = screen.getByRole('button', { name: /start chatting/i });
    fireEvent.click(startBtn);
    expect(onCompleted).toHaveBeenCalledWith('agent-123');
  });

  it('auth failure: shows classified error message and Back button', async () => {
    mockTestConnection.mockResolvedValue({
      success: false,
      error: '[code:auth_failure] 401 Unauthorized',
    });

    render(<ConnectWizard visible onClose={vi.fn()} />);

    await fillUrl('http://myserver:4096');
    clickConnect();

    await waitFor(() => {
      expect(screen.getByText(enUsSettings.connectError.auth_failure)).toBeTruthy();
    });

    // Back button should be available
    expect(screen.getByRole('button', { name: /back/i })).toBeTruthy();
  });

  it('tls failure surfaces retry-insecure button; clicking re-invokes with allow_insecure:true', async () => {
    let callCount = 0;
    mockTestConnection.mockImplementation(async (args: { allow_insecure?: boolean }) => {
      callCount++;
      if (callCount === 1 && !args.allow_insecure) {
        return { success: false, error: '[code:tls_failure] certificate verify failed' };
      }
      return { success: true };
    });

    render(<ConnectWizard visible onClose={vi.fn()} />);

    await fillUrl('https://myserver:4096');
    clickConnect();

    // Wait for the TLS error
    await waitFor(() => {
      expect(screen.getByText(enUsSettings.connectError.tls_failure)).toBeTruthy();
    });

    // The retry-insecure button should be visible
    const insecureBtn = screen.getByRole('button', { name: /insecure/i });
    expect(insecureBtn).toBeTruthy();

    // Click it
    await act(async () => {
      fireEvent.click(insecureBtn);
    });

    // testConnection should be called again with allow_insecure: true
    await waitFor(() => {
      expect(mockTestConnection).toHaveBeenCalledTimes(2);
      expect(mockTestConnection).toHaveBeenLastCalledWith(expect.objectContaining({ allow_insecure: true }));
    });
  });

  it('handshake failure after create: retry does NOT call create a second time', async () => {
    let handshakeCount = 0;
    mockHandshake.mockImplementation(async () => {
      handshakeCount++;
      if (handshakeCount === 1) {
        return { status: 'error', error: '[code:timeout] connection timed out' };
      }
      return { status: 'ok' };
    });

    render(<ConnectWizard visible onClose={vi.fn()} />);

    await fillUrl('http://myserver:4096');
    clickConnect();

    // Wait for handshake failure
    await waitFor(() => {
      expect(screen.getByText(enUsSettings.connectError.timeout)).toBeTruthy();
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Click retry
    const retryBtn = screen.getByRole('button', { name: /^retry$/i });
    await act(async () => {
      fireEvent.click(retryBtn);
    });

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText(/all set/i)).toBeTruthy();
    });

    // create should NOT be called a second time
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // handshake should be called twice
    expect(mockHandshake).toHaveBeenCalledTimes(2);
  });

  it('Skip persists dismissal and calls onClose; plain close does not persist', async () => {
    const onClose = vi.fn();
    const { unmount } = render(<ConnectWizard visible onClose={onClose} firstRun />);

    // Click Skip
    const skipBtn = screen.getByRole('button', { name: /skip/i });
    fireEvent.click(skipBtn);

    expect(isConnectWizardDismissed()).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Reset
    onClose.mockClear();
    clearConnectWizardDismissal();
    unmount();

    // Render again and close via the modal close (not Skip)
    render(<ConnectWizard visible onClose={onClose} firstRun />);

    // Find the close button (the AionModal close button)
    const closeBtn = screen.getByRole('button', { name: /close/i });
    // There might be multiple "Close" buttons — we want the AionModal header close
    // which is the aria-label='Close' button
    const ariaCloseBtn = screen.getByLabelText('Close');
    fireEvent.click(ariaCloseBtn);

    expect(isConnectWizardDismissed()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('connectWizardState localStorage roundtrip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('dismiss → isDismissed → clear', () => {
    expect(isConnectWizardDismissed()).toBe(false);
    dismissConnectWizard();
    expect(isConnectWizardDismissed()).toBe(true);
    clearConnectWizardDismissal();
    expect(isConnectWizardDismissed()).toBe(false);
  });
});
