/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ICreateConversationParams } from '@/common/adapter/ipcBridge';
import type { TProviderWithModel } from '@/common/config/storage';

type ConversationType = ICreateConversationParams['type'];
type ConversationExtra = ICreateConversationParams['extra'];

export type RuntimeContractsConfig = {
  enabled?: boolean;
  debug?: boolean;
  contracts?: string[];
};

export type PresetContextProvenance = {
  assistant: {
    id?: string;
    rulesHash?: string;
  };
  skills: {
    enabled?: string[];
    excludedBuiltin?: string[];
    skillPackHash?: string;
  };
  model?: {
    provider?: string;
    platform?: string;
    useModel?: string;
  };
  instructionSources: string[];
};

type NormalizePresetAssistantExtraOptions = {
  type?: ConversationType;
  isPreset?: boolean;
  failClosed?: boolean;
  model?: Partial<TProviderWithModel>;
};

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashStableValue(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizePresetAssistantExtra<T extends Partial<ConversationExtra>>(
  extra: T,
  options: NormalizePresetAssistantExtraOptions = {}
): T {
  const normalized = { ...extra } as T & ConversationExtra;
  const rules = cleanText(normalized.presetRules) ?? cleanText(normalized.presetContext);
  const enabledSkills = Array.isArray(normalized.enabledSkills)
    ? normalized.enabledSkills.filter((skill): skill is string => typeof skill === 'string' && skill.trim().length > 0)
    : undefined;
  const excludedBuiltin = Array.isArray(normalized.excludeBuiltinSkills)
    ? normalized.excludeBuiltinSkills.filter(
        (skill): skill is string => typeof skill === 'string' && skill.trim().length > 0
      )
    : undefined;

  if (options.failClosed && options.type === 'aionrs' && options.isPreset && normalized.presetAssistantId && !rules) {
    throw new Error(`Preset AionRS conversation ${normalized.presetAssistantId} is missing presetRules/presetContext`);
  }

  if (rules) {
    normalized.presetRules = rules;
    normalized.presetContext = cleanText(normalized.presetContext) ?? rules;
    normalized.presetRulesHash = hashStableValue(rules);
  }

  if (enabledSkills) {
    normalized.enabledSkills = enabledSkills;
    normalized.skillPackHash = hashStableValue({
      enabledSkills: [...enabledSkills].sort(),
      excludeBuiltinSkills: [...(excludedBuiltin ?? [])].sort(),
    });
  }

  if (normalized.presetAssistantId || rules || enabledSkills) {
    normalized.contextProvenance = {
      assistant: {
        id: normalized.presetAssistantId,
        rulesHash: normalized.presetRulesHash,
      },
      skills: {
        enabled: enabledSkills,
        excludedBuiltin,
        skillPackHash: normalized.skillPackHash,
      },
      model: options.model
        ? {
            provider: options.model.name,
            platform: options.model.platform,
            useModel: options.model.useModel,
          }
        : undefined,
      instructionSources: [
        'system',
        ...(rules ? ['assistant_rules'] : []),
        ...(enabledSkills?.length ? ['enabled_skill_metadata'] : []),
        'workspace_policy',
      ],
    };
  }

  return normalized as T;
}
