/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { TProviderWithModel } from '@/common/config/storage';
import { getClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import React, { useEffect, useState } from 'react';
import { normalizeVoiceCallSetting, VOICE_CALL_CONFIG_CHANGED_EVENT, type VoiceCallSetting } from './config';
import { isVoiceCallFeatureEnabled } from './featureFlag';
import VoiceCallButton from './VoiceCallButton';

type VoiceCallEntryProps = {
  conversationId: string;
  currentModel?: Pick<TProviderWithModel, 'id' | 'use_model'>;
  onApplyModel?: (providerId: string, model: string) => Promise<boolean>;
};

const EnabledVoiceCallEntry: React.FC<VoiceCallEntryProps> = (props) => {
  const [setting, setSetting] = useState<VoiceCallSetting | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const stored = await getClientBusinessSetting('tools.voiceCall');
        if (!cancelled) setSetting(normalizeVoiceCallSetting(stored));
      } catch {
        if (!cancelled) setSetting(normalizeVoiceCallSetting(undefined));
      }
    };
    void load();
    window.addEventListener(VOICE_CALL_CONFIG_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(VOICE_CALL_CONFIG_CHANGED_EVENT, load);
    };
  }, []);

  if (!setting?.enabled) return null;
  return <VoiceCallButton {...props} setting={setting} />;
};

/**
 * Additive header mount. With the build flag off no hooks, settings reads,
 * recorder instances, stream subscriptions or UI are created.
 */
const VoiceCallEntry: React.FC<VoiceCallEntryProps> = (props) => {
  if (!isVoiceCallFeatureEnabled()) return null;
  return <EnabledVoiceCallEntry {...props} />;
};

export default VoiceCallEntry;
