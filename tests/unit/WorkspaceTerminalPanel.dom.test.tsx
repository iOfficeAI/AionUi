import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockIsElectronDesktop = vi.fn(() => true);
const mockCreateSession = vi.fn().mockResolvedValue({ sessionId: 'session-1' });
const mockWrite = vi.fn().mockResolvedValue(undefined);
const mockResize = vi.fn().mockResolvedValue(undefined);
const mockDispose = vi.fn().mockResolvedValue(undefined);
const dataListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const exitListeners = new Set<(payload: { sessionId: string; code: number | null; signal: string | null }) => void>();

class MockResizeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const mockTerminalInstance = {
  cols: 120,
  rows: 30,
  open: vi.fn(),
  loadAddon: vi.fn(),
  onData: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  clear: vi.fn(),
  dispose: vi.fn(),
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    onClick,
    loading,
    ...props
  }: React.ComponentProps<'button'> & { type?: string; size?: string; loading?: boolean }) => (
    <button {...props} onClick={onClick} data-loading={loading ? 'true' : 'false'}>
      {children}
    </button>
  ),
  Message: {
    error: vi.fn(),
  },
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  Typography: {
    Title: ({ children }: React.PropsWithChildren<{ heading?: number }>) => <h3>{children}</h3>,
    Paragraph: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
    Text: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  },
}));

vi.mock('@icon-park/react', () => ({
  FolderCode: () => <span data-testid='icon-folder-code' />,
  FullScreen: () => <span data-testid='icon-fullscreen' />,
  Refresh: () => <span data-testid='icon-refresh' />,
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn();
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() {
      return mockTerminalInstance;
    }
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mockIsElectronDesktop(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    terminal: {
      createSession: { invoke: (...args: unknown[]) => mockCreateSession(...args) },
      write: { invoke: (...args: unknown[]) => mockWrite(...args) },
      resize: { invoke: (...args: unknown[]) => mockResize(...args) },
      dispose: { invoke: (...args: unknown[]) => mockDispose(...args) },
      data: {
        on: (listener: (payload: { sessionId: string; data: string }) => void) => {
          dataListeners.add(listener);
          return () => dataListeners.delete(listener);
        },
      },
      exit: {
        on: (listener: (payload: { sessionId: string; code: number | null; signal: string | null }) => void) => {
          exitListeners.add(listener);
          return () => exitListeners.delete(listener);
        },
      },
    },
  },
}));

vi.stubGlobal('ResizeObserver', MockResizeObserver);
vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
  callback(0);
  return 1;
});
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import WorkspaceTerminalPanel from '@/renderer/pages/conversation/Workspace/components/WorkspaceTerminalPanel';

describe('WorkspaceTerminalPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataListeners.clear();
    exitListeners.clear();
    mockIsElectronDesktop.mockReturnValue(true);
    localStorage.clear();
  });

  it('creates an embedded terminal session for the workspace', async () => {
    const { container } = render(<WorkspaceTerminalPanel workspacePath='/Users/chixson/Documents/project' />);

    await waitFor(() => {
      expect(mockCreateSession).toHaveBeenCalledWith({
        cwd: '/Users/chixson/Documents/project',
        cols: 120,
        rows: 30,
      });
    });

    expect(screen.getByText('conversation.workspace.terminal.title')).toBeInTheDocument();
    expect(screen.getByText('/Users/chixson/Documents/project')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.workspace.terminal.layoutBottom' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.workspace.terminal.layoutSide' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'conversation.workspace.terminal.layoutFloating' })).toBeInTheDocument();
    expect(container.querySelector('[data-layout-mode="bottom"]')).toBeInTheDocument();
    expect(mockTerminalInstance.open).toHaveBeenCalled();
  });

  it('switches layout modes and persists the selection', async () => {
    const { container } = render(<WorkspaceTerminalPanel workspacePath='/Users/chixson/Documents/project' />);

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'conversation.workspace.terminal.layoutSide' }));

    expect(container.querySelector('[data-layout-mode="side"]')).toBeInTheDocument();
    expect(localStorage.getItem('aionui:workspace-terminal-layout:/Users/chixson/Documents/project')).toBe('side');
  });

  it('sends terminal writes through the main-process bridge', async () => {
    render(<WorkspaceTerminalPanel workspacePath='/Users/chixson/Documents/project' />);

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalled());

    const payload = { sessionId: 'session-1', data: 'ls\r' };
    for (const listener of dataListeners) {
      listener(payload);
    }

    expect(mockTerminalInstance.write).toHaveBeenCalledWith('ls\r');
  });

  it('shows the unsupported state outside Electron desktop', () => {
    mockIsElectronDesktop.mockReturnValue(false);

    render(<WorkspaceTerminalPanel workspacePath='/Users/chixson/Documents/project' />);

    expect(screen.getByText('conversation.workspace.terminal.unsupported')).toBeInTheDocument();
  });
});
