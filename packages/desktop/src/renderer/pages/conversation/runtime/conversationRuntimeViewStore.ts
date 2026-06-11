/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeStateKind, TConversationRuntimeSummary } from '@/common/config/storage';

export type ConversationRuntimeView = {
  conversation_id: string;
  activeTurnId: string | null;
  state: TConversationRuntimeStateKind;
  isProcessing: boolean;
  canSendMessage: boolean;
  pendingConfirmations: number;
  hasBackendRuntime: boolean;
  localSubmitting: boolean;
  hydrated: boolean;
  localStopping: boolean;
};

export type ConversationRuntimeViewLogEvent =
  | 'runtime_hydrated'
  | 'runtime_hydrate_missing_summary'
  | 'turn_completed_applied'
  | 'turn_completed_missing_runtime'
  | 'runtime_release_confirmed'
  | 'local_send_started'
  | 'local_send_accepted'
  | 'local_send_failed'
  | 'local_stop_requested'
  | 'local_stop_acknowledged'
  | 'runtime_view_cleaned';

export type ConversationRuntimeViewLogLevel = 'info' | 'warn';

export type ConversationRuntimeViewLogEntry = {
  level: ConversationRuntimeViewLogLevel;
  event: ConversationRuntimeViewLogEvent;
  data: Record<string, unknown>;
};

type ConversationRuntimeSnapshot = {
  view: ConversationRuntimeView;
  logs: ConversationRuntimeViewLogEntry[];
};

type ConversationRuntimeViewListener = () => void;
type ConversationRuntimeMetadata = {
  pendingLocalSendSeq: number | null;
  pendingStopTurnId: string | null;
  lastCompletedTurnId: string | null;
};

const listeners = new Set<ConversationRuntimeViewListener>();
const runtimeViews = new Map<string, ConversationRuntimeView>();
const fallbackSnapshots = new Map<string, ConversationRuntimeView>();
const runtimeMetadata = new Map<string, ConversationRuntimeMetadata>();

const createRuntimeMetadata = (): ConversationRuntimeMetadata => ({
  pendingLocalSendSeq: null,
  pendingStopTurnId: null,
  lastCompletedTurnId: null,
});

const getRuntimeMetadata = (conversation_id: string): ConversationRuntimeMetadata => {
  const existing = runtimeMetadata.get(conversation_id);
  if (existing) {
    return existing;
  }

  const next = createRuntimeMetadata();
  runtimeMetadata.set(conversation_id, next);
  return next;
};

export const createDefaultConversationRuntimeView = (conversation_id: string): ConversationRuntimeView => ({
  conversation_id,
  activeTurnId: null,
  state: 'idle',
  isProcessing: false,
  canSendMessage: true,
  pendingConfirmations: 0,
  hasBackendRuntime: false,
  localSubmitting: false,
  hydrated: false,
  localStopping: false,
});

const summarizeView = (view: ConversationRuntimeView): Record<string, unknown> => ({
  conversation_id: view.conversation_id,
  activeTurnId: view.activeTurnId,
  state: view.state,
  isProcessing: view.isProcessing,
  canSendMessage: view.canSendMessage,
  pendingConfirmations: view.pendingConfirmations,
  hasBackendRuntime: view.hasBackendRuntime,
  localSubmitting: view.localSubmitting,
  hydrated: view.hydrated,
  localStopping: view.localStopping,
});

const createLog = (
  level: ConversationRuntimeViewLogLevel,
  event: ConversationRuntimeViewLogEvent,
  view: ConversationRuntimeView,
  data: Record<string, unknown> = {}
): ConversationRuntimeViewLogEntry => ({
  level,
  event,
  data: {
    ...summarizeView(view),
    ...data,
  },
});

const viewFromRuntimeSummary = (
  previous: ConversationRuntimeView,
  runtime: TConversationRuntimeSummary,
  metadata: ConversationRuntimeMetadata,
  options: { preservePendingLocalSend?: boolean } = {}
): ConversationRuntimeView => {
  const pendingLocalSend = metadata.pendingLocalSendSeq !== null && options.preservePendingLocalSend !== false;
  const activeTurnId = runtime.turn_id ?? null;
  const localStopping =
    metadata.pendingStopTurnId !== null &&
    metadata.pendingStopTurnId === activeTurnId &&
    runtime.is_processing === true;

  return {
    ...previous,
    activeTurnId,
    state: pendingLocalSend && runtime.state === 'idle' ? 'starting' : runtime.state,
    isProcessing: pendingLocalSend || runtime.is_processing,
    canSendMessage: !pendingLocalSend && runtime.can_send_message,
    pendingConfirmations: runtime.pending_confirmations,
    hasBackendRuntime: true,
    hydrated: true,
    localSubmitting: pendingLocalSend,
    localStopping,
  };
};

const isStaleCompletedRuntimeSummary = (
  runtime: TConversationRuntimeSummary | null,
  metadata: ConversationRuntimeMetadata
): runtime is TConversationRuntimeSummary =>
  runtime !== null &&
  runtime.turn_id !== null &&
  metadata.lastCompletedTurnId === runtime.turn_id &&
  runtime.is_processing === true;

const withLogs = (
  view: ConversationRuntimeView,
  logs: ConversationRuntimeViewLogEntry[] = []
): ConversationRuntimeSnapshot => ({
  view,
  logs,
});

export const hydrateStartedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string
): ConversationRuntimeSnapshot => {
  const view = previous ?? createDefaultConversationRuntimeView(conversation_id);
  return withLogs({
    ...view,
    hydrated: false,
  });
};

export const hydrateSucceededConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  runtime: TConversationRuntimeSummary | null,
  metadata: ConversationRuntimeMetadata = createRuntimeMetadata(),
  options: { preservePendingLocalSend?: boolean } = {}
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);

  if (!runtime) {
    const view = {
      ...base,
      hydrated: true,
    };
    return withLogs(view, [createLog('warn', 'runtime_hydrate_missing_summary', view)]);
  }

  const view = viewFromRuntimeSummary(base, runtime, metadata, options);
  const logs = [createLog('info', 'runtime_hydrated', view)];
  if (view.canSendMessage && !view.isProcessing) {
    logs.push(createLog('info', 'runtime_release_confirmed', view, { source: 'hydrate' }));
  }
  return withLogs(view, logs);
};

export const hydrateFailedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  reason: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = {
    ...base,
    hydrated: true,
  };
  return withLogs(view, [createLog('warn', 'runtime_hydrate_missing_summary', view, { reason })]);
};

export const turnCompletedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary | null,
  metadata: ConversationRuntimeMetadata = createRuntimeMetadata()
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);

  if (!runtime) {
    const view = {
      ...base,
      hydrated: true,
    };
    return withLogs(view, [createLog('warn', 'turn_completed_missing_runtime', view)]);
  }

  const view = viewFromRuntimeSummary(base, runtime, metadata, { preservePendingLocalSend: false });
  const logs = [createLog('info', 'turn_completed_applied', view, { turn_id })];
  if (view.canSendMessage && !view.isProcessing) {
    logs.push(createLog('info', 'runtime_release_confirmed', view, { source: 'turn_completed' }));
  }
  return withLogs(view, logs);
};

export const localSendStartedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view: ConversationRuntimeView = {
    ...base,
    state: base.state === 'idle' ? 'starting' : base.state,
    isProcessing: true,
    canSendMessage: false,
    localSubmitting: true,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'local_send_started', view)]);
};

export const localSendAcceptedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary,
  msg_id?: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = viewFromRuntimeSummary(base, runtime, createRuntimeMetadata(), { preservePendingLocalSend: false });
  return withLogs(view, [
    createLog('info', 'local_send_accepted', view, {
      turn_id,
      runtime_turn_id: runtime.turn_id,
      ...(msg_id ? { msg_id } : {}),
    }),
  ]);
};

const staleRuntimeSummaryConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  event: ConversationRuntimeViewLogEvent,
  source: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary,
  msg_id?: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view: ConversationRuntimeView = {
    ...base,
    hydrated: true,
  };
  return withLogs(view, [
    createLog('info', event, view, {
      turn_id,
      runtime_turn_id: runtime.turn_id,
      source,
      stale_after_completed: true,
      ...(msg_id ? { msg_id } : {}),
    }),
  ]);
};

export const localSendFailedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  reason: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view: ConversationRuntimeView = {
    ...base,
    state: 'idle',
    isProcessing: false,
    canSendMessage: true,
    localSubmitting: false,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'local_send_failed', view, { reason })]);
};

export const localStopRequestedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  turn_id: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = {
    ...base,
    localStopping: base.activeTurnId === turn_id && base.isProcessing,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'local_stop_requested', view, { turn_id })]);
};

export const localStopAcknowledgedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary,
  metadata: ConversationRuntimeMetadata = createRuntimeMetadata()
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = viewFromRuntimeSummary(base, runtime, metadata, { preservePendingLocalSend: false });
  return withLogs(view, [createLog('info', 'local_stop_acknowledged', view, { turn_id })]);
};

export const resetLocalGateConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string,
  reason: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view: ConversationRuntimeView = {
    ...base,
    localSubmitting: false,
    localStopping: false,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'runtime_view_cleaned', view, { reason })]);
};

const setConversationRuntimeSnapshot = (conversation_id: string, snapshot: ConversationRuntimeSnapshot) => {
  runtimeViews.set(conversation_id, snapshot.view);
  fallbackSnapshots.set(conversation_id, snapshot.view);
  listeners.forEach((listener) => listener());
  return snapshot.logs;
};

export const subscribeConversationRuntimeView = (listener: ConversationRuntimeViewListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getConversationRuntimeViewSnapshot = (conversation_id: string): ConversationRuntimeView => {
  const existing = runtimeViews.get(conversation_id);
  if (existing) {
    return existing;
  }
  const fallback = fallbackSnapshots.get(conversation_id);
  if (fallback) {
    return fallback;
  }
  const next = createDefaultConversationRuntimeView(conversation_id);
  fallbackSnapshots.set(conversation_id, next);
  return next;
};

export const hydrateStarted = (conversation_id: string): ConversationRuntimeViewLogEntry[] =>
  setConversationRuntimeSnapshot(
    conversation_id,
    hydrateStartedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id)
  );

export const hydrateSucceeded = (
  conversation_id: string,
  runtime: TConversationRuntimeSummary | null
): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  if (isStaleCompletedRuntimeSummary(runtime, metadata)) {
    return setConversationRuntimeSnapshot(
      conversation_id,
      staleRuntimeSummaryConversationRuntimeView(
        runtimeViews.get(conversation_id),
        conversation_id,
        'runtime_hydrated',
        'hydrate',
        runtime.turn_id,
        runtime
      )
    );
  }

  return setConversationRuntimeSnapshot(
    conversation_id,
    hydrateSucceededConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, runtime, metadata, {
      preservePendingLocalSend: true,
    })
  );
};

export const hydrateFailed = (conversation_id: string, reason: string): ConversationRuntimeViewLogEntry[] =>
  setConversationRuntimeSnapshot(
    conversation_id,
    hydrateFailedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, reason)
  );

export const turnCompleted = (
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary | null
): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.pendingLocalSendSeq = null;
  if (metadata.pendingStopTurnId === turn_id) {
    metadata.pendingStopTurnId = null;
  }
  metadata.lastCompletedTurnId = turn_id;
  return setConversationRuntimeSnapshot(
    conversation_id,
    turnCompletedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, turn_id, runtime, metadata)
  );
};

export const conversationDeleted = (conversation_id: string): ConversationRuntimeViewLogEntry[] => {
  const previous = runtimeViews.get(conversation_id) ?? fallbackSnapshots.get(conversation_id);
  runtimeViews.delete(conversation_id);
  fallbackSnapshots.delete(conversation_id);
  runtimeMetadata.delete(conversation_id);
  listeners.forEach((listener) => listener());
  return previous
    ? [
        createLog('info', 'runtime_view_cleaned', previous, {
          reason: 'conversation_deleted',
        }),
      ]
    : [];
};

export const localSendStarted = (conversation_id: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.pendingLocalSendSeq = (metadata.pendingLocalSendSeq ?? 0) + 1;
  metadata.pendingStopTurnId = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localSendStartedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id)
  );
};

export const localSendAccepted = (
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary,
  msg_id?: string
): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  const staleAfterCompleted = isStaleCompletedRuntimeSummary(runtime, metadata);
  if (!staleAfterCompleted) {
    metadata.pendingLocalSendSeq = null;
  }
  return setConversationRuntimeSnapshot(
    conversation_id,
    staleAfterCompleted
      ? staleRuntimeSummaryConversationRuntimeView(
          runtimeViews.get(conversation_id),
          conversation_id,
          'local_send_accepted',
          'send_response',
          turn_id,
          runtime,
          msg_id
        )
      : localSendAcceptedConversationRuntimeView(
          runtimeViews.get(conversation_id),
          conversation_id,
          turn_id,
          runtime,
          msg_id
        )
  );
};

export const localSendFailed = (conversation_id: string, reason: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.pendingLocalSendSeq = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localSendFailedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, reason)
  );
};

export const localStopRequested = (conversation_id: string, turn_id: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.pendingStopTurnId = turn_id;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localStopRequestedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, turn_id)
  );
};

export const localStopAcknowledged = (
  conversation_id: string,
  turn_id: string,
  runtime: TConversationRuntimeSummary
): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  if (metadata.pendingStopTurnId === turn_id) {
    metadata.pendingStopTurnId = null;
  }
  const staleAfterCompleted = isStaleCompletedRuntimeSummary(runtime, metadata);
  return setConversationRuntimeSnapshot(
    conversation_id,
    staleAfterCompleted
      ? staleRuntimeSummaryConversationRuntimeView(
          runtimeViews.get(conversation_id),
          conversation_id,
          'local_stop_acknowledged',
          'stop_response',
          turn_id,
          runtime
        )
      : localStopAcknowledgedConversationRuntimeView(
          runtimeViews.get(conversation_id),
          conversation_id,
          turn_id,
          runtime,
          metadata
        )
  );
};

export const resetLocalGate = (conversation_id: string, reason: string): ConversationRuntimeViewLogEntry[] =>
  setConversationRuntimeSnapshot(
    conversation_id,
    resetLocalGateConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, reason)
  );

export const resetConversationRuntimeViewStoreForTest = () => {
  runtimeViews.clear();
  fallbackSnapshots.clear();
  runtimeMetadata.clear();
  listeners.clear();
};
