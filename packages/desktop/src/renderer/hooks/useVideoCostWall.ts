/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Video PRE-SUBMIT cost-wall controller (Lane 3, war-game guardrail).
 *
 * The single seam between a video-generation trigger and the cost-wall UI: a
 * caller that wants to start a video calls `requestVideo({ durationSeconds }, run)`.
 * Instead of firing `run` immediately, this hook OPENS the wall (so the user
 * sees the transparent cost preview and must explicitly confirm). The actual
 * `run` is only invoked from `confirm()` — there is NO path where a video fires
 * without the user having confirmed the previewed credits.
 *
 * The Fast/720p default and the explicit-1080p-upgrade live in the PURE
 * `videoCostCore` + the `<VideoCostWall/>` component; this hook just gates the
 * submit and carries the pending run + duration into the wall.
 */

import { useCallback, useState } from 'react';
import { buildVideoSubmitGate, type VideoQualityTier } from '@/common/config/videoCostCore';

/** What the caller's confirmed-submit receives: the resolved tier + previewed credits. */
export type VideoConfirmResolved = { tierId: VideoQualityTier; estimatedCredits: number };

/** The function the caller wants to run ONCE the user confirms (the real submit). */
export type VideoRun = (resolved: VideoConfirmResolved) => void | Promise<void>;

export interface VideoCostWallState {
  /** Whether the cost-wall is open (a video request is awaiting confirmation). */
  visible: boolean;
  /** The pending request's clip duration (seconds), for the preview. */
  durationSeconds?: number;
  /**
   * Begin a video request. ALWAYS opens the wall first (never fires `run`
   * directly) — the war-game guardrail. `run` is stashed and only invoked on
   * confirm.
   */
  requestVideo: (request: { durationSeconds?: number }, run: VideoRun) => void;
  /** The user explicitly confirmed: invokes the stashed run with the resolved tier, then closes. */
  confirm: (resolved: VideoConfirmResolved) => void;
  /** The user backed out: drop the pending run and close. */
  cancel: () => void;
}

export function useVideoCostWall(): VideoCostWallState {
  const [visible, setVisible] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState<number | undefined>(undefined);
  const [pendingRun, setPendingRun] = useState<{ run: VideoRun } | null>(null);

  const requestVideo = useCallback((request: { durationSeconds?: number }, run: VideoRun) => {
    // Guardrail: video ALWAYS requires confirm — open the wall, never fire now.
    const gate = buildVideoSubmitGate({ confirmed: false });
    if (!gate.requiresConfirm) {
      // (Unreachable for video — the gate hard-codes requiresConfirm. Defensive.)
      void run({ tierId: gate.defaultTierId, estimatedCredits: 0 });
      return;
    }
    setDurationSeconds(request.durationSeconds);
    setPendingRun({ run });
    setVisible(true);
  }, []);

  const confirm = useCallback(
    (resolved: VideoConfirmResolved) => {
      const gate = buildVideoSubmitGate({ confirmed: true });
      const run = pendingRun?.run;
      setVisible(false);
      setPendingRun(null);
      // Only proceed once the gate is satisfied (confirmed) and a run is pending.
      if (gate.allowed && run) {
        void run(resolved);
      }
    },
    [pendingRun]
  );

  const cancel = useCallback(() => {
    setVisible(false);
    setPendingRun(null);
  }, []);

  return { visible, durationSeconds, requestVideo, confirm, cancel };
}
