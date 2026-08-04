/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isForkEnabled } from '@/common/chat/forkConversation';

describe('isForkEnabled', () => {
  it('is disabled without a declared capability', () => {
    expect(isForkEnabled(undefined, { isLastMessage: true, hasTurnAnchor: true })).toBe(false);
    expect(isForkEnabled(undefined, { isLastMessage: false, hasTurnAnchor: false })).toBe(false);
  });

  it('the last message is always forkable (HEAD fork needs no anchor)', () => {
    expect(isForkEnabled({ at_turn: true }, { isLastMessage: true, hasTurnAnchor: false })).toBe(true);
    expect(isForkEnabled({ at_turn: false }, { isLastMessage: true, hasTurnAnchor: false })).toBe(true);
  });

  it('at_turn backends (codex) fork mid-history only where a turn anchor resolves', () => {
    expect(isForkEnabled({ at_turn: true }, { isLastMessage: false, hasTurnAnchor: true })).toBe(true);
    // Legacy/copied rows before the first anchor: hidden instead of a 422 on click.
    expect(isForkEnabled({ at_turn: true }, { isLastMessage: false, hasTurnAnchor: false })).toBe(false);
  });

  it('head-only backends (claude/ACP) never fork mid-history, anchored or not', () => {
    expect(isForkEnabled({ at_turn: false }, { isLastMessage: false, hasTurnAnchor: true })).toBe(false);
    expect(isForkEnabled({ at_turn: false }, { isLastMessage: false, hasTurnAnchor: false })).toBe(false);
  });
});
