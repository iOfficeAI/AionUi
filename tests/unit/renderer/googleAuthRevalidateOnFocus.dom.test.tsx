/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tripwire for the SWR focus-revalidation opt-in. The app disables
 * `revalidateOnFocus` globally (SWRConfig in main.tsx). Google auth + subscription
 * status change in an EXTERNAL browser (OAuth / billing), so `useGoogleAuthModels`
 * must opt those two queries back in with `revalidateOnFocus: true` — otherwise a
 * completed sign-in / upgrade is not detected until remount.
 *
 * SWR's actual focus revalidation is a real-browser behavior (verified live);
 * jsdom does not fire it, so this test guards the code's contribution instead:
 * the Google auth + subscription `useSWR` calls pass `revalidateOnFocus: true`,
 * while the config query (a plain in-app setting) does not. Removing an opt-in
 * flips its recorded option and fails this test.
 */

import { render, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';

const { swrCalls } = vi.hoisted(() => ({ swrCalls: [] as Array<{ key: unknown; options: Record<string, unknown> }> }));

// Wrap the real useSWR to record (key, options) per call, then delegate.
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>();
  const wrapped = (key: unknown, fetcher: unknown, options?: Record<string, unknown>) => {
    swrCalls.push({ key, options: options ?? {} });
    return (actual.default as unknown as (...a: unknown[]) => unknown)(key, fetcher, options);
  };
  return { ...actual, default: wrapped };
});

vi.mock('@/common', () => ({
  ipcBridge: {
    googleAuth: { status: { invoke: vi.fn(async () => ({ success: true })) } },
    google: { subscriptionStatus: { invoke: vi.fn(async () => ({ isSubscriber: false, lastChecked: 0 })) } },
  },
}));
vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: vi.fn(async () => ({ proxy: '' })),
}));

import { useGoogleAuthModels } from '@/renderer/hooks/agent/useGoogleAuthModels';

const Probe: React.FC = () => {
  useGoogleAuthModels();
  return null;
};

const optionFor = (keyMatch: string): Record<string, unknown> | undefined =>
  swrCalls.find((c) => typeof c.key === 'string' && c.key.startsWith(keyMatch))?.options;

beforeEach(() => {
  swrCalls.length = 0;
});
afterEach(() => cleanup());

describe('useGoogleAuthModels focus-revalidation opt-in', () => {
  it('opts the Google auth + subscription queries back into revalidateOnFocus', async () => {
    render(<Probe />);
    // auth query mounts immediately; subscription mounts once auth resolves true.
    await waitFor(() => expect(optionFor('google.auth.status')).toBeDefined());
    await waitFor(() => expect(optionFor('google.subscription.status')).toBeDefined());

    expect(optionFor('google.auth.status')?.revalidateOnFocus).toBe(true);
    expect(optionFor('google.subscription.status')?.revalidateOnFocus).toBe(true);
    // The client-config query is an in-app setting → NOT opted in (inherits the
    // global default), so external focus refetch stays off for it.
    expect(optionFor('settings.client.google.config')?.revalidateOnFocus).toBeUndefined();
  });
});
