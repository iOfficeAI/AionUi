/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies that the existing Workspace Changes list (`FileChangeList`) renders
 * server-provided patch text through the existing diff renderer without
 * recomputing the diff from local baseline/current file content. Local-mode
 * behavior (computing the diff via fileSnapshot baseline + fs.readFile) must be
 * preserved as the default.
 */

import type { FileChangeInfo } from '@/common/types/platform/fileSnapshot';
import FileChangeList from '@/renderer/pages/conversation/Workspace/components/FileChangeList';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBaselineContentInvoke = vi.fn();
const readFileInvoke = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      getBaselineContent: { invoke: (...args: unknown[]) => getBaselineContentInvoke(...args) },
    },
    fs: {
      readFile: { invoke: (...args: unknown[]) => readFileInvoke(...args) },
    },
  },
}));

// Render the real diff renderer as a probe so we can assert exactly what diff
// text reaches it.
vi.mock('@/renderer/components/media/Diff2Html', () => ({
  default: ({ diff, title }: { diff: string; title: string }) => (
    <div data-testid='diff2html' data-title={title}>
      {diff}
    </div>
  ),
}));

vi.mock('@/renderer/services/FileService', () => ({
  isTextFile: () => true,
}));

const t = ((key: string, params?: { defaultValue?: string }) => params?.defaultValue ?? key) as never;

const baseProps = {
  t,
  workspace: '/ws',
  staged: [] as FileChangeInfo[],
  loading: false,
  snapshotInfo: null,
  onRefresh: vi.fn(),
  onOpenDiff: vi.fn(),
  onStageFile: vi.fn(),
  onStageAll: vi.fn(),
  onUnstageFile: vi.fn(),
  onUnstageAll: vi.fn(),
  onDiscardFile: vi.fn(),
  onResetFile: vi.fn(),
};

describe('FileChangeList server patch rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a server-provided patch through the diff renderer without local content fetch', async () => {
    const patch = '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new';
    const unstaged: FileChangeInfo[] = [
      {
        file_path: '/ws/src/a.ts',
        relativePath: 'src/a.ts',
        operation: 'modify',
        patch,
        additions: 1,
        deletions: 1,
      },
    ];

    render(<FileChangeList {...baseProps} unstaged={unstaged} readOnly />);

    // Expand the row to reveal the inline diff.
    fireEvent.click(screen.getByText('src/a.ts'));

    await waitFor(() => {
      expect(screen.getByTestId('diff2html')).toBeInTheDocument();
    });

    expect(screen.getByTestId('diff2html')).toHaveTextContent('+new');
    // Critical: server patches bypass the local baseline/current content path.
    expect(getBaselineContentInvoke).not.toHaveBeenCalled();
    expect(readFileInvoke).not.toHaveBeenCalled();
  });

  it('preserves local-mode behavior by computing the diff from baseline + current content', async () => {
    getBaselineContentInvoke.mockResolvedValue('old\n');
    readFileInvoke.mockResolvedValue('new\n');

    const unstaged: FileChangeInfo[] = [
      {
        file_path: '/ws/src/b.ts',
        relativePath: 'src/b.ts',
        operation: 'modify',
      },
    ];

    render(<FileChangeList {...baseProps} unstaged={unstaged} />);

    fireEvent.click(screen.getByText('src/b.ts'));

    await waitFor(() => {
      expect(getBaselineContentInvoke).toHaveBeenCalledWith({ workspace: '/ws', file_path: 'src/b.ts' });
    });
    expect(readFileInvoke).toHaveBeenCalledWith({ path: '/ws/src/b.ts', workspace: '/ws' });

    await waitFor(() => {
      expect(screen.getByTestId('diff2html')).toBeInTheDocument();
    });
  });
});
