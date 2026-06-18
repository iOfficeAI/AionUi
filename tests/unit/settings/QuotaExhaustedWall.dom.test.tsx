/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * QuotaExhaustedWall (Lane 3) DOM behavior:
 *   - IDLE SUPPRESSION: renders nothing when no job is in-flight.
 *   - DEFAULT-PACK: the 100€ pack is pre-selected (the radio value).
 *   - TRANSPARENT MATH: shows "needs ≈ N credits" + "≈ M more jobs like this".
 *   - BUY: opens the Lane-2 checkout deep-linked to the selected pack.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuotaExhaustedWall from '@/renderer/components/billing/QuotaExhaustedWall';
import type { QuotaExhaustedBody } from '@/common/config/creditsCore';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Return the defaultValue with naive {{var}} interpolation so assertions can
    // match the real copy.
    t: (_k: string, o?: Record<string, unknown>) => {
      let s = (o?.defaultValue as string) ?? _k;
      if (o) {
        for (const [key, val] of Object.entries(o)) {
          if (key === 'defaultValue') continue;
          s = s.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
        }
      }
      return s;
    },
  }),
}));

const body: QuotaExhaustedBody = {
  error: 'quota_exhausted',
  credits_needed: 8,
  packs: [
    { eur: 25, credits: 25, bonus: 0 },
    { eur: 100, credits: 100, bonus: 8 },
    { eur: 250, credits: 250, bonus: 38 },
  ],
};

afterEach(() => cleanup());

describe('QuotaExhaustedWall — idle suppression', () => {
  it('renders nothing when no job is in-flight', () => {
    render(<QuotaExhaustedWall body={body} jobInFlight={false} onClose={() => {}} />);
    expect(screen.queryByTestId('quota-exhausted-wall')).toBeNull();
  });

  it('renders nothing when there is no quota body', () => {
    render(<QuotaExhaustedWall body={null} jobInFlight={true} onClose={() => {}} />);
    expect(screen.queryByTestId('quota-exhausted-wall')).toBeNull();
  });
});

describe('QuotaExhaustedWall — surfaced (in-flight + quota signal)', () => {
  it('shows the "finish THIS job" framing + transparent credit math', () => {
    render(<QuotaExhaustedWall body={body} jobInFlight={true} onClose={() => {}} />);
    expect(screen.getByTestId('quota-exhausted-wall')).toBeTruthy();
    expect(screen.getByTestId('quota-wall-math').textContent).toContain('8');
    // 100-pack: (100+8)/8 = 13 jobs
    expect(screen.getByText(/13 more jobs like this/)).toBeTruthy();
  });

  it('default-selects the 100€ pack (recommended badge on the 100 pack)', () => {
    render(<QuotaExhaustedWall body={body} jobInFlight={true} onClose={() => {}} />);
    expect(screen.getByTestId('quota-wall-default-100')).toBeTruthy();
    expect(screen.queryByTestId('quota-wall-default-250')).toBeNull();
    expect(screen.queryByTestId('quota-wall-default-25')).toBeNull();
    // The buy CTA reflects the default-selected pack (100€).
    expect(screen.getByTestId('quota-wall-buy').textContent).toContain('100');
  });

  it('opens the Lane-2 checkout deep-linked to the selected pack on buy', async () => {
    const openCheckout = vi.fn();
    const user = userEvent.setup();
    render(
      <QuotaExhaustedWall body={body} jobInFlight={true} onClose={() => {}} openCheckout={openCheckout} />
    );
    await user.click(screen.getByTestId('quota-wall-buy'));
    expect(openCheckout).toHaveBeenCalledTimes(1);
    expect(openCheckout.mock.calls[0][0]).toContain('pack_eur=100');
  });

  it('closes via "Not now"', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<QuotaExhaustedWall body={body} jobInFlight={true} onClose={onClose} />);
    await user.click(screen.getByTestId('quota-wall-later'));
    expect(onClose).toHaveBeenCalled();
  });
});
