/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { applyDefaultConversationName } from '../../src/renderer/pages/conversation/utils/newConversationName';

describe('applyDefaultConversationName', () => {
  it('overrides an existing name with the localized default title', () => {
    const params = applyDefaultConversationName(
      {
        type: 'acp' as const,
        name: 'Claude Code',
        extra: { workspace: '/tmp/workspace', customWorkspace: true },
      },
      '新会话'
    );

    expect(params.name).toBe('新会话');
  });

  it('fills the default title when name is missing', () => {
    const params = applyDefaultConversationName(
      {
        type: 'gemini' as const,
        extra: { workspace: '/tmp/workspace', customWorkspace: true },
      },
      'New Chat'
    );

    expect(params.name).toBe('New Chat');
  });
});
