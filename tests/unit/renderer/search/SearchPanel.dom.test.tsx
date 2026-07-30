/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
// Stub the icon (pulls @iconify collections) — irrelevant to behavior under test.
vi.mock('@/renderer/pages/conversation/explorer/fileIcon/FileTypeIcon', () => ({
  default: () => <i data-testid='icon' />,
}));

import type { SearchHit } from '@/renderer/pages/conversation/explorer/search/searchModel';
import type { SearchView } from '@/renderer/pages/conversation/explorer/search/searchStore';

// Controllable useFileSearch: tests set `hooks.view` before the action that
// re-renders (typing), and assert `hooks.runSearch` / `hooks.cancel` calls.
const hooks = vi.hoisted(() => ({
  view: { query: '', hits: [], status: 'idle', limitReached: false, total: 0, owner: 'panel' } as SearchView,
  runSearch: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock('@/renderer/pages/conversation/explorer/search/useFileSearch', () => ({
  useFileSearch: () => ({ view: hooks.view, runSearch: hooks.runSearch, cancel: hooks.cancel }),
}));

import { SearchPanel } from '@/renderer/pages/conversation/explorer/search/SearchPanel';

const hit = (name: string): SearchHit => ({ pe_id: 'pe1', relative_path: `src/${name}`, name });

const setView = (v: Partial<SearchView>): void => {
  hooks.view = { query: '', hits: [], status: 'idle', limitReached: false, total: 0, owner: 'panel', ...v };
};

const renderPanel = (
  props: {
    onRevealHit?: (h: SearchHit) => void;
    onAddHit?: (h: SearchHit) => void;
    peNames?: Record<string, string>;
  } = {}
) =>
  render(
    <SearchPanel
      roots={[{ pe_id: 'pe1', relative_path: '' }]}
      peNames={props.peNames ?? {}}
      onRevealHit={props.onRevealHit ?? (() => {})}
      onAddHit={props.onAddHit}
    >
      <div data-testid='tree'>TREE</div>
    </SearchPanel>
  );

const type = (value: string): void => fireEvent.change(screen.getByRole('textbox'), { target: { value } });

beforeEach(() => {
  setView({});
  hooks.runSearch.mockClear();
  hooks.cancel.mockClear();
});
afterEach(() => cleanup());

describe('SearchPanel', () => {
  it('shows the tree while the query is empty and keeps it mounted (hidden) while searching', () => {
    renderPanel();
    expect(screen.getByTestId('tree')).toBeTruthy();

    setView({ hits: [hit('a.tsx')], status: 'done' });
    type('a');
    // Tree stays in the DOM (WS subscriptions must not thrash) — just hidden.
    const tree = screen.getByTestId('tree');
    expect(tree).toBeTruthy();
    expect((tree.parentElement as HTMLElement).style.display).toBe('none');
    expect(screen.getByText('src/a.tsx')).toBeTruthy();
  });

  it('drives runSearch on input and cancel on clear', () => {
    renderPanel();
    type('btn');
    expect(hooks.runSearch).toHaveBeenCalledWith('btn');
    type('');
    expect(hooks.cancel).toHaveBeenCalled();
  });

  it('clicking a result row reveals it (not preview)', () => {
    const onRevealHit = vi.fn();
    setView({ hits: [hit('Button.tsx')], status: 'done' });
    renderPanel({ onRevealHit });
    type('btn');
    fireEvent.click(screen.getByText('Button.tsx').closest('[role="button"]') as Element);
    expect(onRevealHit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Button.tsx' }));
  });

  it('labels a hit with PE_NAME · REL when the pe name is known (multi-folder)', () => {
    setView({ hits: [hit('Button.tsx')], status: 'done' });
    renderPanel({ peNames: { pe1: 'TEAMS' } });
    type('btn');
    expect(screen.getByText('TEAMS · src/Button.tsx')).toBeTruthy();
  });

  it('clicking a result exits search (clears query) so the revealed tree is visible', () => {
    const onRevealHit = vi.fn();
    setView({ hits: [hit('Button.tsx')], status: 'done' });
    renderPanel({ onRevealHit });
    type('btn');
    fireEvent.click(screen.getByText('src/Button.tsx').closest('[role="button"]') as Element);
    expect(onRevealHit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Button.tsx' }));
    // Query cleared → result list gone, tree back in view (not display:none).
    expect(screen.getByRole('textbox')).toHaveProperty('value', '');
    expect((screen.getByTestId('tree').parentElement as HTMLElement).style.display).not.toBe('none');
  });

  it('when the @ mention owns the stream: no results AND no blank pane (falls back to tree)', () => {
    setView({ hits: [hit('Button.tsx')], status: 'done', owner: 'mention' });
    renderPanel();
    type('btn');
    // Query is active but this panel does not own the stream → no rows shown …
    expect(screen.queryByText('src/Button.tsx')).toBeNull();
    // … and the tree falls back into view (not hidden) so there is no blank pane.
    expect((screen.getByTestId('tree').parentElement as HTMLElement).style.display).not.toBe('none');
  });

  it('add-to-chat is an explicit action that does not trigger reveal', () => {
    const onRevealHit = vi.fn();
    const onAddHit = vi.fn();
    setView({ hits: [hit('Button.tsx')], status: 'done' });
    renderPanel({ onRevealHit, onAddHit });
    type('btn');
    fireEvent.click(screen.getByLabelText('conversation.explorer.contextMenu.addToChat'));
    expect(onAddHit).toHaveBeenCalledWith(expect.objectContaining({ name: 'Button.tsx' }));
    expect(onRevealHit).not.toHaveBeenCalled();
  });

  it('hides the add action when no conversation is active (onAddHit omitted)', () => {
    setView({ hits: [hit('Button.tsx')], status: 'done' });
    renderPanel();
    type('btn');
    expect(screen.queryByLabelText('conversation.explorer.contextMenu.addToChat')).toBeNull();
  });

  it('shows the empty state and the limit-reached hint', () => {
    setView({ hits: [], status: 'done' });
    const { rerender } = renderPanel();
    type('zzz');
    expect(screen.getByText('conversation.explorer.search.empty')).toBeTruthy();

    setView({ hits: [hit('a.tsx')], status: 'done', limitReached: true, total: 200 });
    rerender(
      <SearchPanel roots={[{ pe_id: 'pe1', relative_path: '' }]} peNames={{}} onRevealHit={() => {}}>
        <div data-testid='tree'>TREE</div>
      </SearchPanel>
    );
    type('a');
    expect(screen.getByText('conversation.explorer.search.limitReached')).toBeTruthy();
  });
});
