/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export const AGENT_VISIBILITY_CONFIG_KEY = 'agent.visibility' as const;

export type AgentVisibilityConfig = Record<string, boolean>;

export function isAgentVisible(backend: string, visibilityConfig?: AgentVisibilityConfig | null): boolean {
  return visibilityConfig?.[backend] !== false;
}
