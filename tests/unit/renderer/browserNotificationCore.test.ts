/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import {
  shouldShowNotification,
  createBrowserNotificationController,
  truncateConversationName,
  CONVERSATION_NAME_MAX_LENGTH,
  type NotificationGate,
} from '@/renderer/hooks/system/notification/browserNotificationCore';

const openGate: NotificationGate = {
  isElectron: false,
  hasNotificationApi: true,
  isSecureContext: true,
  permission: 'granted',
  settingEnabled: true,
  documentHidden: true,
};

describe('shouldShowNotification', () => {
  it('returns true when all gates pass', () => {
    expect(shouldShowNotification(openGate)).toBe(true);
  });

  it.each([
    ['isElectron', { isElectron: true }],
    ['no api', { hasNotificationApi: false }],
    ['insecure', { isSecureContext: false }],
    ['not granted', { permission: 'default' as const }],
    ['setting off', { settingEnabled: false }],
    ['tab visible', { documentHidden: false }],
  ])('returns false when %s', (_label, override) => {
    expect(shouldShowNotification({ ...openGate, ...override })).toBe(false);
  });
});

describe('truncateConversationName', () => {
  it('returns a short name unchanged (trimmed)', () => {
    expect(truncateConversationName('  My chat  ')).toBe('My chat');
  });

  it('keeps a name exactly at the limit', () => {
    const exact = 'a'.repeat(CONVERSATION_NAME_MAX_LENGTH);
    expect(truncateConversationName(exact)).toBe(exact);
  });

  it('truncates from the end and appends an ellipsis when over the limit', () => {
    const long = 'a'.repeat(CONVERSATION_NAME_MAX_LENGTH + 5);
    expect(truncateConversationName(long)).toBe(`${'a'.repeat(CONVERSATION_NAME_MAX_LENGTH)}…`);
  });

  it('honors a custom max length', () => {
    expect(truncateConversationName('abcdef', 3)).toBe('abc…');
  });
});

describe('createBrowserNotificationController.onStreamMessage', () => {
  const makeDeps = (gate: NotificationGate = openGate) => {
    const show = vi.fn();
    const bodyFor = vi.fn((kind: string) => kind);
    const controller = createBrowserNotificationController({
      shouldShow: () => shouldShowNotification(gate),
      show,
      bodyFor,
    });
    return { show, bodyFor, controller };
  };

  it('shows a turn-completed notification on a finish stream message', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c1', turn_id: 't1' });
    expect(show).toHaveBeenCalledWith({ body: 'turnCompleted', conversationId: 'c1', kind: 'turnCompleted' });
  });

  it('passes the conversation id to bodyFor so the body can name the conversation', () => {
    const { bodyFor, controller } = makeDeps();
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c1', turn_id: 't1' });
    expect(bodyFor).toHaveBeenCalledWith('turnCompleted', 'c1');
  });

  it('shows a confirmation notification on an acp_permission stream message', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ type: 'acp_permission', conversation_id: 'c2' });
    expect(show).toHaveBeenCalledWith({ body: 'confirmation', conversationId: 'c2', kind: 'confirmation' });
  });

  it('shows a confirmation notification on a permission stream message (aionrs)', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ type: 'permission', conversation_id: 'c3' });
    expect(show).toHaveBeenCalledWith({ body: 'confirmation', conversationId: 'c3', kind: 'confirmation' });
  });

  it('ignores non-terminal stream message types', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ type: 'thinking', conversation_id: 'c1', turn_id: 't1' });
    controller.onStreamMessage({ type: 'text', conversation_id: 'c1', turn_id: 't1' });
    controller.onStreamMessage({ type: 'start', conversation_id: 'c1', turn_id: 't1' });
    expect(show).not.toHaveBeenCalled();
  });

  it('does not show when the gate is closed', () => {
    const { show, controller } = makeDeps({ ...openGate, documentHidden: false });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c1', turn_id: 't1' });
    controller.onStreamMessage({ type: 'acp_permission', conversation_id: 'c1' });
    expect(show).not.toHaveBeenCalled();
  });

  it('dedups repeated finish for the same turn_id', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c1', turn_id: 't1' });
    controller.onStreamMessage({ type: 'finish', conversation_id: 'c1', turn_id: 't1' });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('ignores messages without a type', () => {
    const { show, controller } = makeDeps();
    controller.onStreamMessage({ conversation_id: 'c1' });
    expect(show).not.toHaveBeenCalled();
  });
});
