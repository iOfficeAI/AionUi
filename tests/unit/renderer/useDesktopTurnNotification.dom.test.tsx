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
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useDesktopTurnNotification } from '@/renderer/hooks/system/notification/useDesktopTurnNotification';

const emitStream = (message: unknown) => streamHandlers.forEach((h) => h(message));

beforeEach(() => {
  streamHandlers.length = 0;
  showInvoke.mockClear();
  isDesktop = true;
  settingEnabled = true;
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

  it('does not notify on a confirmation (permission) message — scoped to turn completion', () => {
    renderHook(() => useDesktopTurnNotification());
    emitStream({ type: 'acp_permission', conversation_id: 's1' });
    expect(showInvoke).not.toHaveBeenCalled();
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
