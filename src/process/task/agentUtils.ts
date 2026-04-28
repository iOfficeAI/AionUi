/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { getTeamGuidePrompt } from '@process/team/prompts/teamGuidePrompt.ts';
import { resolveLeaderAssistantLabel } from '@process/team/prompts/teamGuideAssistant.ts';

/**
 * First message processing configuration.
 *
 * Skill discovery and injection moved into the Rust backend's
 * `first_message_injector` in PR #2668 — the renderer no longer needs to
 * compute or carry skill lists on a per-message basis.
 */
export interface FirstMessageConfig {
  /** Preset context / rules string. */
  preset_context?: string;
  /** Inject Team mode guidance prompt when agent has aion_create_team capability */
  enableTeamGuide?: boolean;
  /** Agent backend type (e.g. 'claude', 'codex') — used to populate team guide prompt */
  backend?: string;
  /**
   * Preset assistant id backing this conversation (e.g. 'builtin-word-creator').
   * When set, the team guide prompt shows the assistant's display name on the
   * Leader row instead of the raw backend key.
   */
  preset_assistant_id?: string;
}

/**
 * Build system instructions (preset context + team guide only). Skills are
 * delivered via backend materialization + filesystem, not inlined.
 */
export async function buildSystemInstructions(config: FirstMessageConfig): Promise<string | undefined> {
  const instructions: string[] = [];

  if (config.preset_context) {
    instructions.push(config.preset_context);
  }

  if (config.enableTeamGuide) {
    const leaderLabel = await resolveLeaderAssistantLabel(config.preset_assistant_id);
    instructions.push(getTeamGuidePrompt({ backend: config.backend, leaderLabel }));
  }

  if (instructions.length === 0) {
    return undefined;
  }

  return instructions.join('\n\n');
}

/** Inject system instructions for the first message of a conversation. */
export async function prepareFirstMessage(content: string, config: FirstMessageConfig): Promise<string> {
  const systemInstructions = await buildSystemInstructions(config);

  if (!systemInstructions) {
    return content;
  }

  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}
