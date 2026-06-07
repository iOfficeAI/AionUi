/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { CHISL_QUEUE_DB_FILENAME, resolveChislQueueDbPath } from './paths';
export { initChislQueueSchema, CHISL_QUEUE_TABLES } from './schema';
export {
  openChislQueueStore,
  createChislQueueItem,
  getChislQueueItem,
  listChislQueueItems,
  listNonTerminalChislQueueItems,
  updateChislQueueItem,
  upsertChislQueueItem,
  deleteChislQueueItem,
  type ChislQueueStore,
} from './repository';
export {
  DEFAULT_CHISL_QUEUE_GLOBAL_CONCURRENCY,
  DEFAULT_CHISL_QUEUE_MAX_RETRIES,
  isChislQueueTerminalStatus,
  isChislQueueActiveStatus,
  isPermissionReplyCommandBlocked,
  createDefaultChislQueueItemFields,
  canTransitionChislQueueStatus,
  applyChislQueueStatusTransition,
  getSessionActiveItem,
  hasBlockingSameSessionItem,
  isSameSessionDispatchable,
  listGloballyDispatchableItems,
  classifyChislQueueRetryError,
  shouldRetryChislQueueItem,
  applyChislQueueRetry,
  cancelChislQueueItem,
  bootstrapChislQueueRecovery,
  rowToChislQueueItem,
  chislQueueItemToRow,
  type ChislQueueDispatchErrorInput,
  type ChislQueueRetryErrorKind,
} from './stateMachine';
export type {
  ChislQueueItemStatus,
  ChislQueueCommandType,
  ChislQueueItemRow,
  ChislQueueItemCreate,
  ChislQueueItemUpdate,
  ChislQueueItem,
  ChislQueueDispatchabilityOptions,
  ChislQueueRetryClassification,
  ChislQueueCancelResult,
  ChislQueueRecoveryBootstrapInput,
  ChislQueueRecoveryBootstrapResult,
} from './types';
export { CHISL_QUEUE_ACTIVE_STATUSES, CHISL_QUEUE_TERMINAL_STATUSES, CHISL_QUEUE_NON_TERMINAL_STATUSES } from './types';
