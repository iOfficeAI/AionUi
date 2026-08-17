/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Stub the heavy tree; the column test only covers host chrome (gating, collapse).
vi.mock('@/renderer/pages/conversation/explorer/ExplorerContainer', () => ({
  ExplorerContainer: ({ projectId }: { projectId: string }) => <div data-testid='explorer'>{projectId}</div>,
}));

import { ProjectPanelHost } from '@/renderer/components/layout/ProjectPanelHost';
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
