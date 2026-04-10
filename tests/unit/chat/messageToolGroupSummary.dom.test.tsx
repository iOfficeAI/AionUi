import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';

// Mock dependencies before importing component
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Badge: ({ text, children }: { text?: string; children?: React.ReactNode }) => (
    <span data-testid='badge'>
      {text}
      {children}
    </span>
  ),
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconDown: () => <span>▼</span>,
  IconRight: () => <span>▶</span>,
}));

// eslint-disable-next-line
import MessageToolGroupSummary from '@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary';

describe('MessageToolGroupSummary', () => {
  it('renders without crashing when tool_group content is a valid array', () => {
    const messages = [
      {
        id: '1',
        conversation_id: 'conv-1',
        type: 'tool_group' as const,
        content: [
          {
            callId: 'call-1',
            name: 'Read',
            description: 'Reading file.ts',
            renderOutputAsMarkdown: false,
            status: 'Success' as const,
          },
        ],
      },
    ];

    const { container } = render(<MessageToolGroupSummary messages={messages} />);
    expect(container).toBeTruthy();
  });

  it('does not crash when tool_group content is a string instead of array', () => {
    const messages = [
      {
        id: '2',
        conversation_id: 'conv-1',
        type: 'tool_group' as const,
        content: 'unexpected string content' as any,
      },
    ];

    // Should not throw — the guard returns an empty array
    const { container } = render(<MessageToolGroupSummary messages={messages} />);
    expect(container).toBeTruthy();
  });

  it('does not crash when acp_tool_call update.content is a string instead of array', () => {
    const messages = [
      {
        id: '3',
        conversation_id: 'conv-1',
        type: 'acp_tool_call' as const,
        content: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tc-1',
            status: 'completed' as const,
            title: 'Read',
            kind: 'read' as const,
            content: 'unexpected string content' as any,
          },
        },
      },
    ];

    // Should not throw — the Array.isArray guard prevents .map() on a string
    const { container } = render(<MessageToolGroupSummary messages={messages} />);
    expect(container).toBeTruthy();
  });

  it('renders acp_tool_call correctly when update.content is a valid array', () => {
    const messages = [
      {
        id: '4',
        conversation_id: 'conv-1',
        type: 'acp_tool_call' as const,
        content: {
          update: {
            sessionUpdate: 'tool_call',
            toolCallId: 'tc-2',
            status: 'completed' as const,
            title: 'Read',
            kind: 'read' as const,
            content: [{ type: 'content' as const, content: { type: 'text' as const, text: 'file contents' } }],
          },
        },
      },
    ];

    const { container } = render(<MessageToolGroupSummary messages={messages} />);
    expect(container).toBeTruthy();
  });

  it('does not crash when tool_group content is undefined', () => {
    const messages = [
      {
        id: '5',
        conversation_id: 'conv-1',
        type: 'tool_group' as const,
        content: undefined as any,
      },
    ];

    const { container } = render(<MessageToolGroupSummary messages={messages} />);
    expect(container).toBeTruthy();
  });
});
