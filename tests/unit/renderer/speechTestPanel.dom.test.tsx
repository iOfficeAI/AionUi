/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';

const speechSettingsMocks = vi.hoisted(() => ({
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: vi.fn(),
  setClientBusinessSetting: speechSettingsMocks.setClientBusinessSetting,
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import SpeechTestPanel from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection/SpeechTestPanel';

const makeConfig = (overrides?: Partial<SpeechToTextConfig>): SpeechToTextConfig => ({
  enabled: true,
  provider: 'openai',
  openai: { api_key: '', base_url: '', model: 'gpt-4o-transcribe', language: '' },
  ...overrides,
});

describe('SpeechTestPanel', () => {
  it('shows validation error when api key is missing in official mode', async () => {
    render(<SpeechTestPanel config={makeConfig()} source='openai' />);
    fireEvent.click(screen.getByText('settings.speechToTextTest'));
    await waitFor(() => expect(screen.getByText('settings.speechToTextTestMissingKey')).toBeTruthy());
  });

  it('shows validation error for invalid custom base_url', async () => {
    const config = makeConfig({
      openai: { api_key: '', base_url: 'not-a-url', model: 'm', language: '' },
    });
    render(<SpeechTestPanel config={config} source='custom' />);
    fireEvent.click(screen.getByText('settings.speechToTextTest'));
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrlInvalid')).toBeTruthy());
  });

  it('shows validation error in custom mode when base_url is empty', async () => {
    const config = makeConfig({
      openai: { api_key: '', base_url: '', model: 'm', language: '' },
    });
    render(<SpeechTestPanel config={config} source='custom' />);
    fireEvent.click(screen.getByText('settings.speechToTextTest'));
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrlInvalid')).toBeTruthy());
  });

  it('saves config before starting a test when validation passes', async () => {
    const config = makeConfig({
      openai: { api_key: 'sk-test', base_url: '', model: 'gpt-4o-transcribe', language: '' },
    });
    render(<SpeechTestPanel config={config} source='openai' />);
    fireEvent.click(screen.getByText('settings.speechToTextTest'));
    await waitFor(() =>
      expect(speechSettingsMocks.setClientBusinessSetting).toHaveBeenCalledWith('tools.speechToText', config)
    );
  });
});
