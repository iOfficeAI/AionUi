/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { IMessageAgentStatus } from '@/common/chat/chatLib';
import MessageAgentStatus from '@/renderer/pages/conversation/Messages/components/MessageAgentStatus';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { agent?: string }) => {
      if (key === 'acp.status.error') return 'Agent error';
      if (key === 'acp.status.connected') return `${options?.agent} connected`;
      if (key === 'acp.status.agentFallback') return 'Agent';
      return key;
    },
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Badge: ({ text }: { text: React.ReactNode }) => <span>{text}</span>,
  Typography: {
    Text: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  },
}));

const createMessage = (content: unknown): IMessageAgentStatus =>
  ({
    id: 'message-1',
    conversation_id: 'conversation-1',
    type: 'agent_status',
    position: 'center',
    content,
  }) as IMessageAgentStatus;

describe('MessageAgentStatus', () => {
  it('renders legacy error status messages that do not include a backend', () => {
    render(<MessageAgentStatus message={createMessage({ status: 'error' })} />);

    expect(screen.getByText('Agent')).toBeInTheDocument();
    expect(screen.getByText('Agent error')).toBeInTheDocument();
  });

  it('uses the configured backend display name when backend is present', () => {
    render(<MessageAgentStatus message={createMessage({ backend: 'codex', status: 'connected' })} />);

    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('Codex connected')).toBeInTheDocument();
  });
});
