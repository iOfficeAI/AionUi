/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AcpChat from '@/renderer/pages/conversation/platforms/acp/AcpChat';

const acpSendBoxMock = vi.fn(() => <div data-testid='mock-acp-sendbox'>sendbox</div>);
const useAcpMessageMock = vi.fn();

vi.mock('@renderer/pages/conversation/Messages/hooks', () => ({
  MessageListProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessageListLoadingProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MessagePaginationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useMessageLstCache: vi.fn(),
}));

vi.mock('@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery', () => ({
  usePendingConfirmationsRecovery: vi.fn(),
}));

vi.mock('@renderer/pages/team/hooks/TeamPermissionContext', () => ({
  useTeamPermission: () => null,
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  ConversationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/pages/conversation/Messages/artifacts', () => ({
  ConversationArtifactProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  default: () => <div data-testid='mock-message-list'>messages</div>,
}));

vi.mock('@renderer/pages/conversation/platforms/acp/AcpE2EStreamInjector', () => ({
  default: () => <div data-testid='mock-stream-injector'>injector</div>,
}));

vi.mock('@renderer/pages/conversation/platforms/acp/AcpSendBox', () => ({
  default: (props: unknown) => acpSendBoxMock(props),
}));

vi.mock('@renderer/pages/conversation/platforms/acp/useAcpMessage', () => ({
  useAcpMessage: (...args: unknown[]) => useAcpMessageMock(...args),
}));

vi.mock('@renderer/utils/ui/HOC', () => ({
  default: {
    Wrapper:
      (...providers: Array<React.FC<{ children: React.ReactNode }>>) =>
      (Component: React.FC<Record<string, unknown>>) => {
        const Wrapped: React.FC<Record<string, unknown>> = (props) => {
          let element = <Component {...props} />;
          for (const Provider of providers) {
            element = <Provider>{element}</Provider>;
          }
          return element;
        };
        return Wrapped;
      },
  },
}));

describe('AcpChat ad-hoc team running prop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAcpMessageMock.mockReturnValue({
      thought: { subject: '', description: '' },
      setThought: vi.fn(),
      running: false,
      hasHydratedRunningState: true,
      acpStatus: null,
      aiProcessing: false,
      setAiProcessing: vi.fn(),
      resetState: vi.fn(),
      tokenUsage: null,
      context_limit: 0,
      hasThinkingMessage: false,
      slashCommands: [],
      fetchSlashCommands: vi.fn(),
    });
  });

  it('renders the send box for a team-managed conversation', async () => {
    render(<AcpChat conversation_id='conv-1' backend='claude' />);

    await waitFor(() => expect(screen.getByTestId('mock-acp-sendbox')).toBeInTheDocument());
  });
});
