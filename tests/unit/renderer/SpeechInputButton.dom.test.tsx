import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let speechToTextEnabled = false;
let speechInputAvailability: 'record' | 'file' | 'unsupported' = 'record';
let speechInputStatus: 'idle' | 'recording' | 'transcribing' | 'error' = 'idle';
let speechInputRecordingDurationMs = 0;
let speechInputRecordingLevels = [0.12, 0.18, 0.24, 0.16];

const mockClearError = vi.fn();
const mockStartRecording = vi.fn();
const mockStopRecording = vi.fn();
const mockTranscribeFile = vi.fn();
const mockMessageError = vi.fn();
const mockMessageWarning = vi.fn();
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
    availability: speechInputAvailability,
    clearError: mockClearError,
    errorCode: speechInputErrorCode,
    errorMessage: speechInputErrorMessage,
    recordingDurationMs: speechInputRecordingDurationMs,
    recordingLevels: speechInputRecordingLevels,
    startRecording: mockStartRecording,
    status: speechInputStatus,
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
    warning: (...args: unknown[]) => mockMessageWarning(...args),
  },
  Tooltip: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, {}, children),
}));

import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';

describe('SpeechInputButton', () => {
  beforeEach(() => {
    speechToTextEnabled = false;
    speechInputAvailability = 'record';
    speechInputStatus = 'idle';
    speechInputRecordingDurationMs = 0;
    speechInputRecordingLevels = [0.12, 0.18, 0.24, 0.16];
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

  it('shows the translated error without details when the provider does not return one', async () => {
    speechToTextEnabled = true;
    speechInputErrorCode = 'network';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await waitFor(() => {
      expect(mockMessageError).toHaveBeenCalledWith('conversation.chat.speech.networkError');
    });
    expect(mockClearError).toHaveBeenCalled();
  });

  it('shows a warning when recording ends without a detectable transcript', async () => {
    speechToTextEnabled = true;
    speechInputErrorCode = 'empty-transcript';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await waitFor(() => {
      expect(mockMessageWarning).toHaveBeenCalledWith('conversation.chat.speech.emptyTranscript');
    });
    expect(mockClearError).toHaveBeenCalled();
  });

  it('starts recording when the speech input button is clicked in record mode', async () => {
    speechToTextEnabled = true;

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.recordTooltip',
    });
    button.click();

    expect(mockStartRecording).toHaveBeenCalledTimes(1);
    expect(mockStopRecording).not.toHaveBeenCalled();
  });

  it('stops recording when clicked while a recording is in progress', async () => {
    speechToTextEnabled = true;
    speechInputStatus = 'recording';
    speechInputRecordingDurationMs = 42_000;

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.stopTooltip',
    });
    button.click();

    expect(mockStopRecording).toHaveBeenCalledTimes(1);
    expect(mockStartRecording).not.toHaveBeenCalled();
    expect(screen.getByText('0:42')).toBeInTheDocument();
  });

  it('shows a processing label and disables the button while transcribing', async () => {
    speechToTextEnabled = true;
    speechInputStatus = 'transcribing';
    speechInputRecordingLevels = [0.2, 0.28, 0.12, 0.18];

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.processing',
    });
    expect(button).toBeDisabled();
    expect(screen.getByText('conversation.chat.speech.transcribingShort')).toBeInTheDocument();
  });

  it('opens the file picker when only file upload is available', async () => {
    speechToTextEnabled = true;
    speechInputAvailability = 'file';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.pickFileTooltip',
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    await act(async () => {
      fireEvent.click(button);
    });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('forwards a chosen audio file to the transcription hook', async () => {
    speechToTextEnabled = true;
    speechInputAvailability = 'file';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    await screen.findByRole('button', {
      name: 'conversation.chat.speech.pickFileTooltip',
    });
    const file = new File(['audio'], 'sample.webm', { type: 'audio/webm' });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [file],
      });
      fireEvent.change(fileInput);
    });

    expect(mockTranscribeFile).toHaveBeenCalledWith(file);
  });

  it('shows an unsupported warning instead of starting recording when capture is unavailable', async () => {
    speechToTextEnabled = true;
    speechInputAvailability = 'unsupported';

    render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button', {
      name: 'conversation.chat.speech.unsupported',
    });
    button.click();

    expect(mockMessageWarning).toHaveBeenCalledWith('conversation.chat.speech.unsupported');
    expect(mockStartRecording).not.toHaveBeenCalled();
  });
});
