/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ChatLayout from '../../src/renderer/pages/conversation/components/ChatLayout';

const chatLayoutMocks = vi.hoisted(() => ({
  openTabs: [] as Array<{ id: string; name: string; workspace: string; type: 'gemini' }>,
  updateTabName: vi.fn(),
  setSiderCollapsed: vi.fn(),
  setSplitRatio: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      update: {
        invoke: chatLayoutMocks.invoke,
      },
    },
  },
}));

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(),
  },
}));

vi.mock('@/common/config/storageKeys', () => ({
  STORAGE_KEYS: {
    WORKSPACE_PANEL_COLLAPSE: 'workspace-panel-collapse',
  },
}));

vi.mock('@/renderer/components/agent/AgentModeSelector', () => ({
  default: () => <div data-testid='agent-mode-selector' />,
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({
    children,
    className,
    containerClassName,
  }: React.PropsWithChildren<{ className?: string; containerClassName?: string }>) => (
    <div className={className}>
      <div className={containerClassName}>{children}</div>
    </div>
  ),
}));

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({
    isMobile: false,
    siderCollapsed: false,
    setSiderCollapsed: chatLayoutMocks.setSiderCollapsed,
  }),
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: () => ({
    splitRatio: 30,
    setSplitRatio: chatLayoutMocks.setSplitRatio,
    createDragHandle: () => null,
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ConversationTabs', () => ({
  default: () => null,
}));

vi.mock('@/renderer/pages/conversation/hooks/ConversationTabsContext', () => ({
  useConversationTabs: () => ({
    openTabs: chatLayoutMocks.openTabs,
    updateTabName: chatLayoutMocks.updateTabName,
  }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  PreviewPanel: () => <div data-testid='preview-panel' />,
  usePreviewContext: () => ({
    isOpen: false,
  }),
}));

vi.mock('@/renderer/pages/conversation/components/ConversationTitleMinimap', () => ({
  default: ({ conversationId }: { conversationId?: string }) => (
    <button aria-label='Search conversation' type='button'>
      {conversationId}
    </button>
  ),
}));

vi.mock('@/renderer/utils/emitter', () => ({
  emitter: {
    emit: vi.fn(),
  },
}));

vi.mock('@/renderer/utils/ui/focus', () => ({
  blurActiveElement: vi.fn(),
}));

vi.mock('@/renderer/pages/conversation/utils/detectPlatform', () => ({
  detectMobileViewportOrTouch: () => false,
  isMacEnvironment: () => false,
  isWindowsEnvironment: () => true,
}));

vi.mock('@/renderer/utils/workspace/workspaceEvents', () => ({
  WORKSPACE_HAS_FILES_EVENT: 'workspace-has-files',
  WORKSPACE_TOGGLE_EVENT: 'workspace-toggle',
  dispatchWorkspaceStateEvent: vi.fn(),
  dispatchWorkspaceToggleEvent: vi.fn(),
}));

vi.mock('@/common/types/acpTypes', () => ({
  ACP_BACKENDS_ALL: {
    gemini: {
      name: 'Gemini',
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: undefined,
  }),
}));

describe('ChatLayout', () => {
  beforeEach(() => {
    chatLayoutMocks.openTabs = [];
    chatLayoutMocks.updateTabName.mockReset();
    chatLayoutMocks.setSiderCollapsed.mockReset();
    chatLayoutMocks.setSplitRatio.mockReset();
    chatLayoutMocks.invoke.mockReset();
  });

  it('shows the standalone conversation search entry when tabs are open', () => {
    chatLayoutMocks.openTabs = [{ id: 'conv-1', name: 'Test Conversation', workspace: 'E:/workspace', type: 'gemini' }];

    render(
      <MemoryRouter initialEntries={['/conversation/conv-1']}>
        <ChatLayout
          title='Test Conversation'
          sider={<div>workspace</div>}
          siderTitle='Workspace'
          backend='gemini'
          conversationId='conv-1'
        >
          <div>chat body</div>
        </ChatLayout>
      </MemoryRouter>
    );

    expect(screen.getAllByLabelText('Search conversation')).toHaveLength(2);
  });
});
