/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { normalizeVoiceCallSetting } from '@/renderer/services/speech/voiceCall/config';
import { isCurrentVoiceCallGeneration } from '@/renderer/services/speech/voiceCall/generation';

describe('voice call setting', () => {
  it('is disabled when the additive setting is absent', () => {
    expect(normalizeVoiceCallSetting(undefined)).toEqual({ enabled: false });
  });

  it('stores only the enabled flag and a normalized provider/model reference', () => {
    expect(
      normalizeVoiceCallSetting({
        enabled: true,
        providerId: ' provider-1 ',
        model: ' fast-model ',
      })
    ).toEqual({
      enabled: true,
      providerId: 'provider-1',
      model: 'fast-model',
    });
  });

  it('drops empty model references without touching any provider credentials', () => {
    expect(
      normalizeVoiceCallSetting({
        enabled: true,
        providerId: ' ',
        model: '',
      })
    ).toEqual({ enabled: true });
  });
});

describe('voice call generation guard', () => {
  it('accepts only callbacks from the current session generation', () => {
    const current = { sessionId: 'call-1', generation: 3 };
    expect(isCurrentVoiceCallGeneration(current, 'call-1', 3)).toBe(true);
    expect(isCurrentVoiceCallGeneration(current, 'call-1', 2)).toBe(false);
    expect(isCurrentVoiceCallGeneration(current, 'call-old', 3)).toBe(false);
  });
});
