/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  getSidebarStreamGuardDecision,
  shouldReconcileMarkGenerating,
} from '@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync';

describe('getSidebarStreamGuardDecision', () => {
  it('marks normal generating stream messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: false })).toEqual({
      markGenerating: true,
      clearCompleted: false,
      lateIgnored: false,
    });
  });

  it('marks tool_call frames as generating (direct-CLI tool streaks)', () => {
    // Direct-CLI (non-ACP) sessions stream `tool_call`, not `tool_group` —
    // measured live: 31 of 34 frames in a 55s tool stretch were `tool_call`.
    expect(getSidebarStreamGuardDecision({ type: 'tool_call', completed: false })).toEqual({
      markGenerating: true,
      clearCompleted: false,
      lateIgnored: false,
    });
  });

  it('ignores late stream messages after turn completion', () => {
    expect(getSidebarStreamGuardDecision({ type: 'content', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    });
  });

  it('allows a new start event to clear the completion guard', () => {
    expect(getSidebarStreamGuardDecision({ type: 'start', completed: true })).toEqual({
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    });
  });

  it('ignores non-generating messages', () => {
    expect(getSidebarStreamGuardDecision({ type: 'slash_commands_updated', completed: true })).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: false,
    });
  });

  it("does not treat a NEWER turn's frame as late (codex keeps streaming past its own turn)", () => {
    expect(
      getSidebarStreamGuardDecision({
        type: 'content',
        completed: true,
        completedTurnId: 'turn-orphan',
        streamTurnId: 'turn-new',
      })
    ).toEqual({
      markGenerating: true,
      clearCompleted: true,
      lateIgnored: false,
    });
  });

  it('still ignores a frame from the very turn that completed', () => {
    expect(
      getSidebarStreamGuardDecision({
        type: 'content',
        completed: true,
        completedTurnId: 'turn-1',
        streamTurnId: 'turn-1',
      })
    ).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    });
  });

  it('falls back to late-ignore when turn ids are unknown', () => {
    expect(
      getSidebarStreamGuardDecision({ type: 'content', completed: true, completedTurnId: null, streamTurnId: null })
    ).toEqual({
      markGenerating: false,
      clearCompleted: false,
      lateIgnored: true,
    });
  });
});

describe('shouldReconcileMarkGenerating', () => {
  it('marks generating when the runtime summary reports processing', () => {
    expect(shouldReconcileMarkGenerating(true)).toBe(true);
  });

  it('does NOT signal a clear when the runtime summary reports idle', () => {
    // Reconcile never clears — an idle-looking summary must not fight a live
    // background stream. Clearing stays exclusively with terminal frames /
    // turn.completed.
    expect(shouldReconcileMarkGenerating(false)).toBe(false);
  });
});
