/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { OpenAI2AnthropicConverter } from '@/common/api/OpenAI2AnthropicConverter';

const baseParams = {
  model: 'claude-sonnet-4-20250514',
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('OpenAI2AnthropicConverter', () => {
  const converter = new OpenAI2AnthropicConverter();

  describe('temperature and top_p mutual exclusion', () => {
    it('should send only temperature when both temperature and top_p are provided', () => {
      const result = converter.convertRequest({
        ...baseParams,
        temperature: 0.7,
        top_p: 0.9,
      });

      expect(result.temperature).toBe(0.7);
      expect(result).not.toHaveProperty('top_p');
    });

    it('should send temperature when only temperature is provided', () => {
      const result = converter.convertRequest({
        ...baseParams,
        temperature: 0.5,
      });

      expect(result.temperature).toBe(0.5);
      expect(result).not.toHaveProperty('top_p');
    });

    it('should send top_p when only top_p is provided', () => {
      const result = converter.convertRequest({
        ...baseParams,
        top_p: 0.8,
      });

      expect(result.top_p).toBe(0.8);
      expect(result).not.toHaveProperty('temperature');
    });

    it('should send neither when both are undefined', () => {
      const result = converter.convertRequest({ ...baseParams });

      expect(result).not.toHaveProperty('temperature');
      expect(result).not.toHaveProperty('top_p');
    });
  });
});
