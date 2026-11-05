/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies ToolGroupBlock renders the FeedbackButton only when a tool call
 * has error status and wires it to module=conversation-session.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UnifiedToolBlock } from '@/common/chat/unifiedToolBlock';
import ToolGroupBlock from '@/renderer/pages/conversation/Messages/ToolBlocks/ToolGroupBlock';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const openFeedbackMock = vi.fn(() => Promise.resolve());
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: openFeedbackMock }),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/ToolConfirmationCard', () => ({
  default: () => null,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: { confirmMessage: { invoke: vi.fn() } },
  },
}));

const block = (status: UnifiedToolBlock['status']): UnifiedToolBlock =>
  ({
    key: 'c1',
    category: 'read',
    status,
    title: 'Read',
    fileName: 'a.ts',
    summary: 'ran something',
    output: 'ENOENT: no such file',
    outputKind: 'text',
    raw: { type: 'tool_call' },
  }) as never;

describe('ToolGroupBlock - FeedbackButton wiring', () => {
  beforeEach(() => {
    openFeedbackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render FeedbackButton on completed tool calls', () => {
    render(<ToolGroupBlock blocks={[block('completed')]} />);
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('does not render FeedbackButton on canceled tool calls', () => {
    render(<ToolGroupBlock blocks={[block('canceled')]} />);
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('renders FeedbackButton when status=error', () => {
    render(<ToolGroupBlock blocks={[block('error')]} />);
    expect(screen.getByText('settings.oneClickFeedback')).toBeInTheDocument();
  });

  it('click opens feedback with module=conversation-session', async () => {
    const user = userEvent.setup();
    render(<ToolGroupBlock blocks={[block('error')]} />);
    await user.click(screen.getByText('settings.oneClickFeedback'));

    expect(openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(openFeedbackMock).toHaveBeenCalledWith({
      module: 'conversation-session',
      autoScreenshot: true,
    });
  });
});
