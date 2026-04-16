/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AcpModelInfo } from '@/common/types/acpTypes';
import type { IProvider } from '@/common/config/storage';

export type TeamAvailableModel = {
  id: string;
  label: string;
};

/**
 * Get available models for a given agent backend in team context.
 *
 * Resolution order:
 * 1. ACP backends (claude, codex, qwen, etc.) → read from acp.cachedModels[backend].availableModels
 *    (already standardized to { id: string; label: string }[])
 * 2. Gemini → read from model.config providers with platform='gemini' or 'gemini-with-google-auth'
 * 3. Aionrs → read from model.config providers (first enabled — matches resolveDefaultAionrsModel behavior)
 * 4. Others → empty list (no model switching)
 *
 * TODO(S2): Aionrs should filter by platform to avoid picking wrong provider when multiple are configured.
 */
export function getTeamAvailableModels(
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined,
  providers: IProvider[] | null | undefined
): TeamAvailableModel[] {
  // ACP backends: use cached model list from ACP protocol
  const acpModelInfo = cachedModels?.[backend];
  if (acpModelInfo?.availableModels && acpModelInfo.availableModels.length > 0) {
    return acpModelInfo.availableModels.map((m) => ({
      id: m.id,
      label: m.label || m.id,
    }));
  }

  // Gemini: use configured providers
  // TODO(S1): Add model display name mapping for friendlier labels
  if (backend === 'gemini') {
    const geminiProviders = (providers || []).filter(
      (p) => p.enabled !== false && (p.platform === 'gemini' || p.platform === 'gemini-with-google-auth')
    );
    return geminiProviders.flatMap((p) =>
      p.model.filter((m) => p.modelEnabled?.[m] !== false).map((m) => ({ id: m, label: m }))
    );
  }

  // Aionrs: use first enabled provider's models (matches resolveDefaultAionrsModel behavior)
  if (backend === 'aionrs') {
    const provider = (providers || []).find((p) => p.enabled !== false && p.model?.length);
    if (provider) {
      return provider.model.filter((m) => provider.modelEnabled?.[m] !== false).map((m) => ({ id: m, label: m }));
    }
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
  const cached = cachedModels?.[backend]?.currentModelId;
  if (cached) return cached;

  return undefined;
}

/**
 * Resolve a model ID to its friendly display label.
 *
 * Lookup order:
 * 1. ACP cachedModels[backend].availableModels — match by id, return label
 * 2. Fall back to the raw model ID
 *
 * This function is synchronous and expects pre-fetched data.
 */
export function resolveTeamModelLabel(
  modelId: string | undefined,
  backend: string,
  cachedModels: Record<string, AcpModelInfo> | null | undefined
): string {
  if (!modelId) return '(default)';

  const acpModels = cachedModels?.[backend]?.availableModels;
  if (acpModels) {
    const match = acpModels.find((m) => m.id === modelId);
    if (match?.label) return match.label;
  }

  return modelId;
}
