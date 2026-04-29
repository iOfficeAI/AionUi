/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */


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
}

/**
 * Build system instructions (preset context + team guide only). Skills are
 * delivered via backend materialization + filesystem, not inlined.
 */
export function buildSystemInstructions(config: FirstMessageConfig): string | undefined {
  if (config.preset_context) {
    return config.preset_context;
  }
  return undefined;
}

/** Inject system instructions for the first message of a conversation. */
export function prepareFirstMessage(content: string, config: FirstMessageConfig): string {
  const systemInstructions = buildSystemInstructions(config);

  if (!systemInstructions) {
    return content;
  }

  return `[Assistant Rules - You MUST follow these instructions]\n${systemInstructions}\n\n[User Request]\n${content}`;
}
