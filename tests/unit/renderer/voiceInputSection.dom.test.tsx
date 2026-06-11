/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';

const configStore: { value?: SpeechToTextConfig } = {};

vi.mock('@/common/config/configService', () => ({
  configService: {
    get: vi.fn(() => configStore.value),
    set: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import VoiceInputSection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection';

describe('VoiceInputSection', () => {
  beforeEach(() => {
    configStore.value = undefined;
    // jsdom does not implement matchMedia; arco-design's responsive Grid needs it
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders only the enable switch when disabled', async () => {
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToText')).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextSource')).toBeNull();
  });

  it('official openai mode hides base_url field', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: '', model: 'gpt-4o-transcribe', language: '' },
    };
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextSource')).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextBaseUrl')).toBeNull();
    expect(screen.getByText('settings.speechToTextApiKey')).toBeTruthy();
  });

  it('custom mode (openai + base_url) shows base_url field', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: 'https://my-host/v1', model: 'my-model', language: '' },
    };
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrl')).toBeTruthy());
  });

  it('selecting custom keeps the base_url field visible before a url is entered', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: '', base_url: '', model: 'gpt-4o-transcribe', language: '' },
    };
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextSource')).toBeTruthy());

    // Open the source select (first Arco select in the form) and pick "Custom".
    const trigger = document.querySelector('.arco-select');
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger as Element);
    const customOption = await screen.findByText('settings.speechToTextSourceCustom');
    fireEvent.click(customOption);

    // The base_url field must appear...
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrl')).toBeTruthy());
    // ...and stay, even though the stored config (empty base_url) derives to official openai.
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrl')).toBeTruthy());
  });

  it('deepgram mode shows formatting switches', async () => {
    configStore.value = {
      enabled: true,
      provider: 'deepgram',
      deepgram: {
        api_key: 'k',
        model: 'nova-3',
        language: '',
        detectLanguage: true,
        punctuate: true,
        smartFormat: true,
      },
    };
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextPunctuate')).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextBaseUrl')).toBeNull();
  });
});
