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

import AuggieLogo from '@/renderer/assets/logos/brand/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/ai-major/claude.svg';
import CursorLogo from '@/renderer/assets/logos/tools/coding/cursor.png';
import CodeBuddyLogo from '@/renderer/assets/logos/tools/coding/codebuddy.svg';
import CodexLogo from '@/renderer/assets/logos/tools/coding/codex.svg';
import DroidLogo from '@/renderer/assets/logos/brand/droid.svg';
import GeminiLogo from '@/renderer/assets/logos/ai-major/gemini.svg';
import GitHubLogo from '@/renderer/assets/logos/tools/github.svg';
import GooseLogo from '@/renderer/assets/logos/tools/goose.svg';
import IflowLogo from '@/renderer/assets/logos/tools/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/ai-china/kimi.svg';
import MistralLogo from '@/renderer/assets/logos/ai-major/mistral.svg';
import NanobotLogo from '@/renderer/assets/logos/tools/nanobot.svg';
import OpenClawLogo from '@/renderer/assets/logos/tools/openclaw.svg';
import OpenCodeLogoDark from '@/renderer/assets/logos/tools/coding/opencode-dark.svg';
import OpenCodeLogoLight from '@/renderer/assets/logos/tools/coding/opencode-light.svg';
import QoderLogo from '@/renderer/assets/logos/tools/coding/qoder.png';
import QwenLogo from '@/renderer/assets/logos/ai-china/qwen.svg';

/**
 * Agent Logo 映射表
 * Agent Logo mapping table
 *
 * 注意：key 使用小写，支持多种变体（如 openclaw-gateway 和 openclaw）
 * Note: keys are lowercase, supports multiple variants (e.g., openclaw-gateway and openclaw)
 */
const AGENT_LOGO_MAP = {
  claude: ClaudeLogo,
  gemini: GeminiLogo,
  qwen: QwenLogo,
  iflow: IflowLogo,
  codex: CodexLogo,
  codebuddy: CodeBuddyLogo,
  droid: DroidLogo,
  goose: GooseLogo,
  auggie: AuggieLogo,
  kimi: KimiLogo,
  opencode: OpenCodeLogoLight,
  copilot: GitHubLogo,
  openclaw: OpenClawLogo,
  'openclaw-gateway': OpenClawLogo,
  vibe: MistralLogo,
  nanobot: NanobotLogo,
  remote: OpenClawLogo,
  qoder: QoderLogo,
  cursor: CursorLogo,
} as const satisfies Record<string, string>;

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
  if (!agent) return null;
  const key = agent.toLowerCase() as keyof typeof AGENT_LOGO_MAP;
  if (key === 'opencode') {
    return isDarkTheme() ? OpenCodeLogoDark : OpenCodeLogoLight;
  }
  return AGENT_LOGO_MAP[key] || null;
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
 * @param selectedValue - Selected model value
 * @param selectedLabel - Selected model label
 * @param defaultModelLabel - Label to use for default models
 * @param fallbackLabel - Label to use when no label is available
 * @returns The computed display label
 */
export const getModelDisplayLabel = ({
  selectedValue,
  selectedLabel,
  defaultModelLabel,
  fallbackLabel,
}: {
  selectedValue?: string | null;
  selectedLabel?: string | null;
  defaultModelLabel: string;
  fallbackLabel: string;
}): string => {
  if (!selectedLabel) return fallbackLabel;
  return isDefaultModel(selectedValue, selectedLabel) ? defaultModelLabel : selectedLabel;
};
