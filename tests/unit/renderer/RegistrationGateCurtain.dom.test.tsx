/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * T2 — Day-14 trial-conversion CURTAIN render tests.
 *
 * Asserts the gate shows the warm "continue" conversion screen (NOT the generic
 * license-error step) only when the main process reports a TRIAL that has expired
 * (`state === 'expired'` AND a non-null `trial_ends_at`), that it leads with the
 * setup-preserved message, that its primary CTA routes OUT to the web checkout
 * (it never resets local data), and that a PAID-license expiry (no
 * `trial_ends_at`) still falls through to the existing license step — so the
 * curtain is distinct from the hard error states.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// The component resolves `commandEve.*` providers (which call
// `bridge.buildProvider` at module load) — hand back invoke stubs.
const { entitlementRegisterMock, entitlementActivateMock, openExternalMock, changeLanguageMock } = vi.hoisted(() => ({
  entitlementRegisterMock: vi.fn(),
  entitlementActivateMock: vi.fn(),
  openExternalMock: vi.fn(),
  changeLanguageMock: vi.fn(),
}));

vi.mock('@/common/adapter/ipcBridge', () => ({
  commandEve: {
    entitlementStatus: { invoke: vi.fn() },
    entitlementRegister: { invoke: entitlementRegisterMock },
    entitlementActivate: { invoke: entitlementActivateMock },
  },
}));

vi.mock('@renderer/services/i18n', () => ({
  changeLanguage: changeLanguageMock,
}));

vi.mock('@renderer/utils/platform', () => ({
  openExternalUrl: openExternalMock,
}));

// Keep i18n deterministic: echo the key (with interpolation visible) so we can
// assert which copy block rendered without depending on real translations.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && Object.keys(options).length > 0 ? `${key} ${JSON.stringify(options)}` : key,
    i18n: { language: 'en-US', resolvedLanguage: 'en-US' },
  }),
}));

// Arco components → minimal DOM so the test does not pull the full design system.
vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, onClick, loading, ...rest }: any) => (
    <button type='button' onClick={onClick} disabled={loading} {...rest}>
      {children}
    </button>
  ),
  Checkbox: ({ onChange, ...rest }: any) => (
    <input type='checkbox' onChange={(e) => onChange?.(e.target.checked)} {...rest} />
  ),
  Input: Object.assign(
    ({ onChange, ...rest }: any) => <input onChange={(e) => onChange?.(e.target.value)} {...rest} />,
    { TextArea: ({ onChange, ...rest }: any) => <textarea onChange={(e) => onChange?.(e.target.value)} {...rest} /> }
  ),
}));

import RegistrationGatePage from '@/renderer/pages/registrationGate';
import type { ICommandEveEntitlementStatusResult } from '@/common/adapter/ipcBridge';

const trialExpiredStatus: ICommandEveEntitlementStatusResult = {
  version: 'command-eve-entitlement/v0',
  ok: false,
  required: true,
  state: 'expired',
  reason_code: 'LICENSE_EXPIRED',
  tenant_id: 't-1',
  edition: 'pilot',
  expires_at: null,
  // The distinguishing field: a non-null trial_ends_at means it WAS a trial.
  trial_ends_at: '2026-06-16T00:00:00.000Z',
};

const paidExpiredStatus: ICommandEveEntitlementStatusResult = {
  version: 'command-eve-entitlement/v0',
  ok: false,
  required: true,
  state: 'expired',
  reason_code: 'LICENSE_EXPIRED',
  tenant_id: 't-1',
  edition: 'standard',
  expires_at: '2026-06-16T00:00:00.000Z',
  // No trial_ends_at ⇒ a paid-license expiry, NOT the trial curtain.
};

describe('RegistrationGatePage — day-14 trial curtain (T2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openExternalMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the conversion curtain (not the license step) when a trial has expired', () => {
    render(<RegistrationGatePage status={trialExpiredStatus} onEntitled={vi.fn()} />);

    // Curtain present...
    expect(screen.getByTestId('registration-gate-curtain')).toBeInTheDocument();
    // ...with the setup-preserved message and a continue CTA.
    expect(screen.getByTestId('registration-gate-curtain-preserved')).toBeInTheDocument();
    expect(screen.getByTestId('registration-gate-curtain-continue')).toBeInTheDocument();
    expect(screen.getByText('registrationGate.curtain.title')).toBeInTheDocument();
    expect(screen.getByText('registrationGate.curtain.preservedBody')).toBeInTheDocument();

    // It is NOT the license/error step.
    expect(screen.queryByTestId('registration-gate-license-form')).not.toBeInTheDocument();
  });

  it('primary CTA routes OUT to the web checkout and never resets local data', async () => {
    render(<RegistrationGatePage status={trialExpiredStatus} onEntitled={vi.fn()} />);

    fireEvent.click(screen.getByTestId('registration-gate-curtain-continue'));

    await waitFor(() => expect(openExternalMock).toHaveBeenCalledTimes(1));
    expect(openExternalMock).toHaveBeenCalledWith('https://command-eve.com/account');

    // The curtain has no reset/wipe path: no activate/register bridge call is made.
    expect(entitlementRegisterMock).not.toHaveBeenCalled();
    expect(entitlementActivateMock).not.toHaveBeenCalled();
  });

  it('a PAID-license expiry (no trial_ends_at) falls through to the license step, not the curtain', () => {
    render(<RegistrationGatePage status={paidExpiredStatus} onEntitled={vi.fn()} />);

    expect(screen.queryByTestId('registration-gate-curtain')).not.toBeInTheDocument();
    expect(screen.getByTestId('registration-gate-license-form')).toBeInTheDocument();
  });
});
