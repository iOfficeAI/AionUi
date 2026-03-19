/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Unified reader for external CLI agent session histories.
 * Aggregates sessions from all supported backends and sorts by recency.
 */

import { listClaudeCodeSessions } from './ClaudeCodeParser';
import { listCodexSessions } from './CodexParser';
import type { ExternalSessionInfo } from './types';

/**
 * List all external sessions from all supported CLI backends.
 * Results are sorted by updatedAt descending (most recent first).
 */
export async function listAllExternalSessions(): Promise<ExternalSessionInfo[]> {
  const [claudeSessions, codexSessions] = await Promise.all([
    listClaudeCodeSessions().catch((): ExternalSessionInfo[] => []),
    listCodexSessions().catch((): ExternalSessionInfo[] => []),
  ]);

  const all = [...claudeSessions, ...codexSessions];
  all.sort((a, b) => b.updatedAt - a.updatedAt);
  return all;
}
