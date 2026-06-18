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

import McpServerHeader from '@/renderer/pages/settings/ToolsSettings/McpServerHeader';
import type { IMcpServer } from '@/common/config/storage';

const buildServer = (last_test_status: IMcpServer['last_test_status']): IMcpServer =>
  ({
    id: 's1',
    name: 'my-server',
    enabled: true,
    transport: { type: 'http', url: 'http://example' },
    last_test_status,
    created_at: 0,
    updated_at: 0,
    original_json: '',
  }) as IMcpServer;

const commonProps = {
  isTestingConnection: false,
  onTestConnection: vi.fn(),
  onEditServer: vi.fn(),
  onDeleteServer: vi.fn(),
};

const renderHeader = (last_test_status: IMcpServer['last_test_status']) =>
  render(
    <ConfigProvider>
      <McpServerHeader server={buildServer(last_test_status)} {...commonProps} />
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
