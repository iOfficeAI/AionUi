/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * LocalImageView resolves relative image paths in markdown against the
 * conversation workspace (the agent cwd) read straight from ConversationContext,
 * and forwards that workspace to the fs sandbox. Inside a conversation a bare
 * `./chart.png` becomes `<workspace>/chart.png` with `workspace` set; outside any
 * conversation (settings markdown) there is no workspace so the src goes through
 * untouched. A dropped workspace sends the backend a bare relative path, which it
 * canonicalizes against its own cwd and rejects (400) — the exact bug this guards.
 */

import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  getImageBase64: vi.fn(() => Promise.resolve<string | null>(null)),
}));

vi.mock('@/common', () => ({
  __esModule: true,
  ipcBridge: {
    fs: {
      getImageBase64: { invoke: hoisted.getImageBase64 },
    },
  },
}));

import LocalImageView from '@renderer/components/media/LocalImageView';
import { ConversationProvider } from '@/renderer/hooks/context/ConversationContext';

afterEach(() => {
  cleanup();
  hoisted.getImageBase64.mockClear();
});

const renderInConversation = (workspace: string | undefined, src: string) =>
  render(
    <ConversationProvider value={{ conversation_id: 'conv-1', workspace, type: 'acp' }}>
      <LocalImageView src={src} alt='demo' />
    </ConversationProvider>
  );

describe('LocalImageView workspace root from ConversationContext', () => {
  it('joins a relative src onto the conversation workspace and forwards it as the fs workspace', async () => {
    renderInConversation('/workspace/demo', './material.jpeg');
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: '/workspace/demo/material.jpeg',
      workspace: '/workspace/demo',
    });
  });

  it('passes an absolute src through untouched while still forwarding the workspace', async () => {
    renderInConversation('/workspace/demo', '/var/tmp/aionui/pic.png');
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: '/var/tmp/aionui/pic.png',
      workspace: '/workspace/demo',
    });
  });

  it('sends the src as-is with no workspace when rendered outside a conversation', async () => {
    render(<LocalImageView src='./material.jpeg' alt='demo' />);
    await waitFor(() => expect(hoisted.getImageBase64).toHaveBeenCalled());
    expect(hoisted.getImageBase64).toHaveBeenCalledWith({
      path: './material.jpeg',
      workspace: undefined,
    });
  });
});
