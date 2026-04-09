import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let speechToTextEnabled = false;

const mockClearError = vi.fn();
const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();
const mockTranscribeFile = vi.fn();
const mockMessageError = vi.fn();
let speechInputErrorCode: string | null = null;
let speechInputErrorMessage: string | null = null;

vi.mock('@/common/config/storage', () => ({
  ConfigStorage: {
    get: vi.fn(async (key: string) => {
      if (key === 'tools.speechToText') {
        return {
          enabled: speechToTextEnabled,
        };
      }
      return undefined;
    }),
  },
}));

vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  useSpeechInput: () => ({
    availability: 'record',
    clearError: mockClearError,
    errorCode: speechInputErrorCode,
    errorMessage: speechInputErrorMessage,
    startRecording: mockStartRecording,
    status: 'idle',
    stopRecording: mockStopRecording,
    transcribeFile: mockTranscribeFile,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ icon, children, ...props }: React.ComponentProps<'button'> & { icon?: React.ReactNode }) =>
    React.createElement('button', props, icon ?? children),
  Message: {
    error: (...args: unknown[]) => mockMessageError(...args),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, {}, children),
}));

import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';

describe('SpeechInputButton', () => {
  beforeEach(() => {
    speechToTextEnabled = false;
    speechInputErrorCode = null;
    speechInputErrorMessage = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays hidden when speech-to-text is disabled', async () => {
    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole('button')).toBeNull();
    });
  });

  it('renders a microphone button when speech-to-text is enabled', async () => {
    speechToTextEnabled = true;

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.recordTooltip',
    });
    expect(button).toBeInTheDocument();
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('refreshes visibility when the speech-to-text config changes', async () => {
    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole('button')).toBeNull();
    });

    speechToTextEnabled = true;

    await act(async () => {
      window.dispatchEvent(new CustomEvent('aionui:speech-to-text-config-changed'));
    });

    expect(
      await screen.findByRole('button', {
        name: 'conversation.chat.speech.recordTooltip',
      })
    ).toBeInTheDocument();
  });

  it('shows the transcription detail when speech-to-text returns a concrete error', async () => {
    speechToTextEnabled = true;
    speechInputErrorCode = 'transcription-failed';
    speechInputErrorMessage = 'model overloaded';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('conversation.chat.speech.transcriptionFailed: model overloaded');
    });
    expect(mockClearError).toHaveBeenCalled();
  });
});
