/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildCreateSideConversationParams } from '@/common/chat/buildCreateSideConversationParams';
import type { TChatConversation } from '@/common/config/storage';
import { describe, expect, it } from 'vitest';

const model = {
  id: 'm1',
  platform: 'openai',
  name: 'GPT',
  base_url: 'https://example.test',
  api_key: '',
  use_model: 'gpt-4',
};

function conversation(overrides: Partial<TChatConversation>): TChatConversation {
  return {
    id: 'parent-1',
    type: 'acp',
    name: 'Parent',
    created_at: 1,
    modified_at: 2,
    model,
    extra: {},
    ...overrides,
  } as TChatConversation;
}

describe('buildCreateSideConversationParams', () => {
  it('preserves ACP parent runtime settings when creating a side child', () => {
    const params = buildCreateSideConversationParams(
      conversation({
        type: 'acp',
        extra: {
          workspace: '/repo',
          custom_workspace: '/custom',
          backend: 'codex',
          agent_name: 'Codex',
          agent_id: 'agent-1',
          cli_path: '/bin/codex',
          skills: ['testing'],
          session_mode: 'read-write',
          current_model_id: 'gpt-5.5',
        },
      }),
      'msg-9'
    );

    expect(params).toMatchObject({
      type: 'acp',
      name: '↳ Parent',
      model,
      extra: {
        workspace: '/repo',
        custom_workspace: '/custom',
        parent_conversation_id: 'parent-1',
        side_mode: true,
        ephemeral: true,
        side_guardrail: 'reference_readonly',
        forked_at_msg_id: 'msg-9',
        backend: 'codex',
        agent_name: 'Codex',
        agent_id: 'agent-1',
        cli_path: '/bin/codex',
        preset_enabled_skills: ['testing'],
        session_mode: 'read-write',
        current_model_id: 'gpt-5.5',
      },
    });
  });

  it('preserves aionrs skills and session mode', () => {
    const params = buildCreateSideConversationParams(
      conversation({
        type: 'aionrs',
        extra: {
          workspace: '/repo',
          skills: ['review'],
          session_mode: 'read-only',
        },
      })
    );

    expect(params).toMatchObject({
      type: 'aionrs',
      extra: {
        preset_enabled_skills: ['review'],
        session_mode: 'read-only',
      },
    });
  });

  it('returns null for unsupported and legacy parent types instead of creating an invalid child', () => {
    for (const type of ['codex', 'gemini', 'openclaw-gateway', 'nanobot', 'remote', 'unknown'] as const) {
      expect(buildCreateSideConversationParams(conversation({ type: type as TChatConversation['type'] }))).toBeNull();
    }
  });
});
