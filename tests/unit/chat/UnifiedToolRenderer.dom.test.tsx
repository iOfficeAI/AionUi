/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageToolCall } from '@/common/chat/chatLib';
import UnifiedToolRenderer from '@/renderer/pages/conversation/Messages/ToolBlocks/UnifiedToolRenderer';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/components/base/FileChangesPanel', () => ({
  __esModule: true,
  default: () => <div data-testid='file-changes-panel' />,
}));
vi.mock('@/renderer/hooks/file/useDiffPreviewHandlers', () => ({
  useDiffPreviewHandlers: () => ({ handleFileClick: vi.fn(), handleDiffClick: vi.fn() }),
}));

describe('UnifiedToolRenderer', () => {
  it('renders a tool_call via the matching category block', () => {
    const message: IMessageToolCall = {
      id: 'm1',
      conversation_id: 'c1',
      type: 'tool_call',
      content: { call_id: 'c1', name: 'Bash', status: 'completed', args: { command: 'ls' }, output: 'a\nb' },
    };
    render(<UnifiedToolRenderer message={message} />);
    // header shows the translated category title (action word, not the raw tool name)
    expect(screen.getByRole('button', { name: 'messages.toolBlocks.bashTitle' })).toBeInTheDocument();
    expect(screen.getByText('messages.toolBlocks.bashTitle')).toBeInTheDocument();
    // command shows up in both header summary and body command line
    expect(screen.getAllByText('ls').length).toBeGreaterThan(0);
  });

  it('renders nothing for a message that fails normalization', () => {
    render(
      <UnifiedToolRenderer
        message={{ id: 'x', conversation_id: 'c', type: 'tool_call', content: { call_id: '', name: 'X' } } as never}
      />
    );
    expect(screen.queryByText('messages.toolBlocks.genericTitle')).not.toBeInTheDocument();
  });
});
