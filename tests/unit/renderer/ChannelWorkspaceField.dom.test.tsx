/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Message } from '@arco-design/web-react';
import ChannelWorkspaceField from '@/renderer/components/settings/SettingsModal/contents/channels/assistantBinding/ChannelWorkspaceField';

const getPlatformSettings = vi.fn();
const setWorkspaceSetting = vi.fn();

vi.mock('@/common/adapter/ipcBridge', () => ({
  channel: {
    getPlatformSettings: {
      invoke: (...args: unknown[]) => getPlatformSettings(...args),
    },
    setWorkspaceSetting: {
      invoke: (...args: unknown[]) => setWorkspaceSetting(...args),
    },
  },
}));

vi.mock('@renderer/components/workspace', () => ({
  WorkspaceFolderSelect: ({
    value,
    onChange,
    onClear,
    placeholder,
    triggerTestId,
  }: {
    value?: string;
    onChange: (value: string) => void;
    onClear?: () => void;
    placeholder: string;
    triggerTestId?: string;
  }) => (
    <div>
      <span data-testid='workspace-value'>{value ?? ''}</span>
      <span data-testid='workspace-placeholder'>{placeholder}</span>
      <button type='button' data-testid={triggerTestId} onClick={() => onChange('/tmp/channel-ws')}>
        pick
      </button>
      <button type='button' data-testid='workspace-clear' onClick={() => onClear?.()}>
        clear
      </button>
    </div>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

describe('ChannelWorkspaceField', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(Message, 'error').mockImplementation(() => undefined as never);
    getPlatformSettings.mockResolvedValue({
      platform: 'telegram',
      assistant: null,
      default_model: null,
      workspace: null,
    });
    setWorkspaceSetting.mockResolvedValue(undefined);
  });

  it('loads and displays the saved workspace path', async () => {
    getPlatformSettings.mockResolvedValue({
      platform: 'telegram',
      assistant: null,
      default_model: null,
      workspace: { path: '/projects/demo' },
    });

    render(<ChannelWorkspaceField platform='telegram' />);

    await waitFor(() => {
      expect(getPlatformSettings).toHaveBeenCalledWith({ platform: 'telegram' });
    });
    await waitFor(() => {
      expect(screen.getByTestId('workspace-value')).toHaveTextContent('/projects/demo');
    });
  });

  it('persists a selected workspace path', async () => {
    const user = userEvent.setup();
    render(<ChannelWorkspaceField platform='lark' />);

    await waitFor(() => {
      expect(getPlatformSettings).toHaveBeenCalledWith({ platform: 'lark' });
    });

    await user.click(screen.getByTestId('channel-workspace-trigger-lark'));

    await waitFor(() => {
      expect(setWorkspaceSetting).toHaveBeenCalledWith({
        platform: 'lark',
        workspace: { path: '/tmp/channel-ws' },
      });
    });
    expect(Message.success).toHaveBeenCalled();
    expect(screen.getByTestId('workspace-value')).toHaveTextContent('/tmp/channel-ws');
  });

  it('clears workspace with an empty path and shows cleared toast', async () => {
    const user = userEvent.setup();
    getPlatformSettings.mockResolvedValue({
      platform: 'dingtalk',
      assistant: null,
      default_model: null,
      workspace: { path: '/old' },
    });

    render(<ChannelWorkspaceField platform='dingtalk' />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-value')).toHaveTextContent('/old');
    });

    await user.click(screen.getByTestId('workspace-clear'));

    await waitFor(() => {
      expect(setWorkspaceSetting).toHaveBeenCalledWith({
        platform: 'dingtalk',
        workspace: { path: '' },
      });
    });
    expect(Message.success).toHaveBeenCalled();
  });

  it('restores previous path when save fails', async () => {
    const user = userEvent.setup();
    getPlatformSettings.mockResolvedValue({
      platform: 'weixin',
      assistant: null,
      default_model: null,
      workspace: { path: '/keep-me' },
    });
    setWorkspaceSetting.mockRejectedValue(new Error('network'));

    render(<ChannelWorkspaceField platform='weixin' />);

    await waitFor(() => {
      expect(screen.getByTestId('workspace-value')).toHaveTextContent('/keep-me');
    });

    await user.click(screen.getByTestId('channel-workspace-trigger-weixin'));

    await waitFor(() => {
      expect(Message.error).toHaveBeenCalled();
    });
    expect(screen.getByTestId('workspace-value')).toHaveTextContent('/keep-me');
  });
});
