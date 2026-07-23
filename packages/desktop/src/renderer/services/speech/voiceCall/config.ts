/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { VoiceCallSetting } from '@/common/config/clientSettings';

export type { VoiceCallSetting } from '@/common/config/clientSettings';

export const VOICE_CALL_CONFIG_CHANGED_EVENT = 'aionui:voice-call-config-changed';

export const DEFAULT_VOICE_CALL_SETTING: VoiceCallSetting = {
  enabled: false,
};

export const normalizeVoiceCallSetting = (value: VoiceCallSetting | undefined): VoiceCallSetting => ({
  enabled: value?.enabled === true,
  providerId: value?.providerId?.trim() || undefined,
  model: value?.model?.trim() || undefined,
});

export const notifyVoiceCallSettingChanged = (): void => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(VOICE_CALL_CONFIG_CHANGED_EVENT));
  }
};
