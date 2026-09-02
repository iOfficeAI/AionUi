/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const streamHandlers: Array<(e: unknown) => void> = [];
const showInvoke = vi.fn();
let isDesktop = true;
let settingEnabled = true;
let snapshotName: string | undefined;

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      responseStream: {
        on: (h: (e: unknown) => void) => {
          streamHandlers.push(h);
          return () => {};
        },
      },
    },
    notification: {
      show: { invoke: (...args: unknown[]) => showInvoke(...args) },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => isDesktop }));
vi.mock('@/common/config/configService', () => ({ configService: { get: () => settingEnabled } }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  getSnapshotConversationName: () => snapshotName,
}));
// Interpolate the name so tests can assert both the key chosen and the value passed.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, params?: { name?: string }) => (params?.name ? `${k}::${params.name}` : k) }),
}));

import { useDesktopTurnNotification } from '@/renderer/hooks/system/notification/useDesktopTurnNotification';

const emitStream = (message: unknown) => streamHandlers.forEach((h) => h(message));

beforeEach(() => {
  streamHandlers.length = 0;
  showInvoke.mockClear();
  isDesktop = true;
  settingEnabled = true;
  snapshotName = undefined;
});

describe('useDesktopTurnNotification', () => {
  it('invokes the native notification on a finish stream message when unfocused', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'finish', conversation_id: 's1', turn_id: 't1' });
    expect(showInvoke).toHaveBeenCalledTimes(1);
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyTurnCompleted',
      conversation_id: 's1',
    });
  });

  it('notifies on a confirmation (acp_permission) message when unfocused', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'acp_permission', conversation_id: 's1', msg_id: 'm1' });
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyConfirmation',
      conversation_id: 's1',
    });
  });

  it('notifies on an ask (agent question) message when unfocused', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'ask', conversation_id: 's1', msg_id: 'm2' });
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyConfirmation',
      conversation_id: 's1',
    });
  });

  it('names the conversation in a confirmation notification when the name is known', () => {
    snapshotName = 'My Chat';
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'acp_permission', conversation_id: 's1', msg_id: 'm3' });
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyConfirmationNamed::My Chat',
      conversation_id: 's1',
    });
  });

  it('does not notify when the notification setting is disabled', () => {
    settingEnabled = false;
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'finish', conversation_id: 's1', turn_id: 't1' });
    expect(showInvoke).not.toHaveBeenCalled();
  });

  it('is a no-op outside the Electron desktop runtime', () => {
    isDesktop = false;
    renderHook(() => useDesktopTurnNotification());
    expect(streamHandlers).toHaveLength(0);
    emitStream({ type: 'finish', conversation_id: 's1', turn_id: 't1' });
    expect(showInvoke).not.toHaveBeenCalled();
  });
});
