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
import { fireEvent, render, screen } from '@testing-library/react';
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
let containerWidth = 400;
vi.mock('@/renderer/pages/conversation/hooks/useContainerWidth', () => ({
  useContainerWidth: () => ({ containerRef: { current: null }, containerWidth }),
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
import type { ChatColumnContextValue } from '@/renderer/pages/conversation/hooks/chatColumnContext';

const TITLE = 'Refactor the billing reconciliation job to run nightly';

const renderHeader = (
  compact: boolean,
  columnFocused = false,
  headerDragHandle?: ChatColumnContextValue['headerDragHandle']
) =>
  render(
    <ChatColumnProvider value={{ composerActive: true, compactHeader: compact, columnFocused, headerDragHandle }}>
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

  it("caps the title area at the column's measured width", () => {
    containerWidth = 400;
    renderHeader(true);
    const editor = screen.getByTestId('chat-header-title').firstElementChild as HTMLElement;
    expect(editor.style.maxWidth).toBe('400px');
  });

  it('leaves the title uncapped until the column has been measured', () => {
    // A width of 0 is "not measured yet", not "no room": capping at it would
    // clip the title to nothing for as long as the measurement is missing.
    containerWidth = 0;
    try {
      renderHeader(true);
      const editor = screen.getByTestId('chat-header-title').firstElementChild as HTMLElement;
      expect(editor.style.maxWidth).toBe('');
      expect(screen.getByText(TITLE).textContent).toBe(TITLE);
    } finally {
      containerWidth = 400;
    }
  });

  it("washes the focused column's header band in a light primary tint", () => {
    renderHeader(true, true);
    const band = screen.getByTestId('chat-header-actions').closest('[data-column-header="true"]') as HTMLElement;
    // The wash itself is a stylesheet rule keyed on this attribute: the glass
    // background is `!important`, so a utility class could never win.
    expect(band.getAttribute('data-column-focused')).toBe('true');
    expect(band.className).toContain('chat-layout-header--glass');
  });

  it('leaves an unfocused column its plain band', () => {
    renderHeader(true, false);
    const band = screen.getByTestId('chat-header-actions').closest('[data-column-header="true"]') as HTMLElement;
    expect(band.getAttribute('data-column-focused')).toBeNull();
    expect(band.className).toContain('!bg-2');
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

/**
 * In a split, the title area is what you grab to reorder the columns: it takes
 * the drag activator, a grip glyph rides beside the title, and the header's own
 * controls stay where they were.
 */
describe('ChatLayout header as the column drag handle', () => {
  const handle = (isDragging = false) => ({
    onPointerDown: vi.fn(),
    onClickCapture: vi.fn(),
    isDragging,
    label: 'conversation.splitGroup.reorderHandle',
    onKeyDown: vi.fn(),
  });

  it('puts the activator on the title area and a labelled grip beside the title', () => {
    const h = handle();
    renderHeader(true, false, h);
    const title = screen.getByTestId('chat-header-title');
    expect(title.className).toContain('cursor-grab');
    expect(title.className).toContain('select-none');
    expect(title.style.touchAction).toBe('manipulation');
    fireEvent.pointerDown(title);
    expect(h.onPointerDown).toHaveBeenCalledTimes(1);
    fireEvent.click(title);
    expect(h.onClickCapture).toHaveBeenCalledTimes(1);
    const grip = screen.getByTestId('chat-header-grip');
    expect(grip.tagName).toBe('BUTTON');
    expect(grip).toHaveAttribute('aria-label', 'conversation.splitGroup.reorderHandle');
    expect(title.contains(grip)).toBe(true);
    // The actions are untouched: the picker is still in its own slot.
    expect(screen.getByTestId('chat-header-actions').textContent).toContain('a wide model picker label');
  });

  it('washes the dragged header lightly, with no outline', () => {
    renderHeader(true, false, handle(true));
    const title = screen.getByTestId('chat-header-title');
    expect(title.getAttribute('data-column-dragging')).toBe('true');
    expect(title.className).toContain('cursor-grabbing');
    expect(title.className).not.toMatch(/border|shadow/);
  });

  it('marks the minimap trigger inside the activator as its own press, and nothing else', () => {
    const h = handle();
    renderHeader(true, false, h);
    const title = screen.getByTestId('chat-header-title');
    const trigger = title.querySelector('.conversation-minimap-trigger');
    expect(trigger).not.toBeNull();
    expect(trigger).toHaveAttribute('role', 'button');
    expect(trigger).toHaveAttribute('data-column-drag', 'ignore');
    // The activator still hears the press; the view is what reads the mark off the target.
    fireEvent.pointerDown(trigger as Element);
    expect(h.onPointerDown).toHaveBeenCalledTimes(1);
    expect(h.onPointerDown.mock.calls[0][0].target).toBe(trigger);
    // The title and the grip are the drag: unmarked.
    expect(screen.getByTestId('chat-title-editor-trigger')).not.toHaveAttribute('data-column-drag');
    expect(screen.getByTestId('chat-header-grip')).not.toHaveAttribute('data-column-drag');
  });

  it('hands Alt+Arrow on the grip to the handle', () => {
    const h = handle();
    renderHeader(true, false, h);
    fireEvent.keyDown(screen.getByTestId('chat-header-grip'), { key: 'ArrowRight', altKey: true });
    expect(h.onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('gives a conversation on its own no grip and no activator', () => {
    renderHeader(false);
    expect(screen.queryByTestId('chat-header-grip')).toBeNull();
  });

  it('leaves a column without a handle selectable', () => {
    renderHeader(true, false);
    expect(screen.getByTestId('chat-header-title').className).not.toContain('select-none');
  });
});
