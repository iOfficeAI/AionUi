/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dispatchTerminalExecEvent } from '@/renderer/pages/conversation/Terminal/terminalEvents';

const mockTerminalInstance = {
  open: vi.fn(),
  dispose: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  clear: vi.fn(),
  reset: vi.fn(),
  focus: vi.fn(),
  cols: 80,
  rows: 24,
  options: { theme: {} },
};

vi.mock('@xterm/xterm', () => {
  class MockTerminal {
    open = mockTerminalInstance.open;
    dispose = mockTerminalInstance.dispose;
    loadAddon = mockTerminalInstance.loadAddon;
    onData = mockTerminalInstance.onData;
    write = mockTerminalInstance.write;
    writeln = mockTerminalInstance.writeln;
    clear = mockTerminalInstance.clear;
    reset = mockTerminalInstance.reset;
    focus = mockTerminalInstance.focus;
    cols = mockTerminalInstance.cols;
    rows = mockTerminalInstance.rows;
    options = mockTerminalInstance.options;
  }
  return { Terminal: MockTerminal };
});

vi.mock('@xterm/addon-fit', () => {
  class MockFitAddon {
    fit = vi.fn();
  }
  return { FitAddon: MockFitAddon };
});

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
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

const mockCreate = vi.fn();
const mockWrite = vi.fn();
const mockResize = vi.fn();
const mockKill = vi.fn();
let onDataListener: ((event: { id: string; data: string }) => void) | null = null;
let onExitListener: ((event: { id: string; exitCode: number }) => void) | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      create: { invoke: (...args: unknown[]) => mockCreate(...args) },
      write: { invoke: (...args: unknown[]) => mockWrite(...args) },
      resize: { invoke: (...args: unknown[]) => mockResize(...args) },
      kill: { invoke: (...args: unknown[]) => mockKill(...args) },
      onData: {
        on: (cb: (event: { id: string; data: string }) => void) => {
          onDataListener = cb;
          return () => {
            onDataListener = null;
          };
        },
      },
      onExit: {
        on: (cb: (event: { id: string; exitCode: number }) => void) => {
          onExitListener = cb;
          return () => {
            onExitListener = null;
          };
        },
      },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue || key,
  }),
}));

import { TerminalPanel } from '@/renderer/pages/conversation/Terminal';

describe('TerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onDataListener = null;
    onExitListener = null;
    mockCreate.mockResolvedValue({
      id: 'terminal-proj-1',
      shell: '/bin/zsh',
      cwd: '/workspace/my-project',
    });
  });

  it('initializes xterm and creates terminal session on mount', async () => {
    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith({
        id: 'terminal-proj-1',
        cwd: '/workspace/my-project',
        cols: 80,
        rows: 24,
      });
      expect(screen.getByText('$ zsh')).toBeInTheDocument();
      expect(screen.getByText('my-project')).toBeInTheDocument();
    });
  });

  it('forwards incoming terminal data to xterm', async () => {
    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    onDataListener?.({ id: 'terminal-proj-1', data: 'hello world\r\n' });
    expect(mockTerminalInstance.write).toHaveBeenCalledWith('hello world\r\n');
  });

  it('displays exit code when process exits', async () => {
    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    onExitListener?.({ id: 'terminal-proj-1', exitCode: 130 });
    expect(mockTerminalInstance.writeln).toHaveBeenCalledWith(
      expect.stringContaining('[Process exited with code 130]')
    );
  });

  it('executes external command event in active terminal', async () => {
    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    dispatchTerminalExecEvent('bun run test', 'proj-1');

    expect(mockWrite).toHaveBeenCalledWith({
      id: 'terminal-proj-1',
      data: 'bun run test\r',
    });
    expect(mockTerminalInstance.focus).toHaveBeenCalled();
  });

  it('clears terminal on clicking Clear button', async () => {
    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalled();
    });

    const clearBtn = screen.getByTestId('terminal-clear-button');
    fireEvent.click(clearBtn);

    expect(mockTerminalInstance.clear).toHaveBeenCalled();
    expect(mockWrite).toHaveBeenCalledWith({
      id: 'terminal-proj-1',
      data: '\x0c',
    });
  });

  it('restarts terminal session on clicking Restart button', async () => {
    mockKill.mockResolvedValue(undefined);

    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    const restartBtn = screen.getByTestId('terminal-restart-button');
    fireEvent.click(restartBtn);

    await waitFor(() => {
      expect(mockKill).toHaveBeenCalledWith({ id: 'terminal-proj-1' });
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });
  });

  it('handles create session error gracefully', async () => {
    mockCreate.mockRejectedValueOnce(new Error('PTY spawn failed'));

    render(<TerminalPanel projectId='proj-1' cwd='/workspace/my-project' />);

    await waitFor(() => {
      expect(mockTerminalInstance.writeln).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start terminal session')
      );
    });
  });
});
