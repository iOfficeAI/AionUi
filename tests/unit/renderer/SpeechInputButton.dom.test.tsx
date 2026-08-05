/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  startRecording: vi.fn(() => Promise.resolve()),
  stopRecording: vi.fn(),
  status: 'idle' as 'idle' | 'recording' | 'transcribing',
}));

vi.mock('@/renderer/services/clientBusinessSettings', () => ({
  getClientBusinessSetting: vi.fn(() => Promise.resolve({ enabled: true })),
}));

vi.mock('@/renderer/services/SpeechToTextService', () => ({
  SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT: 'speech-to-text-config-changed',
}));

vi.mock('@/renderer/hooks/system/useSpeechInput', () => ({
  getSpeechInputErrorMessageKey: vi.fn(),
  useSpeechInput: () => ({
    availability: 'record',
    clearError: vi.fn(),
    errorCode: null,
    errorMessage: null,
    recordingDurationMs: 0,
    recordingLevels: [],
    startRecording: mocks.startRecording,
    status: mocks.status,
    stopRecording: mocks.stopRecording,
    transcribeFile: vi.fn(),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { shortcut?: string }) =>
      key === 'conversation.chat.speech.recordTooltipWithShortcut'
        ? '语音输入 cmd+M'
        : options?.shortcut
          ? `${key}:${options.shortcut}`
          : key,
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ icon, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: React.ReactNode }) => (
    <button {...props}>{icon}</button>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => <span data-testid='speech-tooltip'>{children}</span>,
  Message: { warning: vi.fn(), error: vi.fn() },
}));

import SpeechInputButton from '@/renderer/components/chat/SpeechInputButton';

describe('SpeechInputButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.status = 'idle';
  });

  it('shows the shortcut and toggles recording on consecutive presses', async () => {
    const view = render(<SpeechInputButton onTranscript={vi.fn()} />);

    const button = await screen.findByRole('button');
    expect(button.getAttribute('aria-label')).toContain('M');
    fireEvent.mouseEnter(view.container.querySelector('.speech-input-control') as Element);

    // The window keydown listener is attached in an effect gated on async
    // config loading, so a single fire can race the attachment on slow CI
    // runners. Retry the press until it is observed; presses before the
    // listener exists contribute zero calls, so the final count stays exact.
    await waitFor(() => {
      fireEvent.keyDown(window, { code: 'KeyM', metaKey: true });
      expect(mocks.startRecording).toHaveBeenCalled();
    });
    expect(mocks.startRecording).toHaveBeenCalledTimes(1);

    mocks.status = 'recording';
    view.rerender(<SpeechInputButton onTranscript={vi.fn()} />);
    fireEvent.keyDown(window, { code: 'KeyM', metaKey: true });
    await waitFor(() => expect(mocks.stopRecording).toHaveBeenCalledTimes(1));
  });

  it('only triggers the active voice input when several send boxes are mounted', async () => {
    const view = render(
      <>
        <SpeechInputButton onTranscript={vi.fn()} />
        <SpeechInputButton onTranscript={vi.fn()} />
      </>
    );
    await screen.findAllByRole('button');
    const controls = view.container.querySelectorAll('.speech-input-control');
    fireEvent.mouseEnter(controls[1]);

    // Same listener-attachment race as above: retry the press until observed.
    // Only the hovered instance passes the ownership check, so the final
    // count still proves exactly one recording started.
    await waitFor(() => {
      fireEvent.keyDown(window, { code: 'KeyM', metaKey: true });
      expect(mocks.startRecording).toHaveBeenCalled();
    });
    expect(mocks.startRecording).toHaveBeenCalledTimes(1);
  });

  it('shows only the spinner button while transcribing', async () => {
    mocks.status = 'transcribing';
    const { container } = render(<SpeechInputButton onTranscript={vi.fn()} />);
    const button = await screen.findByRole('button');

    expect(button).toBeDisabled();
    expect(container.querySelector('.speech-input-feedback')).toBeNull();
    expect(screen.queryByTestId('speech-tooltip')).toBeNull();
  });
});
