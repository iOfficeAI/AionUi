/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 统一的 Agent Logo 工具
 * Unified Agent Logo utility
 *
 * Logo 真值由后端 `/api/agents/logos` 提供（投影自 agent_metadata.icon）。
 * 前端不再维护任何 backend -> 资源路径的硬编码映射。
 *
 * 使用方式：组件用 {@link useAgentLogos} 取得 `backend -> url` 映射，再用纯函数
 * {@link resolveAgentLogo} 解析。非组件的工具函数应把映射作为参数传入。
 *
 * Logo truth lives in the backend (`/api/agents/logos`, projected from
 * `agent_metadata.icon`); the frontend owns no path map. Components read the
 * `backend -> url` map via {@link useAgentLogos} and resolve with the pure
 * {@link resolveAgentLogo}; non-React utilities receive the map as an argument.
 */

import { ipcBridge } from '@/common';
import { resolveBackendAssetUrl } from '@/renderer/utils/platform';
import useSWR from 'swr';

export type AgentLogoEntry = {
  backend: string;
  logo: string;
};

/** Map of lowercased backend id -> logo URL. */
export type AgentLogoMap = Record<string, string>;

export const AGENT_LOGOS_SWR_KEY = 'agents.logos';

const OPEN_CODE_LIGHT_FILE_NAME = 'opencode-light.svg';
const OPEN_CODE_DARK_FILE_NAME = 'opencode-dark.svg';

/** Shared fetcher for the backend logo catalog, keyed into a backend->url map. */
export async function fetchAgentLogos(): Promise<AgentLogoMap> {
  try {
    const entries = await ipcBridge.acpConversation.getAgentLogos.invoke();
    if (Array.isArray(entries)) {
      const map: AgentLogoMap = {};
      for (const entry of entries as AgentLogoEntry[]) {
        if (entry?.backend && entry.logo) {
          map[entry.backend.toLowerCase()] = entry.logo;
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

function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return false;
}

function applyThemeVariant(logo: string): string {
  if (!isDarkTheme()) return logo;
  if (!logo.endsWith(OPEN_CODE_LIGHT_FILE_NAME)) return logo;
  return logo.replace(new RegExp(`${OPEN_CODE_LIGHT_FILE_NAME}$`), OPEN_CODE_DARK_FILE_NAME);
}

function normalizeLogoUrl(logo: string): string {
  return applyThemeVariant(resolveBackendAssetUrl(logo) ?? logo);
}

function lookupBackendLogo(logos: AgentLogoMap, backend: string | undefined | null): string | null {
  if (!backend || typeof backend !== 'string') return null;
  const logo = logos?.[backend.toLowerCase()];
  return logo ? normalizeLogoUrl(logo) : null;
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
