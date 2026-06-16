/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration test for the FeedbackButton wired into MessageAgentStatus.
 * Ensures the link is shown only on 'error' status and invokes the feedback
 * hook with the 'conversation-session' module.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => {
      if (opts?.agent) return `${k}:${String(opts.agent)}`;
      return k;
    },
    i18n: { language: 'en' },
  }),
}));

const openFeedbackMock = vi.fn(() => Promise.resolve());
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: openFeedbackMock }),
}));

import MessageAgentStatus from '@/renderer/pages/conversation/Messages/components/MessageAgentStatus';
import type { IMessageAgentStatus } from '@/common/chat/chatLib';

const buildMessage = (status: IMessageAgentStatus['content']['status']): IMessageAgentStatus =>
  ({
    id: 'm1',
    type: 'agent_status',
    content: {
      backend: 'claude',
      status,
      agent_name: 'Claude',
    },
  }) as IMessageAgentStatus;

describe('MessageAgentStatus — FeedbackButton wiring', () => {
  beforeEach(() => {
    openFeedbackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render FeedbackButton on successful statuses', () => {
    render(<MessageAgentStatus message={buildMessage('connected')} />);
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('renders FeedbackButton when agent status is error', () => {
    render(<MessageAgentStatus message={buildMessage('error')} />);
    expect(screen.getByText('settings.oneClickFeedback')).toBeInTheDocument();
  });

  it('opens feedback with module=conversation-session on click', async () => {
    const user = userEvent.setup();
    render(<MessageAgentStatus message={buildMessage('error')} />);
    await user.click(screen.getByText('settings.oneClickFeedback'));

    expect(openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(openFeedbackMock).toHaveBeenCalledWith({
      module: 'conversation-session',
      autoScreenshot: true,
    });
  });

  it('falls back to a capitalized backend name without consulting runtime agent catalogs', () => {
    render(
      <MessageAgentStatus
        message={
          {
            id: 'm2',
            type: 'agent_status',
            content: {
              backend: 'codex',
              status: 'connected',
            },
          } as IMessageAgentStatus
        }
      />
    );

    expect(screen.getByText('Codex')).toBeInTheDocument();
    expect(screen.getByText('acp.status.connected:Codex')).toBeInTheDocument();
  });
});
