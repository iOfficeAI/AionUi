/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mirror the project convention: t() echoes the key so labels/testids are assertable.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: 'en' } }),
}));

import { MarketingLadderView } from '@renderer/pages/commandCenter/index';

type LadderStage =
  | 'output_approved'
  | 'dispatch_requested'
  | 'observed_run'
  | 'start_gate'
  | 'dispatcher_prepared'
  | 'executor_promoted';

const STAGES: LadderStage[] = [
  'output_approved',
  'dispatch_requested',
  'observed_run',
  'start_gate',
  'dispatcher_prepared',
  'executor_promoted',
];

// Build a card whose ladder has the first `recordedCount` rungs recorded.
const makeCard = (cardId: string, recordedCount: number) => {
  const rungs = STAGES.map((stage, index) => ({
    stage,
    recorded: index < recordedCount,
    status: null as string | null,
    audit_event_id: index < recordedCount ? `evt-${stage}` : null,
    recorded_at: index < recordedCount ? 1000 + index : null,
  }));
  let highest: LadderStage | null = null;
  for (const rung of rungs) if (rung.recorded) highest = rung.stage;
  return {
    card_id: cardId,
    card_title: 'Demo card',
    card_status: 'todo',
    card_priority: 0,
    card_assignee: 'eve',
    lane_key: 'research' as const,
    created_at: 1,
    updated_at: null,
    linked_run_id: null,
    linked_audit_event_id: null,
    controller_review_status: null,
    controller_review_audit_event_id: null,
    controller_review_handoff_role: null,
    controller_review_handoff_dispatch: null,
    controller_decision_status: null,
    controller_decision_audit_event_id: null,
    controller_decision_handoff_role: null,
    controller_decision_handoff_dispatch: null,
    generated_draft_status: null,
    generated_draft_audit_event_id: null,
    generated_draft_source: null,
    generated_draft_text: null,
    generated_draft_at: null,
    governance_state: 'read_only' as const,
    ladder: {
      highest_recorded_stage: highest,
      executor_promoted: rungs[rungs.length - 1].recorded,
      rungs,
    },
  };
};

describe('MarketingLadderView (v15 A2 promote-UI)', () => {
  it('renders all six ladder rungs', () => {
    const card = makeCard('card-1', 0);
    render(
      <MarketingLadderView
        card={card as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={vi.fn()}
        onPromoteExecutor={vi.fn()}
      />
    );
    for (const stage of STAGES) {
      expect(screen.getByTestId(`marketing-card-ladder-rung-${stage}-card-1`)).toBeTruthy();
    }
  });

  it('only the first un-recorded rung is advanceable (sequential ladder)', () => {
    // Two rungs recorded -> observed_run is the next actionable advance control.
    const card = makeCard('card-2', 2);
    const onAdvance = vi.fn();
    render(
      <MarketingLadderView
        card={card as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={onAdvance}
        onPromoteExecutor={vi.fn()}
      />
    );
    const observedBtn = screen.getByTestId('marketing-card-ladder-advance-observed_run-card-2') as HTMLButtonElement;
    expect(observedBtn.disabled).toBe(false);
    // A later, not-yet-actionable rung is disabled.
    const startGateBtn = screen.getByTestId('marketing-card-ladder-advance-start_gate-card-2') as HTMLButtonElement;
    expect(startGateBtn.disabled).toBe(true);
    fireEvent.click(observedBtn);
    expect(onAdvance).toHaveBeenCalledTimes(1);
    expect(onAdvance.mock.calls[0][1]).toBe('observed_run');
  });

  it('disables the promote button until dispatcher_prepared is recorded', () => {
    const notReady = makeCard('card-3', 4); // up to start_gate recorded, dispatcher not
    const { rerender } = render(
      <MarketingLadderView
        card={notReady as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={vi.fn()}
        onPromoteExecutor={vi.fn()}
      />
    );
    expect((screen.getByTestId('marketing-card-ladder-promote-card-3') as HTMLButtonElement).disabled).toBe(true);

    const ready = makeCard('card-3', 5); // dispatcher_prepared recorded, not yet promoted
    rerender(
      <MarketingLadderView
        card={ready as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={vi.fn()}
        onPromoteExecutor={vi.fn()}
      />
    );
    expect((screen.getByTestId('marketing-card-ladder-promote-card-3') as HTMLButtonElement).disabled).toBe(false);
  });

  it('promote button fires the explicit-approval handler (no advance control reaches promotion)', () => {
    const ready = makeCard('card-4', 5);
    const onPromote = vi.fn();
    const onAdvance = vi.fn();
    render(
      <MarketingLadderView
        card={ready as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={onAdvance}
        onPromoteExecutor={onPromote}
      />
    );
    // There is NO advance control for the promotion rung — only the promote button.
    expect(screen.queryByTestId('marketing-card-ladder-advance-executor_promoted-card-4')).toBeNull();
    fireEvent.click(screen.getByTestId('marketing-card-ladder-promote-card-4'));
    expect(onPromote).toHaveBeenCalledTimes(1);
    expect(onPromote.mock.calls[0][0].card_id).toBe('card-4');
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('shows the HG-3.5 recorded tag and disables promote once executor is promoted', () => {
    const promoted = makeCard('card-5', 6);
    render(
      <MarketingLadderView
        card={promoted as never}
        advancingStage={null}
        promoting={false}
        onAdvanceStage={vi.fn()}
        onPromoteExecutor={vi.fn()}
      />
    );
    expect(screen.getByTestId('marketing-card-ladder-hg35-card-5')).toBeTruthy();
    expect((screen.getByTestId('marketing-card-ladder-promote-card-5') as HTMLButtonElement).disabled).toBe(true);
  });
});
