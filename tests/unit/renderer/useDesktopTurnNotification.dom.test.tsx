/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const streamHandlers: Array<(e: unknown) => void> = [];
const showInvoke = vi.fn();
const { navigateMock, focusConversation } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  focusConversation: vi.fn(() => Promise.resolve(false)),
}));
let clickedHandler: ((payload: { conversation_id?: string }) => void) | undefined;
let isDesktop = true;
let settingEnabled = true;
let snapshotName: string | undefined;
let locationSearch = '';

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ search: locationSearch }),
  useNavigate: () => navigateMock,
}));

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
      clicked: {
        on: (handler: (payload: { conversation_id?: string }) => void) => {
          clickedHandler = handler;
          return () => {};
        },
      },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ getWindowId: () => 7, isElectronDesktop: () => isDesktop }));
vi.mock('@/renderer/utils/ui/detachedWindow', () => ({ detachedWindowActions: { focusConversation } }));
vi.mock('@/common/config/configService', () => ({ configService: { get: () => settingEnabled } }));
vi.mock('@/renderer/pages/conversation/GroupedHistory/hooks/useConversationListSync', () => ({
  getSnapshotConversationName: () => snapshotName,
}));
// Interpolate the name so tests can assert both the key chosen and the value passed.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string, params?: { name?: string }) => (params?.name ? `${k}::${params.name}` : k) }),
}));

import { useDesktopTurnNotification } from '@/renderer/hooks/system/notification/useDesktopTurnNotification';
import { useNotificationClick } from '@/renderer/hooks/system/notification/useNotificationClick';

const emitStream = (message: unknown) => streamHandlers.forEach((h) => h(message));

beforeEach(() => {
  streamHandlers.length = 0;
  showInvoke.mockClear();
  isDesktop = true;
  settingEnabled = true;
  snapshotName = undefined;
  locationSearch = '';
  navigateMock.mockClear();
  focusConversation.mockReset();
  focusConversation.mockResolvedValue(false);
  clickedHandler = undefined;
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
      source_web_contents_id: 7,
    });
  });

  it('notifies on a confirmation (acp_permission) message when unfocused', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'acp_permission', conversation_id: 's1', msg_id: 'm1' });
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyConfirmation',
      conversation_id: 's1',
      source_web_contents_id: 7,
    });
  });

  it('notifies on an ask (agent question) message when unfocused', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'ask', conversation_id: 's1', msg_id: 'm2' });
    expect(showInvoke).toHaveBeenCalledWith({
      title: 'AionUi',
      body: 'settings.browserNotification.bodyConfirmation',
      conversation_id: 's1',
      source_web_contents_id: 7,
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
      source_web_contents_id: 7,
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

  it('keeps a detached renderer eligible when it becomes the only notification producer', () => {
    locationSearch = '?window=detached';
    renderHook(() => useDesktopTurnNotification());
    expect(streamHandlers).toHaveLength(1);
  });

  it('focuses a popped-out conversation instead of duplicating it in the main window', async () => {
    focusConversation.mockResolvedValue(true);
    renderHook(() => useNotificationClick());

    clickedHandler?.({ conversation_id: 'popped-out' });
    await Promise.resolve();
    await Promise.resolve();

    expect(focusConversation).toHaveBeenCalledWith('popped-out');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('navigates after a notification click when no pop-out exists', async () => {
    renderHook(() => useNotificationClick());

    clickedHandler?.({ conversation_id: 'main-only' });
    await Promise.resolve();
    await Promise.resolve();

    expect(navigateMock).toHaveBeenCalledWith('/conversation/main-only');
  });
});
