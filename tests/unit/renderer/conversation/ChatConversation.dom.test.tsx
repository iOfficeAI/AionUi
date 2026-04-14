/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TChatConversation } from '@/common/config/storage';
import ChatConversation from '@/renderer/pages/conversation/components/ChatConversation';

const chatConversationMocks = vi.hoisted(() => ({
  openWorkspaceInEditor: vi.fn().mockResolvedValue(undefined),
}));

type MockButtonProps = React.ComponentProps<'button'> & { icon?: React.ReactNode };
type MockChildrenProps = { children: React.ReactNode };
type MockMenuComponent = React.FC<MockChildrenProps> & {
  Item: React.FC<MockChildrenProps>;
};

const arcoMockComponents = vi.hoisted(() => ({
  Button: ({ children, icon, ...props }: MockButtonProps) => (
    <button type='button' {...props}>
      {icon}
      {children}
    </button>
  ),
  Dropdown: ({ children }: MockChildrenProps) => <div>{children}</div>,
  Menu: Object.assign(({ children }: MockChildrenProps) => <div>{children}</div>, {
    Item: ({ children }: MockChildrenProps) => <div>{children}</div>,
  }) as MockMenuComponent,
  Ellipsis: ({ children }: MockChildrenProps) => <span>{children}</span>,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      getAssociateConversation: {
        invoke: vi.fn().mockResolvedValue([]),
      },
      get: {
        invoke: vi.fn().mockResolvedValue(null),
      },
      createWithConversation: {
        invoke: vi.fn().mockResolvedValue(undefined),
      },
      update: {
        invoke: vi.fn().mockResolvedValue(true),
      },
    },
    shell: {
      openWorkspaceInEditor: {
        invoke: chatConversationMocks.openWorkspaceInEditor,
      },
    },
  },
}));

vi.mock('@/renderer/pages/cron', () => ({
  CronJobManager: ({ conversationId }: { conversationId: string }) => <div>{conversationId}</div>,
}));

vi.mock('@/renderer/hooks/agent/usePresetAssistantInfo', () => ({
  usePresetAssistantInfo: () => ({
    info: undefined,
    isLoading: false,
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  isMacOS: () => false,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout', () => ({
  default: ({ headerExtra, children }: { headerExtra?: React.ReactNode; children: React.ReactNode }) => (
    <div>
      <div data-testid='header-extra'>{headerExtra}</div>
      <div>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/pages/conversation/components/ChatSider', () => ({
  default: () => <div data-testid='chat-sider' />,
}));

vi.mock('@/renderer/pages/conversation/platforms/acp/AcpChat', () => ({
  default: () => <div>acp-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/codex/CodexChat', () => ({
  default: () => <div>codex-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/nanobot/NanobotChat', () => ({
  default: () => <div>nanobot-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/OpenClawChat', () => ({
  default: () => <div>openclaw-chat</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiChat', () => ({
  default: () => <div>gemini-chat</div>,
}));

vi.mock('@/renderer/components/agent/AcpModelSelector', () => ({
  default: () => <div>acp-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/GeminiModelSelector', () => ({
  default: () => <div>gemini-model-selector</div>,
}));

vi.mock('@/renderer/pages/conversation/platforms/gemini/useGeminiModelSelection', () => ({
  useGeminiModelSelection: () => ({}),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({
    openPreview: vi.fn(),
  }),
}));

vi.mock('@/renderer/pages/conversation/platforms/openclaw/StarOfficeMonitorCard.tsx', () => ({
  default: () => <div>star-office-monitor</div>,
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: [],
  }),
}));

vi.mock('@icon-park/react', () => ({
  Attention: () => <span data-testid='attention-icon' />,
  CheckOne: () => <span data-testid='check-one-icon' />,
  Down: () => <span data-testid='down-icon' />,
  FolderOpen: () => <span data-testid='folder-open-icon' />,
  History: () => <span data-testid='history-icon' />,
}));

vi.mock('@arco-design/web-react', () => {
  return {
    Button: arcoMockComponents.Button,
    Dropdown: arcoMockComponents.Dropdown,
    Menu: arcoMockComponents.Menu,
    Message: {
      error: vi.fn(),
    },
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Typography: {
      Ellipsis: arcoMockComponents.Ellipsis,
    },
  };
});

const createConversation = (customWorkspace: boolean): TChatConversation =>
  ({
    id: 'conv-1',
    name: 'Workspace Chat',
    type: 'acp',
    extra: {
      workspace: 'E:/code/demo',
      customWorkspace,
      backend: 'claude',
    },
  }) as TChatConversation;

describe('ChatConversation workspace launcher', () => {
  beforeEach(() => {
    chatConversationMocks.openWorkspaceInEditor.mockClear();
  });

  it('renders the quick-open launcher for custom workspace conversations', () => {
    render(<ChatConversation conversation={createConversation(true)} />);

    expect(screen.getByTitle('conversation.workspace.openInEditor')).toBeInTheDocument();
  });

  it('hides the quick-open launcher for non-custom workspaces', () => {
    render(<ChatConversation conversation={createConversation(false)} />);

    expect(screen.queryByTitle('conversation.workspace.openInEditor')).not.toBeInTheDocument();
  });
});
