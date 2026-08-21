/**
 * @vitest-environment jsdom
 */

/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The loop warning is the only "detect → warn → stop" path this feature has, and
 * it was DEAD in the desktop app: `AuthContext.refresh()` takes an
 * `isDesktopRuntime` branch that sets `user` to `null`, so `Router.tsx` passed
 * `undefined` into the hook and `shouldShowRateLimitNotice` refused every event.
 * The pure-function tests stayed green because they always supplied an id by
 * hand — nothing covered "can the desktop app obtain one at all".
 *
 * These tests pin the hook level instead: given no id from the caller, the
 * notice must still appear for THIS client's events, and must still be withheld
 * for another user's.
 */

import { act, render, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SessionMessageRateLimitedPayload } from '@/renderer/hooks/system/useCrossSessionRateLimitNotice';

const currentUserInvoke = vi.fn();
const stopInvoke = vi.fn();
const notificationWarning = vi.fn();
const setEnabled = vi.fn();
/** The handler the hook registers on the WS event, captured per render. */
let registered: ((payload: SessionMessageRateLimitedPayload) => void) | null = null;

vi.mock('@/common', () => ({
  ipcBridge: {
    auth: {
      currentUser: { invoke: () => currentUserInvoke() },
    },
    sessionMessage: {
      rateLimited: {
        on: (callback: (payload: SessionMessageRateLimitedPayload) => void) => {
          registered = callback;
          return () => {
            registered = null;
          };
        },
      },
    },
    conversation: {
      stop: { invoke: (params: unknown) => stopInvoke(params) },
    },
  },
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children }: React.PropsWithChildren) => <button type='button'>{children}</button>,
  Message: { error: vi.fn() },
  Notification: {
    warning: (config: unknown) => notificationWarning(config),
    remove: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/renderer/hooks/chat/useCrossSessionMessageEnabled', () => ({
  useCrossSessionMessageEnabled: () => ({ enabled: true, setEnabled, refresh: () => {} }),
}));

vi.mock('@/renderer/pages/conversation/runtime/conversationRuntimeViewStore', () => ({
  getConversationRuntimeViewSnapshot: () => ({ activeTurnId: 'turn_1' }),
}));

const { useCrossSessionRateLimitNotice } = await import('@/renderer/hooks/system/useCrossSessionRateLimitNotice');
const { resetCurrentUserIdCache } = await import('@/renderer/hooks/system/currentUserId');

const payload = (overrides: Partial<SessionMessageRateLimitedPayload> = {}): SessionMessageRateLimitedPayload => ({
  user_id: 'system_default_user',
  from_conversation_id: 'c1',
  from_name: 'A',
  to_conversation_id: 'c2',
  to_name: 'B',
  window_count: 10,
  gate: 'pair',
  ...overrides,
});

const Host: React.FC<{ userId?: string }> = ({ userId }) => {
  useCrossSessionRateLimitNotice(userId);
  return null;
};

describe('useCrossSessionRateLimitNotice — resolving the current user', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    registered = null;
    resetCurrentUserIdCache();
    // Shape after `httpRequest` unwraps the backend's `{ success, data }`.
    currentUserInvoke.mockResolvedValue({ id: 'system_default_user', username: 'admin' });
  });

  /** The desktop case: AuthContext hands the hook nothing. */
  it('shows the notice when the caller supplies no id, by asking the backend who this client is', async () => {
    render(<Host />);
    await waitFor(() => expect(currentUserInvoke).toHaveBeenCalled());
    // Re-subscribed with the resolved id; the latest handler is the live one.
    await waitFor(() => expect(registered).not.toBeNull());

    act(() => {
      registered?.(payload());
    });

    expect(notificationWarning).toHaveBeenCalledTimes(1);
  });

  /** The fallback must not become a hole in the per-user filter. */
  it('still withholds another user_id even when the id came from the backend', async () => {
    render(<Host />);
    await waitFor(() => expect(currentUserInvoke).toHaveBeenCalled());

    act(() => {
      registered?.(payload({ user_id: 'someone_else' }));
    });

    expect(notificationWarning).not.toHaveBeenCalled();
  });

  /** WebUI mode already knows the user; do not spend a round trip. */
  it('does not look the user up when the caller already supplied an id', async () => {
    render(<Host userId='user_1' />);
    await waitFor(() => expect(registered).not.toBeNull());

    act(() => {
      registered?.(payload({ user_id: 'user_1' }));
    });

    expect(notificationWarning).toHaveBeenCalledTimes(1);
    expect(currentUserInvoke).not.toHaveBeenCalled();
  });

  /** A failed lookup must not throw inside a render effect. */
  it('degrades quietly when the lookup fails', async () => {
    currentUserInvoke.mockRejectedValue(new Error('backend down'));
    render(<Host />);
    await waitFor(() => expect(currentUserInvoke).toHaveBeenCalled());

    act(() => {
      registered?.(payload());
    });

    expect(notificationWarning).not.toHaveBeenCalled();
  });
});
