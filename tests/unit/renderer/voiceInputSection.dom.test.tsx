/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ipcBridge } from '@/common';
import type { SpeechToTextConfig } from '@/common/types/provider/speech';

const configStore: { value?: SpeechToTextConfig } = {};
const speechSettingsMocks = vi.hoisted(() => ({
  getClientBusinessSetting: vi.fn(),
  setClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: speechSettingsMocks.getClientBusinessSetting,
  setClientBusinessSetting: speechSettingsMocks.setClientBusinessSetting,
  removeClientBusinessSetting: vi.fn(() => Promise.resolve()),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en-US' } }),
}));

import { Message } from '@arco-design/web-react';
import VoiceInputSection from '@/renderer/components/settings/SettingsModal/contents/SystemModalContent/VoiceInputSection';

describe('VoiceInputSection', () => {
  beforeEach(() => {
    configStore.value = undefined;
    vi.spyOn(Message, 'success').mockImplementation(() => undefined as never);
    vi.spyOn(Message, 'error').mockImplementation(() => undefined as never);
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(undefined);
    speechSettingsMocks.setClientBusinessSetting.mockResolvedValue(undefined);
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
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
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
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextBaseUrl')).toBeTruthy());
  });

  it('selecting custom keeps the base_url field visible before a url is entered', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: '', base_url: '', model: 'gpt-4o-transcribe', language: '' },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
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

  it('official openai mode shows streaming badge for gpt-4o-transcribe and batch badge for whisper-1', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: '', model: 'gpt-4o-transcribe', language: '' },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextSource')).toBeTruthy());

    // Open the model Select (second .arco-select on the page — first is the source select).
    const selects = document.querySelectorAll('.arco-select');
    // source select is first; model select is second
    expect(selects.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(selects[1] as Element);

    // gpt-4o-transcribe option should carry the streaming badge (multiple elements ok — arco renders
    // options in hidden + visible lists)
    await waitFor(() => expect(screen.getAllByText('settings.speechToTextStreamingBadge').length).toBeGreaterThan(0));

    // whisper-1 option should carry the batch badge
    expect(screen.getAllByText('settings.speechToTextWholeBadge').length).toBeGreaterThan(0);
  });

  it('migrates a stored ambiguous zh language to Simplified Chinese on load', async () => {
    configStore.value = {
      enabled: true,
      provider: 'openai',
      openai: { api_key: 'k', base_url: '', model: 'whisper-1', language: 'zh' },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextLanguage')).toBeTruthy());
    // The language select displays the migrated zh-CN option label.
    await waitFor(() => expect(screen.getByText('中文（简体）')).toBeTruthy());
  });

  it('deepgram mode hides the batch-only/always-on formatting switches', async () => {
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
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);
    render(<VoiceInputSection />);
    await waitFor(() => expect(screen.getByText('settings.speechToTextLanguage')).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextBaseUrl')).toBeNull();
    // Stored values stay honored by the backend; only the toggles are gone.
    expect(screen.queryByText('settings.speechToTextDetectLanguage')).toBeNull();
    expect(screen.queryByText('settings.speechToTextPunctuate')).toBeNull();
    expect(screen.queryByText('settings.speechToTextSmartFormat')).toBeNull();
  });

  it('local provider renders download button and handles download model click', async () => {
    configStore.value = {
      enabled: true,
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
        language: '',
      },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);

    const checkModelSpy = vi.spyOn(ipcBridge.speech.checkModel, 'invoke').mockResolvedValue({
      isReady: false,
      status: {
        modelId: 'parakeet-tdt-0.6b-v3-int8',
        status: 'idle',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 670000000,
      },
    });

    const downloadModelSpy = vi.spyOn(ipcBridge.speech.downloadModel, 'invoke').mockResolvedValue({
      modelId: 'parakeet-tdt-0.6b-v3-int8',
      status: 'ready',
      progress: 100,
      downloadedBytes: 670000000,
      totalBytes: 670000000,
    });

    render(<VoiceInputSection />);

    await waitFor(() => expect(screen.getByText('settings.speechToTextDownloadModel')).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextApiKey')).toBeNull();
    expect(screen.queryByText('settings.speechToTextBaseUrl')).toBeNull();
    expect(checkModelSpy).toHaveBeenCalledWith({ modelId: 'parakeet-tdt-0.6b-v3-int8' });

    // Click download button
    const downloadBtn = screen.getByText('settings.speechToTextDownloadModel');
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(downloadModelSpy).toHaveBeenCalledWith({ modelId: 'parakeet-tdt-0.6b-v3-int8' });
    });
  });

  it('local provider renders ready checkmark when model is already downloaded', async () => {
    configStore.value = {
      enabled: true,
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
        language: '',
      },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);

    vi.spyOn(ipcBridge.speech.checkModel, 'invoke').mockResolvedValue({
      isReady: true,
      status: {
        modelId: 'parakeet-tdt-0.6b-v3-int8',
        status: 'ready',
        progress: 100,
        downloadedBytes: 670000000,
        totalBytes: 670000000,
      },
    });

    render(<VoiceInputSection />);

    await waitFor(() => expect(screen.getByText(/settings\.speechToTextLocalModelReady/)).toBeTruthy());
    expect(screen.queryByText('settings.speechToTextDownloadModel')).toBeNull();
  });

  it('shows error message when model download fails', async () => {
    configStore.value = {
      enabled: true,
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
        language: '',
      },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);

    vi.spyOn(ipcBridge.speech.checkModel, 'invoke').mockResolvedValue({
      isReady: false,
      status: {
        modelId: 'parakeet-tdt-0.6b-v3-int8',
        status: 'idle',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 670000000,
      },
    });

    vi.spyOn(ipcBridge.speech.downloadModel, 'invoke').mockRejectedValue(new Error('Network error'));
    const messageErrorSpy = vi.spyOn(Message, 'error');

    render(<VoiceInputSection />);

    await waitFor(() => expect(screen.getByText('settings.speechToTextDownloadModel')).toBeTruthy());
    fireEvent.click(screen.getByText('settings.speechToTextDownloadModel'));

    await waitFor(() => {
      expect(messageErrorSpy).toHaveBeenCalledWith('Network error');
    });
  });

  it('updates local model download status when onDownloadProgress emits', async () => {
    configStore.value = {
      enabled: true,
      provider: 'local',
      local: {
        model: 'parakeet-tdt-0.6b-v3-int8',
        language: '',
      },
    };
    speechSettingsMocks.getClientBusinessSetting.mockResolvedValue(configStore.value);

    let progressListener: Function | null = null;
    vi.spyOn(ipcBridge.speech.onDownloadProgress, 'on').mockImplementation((cb: any) => {
      progressListener = cb;
      return () => {};
    });

    vi.spyOn(ipcBridge.speech.checkModel, 'invoke').mockResolvedValue({
      isReady: false,
      status: {
        modelId: 'parakeet-tdt-0.6b-v3-int8',
        status: 'idle',
        progress: 0,
        downloadedBytes: 0,
        totalBytes: 670000000,
      },
    });

    render(<VoiceInputSection />);

    await waitFor(() => expect(progressListener).toBeTruthy());

    // Emit progress event
    await waitFor(() => {
      progressListener!({
        modelId: 'parakeet-tdt-0.6b-v3-int8',
        percent: 45,
        downloadedBytes: 300000000,
        totalBytes: 670000000,
      });
    });

    await waitFor(() => expect(screen.getByText('45%')).toBeTruthy());
    expect(screen.getByText('settings.speechToTextDownloadingModel')).toBeTruthy();
  });
});
