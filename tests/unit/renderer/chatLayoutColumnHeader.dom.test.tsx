/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The chat header inside a split column. Columns are narrow, so the title
 * must keep its room: it claims the header row and the actions (the model
 * picker first) are what give way, and the header reads as the column's own
 * band. A conversation on its own keeps the header it always had.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: false }),
}));
vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ isOpen: false }),
  PreviewPanel: () => <div>preview</div>,
}));
vi.mock('@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay', () => ({
  default: () => null,
}));
vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/renderer/components/agent/AgentBadge', () => ({
  AgentLogoIcon: () => <div>logo</div>,
}));
vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: () => ({ splitRatio: 60, setSplitRatio: vi.fn(), createDragHandle: () => null }),
}));
vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: 400 }),
}));
vi.mock('@/renderer/pages/conversation/hooks/useLayoutConstraints', () => ({
  useLayoutConstraints: () => undefined,
}));
vi.mock('@/renderer/pages/conversation/hooks/useTitleRename', () => ({
  useTitleRename: () => ({
    editingTitle: false,
    setEditingTitle: vi.fn(),
    titleDraft: '',
    setTitleDraft: vi.fn(),
    renameLoading: false,
    canRenameTitle: false,
    submitTitleRename: vi.fn(),
  }),
}));
vi.mock('@/renderer/pages/conversation/hooks/useWorkspaceCollapse', () => ({
  useWorkspaceCollapse: () => ({ rightSiderCollapsed: true, setRightSiderCollapsed: vi.fn() }),
}));

import ChatLayout from '@/renderer/pages/conversation/components/ChatLayout';
import { ChatColumnProvider } from '@/renderer/pages/conversation/hooks/chatColumnContext';

const TITLE = 'Refactor the billing reconciliation job to run nightly';

const renderHeader = (compact: boolean) =>
  render(
    <ChatColumnProvider value={{ composerActive: true, compactHeader: compact }}>
      <ChatLayout
        title={TITLE}
        sider={<div>sider</div>}
        workspaceEnabled={false}
        headerExtra={<button type='button'>a wide model picker label that wants the room</button>}
      >
        <div>chat body</div>
      </ChatLayout>
    </ChatColumnProvider>
  );

describe('ChatLayout header inside a split column', () => {
  it('renders the full conversation title at a normal column width', () => {
    renderHeader(true);
    expect(screen.getByText(TITLE)).toBeInTheDocument();
    expect(screen.getByText(TITLE).textContent).toBe(TITLE);
  });

  it('gives the title the row and lets the actions give way first', () => {
    renderHeader(true);
    const title = screen.getByTestId('chat-header-title');
    const actions = screen.getByTestId('chat-header-actions');
    expect(title.style.flex).toBe('0 1 auto');
    expect(actions.style.flex).toBe('1 100 auto');
    expect(actions.className).toContain('justify-end');
    // No `min-w-0`: the actions shrink to their icons, never past them.
    expect(actions.className).not.toContain('min-w-0');
    expect(actions.className).not.toContain('shrink-0');
  });

  it('marks the header as the column band', () => {
    renderHeader(true);
    expect(screen.getByTestId('chat-header-actions').closest('[data-column-header="true"]')).not.toBeNull();
  });

  it('leaves a conversation on its own with the header it always had', () => {
    renderHeader(false);
    expect(screen.queryByTestId('chat-header-title')).toBeNull();
    const actions = screen.getByTestId('chat-header-actions');
    expect(actions.className).toContain('shrink-0');
    expect(actions.style.flex).toBe('');
    expect(document.querySelector('[data-column-header="true"]')).toBeNull();
  });
});
