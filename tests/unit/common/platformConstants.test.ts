/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isNewApiPlatform, NEW_API_PLATFORM_ID } from '@/common/utils/platformConstants';

describe('platformConstants', () => {
  describe('NEW_API_PLATFORM_ID', () => {
    it('is defined as "new-api"', () => {
      expect(NEW_API_PLATFORM_ID).toBe('new-api');
    });
  });

  describe('isNewApiPlatform', () => {
    it('returns true for new-api platform', () => {
      expect(isNewApiPlatform('new-api')).toBe(true);
      expect(isNewApiPlatform(NEW_API_PLATFORM_ID)).toBe(true);
    });

    it('returns false for other platforms', () => {
      expect(isNewApiPlatform('openai')).toBe(false);
      expect(isNewApiPlatform('anthropic')).toBe(false);
      expect(isNewApiPlatform('bedrock')).toBe(false);
      expect(isNewApiPlatform('custom')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isNewApiPlatform('')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isNewApiPlatform(null as any)).toBe(false);
      expect(isNewApiPlatform(undefined as any)).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(isNewApiPlatform('NEW-API')).toBe(false);
      expect(isNewApiPlatform('New-Api')).toBe(false);
    });
  });
});
