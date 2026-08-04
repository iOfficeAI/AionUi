/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  pollLarkQrLogin: vi.fn(),
  startLarkQrLogin: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMocks,
}));

import LarkQrLogin from '@renderer/pages/login/LarkQrLogin';

describe('LarkQrLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authMocks.startLarkQrLogin.mockReset().mockResolvedValue({
      success: true,
      data: {
        expiresIn: 300,
        loginUrl: 'https://gea.example/lark/login?state=encoded',
        qrcodeId: 'QRCODELOGIN:1',
      },
    });
    authMocks.pollLarkQrLogin.mockReset().mockResolvedValue({ success: true, data: { status: 'pending' } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the GEA login URL as a QR code and starts polling', async () => {
    render(<LarkQrLogin />);

    await act(async () => Promise.resolve());
    expect(screen.getByLabelText('login.lark.qrCodeLabel')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(authMocks.pollLarkQrLogin).toHaveBeenCalledWith('QRCODELOGIN:1');
  });

  it('stops polling and offers refresh when the QR code expires', async () => {
    authMocks.pollLarkQrLogin.mockResolvedValueOnce({ success: true, data: { status: 'expired' } });
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByText('login.lark.expired')).toBeInTheDocument();
    expect(screen.getByText('login.lark.refresh')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(authMocks.pollLarkQrLogin).toHaveBeenCalledTimes(1);
  });
});
