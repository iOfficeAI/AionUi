import { describe, expect, it } from 'vitest';
import type { IProvider } from '../../src/common/config/storage';
import {
  buildAionUiAcpModelInfo,
  buildAionUiModelEnv,
  decodeAionUiModelRef,
  encodeAionUiModelRef,
  getAionUiModelDisplayLabel,
  resolveAionUiModelSelection,
} from '../../src/common/utils/acpAionUiModel';

const providers: IProvider[] = [
  {
    id: 'openai-main',
    platform: 'custom',
    name: 'OpenAI Compatible',
    baseUrl: 'https://example.com/v1',
    apiKey: 'sk-openai',
    model: ['gpt-4.1', 'gpt-4o-mini'],
    enabled: true,
  },
  {
    id: 'anthropic-main',
    platform: 'anthropic',
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    apiKey: 'sk-ant',
    model: ['claude-sonnet-4'],
    enabled: true,
  },
];

describe('acpAionUiModel helpers', () => {
  it('encodes and decodes AionUI model refs', () => {
    const ref = encodeAionUiModelRef('openai-main', 'gpt-4.1/high');
    expect(decodeAionUiModelRef(ref)).toEqual({
      providerId: 'openai-main',
      modelId: 'gpt-4.1/high',
    });
  });

  it('builds ACP fallback model info from configured providers', () => {
    const info = buildAionUiAcpModelInfo(providers);
    expect(info).toEqual({
      source: 'models',
      currentModelId: encodeAionUiModelRef('openai-main', 'gpt-4.1'),
      currentModelLabel: 'OpenAI Compatible / gpt-4.1',
      availableModels: [
        { id: encodeAionUiModelRef('openai-main', 'gpt-4.1'), label: 'OpenAI Compatible / gpt-4.1' },
        { id: encodeAionUiModelRef('openai-main', 'gpt-4o-mini'), label: 'OpenAI Compatible / gpt-4o-mini' },
        { id: encodeAionUiModelRef('anthropic-main', 'claude-sonnet-4'), label: 'Anthropic / claude-sonnet-4' },
      ],
      canSwitch: true,
    });
  });

  it('resolves display labels and env vars for a selected provider model', () => {
    const modelRef = encodeAionUiModelRef('anthropic-main', 'claude-sonnet-4');
    const selection = resolveAionUiModelSelection(providers, modelRef);

    expect(selection).toMatchObject({
      modelRef,
      modelId: 'claude-sonnet-4',
      label: 'Anthropic / claude-sonnet-4',
    });
    expect(getAionUiModelDisplayLabel(modelRef, providers)).toBe('Anthropic / claude-sonnet-4');
    expect(buildAionUiModelEnv(selection!)).toMatchObject({
      AIONUI_MODEL_REF: modelRef,
      AIONUI_MODEL_ID: 'claude-sonnet-4',
      ANTHROPIC_API_KEY: 'sk-ant',
      ANTHROPIC_MODEL: 'claude-sonnet-4',
    });
  });
});
