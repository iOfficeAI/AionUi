/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import {
  CHISL_QUEUE_ACTIVE_STATUSES,
  CHISL_QUEUE_NON_TERMINAL_STATUSES,
  CHISL_QUEUE_TERMINAL_STATUSES,
  type ChislQueueCancelResult,
  type ChislQueueCommandType,
  type ChislQueueDispatchabilityOptions,
  type ChislQueueItem,
  type ChislQueueItemRow,
  type ChislQueueItemStatus,
  type ChislQueueRecoveryBootstrapInput,
  type ChislQueueRecoveryBootstrapResult,
  type ChislQueueRetryClassification,
  type ChislQueueRetryErrorKind,
} from './types';

export const DEFAULT_CHISL_QUEUE_GLOBAL_CONCURRENCY = 5;
export const DEFAULT_CHISL_QUEUE_MAX_RETRIES = 3;

export function isChislQueueTerminalStatus(status: ChislQueueItemStatus): boolean {
  return (CHISL_QUEUE_TERMINAL_STATUSES as readonly string[]).includes(status);
}

export function isChislQueueActiveStatus(status: ChislQueueItemStatus): boolean {
  return (CHISL_QUEUE_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function isPermissionReplyCommandBlocked(commandType: ChislQueueCommandType): boolean {
  return commandType === 'permission_reply';
}

export function createDefaultChislQueueItemFields(
  overrides: Partial<ChislQueueItem> & Pick<ChislQueueItem, 'commandType' | 'payload'>
): ChislQueueItem {
  const now = Date.now();
  return {
    id: overrides.id ?? randomUUID(),
    sessionID: overrides.sessionID ?? null,
    messageID: overrides.messageID ?? null,
    commandType: overrides.commandType,
    payload: overrides.payload,
    sessionOrder: overrides.sessionOrder ?? 0,
    status: overrides.status ?? 'queued',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    dispatchedAt: overrides.dispatchedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    retryCount: overrides.retryCount ?? 0,
    maxRetries: overrides.maxRetries ?? DEFAULT_CHISL_QUEUE_MAX_RETRIES,
    lastError: overrides.lastError ?? null,
    cancelledBy: overrides.cancelledBy ?? null,
    cancelledAt: overrides.cancelledAt ?? null,
    parentID: overrides.parentID ?? null,
    metadata: overrides.metadata ?? null,
  };
}

export function canTransitionChislQueueStatus(
  from: ChislQueueItemStatus,
  to: ChislQueueItemStatus
): boolean {
  if (from === to) {
    return true;
  }
  if (isChislQueueTerminalStatus(from)) {
    return false;
  }
  switch (from) {
    case 'queued':
      return to === 'dispatching' || to === 'cancelled' || to === 'failed';
    case 'dispatching':
      return (
        to === 'running' ||
        to === 'blocked' ||
        to === 'failed' ||
        to === 'cancelled' ||
        to === 'queued'
      );
    case 'running':
      return to === 'blocked' || to === 'complete' || to === 'failed' || to === 'cancelled';
    case 'blocked':
      return to === 'running' || to === 'complete' || to === 'failed' || to === 'cancelled';
    default:
      return false;
  }
}

export function applyChislQueueStatusTransition(
  item: ChislQueueItem,
  to: ChislQueueItemStatus,
  at = Date.now()
): ChislQueueItem {
  if (!canTransitionChislQueueStatus(item.status, to)) {
    throw new Error(`Invalid queue transition: ${item.status} -> ${to}`);
  }
  const next: ChislQueueItem = { ...item, status: to, updatedAt: at };
  if (to === 'dispatching' && next.dispatchedAt == null) {
    next.dispatchedAt = at;
  }
  if (isChislQueueTerminalStatus(to)) {
    next.completedAt = at;
  }
  if (to === 'queued' && item.status === 'dispatching') {
    next.dispatchedAt = null;
  }
  return next;
}

function sessionKey(sessionID: string | null): string {
  return sessionID ?? '__no_session__';
}

export function getSessionActiveItem(
  items: readonly ChislQueueItem[],
  sessionID: string | null
): ChislQueueItem | null {
  const key = sessionKey(sessionID);
  const active = items.filter(
    (item) => sessionKey(item.sessionID) === key && isChislQueueActiveStatus(item.status)
  );
  if (active.length === 0) {
    return null;
  }
  return active.reduce((lowest, item) => (item.sessionOrder < lowest.sessionOrder ? item : lowest));
}

export function hasBlockingSameSessionItem(
  items: readonly ChislQueueItem[],
  candidate: ChislQueueItem
): boolean {
  const key = sessionKey(candidate.sessionID);
  return items.some(
    (item) =>
      item.id !== candidate.id &&
      sessionKey(item.sessionID) === key &&
      item.sessionOrder < candidate.sessionOrder &&
      isChislQueueActiveStatus(item.status)
  );
}

export function isSameSessionDispatchable(
  items: readonly ChislQueueItem[],
  candidate: ChislQueueItem
): boolean {
  if (candidate.status !== 'queued') {
    return false;
  }
  if (isPermissionReplyCommandBlocked(candidate.commandType)) {
    return false;
  }
  return !hasBlockingSameSessionItem(items, candidate);
}

export function listGloballyDispatchableItems(
  items: readonly ChislQueueItem[],
  options: ChislQueueDispatchabilityOptions = {}
): ChislQueueItem[] {
  const limit = options.globalConcurrencyLimit ?? DEFAULT_CHISL_QUEUE_GLOBAL_CONCURRENCY;
  const activeCount = items.filter((item) => isChislQueueActiveStatus(item.status)).length;
  const slots = Math.max(0, limit - activeCount);
  if (slots === 0) {
    return [];
  }
  const candidates = items
    .filter((item) => isSameSessionDispatchable(items, item))
    .sort((a, b) => {
      if (a.createdAt !== b.createdAt) {
        return a.createdAt - b.createdAt;
      }
      return a.sessionOrder - b.sessionOrder;
    });
  const selected: ChislQueueItem[] = [];
  const working = [...items];
  for (const candidate of candidates) {
    if (selected.length >= slots) {
      break;
    }
    if (!isSameSessionDispatchable(working, candidate)) {
      continue;
    }
    selected.push(candidate);
    working.push({ ...candidate, status: 'dispatching' });
  }
  return selected;
}

export type ChislQueueDispatchErrorInput = {
  httpStatus?: number;
  code?: string;
  message?: string;
};

export function classifyChislQueueRetryError(
  input: ChislQueueDispatchErrorInput,
  retryCount: number,
  maxRetries: number
): ChislQueueRetryClassification {
  if (retryCount >= maxRetries) {
    return { retryable: false, kind: 'retries_exhausted' };
  }
  const status = input.httpStatus;
  const code = (input.code ?? '').toLowerCase();
  const message = (input.message ?? '').toLowerCase();

  if (status === 429) {
    return { retryable: true, kind: 'rate_limited' };
  }
  if (status != null && status >= 500) {
    return { retryable: true, kind: 'server_5xx' };
  }
  if (code === 'dispatch_timeout' || message.includes('dispatch timeout')) {
    return { retryable: true, kind: 'dispatch_timeout' };
  }
  if (
    code === 'network' ||
    code === 'econnreset' ||
    code === 'etimedout' ||
    message.includes('network')
  ) {
    return { retryable: true, kind: 'network' };
  }
  if (
    code === 'busy' ||
    code === 'session_busy' ||
    message.includes('busy') ||
    message.includes('already running')
  ) {
    return { retryable: true, kind: 'transient_busy' };
  }
  if (status === 404 || code === 'session_not_found') {
    return { retryable: false, kind: 'session_not_found' };
  }
  if (status === 403 || code === 'permission_denied') {
    return { retryable: false, kind: 'permission_denied' };
  }
  if (code === 'validation' || message.includes('validation')) {
    return { retryable: false, kind: 'validation' };
  }
  if (code === 'explicit_rejection' || message.includes('rejected')) {
    return { retryable: false, kind: 'explicit_rejection' };
  }
  if (status != null && status >= 400 && status < 500) {
    return { retryable: false, kind: 'client_4xx' };
  }
  return { retryable: false, kind: 'unknown' };
}

export function shouldRetryChislQueueItem(
  item: ChislQueueItem,
  error: ChislQueueDispatchErrorInput
): boolean {
  const classification = classifyChislQueueRetryError(error, item.retryCount, item.maxRetries);
  return classification.retryable;
}

export function applyChislQueueRetry(
  item: ChislQueueItem,
  error: ChislQueueDispatchErrorInput,
  at = Date.now()
): ChislQueueItem {
  const classification = classifyChislQueueRetryError(error, item.retryCount, item.maxRetries);
  if (!classification.retryable) {
    return applyChislQueueStatusTransition(
      {
        ...item,
        lastError: error.message ?? classification.kind,
      },
      'failed',
      at
    );
  }
  return {
    ...item,
    status: 'queued',
    retryCount: item.retryCount + 1,
    lastError: error.message ?? classification.kind,
    dispatchedAt: null,
    updatedAt: at,
  };
}

function nextSessionOrder(items: readonly ChislQueueItem[], sessionID: string | null): number {
  const key = sessionKey(sessionID);
  const max = items
    .filter((item) => sessionKey(item.sessionID) === key)
    .reduce((acc, item) => Math.max(acc, item.sessionOrder), -1);
  return max + 1;
}

export function cancelChislQueueItem(
  item: ChislQueueItem,
  cancelledBy: string,
  allItems: readonly ChislQueueItem[],
  at = Date.now()
): ChislQueueCancelResult {
  if (item.status === 'queued') {
    const cancelled = applyChislQueueStatusTransition(
      {
        ...item,
        cancelledBy,
        cancelledAt: at,
      },
      'cancelled',
      at
    );
    return { outcome: 'cancelled_locally', item: cancelled };
  }
  if (item.status === 'running' || item.status === 'blocked' || item.status === 'dispatching') {
    const marked = {
      ...item,
      cancelledBy,
      cancelledAt: at,
      metadata: {
        ...(item.metadata ?? {}),
        cancellationIntent: true,
      },
      updatedAt: at,
    };
    const abortItem = createDefaultChislQueueItemFields({
      commandType: 'abort',
      payload: { targetItemId: item.id, sessionID: item.sessionID },
      sessionID: item.sessionID,
      sessionOrder: nextSessionOrder(allItems, item.sessionID),
      parentID: item.id,
      metadata: { reason: 'cancellation', cancelledBy },
    });
    return { outcome: 'abort_enqueued', item: marked, abortItem };
  }
  throw new Error(`Cannot cancel item in status ${item.status}`);
}

export function bootstrapChislQueueRecovery(
  input: ChislQueueRecoveryBootstrapInput
): ChislQueueRecoveryBootstrapResult {
  const known = input.sessionStatusKnownIds ?? new Set<string>();
  const nonTerminalItems = input.items.filter((item) =>
    (CHISL_QUEUE_NON_TERMINAL_STATUSES as readonly string[]).includes(item.status)
  );
  const needsStatusReconciliation = nonTerminalItems.filter(
    (item) =>
      item.sessionID != null &&
      (item.status === 'running' || item.status === 'blocked' || item.status === 'dispatching')
  );
  const absentFromSessionStatusNotCompleted = needsStatusReconciliation.filter(
    (item) => item.sessionID != null && !known.has(item.sessionID)
  );
  const dispatchable = listGloballyDispatchableItems(nonTerminalItems);
  return {
    nonTerminalItems,
    dispatchableIds: dispatchable.map((item) => item.id),
    needsStatusReconciliation,
    absentFromSessionStatusNotCompleted,
  };
}

export function rowToChislQueueItem(row: ChislQueueItemRow): ChislQueueItem {
  return {
    id: row.id,
    sessionID: row.session_id,
    messageID: row.message_id,
    commandType: row.command_type,
    payload: JSON.parse(row.payload_json) as unknown,
    sessionOrder: row.session_order,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    dispatchedAt: row.dispatched_at,
    completedAt: row.completed_at,
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    lastError: row.last_error,
    cancelledBy: row.cancelled_by,
    cancelledAt: row.cancelled_at,
    parentID: row.parent_id,
    metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, unknown>) : null,
  };
}

export function chislQueueItemToRow(item: ChislQueueItem): ChislQueueItemRow {
  return {
    id: item.id,
    session_id: item.sessionID,
    message_id: item.messageID,
    command_type: item.commandType,
    payload_json: JSON.stringify(item.payload),
    session_order: item.sessionOrder,
    status: item.status,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    dispatched_at: item.dispatchedAt,
    completed_at: item.completedAt,
    retry_count: item.retryCount,
    max_retries: item.maxRetries,
    last_error: item.lastError,
    cancelled_by: item.cancelledBy,
    cancelled_at: item.cancelledAt,
    parent_id: item.parentID,
    metadata_json: item.metadata ? JSON.stringify(item.metadata) : null,
  };
}

export type { ChislQueueRetryErrorKind };
