/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// The component resolves `bridge.buildProvider(...).invoke` at module load, so
// the mock must hand back an object exposing `invoke` for every channel.
const { getConsentMock, setConsentMock, isDesktopMock } = vi.hoisted(() => ({
  getConsentMock: vi.fn(),
  setConsentMock: vi.fn(),
  isDesktopMock: vi.fn(),
}));

vi.mock('@office-ai/platform', () => ({
  bridge: {
    buildProvider: vi.fn((channel: string) => ({
      invoke: channel === 'command-eve.telemetry-consent-set' ? setConsentMock : getConsentMock,
    })),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}));

vi.mock('@/renderer/utils/platform', () => ({
  isElectronDesktop: () => isDesktopMock(),
}));

vi.mock('@/renderer/components/base/AionScrollArea', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/renderer/pages/settings/components/SettingsPageWrapper', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div data-testid='settings-page-wrapper'>{children}</div>,
}));

vi.mock('@/renderer/components/settings/SettingsModal/contents/SystemModalContent/PreferenceRow', () => ({
  default: ({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) => (
    <div data-testid='preference-row'>
      <span data-testid='preference-label'>{label}</span>
      {description ? <span data-testid='preference-description'>{description}</span> : null}
      {children}
    </div>
  ),
}));

vi.mock('@/renderer/components/settings/SettingsModal/settingsViewContext', () => ({
  useSettingsViewMode: () => 'page',
}));

import PrivacySettings from '@/renderer/pages/settings/PrivacySettings';

describe('PrivacySettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConsentMock.mockResolvedValue({ consent: false });
    setConsentMock.mockResolvedValue({ consent: true });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the telemetry opt-in toggle on desktop, off by default', async () => {
    isDesktopMock.mockReturnValue(true);
    render(<PrivacySettings />);

    // The toggle (Switch) renders inside the preference row.
    const row = await screen.findByTestId('preference-row');
    expect(row).toBeInTheDocument();
    expect(screen.getByText('Send anonymous crash reports')).toBeInTheDocument();

    const toggle = row.querySelector('button[role="switch"]');
    expect(toggle).toBeTruthy();

    // Consent is read from the bridge and reflected as OFF.
    await waitFor(() => expect(getConsentMock).toHaveBeenCalledTimes(1));
    expect(toggle?.getAttribute('aria-checked')).toBe('false');
  });

  it('shows the desktop-only notice (no toggle) when not on desktop', () => {
    isDesktopMock.mockReturnValue(false);
    render(<PrivacySettings />);

    expect(screen.getByText('Telemetry is only collected by the desktop app.')).toBeInTheDocument();
    expect(screen.queryByTestId('preference-row')).not.toBeInTheDocument();
    // No consent read happens in browser mode.
    expect(getConsentMock).not.toHaveBeenCalled();
  });
});
