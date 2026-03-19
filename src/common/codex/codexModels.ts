/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Default Codex model list maintained by AionUi.
 * These are known models that Codex CLI supports.
 * Validation is done by Codex CLI itself — AionUi only passes the model name.
 *
 * The first entry is used as the default when the user hasn't made a selection.
 */
export const DEFAULT_CODEX_MODELS: Array<{ id: string; label: string; description: string }> = [
  { id: 'gpt-5.3-codex', label: 'gpt-5.3-codex', description: 'Latest frontier agentic coding model' },
  { id: 'gpt-5.4', label: 'gpt-5.4', description: 'Latest frontier agentic coding model' },
  { id: 'gpt-5.2-codex', label: 'gpt-5.2-codex', description: 'Frontier agentic coding model' },
  {
    id: 'gpt-5.1-codex-max',
    label: 'gpt-5.1-codex-max',
    description: 'Codex-optimized flagship for deep and fast reasoning',
  },
  {
    id: 'gpt-5.2',
    label: 'gpt-5.2',
    description: 'Latest frontier model with improvements across knowledge, reasoning and coding',
  },
  {
    id: 'gpt-5.1-codex-mini',
    label: 'gpt-5.1-codex-mini',
    description: 'Optimized for codex. Cheaper, faster, but less capable',
  },
];

/** The default model ID (first entry in the list) */
export const DEFAULT_CODEX_MODEL_ID = DEFAULT_CODEX_MODELS[0].id;
