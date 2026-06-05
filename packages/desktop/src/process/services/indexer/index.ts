/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { CHISL_INDEX_DB_FILENAME, resolveChislIndexDbPath } from './paths';
export { initChislIndexSchema, CHISL_INDEX_TABLES } from './schema';
export {
  openChislIndexStore,
  upsertFile,
  getFile,
  listFiles,
  deleteFile,
  replaceChunksForFile,
  listChunksForFile,
  replaceSymbolsForFile,
  listSymbolsForFile,
  upsertEmbedding,
  listEmbeddingsForChunk,
  createIndexJob,
  getIndexJob,
  updateIndexJob,
  listIndexJobs,
  type ChislIndexStore,
} from './repository';
export { serializeVector, deserializeVector } from './vectors';
export type {
  IndexFileRow,
  IndexFileUpsert,
  IndexChunkRow,
  IndexChunkInput,
  IndexSymbolRow,
  IndexSymbolInput,
  IndexSymbolKind,
  IndexEmbeddingRow,
  IndexEmbeddingInput,
  IndexJobRow,
  IndexJobCreate,
  IndexJobUpdate,
  IndexJobKind,
  IndexJobStatus,
} from './types';
export { shouldIgnoreIndexPath, toWorkspaceRelativePath, type IndexIgnoreOptions } from './ignore';
export { hashFileContent, computeFileContentHash, CONTENT_HASH_ALGORITHM } from './contentHash';
export { createDebouncedBatch, type DebouncedBatch } from './debounce';
export {
  processFileChangeEvents,
  scheduleFileReindexIfChanged,
  scheduleFileDeleteInvalidation,
  type FileChangeEvent,
  type IndexInvalidationOptions,
} from './invalidation';
export {
  runStartupIndexScan,
  type StartupScanResult,
} from './startupScan';
export {
  ChislIndexWatcher,
  type ChislIndexWatcherOptions,
  type ChislIndexWatcherEvents,
  type RawWatcherEvent,
} from './watcher';
