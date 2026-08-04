/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isForkEnabled } from '@/common/chat/forkConversation';

describe('isForkEnabled', () => {
  it('is disabled without a declared capability', () => {
    expect(isForkEnabled(undefined, true)).toBe(false);
    expect(isForkEnabled(undefined, false)).toBe(false);
  });

  it('at_turn backends (codex) fork from any message', () => {
    expect(isForkEnabled({ at_turn: true }, false)).toBe(true);
    expect(isForkEnabled({ at_turn: true }, true)).toBe(true);
  });

  it('head-only backends (claude/ACP) fork only from the last message', () => {
    expect(isForkEnabled({ at_turn: false }, true)).toBe(true);
    expect(isForkEnabled({ at_turn: false }, false)).toBe(false);
  });
});
