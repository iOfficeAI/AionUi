/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi } from 'vitest';
import { shouldShowNotification, createBrowserNotificationController, type NotificationGate } from '@/renderer/hooks/system/notification/browserNotificationCore';

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

describe('createBrowserNotificationController', () => {
  const makeDeps = (gate: NotificationGate = openGate) => {
    const show = vi.fn();
    const controller = createBrowserNotificationController({
      readGate: () => gate,
      show,
      bodyFor: (kind) => kind,
    });
    return { show, controller };
  };

  it('shows a confirmation notification with conversation id', () => {
    const { show, controller } = makeDeps();
    controller.onConfirmation({ conversation_id: 'c1' });
    expect(show).toHaveBeenCalledWith({ body: 'confirmation', conversationId: 'c1' });
  });

  it('does not show when gate is closed', () => {
    const { show, controller } = makeDeps({ ...openGate, documentHidden: false });
    controller.onConfirmation({ conversation_id: 'c1' });
    expect(show).not.toHaveBeenCalled();
  });

  it('shows turn-completed only when status is finished, using session_id', () => {
    const { show, controller } = makeDeps();
    controller.onTurnCompleted({ status: 'running', session_id: 's1', turn_id: 't1' });
    expect(show).not.toHaveBeenCalled();
    controller.onTurnCompleted({ status: 'finished', session_id: 's1', turn_id: 't1' });
    expect(show).toHaveBeenCalledWith({ body: 'turnCompleted', conversationId: 's1' });
  });

  it('dedups repeated turn_id', () => {
    const { show, controller } = makeDeps();
    controller.onTurnCompleted({ status: 'finished', session_id: 's1', turn_id: 't1' });
    controller.onTurnCompleted({ status: 'finished', session_id: 's1', turn_id: 't1' });
    expect(show).toHaveBeenCalledTimes(1);
  });
});
