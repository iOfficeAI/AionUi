/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMocks = vi.hoisted(() => ({
  getGeaEnvironment: vi.fn(),
  pollLarkQrLogin: vi.fn(),
  startLarkQrLogin: vi.fn(),
  updateGeaEnvironment: vi.fn(),
}));

const bridgeMocks = vi.hoisted(() => ({ restart: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@renderer/hooks/context/AuthContext', () => ({
  useAuth: () => authMocks,
}));

vi.mock('@/common', () => ({
  ipcBridge: { application: { restart: { invoke: bridgeMocks.restart } } },
}));

import LarkQrLogin from '@renderer/pages/login/LarkQrLogin';

describe('LarkQrLogin', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    authMocks.getGeaEnvironment.mockReset().mockResolvedValue({
      success: true,
      data: {
        baseUrl: 'https://gea.example',
        editable: true,
        environmentId: 'env-a',
        source: 'default',
      },
    });
    authMocks.startLarkQrLogin.mockReset().mockResolvedValue({
      success: true,
      data: {
        expiresIn: 300,
        loginUrl: 'https://gea.example/lark/login?state=encoded',
        qrcodeId: 'QRCODELOGIN:1',
      },
    });
    authMocks.pollLarkQrLogin.mockReset().mockResolvedValue({ success: true, data: { status: 'pending' } });
    authMocks.updateGeaEnvironment.mockReset().mockResolvedValue({
      success: true,
      data: {
        changed: true,
        environment: {
          baseUrl: 'https://gea-test.example',
          editable: true,
          environmentId: 'env-b',
          source: 'profile',
        },
        restartRequired: true,
      },
    });
    bridgeMocks.restart.mockReset().mockResolvedValue({ manualRestartRequired: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the selected GEA address to be confirmed before creating a QR code', async () => {
    render(<LarkQrLogin />);

    await act(async () => Promise.resolve());
    expect(authMocks.startLarkQrLogin).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('login.lark.qrCodeLabel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('login.lark.environment.continue'));
    await act(async () => Promise.resolve());
    expect(screen.getByLabelText('login.lark.qrCodeLabel')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(authMocks.pollLarkQrLogin).toHaveBeenCalledWith('QRCODELOGIN:1');
  });

  it('switches the GEA environment and starts its login without restarting Electron', async () => {
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());

    fireEvent.change(screen.getByLabelText('login.lark.environment.label'), {
      target: { value: 'https://gea-test.example' },
    });
    fireEvent.click(screen.getByText('login.lark.environment.apply'));
    await act(async () => Promise.resolve());

    expect(authMocks.updateGeaEnvironment).toHaveBeenCalledWith('https://gea-test.example');
    expect(bridgeMocks.restart).not.toHaveBeenCalled();
    expect(screen.queryByText('login.lark.environment.restartRequired')).not.toBeInTheDocument();
    expect(authMocks.startLarkQrLogin).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('login.lark.qrCodeLabel')).toBeInTheDocument();
  });

  it('retires the displayed QR code and permits another switch when its address is edited', async () => {
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByText('login.lark.environment.continue'));
    await act(async () => Promise.resolve());
    expect(screen.getByLabelText('login.lark.qrCodeLabel')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('login.lark.environment.label'), {
      target: { value: 'https://other.example/gea-boot' },
    });
    expect(screen.queryByLabelText('login.lark.qrCodeLabel')).not.toBeInTheDocument();
    expect(screen.getByText('login.lark.environment.apply')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(authMocks.pollLarkQrLogin).not.toHaveBeenCalled();
  });

  it('keeps a managed GEA address read-only', async () => {
    authMocks.getGeaEnvironment.mockResolvedValueOnce({
      success: true,
      data: {
        baseUrl: 'https://managed-gea.example',
        editable: false,
        environmentId: 'env-managed',
        source: 'environment',
      },
    });
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());

    expect(screen.getByLabelText('login.lark.environment.label')).toBeDisabled();
    expect(screen.getByText('login.lark.environment.managed')).toBeInTheDocument();
    expect(screen.queryByText('login.lark.environment.apply')).not.toBeInTheDocument();
    expect(screen.getByText('login.lark.environment.continue')).toBeInTheDocument();
  });

  it('stops polling and offers refresh when the QR code expires', async () => {
    authMocks.pollLarkQrLogin.mockResolvedValueOnce({ success: true, data: { status: 'expired' } });
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByText('login.lark.environment.continue'));
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

  it('reports secure credential storage failures without blaming the GEA service', async () => {
    authMocks.pollLarkQrLogin.mockResolvedValueOnce({ success: false, code: 'secureStorageUnavailable' });
    render(<LarkQrLogin />);
    await act(async () => Promise.resolve());
    fireEvent.click(screen.getByText('login.lark.environment.continue'));
    await act(async () => Promise.resolve());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(screen.getByText('login.lark.errors.secureStorageUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('login.lark.errors.serverError')).not.toBeInTheDocument();
    expect(screen.getByLabelText('login.lark.qrCodeLabel')).toBeInTheDocument();
  });
});
