/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Voice read (TTS 语音朗读) feature switch.
 *
 * Red-line rule: when `voiceRead` is false the app must behave exactly like
 * the original build — no UI is rendered, no stream subscription is made and
 * no speechSynthesis call happens. Flip this single constant to disable the
 * whole feature.
 */
export const feature = {
  voiceRead: true,
} as const;

export const isVoiceReadEnabled = (): boolean => feature.voiceRead;
