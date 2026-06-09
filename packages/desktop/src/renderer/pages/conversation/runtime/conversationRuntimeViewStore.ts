/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeStateKind, TConversationRuntimeSummary } from '@/common/config/storage';

export type ConversationRuntimeView = {
  conversation_id: string;
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
  activeTurnSeq: number;
  acceptedTurnSeq: number | null;
  pendingStopTurnSeq: number | null;
};

const listeners = new Set<ConversationRuntimeViewListener>();
const runtimeViews = new Map<string, ConversationRuntimeView>();
const fallbackSnapshots = new Map<string, ConversationRuntimeView>();
const runtimeMetadata = new Map<string, ConversationRuntimeMetadata>();

const getRuntimeMetadata = (conversation_id: string): ConversationRuntimeMetadata => {
  const existing = runtimeMetadata.get(conversation_id);
  if (existing) {
    return existing;
  }

  const next: ConversationRuntimeMetadata = {
    activeTurnSeq: 0,
    acceptedTurnSeq: null,
    pendingStopTurnSeq: null,
  };
  runtimeMetadata.set(conversation_id, next);
  return next;
};

export const createDefaultConversationRuntimeView = (conversation_id: string): ConversationRuntimeView => ({
  conversation_id,
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

const applyRuntimeSummary = (
  previous: ConversationRuntimeView,
  runtime: TConversationRuntimeSummary,
  options: { preserveLocalSubmitting?: boolean } = {}
): ConversationRuntimeView => {
  if (previous.localSubmitting && options.preserveLocalSubmitting !== false) {
    return {
      ...previous,
      state: previous.state === 'idle' ? 'starting' : previous.state,
      isProcessing: true,
      canSendMessage: false,
      pendingConfirmations: runtime.pending_confirmations,
      hasBackendRuntime: true,
      hydrated: true,
    };
  }

  return {
    ...previous,
    state: runtime.state,
    isProcessing: runtime.is_processing,
    canSendMessage: runtime.can_send_message,
    pendingConfirmations: runtime.pending_confirmations,
    hasBackendRuntime: true,
    hydrated: true,
    localSubmitting: runtime.state === 'idle' ? false : previous.localSubmitting,
    localStopping: runtime.state === 'idle' ? false : previous.localStopping,
  };
};

const applyRuntimeCompletionSummary = (
  previous: ConversationRuntimeView,
  runtime: TConversationRuntimeSummary
): ConversationRuntimeView => ({
  ...previous,
  state: runtime.state,
  isProcessing: runtime.is_processing,
  canSendMessage: runtime.can_send_message,
  pendingConfirmations: runtime.pending_confirmations,
  hasBackendRuntime: true,
  hydrated: true,
  localSubmitting: runtime.state === 'idle' ? false : previous.localSubmitting,
  localStopping: runtime.state === 'idle' ? false : previous.localStopping,
});

const withLogs = (
  view: ConversationRuntimeView,
  logs: ConversationRuntimeViewLogEntry[] = []
): ConversationRuntimeSnapshot => ({
  view,
  logs,
});

const isReleasedRuntimeView = (view: ConversationRuntimeView): boolean =>
  view.hydrated &&
  view.hasBackendRuntime &&
  view.state === 'idle' &&
  !view.isProcessing &&
  view.canSendMessage &&
  !view.localSubmitting;

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
  options: { preserveLocalSubmitting?: boolean } = {}
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);

  if (!runtime) {
    const view = {
      ...base,
      hydrated: true,
    };
    return withLogs(view, [createLog('warn', 'runtime_hydrate_missing_summary', view)]);
  }

  const view = applyRuntimeSummary(base, runtime, options);
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
  runtime: TConversationRuntimeSummary | null
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);

  if (!runtime) {
    const view = {
      ...base,
      hydrated: true,
    };
    return withLogs(view, [createLog('warn', 'turn_completed_missing_runtime', view)]);
  }

  const view = applyRuntimeCompletionSummary(base, runtime);
  const logs = [createLog('info', 'turn_completed_applied', view)];
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
  msg_id?: string
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
  return withLogs(view, [createLog('info', 'local_send_accepted', view, msg_id ? { msg_id } : {})]);
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
  conversation_id: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = {
    ...base,
    localStopping: true,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'local_stop_requested', view)]);
};

export const localStopAcknowledgedConversationRuntimeView = (
  previous: ConversationRuntimeView | undefined,
  conversation_id: string
): ConversationRuntimeSnapshot => {
  const base = previous ?? createDefaultConversationRuntimeView(conversation_id);
  const view = {
    ...base,
    localStopping: base.isProcessing || !base.canSendMessage ? true : base.localStopping,
    hydrated: true,
  };
  return withLogs(view, [createLog('info', 'local_stop_acknowledged', view)]);
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
  const preserveLocalSubmitting =
    metadata.acceptedTurnSeq === null || metadata.acceptedTurnSeq !== metadata.activeTurnSeq;
  return setConversationRuntimeSnapshot(
    conversation_id,
    hydrateSucceededConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, runtime, {
      preserveLocalSubmitting,
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
  runtime: TConversationRuntimeSummary | null
): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.acceptedTurnSeq = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    turnCompletedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, runtime)
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
  metadata.activeTurnSeq += 1;
  metadata.acceptedTurnSeq = null;
  metadata.pendingStopTurnSeq = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localSendStartedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id)
  );
};

export const localSendAccepted = (conversation_id: string, msg_id?: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  const base = runtimeViews.get(conversation_id) ?? createDefaultConversationRuntimeView(conversation_id);

  if (isReleasedRuntimeView(base)) {
    const logs = [
      createLog('info', 'local_send_accepted', base, {
        ignored: true,
        reason: 'stale_send_accept_after_release',
        ...(msg_id ? { msg_id } : {}),
      }),
    ];
    return setConversationRuntimeSnapshot(conversation_id, withLogs(base, logs));
  }

  metadata.acceptedTurnSeq = metadata.activeTurnSeq;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localSendAcceptedConversationRuntimeView(base, conversation_id, msg_id)
  );
};

export const localSendFailed = (conversation_id: string, reason: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.acceptedTurnSeq = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localSendFailedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id, reason)
  );
};

export const localStopRequested = (conversation_id: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  metadata.pendingStopTurnSeq = metadata.activeTurnSeq;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localStopRequestedConversationRuntimeView(runtimeViews.get(conversation_id), conversation_id)
  );
};

export const localStopAcknowledged = (conversation_id: string): ConversationRuntimeViewLogEntry[] => {
  const metadata = getRuntimeMetadata(conversation_id);
  const base = runtimeViews.get(conversation_id) ?? createDefaultConversationRuntimeView(conversation_id);
  const isCurrentStopAck =
    metadata.pendingStopTurnSeq !== null && metadata.pendingStopTurnSeq === metadata.activeTurnSeq;

  if (!isCurrentStopAck) {
    const logs = [
      createLog('info', 'local_stop_acknowledged', base, {
        ignored: true,
        reason: 'stale_stop_ack',
      }),
    ];
    return setConversationRuntimeSnapshot(conversation_id, withLogs(base, logs));
  }

  metadata.pendingStopTurnSeq = null;
  return setConversationRuntimeSnapshot(
    conversation_id,
    localStopAcknowledgedConversationRuntimeView(base, conversation_id)
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
