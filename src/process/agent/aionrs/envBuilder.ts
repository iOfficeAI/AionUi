/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';

type AionrsProvider = 'anthropic' | 'openai' | 'bedrock' | 'vertex';

/**
 * Map AionUi platform name to aionrs provider name.
 */
function mapProvider(model: TProviderWithModel): AionrsProvider {
  const mapping: Record<string, AionrsProvider> = {
    anthropic: 'anthropic',
    openai: 'openai',
    'ali-intl': 'openai', // OpenAI-compatible
    aws: 'bedrock',
    vertex: 'vertex',
  };
  return mapping[model.platform] ?? 'openai';
}

/**
 * Build CLI args and env vars for spawning aionrs.
 */
export function buildSpawnConfig(
  model: TProviderWithModel,
  options: {
    workspace: string;
    maxTokens?: number;
    maxTurns?: number;
    systemPrompt?: string;
    autoApprove?: boolean;
  }
): { args: string[]; env: Record<string, string> } {
  const provider = mapProvider(model);
  const env: Record<string, string> = {};
  const args: string[] = [
    '--json-stream',
    '--provider',
    provider,
    '--model',
    model.useModel,
    '--workspace',
    options.workspace,
  ];

  if (options.maxTokens) {
    args.push('--max-tokens', String(options.maxTokens));
  }
  if (options.maxTurns) {
    args.push('--max-turns', String(options.maxTurns));
  }
  if (options.systemPrompt) {
    args.push('--system-prompt', options.systemPrompt);
  }
  if (options.autoApprove) {
    args.push('--auto-approve');
  }

  // Set auth env vars based on provider
  switch (provider) {
    case 'anthropic':
      if (model.apiKey) env.ANTHROPIC_API_KEY = model.apiKey;
      if (model.baseUrl) env.ANTHROPIC_BASE_URL = model.baseUrl;
      break;

    case 'openai':
      if (model.apiKey) env.OPENAI_API_KEY = model.apiKey;
      if (model.baseUrl) env.OPENAI_BASE_URL = model.baseUrl;
      break;

    case 'bedrock': {
      const bc = (model as TProviderWithModel & { bedrockConfig?: any }).bedrockConfig;
      if (bc) {
        if (bc.region) env.AWS_REGION = bc.region;
        if (bc.authMethod === 'accessKey') {
          if (bc.accessKeyId) env.AWS_ACCESS_KEY_ID = bc.accessKeyId;
          if (bc.secretAccessKey) env.AWS_SECRET_ACCESS_KEY = bc.secretAccessKey;
        } else if (bc.authMethod === 'profile' && bc.profile) {
          env.AWS_PROFILE = bc.profile;
        }
      }
      break;
    }

    case 'vertex':
      // Vertex uses service account or ADC — no explicit env vars needed
      break;
  }

  return { args, env };
}
