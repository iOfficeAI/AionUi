/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageAcpToolCall, IMessageText, IMessageToolGroup, TMessage } from '@/common/chat/chatLib';
import type { MessageFileChangesProps } from '@/renderer/pages/conversation/Messages/MessageFileChanges';
import {
  MessageListLoadingProvider,
  MessageListProvider,
  MessagePaginationProvider,
  useUpdateMessageList,
} from '@/renderer/pages/conversation/Messages/hooks';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';

const { parseDiffMock, useTeamPermissionMock } = vi.hoisted(() => ({
  parseDiffMock: vi.fn(),
  useTeamPermissionMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    key: 'location-key',
    state: {},
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Image: {
    PreviewGroup: ({ children }: PropsWithChildren) => <>{children}</>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => ({ conversation_id: 'conversation-1', type: 'aionrs' }),
}));

vi.mock('@/renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: useTeamPermissionMock,
}));

let mockIsProcessing = false;
vi.mock('@/renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  useConversationRuntimeView: () => ({ isProcessing: mockIsProcessing }),
}));

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: () => {},
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  useConversationArtifacts: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/useAutoScroll', () => ({
  useAutoScroll: () => ({
    handleScrollerRef: () => {},
    handleContentRef: () => {},
    handleScroll: () => {},
    handleWheel: () => {},
    handlePointerDown: () => {},
    showScrollButton: false,
    scrollToBottom: () => {},
    scrollElementIntoView: () => {},
    hideScrollButton: () => {},
  }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageText', () => ({
  default: ({ message, showCopyRow }: { message: IMessageText; showCopyRow?: boolean }) => (
    <div data-testid={`msgtext-${message.id}`} data-copy-row={String(showCopyRow ?? true)}>
      {message.content.content}
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageTips', () => ({
  default: () => <div>tips</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolCall', () => ({
  default: () => <div>tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroup', () => ({
  default: ({ message }: { message: IMessageToolGroup }) => (
    <div data-testid='tool-group' data-message-id={message.id}>
      tool_group
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageAgentStatus', () => ({
  default: () => <div>agent_status</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePermission', () => ({
  default: () => <div>permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpPermission', () => ({
  default: () => <div>acp_permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall', () => ({
  default: ({ message }: { message: IMessageAcpToolCall }) => (
    <div
      data-testid='acp-tool-call'
      data-message-id={message.id}
      data-diff-count={message.content.update.content?.filter((item) => item.type === 'diff').length ?? 0}
    >
      acp_tool_call
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePlan', () => ({
  default: () => <div>plan</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageThinking', () => ({
  default: () => <div>thinking</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronTrigger', () => ({
  default: () => <div>cron_trigger</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageSkillSuggest', () => ({
  default: () => <div>skill_suggest</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: ({ messages }: { messages: Array<IMessageToolGroup | IMessageAcpToolCall> }) => (
    <div data-testid='tool-summary'>{messages.map((message) => message.id).join(',')}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageFileChanges', () => ({
  __esModule: true,
  default: ({ diffsChanges }: MessageFileChangesProps) => (
    <div data-testid='file-changes' data-file-count={diffsChanges?.length ?? 0}>
      file_changes
    </div>
  ),
  parseDiff: parseDiffMock,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>down</span>,
}));

function createTextMessage(): IMessageText {
  return {
    id: 'message-1',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: {
      content: 'streaming reply',
    },
    created_at: 1,
  };
}

type AcpToolCallOptions = {
  id?: string;
  status?: IMessageAcpToolCall['content']['update']['status'];
  content?: IMessageAcpToolCall['content']['update']['content'];
  truncated?: boolean;
};

function createAcpToolCall({
  id = 'acp-edit-1',
  status = 'completed',
  content,
  truncated = false,
}: AcpToolCallOptions = {}): IMessageAcpToolCall {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-1',
    type: 'acp_tool_call',
    position: 'left',
    content: {
      session_id: 'session-1',
      ...(truncated
        ? {
            _compact: {
              truncated: true,
              original_size: 90000,
              preview_chars: 4096,
            },
          }
        : {}),
      update: {
        sessionUpdate: 'tool_call_update',
        tool_call_id: id,
        status,
        title: 'Edit file',
        kind: 'edit',
        content,
      },
    },
    created_at: 2,
  } as IMessageAcpToolCall;
}

function createToolGroup(content: IMessageToolGroup['content'], id = 'tool-group-1'): IMessageToolGroup {
  return {
    id,
    msg_id: id,
    conversation_id: 'conversation-1',
    type: 'tool_group',
    position: 'left',
    content,
    created_at: 2,
  };
}

function Wrapper({
  children,
  messages = [createTextMessage()],
  loading = false,
}: PropsWithChildren<{ messages?: TMessage[]; loading?: boolean }>): JSX.Element {
  return (
    <MessageListLoadingProvider value={loading}>
      <MessagePaginationProvider
        value={{ hasMoreBefore: false, hasMoreAfter: false, isLoadingBefore: false, isLoadingAnchor: false }}
      >
        <MessageListProvider value={messages}>{children}</MessageListProvider>
      </MessagePaginationProvider>
    </MessageListLoadingProvider>
  );
}

function ReplaceMessagesButton({ messages }: { messages: TMessage[] }): JSX.Element {
  const updateMessages = useUpdateMessageList();
  return <button onClick={() => updateMessages(messages)}>replace messages</button>;
}

describe('MessageList', () => {
  beforeEach(() => {
    mockIsProcessing = false;
    parseDiffMock.mockReset();
    parseDiffMock.mockReturnValue({
      file_name: 'file.ts',
      fullPath: '/workspace/file.ts',
      insertions: 1,
      deletions: 1,
      diff: 'diff',
    });
    useTeamPermissionMock.mockReturnValue(null);
  });

  it('renders message rows with external margin spacing in the plain scroll list', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    expect(screen.getByTestId('message-list-scroller')).toBeInTheDocument();
    expect(screen.getByTestId('message-list-content')).toBeInTheDocument();

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('m-t-10px');
    expect(messageRow.className).not.toContain('pt-10px');
  });

  it('uses container-responsive fluid width for standalone message rows', () => {
    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('chat-surface-fluid');
    expect(messageRow.className).not.toContain('w-[calc(100%-24px)]');
    expect(messageRow.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
    expect(messageRow.className).not.toContain('max-w-780px');
  });

  it('uses the full available row width in team mode', () => {
    useTeamPermissionMock.mockReturnValue({
      isTeamMode: true,
      isLeaderAgent: true,
      leaderConversationId: 'conversation-1',
      allConversationIds: ['conversation-1'],
      propagateMode: vi.fn(),
      warmupSession: vi.fn().mockResolvedValue(undefined),
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper>{children}</Wrapper>,
    });

    const messageRow = screen.getByTestId('message-text-left');
    expect(messageRow.className).toContain('w-full');
    expect(messageRow.className).toContain('max-w-full');
    expect(messageRow.className).not.toContain('w-[calc(100%-24px)]');
    expect(messageRow.className).not.toContain('md:w-[calc(100%-clamp(80px,10vw,240px))]');
  });

  it('shows the copy row only on the last AI text of each turn', () => {
    // Turn 1: thinking + text(a) + tool + text(b) -> row only on text(b).
    // A user message ends the turn. Turn 2: text(c) -> row on text(c).
    const messages = [
      { id: 'think-1', type: 'thinking', position: 'left', content: { content: 'thinking' }, created_at: 1 },
      { id: 'text-a', type: 'text', position: 'left', content: { content: 'a' }, created_at: 2 },
      { id: 'tool-1', type: 'tool_call', position: 'left', content: { content: 't' }, created_at: 3 },
      { id: 'text-b', type: 'text', position: 'left', content: { content: 'b' }, created_at: 4 },
      { id: 'user-1', type: 'text', position: 'right', content: { content: 'q' }, created_at: 5 },
      { id: 'text-c', type: 'text', position: 'left', content: { content: 'c' }, created_at: 6 },
    ] as unknown as IMessageText[];

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    // Intermediate AI text (followed by a tool then another text) hides the row.
    expect(screen.getByTestId('msgtext-text-a').getAttribute('data-copy-row')).toBe('false');
    // Last AI text of turn 1 (after the tool block) keeps the row — fallback strategy.
    expect(screen.getByTestId('msgtext-text-b').getAttribute('data-copy-row')).toBe('true');
    // User message always keeps its own row.
    expect(screen.getByTestId('msgtext-user-1').getAttribute('data-copy-row')).toBe('true');
    // Turn 2's only/last text keeps the row.
    expect(screen.getByTestId('msgtext-text-c').getAttribute('data-copy-row')).toBe('true');
  });

  it('withholds the streaming turn copy row but keeps earlier finished turns', () => {
    mockIsProcessing = true;
    // Turn 1 finished (text-a), then a user message, then turn 2 still streaming (text-b).
    const messages = [
      { id: 'text-a', type: 'text', position: 'left', content: { content: 'a' }, created_at: 1 },
      { id: 'user-1', type: 'text', position: 'right', content: { content: 'q' }, created_at: 2 },
      { id: 'text-b', type: 'text', position: 'left', content: { content: 'b' }, created_at: 3 },
    ] as unknown as IMessageText[];

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={messages}>{children}</Wrapper>,
    });

    // Earlier finished turn keeps its row even while a later turn streams.
    expect(screen.getByTestId('msgtext-text-a').getAttribute('data-copy-row')).toBe('true');
    // The in-progress final turn withholds its row until streaming ends.
    expect(screen.getByTestId('msgtext-text-b').getAttribute('data-copy-row')).toBe('false');
  });

  it('renders the empty slot when there are no messages', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => <Wrapper messages={[]}>{children}</Wrapper>,
    });

    expect(screen.getByText('empty state')).toBeInTheDocument();
  });

  it('renders a skeleton while the initial message batch is loading', () => {
    render(<MessageList emptySlot={<div>empty state</div>} />, {
      wrapper: ({ children }) => (
        <Wrapper messages={[]} loading>
          {children}
        </Wrapper>
      ),
    });

    expect(screen.getByTestId('message-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByText('empty state')).not.toBeInTheDocument();
  });

  it('renders complete ACP diffs through the specialized file-change message', () => {
    const message = createAcpToolCall({
      content: [
        { type: 'content', content: { type: 'text', text: 'updated both files' } },
        { type: 'diff', path: '/workspace/a.ts', old_text: 'old a', new_text: 'new a' },
        { type: 'diff', path: '/workspace/b.ts', old_text: 'old b', new_text: 'new b' },
      ],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '2');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('renders a newly created file when only new text is present', () => {
    const message = createAcpToolCall({
      content: [{ type: 'diff', path: '/workspace/new-file.ts', new_text: 'export const created = true;' }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '1');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('keeps ACP calls without diffs in View Steps', () => {
    const message = createAcpToolCall({
      id: 'acp-read-1',
      content: [{ type: 'content', content: { type: 'text', text: 'file contents' } }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent('acp-read-1');
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps malformed ACP diffs in View Steps instead of showing misleading stats', () => {
    const message = createAcpToolCall({
      content: [
        { type: 'diff', path: '/workspace/valid.ts', old_text: 'old', new_text: 'new' },
        null,
        { type: 'diff', new_text: 'missing path' },
      ] as unknown as IMessageAcpToolCall['content']['update']['content'],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps an ACP message without an update in View Steps', () => {
    const message = {
      ...createAcpToolCall({ id: 'acp-missing-update' }),
      content: { session_id: 'session-1' },
    } as unknown as IMessageAcpToolCall;

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('keeps truncated ACP diffs in View Steps instead of calculating stats from the preview', () => {
    const message = createAcpToolCall({
      truncated: true,
      content: [{ type: 'diff', path: '/workspace/file.ts', old_text: 'partial old', new_text: 'partial new' }],
    });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('acp-tool-call')).not.toBeInTheDocument();
  });

  it('switches a running tool from View Steps when its completed update adds a diff', () => {
    const runningMessage = createAcpToolCall({ status: 'in_progress' });
    const completedMessage = createAcpToolCall({
      content: [{ type: 'diff', path: '/workspace/file.ts', old_text: 'old', new_text: 'new' }],
    });
    render(
      <Wrapper messages={[runningMessage]}>
        <MessageList />
        <ReplaceMessagesButton messages={[completedMessage]} />
      </Wrapper>
    );

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(runningMessage.id);

    fireEvent.click(screen.getByText('replace messages'));

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-message-id', completedMessage.id);
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('preserves surrounding tool summaries when an ACP edit contains multiple diffs', () => {
    const readMessage = createAcpToolCall({ id: 'acp-read-1' });
    const editMessage = createAcpToolCall({
      id: 'acp-edit-1',
      content: [
        { type: 'diff', path: '/workspace/a.ts', old_text: 'old a', new_text: 'new a' },
        { type: 'diff', path: '/workspace/b.ts', old_text: 'old b', new_text: 'new b' },
      ],
    });
    const executeMessage = createAcpToolCall({ id: 'acp-execute-1' });

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[readMessage, editMessage, executeMessage]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('acp-tool-call')).toHaveAttribute('data-diff-count', '2');
    expect(screen.getAllByTestId('tool-summary')).toHaveLength(2);
    expect(screen.getAllByTestId('tool-summary').map((item) => item.textContent)).toEqual([
      'acp-read-1',
      'acp-execute-1',
    ]);
  });

  it('preserves the legacy single WriteFile summary path', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '1');
    expect(parseDiffMock).toHaveBeenCalledWith('diff --git a/file.ts b/file.ts\n-old\n+new', '/workspace/file.ts');
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('aggregates legacy groups containing only structured WriteFile results', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
      {
        call_id: 'write-2',
        description: 'Write second file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/second.ts b/second.ts\n-old\n+new',
          file_name: '/workspace/second.ts',
        },
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('file-changes')).toHaveAttribute('data-file-count', '2');
    expect(parseDiffMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('tool-summary')).not.toBeInTheDocument();
  });

  it('keeps mixed legacy tool groups in View Steps without dropping non-file tools', () => {
    const message = createToolGroup([
      {
        call_id: 'write-1',
        description: 'Write file',
        name: 'WriteFile',
        render_output_as_markdown: false,
        result_display: {
          file_diff: 'diff --git a/file.ts b/file.ts\n-old\n+new',
          file_name: '/workspace/file.ts',
        },
        status: 'Success',
      },
      {
        call_id: 'read-1',
        description: 'Read file',
        name: 'ReadFile',
        render_output_as_markdown: false,
        result_display: 'done',
        status: 'Success',
      },
    ]);

    render(<MessageList />, {
      wrapper: ({ children }) => <Wrapper messages={[message]}>{children}</Wrapper>,
    });

    expect(screen.getByTestId('tool-summary')).toHaveTextContent(message.id);
    expect(screen.queryByTestId('file-changes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('tool-group')).not.toBeInTheDocument();
  });
});
