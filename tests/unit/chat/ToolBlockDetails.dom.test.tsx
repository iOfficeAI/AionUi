/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import BashToolBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/BashToolBlock';
import EditToolBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/EditToolBlock';
import GenericToolBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/GenericToolBlock';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/base/FileChangesPanel', () => ({
  __esModule: true,
  default: () => <div data-testid='file-changes-panel' />,
}));
vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({ handleFileClick: vi.fn(), handleDiffClick: vi.fn() }),
}));

const block = (extra: Partial<UnifiedToolBlock>): UnifiedToolBlock => ({
  key: 'k',
  category: 'generic',
  status: 'completed',
  title: 'Tool',
  outputKind: 'text',
  raw: { type: 'tool_call' } as never,
  ...extra,
});

describe('BashToolBlock', () => {
  it('shows the command in the body (not the header) and error output in red', () => {
    render(
      <BashToolBlock
        block={block({ category: 'bash', command: 'cargo build', output: 'error: failed', status: 'error' })}
      />
    );
    // no description -> the command line lives only in the body (expand to reveal it)
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('cargo build')).toHaveLength(1);
    expect(screen.getByText(/error: failed/).className).toContain('tool-block__output--error');
  });

  it('prefers the human description in the header and shows the command only once', () => {
    render(<BashToolBlock block={block({ category: 'bash', command: 'ls -la', summary: '查看项目根目录结构' })} />);
    // header shows the description; the raw command lives only in the body
    expect(screen.getByText('查看项目根目录结构')).toBeInTheDocument();
    expect(screen.queryByText('ls -la')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText('ls -la')).toHaveLength(1);
  });

  it('shows the description exactly once when no separate command exists (tool_group path)', () => {
    render(<BashToolBlock block={block({ category: 'bash', summary: '查看项目根目录结构' })} />);
    expect(screen.getAllByText('查看项目根目录结构')).toHaveLength(1);
  });
});

describe('EditToolBlock', () => {
  it('renders diff counts as chips and FileChangesPanel with reconstructed patch', () => {
    render(
      <EditToolBlock
        block={block({
          category: 'edit',
          fileName: 'a.ts',
          filePath: '/ws/a.ts',
          diff: { added: 2, removed: 1 },
          input: JSON.stringify({ file_path: '/ws/a.ts', old_string: 'x', new_string: 'y' }, null, 2),
        })}
      />
    );
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('-1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByTestId('file-changes-panel')).toBeInTheDocument();
  });
});

describe('GenericToolBlock', () => {
  it('renders a prettified tool name and expands to show input/output', () => {
    render(<GenericToolBlock block={block({ title: 'SomeMcpTool', input: '{"a":1}', output: 'ok' })} />);
    expect(screen.getAllByText('Some Mcp Tool').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /genericTitle/ }));
    expect(screen.getByText(/"a":1/)).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('shows a translated action title for known tool names', () => {
    render(<GenericToolBlock block={block({ title: 'Glob', summary: '*.ts' })} />);
    expect(screen.getByText('messages.toolBlocks.fileMatch')).toBeInTheDocument();
    expect(screen.getByText('*.ts')).toBeInTheDocument();
  });

  it('classifies generic command tools by what the command does', () => {
    render(<GenericToolBlock block={block({ title: 'shell', command: 'cat src/a.ts' })} />);
    expect(screen.getByText('messages.toolBlocks.readTitle')).toBeInTheDocument();
  });

  it('shows the text exactly once when summary equals the title (ACP natural-language titles)', () => {
    render(<GenericToolBlock block={block({ title: '查看主进程各模块文件', summary: '查看主进程各模块文件' })} />);
    expect(screen.getAllByText('查看主进程各模块文件')).toHaveLength(1);
  });
});
