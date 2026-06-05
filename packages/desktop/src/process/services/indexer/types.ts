/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type IndexSymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'const'
  | 'method'
  | 'struct'
  | 'enum'
  | 'rule';

export type IndexJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type IndexJobKind = 'full_workspace' | 'file' | 'embedding';

export type IndexFileRow = {
  id: number;
  path: string;
  workspace_root: string;
  content_hash: string | null;
  mtime_ms: number | null;
  size_bytes: number | null;
  language: string | null;
  indexed_at: number | null;
  created_at: number;
  updated_at: number;
};

export type IndexFileUpsert = {
  path: string;
  workspace_root: string;
  content_hash?: string | null;
  mtime_ms?: number | null;
  size_bytes?: number | null;
  language?: string | null;
  indexed_at?: number | null;
};

export type IndexChunkRow = {
  id: number;
  file_id: number;
  chunk_index: number;
  start_line: number;
  end_line: number;
  start_offset: number;
  end_offset: number;
  content_hash: string | null;
  created_at: number;
};

export type IndexChunkInput = {
  chunk_index: number;
  start_line: number;
  end_line: number;
  start_offset: number;
  end_offset: number;
  content_hash?: string | null;
};

export type IndexSymbolRow = {
  id: number;
  file_id: number;
  kind: IndexSymbolKind;
  name: string;
  line: number;
  created_at: number;
};

export type IndexSymbolInput = {
  kind: IndexSymbolKind;
  name: string;
  line: number;
};

export type IndexEmbeddingRow = {
  id: number;
  chunk_id: number;
  model: string;
  dimensions: number;
  vector: Buffer;
  created_at: number;
  updated_at: number;
};

export type IndexEmbeddingInput = {
  chunk_id: number;
  model: string;
  vector: Float32Array;
};

export type IndexJobRow = {
  id: number;
  kind: IndexJobKind;
  status: IndexJobStatus;
  workspace_root: string | null;
  file_path: string | null;
  progress: number;
  error_message: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
};

export type IndexJobCreate = {
  kind: IndexJobKind;
  workspace_root?: string | null;
  file_path?: string | null;
  metadata_json?: string | null;
};

export type IndexJobUpdate = {
  status?: IndexJobStatus;
  progress?: number;
  error_message?: string | null;
  metadata_json?: string | null;
  started_at?: number | null;
  finished_at?: number | null;
};
