/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { normalizeNewApiBaseUrl } from '@/common/api/ClientFactory';
import { AuthType } from '@office-ai/aioncli-core';

describe('normalizeNewApiBaseUrl', () => {
  describe('standard /v1 URLs', () => {
    it('should preserve /v1 path for USE_OPENAI', () => {
      const result = normalizeNewApiBaseUrl('https://api.openai.com/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.openai.com/v1');
    });

    it('should add /v1 for URLs without version path', () => {
      const result = normalizeNewApiBaseUrl('https://api.deepseek.com', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.deepseek.com/v1');
    });

    it('should strip /v1 and re-add for USE_OPENAI (idempotent)', () => {
      const result = normalizeNewApiBaseUrl('https://api.openai.com/v1/', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.openai.com/v1');
    });
  });

  describe('non-/v1 version paths', () => {
    it('should preserve /v2 path (百度千帆)', () => {
      const result = normalizeNewApiBaseUrl('https://qianfan.baidubce.com/v2', AuthType.USE_OPENAI);
      expect(result).toBe('https://qianfan.baidubce.com/v2');
    });

    it('should preserve /v3 path (腾讯云 Coding)', () => {
      const result = normalizeNewApiBaseUrl('https://api.lkeap.cloud.tencent.com/coding/v3', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.lkeap.cloud.tencent.com/coding/v3');
    });

    it('should preserve /api/v3 path (火山引擎 Ark)', () => {
      const result = normalizeNewApiBaseUrl('https://ark.cn-beijing.volces.com/api/v3', AuthType.USE_OPENAI);
      expect(result).toBe('https://ark.cn-beijing.volces.com/api/v3');
    });

    it('should preserve /api/paas/v4 path (智谱)', () => {
      const result = normalizeNewApiBaseUrl('https://open.bigmodel.cn/api/paas/v4', AuthType.USE_OPENAI);
      expect(result).toBe('https://open.bigmodel.cn/api/paas/v4');
    });

    it('should preserve /compatible-mode/v1 (阿里云 DashScope)', () => {
      const result = normalizeNewApiBaseUrl('https://dashscope.aliyuncs.com/compatible-mode/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
    });

    it('should preserve /api/v1 path (OpenRouter)', () => {
      const result = normalizeNewApiBaseUrl('https://openrouter.ai/api/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://openrouter.ai/api/v1');
    });

    it('should preserve /openai/v1 path (Groq)', () => {
      const result = normalizeNewApiBaseUrl('https://api.groq.com/openai/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.groq.com/openai/v1');
    });

    it('should preserve /compatibility/v1 path (Cohere)', () => {
      const result = normalizeNewApiBaseUrl('https://api.cohere.ai/compatibility/v1', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.cohere.ai/compatibility/v1');
    });
  });

  describe('Gemini protocol', () => {
    it('should strip /v1beta for USE_GEMINI', () => {
      const result = normalizeNewApiBaseUrl('https://generativelanguage.googleapis.com/v1beta', AuthType.USE_GEMINI);
      expect(result).toBe('https://generativelanguage.googleapis.com');
    });

    it('should return root URL for Gemini without version path', () => {
      const result = normalizeNewApiBaseUrl('https://generativelanguage.googleapis.com', AuthType.USE_GEMINI);
      expect(result).toBe('https://generativelanguage.googleapis.com');
    });
  });

  describe('Anthropic protocol', () => {
    it('should return root URL for Anthropic', () => {
      const result = normalizeNewApiBaseUrl('https://api.anthropic.com/v1', AuthType.USE_ANTHROPIC);
      expect(result).toBe('https://api.anthropic.com');
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = normalizeNewApiBaseUrl('', AuthType.USE_OPENAI);
      expect(result).toBe('');
    });

    it('should handle trailing slashes', () => {
      const result = normalizeNewApiBaseUrl('https://api.openai.com/v1/', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.openai.com/v1');
    });

    it('should handle multiple trailing slashes', () => {
      const result = normalizeNewApiBaseUrl('https://api.openai.com///', AuthType.USE_OPENAI);
      expect(result).toBe('https://api.openai.com/v1');
    });
  });
});
