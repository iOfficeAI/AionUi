/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalPanel } from '@/renderer/pages/conversation/Terminal/TerminalPanel';
import { dispatchTerminalExecEvent } from '@/renderer/pages/conversation/Terminal/terminalEvents';

// Stub matchMedia for xterm.js in jsdom
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const mockTerminalApi = vi.hoisted(() => ({
  create: vi.fn().mockResolvedValue({ id: 'terminal-test-proj', shell: '/bin/zsh', cwd: '/test/cwd' }),
  write: vi.fn().mockResolvedValue(undefined),
  resize: vi.fn().mockResolvedValue(undefined),
  kill: vi.fn().mockResolvedValue(undefined),
  onDataListener: vi.fn(),
  onExitListener: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      create: { invoke: mockTerminalApi.create },
      write: { invoke: mockTerminalApi.write },
      resize: { invoke: mockTerminalApi.resize },
      kill: { invoke: mockTerminalApi.kill },
      onData: {
        on: (cb: (payload: { id: string; data: string }) => void) => {
          mockTerminalApi.onDataListener = cb;
          return () => {};
        },
      },
      onExit: {
        on: (cb: (payload: { id: string; exitCode: number }) => void) => {
          mockTerminalApi.onExitListener = cb;
          return () => {};
        },
      },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  return {
    ...actual,
    Message: {
      success: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warning: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key }),
}));

describe('TerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders terminal toolbar and initializes terminal session', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    expect(screen.getByTestId('sidebar-terminal')).toBeDefined();
    expect(screen.getByTestId('terminal-container')).toBeDefined();
    expect(screen.getByTestId('terminal-clear-button')).toBeDefined();
    expect(screen.getByTestId('terminal-restart-button')).toBeDefined();

    await vi.waitFor(() => {
      expect(mockTerminalApi.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'terminal-test-proj',
          cwd: '/test/cwd',
        })
      );
    });

    await vi.waitFor(() => {
      expect(screen.getByText('$ zsh')).toBeDefined();
      expect(screen.getByText('cwd')).toBeDefined();
    });
  });

  it('clears terminal when clear button is clicked', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    const clearButton = screen.getByTestId('terminal-clear-button');
    fireEvent.click(clearButton);

    expect(mockTerminalApi.write).toHaveBeenCalledWith({
      id: 'terminal-test-proj',
      data: '\x0c',
    });
  });

  it('restarts terminal when restart button is clicked', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    const restartButton = screen.getByTestId('terminal-restart-button');
    await act(async () => {
      fireEvent.click(restartButton);
    });

    expect(mockTerminalApi.kill).toHaveBeenCalledWith({ id: 'terminal-test-proj' });
    expect(mockTerminalApi.create).toHaveBeenCalledTimes(2);
  });

  it('executes command when terminal execute event is dispatched', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    await act(async () => {
      dispatchTerminalExecEvent('npm test', 'test-proj');
    });

    expect(mockTerminalApi.write).toHaveBeenCalledWith({
      id: 'terminal-test-proj',
      data: 'npm test\r',
    });
  });

  it('ignores terminal execute events intended for another project', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    await act(async () => {
      dispatchTerminalExecEvent('npm test', 'different-proj');
    });

    expect(mockTerminalApi.write).not.toHaveBeenCalledWith(expect.objectContaining({ data: 'npm test\r' }));
  });

  it('receives onData and onExit events without throwing', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    await act(async () => {
      mockTerminalApi.onDataListener?.({ id: 'terminal-test-proj', data: 'streamed output' });
      mockTerminalApi.onExitListener?.({ id: 'terminal-test-proj', exitCode: 0 });
    });

    // Also verify event for a different terminal id is safely ignored
    await act(async () => {
      mockTerminalApi.onDataListener?.({ id: 'other-id', data: 'ignored' });
      mockTerminalApi.onExitListener?.({ id: 'other-id', exitCode: 1 });
    });
  });

  it('updates theme when data-theme attribute changes', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      // Trigger mutation observer
      await new Promise((r) => setTimeout(r, 20));
    });

    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      await new Promise((r) => setTimeout(r, 20));
    });
  });

  it('focuses terminal container on click', async () => {
    render(<TerminalPanel projectId='test-proj' cwd='/test/cwd' visible={true} />);

    const container = screen.getByTestId('terminal-container');
    expect(() => fireEvent.click(container)).not.toThrow();
  });
});
