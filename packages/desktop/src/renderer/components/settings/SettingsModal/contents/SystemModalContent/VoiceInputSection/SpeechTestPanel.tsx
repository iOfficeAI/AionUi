/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SpeechToTextConfig } from '@/common/types/provider/speech';
import { getSpeechInputErrorMessageKey, useSpeechInput } from '@/renderer/hooks/system/useSpeechInput';
import { setClientBusinessSetting } from '@/renderer/services/clientBusinessSettings';
import { Alert, Button } from '@arco-design/web-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isValidHttpUrl, type SpeechSource } from './speechSettingsUtils';

const MAX_TEST_RECORDING_MS = 5000;

type SpeechTestPanelProps = {
  config: SpeechToTextConfig;
  /** UI-selected service source; may differ from what the stored config derives to (e.g. custom with empty base_url). */
  source: SpeechSource;
};

type TestResult = {
  text: string;
  elapsedSeconds: string;
};

const SpeechTestPanel: React.FC<SpeechTestPanelProps> = ({ config, source }) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const startedAtRef = useRef(0);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const handleTranscript = useCallback((transcript: string) => {
    const elapsedSeconds = ((Date.now() - startedAtRef.current) / 1000).toFixed(1);
    setResult({ text: transcript, elapsedSeconds });
  }, []);

  const {
    availability,
    clearError,
    errorCode,
    errorMessage,
    startRecording,
    status,
    stopRecording,
    transcribeFile,
    recordingDurationMs,
  } = useSpeechInput({
    onTranscript: handleTranscript,
  });

  const isRecording = status === 'recording';
  const isTranscribing = status === 'transcribing';

  // Cap test recordings at MAX_TEST_RECORDING_MS.
  useEffect(() => {
    if (isRecording && recordingDurationMs >= MAX_TEST_RECORDING_MS) {
      stopRecording();
    }
  }, [isRecording, recordingDurationMs, stopRecording]);

  const validate = useCallback((): string | null => {
    if (source === 'custom') {
      if (!isValidHttpUrl(config.openai?.base_url ?? '')) {
        return t('settings.speechToTextBaseUrlInvalid');
      }
      return null;
    }
    const apiKey = source === 'deepgram' ? config.deepgram?.api_key : config.openai?.api_key;
    if (!apiKey?.trim()) {
      return t('settings.speechToTextTestMissingKey');
    }
    return null;
  }, [config, source, t]);

  const handleTestClick = useCallback(async () => {
    if (isRecording) {
      stopRecording();
      return;
    }

    setResult(null);
    clearError();
    const error = validate();
    setValidationError(error);
    if (error) {
      return;
    }

    // The backend /api/stt reads the persisted config, so flush before testing.
    await setClientBusinessSetting('tools.speechToText', config);

    startedAtRef.current = Date.now();
    if (availability === 'file') {
      fileInputRef.current?.click();
      return;
    }
    await startRecording();
  }, [availability, clearError, config, isRecording, startRecording, stopRecording, validate]);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) {
        return;
      }
      startedAtRef.current = Date.now();
      void transcribeFile(file);
    },
    [transcribeFile]
  );

  const buttonLabel = isRecording ? t('settings.speechToTextTestStop') : t('settings.speechToTextTest');
  const statusHint = isRecording
    ? t('settings.speechToTextTestRecording')
    : isTranscribing
      ? t('settings.speechToTextTestTranscribing')
      : availability === 'file'
        ? t('settings.speechToTextTestUploadHint')
        : null;

  return (
    <div className='mt-16px flex flex-col gap-8px'>
      <input ref={fileInputRef} type='file' accept='audio/*' className='hidden' onChange={handleFileChange} />
      <div className='flex items-center gap-12px'>
        <Button type='outline' shape='round' loading={isTranscribing} onClick={() => void handleTestClick()}>
          {buttonLabel}
        </Button>
        {statusHint && <span className='text-13px text-t-secondary'>{statusHint}</span>}
      </div>
      {validationError && <Alert type='warning' content={validationError} />}
      {errorCode && (
        <Alert
          type='error'
          content={
            errorMessage?.trim()
              ? `${t(getSpeechInputErrorMessageKey(errorCode))}: ${errorMessage}`
              : t(getSpeechInputErrorMessageKey(errorCode))
          }
        />
      )}
      {result && (
        <Alert
          type='success'
          content={
            <span>
              {t('settings.speechToTextTestResult')} (
              {t('settings.speechToTextTestElapsed', { seconds: result.elapsedSeconds })}): {result.text}
            </span>
          }
        />
      )}
    </div>
  );
};

export default SpeechTestPanel;
