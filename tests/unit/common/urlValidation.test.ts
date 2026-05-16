/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isOfficialHost,
  isGoogleApisHost,
  isOpenAIHost,
  isAnthropicHost,
  API_HOST_CONFIG,
  GOOGLE_API_HOSTS,
} from '@/common/utils/urlValidation';

describe('urlValidation', () => {
  describe('isOfficialHost', () => {
    const allowedHosts = ['api.example.com', 'api.test.com'];

    it('returns true for allowed host', () => {
      expect(isOfficialHost('https://api.example.com/v1', allowedHosts)).toBe(true);
      expect(isOfficialHost('https://api.test.com/resource', allowedHosts)).toBe(true);
    });

    it('returns false for host not in allowed list', () => {
      expect(isOfficialHost('https://evil.com/v1', allowedHosts)).toBe(false);
      expect(isOfficialHost('https://api.other.com/v1', allowedHosts)).toBe(false);
    });

    it('returns false for subdomain attack', () => {
      expect(isOfficialHost('https://api.example.com.evil.com/v1', allowedHosts)).toBe(false);
    });

    it('returns false for path-based attack', () => {
      expect(isOfficialHost('https://evil.com/api.example.com', allowedHosts)).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isOfficialHost('not a url', allowedHosts)).toBe(false);
      expect(isOfficialHost('', allowedHosts)).toBe(false);
    });

    it('handles URL with port', () => {
      expect(isOfficialHost('https://api.example.com:8080/v1', allowedHosts)).toBe(true);
    });

    it('handles URL with query parameters', () => {
      expect(isOfficialHost('https://api.example.com/v1?key=value', allowedHosts)).toBe(true);
    });

    it('handles URL with fragments', () => {
      expect(isOfficialHost('https://api.example.com/v1#section', allowedHosts)).toBe(true);
    });
  });

  describe('isGoogleApisHost', () => {
    it('returns true for Gemini API host', () => {
      expect(isGoogleApisHost('https://generativelanguage.googleapis.com/v1')).toBe(true);
      expect(isGoogleApisHost('https://generativelanguage.googleapis.com/v1/models')).toBe(true);
    });

    it('returns true for Vertex AI host', () => {
      expect(isGoogleApisHost('https://aiplatform.googleapis.com/v1')).toBe(true);
    });

    it('returns false for non-Google host', () => {
      expect(isGoogleApisHost('https://api.openai.com/v1')).toBe(false);
      expect(isGoogleApisHost('https://evil.com')).toBe(false);
    });

    it('returns false for subdomain attack on Google host', () => {
      expect(isGoogleApisHost('https://generativelanguage.googleapis.com.evil.com/v1')).toBe(false);
    });

    it('returns false for path-based attack', () => {
      expect(isGoogleApisHost('https://evil.com/generativelanguage.googleapis.com')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isGoogleApisHost('invalid')).toBe(false);
    });
  });

  describe('isOpenAIHost', () => {
    it('returns true for OpenAI API host', () => {
      expect(isOpenAIHost('https://api.openai.com/v1')).toBe(true);
      expect(isOpenAIHost('https://api.openai.com/v1/chat/completions')).toBe(true);
    });

    it('returns false for non-OpenAI host', () => {
      expect(isOpenAIHost('https://generativelanguage.googleapis.com/v1')).toBe(false);
      expect(isOpenAIHost('https://evil.com')).toBe(false);
    });

    it('returns false for subdomain attack', () => {
      expect(isOpenAIHost('https://api.openai.com.evil.com/v1')).toBe(false);
    });

    it('returns false for path-based attack', () => {
      expect(isOpenAIHost('https://evil.com/api.openai.com')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isOpenAIHost('not a url')).toBe(false);
    });
  });

  describe('isAnthropicHost', () => {
    it('returns true for Anthropic API host', () => {
      expect(isAnthropicHost('https://api.anthropic.com/v1')).toBe(true);
      expect(isAnthropicHost('https://api.anthropic.com/v1/messages')).toBe(true);
    });

    it('returns false for non-Anthropic host', () => {
      expect(isAnthropicHost('https://api.openai.com/v1')).toBe(false);
      expect(isAnthropicHost('https://evil.com')).toBe(false);
    });

    it('returns false for subdomain attack', () => {
      expect(isAnthropicHost('https://api.anthropic.com.evil.com/v1')).toBe(false);
    });

    it('returns false for path-based attack', () => {
      expect(isAnthropicHost('https://evil.com/api.anthropic.com')).toBe(false);
    });

    it('returns false for invalid URL', () => {
      expect(isAnthropicHost('invalid')).toBe(false);
    });
  });

  describe('API_HOST_CONFIG', () => {
    it('exports expected Google hosts', () => {
      expect(API_HOST_CONFIG.google.gemini).toBe('generativelanguage.googleapis.com');
      expect(API_HOST_CONFIG.google.vertexAi).toBe('aiplatform.googleapis.com');
    });

    it('exports expected OpenAI host', () => {
      expect(API_HOST_CONFIG.openai.api).toBe('api.openai.com');
    });

    it('exports expected Anthropic host', () => {
      expect(API_HOST_CONFIG.anthropic.api).toBe('api.anthropic.com');
    });
  });

  describe('GOOGLE_API_HOSTS', () => {
    it('contains all Google API hosts', () => {
      expect(GOOGLE_API_HOSTS).toContain('generativelanguage.googleapis.com');
      expect(GOOGLE_API_HOSTS).toContain('aiplatform.googleapis.com');
      expect(GOOGLE_API_HOSTS).toHaveLength(2);
    });
  });
});
