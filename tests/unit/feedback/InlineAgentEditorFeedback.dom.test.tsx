/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies InlineAgentEditor does not surface the FeedbackButton in error alerts.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const openFeedbackMock = vi.fn(() => Promise.resolve());
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: openFeedbackMock }),
}));

// ThemeContext is used by InlineAgentEditor for its CodeMirror theme —
// stub it so we don't have to mount the real provider.
vi.mock('@/renderer/hooks/context/ThemeContext', () => ({
  useThemeContext: () => ({ theme: 'light' }),
}));

// EmojiPicker + CodeMirror pull in large dependencies irrelevant to this test.
vi.mock('@/renderer/components/chat/EmojiPicker', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@uiw/react-codemirror', () => ({
  default: () => <div data-testid='codemirror-stub' />,
}));

// Drive the testStatus switch in the editor via the IPC mock.
const testCustomAgentMock = vi.fn();
vi.mock('@/common/adapter/ipcBridge', () => ({
  acpConversation: {
    testCustomAgent: { invoke: (...args: unknown[]) => testCustomAgentMock(...args) },
  },
}));

import InlineAgentEditor from '@/renderer/pages/settings/AgentSettings/InlineAgentEditor';

const renderEditor = () =>
  render(
    <ConfigProvider>
      <InlineAgentEditor onSave={vi.fn()} onCancel={vi.fn()} />
    </ConfigProvider>
  );

const fillCommandAndTest = async (user: ReturnType<typeof userEvent.setup>, command: string) => {
  // Name field must be filled or the form disables the test button? Actually
  // only `command` matters for the test button; set it via the second Input.
  const commandInput = document.querySelectorAll('.arco-input')[1] as HTMLInputElement;
  await act(async () => {
    await user.type(commandInput, command);
  });
  const testBtn = screen.getByRole('button', { name: /testConnectionBtn/i });
  await act(async () => {
    await user.click(testBtn);
  });
};

describe('InlineAgentEditor — FeedbackButton absence', () => {
  beforeEach(() => {
    openFeedbackMock.mockClear();
    testCustomAgentMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render FeedbackButton before testing', () => {
    renderEditor();
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('does not render FeedbackButton on successful test', async () => {
    testCustomAgentMock.mockResolvedValue({ step: 'success' });
    const user = userEvent.setup();
    renderEditor();
    await fillCommandAndTest(user, 'my-good-cli');
    await waitFor(() => {
      expect(screen.getByText('settings.testConnectionSuccess')).toBeInTheDocument();
    });
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('does not render FeedbackButton on fail_cli', async () => {
    testCustomAgentMock.mockResolvedValue({ step: 'fail_cli' });
    const user = userEvent.setup();
    renderEditor();
    await fillCommandAndTest(user, 'no-such-cli-xyz');

    await waitFor(() => {
      expect(screen.getByText('settings.testConnectionFailCli')).toBeInTheDocument();
    });

    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
    expect(openFeedbackMock).not.toHaveBeenCalled();
  });

  it('does not render FeedbackButton on fail_acp', async () => {
    testCustomAgentMock.mockResolvedValue({ step: 'fail_acp' });
    const user = userEvent.setup();
    renderEditor();
    await fillCommandAndTest(user, '/bin/echo');

    await waitFor(() => {
      expect(screen.getByText('settings.testConnectionFailAcp')).toBeInTheDocument();
    });

    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
    expect(openFeedbackMock).not.toHaveBeenCalled();
  });
});
