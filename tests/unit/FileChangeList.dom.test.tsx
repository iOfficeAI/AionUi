import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileChangeList from '@/renderer/pages/conversation/Workspace/components/FileChangeList';

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

const mockGetBaselineContent = vi.fn();
const mockReadFile = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    fileSnapshot: {
      getBaselineContent: {
        invoke: (...args: unknown[]) => mockGetBaselineContent(...args),
      },
    },
    fs: {
      readFile: {
        invoke: (...args: unknown[]) => mockReadFile(...args),
      },
    },
  },
}));

vi.mock('@/renderer/services/FileService', () => ({
  isTextFile: vi.fn(() => true),
}));

vi.mock('@/renderer/components/media/Diff2Html', () => ({
  default: ({ diff, title }: { diff: string; title?: string }) => (
    <div data-testid='inline-diff'>
      {title}:{diff}
    </div>
  ),
}));

describe('FileChangeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBaselineContent.mockResolvedValue('const before = 1;\n');
    mockReadFile.mockResolvedValue('const after = 2;\n');
  });

  const t = (key: string, options?: Record<string, unknown>) => String(options?.defaultValue ?? key);

  it('renders changed files for git workspaces', () => {
    render(
      <FileChangeList
        t={t as never}
        workspace='/repo'
        staged={[{ filePath: '/repo/src/b.ts', relativePath: 'src/b.ts', operation: 'create' }]}
        unstaged={[{ filePath: '/repo/src/a.ts', relativePath: 'src/a.ts', operation: 'modify' }]}
        loading={false}
        snapshotInfo={{ mode: 'git-repo', branch: 'main' }}
        onRefresh={vi.fn()}
        onOpenDiff={vi.fn()}
        onStageFile={vi.fn()}
        onStageAll={vi.fn()}
        onUnstageFile={vi.fn()}
        onUnstageAll={vi.fn()}
        onDiscardFile={vi.fn()}
        onResetFile={vi.fn()}
      />
    );

    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('src/b.ts')).toBeInTheDocument();
    expect(screen.getByText(/conversation\.workspace\.changes\.unstaged/)).toBeInTheDocument();
    expect(screen.getByText(/conversation\.workspace\.changes\.staged/)).toBeInTheDocument();
  });

  it('expands a file row and shows inline diff content', async () => {
    render(
      <FileChangeList
        t={t as never}
        workspace='/repo'
        staged={[]}
        unstaged={[{ filePath: '/repo/src/a.ts', relativePath: 'src/a.ts', operation: 'modify' }]}
        loading={false}
        snapshotInfo={{ mode: 'git-repo', branch: 'main' }}
        onRefresh={vi.fn()}
        onOpenDiff={vi.fn()}
        onStageFile={vi.fn()}
        onStageAll={vi.fn()}
        onUnstageFile={vi.fn()}
        onUnstageAll={vi.fn()}
        onDiscardFile={vi.fn()}
        onResetFile={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /src\/a\.ts/ }));

    await waitFor(() => {
      expect(screen.getByTestId('inline-diff')).toBeInTheDocument();
    });

    expect(mockGetBaselineContent).toHaveBeenCalledWith({
      workspace: '/repo',
      filePath: 'src/a.ts',
    });
    expect(mockReadFile).toHaveBeenCalledWith({ path: '/repo/src/a.ts' });
  });
});
