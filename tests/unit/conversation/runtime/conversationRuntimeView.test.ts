/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TConversationRuntimeSummary } from '@/common/config/storage';
import { describe, expect, it } from 'vitest';
import {
  createDefaultConversationRuntimeView,
  getConversationRuntimeViewSnapshot,
  hydrateSucceededConversationRuntimeView,
  hydrateSucceeded,
  localSendAccepted,
  localSendAcceptedConversationRuntimeView,
  localSendStarted,
  localSendFailedConversationRuntimeView,
  localSendStartedConversationRuntimeView,
  localStopAcknowledged,
  localStopAcknowledgedConversationRuntimeView,
  localStopRequested,
  localStopRequestedConversationRuntimeView,
  resetConversationRuntimeViewStoreForTest,
  turnCompleted,
  turnCompletedConversationRuntimeView,
} from '@/renderer/pages/conversation/runtime/conversationRuntimeViewStore';

const conversation_id = 'conversation-1';

const runtime = (overrides: Partial<TConversationRuntimeSummary>): TConversationRuntimeSummary => ({
  state: 'idle',
  can_send_message: true,
  has_task: false,
  task_status: 'finished',
  is_processing: false,
  pending_confirmations: 0,
  ...overrides,
});

describe('conversationRuntimeViewStore', () => {
  it('hydrates a running runtime as processing and not sendable', () => {
    const { view } = hydrateSucceededConversationRuntimeView(
      undefined,
      conversation_id,
      runtime({
        state: 'running',
        can_send_message: false,
        has_task: true,
        task_status: 'running',
        is_processing: true,
      })
    );

    expect(view).toMatchObject({
      state: 'running',
      isProcessing: true,
      canSendMessage: false,
      hasBackendRuntime: true,
      hydrated: true,
    });
  });

  it('hydrates an idle runtime as sendable', () => {
    const { view, logs } = hydrateSucceededConversationRuntimeView(undefined, conversation_id, runtime({}));

    expect(view).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      hasBackendRuntime: true,
      hydrated: true,
    });
    expect(logs.map((log) => log.event)).toContain('runtime_release_confirmed');
  });

  it('marks local send start as busy before backend runtime arrives', () => {
    const { view } = localSendStartedConversationRuntimeView(undefined, conversation_id);

    expect(view).toMatchObject({
      state: 'starting',
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      hydrated: true,
    });
  });

  it('clears a failed local send gate and restores sendability without backend runtime', () => {
    const started = localSendStartedConversationRuntimeView(undefined, conversation_id).view;
    const { view } = localSendFailedConversationRuntimeView(started, conversation_id, 'network error');

    expect(view).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      hydrated: true,
    });
  });

  it('clears a failed local send gate after an idle backend runtime was hydrated', () => {
    const hydrated = hydrateSucceededConversationRuntimeView(undefined, conversation_id, runtime({})).view;
    const started = localSendStartedConversationRuntimeView(hydrated, conversation_id).view;
    const { view } = localSendFailedConversationRuntimeView(started, conversation_id, 'network error');

    expect(view).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      hasBackendRuntime: true,
      hydrated: true,
    });
  });

  it('does not let late hydrate idle unlock a local send gate', () => {
    const started = localSendStartedConversationRuntimeView(undefined, conversation_id).view;
    const { view, logs } = hydrateSucceededConversationRuntimeView(started, conversation_id, runtime({}));

    expect(view).toMatchObject({
      state: 'starting',
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      hasBackendRuntime: true,
      hydrated: true,
    });
    expect(logs.map((log) => log.event)).not.toContain('runtime_release_confirmed');
  });

  it('keeps an unaccepted local send busy when a stale idle hydrate arrives', () => {
    resetConversationRuntimeViewStoreForTest();

    localSendStarted(conversation_id);
    const logs = hydrateSucceeded(conversation_id, runtime({}));

    expect(getConversationRuntimeViewSnapshot(conversation_id)).toMatchObject({
      state: 'starting',
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      hasBackendRuntime: true,
      hydrated: true,
    });
    expect(logs.map((log) => log.event)).not.toContain('runtime_release_confirmed');
  });

  it('releases an accepted local send when a later hydrate confirms the backend is idle', () => {
    resetConversationRuntimeViewStoreForTest();

    localSendStarted(conversation_id);
    localSendAccepted(conversation_id, 'message-1');
    const logs = hydrateSucceeded(conversation_id, runtime({}));

    expect(getConversationRuntimeViewSnapshot(conversation_id)).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      hasBackendRuntime: true,
      hydrated: true,
    });
    expect(logs.map((log) => log.event)).toContain('runtime_release_confirmed');
  });

  it('ignores a late send acceptance after turn completion already released the runtime', () => {
    resetConversationRuntimeViewStoreForTest();

    localSendStarted(conversation_id);
    turnCompleted(conversation_id, runtime({}));
    const logs = localSendAccepted(conversation_id, 'message-1');

    expect(getConversationRuntimeViewSnapshot(conversation_id)).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      hasBackendRuntime: true,
      hydrated: true,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'local_send_accepted',
      data: {
        ignored: true,
        reason: 'stale_send_accept_after_release',
      },
    });
  });

  it('keeps a send accepted turn busy until runtime confirmation', () => {
    const accepted = localSendAcceptedConversationRuntimeView(undefined, conversation_id, 'message-1').view;

    expect(accepted).toMatchObject({
      state: 'starting',
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
    });

    const { view } = turnCompletedConversationRuntimeView(accepted, conversation_id, runtime({}));

    expect(view).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
    });
  });

  it('does not unlock when turn completed has no runtime', () => {
    const accepted = localSendAcceptedConversationRuntimeView(undefined, conversation_id, 'message-1').view;
    const { view, logs } = turnCompletedConversationRuntimeView(accepted, conversation_id, null);

    expect(view).toMatchObject({
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      hydrated: true,
    });
    expect(logs.map((log) => log.event)).toEqual(['turn_completed_missing_runtime']);
  });

  it('does not release on stop acknowledgement without runtime confirmation', () => {
    const accepted = localSendAcceptedConversationRuntimeView(undefined, conversation_id, 'message-1').view;
    const requested = localStopRequestedConversationRuntimeView(accepted, conversation_id).view;
    const acknowledged = localStopAcknowledgedConversationRuntimeView(requested, conversation_id).view;

    expect(acknowledged).toMatchObject({
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      localStopping: true,
    });

    const { view } = turnCompletedConversationRuntimeView(acknowledged, conversation_id, runtime({}));
    expect(view).toMatchObject({
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      localStopping: false,
    });
  });

  it('does not re-mark stopping after runtime has already released', () => {
    const accepted = localSendAcceptedConversationRuntimeView(undefined, conversation_id, 'message-1').view;
    const requested = localStopRequestedConversationRuntimeView(accepted, conversation_id).view;
    const completed = turnCompletedConversationRuntimeView(requested, conversation_id, runtime({})).view;
    const acknowledged = localStopAcknowledgedConversationRuntimeView(completed, conversation_id).view;

    expect(acknowledged).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      localSubmitting: false,
      localStopping: false,
    });
  });

  it('ignores a stale stop acknowledgement after the next local send started', () => {
    resetConversationRuntimeViewStoreForTest();

    localSendStarted(conversation_id);
    localSendAccepted(conversation_id, 'message-1');
    localStopRequested(conversation_id);
    turnCompleted(conversation_id, runtime({}));
    localSendStarted(conversation_id);
    const logs = localStopAcknowledged(conversation_id);

    expect(getConversationRuntimeViewSnapshot(conversation_id)).toMatchObject({
      state: 'starting',
      isProcessing: true,
      canSendMessage: false,
      localSubmitting: true,
      localStopping: false,
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'local_stop_acknowledged',
      data: {
        ignored: true,
        reason: 'stale_stop_ack',
      },
    });
  });

  it('defaults to an idle view before hydration', () => {
    expect(createDefaultConversationRuntimeView(conversation_id)).toMatchObject({
      state: 'idle',
      isProcessing: false,
      canSendMessage: true,
      hasBackendRuntime: false,
      hydrated: false,
    });
  });
});
