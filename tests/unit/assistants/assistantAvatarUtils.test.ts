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
    it('returns an image path as-is', () => {
      expect(resolveAvatarImageSrc('/path/to/avatar.png')).toBe('/path/to/avatar.png');
    });

    it('returns undefined for a non-image identifier', () => {
      expect(resolveAvatarImageSrc('test-id')).toBeUndefined();
    });

    it('returns undefined for empty input', () => {
      expect(resolveAvatarImageSrc('')).toBeUndefined();
      expect(resolveAvatarImageSrc(undefined)).toBeUndefined();
    });
  });
});
