import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Regression guard for the narrow-width (mobile) project-conversation preview.
//
// Bug: project conversations pass `previewHosted={true}` so the preview is
// hoisted to the Layout-level host. But that host only renders on desktop
// (`previewRegionActive` in Layout.tsx is gated on `!isMobile`). On narrow
// widths (< 768) neither ChatLayout nor the host rendered the preview, so
// clicking a file in the tree opened nothing.
//
// Fix: ChatLayout forces `previewHosted` to false on mobile so every
// conversation falls back to its own mobile overlay path — exactly how
// non-project conversations already render.

let mockIsMobile = false;

vi.mock('@/renderer/hooks/context/LayoutContext', () => ({
  useLayoutContext: () => ({ isMobile: mockIsMobile }),
}));

vi.mock('@/renderer/pages/conversation/Preview', () => ({
  usePreviewContext: () => ({ isOpen: true }),
  PreviewPanel: () => <div data-testid='preview-panel'>preview</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/MobileWorkspaceOverlay', () => ({
  default: () => <div data-testid='mobile-workspace-overlay' />,
}));

vi.mock('@/renderer/pages/conversation/components/ChatLayout/WorkspacePanelHeader', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/conversation/components/ChatTitleEditor', () => ({
  default: () => <div>title</div>,
}));

vi.mock('@/renderer/components/agent/AgentBadge', () => ({
  AgentLogoIcon: () => <div>logo</div>,
}));

vi.mock('@/renderer/components/layout/FlexFullContainer', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/hooks/ui/useResizableSplit', () => ({
  useResizableSplit: () => ({
    splitRatio: 60,
    setSplitRatio: vi.fn(),
    createDragHandle: () => null,
  }),
}));

vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth: 800 }),
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

function renderChatLayout(previewHosted: boolean) {
  return render(
    <ChatLayout previewHosted={previewHosted} sider={<div>sider</div>} workspaceEnabled={false}>
      <div>chat body</div>
    </ChatLayout>
  );
}

describe('ChatLayout mobile preview host fallback', () => {
  afterEach(() => {
    mockIsMobile = false;
  });

  it('renders the preview overlay on mobile even for hoisted (project) conversations', () => {
    mockIsMobile = true;
    renderChatLayout(true);
    // The regression target: preview must render inside ChatLayout on mobile.
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
  });

  it('yields the preview to the Layout host on desktop for hoisted conversations (no double render)', () => {
    mockIsMobile = false;
    renderChatLayout(true);
    // Desktop hoisted: ChatLayout must NOT render the preview — the host owns it.
    expect(screen.queryByTestId('preview-panel')).not.toBeInTheDocument();
  });

  it('renders the preview locally on desktop for non-hoisted conversations', () => {
    mockIsMobile = false;
    renderChatLayout(false);
    expect(screen.getByTestId('preview-panel')).toBeInTheDocument();
  });
});
