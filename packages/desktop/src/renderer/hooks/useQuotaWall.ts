/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * 402 quota-exhausted wall controller (Lane 3, spec §3).
 *
 * The single seam between the inference error path and the wall UI: a send /
 * stream site calls `reportInferenceError(error, { jobInFlight })` whenever an
 * EVE-inference call rejects. This hook runs the PURE
 * `creditsCore.detectQuotaExhausted` (recovers the structured 402 body) and the
 * PURE idle-suppression (`shouldSurfaceQuotaWall`, applied in the wall
 * component) and exposes the parsed body + in-flight flag for
 * <QuotaExhaustedWall/>.
 *
 * Keeping this as a tiny hook means the existing send/permission/EVE-inference
 * flow stays intact — a caller adds exactly one `.catch(err => reportInferenceError(err, ...))`.
 */

import { useCallback, useState } from 'react';
import { detectQuotaExhausted, type QuotaExhaustedBody } from '@/common/config/creditsCore';

export interface QuotaWallState {
  /** The parsed 402 body, or null when no quota signal is active. */
  body: QuotaExhaustedBody | null;
  /** Whether a job was in-flight when the quota signal arrived (drives suppression). */
  jobInFlight: boolean;
  /** The persisted auto-reload preference (passed to the wall toggle). */
  autoReload: boolean;
  /**
   * Feed a caught inference error. If it is a 402 quota_exhausted, the wall body
   * is set (and surfaces only when `jobInFlight`); otherwise it is a no-op so
   * non-quota errors fall through to the existing error handling. Returns true
   * iff it was a quota signal (so the caller can suppress its own error toast).
   */
  reportInferenceError: (error: unknown, opts: { jobInFlight: boolean }) => boolean;
  /** Dismiss the wall. */
  closeWall: () => void;
  /** Persist the auto-reload toggle. */
  setAutoReload: (enabled: boolean) => void;
}

export function useQuotaWall(): QuotaWallState {
  const [body, setBody] = useState<QuotaExhaustedBody | null>(null);
  const [jobInFlight, setJobInFlight] = useState(false);
  const [autoReload, setAutoReloadState] = useState<boolean>(false);

  const reportInferenceError = useCallback((error: unknown, opts: { jobInFlight: boolean }): boolean => {
    const parsed = detectQuotaExhausted(error);
    if (!parsed) return false;
    setBody(parsed);
    setJobInFlight(opts.jobInFlight);
    return true;
  }, []);

  const closeWall = useCallback(() => {
    setBody(null);
    setJobInFlight(false);
  }, []);

  const setAutoReload = useCallback((enabled: boolean) => {
    // Records the user's auto-reload intent for the wall toggle. The actual
    // auto-reload execution is the backend's (Lane-2 webhook on the saved card);
    // the desktop only carries the intent into the checkout it opens.
    setAutoReloadState(enabled);
  }, []);

  return { body, jobInFlight, autoReload, reportInferenceError, closeWall, setAutoReload };
}
