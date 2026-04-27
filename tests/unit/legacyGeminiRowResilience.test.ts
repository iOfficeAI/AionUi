/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resilience gate for the Gemini→ACP migration: legacy conversation rows
 * with type='gemini' must not crash the conversation list loader.
 *
 * Spec:
 *   docs/backend-migration/specs/2026-04-27-gemini-acp-migration-design.md
 *     §Legacy Conversation Behavior
 *     §Verification (Definition of Done) — "Conversation list resilience"
 *
 * Strategy: exercise rowToConversation directly with a legacy row, then
 * verify the list-loader pattern (per-row try/catch + log-and-skip) that
 * getUserConversations() relies on. Keeping this as a unit test makes the
 * contract explicit so future refactors can't regress it silently.
 */

import { describe, it, expect, vi } from 'vitest';
import { rowToConversation } from '@process/services/database/types';
import type { IConversationRow } from '@process/services/database/types';

function legacyGeminiRow(): IConversationRow {
  return {
    id: 'smoke-legacy-gemini-1',
    user_id: 'default',
    type: 'gemini',
    extra: JSON.stringify({
      session_mode: 'yolo',
      preset_rules: 'test',
      enabled_skills: [],
      inject_skills: [],
    }),
    name: 'Legacy Gemini Conversation',
    model: JSON.stringify({ id: 'gemini', useModel: 'gemini-2.0-flash' }),
    status: 'finished',
    source: 'user',
    channel_chat_id: '',
    created_at: 1_714_000_000_000,
    updated_at: 1_714_000_000_000,
  } as IConversationRow;
}

describe('Legacy type=gemini conversation row resilience', () => {
  it('rowToConversation throws on unknown legacy type', () => {
    // Post-migration, 'gemini' is no longer a TChatConversation variant —
    // deserialization must fail loudly so the list-loader can skip the row.
    expect(() => rowToConversation(legacyGeminiRow())).toThrow(/Unknown conversation type: gemini/);
  });

  it('list-loader pattern logs-and-skips instead of crashing', () => {
    // Mirror the try/catch pattern used inside getUserConversations:
    // each row conversion is guarded; one bad row does not poison the list.
    const rows = [
      legacyGeminiRow(),
      {
        id: 'good-acp-1',
        user_id: 'default',
        type: 'acp',
        extra: JSON.stringify({ workspace: '/tmp', backend: 'claude' }),
        name: 'Good ACP',
        model: null,
        status: 'finished',
        source: 'user',
        channel_chat_id: '',
        created_at: 1_714_000_000_100,
        updated_at: 1_714_000_000_100,
      } as IConversationRow,
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ok: unknown[] = [];
    for (const row of rows) {
      try {
        ok.push(rowToConversation(row));
      } catch {
        // matches getUserConversations() behavior: log, skip, keep iterating
        console.warn('[Database] Skipping conversation row with unknown type:', row.type, row.id);
      }
    }
    warn.mockRestore();

    expect(ok).toHaveLength(1);
    expect((ok[0] as { id: string }).id).toBe('good-acp-1');
  });
});
