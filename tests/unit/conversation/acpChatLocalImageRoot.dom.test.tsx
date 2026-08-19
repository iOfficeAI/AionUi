/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AcpChat must feed the conversation `workspace` into the LocalImageView root
 * context. That root is what lets relative image paths in assistant markdown
 * (e.g. `![](./chart.png)`) resolve against the agent cwd — LocalImageView
 * joins root+src AND sends root as the fs sandbox workspace. When the wiring
 * is missing the root stays '' and the /api/fs/image-base64 request goes out
 * as a bare relative path with no workspace, which the backend rejects (400).
 * This guards that exact regression (parity with AionrsChat).
 */

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ updateLocalImage: vi.fn() }));

vi.mock('@renderer/components/media/LocalImageView', () => {
  const PassThrough: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  return {
    __esModule: true,
    default: {
      Provider: PassThrough,
      useUpdateLocalImage: () => hoisted.updateLocalImage,
    },
  };
});

vi.mock('@renderer/pages/conversation/Messages/MessageList', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@renderer/pages/conversation/platforms/acp/AcpSendBox', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@renderer/pages/conversation/platforms/acp/AcpE2EStreamInjector', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('@renderer/pages/conversation/platforms/acp/useAcpMessage', () => ({
  __esModule: true,
  useAcpMessage: () => ({}),
}));

vi.mock('@renderer/pages/team/hooks/TeamPermissionContext', () => ({
  __esModule: true,
  useTeamPermission: () => undefined,
}));

vi.mock('@renderer/pages/conversation/Messages/hooks', () => {
  const PassThrough: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  return {
    __esModule: true,
    useMessageLstCache: () => {},
    MessageListProvider: PassThrough,
    MessageListLoadingProvider: PassThrough,
    MessagePaginationProvider: PassThrough,
  };
});

vi.mock('@renderer/pages/conversation/Messages/usePendingConfirmationsRecovery', () => ({
  __esModule: true,
  usePendingConfirmationsRecovery: () => {},
}));

vi.mock('@renderer/pages/conversation/Messages/artifacts', () => ({
  __esModule: true,
  ConversationArtifactProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import AcpChat from '@renderer/pages/conversation/platforms/acp/AcpChat';

const renderChat = (workspace?: string) =>
  render(<AcpChat conversation_id='conv-acp-1' workspace={workspace} backend='claude' />);

afterEach(() => {
  cleanup();
  hoisted.updateLocalImage.mockClear();
});

describe('AcpChat local image root wiring', () => {
  it('feeds the conversation workspace into the LocalImageView root', () => {
    renderChat('/workspace/demo');
    expect(hoisted.updateLocalImage).toHaveBeenCalledWith({ root: '/workspace/demo' });
  });

  it('falls back to an empty root when the conversation has no workspace', () => {
    renderChat(undefined);
    expect(hoisted.updateLocalImage).toHaveBeenCalledWith({ root: '' });
  });
});
