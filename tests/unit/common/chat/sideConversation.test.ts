/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  acpBackendUsesAgentFork,
  isEphemeralSideConversation,
  isSideConversationSupported,
} from '@/common/chat/sideConversation';

describe('isSideConversationSupported', () => {
  it('allows modern acp and aionrs side panels', () => {
    expect(isSideConversationSupported({ type: 'acp', backend: 'claude' })).toBe(true);
    expect(isSideConversationSupported({ type: 'acp', backend: 'codex' })).toBe(true);
    expect(isSideConversationSupported({ type: 'aionrs' })).toBe(true);
  });

  it('disallows legacy top-level runtime rows', () => {
    expect(isSideConversationSupported({ type: 'codex', backend: 'codex' })).toBe(false);
    expect(isSideConversationSupported({ type: 'openclaw-gateway' })).toBe(false);
    expect(isSideConversationSupported({ type: 'nanobot' })).toBe(false);
    expect(isSideConversationSupported({ type: 'remote' })).toBe(false);
    expect(isSideConversationSupported({ type: 'gemini' })).toBe(false);
  });
});

describe('acpBackendUsesAgentFork', () => {
  it('only lists spec fork backends', () => {
    expect(acpBackendUsesAgentFork('claude')).toBe(true);
    expect(acpBackendUsesAgentFork('opencode')).toBe(true);
    expect(acpBackendUsesAgentFork('vibe')).toBe(true);
    expect(acpBackendUsesAgentFork('codex')).toBe(false);
    expect(acpBackendUsesAgentFork('gemini')).toBe(false);
  });

  it('treats missing backend as snapshot-only', () => {
    expect(acpBackendUsesAgentFork(undefined)).toBe(false);
  });
});

describe('isEphemeralSideConversation', () => {
  it('hides side children only when both side_mode and ephemeral are set', () => {
    expect(isEphemeralSideConversation({ extra: { side_mode: true, ephemeral: true } })).toBe(true);
    expect(isEphemeralSideConversation({ extra: { side_mode: true, ephemeral: false } })).toBe(false);
    expect(isEphemeralSideConversation({ extra: { ephemeral: true } })).toBe(false);
    expect(isEphemeralSideConversation({ extra: undefined })).toBe(false);
  });
});
