import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCheckToolInstalled = vi.hoisted(() => vi.fn());
const mockOpenFolderWith = vi.hoisted(() => vi.fn());

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      checkToolInstalled: { invoke: (...args: unknown[]) => mockCheckToolInstalled(...args) },
      openFolderWith: { invoke: (...args: unknown[]) => mockOpenFolderWith(...args) },
    },
  },
}));

vi.mock('@icon-park/react', () => ({
  Command: () => <span data-testid='icon-command' />,
  Down: ({ className }: { className?: string }) => <span data-testid='icon-down' className={className} />,
  Folder: () => <span data-testid='icon-folder' />,
  Terminal: () => <span data-testid='icon-terminal' />,
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type='button' onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Dropdown: ({
    children,
    droplist,
    popupVisible,
    onVisibleChange,
  }: {
    children: React.ReactNode;
    droplist?: React.ReactNode;
    popupVisible?: boolean;
    onVisibleChange?: (visible: boolean) => void;
  }) => (
    <div>
      <div data-testid='workspace-dropdown-trigger' onClick={() => onVisibleChange?.(!popupVisible)}>
        {children}
      </div>
      {popupVisible ? droplist : null}
    </div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';

const STORAGE_KEY = 'workspace-open-preference';

describe('WorkspaceOpenButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockCheckToolInstalled.mockResolvedValue(false);
    mockOpenFolderWith.mockResolvedValue(undefined);
  });

  it('does not render any controls for temporary workspaces', () => {
    const { container } = render(<WorkspaceOpenButton workspacePath='/tmp/codex-temp-1775037616514' />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not break when switching between temporary and regular workspaces', async () => {
    const { rerender, container } = render(<WorkspaceOpenButton workspacePath='/workspace/project' />);

    await waitFor(() => {
      expect(mockCheckToolInstalled).toHaveBeenCalledWith({ tool: 'vscode' });
    });

    expect(() => {
      rerender(<WorkspaceOpenButton workspacePath='/tmp/codex-temp-1775037616514' />);
      rerender(<WorkspaceOpenButton workspacePath='/workspace/project' />);
    }).not.toThrow();

    expect(container).not.toBeEmptyDOMElement();
  });

  it('opens the saved preferred tool when it is available', async () => {
    localStorage.setItem(STORAGE_KEY, 'explorer');
    mockCheckToolInstalled.mockResolvedValue(true);

    render(<WorkspaceOpenButton workspacePath='/workspace/project' />);

    await waitFor(() => {
      expect(mockCheckToolInstalled).toHaveBeenCalledWith({ tool: 'vscode' });
    });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => {
      expect(mockOpenFolderWith).toHaveBeenCalledWith({
        folderPath: '/workspace/project',
        tool: 'explorer',
      });
    });
  });

  it('shows available tools in the dropdown and stores the selected preference', async () => {
    render(<WorkspaceOpenButton workspacePath='/workspace/project' />);

    await waitFor(() => {
      expect(mockCheckToolInstalled).toHaveBeenCalledWith({ tool: 'vscode' });
    });

    fireEvent.click(screen.getByTestId('workspace-dropdown-trigger'));

    expect(screen.queryByText('VS Code')).not.toBeInTheDocument();
    expect(screen.getByText('Terminal')).toBeInTheDocument();
    expect(screen.getByText('File Explorer')).toBeInTheDocument();

    fireEvent.click(screen.getByText('File Explorer'));

    await waitFor(() => {
      expect(mockOpenFolderWith).toHaveBeenCalledWith({
        folderPath: '/workspace/project',
        tool: 'explorer',
      });
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBe('explorer');
  });

  it('falls back to terminal when tool detection or open requests fail', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    mockCheckToolInstalled.mockRejectedValue(new Error('missing vscode'));
    mockOpenFolderWith.mockRejectedValue(new Error('open failed'));

    render(<WorkspaceOpenButton workspacePath='/workspace/project' />);

    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });

    fireEvent.click(screen.getAllByRole('button')[0]);

    await waitFor(() => {
      expect(mockOpenFolderWith).toHaveBeenCalledWith({
        folderPath: '/workspace/project',
        tool: 'terminal',
      });
    });

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
