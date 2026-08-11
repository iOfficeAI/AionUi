/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider } from '@/common/config/storage';
import type { AcpBackend } from '@/common/types/acpTypes';
import type { CliOption, ConversationType, HeaderItem, ProviderModelOption } from './types';

export const DEFAULT_MESSAGE = 'Hello from AionUi API';

export const generateApiToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(64);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((value) => chars[value % chars.length])
    .join('');
};

export const parseOptionalString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
};

export const parseOptionalAcpBackend = (value: unknown): AcpBackend | undefined => {
  const trimmed = parseOptionalString(value);
  return trimmed as AcpBackend | undefined;
};

export const parseHeaders = (source?: Record<string, string>): HeaderItem[] => {
  if (!source) {
    return [];
  }

  return Object.entries(source).map(([key, value]) => ({ key, value: String(value ?? '') }));
};

export const createProviderModelOptions = (providers: IProvider[] | null | undefined): ProviderModelOption[] => {
  if (!providers || !Array.isArray(providers)) {
    return [];
  }

  const options: ProviderModelOption[] = [];
  for (const provider of providers) {
    if (!provider?.id || !Array.isArray(provider.model)) {
      continue;
    }

    for (const modelId of provider.model) {
      options.push({
        value: `${provider.id}::${modelId}`,
        label: `${provider.name || provider.id} / ${modelId}`,
        provider,
        modelId,
      });
    }
  }

  return options;
};

export const getFallbackModel = () => ({
  id: 'default-provider',
  platform: 'openai',
  name: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '***',
  useModel: 'gpt-4o-mini',
});

export const buildCliOptions = (
  agents: Array<{
    backend?: AcpBackend;
    name?: string;
    cliPath?: string;
    customAgentId?: string;
  }>
): CliOption[] => {
  const options: CliOption[] = [];

  for (const agent of agents) {
    const backend = parseOptionalAcpBackend(agent.backend);
    const name = parseOptionalString(agent.name);
    const cliPath = parseOptionalString(agent.cliPath);
    const customAgentId = parseOptionalString(agent.customAgentId);

    if (!backend || !name) {
      continue;
    }

    let conversationType: ConversationType = 'acp';
    if (backend === 'gemini' && !cliPath) {
      conversationType = 'gemini';
    } else if (backend === 'openclaw-gateway') {
      conversationType = 'openclaw-gateway';
    } else if (backend === 'nanobot') {
      conversationType = 'nanobot';
    }

    const value = `agent:${backend}:${customAgentId || ''}:${cliPath || ''}:${name}`;
    options.push({
      value,
      label: customAgentId ? `${name} (${backend} / custom)` : `${name} (${backend})`,
      conversationType,
      backend,
      cliPath,
      customAgentId,
    });
  }

  const hasGemini = options.some((item) => item.conversationType === 'gemini');
  if (!hasGemini) {
    options.unshift({
      value: 'builtin:gemini',
      label: 'Gemini (Built-in)',
      conversationType: 'gemini',
      backend: 'gemini',
    });
  }

  const dedup = new Map<string, CliOption>();
  for (const item of options) {
    if (!dedup.has(item.value)) {
      dedup.set(item.value, item);
    }
  }

  const merged = Array.from(dedup.values());
  merged.sort((left, right) => {
    if (left.conversationType === 'gemini' && right.conversationType !== 'gemini') {
      return -1;
    }
    if (left.conversationType !== 'gemini' && right.conversationType === 'gemini') {
      return 1;
    }
    return left.label.localeCompare(right.label);
  });

  return merged;
};
