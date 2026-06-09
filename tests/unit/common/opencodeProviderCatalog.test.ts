/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unit tests for `opencodeProviderCatalog.ts` — the parser that converts raw
 * `GET /provider` and `GET /provider/auth` payloads into the AionUi view
 * model. Locks in the contract that the SDK-aliased types in
 * `opencodeProviderTypes.ts` give the parser: required fields must be
 * present after parsing, optional fields are omitted (not undefined).
 */

import { describe, it, expect } from 'vitest';
import {
  buildProviderCatalogView,
  parseProviderListResponse,
  oauthMethodIndex,
  apiMethodPresent,
  formatContextTokens,
  promptVisible,
} from '@/common/types/opencode/opencodeProviderCatalog';

describe('opencodeProviderCatalog', () => {
  describe('parseProviderListResponse', () => {
    it('returns null when the payload is not an object', () => {
      expect(parseProviderListResponse(null)).toBeNull();
      expect(parseProviderListResponse(undefined)).toBeNull();
      expect(parseProviderListResponse('nope')).toBeNull();
    });

    it('returns null when `all` is missing or not an array', () => {
      expect(parseProviderListResponse({})).toBeNull();
      expect(parseProviderListResponse({ all: 'oops' })).toBeNull();
    });

    it('drops providers without a string id', () => {
      const result = parseProviderListResponse({
        all: [{ name: 'no-id' }, { id: 'good' }],
        connected: [],
      });
      expect(result?.all.map((p) => p.id)).toEqual(['good']);
    });

    it('keeps the SDK `Provider` shape after parsing (no `api`/`npm` leak)', () => {
      // The SDK v2 `Provider` type does NOT carry `api` / `npm`; the parser
      // must not reintroduce them on the result object.
      const result = parseProviderListResponse({
        all: [{ id: 'p1', name: 'P1', source: 'env', env: ['K'], key: 'k', options: { a: 1 } }],
        connected: [],
      });
      expect(result).not.toBeNull();
      const p = result?.all[0];
      expect(p).toBeDefined();
      expect(p).not.toHaveProperty('api');
      expect(p).not.toHaveProperty('npm');
      expect(p?.env).toEqual(['K']);
      expect(p?.key).toBe('k');
    });

    it('preserves `connected` as the raw array (string|Provider union tolerant)', () => {
      const result = parseProviderListResponse({
        all: [{ id: 'p1' }],
        connected: ['p1', { id: 'p2' }],
      });
      expect(result?.connected).toEqual(['p1', { id: 'p2' }]);
    });
  });

  describe('buildProviderCatalogView', () => {
    it('merges catalog + auth methods and marks default provider/model', () => {
      const catalog = {
        all: [
          {
            id: 'anthropic',
            name: 'Anthropic',
            source: 'env',
            env: ['ANTHROPIC_API_KEY'],
            models: {
              'claude-3-5-sonnet': { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet' },
            },
          },
          { id: 'openai', name: 'OpenAI', source: 'config' },
        ],
        default: { providerID: 'anthropic', modelID: 'claude-3-5-sonnet' },
        connected: ['anthropic'],
      };
      const auth = {
        anthropic: [
          { type: 'api', label: 'API Key' },
          { type: 'oauth', label: 'OAuth' },
        ],
        openai: [{ type: 'api', label: 'API Key' }],
      };
      const view = buildProviderCatalogView(catalog, auth);
      expect(view.defaultProviderId).toBe('anthropic');
      expect(view.defaultModelId).toBe('claude-3-5-sonnet');
      expect(view.connectedCount).toBe(1);
      expect(view.providers).toHaveLength(2);
      const anthropic = view.providers.find((p) => p.provider.id === 'anthropic');
      expect(anthropic?.connected).toBe(true);
      expect(anthropic?.isDefaultProvider).toBe(true);
      expect(anthropic?.authMethods).toHaveLength(2);
      expect(anthropic?.models.map((m) => m.id)).toEqual(['claude-3-5-sonnet']);
      const openai = view.providers.find((p) => p.provider.id === 'openai');
      expect(openai?.connected).toBe(false);
      expect(openai?.isDefaultProvider).toBe(false);
    });

    it('sorts connected+default providers first, then by name', () => {
      const catalog = {
        all: [
          { id: 'z', name: 'Zeta' },
          { id: 'a', name: 'Alpha' },
          { id: 'd', name: 'Delta' },
        ],
        default: { providerID: 'd' },
        connected: ['d'],
      };
      const view = buildProviderCatalogView(catalog, {});
      expect(view.providers.map((p) => p.provider.id)).toEqual(['d', 'a', 'z']);
    });

    it('returns empty view when catalog payload is malformed', () => {
      const view = buildProviderCatalogView('not-an-object', {});
      expect(view.providers).toEqual([]);
      expect(view.connectedCount).toBe(0);
    });
  });

  describe('oauthMethodIndex / apiMethodPresent', () => {
    it('finds the first oauth method and detects api methods', () => {
      const methods = [
        { type: 'api', label: 'API Key' },
        { type: 'oauth', label: 'OAuth' },
      ] as const;
      expect(apiMethodPresent([...methods])).toBe(true);
      expect(oauthMethodIndex([...methods])).toBe(1);
      expect(oauthMethodIndex([{ type: 'api', label: 'API Key' }])).toBe(-1);
    });
  });

  describe('formatContextTokens', () => {
    it('formats context windows with K/M suffix and renders dash for unknown', () => {
      expect(formatContextTokens()).toBe('—');
      expect(formatContextTokens(0)).toBe('—');
      expect(formatContextTokens(500)).toBe('500');
      // 1500 rounds to 2K (Math.round), 2000 stays 2K, 150K stays 150K
      expect(formatContextTokens(1500)).toBe('2K');
      expect(formatContextTokens(2000)).toBe('2K');
      expect(formatContextTokens(150_000)).toBe('150K');
      expect(formatContextTokens(1_500_000)).toBe('1.5M');
    });
  });

  describe('promptVisible', () => {
    it('returns true when the prompt has no `when` clause', () => {
      const prompt = { type: 'text', key: 'k', message: 'm' } as const;
      expect(promptVisible(prompt, {})).toBe(true);
    });

    it('honors `eq` and `neq` against the inputs map', () => {
      const eqPrompt = { type: 'text', key: 'k', message: 'm', when: { key: 'a', op: 'eq', value: 'x' } } as const;
      const neqPrompt = { type: 'text', key: 'k', message: 'm', when: { key: 'a', op: 'neq', value: 'x' } } as const;
      expect(promptVisible(eqPrompt, { a: 'x' })).toBe(true);
      expect(promptVisible(eqPrompt, { a: 'y' })).toBe(false);
      expect(promptVisible(neqPrompt, { a: 'y' })).toBe(true);
      expect(promptVisible(neqPrompt, { a: 'x' })).toBe(false);
    });
  });
});
