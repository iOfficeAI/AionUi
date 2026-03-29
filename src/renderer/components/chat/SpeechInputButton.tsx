/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfigStorage } from '@/common/config/storage';
import { Message, Button, Tooltip } from '@arco-design/web-react';
import { LoadingOne, Microphone, Record } from '@icon-park/react';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useSpeechInput,
  type SpeechInputAvailability,
  type SpeechInputErrorCode,
} from '@/renderer/hooks/system/useSpeechInput';

type SpeechInputButtonProps = {
  disabled?: boolean;
  locale?: string;
  onTranscript: (transcript: string) => void;
};

const SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT = 'aionui:speech-to-text-config-changed';

const getAvailabilityMessageKey = (availability: SpeechInputAvailability) => {
  switch (availability) {
    case 'file':
      return 'conversation.chat.speech.pickFileTooltip';
    case 'unsupported':
      return 'conversation.chat.speech.unsupported';
    default:
      return 'conversation.chat.speech.recordTooltip';
  }
};

const getErrorMessageKey = (errorCode: SpeechInputErrorCode) => {
  switch (errorCode) {
    case 'audio-capture':
      return 'conversation.chat.speech.audioCaptureError';
    case 'file-too-large':
      return 'conversation.chat.speech.fileTooLarge';
    case 'network':
      return 'conversation.chat.speech.networkError';
    case 'not-configured':
      return 'conversation.chat.speech.notConfigured';
    case 'permission-denied':
      return 'conversation.chat.speech.permissionDenied';
    case 'recording-unsupported':
      return 'conversation.chat.speech.recordingUnsupported';
    case 'transcription-failed':
      return 'conversation.chat.speech.transcriptionFailed';
    case 'aborted':
    case 'unknown':
    default:
      return 'conversation.chat.speech.genericError';
  }
};

const getTooltipKey = (availability: SpeechInputAvailability, isListening: boolean, isProcessing: boolean) => {
  if (isProcessing) {
    return 'conversation.chat.speech.processing';
  }
  if (isListening) {
    return 'conversation.chat.speech.stopTooltip';
  }
  if (availability === 'record') {
    return 'conversation.chat.speech.recordTooltip';
  }
  return getAvailabilityMessageKey(availability);
};

const SpeechInputButton: React.FC<SpeechInputButtonProps> = ({ disabled, locale, onTranscript }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSpeechToTextEnabled, setIsSpeechToTextEnabled] = useState(false);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  const { availability, clearError, errorCode, startRecording, status, stopRecording, transcribeFile } = useSpeechInput(
    {
      locale,
      onTranscript,
    }
  );

  const isRecording = status === 'recording';
  const isProcessing = status === 'transcribing';

  useEffect(() => {
    let cancelled = false;

    const syncSpeechToTextEnabled = async () => {
      try {
        const config = await ConfigStorage.get('tools.speechToText');
        if (cancelled) {
          return;
        }
        setIsSpeechToTextEnabled(Boolean(config?.enabled));
      } catch {
        if (cancelled) {
          return;
        }
        setIsSpeechToTextEnabled(false);
      } finally {
        if (!cancelled) {
          setIsConfigLoaded(true);
        }
      }
    };

    const handleConfigChanged = () => {
      void syncSpeechToTextEnabled();
    };

    void syncSpeechToTextEnabled();
    window.addEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, handleConfigChanged);

    return () => {
      cancelled = true;
      window.removeEventListener(SPEECH_TO_TEXT_CONFIG_CHANGED_EVENT, handleConfigChanged);
    };
  }, []);

  useEffect(() => {
    if (!errorCode) {
      return;
    }

    Message.error(t(getErrorMessageKey(errorCode)));
    clearError();
  }, [clearError, errorCode, t]);

  const handleClick = () => {
    if (disabled) {
      return;
    }

    if (availability === 'unsupported') {
      Message.warning(t(getAvailabilityMessageKey(availability)));
      return;
    }

    if (isRecording) {
      stopRecording();
      return;
    }

    if (availability === 'file') {
      fileInputRef.current?.click();
      return;
    }

    void startRecording();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    void transcribeFile(file);
  };

  if (!isConfigLoaded || !isSpeechToTextEnabled) {
    return null;
  }

  const tooltipKey = getTooltipKey(availability, isRecording, isProcessing);
  const ariaLabel = t(tooltipKey);
  const icon = isRecording ? (
    <Record theme='filled' size='16' />
  ) : isProcessing ? (
    <LoadingOne theme='outline' size='16' />
  ) : (
    <Microphone theme='outline' size='16' />
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type='file'
        accept='audio/*'
        capture='user'
        className='hidden'
        onChange={handleFileChange}
      />
      <Tooltip content={ariaLabel} mini>
        <Button
          type='secondary'
          size='small'
          shape='circle'
          className={`speech-input-button ${isRecording ? 'speech-input-button--listening' : ''} ${isProcessing ? 'speech-input-button--processing' : ''}`}
          disabled={disabled || isProcessing}
          onClick={handleClick}
          aria-label={ariaLabel}
          icon={icon}
        />
      </Tooltip>
    </>
  );
};

export default SpeechInputButton;
