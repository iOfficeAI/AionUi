/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  isEphemeralSideConversation,
  isSideChildOf,
  isSideConversationSupported,
} from '@/common/chat/sideConversation';
import type { TChatConversation } from '@/common/config/storage';

describe('isSideConversationSupported', () => {
  it('is capability-driven: any conversation reporting fork support qualifies', () => {
    expect(isSideConversationSupported({ type: 'acp', fork_capability: { at_turn: false } })).toBe(true);
    expect(isSideConversationSupported({ type: 'acp', fork_capability: { at_turn: true } })).toBe(true);
    // Aion CLI fork support — the capability bit is what matters, not the type.
    expect(isSideConversationSupported({ type: 'aionrs', fork_capability: { at_turn: true } })).toBe(true);
  });

  it('rejects conversations without a reported fork capability', () => {
    expect(isSideConversationSupported({ type: 'acp' })).toBe(false);
    expect(isSideConversationSupported({ type: 'aionrs' })).toBe(false);
    // Legacy read-only / gateway types never report the capability.
    expect(isSideConversationSupported({ type: 'codex' })).toBe(false);
    expect(isSideConversationSupported({ type: 'gemini' })).toBe(false);
    expect(isSideConversationSupported({ type: 'openclaw-gateway' })).toBe(false);
  });
});

describe('isEphemeralSideConversation', () => {
  it('only hides conversations marked as both side mode and ephemeral', () => {
    const conv = (extra: Record<string, unknown>) => ({ extra }) as Pick<TChatConversation, 'extra'>;
    expect(isEphemeralSideConversation(conv({ side_mode: true, ephemeral: true }))).toBe(true);
    expect(isEphemeralSideConversation(conv({ side_mode: true, ephemeral: false }))).toBe(false);
    expect(isEphemeralSideConversation(conv({ side_mode: true }))).toBe(false);
    expect(isEphemeralSideConversation(conv({}))).toBe(false);
  });
});

describe('isSideChildOf', () => {
  it('matches side children of the given parent only', () => {
    const conv = (extra: Record<string, unknown>) => ({ extra }) as Pick<TChatConversation, 'extra'>;
    expect(isSideChildOf(conv({ side_mode: true, parent_conversation_id: 'p1' }), 'p1')).toBe(true);
    expect(isSideChildOf(conv({ side_mode: true, parent_conversation_id: 'p2' }), 'p1')).toBe(false);
    // A user-visible fork (fork lineage, no side markers) is not a side child.
    expect(isSideChildOf(conv({ fork: { parent_conversation_id: 'p1' } }), 'p1')).toBe(false);
  });
});
