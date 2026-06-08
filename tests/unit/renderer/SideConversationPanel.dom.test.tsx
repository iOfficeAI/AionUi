/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { TChatConversation } from '@/common/config/storage';
import { emitter } from '@/renderer/utils/emitter';

const swrState = vi.hoisted(() => ({ data: undefined as unknown }));
const renderPlatformChatMock = vi.hoisted(() =>
  vi.fn(({ composerPrefix }: { composerPrefix?: React.ReactNode }) => composerPrefix ?? null)
);

vi.mock('swr', () => ({
  default: () => ({ data: swrState.data }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { index?: number }) => (params?.index ? `${key}:${params.index}` : key),
  }),
}));

vi.mock('@/renderer/pages/conversation/components/renderPlatformChat', () => ({
  renderPlatformChat: renderPlatformChatMock,
}));

import SideConversationDock from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationDock';
import SideConversationHeader from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationHeader';
import SideQuickPrompts from '@/renderer/pages/conversation/components/SideConversationPanel/SideQuickPrompts';
import SideConversationTabBar from '@/renderer/pages/conversation/components/SideConversationPanel/SideConversationTabBar';
import { SIDE_QUICK_PROMPT_ROTATE_MS } from '@/renderer/pages/conversation/components/SideConversationPanel/sideQuickPromptKeys';
import type { SideTab } from '@/renderer/pages/conversation/components/SideConversationPanel/useSideConversation';

const tabs: SideTab[] = [
  { childId: 'c1', forkMode: 'text_snapshot', hasTurn: false },
  { childId: 'c2', forkMode: 'agent_fork', hasTurn: true },
];

function childConversation(): TChatConversation {
  return {
    id: 'c1',
    type: 'acp',
    name: 'Child',
    created_at: 1,
    modified_at: 2,
    model: { id: 'm', platform: 'openai', name: 'gpt', base_url: '', api_key: '', use_model: 'gpt' },
    extra: { side_mode: true, parent_conversation_id: 'p1', workspace: '/w' },
  } as TChatConversation;
}

beforeEach(() => {
  swrState.data = undefined;
  renderPlatformChatMock.mockClear();
  emitter.removeAllListeners('sendbox.fill.scoped');
});

afterEach(() => {
  vi.useRealTimers();
  emitter.removeAllListeners('sendbox.fill.scoped');
});

describe('SideConversationPanel components', () => {
  it('renders rotating quick prompt chips and emits picked text', () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    render(<SideQuickPrompts onPick={onPick} />);

    const group = screen.getByRole('group', { name: 'conversation.sideConversation.quickPrompts.label' });
    const firstBatch = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent);

    fireEvent.click(within(group).getByText('conversation.sideConversation.quickPrompts.currentStatus'));
    expect(onPick).toHaveBeenCalledWith('conversation.sideConversation.quickPrompts.currentStatus');

    fireEvent.click(within(group).getByText('conversation.sideConversation.quickPrompts.inPlainTerms'));
    expect(onPick).toHaveBeenCalledWith('conversation.sideConversation.quickPrompts.inPlainTerms');

    fireEvent.click(within(group).getByText('conversation.sideConversation.quickPrompts.changedFiles'));
    expect(onPick).toHaveBeenCalledWith('conversation.sideConversation.quickPrompts.changedFiles');

    act(() => {
      vi.advanceTimersByTime(SIDE_QUICK_PROMPT_ROTATE_MS);
    });
    const secondBatch = within(group)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(secondBatch).not.toEqual(firstBatch);
  });

  it('selects, closes, and creates side tabs from the tab bar', () => {
    const onSelect = vi.fn();
    const onCloseTab = vi.fn();
    const onNewTab = vi.fn();

    render(
      <SideConversationTabBar
        tabs={tabs}
        activeTabId='c2'
        onSelect={onSelect}
        onCloseTab={onCloseTab}
        onNewTab={onNewTab}
      />
    );

    fireEvent.click(screen.getByText('conversation.sideConversation.tabLabel:1'));
    fireEvent.click(screen.getAllByLabelText('conversation.sideConversation.closeTab')[1]);
    fireEvent.click(screen.getByLabelText('conversation.sideConversation.newTab'));

    expect(onSelect).toHaveBeenCalledWith('c1');
    expect(onCloseTab).toHaveBeenCalledWith('c2');
    expect(onNewTab).toHaveBeenCalledTimes(1);
  });

  it('renders header fork tags and collapse action', () => {
    const onCollapse = vi.fn();

    const { rerender } = render(
      <SideConversationHeader
        tabs={tabs}
        activeTabId='c1'
        forkMode='text_snapshot'
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onCollapse={onCollapse}
      />
    );

    expect(screen.getByText('conversation.sideConversation.forkModeSnapshot')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('conversation.sideConversation.close'));
    expect(onCollapse).toHaveBeenCalledTimes(1);

    rerender(
      <SideConversationHeader
        tabs={tabs}
        activeTabId='c2'
        forkMode='agent_fork'
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onCollapse={onCollapse}
      />
    );
    expect(screen.getByText('conversation.sideConversation.forkModeAgent')).toBeTruthy();

    rerender(
      <SideConversationHeader
        tabs={tabs}
        activeTabId='c2'
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        onNewTab={() => {}}
        onCollapse={onCollapse}
      />
    );
    expect(screen.queryByText('conversation.sideConversation.forkModeAgent')).toBeNull();
  });

  it('renders dock placeholder and loaded conversation body', () => {
    const onFill = vi.fn();
    emitter.on('sendbox.fill.scoped', onFill);

    const props = {
      childId: 'c1',
      tabs,
      activeTabId: 'c1',
      onSelectTab: vi.fn(),
      onCloseTab: vi.fn(),
      onNewTab: vi.fn(),
      onCollapse: vi.fn(),
    };

    const { container, rerender } = render(<SideConversationDock {...props} />);
    expect(container.querySelector('[class*="bodyPlaceholder"]')).toBeTruthy();
    expect(renderPlatformChatMock).not.toHaveBeenCalled();

    swrState.data = childConversation();
    rerender(<SideConversationDock {...props} />);

    expect(renderPlatformChatMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation: expect.objectContaining({ id: 'c1' }) })
    );
    fireEvent.click(screen.getByText('conversation.sideConversation.quickPrompts.currentStatus'));
    expect(onFill).toHaveBeenCalledWith({
      conversation_id: 'c1',
      text: 'conversation.sideConversation.quickPrompts.currentStatus',
    });
  });
});
