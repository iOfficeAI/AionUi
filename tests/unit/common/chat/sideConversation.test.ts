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
  resolveSideConversationMode,
} from '@/common/chat/sideConversation';
import type { TChatConversation } from '@/common/config/storage';

describe('resolveSideConversationMode', () => {
  it('prefers a real fork whenever the backend reports fork capability', () => {
    expect(resolveSideConversationMode({ type: 'acp', fork_capability: { at_turn: false } })).toBe('fork');
    expect(resolveSideConversationMode({ type: 'acp', fork_capability: { at_turn: true } })).toBe('fork');
    // Aion CLI fork support — the capability bit decides, not the type.
    expect(resolveSideConversationMode({ type: 'aionrs', fork_capability: { at_turn: true } })).toBe('fork');
  });

  it('falls back to snapshot mode for chatty types without fork capability', () => {
    // Fork-incapable ACP agents (hermes, pi, custom agents…) still get side
    // threads via the clone + transcript reference path.
    expect(resolveSideConversationMode({ type: 'acp' })).toBe('snapshot');
    expect(resolveSideConversationMode({ type: 'antigravity' })).toBe('snapshot');
    expect(resolveSideConversationMode({ type: 'aionrs' })).toBe('snapshot');
  });

  it('returns null for types that can neither fork nor send', () => {
    expect(resolveSideConversationMode({ type: 'gemini' })).toBeNull();
    expect(resolveSideConversationMode({ type: 'codex' })).toBeNull();
    expect(resolveSideConversationMode({ type: 'openclaw-gateway' })).toBeNull();
    expect(resolveSideConversationMode({ type: 'nanobot' })).toBeNull();
    expect(resolveSideConversationMode({ type: 'remote' })).toBeNull();
  });
});

describe('isSideConversationSupported', () => {
  it('mirrors the mode resolution', () => {
    expect(isSideConversationSupported({ type: 'acp', fork_capability: { at_turn: true } })).toBe(true);
    expect(isSideConversationSupported({ type: 'acp' })).toBe(true);
    expect(isSideConversationSupported({ type: 'aionrs' })).toBe(true);
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
