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

import AuggieLogo from '@/renderer/assets/logos/auggie.svg';
import ClaudeLogo from '@/renderer/assets/logos/claude.svg';
import CodeBuddyLogo from '@/renderer/assets/logos/codebuddy.svg';
import CodexLogo from '@/renderer/assets/logos/codex.svg';
import DroidLogo from '@/renderer/assets/logos/droid.svg';
import GeminiLogo from '@/renderer/assets/logos/gemini.svg';
import GitHubLogo from '@/renderer/assets/logos/github.svg';
import GooseLogo from '@/renderer/assets/logos/goose.svg';
import IflowLogo from '@/renderer/assets/logos/iflow.svg';
import KimiLogo from '@/renderer/assets/logos/kimi.svg';
import MistralLogo from '@/renderer/assets/logos/mistral.svg';
import NanobotLogo from '@/renderer/assets/logos/nanobot.svg';
import OpenClawLogo from '@/renderer/assets/logos/openclaw.svg';
import OpenCodeLogo from '@/renderer/assets/logos/opencode.svg';
import QoderLogo from '@/renderer/assets/logos/qoder.png';
import QwenLogo from '@/renderer/assets/logos/qwen.svg';

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
  opencode: OpenCodeLogo,
  copilot: GitHubLogo,
  openclaw: OpenClawLogo,
  'openclaw-gateway': OpenClawLogo,
  vibe: MistralLogo,
  nanobot: NanobotLogo,
  qoder: QoderLogo,
} as const satisfies Record<string, string>;

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
