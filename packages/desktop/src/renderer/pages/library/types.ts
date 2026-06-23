/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type LibraryFileType = 'doc' | 'slide' | 'sheet' | 'image' | 'code' | 'html';

export interface LibraryFile {
  name: string;
  ext: string;
  size: string;
  path: string; // absolute path on disk
}

export interface LibraryAsset {
  id: string;
  conversationId: string;
  conversationName: string;
  /** Display name: custom agent name or backend id */
  agent: string;
  /** Underlying backend id (e.g. "claude", "codex") — used for logo lookup */
  agentBackend: string;
  prompt: string;
  createdAt: number;
  updatedAt: number;
  files: LibraryFile[];
}

export type LibraryViewMode = 'conversation' | 'file' | 'file2' | 'file3' | 'list';
