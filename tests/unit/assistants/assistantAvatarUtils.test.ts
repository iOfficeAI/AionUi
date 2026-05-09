/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for assistant avatar utilities (A12 stub in N4a).
 * Stub tests for basic avatar resolution logic.
 */

import { describe, it, expect } from 'vitest';
import { resolveAvatarImageSrc } from '@/renderer/pages/settings/AssistantSettings/assistantUtils';

describe('assistantAvatarUtils', () => {
  describe('resolveAvatarImageSrc', () => {
    it('returns mapped src string when id is present in the map', () => {
      const map = { 'test-id': '/path/to/avatar.png' };
      const result = resolveAvatarImageSrc('test-id', map);
      expect(result).toBe('/path/to/avatar.png');
    });

    it('returns undefined when ID not in map', () => {
      const result = resolveAvatarImageSrc('test-id', {});
      expect(result).toBeUndefined();
    });

    it('returns mapped value when assistant ID exists', () => {
      const map = { 'my-id': 'my-avatar.png' };
      const result = resolveAvatarImageSrc('my-id', map);
      expect(result).toBe('my-avatar.png');
    });
  });
});
