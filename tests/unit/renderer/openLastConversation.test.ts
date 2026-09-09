/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  extractConversationIdFromPath,
  resolveLaunchConversationRoute,
} from '../../../packages/desktop/src/renderer/utils/openLastConversation';

describe('resolveLaunchConversationRoute', () => {
  it('returns fallback when the setting is off', () => {
    expect(
      resolveLaunchConversationRoute({
        openLastConversation: false,
        lastConversationId: 'conv-1',
        conversationExists: true,
      })
    ).toBe('/guid');
  });

  it('returns fallback when the stored id is missing', () => {
    expect(
      resolveLaunchConversationRoute({
        openLastConversation: true,
        lastConversationId: null,
        conversationExists: true,
      })
    ).toBe('/guid');
  });

  it('returns fallback when the conversation no longer exists', () => {
    expect(
      resolveLaunchConversationRoute({
        openLastConversation: true,
        lastConversationId: 'conv-1',
        conversationExists: false,
      })
    ).toBe('/guid');
  });

  it('returns the conversation route when all conditions pass', () => {
    expect(
      resolveLaunchConversationRoute({
        openLastConversation: true,
        lastConversationId: 'conv-42',
        conversationExists: true,
      })
    ).toBe('/conversation/conv-42');
  });

  it('trims whitespace from the stored id', () => {
    expect(
      resolveLaunchConversationRoute({
        openLastConversation: true,
        lastConversationId: '  conv-9  ',
        conversationExists: true,
      })
    ).toBe('/conversation/conv-9');
  });
});

describe('extractConversationIdFromPath', () => {
  it('extracts id from conversation paths', () => {
    expect(extractConversationIdFromPath('/conversation/abc123')).toBe('abc123');
  });

  it('returns null for non-conversation paths', () => {
    expect(extractConversationIdFromPath('/guid')).toBeNull();
    expect(extractConversationIdFromPath('/settings/system')).toBeNull();
    expect(extractConversationIdFromPath('/team/t1')).toBeNull();
  });
});
