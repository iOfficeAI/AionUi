/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ITeamMailboxMessage, ITeamTaskItem } from '@/common/types/team/teamTypes';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, o?: { defaultValue?: string }) => o?.defaultValue ?? _k }),
}));

import MessageCard, { type ActivityIdentityResolver } from '@/renderer/pages/team/activity/MessageCard';
import TaskCard from '@/renderer/pages/team/activity/TaskCard';

const identity: ActivityIdentityResolver = { nameOf: (s) => s ?? '', colorOf: () => '#123456' };

const message = (over: Partial<ITeamMailboxMessage> = {}): ITeamMailboxMessage => ({
  id: 'm1',
  team_id: 't1',
  from_agent_id: 'lead',
  to_agent_id: 'a1',
  msg_type: 'message',
  content: 'short',
  files: [],
  read: false,
  created_at: 1000,
  ...over,
});

const task = (over: Partial<ITeamTaskItem> = {}): ITeamTaskItem => ({
  id: 'tk1',
  team_id: 't1',
  subject: 'Build',
  status: 'pending',
  owner: 'a1',
  description: 'a description',
  blocked_by: [],
  blocks: [],
  created_at: 2000,
  updated_at: 2000,
  ...over,
});

/** Stub layout metrics so useIsClamped can decide overflow deterministically. */
function stubMetrics(scrollH: number, clientH: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => scrollH });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => clientH });
}

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

afterEach(() => {
  cleanup();
  // Restore metrics so other suites are unaffected.
  delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
  delete (HTMLElement.prototype as unknown as { clientHeight?: number }).clientHeight;
});

describe('MessageCard expand (overflow-driven)', () => {
  it('shows the expand button when the body overflows, regardless of char count', () => {
    stubMetrics(120, 60);
    render(<MessageCard message={message({ content: 'tiny' })} identity={identity} />);
    expect(screen.getByTestId('activity-message-expand')).toBeInTheDocument();
  });

  it('hides the expand button when the body fits', () => {
    stubMetrics(50, 60);
    render(<MessageCard message={message({ content: 'x'.repeat(200) })} identity={identity} />);
    expect(screen.queryByTestId('activity-message-expand')).toBeNull();
  });

  it('toggles expanded state on click', async () => {
    stubMetrics(120, 60);
    render(<MessageCard message={message()} identity={identity} />);
    const btn = screen.getByTestId('activity-message-expand');
    expect(btn).toHaveTextContent('Expand');
    await userEvent.click(btn);
    expect(screen.getByTestId('activity-message-expand')).toHaveTextContent('Collapse');
  });
});

describe('TaskCard expand (overflow-driven)', () => {
  it('shows the expand button when the description overflows', () => {
    stubMetrics(120, 40);
    render(<TaskCard task={task({ description: 'hi' })} identity={identity} />);
    expect(screen.getByTestId('activity-task-expand')).toBeInTheDocument();
  });

  it('hides the expand button when the description fits', () => {
    stubMetrics(30, 40);
    render(<TaskCard task={task({ description: 'y'.repeat(200) })} identity={identity} />);
    expect(screen.queryByTestId('activity-task-expand')).toBeNull();
  });
});
