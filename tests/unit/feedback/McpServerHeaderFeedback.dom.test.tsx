/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Verifies McpServerHeader only renders the FeedbackButton when the server
 * status is 'error', and that it is wired to module=mcp-tools.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfigProvider } from '@arco-design/web-react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

const openFeedbackMock = vi.fn(() => Promise.resolve());
vi.mock('@/renderer/hooks/context/FeedbackContext', () => ({
  useFeedback: () => ({ openFeedback: openFeedbackMock }),
}));

vi.mock('./McpAgentStatusDisplay', () => ({
  default: () => null,
}));

import McpServerHeader from '@/renderer/pages/settings/ToolsSettings/McpServerHeader';
import type { IMcpServer } from '@/common/config/storage';

const buildServer = (status: IMcpServer['status']): IMcpServer =>
  ({
    id: 's1',
    name: 'my-server',
    enabled: true,
    transport: { type: 'http', url: 'http://example' },
    status,
  }) as IMcpServer;

const commonProps = {
  agentInstallStatus: {},
  isServerLoading: () => false,
  isTestingConnection: false,
  onTestConnection: vi.fn(),
  onEditServer: vi.fn(),
  onDeleteServer: vi.fn(),
  onToggleServer: vi.fn(),
};

const renderHeader = (status: IMcpServer['status']) =>
  render(
    <ConfigProvider>
      <McpServerHeader server={buildServer(status)} {...commonProps} />
    </ConfigProvider>
  );

describe('McpServerHeader — FeedbackButton wiring', () => {
  beforeEach(() => {
    openFeedbackMock.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render FeedbackButton on connected status', () => {
    renderHeader('connected');
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('does not render FeedbackButton while testing', () => {
    renderHeader('testing');
    expect(screen.queryByText('settings.oneClickFeedback')).not.toBeInTheDocument();
  });

  it('renders FeedbackButton when server status is error', () => {
    renderHeader('error');
    expect(screen.getByText('settings.oneClickFeedback')).toBeInTheDocument();
  });

  it('click opens feedback with module=mcp-tools', async () => {
    const user = userEvent.setup();
    renderHeader('error');
    await user.click(screen.getByText('settings.oneClickFeedback'));

    expect(openFeedbackMock).toHaveBeenCalledTimes(1);
    expect(openFeedbackMock).toHaveBeenCalledWith({
      module: 'mcp-tools',
      autoScreenshot: true,
    });
  });
});
