/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Hoist mocks so they are available before module resolution
const mocks = vi.hoisted(() => ({
  getConversationMessages: vi.fn(),
  dispatchChatMessageJump: vi.fn(),
}));

vi.mock('../../src/common', () => ({
  ipcBridge: {
    database: {
      getConversationMessages: {
        invoke: mocks.getConversationMessages,
      },
    },
  },
}));

vi.mock('../../src/renderer/utils/chat/chatMinimapEvents', () => ({
  dispatchChatMessageJump: mocks.dispatchChatMessageJump,
}));

import { useMinimapPanel } from '../../src/renderer/pages/conversation/components/ConversationTitleMinimap/useMinimapPanel';
import type { TurnPreviewItem } from '../../src/renderer/pages/conversation/components/ConversationTitleMinimap/minimapTypes';

// Helper: build a fake message array that buildTurnPreview can process
const makeFakeMessages = (turns: { question: string; answer: string }[]) =>
  turns.flatMap(({ question, answer }, i) => [
    {
      id: `q${i}`,
      msg_id: `mq${i}`,
      conversation_id: 'conv-1',
      type: 'text' as const,
      content: { content: question },
      position: 'right' as const,
      createdAt: Date.now(),
    },
    {
      id: `a${i}`,
      msg_id: `ma${i}`,
      conversation_id: 'conv-1',
      type: 'text' as const,
      content: { content: answer },
      position: 'left' as const,
      createdAt: Date.now(),
    },
  ]);

describe('useMinimapPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.getConversationMessages.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // -- Initial state -----------------------------------------------------------

  it('should have correct initial state', () => {
    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    expect(result.current.visible).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.searchKeyword).toBe('');
    expect(result.current.isSearchMode).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.activeResultIndex).toBe(-1);
  });

  // -- togglePanel --------------------------------------------------------------

  it('togglePanel should open the panel (visible becomes true)', async () => {
    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    await act(async () => {
      result.current.togglePanel();
    });

    expect(result.current.visible).toBe(true);
  });

  it('togglePanel twice should close the panel', async () => {
    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    await act(async () => {
      result.current.togglePanel();
    });
    expect(result.current.visible).toBe(true);

    await act(async () => {
      result.current.togglePanel();
    });
    expect(result.current.visible).toBe(false);
  });

  // -- openSearchPanel ----------------------------------------------------------

  it('openSearchPanel should set isSearchMode to true', async () => {
    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    await act(async () => {
      result.current.openSearchPanel();
    });

    expect(result.current.isSearchMode).toBe(true);
    expect(result.current.visible).toBe(true);
  });

  // -- filteredItems ------------------------------------------------------------

  it('filteredItems should return all items when searchKeyword is empty', async () => {
    const messages = makeFakeMessages([
      { question: 'Hello world', answer: 'Hi there' },
      { question: 'How are you', answer: 'Fine thanks' },
    ]);
    mocks.getConversationMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    // Open to trigger fetch
    await act(async () => {
      result.current.togglePanel();
    });

    // Let the fetch resolve
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.items.length).toBe(2);
    expect(result.current.filteredItems.length).toBe(2);
  });

  it('filteredItems should filter items by keyword', async () => {
    const messages = makeFakeMessages([
      { question: 'Hello world', answer: 'Hi there' },
      { question: 'TypeScript tips', answer: 'Use strict mode' },
    ]);
    mocks.getConversationMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    // Open to trigger fetch
    await act(async () => {
      result.current.togglePanel();
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.items.length).toBe(2);

    // Set a search keyword that matches only the first turn
    act(() => {
      result.current.setSearchKeyword('Hello');
    });

    expect(result.current.filteredItems.length).toBe(1);
    expect(result.current.filteredItems[0].questionRaw).toBe('Hello world');
  });

  it('filteredItems should be case-insensitive', async () => {
    const messages = makeFakeMessages([{ question: 'React Hooks Guide', answer: 'Use useState' }]);
    mocks.getConversationMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    await act(async () => {
      result.current.togglePanel();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setSearchKeyword('react hooks');
    });

    expect(result.current.filteredItems.length).toBe(1);
  });

  it('filteredItems should return empty when keyword matches nothing', async () => {
    const messages = makeFakeMessages([{ question: 'Hello world', answer: 'Hi there' }]);
    mocks.getConversationMessages.mockResolvedValue(messages);

    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    await act(async () => {
      result.current.togglePanel();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setSearchKeyword('zzzznonexistent');
    });

    expect(result.current.filteredItems.length).toBe(0);
  });

  // -- jumpToItem ---------------------------------------------------------------

  it('jumpToItem should dispatch jump event and close panel', async () => {
    const { result } = renderHook(() => useMinimapPanel('conv-1'));

    const item: TurnPreviewItem = {
      index: 1,
      question: 'Q',
      answer: 'A',
      questionRaw: 'Q',
      answerRaw: 'A',
      messageId: 'msg-1',
      msgId: 'msg-id-1',
    };

    // Open first so visible = true
    await act(async () => {
      result.current.togglePanel();
    });
    expect(result.current.visible).toBe(true);

    act(() => {
      result.current.jumpToItem(item);
    });

    expect(mocks.dispatchChatMessageJump).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      messageId: 'msg-1',
      msgId: 'msg-id-1',
      align: 'start',
      behavior: 'smooth',
    });
    expect(result.current.visible).toBe(false);
  });

  // -- Conversation switch resets state -----------------------------------------

  it('should reset state when conversationId changes', async () => {
    const messages = makeFakeMessages([{ question: 'Hello', answer: 'World' }]);
    mocks.getConversationMessages.mockResolvedValue(messages);

    const { result, rerender } = renderHook(({ convId }) => useMinimapPanel(convId), {
      initialProps: { convId: 'conv-1' },
    });

    // Open and load items
    await act(async () => {
      result.current.togglePanel();
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current.visible).toBe(true);
    expect(result.current.items.length).toBe(1);

    // Switch conversation
    rerender({ convId: 'conv-2' });

    expect(result.current.visible).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(result.current.searchKeyword).toBe('');
    expect(result.current.isSearchMode).toBe(false);
  });
});
