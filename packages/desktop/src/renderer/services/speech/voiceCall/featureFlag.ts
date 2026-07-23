/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Build-time gate for the voice-call module.
 *
 * The user-facing setting (`tools.voiceCall.enabled`) is still disabled by
 * default. Turning this constant off removes the setting and header entry and
 * leaves the original application behavior untouched.
 */
export const feature = {
  voiceCall: true,
} as const;

export const isVoiceCallFeatureEnabled = (): boolean => feature.voiceCall;
