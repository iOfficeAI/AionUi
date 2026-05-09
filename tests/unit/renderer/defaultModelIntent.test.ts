/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import type { DefaultModelIntent, IProvider, TProviderWithModel } from '../../../src/common/config/storage';
import {
  isDefaultModelIntent,
  resolveModelFromIntent,
  toDefaultModelIntent,
} from '../../../src/renderer/pages/guid/utils/defaultModelIntent';

const nowSpy = vi.spyOn(Date, 'now');

const PROVIDERS: IProvider[] = [
  {
    id: 'provider-openai',
    name: 'OpenAI Provider',
    platform: 'openai',
    baseUrl: 'https://example.com',
    apiKey: 'token',
    model: ['gpt-4.1', 'gpt-4.1-mini'],
    enabled: true,
  },
  {
    id: 'provider-anthropic',
    name: 'Anthropic Provider',
    platform: 'anthropic',
    baseUrl: 'https://example.com',
    apiKey: 'token',
    model: ['claude-sonnet-4'],
    enabled: true,
  },
] as IProvider[];

describe('guid defaultModelIntent utils', () => {
  it('recognizes valid default model intent objects', () => {
    const intent: DefaultModelIntent = {
      providerId: 'provider-openai',
      modelId: 'gpt-4.1',
      updatedAt: 1,
    };

    expect(isDefaultModelIntent(intent)).toBe(true);
    expect(isDefaultModelIntent(null)).toBe(false);
    expect(isDefaultModelIntent({ providerId: 'provider-openai' })).toBe(false);
  });

  it('resolves a provider/model pair from unified intent', () => {
    const resolved = resolveModelFromIntent(PROVIDERS, {
      providerId: 'provider-anthropic',
      modelId: 'claude-sonnet-4',
      updatedAt: 1,
    });

    expect(resolved).toEqual({
      provider: PROVIDERS[1],
      useModel: 'claude-sonnet-4',
    });
  });

  it('returns null when unified intent does not match the current provider list', () => {
    const resolved = resolveModelFromIntent(PROVIDERS, {
      providerId: 'missing-provider',
      modelId: 'missing-model',
      updatedAt: 1,
    });

    expect(resolved).toBeNull();
  });

  it('builds guid-sourced default model intent from a selected provider model', () => {
    nowSpy.mockReturnValueOnce(123456789);

    const intent = toDefaultModelIntent({
      ...(PROVIDERS[1] as TProviderWithModel),
      useModel: 'claude-sonnet-4',
    });

    expect(intent).toEqual({
      providerId: 'provider-anthropic',
      modelId: 'claude-sonnet-4',
      providerPlatform: 'anthropic',
      providerName: 'Anthropic Provider',
      source: 'guid',
      updatedAt: 123456789,
    });
  });
});
