/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Voice read (语音朗读) feature module.
 *
 * All files in this directory are NEW and self-contained; the only touch
 * points with existing code are two additive mounts (MessageText.tsx and
 * MessageList.tsx). Everything is gated behind `feature.voiceRead` — with the
 * flag off, no UI renders, no stream subscription is made and no
 * speechSynthesis call happens, so the app behaves exactly like the original.
 */

export { feature, isVoiceReadEnabled } from './featureFlag';
export { voiceReadController } from './VoiceReadController';
export type { VoiceReadSnapshot, VoiceReadStatus, VoiceReadMode } from './VoiceReadController';
export { useVoiceRead, useVoiceReadStreamObserver } from './useVoiceRead';
export { default as VoiceReadBar } from './VoiceReadBar';
export { default as MessageVoiceReadButton } from './MessageVoiceReadButton';
export { default as SelectionReadButton } from './SelectionReadButton';
