/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TChatConversation } from '@/common/config/storage';
import type { PresetAssistantInfo } from '@/renderer/hooks/agent/usePresetAssistantInfo';
import { resolveConversationLeadingMark } from '@/renderer/pages/conversation/utils/conversationAssistantIdentity';
import { describe, expect, it } from 'vitest';

const TEST_LOGOS = {
  claude: '/api/assets/logos/claude.svg',
  gemini: '/api/assets/logos/gemini.svg',
};

describe('resolveConversationLeadingMark', () => {
  it('prefers the assistant image avatar when assistant info exists', () => {
    const result = resolveConversationLeadingMark(
      makeConversation(),
      {
        name: 'Academic Paper',
        logo: '/api/assistants/academic-paper/avatar',
        isEmoji: false,
        backend: 'claude',
        assistantId: 'academic-paper',
      },
      TEST_LOGOS
    );

    expect(result).toEqual({
      kind: 'image',
      value: '/api/assistants/academic-paper/avatar',
      label: 'Academic Paper',
    });
  });

  it('prefers the assistant emoji avatar when assistant info exists', () => {
    const result = resolveConversationLeadingMark(
      makeConversation(),
      {
        name: 'Academic Paper',
        logo: '📚',
        isEmoji: true,
        backend: 'claude',
        assistantId: 'academic-paper',
      },
      TEST_LOGOS
    );

    expect(result).toEqual({
      kind: 'emoji',
      value: '📚',
      label: 'Academic Paper',
    });
  });

  it('falls back to the backend logo when there is no assistant info', () => {
    const result = resolveConversationLeadingMark(
      makeConversation({
        type: 'acp',
        extra: { backend: 'gemini' },
      }),
      undefined,
      TEST_LOGOS
    );

    expect(result).toEqual({
      kind: 'image',
      value: '/api/assets/logos/gemini.svg',
      label: 'gemini',
    });
  });

  it('returns the generic fallback when neither assistant info nor backend logo exists', () => {
    const result = resolveConversationLeadingMark(
      makeConversation({
        type: 'acp',
        extra: { backend: 'unknown-agent' },
      }),
      undefined,
      TEST_LOGOS
    );

    expect(result).toEqual({
      kind: 'fallback',
      label: 'unknown-agent',
    });
  });
});

function makeConversation(
  overrides: Partial<TChatConversation> = {},
  extraOverrides: Record<string, unknown> = {}
): TChatConversation {
  return {
    id: 'conversation-1',
    name: 'Conversation 1',
    type: 'acp',
    assistant: undefined,
    created_at: Date.now(),
    updated_at: Date.now(),
    source: 'chat',
    index: 0,
    is_favorite: false,
    extra: {
      backend: 'claude',
      ...extraOverrides,
      ...overrides.extra,
    },
    ...overrides,
  } as TChatConversation;
}
