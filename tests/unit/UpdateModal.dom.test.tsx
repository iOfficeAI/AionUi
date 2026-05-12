import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import UpdateModal from '../../src/renderer/components/settings/UpdateModal';

// Mock dependencies
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: any) => `${key}${params ? JSON.stringify(params) : ''}`,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    update: {
      open: { on: vi.fn(() => vi.fn()) },
      check: {
        invoke: vi.fn().mockResolvedValue({
          success: true,
          data: { currentVersion: '1.0.0', updateAvailable: false, latest: null },
        }),
      },
      download: { invoke: vi.fn() },
      downloadProgress: { on: vi.fn(() => vi.fn()) },
    },
    autoUpdate: {
      status: { on: vi.fn(() => vi.fn()) },
      check: { invoke: vi.fn().mockResolvedValue({ success: false }) },
      download: { invoke: vi.fn() },
      quitAndInstall: { invoke: vi.fn() },
    },
    shell: {
      openExternal: { invoke: vi.fn() },
      openFile: { invoke: vi.fn() },
      showItemInFolder: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: ({ children, visible }: any) => (visible ? <div data-testid='aion-modal'>{children}</div> : null),
}));

vi.mock('@/renderer/components/Markdown', () => ({
  default: () => <div data-testid='markdown' />,
}));

describe('UpdateModal', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('renders GIT_COMMIT_HASH when upToDate', async () => {
    process.env.GIT_COMMIT_HASH = '1234567';
    render(<UpdateModal />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal'));
    });

    expect(await screen.findByText('(1234567)')).toBeTruthy();
  });

  it('does not render GIT_COMMIT_HASH when unknown in upToDate', async () => {
    process.env.GIT_COMMIT_HASH = 'unknown';
    render(<UpdateModal />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal'));
    });

    expect(await screen.findByText('update.upToDateTitle')).toBeTruthy();
    expect(screen.queryByText('(unknown)')).toBeNull();
  });

  it('renders GIT_COMMIT_HASH when available', async () => {
    process.env.GIT_COMMIT_HASH = '1234567';
    const { ipcBridge } = await import('@/common');
    (ipcBridge.update.check.invoke as any).mockResolvedValueOnce({
      success: true,
      data: { currentVersion: '1.0.0', updateAvailable: true, latest: { version: '1.0.1' } },
    });

    render(<UpdateModal />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal'));
    });

    expect(await screen.findByText('(1234567)')).toBeTruthy();
  });

  it('does not render GIT_COMMIT_HASH when unknown in available', async () => {
    process.env.GIT_COMMIT_HASH = 'unknown';
    const { ipcBridge } = await import('@/common');
    (ipcBridge.update.check.invoke as any).mockResolvedValueOnce({
      success: true,
      data: { currentVersion: '1.0.0', updateAvailable: true, latest: { version: '1.0.1' } },
    });

    render(<UpdateModal />);

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui-open-update-modal'));
    });

    expect(await screen.findByText('update.availableTitle')).toBeTruthy();
    expect(screen.queryByText('(unknown)')).toBeNull();
  });
});
