/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { isSlashCommandListEnabled } from '@/common/chat/slash/availability';

describe('isSlashCommandListEnabled', () => {
  it('enables ACP', () => {
    expect(isSlashCommandListEnabled({ conversation_type: 'acp' })).toBe(true);
  });

  it('enables aionrs', () => {
    expect(isSlashCommandListEnabled({ conversation_type: 'aionrs' })).toBe(true);
  });

  it('enables native OpenCode', () => {
    // OpenCode is not a top-level type — RemoteSendBox passes the synthetic
    // 'opencode' discriminant only for protocol === 'opencode'.
    expect(isSlashCommandListEnabled({ conversation_type: 'opencode' })).toBe(true);
  });

  it('disables non-opencode remote flavors', () => {
    // The backend's get_slash_commands returns Vec::new() for these, so
    // fetching is wasteful and the gate must reject them.
    expect(isSlashCommandListEnabled({ conversation_type: 'remote' })).toBe(false);
    expect(isSlashCommandListEnabled({ conversation_type: 'openclaw-gateway' })).toBe(false);
    expect(isSlashCommandListEnabled({ conversation_type: 'nanobot' })).toBe(false);
  });

  it('codex requires session_active', () => {
    expect(isSlashCommandListEnabled({ conversation_type: 'codex', codexStatus: 'session_active' })).toBe(true);
    expect(isSlashCommandListEnabled({ conversation_type: 'codex', codexStatus: 'connecting' })).toBe(false);
    expect(isSlashCommandListEnabled({ conversation_type: 'codex' })).toBe(false);
  });

  it('rejects empty / unknown input', () => {
    expect(isSlashCommandListEnabled({})).toBe(false);
    expect(isSlashCommandListEnabled({ conversation_type: 'gemini' })).toBe(false);
  });
});
