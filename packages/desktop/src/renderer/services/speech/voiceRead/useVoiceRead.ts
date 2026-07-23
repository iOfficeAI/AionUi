/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * React bindings for the voice-read feature.
 */

import { useEffect, useState } from 'react';
import { isVoiceReadEnabled } from './featureFlag';
import { attachVoiceReadStreamObserver } from './streamObserver';
import { voiceReadController, type VoiceReadSnapshot } from './VoiceReadController';

export function useVoiceRead(): { snapshot: VoiceReadSnapshot; controller: typeof voiceReadController } {
  const [snapshot, setSnapshot] = useState<VoiceReadSnapshot>(() => voiceReadController.getSnapshot());

  useEffect(() => {
    voiceReadController.init();
    return voiceReadController.subscribe(setSnapshot);
  }, []);

  return { snapshot, controller: voiceReadController };
}

/**
 * Mounts the read-only stream observer for the given conversation.
 * No-op when the feature flag is off or there is no conversation.
 */
export function useVoiceReadStreamObserver(conversationId?: string | null): void {
  useEffect(() => {
    if (!isVoiceReadEnabled() || !conversationId) return;
    return attachVoiceReadStreamObserver(conversationId);
  }, [conversationId]);
}
