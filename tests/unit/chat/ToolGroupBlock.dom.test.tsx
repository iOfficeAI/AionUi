/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import ToolGroupBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/ToolGroupBlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { done?: number; total?: number; count?: number }) =>
      opts && 'done' in opts ? `${key}:${opts.done}/${opts.total}` : key,
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/ToolConfirmationCard', () => ({
  __esModule: true,
  default: () => <div data-testid='confirmation-card' />,
}));

const block = (
  key: string,
  category: UnifiedToolBlock['category'],
  extra: Partial<UnifiedToolBlock> = {}
): UnifiedToolBlock => ({
  key,
  category,
  status: 'completed',
  title: key,
  outputKind: 'text',
  raw: { type: 'tool_call' } as never,
  ...extra,
});

describe('ToolGroupBlock', () => {
  it('renders read and edit runs as separate list segments with batch titles', () => {
    render(
      <ToolGroupBlock
        blocks={[
          block('r1', 'read', { fileName: 'a.ts', lineRange: 'L1-10' }),
          block('r2', 'read', { fileName: 'c.ts' }),
          block('e1', 'edit', { fileName: 'b.ts', diff: { added: 2, removed: 1 } }),
          block('e2', 'edit', { fileName: 'd.ts', diff: { added: 1, removed: 1 } }),
        ]}
      />
    );
    expect(screen.getByText('messages.toolBlocks.batchReadFiles')).toBeInTheDocument();
    expect(screen.getByText('messages.toolBlocks.batchEditFiles')).toBeInTheDocument();
    expect(screen.queryByText('messages.toolBlocks.readTitle')).not.toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('b.ts')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('renders a bash timeline segment with expandable command output', () => {
    render(
      <ToolGroupBlock
        blocks={[
          block('b1', 'bash', { command: 'cargo test', output: 'ok', status: 'completed' }),
          block('b2', 'bash', { command: 'cargo clippy', status: 'running' }),
        ]}
      />
    );
    expect(screen.getByText('messages.toolBlocks.batchRunCommands')).toBeInTheDocument();
    fireEvent.click(screen.getByText('cargo test'));
    // expanded body shows the command line AND the output (reference layout)
    expect(screen.getAllByText('cargo test')).toHaveLength(2);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('renders todo segment with update count using latest snapshot only', () => {
    render(
      <ToolGroupBlock
        blocks={[
          block('t1', 'todo', { todoItems: [{ content: 'old', status: 'completed' }] }),
          block('t2', 'todo', { todoItems: [{ content: 'new', status: 'pending' }] }),
        ]}
      />
    );
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.queryByText('old')).not.toBeInTheDocument();
  });

  it('renders confirmation items via ToolConfirmationCard', () => {
    render(
      <ToolGroupBlock
        blocks={[block('r1', 'read', { fileName: 'a.ts' })]}
        confirmationItems={[
          {
            call_id: 'x',
            description: '',
            name: 'Edit',
            render_output_as_markdown: false,
            status: 'Confirming',
            confirmationDetails: { type: 'edit', title: 't', file_name: 'a.ts', file_diff: '' },
          } as never,
        ]}
      />
    );
    expect(screen.getByTestId('confirmation-card')).toBeInTheDocument();
  });
});
