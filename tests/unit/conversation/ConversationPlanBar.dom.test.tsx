/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * The plan bar is a LIVE progress view, not history. It must render only while
 * the plan's own turn is still running — a finished turn's "all completed"
 * checklist lingering over the next turn is the failure mode this guards.
 */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}:${Object.values(params).join('/')}` : key),
  }),
}));

const latestPlan = vi.fn();
const runtimeView = vi.fn();

vi.mock('@renderer/pages/conversation/PlanBar/useLatestPlan', () => ({
  __esModule: true,
  useLatestPlan: () => latestPlan(),
  selectLatestPlan: () => undefined,
}));

vi.mock('@renderer/pages/conversation/runtime/useConversationRuntimeView', () => ({
  __esModule: true,
  useConversationRuntimeView: () => runtimeView(),
}));

import { getChatSurfaceWidthClass } from '@renderer/pages/conversation/utils/chatSurfaceWidth';
import ConversationPlanBar from '@renderer/pages/conversation/PlanBar/ConversationPlanBar';

const ENTRIES = [
  { content: 'read the readme', status: 'completed' },
  { content: 'count the files', status: 'in_progress' },
  { content: 'summarize', status: 'pending' },
];

const plan = (turnId?: string) => ({
  id: 'plan:turn-a',
  msg_id: 'turn-a',
  conversation_id: 'conv-1',
  type: 'plan',
  position: 'left',
  created_at: 1,
  content: { entries: ENTRIES, turn_id: turnId },
});

const setup = (opts: { plan?: unknown; isProcessing?: boolean; activeTurnId?: string | null }) => {
  latestPlan.mockReturnValue(opts.plan);
  runtimeView.mockReturnValue({
    isProcessing: opts.isProcessing ?? false,
    activeTurnId: opts.activeTurnId ?? null,
    hydrated: true,
  });
  return render(<ConversationPlanBar conversation_id='conv-1' />);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ConversationPlanBar', () => {
  it('renders the plan while its own turn is running', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    expect(screen.getByText('conversation.planBar.title')).toBeTruthy();
    expect(screen.getByText('conversation.planBar.progress:1/3')).toBeTruthy();
  });

  it('renders nothing once the turn has ended', () => {
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: false, activeTurnId: null });
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for a plan belonging to a previous turn', () => {
    const { container } = setup({ plan: plan('turn-id-OLD'), isProcessing: true, activeTurnId: 'turn-id-NEW' });
    expect(container.innerHTML).toBe('');
  });

  it('falls back to the isProcessing check when the plan carries no turn_id', () => {
    setup({ plan: plan(undefined), isProcessing: true, activeTurnId: 'turn-id-1' });
    expect(screen.getByText('conversation.planBar.title')).toBeTruthy();
  });

  it('renders nothing when there is no plan at all', () => {
    const { container } = setup({ plan: undefined, isProcessing: true, activeTurnId: 'turn-id-1' });
    expect(container.innerHTML).toBe('');
  });

  it('uses the same width class as the send box so the bar does not overhang it', () => {
    // The bar sits directly above the send box. Both must share
    // `.chat-surface-fluid`, which reserves side gutters once the container is
    // wide enough — a full-bleed bar visibly overhangs the send box.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const bar = container.querySelector('[data-testid="conversation-plan-bar"]');
    expect(bar?.className).toContain(getChatSurfaceWidthClass());
  });

  it('keeps horizontal padding off the root so it does not overhang the send box', () => {
    // `.chat-surface-fluid` sets a computed `width`; the root resolves as
    // content-box, so padding there is ADDED on top. Measured live: the bar came
    // out 663px against the send box group's 647px — overhanging by exactly
    // 2x8px. The inset belongs on the children.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const bar = container.querySelector('[data-testid="conversation-plan-bar"]') as HTMLElement;
    expect(bar.className).toContain('chat-surface-fluid');
    expect(bar.className).not.toMatch(/(^|\s)-?p[xlre]-/);
  });

  it('caps its height relative to the viewport, not at a fixed pixel value', () => {
    // The zone above the send box also holds CommandQueuePanel (capped at
    // min(36vh, 320px)), ThoughtDisplay and a growable input. A fixed cap here
    // takes a large share of a short window and squeezes the message list, so
    // this bar follows the same viewport-relative convention as its neighbour.
    const { container } = setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    const scroller = container.querySelector('[data-testid="conversation-plan-bar"] .overflow-y-auto') as HTMLElement;
    expect(scroller).toBeTruthy();
    expect(scroller.style.maxHeight).toContain('vh');
  });

  it('is expanded by default so the live progress is visible without a click', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    for (const entry of ENTRIES) {
      expect(screen.getByText(entry.content)).toBeTruthy();
    }
  });

  it('collapses to the header on click and keeps the progress label', () => {
    setup({ plan: plan('turn-id-1'), isProcessing: true, activeTurnId: 'turn-id-1' });
    fireEvent.click(screen.getByRole('button'));

    expect(screen.queryByText('read the readme')).toBeNull();
    expect(screen.getByText('conversation.planBar.progress:1/3')).toBeTruthy();
  });
});
