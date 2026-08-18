/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const get = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      get: { invoke: (...a: unknown[]) => get(...a) },
    },
  },
}));

const childChatMock = vi.fn();
vi.mock('@renderer/pages/conversation/components/SideConversationPanel/SideChildChat', () => ({
  default: (props: Record<string, unknown>) => {
    childChatMock(props);
    return <div data-testid='side-child'>{props.composerPrefix as React.ReactNode}</div>;
  },
}));

import { emitter } from '@/renderer/utils/emitter';
import SideConversationDock from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationDock';
import type { SideTab } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';
import type { TChatConversation } from '@/common/config/storage';

const tabs: SideTab[] = [
  { childId: 'c1', mode: 'fork', hasTurn: true },
  { childId: 'c2', mode: 'snapshot', hasTurn: false },
];

const child = {
  id: 'c2',
  type: 'acp',
  name: 'Side',
  created_at: 1,
  modified_at: 2,
  model: { id: 'm', platform: 'openai', name: 'p', base_url: '', api_key: '', use_model: 'gpt' },
  extra: { backend: 'hermes', side_mode: true, side_fork_mode: 'text_snapshot', parent_conversation_id: 'p1' },
} as unknown as TChatConversation;

beforeEach(() => {
  get.mockReset();
  childChatMock.mockClear();
});

describe('SideConversationDock', () => {
  it('fetches the active child and renders it through the platform chat with the composer rail', async () => {
    get.mockResolvedValue(child);
    render(
      <SideConversationDock
        childId='c2'
        tabs={tabs}
        activeTabId='c2'
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
        onNewTab={vi.fn()}
        onCollapse={vi.fn()}
        onPromote={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('side-child')).toBeTruthy();
    });
    expect(get).toHaveBeenCalledWith({ id: 'c2' });
    const props = childChatMock.mock.calls[0][0];
    expect(props.conversation).toBe(child);
    expect(props.composerPrefix).toBeTruthy();
  });

  it('emits a scoped composer fill scoped to the child when a quick prompt is picked', async () => {
    get.mockResolvedValue(child);
    const fills: Array<{ conversation_id: string; text: string }> = [];
    const onFill = (payload: { conversation_id: string; text: string }) => fills.push(payload);
    emitter.on('sendbox.fill.scoped', onFill);

    try {
      render(
        <SideConversationDock
          childId='c2'
          tabs={tabs}
          activeTabId='c2'
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onNewTab={vi.fn()}
          onCollapse={vi.fn()}
          onPromote={vi.fn()}
        />
      );

      await waitFor(() => {
        // Quick-prompt chips render inside the composer rail; without an
        // active i18n instance the chip text is the full key.
        expect(screen.getByText('conversation.sideConversation.quickPrompts.catchMeUp')).toBeTruthy();
      });
      fireEvent.click(screen.getByText('conversation.sideConversation.quickPrompts.catchMeUp'));

      expect(fills).toHaveLength(1);
      expect(fills[0]).toEqual({
        conversation_id: 'c2',
        text: 'conversation.sideConversation.quickPrompts.catchMeUp',
      });
    } finally {
      emitter.off('sendbox.fill.scoped', onFill);
    }
  });
});
