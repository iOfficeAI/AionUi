/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Re-export shared types and define process-only types.
 */

export type { ExternalSessionBackend, ExternalSessionInfo, ImportSessionResult } from '@/common/externalHistoryTypes';

/** Internal message format used only by parsers in the main process. */
export type ExternalMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
};

/** Result from parsing an external session, includes workspace for grouping. */
export type ExternalParseResult = {
  messages: ExternalMessage[];
  workspace: string;
  /** Original session title from the CLI backend. */
  name: string;
};
