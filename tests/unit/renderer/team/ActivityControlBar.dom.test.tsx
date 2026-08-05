/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

import ActivityControlBar, { type ActivityControlsState } from '@/renderer/pages/team/activity/ActivityControlBar';

const base: ActivityControlsState = {
  sortDirection: 'desc',
  contentFilter: 'all',
  selectedMembers: [],
  showSystemMessages: false,
  showTerminalTasks: false,
};

beforeEach(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({
        matches: false,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
});

afterEach(() => cleanup());

describe('ActivityControlBar', () => {
  it('toggles sort direction', async () => {
    const onChange = vi.fn();
    render(<ActivityControlBar value={base} onChange={onChange} members={[{ slotId: 'a1', name: 'Alice' }]} />);
    await userEvent.click(screen.getByText('Oldest'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortDirection: 'asc' }));
  });

  it('changes the content filter', async () => {
    const onChange = vi.fn();
    render(<ActivityControlBar value={base} onChange={onChange} members={[]} />);
    await userEvent.click(screen.getByText('Tasks'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ contentFilter: 'tasks' }));
  });

  it('toggles the terminal-task switch', async () => {
    const onChange = vi.fn();
    render(<ActivityControlBar value={base} onChange={onChange} members={[]} />);
    await userEvent.click(screen.getByTestId('activity-show-terminal'));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showTerminalTasks: true }));
  });

  it('does not render a connector toggle', () => {
    render(<ActivityControlBar value={base} onChange={vi.fn()} members={[]} />);
    expect(screen.queryByTestId('activity-connectors')).toBeNull();
  });

  it('member dropdown includes an unassigned/external option', async () => {
    render(<ActivityControlBar value={base} onChange={vi.fn()} members={[{ slotId: 'a1', name: 'Alice' }]} />);
    // Open the Arco multi-select popup.
    await userEvent.click(screen.getByTestId('activity-members').querySelector('.arco-select-view') as Element);
    expect(await screen.findByText('Unassigned / external')).toBeInTheDocument();
  });
});
