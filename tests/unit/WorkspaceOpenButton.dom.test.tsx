import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockIsElectronDesktop = vi.fn(() => true);
const mockIsTemporaryWorkspace = vi.fn(() => false);
const mockCheckToolInstalled = vi.fn().mockResolvedValue(false);
const mockOpenFolderWith = vi.fn().mockResolvedValue(undefined);
const mockDispatchWorkspaceTerminalOpenEvent = vi.fn();

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'> & { type?: string; size?: string }) => (
    <button {...props} onClick={onClick}>
      {children}
    </button>
  ),
  Dropdown: ({ children, droplist }: React.PropsWithChildren & { droplist?: React.ReactNode }) => (
    <>
      {children}
      {droplist}
    </>
  ),
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Command: () => <span data-testid='icon-command' />,
  BrowserChrome: () => <span data-testid='icon-browser-chrome' />,
  Down: () => <span data-testid='icon-down' />,
  Folder: () => <span data-testid='icon-folder' />,
  Terminal: () => <span data-testid='icon-terminal' />,
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => mockIsElectronDesktop(),
}));

vi.mock('@/renderer/utils/workspace/workspace', () => ({
  isTemporaryWorkspace: (p: string) => mockIsTemporaryWorkspace(p),
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  dispatchWorkspaceTerminalOpenEvent: (...args: unknown[]) => mockDispatchWorkspaceTerminalOpenEvent(...args),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      checkToolInstalled: { invoke: (...args: unknown[]) => mockCheckToolInstalled(...args) },
      openFolderWith: { invoke: (...args: unknown[]) => mockOpenFolderWith(...args) },
    },
  },
}));

import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';

describe('WorkspaceOpenButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsElectronDesktop.mockReturnValue(true);
    mockIsTemporaryWorkspace.mockReturnValue(false);
    mockCheckToolInstalled.mockResolvedValue(false);
    localStorage.clear();
  });

  it('renders in Electron desktop mode with non-temporary workspace', () => {
    const { container } = render(<WorkspaceOpenButton workspacePath='/home/user/project' />);
    expect(container.querySelector('.workspace-open-button')).not.toBeNull();
  });

  it('does not render in WebUI/browser mode', () => {
    mockIsElectronDesktop.mockReturnValue(false);
    const { container } = render(<WorkspaceOpenButton workspacePath='/home/user/project' />);
    expect(container.querySelector('.workspace-open-button')).toBeNull();
    expect(container.innerHTML).toBe('');
  });

  it('does not render for temporary workspaces', () => {
    mockIsTemporaryWorkspace.mockReturnValue(true);
    const { container } = render(<WorkspaceOpenButton workspacePath='/tmp/temp-workspace' />);
    expect(container.querySelector('.workspace-open-button')).toBeNull();
  });

  it('opens the embedded terminal by default', () => {
    render(<WorkspaceOpenButton workspacePath='/home/user/project' />);

    expect(screen.getAllByTestId('icon-terminal')[0]).toBeDefined();
    fireEvent.click(screen.getAllByRole('button')[0]);

    expect(mockDispatchWorkspaceTerminalOpenEvent).toHaveBeenCalledWith('/home/user/project');
    expect(mockOpenFolderWith).not.toHaveBeenCalled();
  });

  it('keeps external terminal as an explicit pop-out action', async () => {
    render(<WorkspaceOpenButton workspacePath='/home/user/project' />);

    await waitFor(() => {
      expect(screen.getByText('External Terminal')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('External Terminal'));

    expect(mockOpenFolderWith).toHaveBeenCalledWith({ folderPath: '/home/user/project', tool: 'terminal' });
    expect(mockDispatchWorkspaceTerminalOpenEvent).not.toHaveBeenCalledWith('/home/user/project');
  });

  it('shows Chrome tab in the dropdown and opens a blank tab', async () => {
    mockCheckToolInstalled.mockImplementation(({ tool }: { tool: string }) => Promise.resolve(tool === 'chrome'));

    render(<WorkspaceOpenButton workspacePath='/home/user/project' />);

    await waitFor(() => {
      expect(mockCheckToolInstalled).toHaveBeenCalledWith({ tool: 'chrome' });
    });

    expect(screen.getByText('Chrome Tab')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Chrome Tab'));

    await waitFor(() => {
      expect(mockOpenFolderWith).toHaveBeenCalledWith({
        folderPath: '/home/user/project',
        tool: 'chrome',
      });
    });
  });
});
