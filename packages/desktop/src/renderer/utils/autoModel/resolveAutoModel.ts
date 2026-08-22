/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { IProvider, TProviderWithModel } from '@/common/config/storage';
import { hasSpecificModelCapability } from '@/common/utils/modelCapabilities';
import { preferenceWeight, scoreModelForSlots } from './tierHeuristics';
import type { ResolveAutoModelInput, ResolveAutoModelResult, AutoModelPhase } from './types';

const toProviderWithModel = (provider: IProvider, modelName: string): TProviderWithModel =>
  ({ ...provider, use_model: modelName }) as TProviderWithModel;

const isHealthy = (provider: IProvider, modelName: string): boolean => {
  const health = provider.model_health?.[modelName];
  if (!health) return true;
  return health.status !== 'unhealthy';
};

const supportsVision = (provider: IProvider, modelName: string): boolean => {
  const vision = hasSpecificModelCapability(provider, modelName, 'vision');
  return vision !== false;
};

type Candidate = { provider: IProvider; modelName: string; score: number };

const collectCandidates = (input: ResolveAutoModelInput, slot: AutoModelPhase): Candidate[] => {
  const out: Candidate[] = [];
  for (const provider of input.providers) {
    if (provider.enabled === false) continue;
    for (const modelName of input.getAvailableModels(provider)) {
      if (!isHealthy(provider, modelName)) continue;
      if (input.requireVision && !supportsVision(provider, modelName)) continue;
      const scores = scoreModelForSlots(modelName);
      const score = preferenceWeight(input.settings.preference, slot, scores);
      out.push({ provider, modelName, score });
    }
  }
  return out.sort((a, b) => b.score - a.score);
};

const resolveFixed = (
  input: ResolveAutoModelInput,
  providerId: string,
  modelName: string
): TProviderWithModel | null => {
  const provider = input.providers.find((item) => item.id === providerId);
  if (!provider || provider.enabled === false) return null;
  const available = input.getAvailableModels(provider);
  if (!available.includes(modelName)) return null;
  if (!isHealthy(provider, modelName)) return null;
  if (input.requireVision && !supportsVision(provider, modelName)) return null;
  return toProviderWithModel(provider, modelName);
};

/**
 * Resolve a concrete provider+model for the given Auto phase/slot.
 * Phase 1 uses this for sticky resolve (typically `worker`); Phase 2 will
 * call it again when the harness changes phase without rebuilding the agent.
 */
export const resolveAutoModel = (input: ResolveAutoModelInput): ResolveAutoModelResult => {
  const binding = input.settings.slots[input.phase];

  if (binding.mode === 'fixed') {
    const fixed = resolveFixed(input, binding.provider_id, binding.model);
    if (fixed) {
      return {
        model: fixed,
        slot: input.phase,
        reason: `fixed:${input.phase}`,
      };
    }
  }

  const candidates = collectCandidates(input, input.phase);
  if (candidates.length === 0) {
    // Fall back across seats so Auto never dead-ends when one seat is empty.
    for (const fallback of fallbackOrder(input.phase)) {
      const alt = collectCandidates(input, fallback);
      if (alt[0]) {
        return {
          model: toProviderWithModel(alt[0].provider, alt[0].modelName),
          slot: fallback,
          reason: `automatic-fallback:${input.phase}->${fallback}`,
        };
      }
    }
    throw new Error('No agent-capable models available for Auto routing');
  }

  const best = candidates[0];
  return {
    model: toProviderWithModel(best.provider, best.modelName),
    slot: input.phase,
    reason: `automatic:${input.phase}`,
  };
};

const fallbackOrder = (phase: AutoModelPhase): AutoModelPhase[] => {
  if (phase === 'planner') return ['worker', 'utility'];
  if (phase === 'utility') return ['worker', 'planner'];
  return ['planner', 'utility'];
};
