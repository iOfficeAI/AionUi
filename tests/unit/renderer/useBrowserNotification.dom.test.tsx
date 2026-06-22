/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const confirmationHandlers: Array<(e: unknown) => void> = [];
const turnHandlers: Array<(e: unknown) => void> = [];

vi.mock('@/common', () => ({
  ipcBridge: {
    conversation: {
      confirmation: { add: { on: (h: (e: unknown) => void) => { confirmationHandlers.push(h); return () => {}; } } },
      turnCompleted: { on: (h: (e: unknown) => void) => { turnHandlers.push(h); return () => {}; } },
    },
  },
}));
vi.mock('@/renderer/utils/platform', () => ({ isElectronDesktop: () => false }));
vi.mock('@/common/config/configService', () => ({ configService: { get: () => true } }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { useBrowserNotification } from '@/renderer/hooks/system/notification/useBrowserNotification';

class FakeNotification {
  static permission = 'granted';
  onclick: (() => void) | null = null;
  close = vi.fn();
  constructor(public title: string, public options: { body: string }) {
    FakeNotification.instances.push(this);
  }
  static instances: FakeNotification[] = [];
}

beforeEach(() => {
  confirmationHandlers.length = 0;
  turnHandlers.length = 0;
  FakeNotification.instances.length = 0;
  navigate.mockClear();
  (globalThis as unknown as { Notification: unknown }).Notification = FakeNotification;
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(document, 'hidden', { value: true, configurable: true });
});
afterEach(() => { vi.restoreAllMocks(); });

describe('useBrowserNotification', () => {
  it('shows a notification on confirmation when tab is hidden', () => {
    renderHook(() => useBrowserNotification());
    confirmationHandlers.forEach((h) => h({ conversation_id: 'c1' }));
    expect(FakeNotification.instances).toHaveLength(1);
    expect(FakeNotification.instances[0].options.body).toBe('settings.browserNotification.bodyConfirmation');
  });

  it('navigates to the conversation on click', () => {
    renderHook(() => useBrowserNotification());
    turnHandlers.forEach((h) => h({ status: 'finished', session_id: 's1', turn_id: 't1' }));
    expect(FakeNotification.instances).toHaveLength(1);
    FakeNotification.instances[0].onclick?.();
    expect(navigate).toHaveBeenCalledWith('/conversation/s1');
  });
});
