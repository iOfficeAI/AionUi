/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 *
 * Official install guidance for supported-but-not-detected agents. When the
 * Agent settings detection page reports an agent as "missing" (not installed),
 * we surface a one-click copy of its official install command plus a link to the
 * official docs, so users don't have to leave the app and search.
 *
 * Install commands are the vendor-published installers. Backends without a
 * confidently-pinned command are intentionally omitted from this table — they
 * simply fall back to "docs link only" behaviour (the docs URL is always
 * supplied here) rather than risking a wrong command.
 */

import type { AgentPlatform } from './agentInstallPlatform';

export type AgentInstallCommands = Record<AgentPlatform, string>;

export type AgentInstallGuidance = {
  backend: string;
  commands: AgentInstallCommands;
  docsUrl: string;
};

/**
 * backend → install guidance. npm-based installs work identically on macOS,
 * Linux and Windows (the package manager resolves the platform), so the three
 * commands are the same global install. Kept as per-platform values so a future
 * native installer can differ by OS without changing call sites.
 */
export const AGENT_INSTALL_GUIDANCE: Record<string, AgentInstallGuidance> = {
  claude: {
    backend: 'claude',
    commands: {
      macos: 'npm install -g @anthropic-ai/claude-code',
      linux: 'npm install -g @anthropic-ai/claude-code',
      windows: 'npm install -g @anthropic-ai/claude-code',
    },
    docsUrl: 'https://docs.anthropic.com/en/docs/claude-code/setup',
  },
  codex: {
    backend: 'codex',
    commands: {
      macos: 'npm install -g @openai/codex',
      linux: 'npm install -g @openai/codex',
      windows: 'npm install -g @openai/codex',
    },
    docsUrl: 'https://github.com/openai/codex',
  },
  gemini: {
    backend: 'gemini',
    commands: {
      macos: 'npm install -g @google/gemini-cli',
      linux: 'npm install -g @google/gemini-cli',
      windows: 'npm install -g @google/gemini-cli',
    },
    docsUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  qwen: {
    backend: 'qwen',
    commands: {
      macos: 'npm install -g qwen-code',
      linux: 'npm install -g qwen-code',
      windows: 'npm install -g qwen-code',
    },
    docsUrl: 'https://github.com/QwenLM/qwen-code',
  },
};

/** Resolve install guidance for an agent backend, or `undefined` when unknown. */
export const getAgentInstallGuidance = (backend?: string | null): AgentInstallGuidance | undefined => {
  if (!backend) return undefined;
  return AGENT_INSTALL_GUIDANCE[backend];
};

/** Pick the install command for the current platform. */
export const getAgentInstallCommand = (guidance: AgentInstallGuidance, platform: AgentPlatform): string => {
  return guidance.commands[platform];
};
