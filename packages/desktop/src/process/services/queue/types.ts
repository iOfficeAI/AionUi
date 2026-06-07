/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type ChislQueueItemStatus =
  | 'queued'
  | 'dispatching'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'complete';

export type ChislQueueCommandType = 'create_session' | 'prompt' | 'abort' | 'delete_session' | 'permission_reply';

export const CHISL_QUEUE_ACTIVE_STATUSES: readonly ChislQueueItemStatus[] = [
  'dispatching',
  'running',
  'blocked',
] as const;

export const CHISL_QUEUE_TERMINAL_STATUSES: readonly ChislQueueItemStatus[] = [
  'failed',
  'cancelled',
  'complete',
] as const;

export const CHISL_QUEUE_NON_TERMINAL_STATUSES: readonly ChislQueueItemStatus[] = [
  'queued',
  'dispatching',
  'running',
  'blocked',
] as const;

export type ChislQueueItemRow = {
  id: string;
  session_id: string | null;
  message_id: string | null;
  command_type: ChislQueueCommandType;
  payload_json: string;
  session_order: number;
  status: ChislQueueItemStatus;
  created_at: number;
  updated_at: number;
  dispatched_at: number | null;
  completed_at: number | null;
  retry_count: number;
  max_retries: number;
  last_error: string | null;
  cancelled_by: string | null;
  cancelled_at: number | null;
  parent_id: string | null;
  metadata_json: string | null;
};

export type ChislQueueItemCreate = {
  id?: string;
  session_id?: string | null;
  message_id?: string | null;
  command_type: ChislQueueCommandType;
  payload: unknown;
  session_order?: number;
  status?: ChislQueueItemStatus;
  max_retries?: number;
  parent_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type ChislQueueItemUpdate = {
  session_id?: string | null;
  message_id?: string | null;
  status?: ChislQueueItemStatus;
  dispatched_at?: number | null;
  completed_at?: number | null;
  retry_count?: number;
  max_retries?: number;
  last_error?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type ChislQueueItem = {
  id: string;
  sessionID: string | null;
  messageID: string | null;
  commandType: ChislQueueCommandType;
  payload: unknown;
  sessionOrder: number;
  status: ChislQueueItemStatus;
  createdAt: number;
  updatedAt: number;
  dispatchedAt: number | null;
  completedAt: number | null;
  retryCount: number;
  maxRetries: number;
  lastError: string | null;
  cancelledBy: string | null;
  cancelledAt: number | null;
  parentID: string | null;
  metadata: Record<string, unknown> | null;
};

export type ChislQueueDispatchabilityOptions = {
  globalConcurrencyLimit?: number;
};

export type ChislQueueRetryErrorKind =
  | 'network'
  | 'server_5xx'
  | 'rate_limited'
  | 'dispatch_timeout'
  | 'transient_busy'
  | 'client_4xx'
  | 'validation'
  | 'session_not_found'
  | 'permission_denied'
  | 'explicit_rejection'
  | 'retries_exhausted'
  | 'unknown';

export type ChislQueueRetryClassification = {
  retryable: boolean;
  kind: ChislQueueRetryErrorKind;
};

export type ChislQueueCancelResult =
  | { outcome: 'cancelled_locally'; item: ChislQueueItem }
  | { outcome: 'abort_enqueued'; item: ChislQueueItem; abortItem: ChislQueueItem };

export type ChislQueueRecoveryBootstrapInput = {
  items: readonly ChislQueueItem[];
  sessionStatusKnownIds?: ReadonlySet<string>;
};

export type ChislQueueRecoveryBootstrapResult = {
  nonTerminalItems: ChislQueueItem[];
  dispatchableIds: string[];
  needsStatusReconciliation: ChislQueueItem[];
  absentFromSessionStatusNotCompleted: ChislQueueItem[];
};
