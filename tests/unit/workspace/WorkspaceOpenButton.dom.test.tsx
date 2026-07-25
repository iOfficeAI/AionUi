/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkToolInstalledMock = vi.fn();
const openFolderWithMock = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    shell: {
      checkToolInstalled: { invoke: (...args: unknown[]) => checkToolInstalledMock(...args) },
      openFolderWith: { invoke: (...args: unknown[]) => openFolderWithMock(...args) },
    },
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    onClick,
    children,
    className,
  }: {
    onClick?: () => void;
    children?: React.ReactNode;
    className?: string;
  }) => (
    <button type='button' className={className} onClick={onClick}>
      {children}
    </button>
  ),
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Dropdown: ({
    droplist,
    children,
    popupVisible,
    onVisibleChange,
  }: {
    droplist?: React.ReactNode;
    children?: React.ReactNode;
    popupVisible?: boolean;
    onVisibleChange?: (open: boolean) => void;
  }) => (
    <div>
      <div
        data-testid='dropdown-trigger'
        onClick={() => onVisibleChange?.(!popupVisible)}
      >
        {children}
      </div>
      {popupVisible ? <div data-testid='dropdown-list'>{droplist}</div> : null}
    </div>
  ),
}));

vi.mock('@icon-park/react', () => ({
  Code: () => <span data-testid='icon-code' />,
  Command: () => <span data-testid='icon-command' />,
  Down: () => <span data-testid='icon-down' />,
  Folder: () => <span data-testid='icon-folder' />,
  Terminal: () => <span data-testid='icon-terminal' />,
}));

import WorkspaceOpenButton from '@/renderer/pages/conversation/components/ChatLayout/WorkspaceOpenButton';

describe('WorkspaceOpenButton', () => {
  beforeEach(() => {
    localStorage.clear();
    checkToolInstalledMock.mockReset();
    openFolderWithMock.mockReset();
    openFolderWithMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows Zed when installed and opens the workspace with tool zed', async () => {
    checkToolInstalledMock.mockImplementation(async ({ tool }: { tool: string }) => {
      if (tool === 'vscode') return false;
      if (tool === 'zed') return true;
      return false;
    });

    render(<WorkspaceOpenButton workspacePath='/tmp/project' isTemporary={false} />);

    await waitFor(() => {
      expect(checkToolInstalledMock).toHaveBeenCalledWith({ tool: 'vscode' });
      expect(checkToolInstalledMock).toHaveBeenCalledWith({ tool: 'zed' });
    });

    fireEvent.click(screen.getByTestId('dropdown-trigger'));

    await waitFor(() => {
      expect(screen.getByText('Zed')).toBeTruthy();
    });
    expect(screen.queryByText('VS Code')).toBeNull();
    expect(screen.getByText('Terminal')).toBeTruthy();
    expect(screen.getByText('File Explorer')).toBeTruthy();

    fireEvent.click(screen.getByText('Zed'));
    await waitFor(() => {
      expect(openFolderWithMock).toHaveBeenCalledWith({
        folder_path: '/tmp/project',
        tool: 'zed',
      });
    });
  });

  it('keeps VS Code available when the Zed install check rejects (version skew)', async () => {
    checkToolInstalledMock.mockImplementation(async ({ tool }: { tool: string }) => {
      if (tool === 'vscode') return true;
      if (tool === 'zed') throw new Error('unknown tool: zed');
      return false;
    });

    render(<WorkspaceOpenButton workspacePath='/tmp/project' isTemporary={false} />);

    await waitFor(() => {
      expect(checkToolInstalledMock).toHaveBeenCalledWith({ tool: 'zed' });
    });

    fireEvent.click(screen.getByTestId('dropdown-trigger'));

    await waitFor(() => {
      expect(screen.getByText('VS Code')).toBeTruthy();
    });
    expect(screen.queryByText('Zed')).toBeNull();
    expect(screen.getByText('Terminal')).toBeTruthy();
  });

  it('hides itself for temporary workspaces', () => {
    checkToolInstalledMock.mockResolvedValue(true);
    const { container } = render(
      <WorkspaceOpenButton workspacePath='/tmp/tmp-ws' isTemporary={true} />
    );
    expect(container.firstChild).toBeNull();
    expect(checkToolInstalledMock).not.toHaveBeenCalled();
  });
});
