/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for renderer/pages/settings/SidecarSettings.tsx (Phase 3 WS3).
 *
 * Covers:
 * - Renders the empty state when config has no sidecars
 * - Renders the list when config has sidecars
 * - Add form validates the port range and persists the new entry
 * - Remove calls DELETE and persists the updated list
 * - Open invokes the launcher (POST /api/sidecars) with the embed URL
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

vi.mock('@/common', () => ({
  ipcBridge: {
    sidecar: {
      list: { invoke: vi.fn().mockResolvedValue([]) },
      register: { invoke: vi.fn() },
      remove: { invoke: vi.fn() },
    },
    shell: {
      openExternal: { invoke: vi.fn().mockResolvedValue(undefined) },
    },
  },
}));

vi.mock('@/common/config/configService', () => {
  const subs = new Map<string, Set<(value: unknown) => void>>();
  let store: Record<string, unknown> = {};
  return {
    configService: {
      get: vi.fn((key: string) => store[key]),
      set: vi.fn(async (key: string, value: unknown) => {
        store = { ...store, [key]: value };
        for (const cb of subs.get(key) ?? []) cb(value);
      }),
      subscribe: vi.fn((key: string, cb: (value: unknown) => void) => {
        if (!subs.has(key)) subs.set(key, new Set());
        subs.get(key)!.add(cb);
        return () => subs.get(key)?.delete(cb);
      }),
      __reset: () => {
        store = {};
        subs.clear();
      },
      __set: (key: string, value: unknown) => {
        store = { ...store, [key]: value };
      },
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      // Light interpolation for the few keys we assert against.
      if (opts && typeof opts === 'object' && 'name' in opts) {
        return `${k}:${String(opts.name)}`;
      }
      if (opts && typeof opts === 'object' && 'count' in opts) {
        return `${k}:${String(opts.count)}`;
      }
      return k;
    },
    i18n: { language: 'en', changeLanguage: vi.fn() },
  }),
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/components/media/WebviewHost', () => ({
  default: ({ url }: { url: string }) => <div data-testid='webview-host' data-url={url} />,
}));

// Suppress Arco's `Message` toasts that would otherwise spam the test output.
vi.mock('@arco-design/web-react', async () => {
  const actual = await vi.importActual<typeof import('@arco-design/web-react')>('@arco-design/web-react');
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

import { ipcBridge } from '@/common';
import { configService } from '@/common/config/configService';
import SidecarSettings from '@/renderer/pages/settings/SidecarSettings';

const mockRegister = ipcBridge.sidecar.register.invoke as unknown as ReturnType<typeof vi.fn>;
const mockRemove = ipcBridge.sidecar.remove.invoke as unknown as ReturnType<typeof vi.fn>;
const mockSet = configService.set as unknown as ReturnType<typeof vi.fn>;

describe('SidecarSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (configService as unknown as { __reset: () => void }).__reset();
    // Make Message.success/error no-ops visible (already mocked above).
  });

  it('renders the empty state when no sidecars are configured', () => {
    render(<SidecarSettings />);
    expect(screen.getByTestId('settings-page-wrapper')).toBeInTheDocument();
    expect(screen.getByTestId('sidecar-empty')).toBeInTheDocument();
  });

  it('renders the configured list from config', () => {
    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [
      { name: 'ttyd', port: 7681, id: 'sc-1' },
      { name: 'openvscode', port: 8000 },
    ]);
    render(<SidecarSettings />);

    expect(screen.getByTestId('sidecar-row-ttyd')).toBeInTheDocument();
    expect(screen.getByTestId('sidecar-row-openvscode')).toBeInTheDocument();
    expect(screen.queryByTestId('sidecar-empty')).not.toBeInTheDocument();
  });

  it('add validates port range and persists the new entry', async () => {
    render(<SidecarSettings />);

    // Find the inputs by role — Arco's wrapper divs make data-testid
    // queries on the underlying `<input>` unreliable.
    const inputs = screen.getAllByRole('spinbutton', { hidden: true });
    const [portInput] = inputs;
    // The name input is a regular textbox.
    const nameInput = screen.getAllByRole('textbox', { hidden: true })[0] as HTMLInputElement;

    // The Arco `Form.Item` rule fires on form submit; emulate by
    // typing into the input (using fireEvent.change because user.type
    // hits pointer-events: none on Arco's wrapper span).
    fireEvent.change(nameInput, { target: { value: 'ttyd' } });
    fireEvent.change(portInput as HTMLInputElement, { target: { value: '80' } });
    fireEvent.click(screen.getByTestId('sidecar-add'));

    // Port 80 is below 1024 — the form rule should reject it without
    // persisting.
    expect(mockSet).not.toHaveBeenCalledWith('sidecars.items', expect.anything());

    // Now use a valid port.
    fireEvent.change(portInput as HTMLInputElement, { target: { value: '7681' } });
    fireEvent.click(screen.getByTestId('sidecar-add'));

    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('sidecars.items', [{ name: 'ttyd', port: 7681 }]);
    });
  });

  it('add rejects duplicate names', async () => {
    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [
      { name: 'ttyd', port: 7681, id: 'sc-1' },
    ]);
    render(<SidecarSettings />);

    const inputs = screen.getAllByRole('spinbutton', { hidden: true });
    const [portInput] = inputs;
    const nameInput = screen.getAllByRole('textbox', { hidden: true })[0] as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'ttyd' } });
    fireEvent.change(portInput as HTMLInputElement, { target: { value: '8000' } });
    fireEvent.click(screen.getByTestId('sidecar-add'));

    // No new persist call — the duplicate guard short-circuits.
    expect(mockSet).not.toHaveBeenCalledWith(
      'sidecars.items',
      expect.arrayContaining([expect.objectContaining({ name: 'ttyd', port: 8000 })])
    );
  });

  it('remove calls DELETE and persists the updated list', async () => {
    mockRemove.mockResolvedValue(undefined);
    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [
      { name: 'ttyd', port: 7681, id: 'sc-1' },
    ]);
    render(<SidecarSettings />);

    // Popconfirm wraps the remove button — fireEvent.click on the
    // button (not the inner span) dispatches the Popconfirm trigger.
    const removeBtn = screen.getByTestId('sidecar-remove-ttyd');
    fireEvent.click(removeBtn);

    // Popconfirm opens; the OK button uses `okText="common.confirm"`.
    // Wait for it to appear, then click it.
    const okBtn = await screen.findByText('common.confirm');
    fireEvent.click(okBtn);

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith({ id: 'sc-1' });
    });
    await waitFor(() => {
      expect(mockSet).toHaveBeenCalledWith('sidecars.items', []);
    });
  });

  it('open invokes the launcher (POST /api/sidecars) and renders the embed modal', async () => {
    mockRegister.mockResolvedValue({
      id: 'sc-1',
      name: 'ttyd',
      port: 7681,
      url: '/sidecar/sc-1/',
      token: 'tok-abc',
    });
    (configService as unknown as { __set: (k: string, v: unknown) => void }).__set('sidecars.items', [
      { name: 'ttyd', port: 7681, id: 'sc-1' },
    ]);
    render(<SidecarSettings />);

    fireEvent.click(screen.getByTestId('sidecar-open-ttyd'));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith({ name: 'ttyd', port: 7681 });
    });

    // The WebviewHost should be rendered with an embed URL carrying the token.
    const host = await screen.findByTestId('webview-host');
    expect(host.getAttribute('data-url')).toMatch(/\/sidecar\/sc-1\/.*sct=tok-abc/);
  });
});
