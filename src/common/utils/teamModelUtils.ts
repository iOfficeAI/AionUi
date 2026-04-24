/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { IProvider } from '@/common/config/storage';
import { flattenGeminiModeIds } from '@/common/utils/geminiModes';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';

export type TeamAvailableModel = {
  id: string;
  label: string;
};

/**
 * Check whether a model passes the capability filter used by the frontend.
 * A model is included when:
 * - function_calling is true or undefined (unknown = allowed)
 * - excludeFromPrimary is NOT true
 */
function passesCapabilityFilter(provider: IProvider, modelName: string): boolean {
  const fc = hasSpecificModelCapability(provider, modelName, 'function_calling');
  if (fc === false) return false;
  const excluded = hasSpecificModelCapability(provider, modelName, 'excludeFromPrimary');
  if (excluded === true) return false;
  return true;
}

/**
 * Get available models for a given agent backend in team context.
 *
 * Resolution order:
 * 1. ACP backends (claude, codex, qwen, etc.) -> read from acp.cachedModels[backend].available_models
 * 2. Gemini -> Google Auth models (if authenticated) + ALL enabled providers' models
 * 3. Aionrs -> all enabled providers (except gemini-with-google-auth) with capability filtering
 * 4. Others -> empty list (no model switching)
 *
 * The Gemini list mirrors what useModelProviderList() returns:
 * Google Auth provider (auto/auto-gemini-2.5/manual-subModels) + ALL configured providers.
 * The Aionrs list mirrors useAionrsModelSelection: same as above minus Google Auth.
 */
export function getTeamAvailableModels(
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  providers: IProvider[] | null | undefined,
  isGoogleAuth?: boolean
): TeamAvailableModel[] {
  // ACP backends: use cached model list from ACP protocol
  const acpModelInfo = cachedModels?.[backend];
  if (acpModelInfo?.available_models && acpModelInfo.available_models.length > 0) {
    return acpModelInfo.available_models.map((m) => ({
      id: m.id,
      label: m.label || m.id,
    }));
  }

  // Gemini: Google Auth models (if authenticated) + ALL enabled providers' models
  if (backend === 'gemini') {
    const seen = new Set<string>();
    const merged: TeamAvailableModel[] = [];
    const addModel = (id: string) => {
      if (!seen.has(id)) {
        seen.add(id);
        merged.push({ id, label: id });
      }
    };

    // Google Auth models first (matches homepage ordering)
    if (isGoogleAuth) {
      for (const id of flattenGeminiModeIds()) {
        addModel(id);
      }
    }

    // ALL enabled providers' models with capability filtering
    // Mirrors useModelProviderList(): every enabled provider is included
    const enabledProviders = (providers || []).filter((p) => p.enabled !== false && p.models?.length);
    for (const p of enabledProviders) {
      for (const m of p.models || []) {
        if (p.model_enabled?.[m] !== false && passesCapabilityFilter(p, m)) {
          addModel(m);
        }
      }
    }

    return merged;
  }

  // Aionrs: all enabled providers' enabled models (deduplicated), excluding google-auth platform
  if (backend === 'aionrs') {
    const seen = new Set<string>();
    const result: TeamAvailableModel[] = [];
    const enabledProviders = (providers || []).filter(
      (p) => p.enabled !== false && p.models?.length && !p.platform?.includes('gemini-with-google-auth')
    );
    for (const provider of enabledProviders) {
      for (const m of provider.models) {
        if (provider.model_enabled?.[m] !== false && !seen.has(m) && passesCapabilityFilter(provider, m)) {
          seen.add(m);
          result.push({ id: m, label: m });
        }
      }
    }
    return result;
  }

  return [];
}

/**
 * Resolve the default model ID for a backend.
 * Used when TeamAgent.model is undefined.
 */
export function getTeamDefaultModelId(
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  acpConfig: Record<string, { preferredModelId?: string } | undefined> | null | undefined
): string | undefined {
  // 1. User's preferred model for this backend
  const preferred = acpConfig?.[backend]?.preferredModelId;
  if (preferred) return preferred;

  // 2. Cached current model from last ACP session
  const cached = cachedModels?.[backend]?.current_model_id;
  if (cached) return cached;

  return undefined;
}

/**
 * Resolve a model ID to its friendly display label.
 *
 * Lookup order:
 * 1. ACP cachedModels[backend].available_models — match by id, return label
 * 2. Fall back to the raw model ID
 *
 * This function is synchronous and expects pre-fetched data.
 */
export function resolveTeamModelLabel(
  model_id: string | undefined,
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined
): string {
  if (!model_id) return '(default)';

  const acpModels = cachedModels?.[backend]?.available_models;
  if (acpModels) {
    const match = acpModels.find((m) => m.id === model_id);
    if (match?.label) return match.label;
  }

  return model_id;
}
