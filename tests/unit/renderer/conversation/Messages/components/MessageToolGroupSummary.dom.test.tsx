import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageToolGroup } from '@/common/chat/chatLib';
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

vi.mock('@arco-design/web-react', () => ({
  Badge: ({ text, children }: { text?: string; children?: React.ReactNode }) => (
    <span>
      {text}
      {children}
    </span>
  ),
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconDown: () => <span data-testid='icon-down'>down</span>,
  IconRight: () => <span data-testid='icon-right'>right</span>,
}));

describe('MessageToolGroupSummary', () => {
  it('ignores malformed tool group content without crashing', () => {
    const malformedToolGroup = {
      id: 'tool-group-1',
      conversation_id: 'conversation-1',
      type: 'tool_group',
      content: 'not-an-array',
    } as unknown as IMessageToolGroup;

    const acpToolMessage = {
      id: 'acp-1',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {
        update: {
          sessionUpdate: 'tool_call',
          toolCallId: 'tool-1',
          status: 'failed',
          title: 'Read',
          kind: 'read',
          rawInput: { file_path: 'README.md' },
          content: 'not-an-array',
        },
      },
    } as unknown as IMessageAcpToolCall;

    render(<MessageToolGroupSummary messages={[malformedToolGroup, acpToolMessage]} />);

    fireEvent.click(screen.getByText('View Steps'));

    expect(screen.getByText('Read')).toBeTruthy();
    expect(screen.queryByText('not-an-array')).toBeNull();
  });

  it('filters out malformed ACP messages that are missing update payloads', () => {
    const malformedAcpMessage = {
      id: 'acp-2',
      conversation_id: 'conversation-1',
      type: 'acp_tool_call',
      content: {},
    } as unknown as IMessageAcpToolCall;

    render(<MessageToolGroupSummary messages={[malformedAcpMessage]} />);

    fireEvent.click(screen.getByText('View Steps'));

    expect(screen.queryByText('Input')).toBeNull();
    expect(screen.queryByText('Output')).toBeNull();
  });
});
