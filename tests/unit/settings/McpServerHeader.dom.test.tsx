/**
 * @license
 * Copyright 2025 AIbang (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IMcpServer } from '@/common/config/storage';
import McpServerHeader from '@/renderer/pages/settings/ToolsSettings/McpServerHeader';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en-US' },
  }),
}));

vi.mock('@/renderer/components/base/FeedbackButton', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Check: () => null,
  CloseSmall: () => null,
  Info: () => null,
  LoadingOne: () => null,
  Refresh: () => null,
  Write: () => null,
  DeleteFour: () => null,
  SettingOne: () => null,
  Login: () => null,
}));

const server: IMcpServer = {
  id: 'server-1',
  name: 'Test MCP',
  enabled: true,
  transport: { type: 'stdio', command: 'node', args: [] },
  created_at: 1,
  updated_at: 1,
  original_json: '{}',
};

const renderHeader = (onToggleServer = vi.fn(), isReadOnly = false) =>
  render(
    <McpServerHeader
      server={server}
      isTestingConnection={false}
      isReadOnly={isReadOnly}
      onTestConnection={vi.fn()}
      onEditServer={vi.fn()}
      onDeleteServer={vi.fn()}
      onToggleServer={onToggleServer}
    />
  );

describe('McpServerHeader', () => {
  afterEach(() => cleanup());

  it('shows the enabled state and invokes the persistence handler', async () => {
    const onToggleServer = vi.fn();
    renderHeader(onToggleServer);

    const toggle = screen.getByRole('switch', { name: 'MCP server enabled' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await userEvent.click(toggle);
    expect(onToggleServer).toHaveBeenCalledWith(server);
  });

  it('disables the toggle for extension-contributed servers', () => {
    const onToggleServer = vi.fn();
    renderHeader(onToggleServer, true);

    expect(screen.getByRole('switch', { name: 'MCP server enabled' })).toBeDisabled();
  });
});
