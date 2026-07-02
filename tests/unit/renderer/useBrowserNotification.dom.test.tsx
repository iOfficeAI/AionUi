/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const streamHandlers: Array<(e: unknown) => void> = [];

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
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => false }));
vi.mock('@/common/config/configService', () => ({ configService: { get: () => true } }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useBrowserNotification } from '@/renderer/hooks/system/notification/useBrowserNotification';

const emitStream = (message: unknown) => streamHandlers.forEach((h) => h(message));

class FakeNotification {
  static permission = 'granted';
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(
    public title: string,
    public options: { body: string }
  ) {
    FakeNotification.instances.push(this);
  }
  static instances: FakeNotification[] = [];
}

beforeEach(() => {
  streamHandlers.length = 0;
  FakeNotification.instances.length = 0;
  navigate.mockClear();
  (globalThis as unknown as { Notification: unknown }).Notification = FakeNotification;
  // jsdom does not implement window.focus(); stub it so the click path is quiet.
  window.focus = vi.fn();
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBrowserNotification', () => {
  it('shows a confirmation notification on an acp_permission stream message when hidden', () => {
    renderHook(() => useBrowserNotification());
    emitStream({ type: 'acp_permission', conversation_id: 'c1' });
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].options.body).toBe('settings.browserNotification.bodyConfirmation');
  });

  it('shows a turn-completed notification on a finish stream message and navigates on click', () => {
    renderHook(() => useBrowserNotification());
    emitStream({ type: 'finish', conversation_id: 's1', turn_id: 't1' });
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].options.body).toBe('settings.browserNotification.bodyTurnCompleted');
    FakeNotification.instances[0].onclick?.();
    expect(navigate).toHaveBeenCalledWith('/conversation/s1');
  });

  it('ignores non-terminal stream messages', () => {
    renderHook(() => useBrowserNotification());
    emitStream({ type: 'thinking', conversation_id: 's1', turn_id: 't1' });
    emitStream({ type: 'text', conversation_id: 's1', turn_id: 't1' });
    expect(FakeNotification.instances).toHaveLength(0);
  });
});
