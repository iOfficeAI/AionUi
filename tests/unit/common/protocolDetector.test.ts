/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseApiKeys,
  maskApiKey,
  normalizeBaseUrl,
  removeApiPathSuffix,
  guessProtocolFromUrl,
  guessProtocolFromKey,
  identifyProviderFromKey,
  getProtocolDisplayName,
  getRecommendedPlatform,
} from '@/common/utils/protocolDetector';

describe('protocolDetector', () => {
  describe('parseApiKeys', () => {
    it('parses comma-separated keys', () => {
      expect(parseApiKeys('key1,key2,key3')).toEqual(['key1', 'key2', 'key3']);
    });

    it('parses newline-separated keys', () => {
      expect(parseApiKeys('key1\nkey2\nkey3')).toEqual(['key1', 'key2', 'key3']);
    });

    it('parses mixed separators', () => {
      expect(parseApiKeys('key1,key2\nkey3')).toEqual(['key1', 'key2', 'key3']);
    });

    it('trims whitespace from keys', () => {
      expect(parseApiKeys('  key1  , key2  \n  key3  ')).toEqual(['key1', 'key2', 'key3']);
    });

    it('filters empty strings', () => {
      expect(parseApiKeys('key1,,key2,,')).toEqual(['key1', 'key2']);
      expect(parseApiKeys('key1\n\nkey2')).toEqual(['key1', 'key2']);
    });

    it('returns empty array for empty input', () => {
      expect(parseApiKeys('')).toEqual([]);
      expect(parseApiKeys(null as any)).toEqual([]);
      expect(parseApiKeys(undefined as any)).toEqual([]);
    });

    it('handles single key', () => {
      expect(parseApiKeys('single-key')).toEqual(['single-key']);
    });
  });

  describe('maskApiKey', () => {
    it('masks long API keys showing first and last 4 characters', () => {
      expect(maskApiKey('sk-abc123def456ghi789')).toBe('sk-a...i789');
      const geminiKey = 'AIza' + 'a'.repeat(35);
      expect(maskApiKey(geminiKey)).toBe('AIza...aaaa');
    });

    it('returns *** for short keys (8 chars or less)', () => {
      expect(maskApiKey('short')).toBe('***');
      expect(maskApiKey('12345678')).toBe('***');
    });

    it('handles exact 9 character key', () => {
      expect(maskApiKey('123456789')).toBe('1234...6789');
    });

    it('handles empty string', () => {
      expect(maskApiKey('')).toBe('***');
    });
  });

  describe('normalizeBaseUrl', () => {
    it('removes trailing slashes', () => {
      expect(normalizeBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
      expect(normalizeBaseUrl('https://api.example.com///')).toBe('https://api.example.com');
    });

    it('trims whitespace', () => {
      expect(normalizeBaseUrl('  https://api.example.com  ')).toBe('https://api.example.com');
    });

    it('preserves path', () => {
      expect(normalizeBaseUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1');
      expect(normalizeBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
    });

    it('returns empty string for empty input', () => {
      expect(normalizeBaseUrl('')).toBe('');
      expect(normalizeBaseUrl(null as any)).toBe('');
      expect(normalizeBaseUrl(undefined as any)).toBe('');
    });
  });

  describe('removeApiPathSuffix', () => {
    it('removes OpenAI path suffixes', () => {
      expect(removeApiPathSuffix('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com');
      expect(removeApiPathSuffix('https://api.example.com/v1/models')).toBe('https://api.example.com');
    });

    it('removes Gemini path suffixes', () => {
      expect(removeApiPathSuffix('https://generativelanguage.googleapis.com/v1beta/models')).toBe(
        'https://generativelanguage.googleapis.com'
      );
    });

    it('removes Anthropic path suffixes', () => {
      expect(removeApiPathSuffix('https://api.anthropic.com/v1/messages')).toBe('https://api.anthropic.com');
    });

    it('matches longest suffix first', () => {
      expect(removeApiPathSuffix('https://api.example.com/v1/chat/completions')).toBe('https://api.example.com');
    });

    it('returns null when no suffix matches', () => {
      expect(removeApiPathSuffix('https://api.example.com/custom/endpoint')).toBeNull();
      expect(removeApiPathSuffix('https://api.example.com')).toBeNull();
    });

    it('handles case-insensitive matching', () => {
      expect(removeApiPathSuffix('https://api.example.com/V1/MODELS')).toBe('https://api.example.com');
    });

    it('returns null for empty input', () => {
      expect(removeApiPathSuffix('')).toBeNull();
      expect(removeApiPathSuffix(null as any)).toBeNull();
    });
  });

  describe('guessProtocolFromUrl', () => {
    it('detects Gemini URLs', () => {
      expect(guessProtocolFromUrl('https://generativelanguage.googleapis.com/v1')).toBe('gemini');
      expect(guessProtocolFromUrl('https://aiplatform.googleapis.com/v1')).toBe('gemini');
    });

    it('detects OpenAI URLs', () => {
      expect(guessProtocolFromUrl('https://api.openai.com/v1')).toBe('openai');
      expect(guessProtocolFromUrl('https://api.deepseek.com/v1')).toBe('openai');
      expect(guessProtocolFromUrl('https://openrouter.ai/v1')).toBe('openai');
    });

    it('detects Anthropic URLs', () => {
      expect(guessProtocolFromUrl('https://api.anthropic.com/v1')).toBe('anthropic');
    });

    it('returns null for unknown URLs', () => {
      expect(guessProtocolFromUrl('https://unknown.example.com/v1')).toBeNull();
    });

    it('handles case-insensitive matching', () => {
      expect(guessProtocolFromUrl('HTTPS://API.OPENAI.COM/V1')).toBe('openai');
    });

    it('detects localhost URLs as OpenAI', () => {
      expect(guessProtocolFromUrl('http://localhost:8000/v1')).toBe('openai');
      expect(guessProtocolFromUrl('http://127.0.0.1:8000/v1')).toBe('openai');
    });
  });

  describe('guessProtocolFromKey', () => {
    it('detects OpenAI key format', () => {
      expect(guessProtocolFromKey('sk-abc123def456ghi789jkl012')).toBe('openai');
      expect(guessProtocolFromKey('sk-proj-abc123def456ghi789jkl012')).toBe('openai');
    });

    it('detects Gemini key format', () => {
      const geminiKey = 'AIza' + 'a'.repeat(35);
      expect(guessProtocolFromKey(geminiKey)).toBe('gemini');
    });

    it('detects Anthropic key format (matched as openai due to pattern order)', () => {
      const anthropicKey = 'sk-ant-' + 'a'.repeat(80);
      // Current implementation: OpenAI pattern matches first (sk-[A-Za-z0-9-_]{20,})
      expect(guessProtocolFromKey(anthropicKey)).toBe('openai');
    });

    it('detects Groq key format', () => {
      const groqKey = 'gsk_' + 'a'.repeat(52);
      expect(guessProtocolFromKey(groqKey)).toBe('openai');
    });

    it('detects Perplexity key format', () => {
      const pplxKey = 'pplx-' + 'a'.repeat(48);
      expect(guessProtocolFromKey(pplxKey)).toBe('openai');
    });

    it('returns null for unknown key format', () => {
      expect(guessProtocolFromKey('unknown-key-format')).toBeNull();
      expect(guessProtocolFromKey('abc123')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(guessProtocolFromKey('')).toBeNull();
    });
  });

  describe('identifyProviderFromKey', () => {
    it('identifies OpenAI/Compatible provider', () => {
      expect(identifyProviderFromKey('sk-abc123def456ghi789jkl012')).toBe('OpenAI/Compatible');
    });

    it('identifies Google/Gemini provider', () => {
      const geminiKey = 'AIza' + 'a'.repeat(35);
      expect(identifyProviderFromKey(geminiKey)).toBe('Google/Gemini');
    });

    it('identifies Anthropic provider (matched as OpenAI/Compatible due to pattern order)', () => {
      const anthropicKey = 'sk-ant-' + 'a'.repeat(80);
      // Current implementation: OpenAI pattern matches first in THIRD_PARTY_KEY_PATTERNS
      expect(identifyProviderFromKey(anthropicKey)).toBe('OpenAI/Compatible');
    });

    it('identifies Groq provider', () => {
      const groqKey = 'gsk_' + 'a'.repeat(52);
      expect(identifyProviderFromKey(groqKey)).toBe('Groq');
    });

    it('identifies Perplexity provider', () => {
      const pplxKey = 'pplx-' + 'a'.repeat(48);
      expect(identifyProviderFromKey(pplxKey)).toBe('Perplexity');
    });

    it('returns null for unknown key', () => {
      expect(identifyProviderFromKey('unknown-key')).toBeNull();
    });
  });

  describe('getProtocolDisplayName', () => {
    it('returns display names for known protocols', () => {
      expect(getProtocolDisplayName('openai')).toBe('OpenAI');
      expect(getProtocolDisplayName('gemini')).toBe('Gemini');
      expect(getProtocolDisplayName('anthropic')).toBe('Anthropic');
      expect(getProtocolDisplayName('unknown')).toBe('Unknown');
    });

    it('returns protocol string for unmapped values', () => {
      expect(getProtocolDisplayName('custom' as any)).toBe('custom');
    });
  });

  describe('getRecommendedPlatform', () => {
    it('returns recommended platforms', () => {
      expect(getRecommendedPlatform('gemini')).toBe('gemini');
      expect(getRecommendedPlatform('anthropic')).toBe('Anthropic');
    });

    it('returns null for protocols without recommendation', () => {
      expect(getRecommendedPlatform('openai')).toBeNull();
      expect(getRecommendedPlatform('unknown')).toBeNull();
    });
  });
});
