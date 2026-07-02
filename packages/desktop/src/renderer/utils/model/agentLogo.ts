/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 统一的 Agent Logo 工具
 * Unified Agent Logo utility
 *
 * Logo 真值由后端 `/api/agents/management` 提供（投影自 agent_metadata.icon/avatar）。
 * 前端不再维护任何 backend -> 资源路径的硬编码映射。
 *
 * 使用方式：组件用 {@link useAgentLogos} 取得 `backend -> url` 映射，再用纯函数
 * {@link resolveAgentLogo} 解析。非组件的工具函数应把映射作为参数传入。
 *
 * Logo truth lives in the backend (`/api/agents/management`, projected from
 * `agent_metadata.icon/avatar`); the frontend owns no path map. Components read the
 * `backend -> url` map via {@link useAgentLogos} and resolve with the pure
 * {@link resolveAgentLogo}; non-React utilities receive the map as an argument.
 */

import { ipcBridge } from '@/common';
import type { AssistantAvatar } from '@/renderer/utils/model/assistantAvatar';
import {
  isBackendRelativeAssetPath,
  isLikelyLocalFilePath,
  resolveAssistantAvatar,
} from '@/renderer/utils/model/assistantAvatar';
import type { ManagedAgent } from '@/renderer/utils/model/agentTypes';
import { resolveBackendAssetUrl } from '@/renderer/utils/platform';
import useSWR from 'swr';

/** Map of lowercased backend id -> logo URL. */
export type AgentLogoMap = Record<string, string>;

export const AGENT_LOGOS_SWR_KEY = 'agents.logos';

function collectManagedAgentLogoKeys(agent: ManagedAgent): string[] {
  const keys = [agent.backend, agent.agent_type, agent.id, agent.custom_agent_id];
  return keys
    .filter((key): key is string => typeof key === 'string' && key.trim().length > 0)
    .map((key) => key.trim().toLowerCase())
    .filter((key, index, values) => values.indexOf(key) === index);
}

/** Shared fetcher for the backend management catalog, keyed into a backend->url map. */
export async function fetchAgentLogos(): Promise<AgentLogoMap> {
  try {
    const agents = await ipcBridge.acpConversation.getManagedAgents.invoke();
    if (Array.isArray(agents)) {
      const map: AgentLogoMap = {};
      for (const agent of agents as ManagedAgent[]) {
        const logo = agent.avatar || agent.icon;
        if (!logo) continue;

        for (const key of collectManagedAgentLogoKeys(agent)) {
          map[key] = logo;
        }
      }
      return map;
    }
  } catch {
    // fall through to empty map
  }
  return {};
}

/**
 * Subscribe to the backend logo catalog. SWR dedups across subscribers, so a
 * single network request warms a shared cache and every consumer re-renders
 * once it hydrates.
 */
export function useAgentLogos(): AgentLogoMap {
  const { data } = useSWR(AGENT_LOGOS_SWR_KEY, fetchAgentLogos, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  return data ?? {};
}

function normalizeLogoUrl(logo: string): string | null {
  const value = logo.trim();
  if (!value || isLikelyLocalFilePath(value)) return null;
  if (value.startsWith('/') && !isBackendRelativeAssetPath(value)) return null;

  const resolved = resolveBackendAssetUrl(value) ?? value;
  const isImage = /\.(svg|png|jpe?g|webp|gif)$/i.test(resolved) || /^(https?:|data:|\/)/i.test(resolved);
  return isImage ? resolved : null;
}

function lookupBackendLogoValue(logos: AgentLogoMap, backend: string | undefined | null): string | null {
  if (!backend || typeof backend !== 'string') return null;
  return logos?.[backend.toLowerCase()] ?? null;
}

function lookupBackendLogo(logos: AgentLogoMap, backend: string | undefined | null): string | null {
  const logo = lookupBackendLogoValue(logos, backend);
  return logo ? normalizeLogoUrl(logo) : null;
}

function lookupBackendAvatar(logos: AgentLogoMap, backend: string | undefined | null): AssistantAvatar {
  const logo = lookupBackendLogoValue(logos, backend);
  return resolveAssistantAvatar(logo || undefined);
}

/**
 * Resolve the best available logo for an agent from the backend logo catalog.
 *
 * Pure — pass the map from {@link useAgentLogos}. Priority:
 *   1. Explicit icon/avatar (if provided)
 *   2. Adapter ID from custom_agent_id (`ext:extensionName:adapterId`) → catalog
 *   3. Backend ID → catalog
 *   4. null (caller renders its own fallback)
 */
export function resolveAgentLogo(
  logos: AgentLogoMap,
  opts: {
    icon?: string | null;
    backend?: string | null;
    custom_agent_id?: string | null;
    isExtension?: boolean;
  }
): string | null {
  if (opts.icon) return normalizeLogoUrl(opts.icon);

  if (opts.isExtension && opts.custom_agent_id) {
    const adapterId = opts.custom_agent_id.split(':').pop();
    const logo = lookupBackendLogo(logos, adapterId);
    if (logo) return logo;
  }

  return lookupBackendLogo(logos, opts.backend);
}

export function resolveAgentAvatar(
  logos: AgentLogoMap,
  opts: {
    icon?: string | null;
    backend?: string | null;
    custom_agent_id?: string | null;
    isExtension?: boolean;
  }
): AssistantAvatar {
  const explicitAvatar = resolveAssistantAvatar(opts.icon || undefined);
  if (explicitAvatar.kind !== 'fallback') return explicitAvatar;

  if (opts.isExtension && opts.custom_agent_id) {
    const adapterId = opts.custom_agent_id.split(':').pop();
    const adapterAvatar = lookupBackendAvatar(logos, adapterId);
    if (adapterAvatar.kind !== 'fallback') return adapterAvatar;
  }

  return lookupBackendAvatar(logos, opts.backend);
}

/**
 * Check if a model value/label indicates it's a default/recommended model
 * 检查模型值/标签是否表示默认/推荐模型
 */
export const isDefaultModel = (value?: string | null, label?: string | null): boolean => {
  const text = `${value || ''} ${label || ''}`.toLowerCase();
  return text.includes('default') || text.includes('recommended') || text.includes('默认');
};

/**
 * Get display label for a model, with fallback handling
 * 获取模型的显示标签，带回退处理
 */
export const getModelDisplayLabel = ({
  selected_value: _selected_value,
  selectedLabel,
  defaultModelLabel: _defaultModelLabel,
  fallbackLabel,
}: {
  selected_value?: string | null;
  selectedLabel?: string | null;
  defaultModelLabel: string;
  fallbackLabel: string;
}): string => {
  if (!selectedLabel) return fallbackLabel;
  return selectedLabel;
};
