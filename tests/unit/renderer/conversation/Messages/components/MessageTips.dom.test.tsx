import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@renderer/components/chat/CollapsibleContent', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@renderer/components/Markdown', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='markdown-view'>{children}</div>,
}));

import MessageTips from '@/renderer/pages/conversation/Messages/components/MessageTips';

describe('MessageTips', () => {
  it('renders plain tip content as text instead of injecting HTML', () => {
    render(
      <MessageTips
        message={{
          id: 'tip-1',
          conversation_id: 'conversation-1',
          type: 'tips',
          content: {
            type: 'error',
            content: '<img src=x onerror=alert(1)>blocked',
          },
        }}
      />
    );

    expect(screen.getByText('<img src=x onerror=alert(1)>blocked')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('continues to render JSON tip payloads through MarkdownView', () => {
    render(
      <MessageTips
        message={{
          id: 'tip-2',
          conversation_id: 'conversation-1',
          type: 'tips',
          content: {
            type: 'warning',
            content: JSON.stringify({ hello: 'world' }),
          },
        }}
      />
    );

    expect(screen.getByTestId('markdown-view')).toBeInTheDocument();
    expect(screen.getByText(/"hello": "world"/)).toBeInTheDocument();
  });
});
