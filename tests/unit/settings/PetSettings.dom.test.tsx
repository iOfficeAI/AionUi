/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const { getPetEnabledMock, setPetEnabledMock, configServiceMock } = vi.hoisted(() => ({
  getPetEnabledMock: vi.fn(),
  setPetEnabledMock: vi.fn(() => Promise.resolve()),
  configServiceMock: {
    get: vi.fn(() => undefined),
    setLocal: vi.fn(),
    set: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: {
    getPetEnabled: { invoke: getPetEnabledMock },
    setPetEnabled: { invoke: setPetEnabledMock },
    setPetSize: { invoke: vi.fn(() => Promise.resolve()) },
    setPetDnd: { invoke: vi.fn(() => Promise.resolve()) },
    setPetConfirmEnabled: { invoke: vi.fn(() => Promise.resolve()) },
  },
}));

vi.mock('@/common/config/configService', () => ({
  configService: configServiceMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div data-testid={`row-${label}`}>{children}</div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

import PetSettings from '@/renderer/pages/settings/PetSettings';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const getEnableSwitch = () => within(screen.getByTestId('row-pet.enable')).getByRole('switch');

describe('PetSettings enable switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configServiceMock.get.mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('AC2: sources the initial value from systemSettings.getPetEnabled, not the configService cache', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getPetEnabledMock).toHaveBeenCalledTimes(1);
    });
    expect(configServiceMock.get).not.toHaveBeenCalledWith('pet.enabled');
  });

  it('AC7: does not flicker to a definite ON state before the authoritative value resolves', async () => {
    const deferred = createDeferred<boolean>();
    getPetEnabledMock.mockReturnValue(deferred.promise);
    render(<PetSettings />);

    const initialSwitch = getEnableSwitch();
    expect(initialSwitch).toBeDisabled();
    expect(initialSwitch.getAttribute('aria-checked')).toBe('false');

    deferred.resolve(true);

    await waitFor(() => {
      expect(getEnableSwitch().getAttribute('aria-checked')).toBe('true');
    });
    expect(getEnableSwitch()).not.toBeDisabled();
  });

  it('AC1/AC5: renders OFF and enabled when the authoritative value resolves false', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('AC1/AC5: renders ON when the authoritative value resolves true', async () => {
    getPetEnabledMock.mockResolvedValue(true);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch().getAttribute('aria-checked')).toBe('true');
    });
  });

  it('AC3: toggling ON persists through the setPetEnabled IPC boundary', async () => {
    getPetEnabledMock.mockResolvedValue(false);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });

    fireEvent.click(getEnableSwitch());

    await waitFor(() => {
      expect(setPetEnabledMock).toHaveBeenCalledWith({ enabled: true });
    });
  });

  it('falls back to OFF (never ON) when getPetEnabled rejects', async () => {
    getPetEnabledMock.mockRejectedValue(new Error('ipc failure'));
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });

  it('AC5: maps an undefined authoritative value to OFF at the UI', async () => {
    getPetEnabledMock.mockResolvedValue(undefined);
    render(<PetSettings />);

    await waitFor(() => {
      expect(getEnableSwitch()).not.toBeDisabled();
    });
    expect(getEnableSwitch().getAttribute('aria-checked')).toBe('false');
  });
});
