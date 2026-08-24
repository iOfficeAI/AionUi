/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The preview tab strip's only close affordance used to be the per-tab X. The
 * right-click menu offered close-left / right / others / all but had no way to
 * close the tab you actually right-clicked — and the menu itself never appeared,
 * because the preview panel's enter animation leaves a transform behind, which
 * makes a `position: fixed` descendant resolve against the panel instead of the
 * viewport and pushed the menu off-screen.
 *
 * These cover the portal that fixes that, the entries added alongside it, and
 * the right-click wiring, which had no test at all (the e2e only exercised
 * middle-click).
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { isMacOSMock } = vi.hoisted(() => ({ isMacOSMock: vi.fn(() => true) }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/utils/platform', () => ({ isMacOS: isMacOSMock }));

import PreviewContextMenu from '@renderer/pages/conversation/Preview/components/PreviewPanel/PreviewContextMenu';
import PreviewTabs from '@renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';
import type { PreviewTab } from '@renderer/pages/conversation/Preview/components/PreviewPanel/PreviewTabs';

const TABS: PreviewTab[] = [
  { id: 'a', title: 'alpha.md', canCopyPath: true, canCopyRelativePath: true, canRevealInFolder: true },
  { id: 'b', title: 'beta.md', canCopyPath: true, canCopyRelativePath: true, canRevealInFolder: true },
  { id: 'c', title: 'gamma.md' },
];

type MenuHandlers = {
  onClose: ReturnType<typeof vi.fn>;
  onCloseTab: ReturnType<typeof vi.fn>;
  onCloseLeft: ReturnType<typeof vi.fn>;
  onCloseRight: ReturnType<typeof vi.fn>;
  onCloseOthers: ReturnType<typeof vi.fn>;
  onCloseUnmodified: ReturnType<typeof vi.fn>;
  onCloseAll: ReturnType<typeof vi.fn>;
  onCopyPath: ReturnType<typeof vi.fn>;
  onCopyRelativePath: ReturnType<typeof vi.fn>;
  onRevealInFolder: ReturnType<typeof vi.fn>;
};

const renderMenu = (
  tabId: string,
  options: { tabs?: PreviewTab[]; x?: number; y?: number } = {}
): MenuHandlers & { container: HTMLElement } => {
  const handlers: MenuHandlers = {
    onClose: vi.fn(),
    onCloseTab: vi.fn(),
    onCloseLeft: vi.fn(),
    onCloseRight: vi.fn(),
    onCloseOthers: vi.fn(),
    onCloseUnmodified: vi.fn(),
    onCloseAll: vi.fn(),
    onCopyPath: vi.fn(),
    onCopyRelativePath: vi.fn(),
    onRevealInFolder: vi.fn(),
  };
  const { container } = render(
    <PreviewContextMenu
      contextMenu={{ show: true, x: options.x ?? 10, y: options.y ?? 10, tabId }}
      tabs={options.tabs ?? TABS}
      currentTheme='light'
      {...handlers}
    />
  );
  return { ...handlers, container };
};

/** The menu's own root — the element carrying the fixed positioning. */
const menuRoot = (): HTMLElement => {
  const element = screen.getByText('preview.close').closest('.fixed');
  if (!(element instanceof HTMLElement)) throw new Error('context menu root not found');
  return element;
};

beforeEach(() => {
  isMacOSMock.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('preview tab context menu — placement', () => {
  it('renders outside the preview panel subtree so fixed positioning tracks the viewport', () => {
    // The regression this guards: rendered in place, the panel's leftover
    // transform makes the menu's viewport coordinates resolve against the panel,
    // parking it off-screen. Portalling to body is what restores it.
    const { container } = renderMenu('b');

    expect(container.contains(menuRoot())).toBe(false);
    expect(document.body.contains(menuRoot())).toBe(true);
  });

  it('honours the click coordinates when the menu fits on screen', () => {
    renderMenu('b', { x: 40, y: 60 });

    expect(menuRoot().style.left).toBe('40px');
    expect(menuRoot().style.top).toBe('60px');
  });

  it('pulls the menu back inside the viewport when it would overflow', () => {
    const width = 200;
    const height = 300;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width, height } as DOMRect);

    renderMenu('b', { x: window.innerWidth - 5, y: window.innerHeight - 5 });

    // 8px is the margin the menu keeps from the viewport edge.
    expect(menuRoot().style.left).toBe(`${window.innerWidth - width - 8}px`);
    expect(menuRoot().style.top).toBe(`${window.innerHeight - height - 8}px`);
  });

  it('never places the menu at a negative offset when it is taller than the viewport', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: window.innerWidth + 500,
      height: window.innerHeight + 500,
    } as DOMRect);

    renderMenu('b', { x: 300, y: 300 });

    expect(menuRoot().style.left).toBe('8px');
    expect(menuRoot().style.top).toBe('8px');
  });
});

describe('preview tab context menu — closing tabs', () => {
  it('offers closing the tab that was right-clicked', () => {
    renderMenu('b');
    expect(screen.getByText('preview.close')).toBeTruthy();
  });

  it('closes that tab and dismisses the menu when the entry is clicked', () => {
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.close'));

    expect(handlers.onCloseTab).toHaveBeenCalledWith('b');
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('keeps close enabled even for the only open tab', () => {
    const handlers = renderMenu('a', { tabs: [TABS[0]] });
    fireEvent.click(screen.getByText('preview.close'));

    expect(handlers.onCloseTab).toHaveBeenCalledWith('a');
  });

  it('shows the platform shortcut alongside the close entry', () => {
    renderMenu('b');
    expect(screen.getByText('⌘W')).toBeTruthy();
  });

  it('spells the shortcut with Ctrl off macOS', () => {
    isMacOSMock.mockReturnValue(false);
    renderMenu('b');
    expect(screen.getByText('Ctrl+W')).toBeTruthy();
  });

  it('still offers every bulk close entry', () => {
    renderMenu('b');
    for (const key of [
      'preview.closeLeft',
      'preview.closeRight',
      'preview.closeOthers',
      'preview.closeUnmodified',
      'preview.closeAll',
    ]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
  });

  it('dismisses the menu after a bulk close, not only after a single close', () => {
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.closeOthers'));

    expect(handlers.onCloseOthers).toHaveBeenCalledWith('b');
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('does not fire close-left for the leftmost tab', () => {
    const handlers = renderMenu('a');
    fireEvent.click(screen.getByText('preview.closeLeft'));

    expect(handlers.onCloseLeft).not.toHaveBeenCalled();
  });

  it('does not fire close-right for the rightmost tab', () => {
    const handlers = renderMenu('c');
    fireEvent.click(screen.getByText('preview.closeRight'));

    expect(handlers.onCloseRight).not.toHaveBeenCalled();
  });
});

describe('preview tab context menu — close unmodified', () => {
  it('closes the unmodified tabs regardless of which tab was right-clicked', () => {
    const handlers = renderMenu('b', {
      tabs: [{ id: 'a', title: 'a', isDirty: true }, TABS[1]],
    });
    fireEvent.click(screen.getByText('preview.closeUnmodified'));

    expect(handlers.onCloseUnmodified).toHaveBeenCalled();
  });

  it('greys out the entry when every open tab has unsaved edits', () => {
    const handlers = renderMenu('a', {
      tabs: [
        { id: 'a', title: 'a', isDirty: true },
        { id: 'b', title: 'b', isDirty: true },
      ],
    });
    fireEvent.click(screen.getByText('preview.closeUnmodified'));

    expect(handlers.onCloseUnmodified).not.toHaveBeenCalled();
  });
});

describe('preview tab context menu — copying paths', () => {
  it('asks the panel to copy the right-clicked tab, not the first one', () => {
    // Guards the indexing: reading tabs[0] would pass every single-tab test.
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.copyPath'));

    expect(handlers.onCopyPath).toHaveBeenCalledWith('b');
  });

  it('routes the relative path through its own handler', () => {
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.copyRelativePath'));

    expect(handlers.onCopyRelativePath).toHaveBeenCalledWith('b');
    expect(handlers.onCopyPath).not.toHaveBeenCalled();
  });

  it('offers copy-path for a tab whose absolute path only the backend can resolve', () => {
    // The regression: Explorer-opened tabs hold no absolute path in the renderer,
    // and treating that as "nothing to copy" greyed the entry out for the
    // commonest kind of tab there is.
    const handlers = renderMenu('e', {
      tabs: [{ id: 'e', title: 'app.tsx', canCopyPath: true, canCopyRelativePath: true }],
    });
    fireEvent.click(screen.getByText('preview.copyPath'));

    expect(handlers.onCopyPath).toHaveBeenCalledWith('e');
  });

  it('greys out both entries for a tab with no addressable path', () => {
    const handlers = renderMenu('c');
    fireEvent.click(screen.getByText('preview.copyPath'));
    fireEvent.click(screen.getByText('preview.copyRelativePath'));

    expect(handlers.onCopyPath).not.toHaveBeenCalled();
    expect(handlers.onCopyRelativePath).not.toHaveBeenCalled();
  });

  it('greys out only the relative entry when the file sits outside the workspace', () => {
    const handlers = renderMenu('d', {
      tabs: [{ id: 'd', title: 'outside.txt', canCopyPath: true }],
    });
    fireEvent.click(screen.getByText('preview.copyRelativePath'));
    expect(handlers.onCopyRelativePath).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('preview.copyPath'));
    expect(handlers.onCopyPath).toHaveBeenCalledWith('d');
  });
});

describe('preview tab context menu — show in folder', () => {
  it('asks the panel to locate the right-clicked tab', () => {
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.openLocation'));

    expect(handlers.onRevealInFolder).toHaveBeenCalledWith('b');
  });

  it('greys out for a tab with no file behind it', () => {
    // Browser tabs and address-less tabs land here: there is no folder to open.
    const handlers = renderMenu('c');
    fireEvent.click(screen.getByText('preview.openLocation'));

    expect(handlers.onRevealInFolder).not.toHaveBeenCalled();
  });

  it('stays available for a file whose path only the backend can resolve', () => {
    const handlers = renderMenu('e', {
      tabs: [{ id: 'e', title: 'app.tsx', canCopyPath: true, canRevealInFolder: true }],
    });
    fireEvent.click(screen.getByText('preview.openLocation'));

    expect(handlers.onRevealInFolder).toHaveBeenCalledWith('e');
  });

  it('dismisses the menu once the file manager has been asked to open', () => {
    const handlers = renderMenu('b');
    fireEvent.click(screen.getByText('preview.openLocation'));

    expect(handlers.onClose).toHaveBeenCalled();
  });
});

describe('preview tab context menu — dismissal', () => {
  it('closes on Escape so the keyboard has a way out', () => {
    const handlers = renderMenu('b');
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('ignores unrelated keys', () => {
    const handlers = renderMenu('b');
    fireEvent.keyDown(document, { key: 'a' });

    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('closes when clicking outside, but not inside itself', () => {
    const handlers = renderMenu('b');

    fireEvent.mouseDown(menuRoot());
    expect(handlers.onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it('renders nothing when no tab is targeted', () => {
    render(
      <PreviewContextMenu
        contextMenu={{ show: true, x: 0, y: 0, tabId: null }}
        tabs={TABS}
        currentTheme='light'
        onClose={vi.fn()}
        onCloseTab={vi.fn()}
        onCloseLeft={vi.fn()}
        onCloseRight={vi.fn()}
        onCloseOthers={vi.fn()}
        onCloseUnmodified={vi.fn()}
        onCloseAll={vi.fn()}
        onCopyPath={vi.fn()}
        onCopyRelativePath={vi.fn()}
        onRevealInFolder={vi.fn()}
      />
    );

    expect(screen.queryByText('preview.close')).toBeNull();
  });
});

describe('preview tab right-click wiring', () => {
  it('reports the right-clicked tab to the panel', () => {
    const onContextMenu = vi.fn();
    render(
      <PreviewTabs
        tabs={TABS}
        activeTabId='a'
        tabFadeState={{ left: false, right: false }}
        tabsContainerRef={React.createRef<HTMLDivElement>() as never}
        onSwitchTab={vi.fn()}
        onCloseTab={vi.fn()}
        onContextMenu={onContextMenu}
      />
    );

    fireEvent.contextMenu(screen.getByText('beta.md'));
    expect(onContextMenu).toHaveBeenCalled();
    expect(onContextMenu.mock.calls[0][1]).toBe('b');
  });
});
