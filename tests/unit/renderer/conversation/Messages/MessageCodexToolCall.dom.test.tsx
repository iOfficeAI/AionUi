import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageCodexToolCall } from '@/common/chat/chatLib';
import MessageCodexToolCall from '@/renderer/pages/conversation/Messages/codex/MessageCodexToolCall';

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/ExecCommandDisplay', () => ({
  default: () => <div data-testid='exec-command-display' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/McpToolDisplay', () => ({
  default: () => <div data-testid='mcp-tool-display' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/GenericDisplay', () => ({
  default: () => <div data-testid='generic-display' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/WebSearchDisplay', () => ({
  default: () => <div data-testid='web-search-display' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/PatchDisplay', () => ({
  default: () => <div data-testid='patch-display' />,
}));

vi.mock('@/renderer/pages/conversation/Messages/codex/ToolCallComponent/TurnDiffDisplay', () => ({
  default: () => <div data-testid='turn-diff-display' />,
}));

function createCodexToolMessage(content: IMessageCodexToolCall['content']): IMessageCodexToolCall {
  return {
    id: 'message-1',
    type: 'codex_tool_call',
    conversation_id: 'conversation-1',
    content,
  };
}

describe('MessageCodexToolCall', () => {
  it('hides persisted native internal raw JSON cards', () => {
    const { container, rerender } = render(
      <MessageCodexToolCall
        message={createCodexToolMessage({
          toolCallId: 'native_error-1',
          status: 'success',
          kind: 'execute',
          subtype: 'generic',
          title: 'error',
          description: 'error',
          data: { method: 'error', params: { error: { message: 'raw' } } },
        })}
      />
    );

    expect(container).toBeEmptyDOMElement();

    rerender(
      <MessageCodexToolCall
        message={createCodexToolMessage({
          toolCallId: 'mcp_startup-1',
          status: 'executing',
          kind: 'mcp',
          subtype: 'mcp_tool_call_begin',
          description: 'codex_apps',
          data: { name: 'codex_apps', status: { type: 'starting' }, error: null },
        })}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('continues rendering real Codex tool calls', () => {
    render(
      <MessageCodexToolCall
        message={createCodexToolMessage({
          toolCallId: 'cmd-1',
          status: 'executing',
          kind: 'execute',
          subtype: 'exec_command_begin',
          description: 'bun test',
          data: { call_id: 'cmd-1', command: ['bun', 'test'], cwd: '/workspace' },
        })}
      />
    );

    expect(screen.getByTestId('exec-command-display')).toBeInTheDocument();
  });
});
