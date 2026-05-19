/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ipcBridge } from '@/common';
import { isBackendHttpError } from '@/common/adapter/httpBridge';
import type {
  AgentWarmupReason,
  AgentWarmupResponse,
  SupportedAgentWarmupBackend,
} from '@/renderer/utils/model/agentTypes';
import { useCallback } from 'react';

type WarmupTarget = {
  agent_type?: string;
  backend?: string;
  presetAgentType?: string;
};

export type AgentWarmupResult =
  | {
      ok: true;
      backend: SupportedAgentWarmupBackend;
      reason: AgentWarmupReason;
      response: AgentWarmupResponse;
    }
  | {
      ok: false;
      backend?: SupportedAgentWarmupBackend;
      reason: AgentWarmupReason;
      skipped: true;
      unsupported: boolean;
      error?: unknown;
    };

const SUPPORTED_WARMUP_BACKENDS = new Set<SupportedAgentWarmupBackend>(['codex', 'claude']);
const inFlightWarmups = new Map<SupportedAgentWarmupBackend, Promise<AgentWarmupResult>>();

function normalizeWarmupBackend(value: string | undefined): SupportedAgentWarmupBackend | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'codex' || normalized === 'claude') {
    return normalized;
  }
  return undefined;
}

export function resolveWarmupBackend(target: WarmupTarget | undefined): SupportedAgentWarmupBackend | undefined {
  return (
    normalizeWarmupBackend(target?.backend) ??
    normalizeWarmupBackend(target?.presetAgentType) ??
    normalizeWarmupBackend(target?.agent_type)
  );
}

export function supportsAgentWarmup(target: WarmupTarget | undefined): boolean {
  const backend = resolveWarmupBackend(target);
  return backend ? SUPPORTED_WARMUP_BACKENDS.has(backend) : false;
}

function isUnsupportedWarmupError(error: unknown): boolean {
  return isBackendHttpError(error) && (error.status === 404 || error.status === 501 || error.code === 'UNSUPPORTED');
}

export function warmupAgent(target: WarmupTarget | undefined, reason: AgentWarmupReason): Promise<AgentWarmupResult> {
  const backend = resolveWarmupBackend(target);
  if (!backend) {
    return Promise.resolve({
      ok: false,
      reason,
      skipped: true,
      unsupported: false,
    });
  }

  const cached = inFlightWarmups.get(backend);
  if (cached) {
    return cached;
  }

  const promise = ipcBridge.acpConversation.warmupAgent
    .invoke({ backends: [backend], reason })
    .then((response) => ({
      ok: true as const,
      backend,
      reason,
      response,
    }))
    .catch((error: unknown) => {
      if (!isUnsupportedWarmupError(error)) {
        console.debug('Agent warmup failed softly:', error);
      }
      return {
        ok: false as const,
        backend,
        reason,
        skipped: true as const,
        unsupported: isUnsupportedWarmupError(error),
        error,
      };
    })
    .finally(() => {
      inFlightWarmups.delete(backend);
    });

  inFlightWarmups.set(backend, promise);
  return promise;
}

export function useAgentWarmup(): (
  target: WarmupTarget | undefined,
  reason: AgentWarmupReason
) => Promise<AgentWarmupResult> {
  return useCallback((target, reason) => warmupAgent(target, reason), []);
}

export function clearAgentWarmupCacheForTest(): void {
  inFlightWarmups.clear();
}
