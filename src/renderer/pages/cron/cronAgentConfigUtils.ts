/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpBackend, AcpSessionConfigOption } from '@/common/types/acpTypes';
import { getDefaultAcpConfigOptions } from '@/common/types/codex/codexConfigOptions';
import type { AvailableAgent } from '@/renderer/utils/model/agentTypes';
import { getAgentModes } from '@/renderer/utils/model/agentModes';

type CronModePreference = {
  preferredMode?: string;
  yoloMode?: boolean;
};

const LEGACY_YOLO_MODE_MAP: Partial<Record<string, string>> = {
  claude: 'bypassPermissions',
  codex: 'yolo',
  gemini: 'yolo',
  iflow: 'yolo',
  qwen: 'yolo',
};

export function resolveCronAgentBackend(agent?: AvailableAgent | null): string | undefined {
  if (!agent) {
    return undefined;
  }

  return agent.isPreset ? agent.presetAgentType || 'gemini' : agent.backend;
}

export function resolveCronInitialMode(
  backend: string | undefined,
  preference?: CronModePreference,
  persistedMode?: string
): string {
  const modeOptions = getAgentModes(backend);
  const defaultMode = modeOptions[0]?.value ?? 'default';

  if (modeOptions.length === 0) {
    return defaultMode;
  }

  if (persistedMode && modeOptions.some((option) => option.value === persistedMode)) {
    return persistedMode;
  }

  if (preference?.preferredMode && modeOptions.some((option) => option.value === preference.preferredMode)) {
    return preference.preferredMode;
  }

  const legacyMode = backend ? LEGACY_YOLO_MODE_MAP[backend] : undefined;
  if (preference?.yoloMode && legacyMode && modeOptions.some((option) => option.value === legacyMode)) {
    return legacyMode;
  }

  return defaultMode;
}

export function getCronConfigOptions(
  backend: string | undefined,
  cachedOptions?: Record<string, AcpSessionConfigOption[]>
): AcpSessionConfigOption[] {
  if (!backend || backend === 'custom' || backend === 'gemini') {
    return [];
  }

  const resolvedCachedOptions = cachedOptions?.[backend] || [];
  if (resolvedCachedOptions.length > 0) {
    return resolvedCachedOptions;
  }

  return getDefaultAcpConfigOptions(backend as AcpBackend);
}

export function filterSelectableCronConfigOptions(configOptions: AcpSessionConfigOption[]): AcpSessionConfigOption[] {
  return configOptions.filter(
    (option) =>
      option.type === 'select' &&
      (option.options?.length ?? 0) > 1 &&
      option.category !== 'mode' &&
      option.category !== 'model'
  );
}

export function resolveCronInitialConfigValues(
  configOptions: AcpSessionConfigOption[],
  preferredValues?: Record<string, string>,
  persistedValues?: Record<string, string>
): Record<string, string> {
  return configOptions.reduce<Record<string, string>>((acc, option) => {
    const candidates = [
      persistedValues?.[option.id],
      preferredValues?.[option.id],
      option.currentValue,
      option.selectedValue,
      option.options?.[0]?.value,
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }

      const isValueAvailable = option.options?.some((choice) => choice.value === candidate) ?? true;
      if (isValueAvailable) {
        acc[option.id] = candidate;
        break;
      }
    }

    return acc;
  }, {});
}

export function getCronConfigOptionTranslationKey(configId: string): string {
  return configId.startsWith('model_') ? configId.slice(6) : configId;
}
