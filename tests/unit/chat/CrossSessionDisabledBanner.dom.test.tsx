/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getEnabled = vi.fn();
const setEnabled = vi.fn();

vi.mock('@/common', () => ({
  ipcBridge: {
    systemSettings: {
      getCrossSessionMessageEnabled: { invoke: () => getEnabled() },
      setCrossSessionMessageEnabled: { invoke: (params: { enabled: boolean }) => setEnabled(params) },
    },
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { default: CrossSessionDisabledBanner } = await import('@/renderer/components/chat/CrossSessionDisabledBanner');
const { resetCrossSessionMessageEnabledCache } = await import('@/renderer/hooks/chat/useCrossSessionMessageEnabled');

describe('CrossSessionDisabledBanner', () => {
  beforeEach(() => {
    getEnabled.mockReset();
    setEnabled.mockReset();
    setEnabled.mockResolvedValue(undefined);
    // The switch is a shared module-level store read once per app session, so
    // every consumer agrees on its value. Tests have to drop that cache or only
    // the first case's mock would ever be consulted.
    resetCrossSessionMessageEnabledCache();
  });

  it('renders nothing while the feature is on', async () => {
    getEnabled.mockResolvedValue({ cross_session_message_enabled: true });
    const { container } = render(<CrossSessionDisabledBanner />);
    await waitFor(() => expect(getEnabled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  /// A persisted kill switch with no visible state makes the user think the
  /// feature is broken (spec §5.7 rule 3), so this banner is not optional.
  it('explains the disabled state and offers a way back', async () => {
    getEnabled.mockResolvedValue({ cross_session_message_enabled: false });
    render(<CrossSessionDisabledBanner />);

    await waitFor(() => expect(screen.getByText('settings.crossSessionMessageDisabledBanner')).toBeTruthy());
    expect(screen.getByText('settings.crossSessionMessageResume')).toBeTruthy();
  });

  it('turns the feature back on when the action is clicked', async () => {
    getEnabled.mockResolvedValue({ cross_session_message_enabled: false });
    render(<CrossSessionDisabledBanner />);
    const button = await waitFor(() => screen.getByText('settings.crossSessionMessageResume'));

    button.click();

    await waitFor(() => expect(setEnabled).toHaveBeenCalledWith({ enabled: true }));
  });

  it('stays hidden when the setting cannot be read, rather than nagging', async () => {
    // Default-on: a transient read failure must not look like the feature was
    // switched off.
    getEnabled.mockRejectedValue(new Error('offline'));
    const { container } = render(<CrossSessionDisabledBanner />);
    await waitFor(() => expect(getEnabled).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
