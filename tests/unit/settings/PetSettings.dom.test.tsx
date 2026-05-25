/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PetSettings from '@/renderer/pages/settings/PetSettings';

const { configValues, isMacOSMock, isWindowsMock, setLocalMock, systemSettingsMock } = vi.hoisted(() => ({
  configValues: new Map<string, unknown>(),
  isMacOSMock: vi.fn(),
  isWindowsMock: vi.fn(),
  setLocalMock: vi.fn(),
  systemSettingsMock: {
    getNotchTaskboxStatus: { invoke: vi.fn() },
    setNotchTaskboxEnabled: { invoke: vi.fn() },
    setNotchTaskboxHardwareNotch: { invoke: vi.fn() },
    setPetEnabled: { invoke: vi.fn() },
    setPetSize: { invoke: vi.fn() },
    setPetDnd: { invoke: vi.fn() },
    setPetConfirmEnabled: { invoke: vi.fn() },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: { px?: number }) => (params?.px ? `${key}:${params.px}` : key),
  }),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  systemSettings: systemSettingsMock,
}));

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn((key: string) => configValues.get(key)),
    setLocal: setLocalMock,
  },
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => true,
  isMacOS: isMacOSMock,
  isWindows: isWindowsMock,
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({
    label,
    description,
    children,
  }: {
    label: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <section>
      <label>
        <span>{label}</span>
        {children}
      </label>
      {description ? <p>{description}</p> : null}
    </section>
  ),
}));

vi.mock('@arco-design/web-react', () => {
  const Switch = ({
    checked,
    disabled,
    loading,
    onChange,
  }: {
    checked?: boolean;
    disabled?: boolean;
    loading?: boolean;
    onChange?: (checked: boolean) => void;
  }) => (
    <input
      checked={checked}
      disabled={disabled || loading}
      type='checkbox'
      onChange={(event) => onChange?.(event.currentTarget.checked)}
    />
  );
  const Radio = ({ children, value }: { children: React.ReactNode; value: number }) => (
    <label>
      <input type='radio' value={value} readOnly />
      {children}
    </label>
  );
  Radio.Group = ({ children, disabled }: { children: React.ReactNode; disabled?: boolean }) => (
    <fieldset disabled={disabled}>{children}</fieldset>
  );
  return { Radio, Switch };
});

describe('PetSettings notch taskbox controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configValues.clear();
    configValues.set('pet.enabled', true);
    configValues.set('pet.size', 280);
    configValues.set('pet.dnd', false);
    configValues.set('pet.confirmEnabled', true);
    configValues.set('notchTaskbox.enabled', false);
    configValues.set('notchTaskbox.hardwareNotch', false);
    isMacOSMock.mockReturnValue(true);
    isWindowsMock.mockReturnValue(false);
    systemSettingsMock.getNotchTaskboxStatus.invoke.mockResolvedValue({
      enabled: false,
      open: false,
      hardwareNotch: false,
    });
    systemSettingsMock.setNotchTaskboxEnabled.invoke.mockResolvedValue({
      enabled: true,
      open: true,
      hardwareNotch: false,
    });
    systemSettingsMock.setNotchTaskboxHardwareNotch.invoke.mockResolvedValue({
      enabled: true,
      open: true,
      hardwareNotch: true,
    });
    systemSettingsMock.setPetEnabled.invoke.mockResolvedValue(undefined);
    systemSettingsMock.setPetSize.invoke.mockResolvedValue(undefined);
    systemSettingsMock.setPetDnd.invoke.mockResolvedValue(undefined);
    systemSettingsMock.setPetConfirmEnabled.invoke.mockResolvedValue(undefined);
  });

  it('shows the built-in notch taskbox settings', async () => {
    render(<PetSettings />);

    expect(screen.getByText('pet.notchTaskbox')).toBeInTheDocument();
    expect(screen.getByText('pet.notchTaskboxHardwareNotch')).toBeInTheDocument();
    await waitFor(() => {
      expect(systemSettingsMock.getNotchTaskboxStatus.invoke).toHaveBeenCalled();
    });
  });

  it('disables the desktop pet when the notch taskbox is enabled', async () => {
    render(<PetSettings />);

    fireEvent.click(screen.getByLabelText('pet.notchTaskbox'));

    await waitFor(() => {
      expect(systemSettingsMock.setNotchTaskboxEnabled.invoke).toHaveBeenCalledWith({ enabled: true });
    });
    expect(setLocalMock).toHaveBeenCalledWith('pet.enabled', false);
    await waitFor(() => {
      expect(screen.getByLabelText('pet.enable')).toBeDisabled();
    });
  });

  it('restores the desktop pet when the notch taskbox cannot be enabled', async () => {
    systemSettingsMock.setNotchTaskboxEnabled.invoke.mockResolvedValue({
      enabled: false,
      open: false,
      hardwareNotch: false,
    });
    render(<PetSettings />);

    fireEvent.click(screen.getByLabelText('pet.notchTaskbox'));

    await waitFor(() => {
      expect(screen.getByLabelText('pet.enable')).not.toBeDisabled();
    });
    expect(screen.getByLabelText('pet.enable')).toBeChecked();
    expect(setLocalMock).toHaveBeenCalledWith('pet.enabled', true);
  });

  it('keeps the hardware notch option disabled until the taskbox is enabled', async () => {
    render(<PetSettings />);

    await waitFor(() => {
      expect(systemSettingsMock.getNotchTaskboxStatus.invoke).toHaveBeenCalled();
    });
    expect(screen.getByLabelText('pet.notchTaskboxHardwareNotch')).toBeDisabled();
  });

  it('shows the top taskbox on Windows without hardware notch controls', async () => {
    isMacOSMock.mockReturnValue(false);
    isWindowsMock.mockReturnValue(true);

    render(<PetSettings />);

    expect(screen.getByText('pet.topTaskbox')).toBeInTheDocument();
    expect(screen.queryByText('pet.notchTaskboxHardwareNotch')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(systemSettingsMock.getNotchTaskboxStatus.invoke).toHaveBeenCalled();
    });
  });

  it('hides taskbox controls outside macOS and Windows', () => {
    isMacOSMock.mockReturnValue(false);
    isWindowsMock.mockReturnValue(false);

    render(<PetSettings />);

    expect(screen.queryByText('pet.notchTaskbox')).not.toBeInTheDocument();
    expect(screen.queryByText('pet.topTaskbox')).not.toBeInTheDocument();
    expect(systemSettingsMock.getNotchTaskboxStatus.invoke).not.toHaveBeenCalled();
  });
});
