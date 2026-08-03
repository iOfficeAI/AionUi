/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listSkillFiles: vi.fn(),
  readSkillFile: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    fs: {
      listSkillFiles: { invoke: mocks.listSkillFiles },
      readSkillFile: { invoke: mocks.readSkillFile },
    },
  },
}));

vi.mock('@arco-design/web-react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@arco-design/web-react')>();
  type Node = { name: string; relativePath: string; type: 'directory' | 'file'; children?: Node[] };
  const renderNodes = (
    nodes: Node[],
    onSelect?: (keys: string[], extra: { node: { props: { dataRef: Node } } }) => void
  ) =>
    nodes.map((node) => (
      <React.Fragment key={node.relativePath}>
        <button type='button' onClick={() => onSelect?.([node.relativePath], { node: { props: { dataRef: node } } })}>
          {node.name}
        </button>
        {node.children ? renderNodes(node.children, onSelect) : null}
      </React.Fragment>
    ));

  return {
    ...actual,
    Tree: ({ treeData = [], onSelect }: { treeData?: Node[]; onSelect?: Parameters<typeof renderNodes>[1] }) => (
      <div data-testid='skill-file-tree'>{renderNodes(treeData, onSelect)}</div>
    ),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview/components/viewers/MarkdownViewer', () => ({
  default: ({ content, viewMode }: { content: string; viewMode?: string }) => (
    <div data-testid='markdown-viewer' data-view-mode={viewMode}>
      {content}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Preview/components/editors/CodeEditor', () => ({
  default: ({ value, readOnly }: { value: string; readOnly?: boolean }) => (
    <div data-testid='code-editor' data-read-only={String(Boolean(readOnly))}>
      {value}
    </div>
  ),
}));

import SkillFileBrowser from '@/renderer/pages/settings/SkillsSettings/SkillFileBrowser';

describe('SkillFileBrowser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders custom markdown files in read-only preview mode', async () => {
    mocks.listSkillFiles.mockResolvedValue([{ name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' }]);
    mocks.readSkillFile.mockResolvedValue('# Demo');

    render(<SkillFileBrowser skill={{ location: '/tmp/skills/demo/SKILL.md' }} />);

    await waitFor(() => expect(screen.getByTestId('markdown-viewer')).toHaveTextContent('# Demo'));
    expect(screen.getByTestId('markdown-viewer')).toHaveAttribute('data-view-mode', 'preview');
    expect(screen.queryByText('common.readOnly')).not.toBeInTheDocument();
    expect(screen.getByTestId('skill-file-tree-panel')).toBeInTheDocument();
    expect(screen.queryByText('preview.preview')).not.toBeInTheDocument();
    expect(screen.queryByText('preview.source')).not.toBeInTheDocument();
    expect(screen.queryByText('common.save')).not.toBeInTheDocument();
  });

  it('renders non-markdown files read-only for official skills', async () => {
    mocks.listSkillFiles.mockResolvedValue([{ name: 'config.json', relativePath: 'config.json', type: 'file' }]);
    mocks.readSkillFile.mockResolvedValue('{"enabled":true}');

    render(<SkillFileBrowser skill={{ location: '/tmp/builtin/demo/SKILL.md' }} />);

    await waitFor(() => expect(screen.getByTestId('code-editor')).toHaveAttribute('data-read-only', 'true'));
    expect(screen.queryByText('common.readOnly')).not.toBeInTheDocument();
    expect(screen.queryByText('common.save')).not.toBeInTheDocument();
  });

  it('shows a failure state when the selected file cannot be read', async () => {
    mocks.listSkillFiles.mockResolvedValue([{ name: 'SKILL.md', relativePath: 'SKILL.md', type: 'file' }]);
    mocks.readSkillFile.mockRejectedValue(new Error('unavailable'));

    render(<SkillFileBrowser skill={{ location: '/tmp/skills/demo/SKILL.md' }} />);

    await waitFor(() => expect(screen.getByText("Could not load this skill's files.")).toBeInTheDocument());
  });

  it('shows a failure state when the file tree cannot be loaded', async () => {
    mocks.listSkillFiles.mockRejectedValue(new Error('unavailable'));

    render(<SkillFileBrowser skill={{ location: '/tmp/skills/demo/SKILL.md' }} />);

    await waitFor(() => expect(screen.getByText("Could not load this skill's files.")).toBeInTheDocument());
  });
});
