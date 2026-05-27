/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { configService } from '@/common/config/configService';
import type { AcpSessionConfigOption } from '@/common/types/platform/acpTypes';
import { getAgentModes, type AgentModeOption } from '@/renderer/utils/model/agentModes';
import { useEffect, useMemo, useState } from 'react';

function extractModesFromConfigOptions(config_options: AcpSessionConfigOption[]): AgentModeOption[] {
  const modeOption = config_options.find((opt) => opt.category === 'mode' && opt.type === 'select' && opt.options);
  if (!modeOption?.options || modeOption.options.length === 0) return [];
  return modeOption.options.map((opt) => ({
    value: opt.value,
    label: opt.name || opt.label || opt.value,
  }));
}

/**
 * Resolves the available agent modes for a backend, in the same priority
 * order as `AgentModeSelector`: cached handshake modes → cached config
 * options (`category=mode`) → static `getAgentModes` fallback. Lets the
 * mobile action sheet enumerate modes without re-implementing the lookup.
 */
export const useAgentModesForBackend = (backend?: string): AgentModeOption[] => {
  const [cachedModes, setCachedModes] = useState<AgentModeOption[]>([]);

  useEffect(() => {
    if (!backend) {
      setCachedModes([]);
      return;
    }
    const sessionModes = configService.get('acp.cachedModes')?.[backend];
    if (sessionModes?.available_modes && sessionModes.available_modes.length > 0) {
      setCachedModes(
        sessionModes.available_modes.map((m) => ({
          value: m.id,
          label: m.name ?? m.id,
        }))
      );
      return;
    }
    const cached = configService.get('acp.cached_config_options')?.[backend];
    if (Array.isArray(cached)) {
      const modes = extractModesFromConfigOptions(cached as AcpSessionConfigOption[]);
      if (modes.length > 0) {
        setCachedModes(modes);
        return;
      }
    }
    setCachedModes([]);
  }, [backend]);

  return useMemo(() => {
    if (cachedModes.length > 0) return cachedModes;
    return getAgentModes(backend);
  }, [cachedModes, backend]);
};
