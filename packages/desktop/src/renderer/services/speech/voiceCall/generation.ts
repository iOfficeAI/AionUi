/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export type VoiceCallGeneration = {
  sessionId: string | null;
  generation: number;
};

/** Reject callbacks from an exited call or an interrupted/older turn. */
export const isCurrentVoiceCallGeneration = (
  snapshot: VoiceCallGeneration,
  sessionId: string,
  generation: number
): boolean => snapshot.sessionId === sessionId && snapshot.generation === generation;
