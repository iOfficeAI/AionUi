/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ExternalSessionProvider = 'codex' | 'openclaw-gateway';

export type ExternalSessionSummary = {
  provider: ExternalSessionProvider;
  sessionId: string;
  title: string;
  workspace: string;
  updatedAt: number;
  origin?: string;
  modelProvider?: string;
  model?: string;
  reasoningEffort?: string;
};

export type ImportExternalSessionParams = {
  provider: ExternalSessionProvider;
  sessionId: string;
};
