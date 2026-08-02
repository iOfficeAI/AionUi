/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for assistant avatar utilities (A12 stub in N4a).
 * Stub tests for basic avatar resolution logic.
 */

import { describe, it, expect } from 'vitest';
import workMateLogo from '@/renderer/assets/logos/brand/app.png';
import {
  resolveAssistantAvatarImageSrc,
  resolveAvatarImageSrc,
} from '@/renderer/pages/settings/AssistantSettings/assistantUtils';
import type { AssistantListItem } from '@/renderer/pages/settings/AssistantSettings/types';

const makeAssistant = (overrides: Partial<AssistantListItem>): AssistantListItem =>
  ({
    id: 'assistant-1',
    source: 'user',
    avatar: '/api/assistants/assistant-1/avatar',
    agent: { type: 'aionrs', source: 'internal' },
    ...overrides,
  }) as AssistantListItem;

describe('assistantAvatarUtils', () => {
  describe('resolveAvatarImageSrc', () => {
    it('returns backend image paths as-is', () => {
      expect(resolveAvatarImageSrc('/api/assistants/custom-1/avatar')).toBe('/api/assistants/custom-1/avatar');
      expect(resolveAvatarImageSrc('/assets/avatar.png')).toBe('/assets/avatar.png');
    });

    it('does not expose arbitrary absolute image paths', () => {
      expect(resolveAvatarImageSrc('/path/to/avatar.png')).toBeUndefined();
    });

    it('returns undefined for a non-image identifier', () => {
      expect(resolveAvatarImageSrc('test-id')).toBeUndefined();
    });

    it('returns undefined for empty input', () => {
      expect(resolveAvatarImageSrc('')).toBeUndefined();
      expect(resolveAvatarImageSrc(undefined)).toBeUndefined();
    });
  });

  describe('resolveAssistantAvatarImageSrc', () => {
    it('uses the current brand icon for the generated CSBU WorkMate assistant', () => {
      expect(resolveAssistantAvatarImageSrc(makeAssistant({ source: 'generated' }))).toBe(workMateLogo);
    });

    it('uses the current brand icon for the built-in CSBU WorkMate butler', () => {
      expect(resolveAssistantAvatarImageSrc(makeAssistant({ id: 'aionui-assistant', source: 'builtin' }))).toBe(
        workMateLogo
      );
    });

    it('preserves a user-selected avatar for custom assistants on the same runtime', () => {
      expect(resolveAssistantAvatarImageSrc(makeAssistant({ source: 'user' }))).toBe(
        '/api/assistants/assistant-1/avatar'
      );
    });
  });
});
