/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import TaskToolBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/TaskToolBlock';
import TodoToolBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/TodoToolBlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { count?: number; done?: number; total?: number }) => {
      if (opts && 'count' in opts) return `${key}:${opts.count}`;
      if (opts && 'done' in opts) return `${key}:${opts.done}/${opts.total}`;
      return key;
    },
  }),
}));

const block = (extra: Partial<UnifiedToolBlock>): UnifiedToolBlock =>
  ({ key: 'k', category: 'task', status: 'completed', title: 'Task', outputKind: 'text', raw: { type: 'tool_call' } as never, ...extra });

describe('TaskToolBlock', () => {
  it('renders subagent type chip, prompt, nested steps and aggregates running status', () => {
    const steps = [
      block({ key: 's1', category: 'read', status: 'completed', fileName: 'a.ts', title: 'Read' }),
      block({ key: 's2', category: 'bash', status: 'running', command: 'grep x', title: 'Bash' }),
    ];
    render(
      <TaskToolBlock
        block={block({ status: 'running', subagentType: 'general-purpose', prompt: 'investigate', summary: 'desc' })}
        steps={steps}
      />
    );
    expect(screen.getByText('general-purpose')).toBeInTheDocument();
    expect(screen.getByText('investigate')).toBeInTheDocument();
    expect(screen.getByText('a.ts')).toBeInTheDocument();
    expect(screen.getByText('grep x')).toBeInTheDocument();
    // step count chip + steps section label
    expect(screen.getAllByText('messages.toolBlocks.taskStepsLabel:2').length).toBeGreaterThan(0);
  });

  it('expands a step row to reveal its output', () => {
    const steps = [block({ key: 's1', category: 'generic', status: 'completed', title: 'Mcp', input: '{"a":1}', output: 'ok' })];
    render(<TaskToolBlock block={block({ prompt: 'p' })} steps={steps} />);
    fireEvent.click(screen.getByText('Mcp'));
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
});

describe('TodoToolBlock', () => {
  it('renders progress chip and per-item status icons', () => {
    render(
      <TodoToolBlock
        block={block({
          category: 'todo',
          status: 'running',
          todoItems: [
            { content: 'step 1', status: 'completed' },
            { content: 'step 2', status: 'in_progress' },
            { content: 'step 3', status: 'pending' },
          ],
        })}
      />
    );
    expect(screen.getByText('messages.toolBlocks.progressXY:1/3')).toBeInTheDocument();
    expect(screen.getByText('step 1')).toBeInTheDocument();
    expect(screen.getByText('step 2')).toBeInTheDocument();
    expect(screen.getByText('step 3')).toBeInTheDocument();
  });

  it('renders update count chip when provided', () => {
    render(
      <TodoToolBlock
        block={block({ category: 'todo', todoItems: [{ content: 'a', status: 'pending' }] })}
        updateCount={3}
      />
    );
    expect(screen.getByText('messages.toolBlocks.updatedNTimes:3')).toBeInTheDocument();
  });

  it('falls back to generic rendering when todoItems is empty', () => {
    render(<TodoToolBlock block={block({ category: 'todo', title: 'TodoWrite' })} />);
    expect(screen.getAllByText('TodoWrite').length).toBeGreaterThan(0);
  });
});
