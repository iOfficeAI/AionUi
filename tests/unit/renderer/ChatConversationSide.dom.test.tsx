/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';

const layoutState = vi.hoisted(() => ({ isMobile: false }));
const chatLayoutProps = vi.hoisted(
  () =>
    [] as Array<{
      title?: React.ReactNode;
      sideDockOpen?: boolean;
      workspaceEnabled?: boolean;
      backend?: string;
    }>
);
const sideMock = vi.hoisted(() => ({
  state: 'active',
  childId: 'side-1' as string | undefined,
  activeTabId: 'side-1' as string | undefined,
  tabs: [{ childId: 'side-1', forkMode: 'text_snapshot', hasTurn: false }],
  open: vi.fn(),
  openNewTab: vi.fn(),
  fillComposer: vi.fn(),
  reopen: vi.fn(),
  collapse: vi.fn(),
  selectTab: vi.fn(),
  discardTab: vi.fn(),
}));
const renderPlatformChatMock = vi.hoisted(() => vi.fn(() => <div data-testid='platform-chat' />));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      stop: { invoke: vi.fn() },
      update: { invoke: vi.fn() },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({
    children,
    icon,
    onClick,
  }: {
    children?: React.ReactNode;
    icon?: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
  }) => (
    <button type='button' onClick={onClick}>
      {icon}
      {children}
    </button>
  ),
  Dropdown: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Menu: Object.assign(({ children }: { children?: React.ReactNode }) => <div>{children}</div>, {
    Item: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  }),
  Message: { error: vi.fn() },
  Tooltip: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Typography: {
    Ellipsis: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
  },
}));

vi.mock('@icon-park/react', () => ({
  Attention: () => <span data-testid='attention-icon' />,
  CheckOne: () => <span data-testid='check-one-icon' />,
  History: () => <span data-testid='history-icon' />,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({ data: [] }),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => layoutState,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  resolveAssistantConfigId: () => 'assistant-1',
  usePresetAssistantInfo: () => ({ info: undefined, isLoading: false }),
}));

vi.mock('@/renderer/hooks/agent/useAcpConfigOptions', () => ({
  classifyConfigSetError: () => 'unknown',
  useAcpConfigOptions: () => ({
    thoughtLevel: undefined,
    setStatus: undefined,
    setConfigOption: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useActiveLease', () => ({
  useActiveLease: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/components/SideConversationPanel', () => ({
  SideConversationDock: ({
    onCloseTab,
    onNewTab,
    onCollapse,
  }: {
    onCloseTab: (id: string) => void;
    onNewTab: () => void;
    onCollapse: () => void;
  }) => (
    <div data-testid='side-dock'>
      <button type='button' onClick={() => onCloseTab('side-1')}>
        close-side
      </button>
      <button type='button' onClick={onNewTab}>
        new-side
      </button>
      <button type='button' onClick={onCollapse}>
        collapse-side
      </button>
    </div>
  ),
  useSideConversation: () => sideMock,
}));

vi.mock('@/renderer/pages/conversation/components/renderPlatformChat', () => ({
  renderPlatformChat: renderPlatformChatMock,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({
    title,
    headerExtra,
    sideDockOpen,
    sideDock,
    workspaceEnabled,
    backend,
    children,
  }: {
    title?: React.ReactNode;
    headerExtra?: React.ReactNode;
    sideDockOpen?: boolean;
    sideDock?: React.ReactNode;
    workspaceEnabled?: boolean;
    backend?: string;
    children?: React.ReactNode;
  }) => {
    chatLayoutProps.push({ title, sideDockOpen, workspaceEnabled, backend });
    return (
      <div data-testid='chat-layout' data-side-open={String(sideDockOpen)}>
        <div data-testid='header-extra'>{headerExtra}</div>
        <div data-testid='side-slot'>{sideDock}</div>
        <div data-testid='chat-body'>{children}</div>
      </div>
    );
  },
}));

vi.mock('@/renderer/pages/conversation/components/ChatSlider.tsx', () => ({
  default: () => <div data-testid='chat-slider' />,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => <div data-testid='acp-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GoogleModelSelector', () => ({
  default: () => <div data-testid='google-model-selector' />,
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: ({ hasCronSkill }: { hasCronSkill?: boolean }) => (
    <div data-testid='cron-manager'>{String(hasCronSkill)}</div>
  ),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ openPreview: vi.fn() }),
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsChat', () => ({
  default: () => <div data-testid='aionrs-chat' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/AionrsModelSelector', () => ({
  default: () => <div data-testid='aionrs-model-selector' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/aionrs/useAionrsModelSelection', () => ({
  useAionrsModelSelection: () => ({ selectedModel: 'gpt' }),
}));

vi.mock('@/renderer/pages/guid/hooks/agentSelectionUtils', () => ({
  saveAionrsDefaultModel: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  default: () => <div data-testid='openclaw-monitor' />,
}));

import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

function conversation(type: TChatConversation['type'], extra: TChatConversation['extra'] = {}): TChatConversation {
  return {
    id: `${type}-1`,
    type,
    name: type,
    created_at: 1,
    modified_at: 1,
    model: { id: 'm', platform: 'openai', name: 'gpt', base_url: '', api_key: '', use_model: 'gpt' },
    extra,
  } as TChatConversation;
}

beforeEach(() => {
  layoutState.isMobile = false;
  chatLayoutProps.length = 0;
  sideMock.state = 'active';
  sideMock.childId = 'side-1';
  sideMock.activeTabId = 'side-1';
  sideMock.tabs = [{ childId: 'side-1', forkMode: 'text_snapshot', hasTurn: false }];
  sideMock.open.mockClear();
  sideMock.openNewTab.mockClear();
  sideMock.fillComposer.mockClear();
  sideMock.reopen.mockClear();
  sideMock.collapse.mockClear();
  sideMock.selectTab.mockClear();
  sideMock.discardTab.mockClear();
  renderPlatformChatMock.mockClear();
});

describe('ChatConversation side dock wiring', () => {
  it('renders supported ACP conversations with an active side dock', () => {
    render(<ChatConversation conversation={conversation('acp', { backend: 'claude', workspace: '/w' })} />);

    expect(screen.getByTestId('chat-layout').dataset.sideOpen).toBe('true');
    expect(screen.getByTestId('side-dock')).toBeTruthy();
    expect(screen.getByTestId('platform-chat')).toBeTruthy();
    expect(renderPlatformChatMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation: expect.objectContaining({ id: 'acp-1' }),
      })
    );

    fireEvent.click(screen.getByText('new-side'));
    fireEvent.click(screen.getByText('close-side'));
    fireEvent.click(screen.getByText('collapse-side'));

    expect(sideMock.openNewTab).toHaveBeenCalledTimes(1);
    expect(sideMock.discardTab).toHaveBeenCalledWith('side-1');
    expect(sideMock.collapse).toHaveBeenCalledTimes(1);
    expect(chatLayoutProps.at(-1)).toMatchObject({ title: 'acp', sideDockOpen: true, workspaceEnabled: true });
  });

  it('shows a reopen control for collapsed side tabs', () => {
    sideMock.state = 'collapsed';
    sideMock.childId = undefined;
    sideMock.tabs = [{ childId: 'side-1', forkMode: 'agent_fork', hasTurn: true }];

    render(<ChatConversation conversation={conversation('acp', { backend: 'codex', workspace: '/w' })} />);

    fireEvent.click(screen.getByText('conversation.sideConversation.reopen'));
    expect(sideMock.reopen).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chat-layout').dataset.sideOpen).toBe('false');
  });

  it('routes aionrs conversations through the aionrs panel with side state', () => {
    render(<ChatConversation conversation={conversation('aionrs', { workspace: '/w', skills: ['cron'] })} />);

    expect(screen.getByTestId('aionrs-chat')).toBeTruthy();
    expect(screen.getByTestId('aionrs-model-selector')).toBeTruthy();
    expect(screen.getByTestId('side-dock')).toBeTruthy();
    expect(chatLayoutProps.at(-1)).toMatchObject({
      title: 'aionrs',
      sideDockOpen: true,
      workspaceEnabled: true,
      backend: 'aionrs',
    });
  });
});
