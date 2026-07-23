/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

export { feature, isVoiceCallFeatureEnabled } from './featureFlag';
export {
  DEFAULT_VOICE_CALL_SETTING,
  normalizeVoiceCallSetting,
  notifyVoiceCallSettingChanged,
  VOICE_CALL_CONFIG_CHANGED_EVENT,
} from './config';
export type { VoiceCallSetting } from './config';
export { voiceCallController } from './VoiceCallController';
export { isCurrentVoiceCallGeneration } from './generation';
export type { VoiceCallSnapshot, VoiceCallStatus } from './VoiceCallController';
export { default as VoiceCallEntry } from './VoiceCallEntry';
