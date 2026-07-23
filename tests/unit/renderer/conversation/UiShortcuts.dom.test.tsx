import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import type { NavigateFunction } from 'react-router-dom';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  pathname: '/conversation/conversation-1',
  desktop: true,
}));

const serviceMocks = vi.hoisted(() => ({
  loadMessages: vi.fn(() => new Promise<never>(() => {})),
  searchMessages: vi.fn().mockResolvedValue({ items: [], has_more: false }),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: testState.pathname, search: '', hash: '' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useVisibleConversationIds', () => ({
  useVisibleConversationIds: () => [],
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => testState.desktop,
}));

vi.mock('@/renderer/utils/chat/messagePagination', () => ({
  loadAllConversationMessagesPaged: serviceMocks.loadMessages,
}));

vi.mock('@/common', () => ({
  ipcBridge: {
    database: {
      searchConversationMessages: { invoke: serviceMocks.searchMessages },
    },
  },
}));

vi.mock('@/renderer/components/base/AionModal', () => ({
  default: () => null,
}));

vi.mock('@/renderer/components/base', () => ({
  AionSearchInput: () => null,
}));

import { useConversationShortcuts } from '@/renderer/hooks/ui/useConversationShortcuts';
import ConversationSearchPopover from '@/renderer/pages/conversation/GroupedHistory/ConversationSearchPopover';
import { useMinimapPanel } from '@/renderer/pages/conversation/components/ConversationTitleMinimap/useMinimapPanel';
import { useWorkspaceCollapse } from '@/renderer/pages/conversation/hooks/useWorkspaceCollapse';
import { isShortcutBlockedByTarget } from '@/renderer/utils/ui/keyboardShortcuts';
import { dispatchWorkspaceToggleEvent } from '@/renderer/utils/workspace/workspaceEvents';

const dispatchShortcut = (target: EventTarget, init: KeyboardEventInit): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const renderConversationShortcuts = ({
  navigate = vi.fn(),
  toggleSider = vi.fn(),
}: {
  navigate?: ReturnType<typeof vi.fn>;
  toggleSider?: ReturnType<typeof vi.fn>;
} = {}) => {
  const rendered = renderHook(() =>
    useConversationShortcuts({
      navigate: navigate as unknown as NavigateFunction,
      toggleSider,
    })
  );

  return { ...rendered, navigate, toggleSider };
};

describe('common desktop UI shortcuts', () => {
  beforeEach(() => {
    testState.pathname = '/conversation/conversation-1';
    testState.desktop = true;
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it.each([
    ['Cmd', { metaKey: true }],
    ['Ctrl', { ctrlKey: true }],
  ])('toggles the sidebar with %s+B', (_label, modifiers) => {
    const { toggleSider } = renderConversationShortcuts();

    const event = dispatchShortcut(window, { key: 'b', ...modifiers });

    expect(toggleSider).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('toggles the sidebar while the composer textarea is focused', () => {
    const composer = document.createElement('textarea');
    document.body.appendChild(composer);
    composer.focus();
    const { toggleSider } = renderConversationShortcuts();

    const event = dispatchShortcut(composer, { key: 'b', metaKey: true });

    expect(toggleSider).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it('keeps the existing new-conversation shortcut isolated from common UI actions', () => {
    const { navigate, toggleSider } = renderConversationShortcuts();

    const event = dispatchShortcut(window, { key: 't', ctrlKey: true });

    expect(navigate).toHaveBeenCalledWith('/guid');
    expect(toggleSider).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('uses the enabled workspace consumer and preserves its collapse state owner', () => {
    const { result } = renderHook(() => {
      const workspace = useWorkspaceCollapse({
        workspaceEnabled: true,
        isMobile: false,
        conversation_id: 'conversation-1',
      });
      useConversationShortcuts({
        navigate: vi.fn() as unknown as NavigateFunction,
        toggleSider: vi.fn(),
      });
      return workspace;
    });

    const event = dispatchShortcut(window, { key: 'l', ctrlKey: true });

    expect(result.current.rightSiderCollapsed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Cmd/Ctrl+L untouched when the conversation has no enabled workspace', () => {
    const { result } = renderHook(() => {
      const workspace = useWorkspaceCollapse({
        workspaceEnabled: false,
        isMobile: false,
        conversation_id: 'conversation-1',
      });
      useConversationShortcuts({
        navigate: vi.fn() as unknown as NavigateFunction,
        toggleSider: vi.fn(),
      });
      return workspace;
    });

    const event = dispatchShortcut(window, { key: 'l', metaKey: true });

    expect(result.current.rightSiderCollapsed).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it('toggles a temporary workspace while its composer textarea is focused', () => {
    testState.pathname = '/guid';
    const composer = document.createElement('textarea');
    document.body.appendChild(composer);
    composer.focus();
    const { result } = renderHook(() => {
      const workspace = useWorkspaceCollapse({
        workspaceEnabled: true,
        isMobile: false,
        conversation_id: 'temporary-conversation',
        isTemporaryWorkspace: true,
      });
      useConversationShortcuts({
        navigate: vi.fn() as unknown as NavigateFunction,
        toggleSider: vi.fn(),
      });
      return workspace;
    });

    const event = dispatchShortcut(composer, { key: 'l', metaKey: true });

    expect(result.current.rightSiderCollapsed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves workspace shortcuts to embedded code editors', () => {
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);
    const { result } = renderHook(() => {
      const workspace = useWorkspaceCollapse({
        workspaceEnabled: true,
        isMobile: false,
        conversation_id: 'conversation-1',
      });
      useConversationShortcuts({
        navigate: vi.fn() as unknown as NavigateFunction,
        toggleSider: vi.fn(),
      });
      return workspace;
    });

    const event = dispatchShortcut(editor, { key: 'l', ctrlKey: true });

    expect(result.current.rightSiderCollapsed).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores chords with wrong modifiers or unsafe keyboard state', () => {
    const { toggleSider } = renderConversationShortcuts();
    const ineligibleEvents: KeyboardEventInit[] = [
      { key: 'b' },
      { key: 'b', ctrlKey: true, metaKey: true },
      { key: 'b', ctrlKey: true, altKey: true },
      { key: 'b', ctrlKey: true, shiftKey: true },
      { key: 'b', ctrlKey: true, repeat: true },
      { key: 'b', ctrlKey: true, isComposing: true },
    ];

    for (const init of ineligibleEvents) {
      dispatchShortcut(window, init);
    }
    const preventedEvent = new KeyboardEvent('keydown', {
      key: 'b',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    preventedEvent.preventDefault();
    act(() => window.dispatchEvent(preventedEvent));

    expect(toggleSider).not.toHaveBeenCalled();
  });

  it('leaves sidebar shortcuts to embedded code editors, terminals, and frames', () => {
    const { toggleSider } = renderConversationShortcuts();
    const targets = [
      Object.assign(document.createElement('div'), { className: 'cm-editor' }),
      Object.assign(document.createElement('div'), { className: 'monaco-editor' }),
      Object.assign(document.createElement('div'), { className: 'xterm' }),
      document.createElement('webview'),
      document.createElement('iframe'),
    ];

    const events = targets.map((target) => {
      document.body.appendChild(target);
      return dispatchShortcut(target, { key: 'b', ctrlKey: true });
    });

    expect(toggleSider).not.toHaveBeenCalled();
    expect(events.every((event) => !event.defaultPrevented)).toBe(true);
  });

  it('handles text and SVG event targets without assuming HTMLElement APIs', () => {
    const { toggleSider } = renderConversationShortcuts();
    const wrapper = document.createElement('div');
    const textTarget = document.createTextNode('label');
    const svgTarget = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrapper.append(textTarget, svgTarget);
    document.body.appendChild(wrapper);

    dispatchShortcut(textTarget, { key: 'b', ctrlKey: true });
    dispatchShortcut(svgTarget, { key: 'b', metaKey: true });

    expect(toggleSider).toHaveBeenCalledTimes(2);
  });

  it('falls back to the event target when composedPath is unavailable', () => {
    const input = document.createElement('input');
    const event = {
      composedPath: undefined,
      target: input,
    } as unknown as KeyboardEvent;

    expect(isShortcutBlockedByTarget(event)).toBe(true);
  });

  it('reports an unhandled workspace toggle when no window global is available', () => {
    vi.stubGlobal('window', undefined);

    try {
      expect(dispatchWorkspaceToggleEvent()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('yields when an embedded surface owns focus after event retargeting', () => {
    const { toggleSider } = renderConversationShortcuts();
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    frame.focus();

    const event = dispatchShortcut(window, { key: 'b', ctrlKey: true });

    expect(document.activeElement).toBe(frame);
    expect(toggleSider).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('checks focused element ancestors when an editor event is retargeted', () => {
    const { toggleSider } = renderConversationShortcuts();
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const editorControl = document.createElement('div');
    editorControl.tabIndex = 0;
    editor.appendChild(editorControl);
    document.body.appendChild(editor);
    editorControl.focus();

    const event = dispatchShortcut(window, { key: 'b', metaKey: true });

    expect(document.activeElement).toBe(editorControl);
    expect(toggleSider).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps browser shortcuts intact in WebUI', () => {
    testState.desktop = false;
    const { toggleSider } = renderConversationShortcuts();

    const event = dispatchShortcut(window, { key: 'b', ctrlKey: true });

    expect(toggleSider).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes its listener on unmount', () => {
    const { toggleSider, unmount } = renderConversationShortcuts();
    unmount();

    const event = dispatchShortcut(window, { key: 'b', metaKey: true });

    expect(toggleSider).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('rebinds without retaining a stale listener after dependencies change', () => {
    const firstToggle = vi.fn();
    const secondToggle = vi.fn();
    const navigate = vi.fn() as unknown as NavigateFunction;
    const { rerender } = renderHook(({ toggleSider }) => useConversationShortcuts({ navigate, toggleSider }), {
      initialProps: { toggleSider: firstToggle },
    });

    rerender({ toggleSider: secondToggle });
    dispatchShortcut(window, { key: 'b', ctrlKey: true });

    expect(firstToggle).not.toHaveBeenCalled();
    expect(secondToggle).toHaveBeenCalledTimes(1);
  });
});

describe('existing conversation search shortcuts', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: globalThis.electronAPI,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('opens current-conversation search with Cmd/Ctrl+F on desktop', () => {
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));

    const event = dispatchShortcut(document.body, { key: 'f', metaKey: true });

    expect(result.current.visible).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not replace CodeMirror find with current-conversation search', () => {
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));
    const editor = document.createElement('div');
    editor.className = 'cm-editor';
    document.body.appendChild(editor);

    const event = dispatchShortcut(editor, { key: 'f', ctrlKey: true });

    expect(result.current.visible).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps current-conversation search available while the message input is focused', () => {
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    const event = dispatchShortcut(input, { key: 'f', ctrlKey: true });

    expect(result.current.visible).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not consume current-conversation find when no conversation is active', () => {
    const { result } = renderHook(() => useMinimapPanel(undefined));

    const event = dispatchShortcut(document.body, { key: 'f', ctrlKey: true });

    expect(result.current.visible).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('opens global search with Cmd/Ctrl+Shift+F on desktop', () => {
    render(
      <ConversationSearchPopover
        renderTrigger={({ isActive }) => <div data-testid='global-search-state'>{String(isActive)}</div>}
      />
    );

    const event = dispatchShortcut(document.body, { key: 'f', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('global-search-state')).toHaveTextContent('true');
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not replace Monaco find with global search', () => {
    render(
      <ConversationSearchPopover
        renderTrigger={({ isActive }) => <div data-testid='global-search-state'>{String(isActive)}</div>}
      />
    );
    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    document.body.appendChild(editor);

    const event = dispatchShortcut(editor, { key: 'f', metaKey: true, shiftKey: true });

    expect(screen.getByTestId('global-search-state')).toHaveTextContent('false');
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps global search available while the message input is focused', () => {
    render(
      <ConversationSearchPopover
        renderTrigger={({ isActive }) => <div data-testid='global-search-state'>{String(isActive)}</div>}
      />
    );
    const input = document.createElement('textarea');
    document.body.appendChild(input);

    const event = dispatchShortcut(input, { key: 'f', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('global-search-state')).toHaveTextContent('true');
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not consume global search when the trigger is disabled', () => {
    render(
      <ConversationSearchPopover
        disabled
        renderTrigger={({ isActive }) => <div data-testid='global-search-state'>{String(isActive)}</div>}
      />
    );

    const event = dispatchShortcut(document.body, { key: 'f', metaKey: true, shiftKey: true });

    expect(screen.getByTestId('global-search-state')).toHaveTextContent('false');
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves current-conversation find to the browser in WebUI', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
    const { result } = renderHook(() => useMinimapPanel('conversation-1'));

    const event = dispatchShortcut(document.body, { key: 'f', ctrlKey: true });

    expect(result.current.visible).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves global search to the browser in WebUI', () => {
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: undefined,
    });
    render(
      <ConversationSearchPopover
        renderTrigger={({ isActive }) => <div data-testid='global-search-state'>{String(isActive)}</div>}
      />
    );

    const event = dispatchShortcut(document.body, { key: 'f', ctrlKey: true, shiftKey: true });

    expect(screen.getByTestId('global-search-state')).toHaveTextContent('false');
    expect(event.defaultPrevented).toBe(false);
  });

  it('removes the current-conversation search listener on unmount', () => {
    const { unmount } = renderHook(() => useMinimapPanel('conversation-1'));
    unmount();

    const event = dispatchShortcut(document.body, { key: 'f', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
  });
});
