/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileChangeInfo, SnapshotInfo } from '@/common/types/platform/fileSnapshot';
import { ipcBridge } from '@/common';
import FileChangeList from '@/renderer/pages/conversation/Workspace/components/FileChangeList';

vi.mock('@/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      getBaselineContent: { invoke: vi.fn() },
    },
    fs: {
      readFile: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@/renderer/components/media/Diff2Html', () => ({
  __esModule: true,
  default: ({ diff, title, file_path }: { diff: string; title: string; file_path: string }) => (
    <div data-testid='diff-viewer' data-title={title} data-file-path={file_path}>
      {diff}
    </div>
  ),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    icon,
    onClick,
    children,
  }: {
    icon?: React.ReactNode;
    onClick?: (event: Event) => void;
    children?: React.ReactNode;
  }) => (
    <button type='button' onClick={(event) => onClick?.(event.nativeEvent)}>
      {icon}
      {children}
    </button>
  ),
  Empty: ({ description }: { description?: React.ReactNode }) => <div>{description}</div>,
  Spin: () => <span data-testid='spin' />,
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span data-testid='down-icon' />,
  Minus: () => <span data-testid='minus-icon' />,
  Plus: () => <span data-testid='plus-icon' />,
  PreviewOpen: () => <span data-testid='preview-icon' />,
  Redo: () => <span data-testid='redo-icon' />,
  Refresh: () => <span data-testid='refresh-icon' />,
  Right: () => <span data-testid='right-icon' />,
}));

const t = (key: string, options?: { count?: number }) => {
  if (key === 'conversation.workspace.changes.summary') return `${options?.count ?? 0} changed`;
  return key;
};

const baseProps = {
  t,
  workspace: 'C:\\Users\\demo\\repo',
  staged: [],
  loading: false,
  snapshotInfo: { mode: 'git-repo', branch: 'main' } satisfies SnapshotInfo,
  onRefresh: vi.fn(),
  onOpenDiff: vi.fn(),
  onStageFile: vi.fn(),
  onStageAll: vi.fn(),
  onUnstageFile: vi.fn(),
  onUnstageAll: vi.fn(),
  onDiscardFile: vi.fn(),
  onResetFile: vi.fn(),
};

const change = (overrides?: Partial<FileChangeInfo>): FileChangeInfo => ({
  file_path: 'C:\\Users\\demo\\repo\\src\\app.ts',
  relativePath: 'src/app.ts',
  operation: 'modify',
  ...overrides,
});

describe('FileChangeList', () => {
  beforeEach(() => {
    vi.mocked(ipcBridge.fileSnapshot.getBaselineContent.invoke).mockReset();
    vi.mocked(ipcBridge.fs.readFile.invoke).mockReset();
  });

  it('uses the normalized workspace path when expanding a modified file diff', async () => {
    vi.mocked(ipcBridge.fileSnapshot.getBaselineContent.invoke).mockResolvedValue('old line\n');
    vi.mocked(ipcBridge.fs.readFile.invoke).mockResolvedValue('new line\n');

    render(<FileChangeList {...baseProps} unstaged={[change()]} />);

    fireEvent.click(screen.getByRole('button', { name: /src\/app\.ts/ }));

    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer')).toHaveAttribute('data-file-path', 'C:\\Users\\demo\\repo\\src\\app.ts');
    });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenCalledWith({
      path: 'C:\\Users\\demo\\repo\\src\\app.ts',
      workspace: 'C:\\Users\\demo\\repo',
    });
    expect(screen.getByTestId('diff-viewer')).toHaveTextContent('-old line');
    expect(screen.getByTestId('diff-viewer')).toHaveTextContent('+new line');
  });

  it('falls back to the backend file path when the normalized path cannot be read', async () => {
    vi.mocked(ipcBridge.fileSnapshot.getBaselineContent.invoke).mockResolvedValue('before\n');
    vi.mocked(ipcBridge.fs.readFile.invoke)
      .mockRejectedValueOnce(new Error('missing normalized path'))
      .mockResolvedValueOnce('after\n');

    render(
      <FileChangeList
        {...baseProps}
        workspace={baseProps.workspace}
        unstaged={[change({ file_path: 'C:\\Temp\\aionui\\src\\app.ts' })]}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /src\/app\.ts/ }));

    await waitFor(() => {
      expect(screen.getByTestId('diff-viewer')).toHaveTextContent('+after');
    });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenNthCalledWith(1, {
      path: 'C:\\Users\\demo\\repo\\src\\app.ts',
      workspace: 'C:\\Users\\demo\\repo',
    });
    expect(ipcBridge.fs.readFile.invoke).toHaveBeenNthCalledWith(2, {
      path: 'C:\\Temp\\aionui\\src\\app.ts',
      workspace: 'C:\\Users\\demo\\repo',
    });
  });

  it('does not render a misleading empty diff when file content cannot be read', async () => {
    vi.mocked(ipcBridge.fileSnapshot.getBaselineContent.invoke).mockResolvedValue('before\n');
    vi.mocked(ipcBridge.fs.readFile.invoke).mockRejectedValue(new Error('file unavailable'));

    render(<FileChangeList {...baseProps} unstaged={[change({ file_path: 'C:\\Temp\\missing\\app.ts' })]} />);

    fireEvent.click(screen.getByRole('button', { name: /src\/app\.ts/ }));

    await waitFor(() => {
      expect(ipcBridge.fs.readFile.invoke).toHaveBeenCalledTimes(2);
    });
    expect(screen.queryByTestId('diff-viewer')).not.toBeInTheDocument();
  });
});
