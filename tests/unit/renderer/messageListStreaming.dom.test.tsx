/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { type PropsWithChildren } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IMessageText } from '@/common/chat/chatLib';
import { MessageListProvider } from '@/renderer/pages/conversation/Messages/hooks';
import MessageList from '@/renderer/pages/conversation/Messages/MessageList';

let resizeObserverCallback: ResizeObserverCallback | null = null;

class ResizeObserverMock {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
  }

  observe() {}
  unobserve() {}
  disconnect() {
    resizeObserverCallback = null;
  }
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? _key,
  }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({
    key: 'location-key',
    state: {},
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Image: {
    PreviewGroup: ({ children }: PropsWithChildren) => <>{children}</>,
  },
}));

vi.mock('@/renderer/hooks/context/ConversationContext', () => ({
  useConversationContextSafe: () => null,
}));

vi.mock('@/renderer/hooks/file/useAutoPreviewOfficeFiles', () => ({
  useAutoPreviewOfficeFiles: () => {},
}));

vi.mock('@/renderer/pages/conversation/Messages/artifacts', () => ({
  useConversationArtifacts: () => [],
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageText', () => ({
  default: ({ message }: { message: IMessageText }) => <div>{message.content.content}</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageTips', () => ({
  default: () => <div>tips</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolCall', () => ({
  default: () => <div>tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroup', () => ({
  default: () => <div>tool_group</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageAgentStatus', () => ({
  default: () => <div>agent_status</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePermission', () => ({
  default: () => <div>permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpPermission', () => ({
  default: () => <div>acp_permission</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/acp/MessageAcpToolCall', () => ({
  default: () => <div>acp_tool_call</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessagePlan', () => ({
  default: () => <div>plan</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageThinking', () => ({
  default: () => <div>thinking</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageCronTrigger', () => ({
  default: () => <div>cron_trigger</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageSkillSuggest', () => ({
  default: () => <div>skill_suggest</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/components/MessageToolGroupSummary', () => ({
  default: () => <div>tool_summary</div>,
}));

vi.mock('@/renderer/pages/conversation/Messages/MessageFileChanges', () => ({
  __esModule: true,
  default: () => <div>file_changes</div>,
  parseDiff: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/Messages/components/SelectionReplyButton', () => ({
  default: () => null,
}));

vi.mock('@icon-park/react', () => ({
  Down: () => <span>down</span>,
}));

function createTextMessage(content: string): IMessageText {
  return {
    id: 'message-1',
    msg_id: 'msg-1',
    conversation_id: 'conversation-1',
    type: 'text',
    position: 'left',
    content: {
      content,
    },
    created_at: 1,
  };
}

function Wrapper({ children, messages }: PropsWithChildren<{ messages: IMessageText[] }>): JSX.Element {
  return <MessageListProvider value={messages}>{children}</MessageListProvider>;
}

function setScrollableMetrics(
  scroller: HTMLDivElement,
  {
    clientHeight = 400,
    scrollHeight = 1000,
    scrollTop = 600,
  }: {
    clientHeight?: number;
    scrollHeight?: number;
    scrollTop?: number;
  } = {}
): void {
  Object.defineProperty(scroller, 'clientHeight', {
    configurable: true,
    writable: true,
    value: clientHeight,
  });
  Object.defineProperty(scroller, 'scrollHeight', {
    configurable: true,
    writable: true,
    value: scrollHeight,
  });
  Object.defineProperty(scroller, 'scrollTop', {
    configurable: true,
    writable: true,
    value: scrollTop,
  });
  scroller.scrollTo = vi.fn(({ top }: ScrollToOptions) => {
    if (typeof top === 'number') {
      scroller.scrollTop = top;
    }
  });
}

function flushResizeObserver(): void {
  act(() => {
    resizeObserverCallback?.([], {} as ResizeObserver);
    vi.runAllTimers();
  });
}

describe('MessageList streaming scroll behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-26T12:00:00.000Z'));
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle));
    resizeObserverCallback = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('keeps streamed auto-follow scroll targets moving forward as content grows', () => {
    const firstMessage = createTextMessage('hello');
    const { rerender } = render(
      <Wrapper messages={[firstMessage]}>
        <MessageList />
      </Wrapper>
    );

    const scroller = screen.getByTestId('message-list-scroller') as HTMLDivElement;
    setScrollableMetrics(scroller);

    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    const growthSteps = [
      { content: 'hello world'.repeat(4), scrollHeight: 1080 },
      { content: 'hello world'.repeat(8), scrollHeight: 1160 },
      { content: 'hello world'.repeat(12), scrollHeight: 1240 },
    ];

    for (const step of growthSteps) {
      rerender(
        <Wrapper messages={[createTextMessage(step.content)]}>
          <MessageList />
        </Wrapper>
      );
      scroller.scrollHeight = step.scrollHeight;
      flushResizeObserver();
    }

    const scrollTargets = vi
      .mocked(scroller.scrollTo)
      .mock.calls.map(([options]) => options.top)
      .filter((top): top is number => typeof top === 'number');

    expect(scrollTargets).toEqual([680, 760, 840]);
  });

  it('stops auto-following streamed updates after the user scrolls up', () => {
    const firstMessage = createTextMessage('hello');
    const { rerender } = render(
      <Wrapper messages={[firstMessage]}>
        <MessageList />
      </Wrapper>
    );

    const scroller = screen.getByTestId('message-list-scroller') as HTMLDivElement;
    setScrollableMetrics(scroller);

    act(() => {
      vi.runAllTimers();
    });
    vi.mocked(scroller.scrollTo).mockClear();

    scroller.scrollTop = 480;
    vi.setSystemTime(new Date('2026-05-26T12:00:00.250Z'));
    fireEvent.scroll(scroller);

    rerender(
      <Wrapper messages={[createTextMessage('hello world'.repeat(10))]}>
        <MessageList />
      </Wrapper>
    );
    scroller.scrollHeight = 1200;
    flushResizeObserver();

    expect(scroller.scrollTo).not.toHaveBeenCalled();
  });
});
