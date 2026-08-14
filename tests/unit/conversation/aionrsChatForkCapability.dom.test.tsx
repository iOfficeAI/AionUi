/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * AionrsChat must inject the conversation detail's `fork_capability` into
 * ConversationContext — that context value is the only thing gating the
 * shared message fork button (see MessageText + isForkEnabled). A dropped
 * prop silently hides the fork entry point for every aionrs conversation,
 * which is exactly the bug this guards against.
 */

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Probe replaces the heavy MessageList: it renders whatever forkCapability
// value reaches ConversationContext, so assertions read the real context.
vi.mock('@renderer/pages/conversation/Messages/MessageList', async () => {
  const { useConversationContextSafe } = await import('@/renderer/hooks/context/ConversationContext');
  const ReactModule = await import('react');
  const Probe: React.FC<Record<string, unknown>> = () => {
    const ctx = useConversationContextSafe();
    return ReactModule.createElement(
      'div',
      { 'data-testid': 'fork-capability-probe' },
      JSON.stringify(ctx?.forkCapability ?? null)
    );
  };
  return { __esModule: true, default: Probe };
});

vi.mock('@renderer/pages/conversation/platforms/aionrs/AionrsSendBox', () => ({
  __esModule: true,
  default: () => null,
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

vi.mock('@renderer/components/media/LocalImageView', () => {
  const PassThrough: React.FC<{ children?: React.ReactNode }> = ({ children }) => <>{children}</>;
  return {
    __esModule: true,
    default: {
      Provider: PassThrough,
      useUpdateLocalImage: () => () => {},
    },
  };
});

import AionrsChat from '@renderer/pages/conversation/platforms/aionrs/AionrsChat';
import type { AionrsModelSelection } from '@renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection';

const renderChat = (forkCapability?: { at_turn: boolean }) =>
  render(
    <AionrsChat
      conversation_id='conv-aionrs-1'
      workspace='/workspace/demo'
      modelSelection={{} as AionrsModelSelection}
      forkCapability={forkCapability}
    />
  );

afterEach(cleanup);

describe('AionrsChat fork capability wiring', () => {
  it('exposes the fork capability from the conversation detail to the message context', () => {
    renderChat({ at_turn: false });
    expect(screen.getByTestId('fork-capability-probe').textContent).toBe('{"at_turn":false}');
  });

  it('leaves the context without a capability when the detail declares none, keeping fork hidden', () => {
    renderChat(undefined);
    expect(screen.getByTestId('fork-capability-probe').textContent).toBe('null');
  });
});
