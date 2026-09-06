/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the heavy tree; the column test only covers host chrome (gating, collapse).
vi.mock('@/renderer/pages/conversation/explorer/ExplorerContainer', () => ({
  ExplorerContainer: ({ projectId }: { projectId: string }) => <div data-testid='explorer'>{projectId}</div>,
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { ProjectPanelHost } from '@/renderer/components/layout/ProjectPanelHost';
import { PanelEmptyState } from '@/renderer/pages/conversation/Preview/components/PanelEmptyState';
import {
  setCurrentProject,
  resetCurrentProjectForTest,
} from '@/renderer/pages/conversation/explorer/currentProjectStore';

beforeEach(() => resetCurrentProjectForTest());
afterEach(() => cleanup());

describe('ProjectPanelHost (Layout-level host chrome)', () => {
  it('renders nothing when there is no active project', () => {
    render(<ProjectPanelHost widthPx={260} collapsed={false} />);
    expect(document.querySelector('[data-explorer-column]')).toBeNull();
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });

  it('renders the explorer column (expanded) for the active project', () => {
    setCurrentProject('proj-9');
    render(<ProjectPanelHost widthPx={280} collapsed={false} />);
    const col = document.querySelector('[data-explorer-column]') as HTMLElement;
    expect(col).not.toBeNull();
    expect(col.getAttribute('data-mount-id')).toBeTruthy();
    expect(col.getAttribute('data-collapsed')).toBe('false');
    expect(col.style.width).toBe('280px');
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
  });

  it('collapses to width 0 but keeps the explorer mounted (no remount)', () => {
    setCurrentProject('proj-9');
    render(<ProjectPanelHost widthPx={280} collapsed />);
    const col = document.querySelector('[data-explorer-column]') as HTMLElement;
    expect(col.getAttribute('data-collapsed')).toBe('true');
    expect(col.style.width).toBe('0px');
    // Component stays mounted — collapse is width-only, not an unmount.
    expect(screen.getByTestId('explorer')).toHaveTextContent('proj-9');
  });

  it('does not render a duplicate collapse control inside the explorer column', () => {
    setCurrentProject('proj-9');
    render(<ProjectPanelHost widthPx={280} collapsed={false} />);
    expect(screen.queryByLabelText('Collapse explorer')).not.toBeInTheDocument();
  });
});

/**
 * On a route that still hosts the column, a null project must not tear the
 * column out: that is the right-hand panel appearing and disappearing.
 */
describe('ProjectPanelHost held open while empty', () => {
  it('keeps an empty column, with a quiet empty state, when asked to', () => {
    render(<ProjectPanelHost widthPx={260} collapsed={false} keepMountedWhileEmpty />);
    const column = document.querySelector('[data-explorer-column]') as HTMLElement;
    expect(column).not.toBeNull();
    expect(column.getAttribute('data-empty')).toBe('true');
    expect(column.style.width).toBe('260px');
    expect(screen.getByTestId('project-panel-empty-state').textContent).toContain(
      'conversation.splitGroup.emptyColumnPanel'
    );
    expect(screen.queryByTestId('explorer')).not.toBeInTheDocument();
  });

  it('keeps the same mount when a project arrives, so the column is not rebuilt', () => {
    const { rerender } = render(<ProjectPanelHost widthPx={260} collapsed={false} keepMountedWhileEmpty />);
    const before = document.querySelector('[data-explorer-column]')?.getAttribute('data-mount-id');
    setCurrentProject('proj-1');
    rerender(<ProjectPanelHost widthPx={260} collapsed={false} keepMountedWhileEmpty />);
    expect(document.querySelector('[data-explorer-column]')?.getAttribute('data-mount-id')).toBe(before);
    expect(screen.getByTestId('explorer').textContent).toBe('proj-1');
    expect(screen.queryByTestId('project-panel-empty-state')).not.toBeInTheDocument();
  });

  it('shows no empty state while collapsed', () => {
    render(<ProjectPanelHost widthPx={260} collapsed keepMountedWhileEmpty />);
    expect(document.querySelector('[data-explorer-column]')).not.toBeNull();
    expect(screen.queryByTestId('project-panel-empty-state')).not.toBeInTheDocument();
  });

  it('still renders nothing by default', () => {
    render(<ProjectPanelHost widthPx={260} collapsed={false} />);
    expect(document.querySelector('[data-explorer-column]')).toBeNull();
  });
});

/**
 * A held-open panel has to be dismissable from the column that has nothing in
 * it, or the user is stuck with an empty panel until they find a column that
 * has a tab to close.
 */
describe('PanelEmptyState', () => {
  it('offers a close when given one, labelled as the preview close, and calls it', () => {
    const onClose = vi.fn();
    render(<PanelEmptyState testId='empty' onClose={onClose} />);
    const close = screen.getByTestId('empty-close');
    expect(close.tagName).toBe('BUTTON');
    expect(close).toHaveAttribute('aria-label', 'preview.closePreview');
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('offers no close where there is nothing to close — the empty explorer column', () => {
    render(<ProjectPanelHost widthPx={260} collapsed={false} keepMountedWhileEmpty />);
    expect(screen.getByTestId('project-panel-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('project-panel-empty-state-close')).not.toBeInTheDocument();
  });
});
