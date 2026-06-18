/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * 统一的 Agent Logo 映射工具
 * Unified Agent Logo mapping utility
 *
 * 所有需要显示 agent 图标的地方都应该使用这个工具，而不是各自维护列表
 * All places that need to display agent icons should use this utility instead of maintaining separate lists
 */

import { resolveBackendAssetUrl } from '@/renderer/utils/platform';

/**
 * Agent Logo 映射表
 * Agent Logo mapping table
 *
 * 注意：key 使用小写，支持多种变体（如 openclaw-gateway 和 openclaw）
 * Note: keys are lowercase, supports multiple variants (e.g., openclaw-gateway and openclaw)
 */
const AGENT_LOGO_PATH_MAP = {
  aionrs: 'brand/aion.svg',
  claude: 'ai-major/claude.svg',
  gemini: 'ai-major/gemini.svg',
  qwen: 'ai-china/qwen.svg',
  codex: 'tools/coding/codex.svg',
  codebuddy: 'tools/coding/codebuddy.svg',
  droid: 'brand/droid.svg',
  goose: 'tools/goose.svg',
  hermes: 'brand/hermes.svg',
  snow: 'tools/coding/snow.png',
  auggie: 'brand/auggie.svg',
  kimi: 'ai-china/kimi.svg',
  opencode: 'tools/coding/opencode-light.svg',
  'opencode-dark': 'tools/coding/opencode-dark.svg',
  copilot: 'tools/github.svg',
  openclaw: 'tools/openclaw.svg',
  'openclaw-gateway': 'tools/openclaw.svg',
  vibe: 'ai-major/mistral.svg',
  nanobot: 'tools/nanobot.svg',
  remote: 'tools/openclaw.svg',
  qoder: 'tools/coding/qoder.png',
  cursor: 'tools/coding/cursor.png',
} as const satisfies Record<string, string>;

const OPEN_CODE_LIGHT_FILE_NAME = 'opencode-light.svg';
const OPEN_CODE_DARK_FILE_NAME = 'opencode-dark.svg';

function buildAssetUrl(path: string): string {
  return resolveBackendAssetUrl(`/api/assets/logos/${path}`) ?? `/api/assets/logos/${path}`;
}

function applyThemeVariant(logo: string): string {
  if (!isDarkTheme()) return logo;
  if (!logo.endsWith(OPEN_CODE_LIGHT_FILE_NAME)) return logo;
  return logo.replace(new RegExp(`${OPEN_CODE_LIGHT_FILE_NAME}$`), OPEN_CODE_DARK_FILE_NAME);
}

function normalizeLogoUrl(logo: string): string {
  return applyThemeVariant(resolveBackendAssetUrl(logo) ?? logo);
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

/**
 * 根据 agent 名称获取对应的 logo
 * Get agent logo by agent name
 *
 * @param agent - Agent 名称（不区分大小写）/ Agent name (case-insensitive)
 * @returns Logo 路径，如果不存在则返回 null / Logo path, or null if not found
 */
export function getAgentLogo(agent: string | undefined | null): string | null {
  if (!agent || typeof agent !== 'string') return null;
  const key = agent.toLowerCase() as keyof typeof AGENT_LOGO_PATH_MAP;
  const path = AGENT_LOGO_PATH_MAP[key];
  return path ? normalizeLogoUrl(buildAssetUrl(path)) : null;
}

/**
 * Resolve the best available logo for an agent.
 *
 * Priority:
 *   1. Explicit icon/avatar (if provided)
 *   2. Adapter ID from custom_agent_id (format `ext:extensionName:adapterId`) → built-in logo map
 *   3. Backend ID → built-in logo map
 *   4. null (caller renders its own fallback)
 */
export function resolveAgentLogo(opts: {
  icon?: string | null;
  backend?: string | null;
  custom_agent_id?: string | null;
  isExtension?: boolean;
}): string | null {
  if (opts.icon) return normalizeLogoUrl(opts.icon);

  // For extension agents, extract adapter ID from custom_agent_id
  if (opts.isExtension && opts.custom_agent_id) {
    const adapterId = opts.custom_agent_id.split(':').pop();
    const logo = getAgentLogo(adapterId);
    if (logo) return logo;
  }

  return getAgentLogo(opts.backend);
}

/**
 * 检查 agent 是否有对应的 logo
 * Check if agent has a corresponding logo
 *
 * @param agent - Agent 名称（不区分大小写）/ Agent name (case-insensitive)
 * @returns 是否存在对应的 logo / Whether the agent has a corresponding logo
 */
export function hasAgentLogo(agent: string | undefined | null): boolean {
  return getAgentLogo(agent) !== null;
}

/**
 * Check if a model value/label indicates it's a default/recommended model
 * 检查模型值/标签是否表示默认/推荐模型
 *
 * @param value - Model value
 * @param label - Model label
 * @returns true if the model is marked as default/recommended
 */
export const isDefaultModel = (value?: string | null, label?: string | null): boolean => {
  const text = `${value || ''} ${label || ''}`.toLowerCase();
  return text.includes('default') || text.includes('recommended') || text.includes('默认');
};

/**
 * Get display label for a model, with fallback handling
 * 获取模型的显示标签，带回退处理
 *
 * @param selected_value - Selected model value
 * @param selectedLabel - Selected model label
 * @param defaultModelLabel - Label to use for default models
 * @param fallbackLabel - Label to use when no label is available
 * @returns The computed display label
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
